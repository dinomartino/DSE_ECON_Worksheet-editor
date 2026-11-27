import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  createAnswerDiagram,
  createImageBlock,
  createParagraphBlock,
  createTableBlock,
  createWorksheet,
} from '@/model/factories';
import { answerBlocksOf, hasAnswer, withAnswerBlocks } from '@/model/answerBlocks';
import {
  applyDeleteTarget,
  applyEditTarget,
  applyResizeBlock,
  blockSize,
  findTableBlock,
  insertBlockAfter,
  questionBlockLists,
  replaceBlockById,
  textOfTarget,
} from '@/model/edits';
import { copyQuestion, freshIds } from '@/model/lineage';
import { CURRENT_SCHEMA_VERSION, isNewerThanBuild, migrate, serializeWorksheet } from '@/model/migrations';
import { bi, plain } from '@/model/text';
import { collectTexts } from '@/model/textWalk';
import type {
  ContentBlock,
  DiagramBlock,
  OutputMode,
  ParagraphBlock,
  QuestionPart,
  QuestionSubPart,
  StructuredQuestion,
  TableBlock,
  Worksheet,
} from '@/model/types';
import { worksheetClipboardHtml } from '@/export/clipboard';
import { exportAnswerKeyDocxBuffer, exportDocxBuffer } from '@/export/docx';
import { applyAnswerWrites } from '@/answers/apply';
import { renderAnswerKey } from '@/render/answerKey';
import type { RenderNode } from '@/render/ir';
import { renderWorksheet } from '@/render/worksheet';
import { TINY_PNG } from '@/test/fixtures';
import { ANSWER_KEY_PRESET_IDS } from '@/model/answerKeyLayout';
import { structuredType } from './structured';

/**
 * A model answer holds everything a question can (u-0c5q): after its text, any number of
 * blocks — paragraphs, tables, pictures, diagrams — in any order, teacher-only.
 */

const TEACHER: OutputMode = { language: 'en', version: 'teacher' };
const STUDENT: OutputMode = { language: 'en', version: 'student' };

const paragraph = (id: string, en: string, zh = en) => ({ kind: 'paragraph' as const, id, text: bi(en, zh) });
const diagram = (id: string): DiagramBlock => ({ ...createAnswerDiagram(), id });
function table(id: string, en: string, zh: string): TableBlock {
  const block = createTableBlock(2, 2);
  block.id = id;
  block.rows[0].cells[0].text = bi(en, zh);
  return block;
}
const picture = (id: string) => ({ ...createImageBlock(TINY_PNG, 120, 60), id });

/** Answer: text, then a table, a paragraph, a picture and two diagrams, in that order. */
function richAnswer(): ContentBlock[] {
  return [
    table('ans-table', 'Elasticity', '彈性'),
    paragraph('ans-more', 'So revenue falls.', '所以收入下跌。'),
    picture('ans-pic'),
    diagram('ans-dg1'),
    diagram('ans-dg2'),
  ];
}

function worksheetWith(parts: QuestionPart[], extra: Partial<StructuredQuestion> = {}): Worksheet {
  const question: StructuredQuestion = {
    id: 'q1',
    type: 'structured',
    blocks: [paragraph('stem', 'Read the data.', '閱讀資料。')],
    parts,
    ...extra,
  };
  const worksheet = createWorksheet();
  worksheet.questions = [question];
  worksheet.flow = [{ type: 'question', id: question.id }];
  return worksheet;
}

function leaf(blocks: ContentBlock[] = richAnswer()): QuestionPart {
  return withAnswerBlocks(
    {
      id: 'a',
      blocks: [paragraph('a-text', 'Explain.', '解釋。')],
      marks: 4,
      answer: bi('Demand is elastic.', '需求富彈性。'),
      scheme: { routes: [{ id: 'r', groups: [{ id: 'g', points: [{ id: 'p', text: bi('Elastic', '彈性'), marks: 1 }] }] }] },
    },
    blocks,
  );
}

const questionNodes = (worksheet: Worksheet, mode: OutputMode): RenderNode[] =>
  renderWorksheet(worksheet, mode).items.flatMap((item) => (item.type === 'question' ? item.question.nodes : []));

/** Each node as one word: a text node's style (+ its first words), else its kind and id. */
const shape = (nodes: RenderNode[]) =>
  nodes.map((node) => {
    if (node.kind === 'text') return `${node.style}:${plain(node.text.en).slice(0, 18)}`;
    if (node.kind === 'diagram' || node.kind === 'image') return `${node.kind}:${node.blockId}`;
    if (node.kind === 'table') return `table:${node.blockId}`;
    return node.kind;
  });

const documentXml = async (buffer: ArrayBuffer | Buffer | Uint8Array) =>
  (await JSZip.loadAsync(buffer)).file('word/document.xml')!.async('string');

describe('answer blocks — model', () => {
  it('reads the old model diagram as the first block, then the rest', () => {
    expect(answerBlocksOf({})).toEqual([]);
    expect(answerBlocksOf({ answerDiagram: diagram('d') }).map((b) => b.id)).toEqual(['d']);
    expect(answerBlocksOf({ answerDiagram: diagram('d'), answerBlocks: [paragraph('p', 'x')] }).map((b) => b.id)).toEqual(['d', 'p']);
  });

  it('stores the oldest shape that holds the blocks', () => {
    const base = { id: 'a', answer: bi('x', 'x') };
    expect(withAnswerBlocks(base, [])).toEqual(base);
    expect(withAnswerBlocks({ ...base, answerDiagram: diagram('d') }, [])).toEqual(base);
    // A lone diagram is the old field every build since 0.4.0 reads.
    const d = diagram('d');
    expect(withAnswerBlocks(base, [d])).toEqual({ ...base, answerDiagram: d });
    const more = withAnswerBlocks({ ...base, answerDiagram: d }, [d, paragraph('p', 'y')]);
    expect(more.answerDiagram).toBeUndefined();
    expect(more.answerBlocks?.map((b) => b.id)).toEqual(['d', 'p']);
    expect(withAnswerBlocks(base, [paragraph('p', 'y')]).answerBlocks).toHaveLength(1);
  });

  it('counts a table alone as an answer', () => {
    expect(hasAnswer({ answerBlocks: [table('t', 'x', 'x')] })).toBe(true);
    expect(hasAnswer({})).toBe(false);
    const facts = structuredType.healthFacts!({ ...worksheetWith([{ ...leaf([table('t', 'x', 'x')]), answer: undefined, scheme: undefined }]).questions[0] } as StructuredQuestion);
    expect(facts.unansweredParts).toBe(0);
  });
});

describe('answer blocks — schema v4 and older builds', () => {
  const stored = (worksheet: Worksheet) => JSON.parse(JSON.stringify(serializeWorksheet(worksheet)));

  it('a rich answer is written at 4, its text still in `answer` for older builds', () => {
    const out = stored(worksheetWith([leaf()]));
    expect(CURRENT_SCHEMA_VERSION).toBe(4);
    expect(out.schemaVersion).toBe(4);
    const part = out.questions[0].parts[0];
    expect(part.answer.en[0].text).toBe('Demand is elastic.');
    expect(part.answerBlocks.map((b: ContentBlock) => b.kind)).toEqual(['table', 'paragraph', 'image', 'diagram', 'diagram']);
    expect(part.answerDiagram).toBeUndefined();
    // Every release (0.10.x and older, at 3) reads it as newer and opens it read-only.
    expect(out.schemaVersion > 3).toBe(true);
  });

  it('text and one diagram keep the old shape and the old version', () => {
    const onlyDiagram = stored(worksheetWith([{ ...leaf([diagram('d')]) }]));
    expect(onlyDiagram.schemaVersion).toBe(1);
    expect(onlyDiagram.questions[0].parts[0].answerDiagram.id).toBe('d');
    expect(onlyDiagram.questions[0].parts[0].answerBlocks).toBeUndefined();
    // Even one built around `withAnswerBlocks` (a list of one diagram, or an empty list).
    const raw = worksheetWith([{ ...leaf([]), answerBlocks: [diagram('d2')] }]);
    expect(stored(raw).questions[0].parts[0].answerDiagram.id).toBe('d2');
    expect(stored(raw).schemaVersion).toBe(1);
    const empty = worksheetWith([{ ...leaf([]), answerBlocks: [] }]);
    expect('answerBlocks' in stored(empty).questions[0].parts[0]).toBe(false);
  });

  it('drops back to the old version once the extra blocks go', () => {
    const worksheet = worksheetWith([leaf()]);
    const trimmed = applyDeleteTarget(
      applyDeleteTarget(
        applyDeleteTarget(applyDeleteTarget(worksheet, { kind: 'blockText', blockId: 'ans-table' }), { kind: 'blockText', blockId: 'ans-more' }),
        { kind: 'blockText', blockId: 'ans-pic' },
      ),
      { kind: 'blockText', blockId: 'ans-dg2' },
    );
    const part = (trimmed.questions[0] as StructuredQuestion).parts[0];
    expect(part.answerDiagram?.id).toBe('ans-dg1');
    expect(part.answerBlocks).toBeUndefined();
    expect(stored(trimmed).schemaVersion).toBe(1);
  });

  it('round-trips a rich answer at every depth, nothing unrecognised', () => {
    const essay = worksheetWith([], { id: 'q2', answer: bi('Essay', '文章'), answerBlocks: richAnswer() });
    const worksheet = worksheetWith([
      leaf(),
      { id: 'b', blocks: [], subParts: [withAnswerBlocks<QuestionSubPart>({ id: 'b1', blocks: [] }, richAnswer())] },
    ]);
    worksheet.questions.push(essay.questions[0]);
    const reloaded = migrate(stored(worksheet));
    expect(reloaded.__unknown).toBeUndefined();
    expect(isNewerThanBuild(reloaded)).toBe(false);
    const [q1, q2] = reloaded.questions as StructuredQuestion[];
    expect(answerBlocksOf(q1.parts[0]).map((b) => b.id)).toEqual(['ans-table', 'ans-more', 'ans-pic', 'ans-dg1', 'ans-dg2']);
    expect(answerBlocksOf(q1.parts[1].subParts![0])).toHaveLength(5);
    expect(answerBlocksOf(q2)).toHaveLength(5);
    expect(JSON.stringify(serializeWorksheet(reloaded))).toBe(JSON.stringify(serializeWorksheet(worksheet)));
  });
});

describe('answer blocks — the page, teacher only', () => {
  it('prints text, then the blocks in order, before the scheme; all teacher-only', () => {
    const nodes = questionNodes(worksheetWith([leaf()]), TEACHER);
    const kinds = shape(nodes);
    const start = kinds.indexOf('Marking Scheme:Demand is elastic.');
    // The blank lines between blocks are the stem's own rules (a table opens with one).
    expect(kinds.slice(start, start + 10).filter((kind) => kind !== 'spacer')).toEqual([
      'Marking Scheme:Demand is elastic.',
      'table:ans-table',
      'Marking Scheme:So revenue falls.',
      'image:ans-pic',
      'diagram:ans-dg1',
      'diagram:ans-dg2',
    ]);
    const answer = nodes.slice(start, kinds.indexOf('diagram:ans-dg2') + 1);
    expect(answer.every((node) => 'teacherOnly' in node && node.teacherOnly)).toBe(true);
    // The text keeps with what follows it; the scheme comes after the blocks.
    expect((nodes[start] as { keepNext?: boolean }).keepNext).toBe(true);
    expect(kinds.indexOf('diagram:ans-dg2')).toBeLessThan(kinds.findIndex((k) => k.startsWith('Marking Scheme:') && k.includes('Elastic')));
    // A paragraph in the answer is typed on the page like a stem's.
    const more = nodes.find((node) => node.kind === 'text' && plain(node.text.en) === 'So revenue falls.');
    expect(more && 'edit' in more ? more.edit : undefined).toEqual({ kind: 'blockText', blockId: 'ans-more' });
  });

  it('a student copy has none of it, not even the blank lines between blocks', () => {
    for (const language of ['en', 'zh', 'bilingual'] as const) {
      const withAnswer = questionNodes(worksheetWith([leaf()]), { language, version: 'student' });
      const without = questionNodes(worksheetWith([{ ...leaf([]), answer: undefined, scheme: undefined }]), { language, version: 'student' });
      expect(shape(withAnswer)).toEqual(shape(without));
    }
  });

  it('prints at every depth: essay, leaf part, sub-part, and a part after its sub-parts', () => {
    const worksheet = worksheetWith([
      { id: 'b', blocks: [paragraph('b-text', 'Consider.')], answerBlocks: [table('b-ans', 'Group', '組')], subParts: [withAnswerBlocks<QuestionSubPart>({ id: 'b1', blocks: [paragraph('b1-text', '(i)')] }, [table('b1-ans', 'Sub', '小')])] },
    ]);
    const essay = worksheetWith([], { id: 'q2', answerBlocks: [table('q2-ans', 'Essay', '文章')] });
    const kinds = [...shape(questionNodes(worksheet, TEACHER)), ...shape(questionNodes(essay, TEACHER))];
    expect(kinds.indexOf('table:b1-ans')).toBeLessThan(kinds.indexOf('table:b-ans'));
    expect(kinds).toContain('table:q2-ans');
  });

  it('Chinese and bilingual print the Chinese side of each block', () => {
    const zh = JSON.stringify(questionNodes(worksheetWith([leaf()]), { language: 'zh', version: 'teacher' }));
    expect(zh).toContain('所以收入下跌。');
    expect(zh).toContain('彈性');
  });
});

describe('answer blocks — exports', () => {
  const images = new Map([
    ['ans-dg1', TINY_PNG],
    ['ans-dg2', TINY_PNG],
  ]);

  it('the teacher .docx holds the table, the paragraph and every figure; the student one none', async () => {
    const worksheet = worksheetWith([leaf()]);
    const teacher = await JSZip.loadAsync(await exportDocxBuffer(worksheet, TEACHER, images));
    const teacherXml = await teacher.file('word/document.xml')!.async('string');
    expect(teacherXml).toContain('Elasticity');
    expect(teacherXml).toContain('So revenue falls.');
    expect((teacherXml.match(/<wp:inline/g) ?? []).length).toBe(3);
    for (const language of ['en', 'zh', 'bilingual'] as const) {
      const studentXml = await documentXml(await exportDocxBuffer(worksheet, { language, version: 'student' }, images));
      expect(studentXml).not.toContain('Elasticity');
      expect(studentXml).not.toContain('彈性');
      expect(studentXml).not.toContain('So revenue falls.');
      expect(studentXml).not.toContain('<w:drawing>');
    }
    const zhXml = await documentXml(await exportDocxBuffer(worksheet, { language: 'zh', version: 'teacher' }, images));
    expect(zhXml).toContain('所以收入下跌。');
  });

  it('Copy for Word: in the teacher version, out of the student one', () => {
    const worksheet = worksheetWith([leaf()]);
    expect(worksheetClipboardHtml(worksheet, TEACHER, images)).toContain('So revenue falls.');
    expect(worksheetClipboardHtml(worksheet, STUDENT, images)).not.toContain('So revenue falls.');
    expect(worksheetClipboardHtml(worksheet, STUDENT, images)).not.toContain('Elasticity');
  });

  it('every answer-key layout prints the blocks in order, in every language', async () => {
    const base = worksheetWith([leaf()]);
    for (const preset of ANSWER_KEY_PRESET_IDS) {
      const worksheet = { ...base, answerKeyLayout: { preset } } as Worksheet;
      for (const language of ['en', 'zh', 'bilingual'] as const) {
        const nodes = renderAnswerKey(worksheet, language);
        const json = JSON.stringify(nodes);
        const at = (needle: string) => json.indexOf(needle);
        const more = language === 'zh' ? '所以收入下跌。' : 'So revenue falls.';
        expect(at('"blockId":"ans-table"'), `${preset} ${language}`).toBeGreaterThan(-1);
        expect(at('"blockId":"ans-table"')).toBeLessThan(at(more));
        expect(at(more)).toBeLessThan(at('"blockId":"ans-pic"'));
        expect(at('"blockId":"ans-pic"')).toBeLessThan(at('"blockId":"ans-dg1"'));
        expect(at('"blockId":"ans-dg1"')).toBeLessThan(at('"blockId":"ans-dg2"'));
      }
      const xml = await documentXml(await exportAnswerKeyDocxBuffer(worksheet, 'en', [], images));
      expect(xml, preset).toContain('So revenue falls.');
      expect(xml).toContain('Elasticity');
      // Inline pictures: the HKEAA key anchors a box of its own besides.
      expect((xml.match(/<wp:inline/g) ?? []).length).toBe(3);
    }
  });

  it('HKEAA (Marks column): each diagram is its own Figure n', () => {
    const nodes = renderAnswerKey({ ...worksheetWith([leaf()]), answerKeyLayout: { preset: 'hkeaa' } } as Worksheet, 'en');
    const texts = nodes.flatMap((node) => (node.kind === 'text' ? [plain(node.text.en)] : []));
    expect(texts).toContain('Indicate in Figure 1:');
    expect(texts).toContain('Figure 1');
    expect(texts).toContain('Figure 2');
  });

  it('Detailed table: a paragraph is an Answer row; a table, picture or diagram ends the table', () => {
    const nodes = renderAnswerKey({ ...worksheetWith([leaf()]), answerKeyLayout: { preset: 'detailed' } } as Worksheet, 'en');
    const kinds = shape(nodes);
    const first = kinds.indexOf('table:ans-table');
    expect(kinds[first - 1].startsWith('table:answer-key-scheme')).toBe(true);
    const rows = JSON.stringify(nodes.filter((node) => node.kind === 'table' && node.blockId?.startsWith('answer-key-scheme')));
    expect(rows).toContain('So revenue falls.');
  });
});

describe('answer blocks — editing on the page and in the panel', () => {
  it('a paragraph in the answer is typed on the page', () => {
    const worksheet = worksheetWith([leaf()]);
    const target = { kind: 'blockText' as const, blockId: 'ans-more' };
    expect(plain(textOfTarget(worksheet, target)!.en)).toBe('So revenue falls.');
    const edited = applyEditTarget(worksheet, target, bi('So revenue rises.', '所以收入上升。'));
    expect(plain(textOfTarget(edited, target)!.en)).toBe('So revenue rises.');
  });

  it('a table, picture or diagram inside the answer is found, resized and replaced by id', () => {
    const worksheet = worksheetWith([leaf()]);
    expect(findTableBlock(worksheet, 'ans-table')?.id).toBe('ans-table');
    expect(blockSize(applyResizeBlock(worksheet, 'ans-pic', 200), 'ans-pic')?.widthPx).toBe(200);
    const replaced = replaceBlockById(worksheet, 'ans-dg2', { ...diagram('ans-dg2'), widthPx: 222 });
    expect(blockSize(replaced, 'ans-dg2')?.widthPx).toBe(222);
  });

  it('inserting after the old model diagram turns the answer into a list, in place', () => {
    const worksheet = worksheetWith([{ ...leaf([]), answerDiagram: diagram('old') }]);
    const inserted = insertBlockAfter(worksheet, 'old', paragraph('new', 'More'));
    const part = (inserted.questions[0] as StructuredQuestion).parts[0];
    expect(part.answerDiagram).toBeUndefined();
    expect(answerBlocksOf(part).map((b) => b.id)).toEqual(['old', 'new']);
    // Into a sub-part's and an essay's answer too.
    const nested = worksheetWith([{ id: 'b', blocks: [], subParts: [withAnswerBlocks<QuestionSubPart>({ id: 'b1', blocks: [] }, [table('t', 'x', 'x'), paragraph('p', 'y')])] }]);
    const after = insertBlockAfter(nested, 't', picture('pic'));
    expect(answerBlocksOf((after.questions[0] as StructuredQuestion).parts[0].subParts![0]).map((b) => b.id)).toEqual(['t', 'pic', 'p']);
    const essay = worksheetWith([], { answerBlocks: [table('t', 'x', 'x'), paragraph('p', 'y')] });
    expect(answerBlocksOf(insertBlockAfter(essay, 'p', picture('pic')).questions[0] as StructuredQuestion).map((b) => b.id)).toEqual(['t', 'p', 'pic']);
  });

  it('the question owns its answer blocks: every walk finds them', () => {
    const question = worksheetWith([leaf()]).questions[0];
    const ids = questionBlockLists(question).flat().map((b) => b.id);
    expect(ids).toEqual(expect.arrayContaining(['ans-table', 'ans-more', 'ans-pic', 'ans-dg1', 'ans-dg2']));
  });
});

describe('answer blocks — copy, duplicate, translate, the AI writer', () => {
  it('a duplicate or a copy gets fresh ids inside the answer, content kept', () => {
    const question = worksheetWith([leaf()]).questions[0] as StructuredQuestion;
    for (const copy of [freshIds(question), copyQuestion(question, 'other-doc')]) {
      const blocks = answerBlocksOf(copy.parts[0]);
      expect(blocks.map((b) => b.kind)).toEqual(['table', 'paragraph', 'image', 'diagram', 'diagram']);
      const before = new Set(answerBlocksOf(question.parts[0]).map((b) => b.id));
      expect(blocks.some((b) => before.has(b.id))).toBe(false);
      expect(plain((blocks[1] as ParagraphBlock).text.en)).toBe('So revenue falls.');
    }
  });

  it('translation reaches every word in the answer, as teacher-only answer text', () => {
    const slots = collectTexts(worksheetWith([leaf()]));
    const more = slots.find((slot) => plain(slot.text.en) === 'So revenue falls.');
    expect(more).toMatchObject({ kind: 'answer', role: 'teacher' });
    const cell = slots.find((slot) => plain(slot.text.en) === 'Elasticity');
    expect(cell?.role).toBe('teacher');
  });

  it('the AI answer writer fills the text and leaves the teacher’s blocks alone', () => {
    const part = { ...leaf(), answer: undefined };
    const worksheet = worksheetWith([part]);
    const stamp = (worksheet.questions[0] as StructuredQuestion).parts[0];
    const { worksheet: written, report } = applyAnswerWrites(worksheet, [
      { key: 'k', questionId: 'q1', leafKey: 'part:a', stamp, fill: { shape: 'written', answer: bi('Written by AI.', 'AI 撰寫。') } },
    ]);
    expect(report.applied).toEqual(['k']);
    const after = (written.questions[0] as StructuredQuestion).parts[0];
    expect(plain(after.answer!.en)).toBe('Written by AI.');
    expect(answerBlocksOf(after).map((b) => b.id)).toEqual(['ans-table', 'ans-more', 'ans-pic', 'ans-dg1', 'ans-dg2']);
  });
});
