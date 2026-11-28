import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createAnswerDiagram, createTableBlock, createWorksheet } from '@/model/factories';
import { answerBlocksOf, moveAnswerBlockToPoint, withAnswerBlocks } from '@/model/answerBlocks';
import {
  applyDeleteTarget,
  applyResizeBlock,
  blockSize,
  findTableBlock,
  insertBlockAfter,
  joinSchemePoint,
  questionBlockLists,
  schemePointHasFigures,
  splitSchemePoint,
} from '@/model/edits';
import { copyQuestion, freshIds } from '@/model/lineage';
import {
  isSchemeEmpty,
  joinMarkPoint,
  pointBlocksOf,
  splitMarkPoint,
  withoutEmptyMarkPoint,
  withPointBlocks,
} from '@/model/markScheme';
import type { MarkPoint, MarkScheme } from '@/model/markSchemeTypes';
import { isNewerThanBuild, migrate, serializeWorksheet } from '@/model/migrations';
import { bi, plain } from '@/model/text';
import { collectTexts } from '@/model/textWalk';
import type { DiagramBlock, OutputMode, QuestionPart, StructuredQuestion, TableBlock, Worksheet } from '@/model/types';
import { worksheetClipboardHtml } from '@/export/clipboard';
import { exportAnswerKeyDocxBuffer, exportDocxBuffer } from '@/export/docx';
import { ANSWER_KEY_PRESET_IDS } from '@/model/answerKeyLayout';
import { renderAnswerKey } from '@/render/answerKey';
import type { RenderNode, TextNode } from '@/render/ir';
import { renderMarkScheme } from '@/render/markScheme';
import { renderWorksheet } from '@/render/worksheet';
import { TINY_PNG } from '@/test/fixtures';

/**
 * A marking point holds its own figures (k-0595, u-m9g9): "(1) Correct diagram: D shifts
 * right…" with the diagram under its line, carrying its mark, moving, splitting, joining and
 * deleting with it — the same diagram and table blocks a stem holds.
 */

const TEACHER: OutputMode = { language: 'en', version: 'teacher' };

const diagram = (id: string): DiagramBlock => ({ ...createAnswerDiagram(), id });
function table(id: string, en: string, zh: string): TableBlock {
  const block = createTableBlock(2, 2);
  block.id = id;
  block.rows[0].cells[0].text = bi(en, zh);
  return block;
}

const point = (id: string, en: string, marks?: number, blocks?: MarkPoint['blocks']): MarkPoint => ({
  id,
  text: bi(en, en),
  ...(marks !== undefined ? { marks } : {}),
  ...(blocks ? { blocks } : {}),
});

/** (1) the diagram point holding a diagram, (1) a point holding a table, (1) a worded point. */
function scheme(): MarkScheme {
  return {
    routes: [
      {
        id: 'r',
        groups: [
          {
            id: 'g',
            points: [
              point('p1', 'Correct diagram: D shifts right', 1, [diagram('pt-dg')]),
              point('p2', 'Revenue table', 1, [table('pt-table', 'Price', '價格')]),
              point('p3', 'Price rises', 1),
            ],
          },
        ],
      },
    ],
  };
}

function worksheetWith(parts: QuestionPart[], extra: Partial<StructuredQuestion> = {}): Worksheet {
  const question: StructuredQuestion = {
    id: 'q1',
    type: 'structured',
    blocks: [{ kind: 'paragraph', id: 'stem', text: bi('Read the data.', '閱讀資料。') }],
    parts,
    ...extra,
  };
  const worksheet = createWorksheet();
  worksheet.questions = [question];
  worksheet.flow = [{ type: 'question', id: question.id }];
  return worksheet;
}

const leaf = (extra: Partial<QuestionPart> = {}): QuestionPart => ({
  id: 'a',
  blocks: [{ kind: 'paragraph', id: 'a-text', text: bi('Explain with a diagram.', '以圖解釋。') }],
  marks: 3,
  scheme: scheme(),
  ...extra,
});

const partOf = (worksheet: Worksheet) => (worksheet.questions[0] as StructuredQuestion).parts[0];
const pointsOf = (worksheet: Worksheet) => partOf(worksheet).scheme!.routes[0].groups[0].points;

const questionNodes = (worksheet: Worksheet, mode: OutputMode): RenderNode[] =>
  renderWorksheet(worksheet, mode).items.flatMap((item) => (item.type === 'question' ? item.question.nodes : []));

const shape = (nodes: RenderNode[]) =>
  nodes.map((node) => {
    if (node.kind === 'text') return `${node.style}:${plain(node.text.en).slice(0, 24)}`;
    if (node.kind === 'diagram' || node.kind === 'image' || node.kind === 'table') return `${node.kind}:${node.blockId}`;
    return node.kind;
  });

const documentXml = async (buffer: ArrayBuffer | Buffer | Uint8Array) =>
  (await JSZip.loadAsync(buffer)).file('word/document.xml')!.async('string');

describe('point figures — model', () => {
  it('reads and writes a point’s figures, storing nothing for none', () => {
    expect(pointBlocksOf(point('p', 'x'))).toEqual([]);
    expect(pointBlocksOf({ ...point('p', 'x'), blocks: 'broken' as never })).toEqual([]);
    const with1 = withPointBlocks(point('p', 'x'), [diagram('d')]);
    expect(with1.blocks?.map((b) => b.id)).toEqual(['d']);
    expect('blocks' in withPointBlocks(with1, [])).toBe(false);
  });

  it('a figure-only point is content: the scheme is not empty', () => {
    const only: MarkScheme = { routes: [{ id: 'r', groups: [{ id: 'g', points: [{ id: 'p', text: bi('', ''), blocks: [diagram('d')] }] }] }] };
    expect(isSchemeEmpty(only)).toBe(false);
  });

  it('Enter in the middle: the figure goes with the words after the caret, which end the point', () => {
    const split = splitMarkPoint(scheme(), 'p1', 'en', 'Correct diagram:'.length, 'Correct diagram:'.length, 'new');
    const [first, second] = split.routes[0].groups[0].points;
    expect(plain(first.text.en)).toBe('Correct diagram:');
    expect(first.blocks).toBeUndefined();
    expect(second.id).toBe('new');
    expect(second.blocks?.map((b) => b.id)).toEqual(['pt-dg']);
    expect(second.marks).toBe(1);
  });

  it('Enter at the end (starting the next point): the figure stays with its point', () => {
    const end = 'Correct diagram: D shifts right'.length;
    const [first, second] = splitMarkPoint(scheme(), 'p1', 'en', end, end, 'new').routes[0].groups[0].points;
    expect(first.blocks?.map((b) => b.id)).toEqual(['pt-dg']);
    expect(second.blocks).toBeUndefined();
  });

  it('Backspace / Delete join two points, keeping both points’ figures in order', () => {
    const joined = joinMarkPoint(scheme(), 'p2', 'en', 'backward')!;
    const [point1] = joined.scheme.routes[0].groups[0].points;
    expect(point1.blocks?.map((b) => b.id)).toEqual(['pt-dg', 'pt-table']);
    expect(joined.pointId).toBe('p1');
    // A split joined straight back is the point it was.
    const s = scheme();
    const split = splitMarkPoint(s, 'p1', 'en', 7, 7, 'new');
    expect(joinMarkPoint(split, 'new', 'en', 'backward')!.scheme).toEqual(s);
  });

  it('Enter on an empty point holding a figure keeps it', () => {
    const s: MarkScheme = {
      routes: [{ id: 'r', groups: [{ id: 'g', points: [point('a', 'x', 1), { id: 'b', text: bi('', ''), blocks: [diagram('d')] }] }] }],
    };
    expect(withoutEmptyMarkPoint(s, 'b')).toBe(s);
    const worksheet = worksheetWith([leaf({ scheme: s })]);
    expect(schemePointHasFigures(worksheet, { kind: 'schemePoint', questionId: 'q1', partId: 'a', pointId: 'b' })).toBe(true);
    expect(schemePointHasFigures(worksheet, { kind: 'schemePoint', questionId: 'q1', partId: 'a', pointId: 'a' })).toBe(false);
  });

  it('the page’s split and join commands carry the figures too', () => {
    const worksheet = worksheetWith([leaf()]);
    const target = { kind: 'schemePoint' as const, questionId: 'q1', partId: 'a', pointId: 'p1' };
    const split = splitSchemePoint(worksheet, target, 'en', 8, 8, 'n');
    expect(pointsOf(split)[1].blocks?.map((b) => b.id)).toEqual(['pt-dg']);
    const joined = joinSchemePoint(split, { ...target, pointId: 'n' }, 'en', 'backward')!;
    expect(pointsOf(joined.worksheet)[0].blocks?.map((b) => b.id)).toEqual(['pt-dg']);
  });

  it('moves an answer’s diagram into a point, leaving the rest of the answer', () => {
    const part = withAnswerBlocks(leaf(), [diagram('ans-dg'), table('ans-t', 'x', 'x')]);
    const moved = moveAnswerBlockToPoint(part, 'ans-dg', 'p3');
    expect(answerBlocksOf(moved).map((b) => b.id)).toEqual(['ans-t']);
    expect(moved.scheme!.routes[0].groups[0].points[2].blocks?.map((b) => b.id)).toEqual(['ans-dg']);
    // The last one: the answer stores nothing.
    const last = moveAnswerBlockToPoint(moveAnswerBlockToPoint(part, 'ans-dg', 'p3'), 'ans-t', 'p1');
    expect(last.answerBlocks).toBeUndefined();
    expect(last.answerDiagram).toBeUndefined();
    expect(last.scheme!.routes[0].groups[0].points[0].blocks?.map((b) => b.id)).toEqual(['pt-dg', 'ans-t']);
    // Unknown block or point: the same leaf.
    expect(moveAnswerBlockToPoint(part, 'nope', 'p1')).toBe(part);
    expect(moveAnswerBlockToPoint(part, 'ans-dg', 'nope')).toBe(part);
  });
});

describe('point figures — schema v4 and older builds', () => {
  const stored = (worksheet: Worksheet) => JSON.parse(JSON.stringify(serializeWorksheet(worksheet)));

  it('a point with a figure is written at 4 (every release reads it as newer, read-only)', () => {
    const out = stored(worksheetWith([leaf()]));
    expect(out.schemaVersion).toBe(4);
    // Its words stay where every build reads them.
    expect(out.questions[0].parts[0].scheme.routes[0].groups[0].points[0].text.en[0].text).toBe('Correct diagram: D shifts right');
  });

  it('an essay question’s and a sub-part’s scheme count too', () => {
    expect(stored(worksheetWith([], { scheme: scheme() })).schemaVersion).toBe(4);
    expect(stored(worksheetWith([{ id: 'b', blocks: [], subParts: [{ id: 'b1', blocks: [], scheme: scheme() }] }])).schemaVersion).toBe(4);
  });

  it('a scheme with no figures keeps its old version; empty lists store nothing', () => {
    const plainScheme: MarkScheme = { routes: [{ id: 'r', groups: [{ id: 'g', points: [point('p', 'Price rises', 1)] }] }] };
    expect(stored(worksheetWith([leaf({ scheme: plainScheme })])).schemaVersion).toBe(1);
    const emptied = applyDeleteTarget(applyDeleteTarget(worksheetWith([leaf()]), { kind: 'blockText', blockId: 'pt-dg' }), {
      kind: 'blockText',
      blockId: 'pt-table',
    });
    expect(pointsOf(emptied).every((p) => !('blocks' in p))).toBe(true);
    expect(stored(emptied).schemaVersion).toBe(1);
  });

  it('round-trips, nothing unrecognised', () => {
    const worksheet = worksheetWith([leaf()]);
    const reloaded = migrate(stored(worksheet));
    expect(reloaded.__unknown).toBeUndefined();
    expect(isNewerThanBuild(reloaded)).toBe(false);
    expect(pointsOf(reloaded)[0].blocks?.map((b) => b.id)).toEqual(['pt-dg']);
    expect(JSON.stringify(serializeWorksheet(reloaded))).toBe(JSON.stringify(serializeWorksheet(worksheet)));
  });
});

describe('point figures — the page', () => {
  it('prints each figure straight under its point’s line, the line kept with it, all teacher-only', () => {
    const nodes = questionNodes(worksheetWith([leaf()]), TEACHER);
    const kinds = shape(nodes).filter((kind) => kind !== 'spacer');
    const at = kinds.indexOf('Marking Scheme:Correct diagram: D shift');
    expect(kinds.slice(at, at + 5)).toEqual([
      'Marking Scheme:Correct diagram: D shift',
      'diagram:pt-dg',
      'Marking Scheme:Revenue table',
      'table:pt-table',
      'Marking Scheme:Price rises',
    ]);
    const line = nodes.find((node) => node.kind === 'text' && plain(node.text.en).startsWith('Correct diagram')) as TextNode;
    expect(line.keepNext).toBe(true);
    expect(line.trail ? plain(line.trail.en) : undefined).toBe('(1)');
    const figures = nodes.filter((node) => (node.kind === 'diagram' && node.blockId === 'pt-dg') || (node.kind === 'table' && node.blockId === 'pt-table'));
    expect(figures).toHaveLength(2);
    expect(figures.every((node) => 'teacherOnly' in node && node.teacherOnly)).toBe(true);
  });

  it('a student copy has none of it', () => {
    for (const language of ['en', 'zh', 'bilingual'] as const) {
      const json = JSON.stringify(questionNodes(worksheetWith([leaf()]), { language, version: 'student' }));
      expect(json).not.toContain('pt-dg');
      expect(json).not.toContain('pt-table');
    }
  });

  it('a figure-only point prints its mark line, then the figure', () => {
    const only = renderMarkScheme(
      { routes: [{ id: 'r', groups: [{ id: 'g', points: [{ id: 'p', text: bi('', ''), marks: 2, blocks: [diagram('d')] }] }] }] },
      { teacherOnly: true },
    );
    expect(only.map((node) => node.kind)).toEqual(['text', 'diagram']);
    expect((only[0] as TextNode).editOnly).toBeUndefined();
    expect(plain((only[0] as TextNode).trail!.en)).toBe('(2)');
  });

  it('shown as a paragraph, the route’s figures follow the paragraph', () => {
    const nodes = renderMarkScheme({ ...scheme(), display: 'paragraph' });
    expect(shape(nodes).filter((kind) => kind !== 'spacer')).toEqual([
      'Marking Scheme:Correct diagram: D shift',
      'diagram:pt-dg',
      'table:pt-table',
    ]);
    expect((nodes[0] as TextNode).keepNext).toBe(true);
  });
});

describe('point figures — exports', () => {
  const images = new Map([['pt-dg', TINY_PNG]]);

  it('the teacher .docx holds the point’s table and diagram; the student one none', async () => {
    const worksheet = worksheetWith([leaf()]);
    const teacherXml = await documentXml(await exportDocxBuffer(worksheet, TEACHER, images));
    expect(teacherXml).toContain('Price');
    expect((teacherXml.match(/<wp:inline/g) ?? []).length).toBe(1);
    const studentXml = await documentXml(await exportDocxBuffer(worksheet, { language: 'en', version: 'student' }, images));
    expect(studentXml).not.toContain('Revenue table');
    expect(studentXml).not.toContain('<w:drawing>');
  });

  it('Copy for Word carries the point’s table in the teacher version', () => {
    const worksheet = worksheetWith([leaf()]);
    expect(worksheetClipboardHtml(worksheet, TEACHER, images)).toContain('Price');
    expect(worksheetClipboardHtml(worksheet, { language: 'en', version: 'student' }, images)).not.toContain('Revenue table');
  });

  it('every answer-key layout prints each figure after its own point, in every language', async () => {
    const base = worksheetWith([leaf()]);
    const printed: string[] = [];
    for (const preset of ANSWER_KEY_PRESET_IDS) {
      const worksheet = { ...base, answerKeyLayout: { preset } } as Worksheet;
      for (const language of ['en', 'zh', 'bilingual'] as const) {
        const json = JSON.stringify(renderAnswerKey(worksheet, language));
        const at = (needle: string) => json.indexOf(needle);
        // Suggested answers prints the points only with its "points" switch; the figures go with them.
        if (at('Correct diagram') === -1) {
          expect(at('"blockId":"pt-dg"'), `${preset} ${language}`).toBe(-1);
          continue;
        }
        expect(at('"blockId":"pt-dg"'), `${preset} ${language}`).toBeGreaterThan(at('Correct diagram'));
        expect(at('"blockId":"pt-dg"')).toBeLessThan(at('Revenue table'));
        expect(at('Revenue table')).toBeLessThan(at('"blockId":"pt-table"'));
        expect(at('"blockId":"pt-table"')).toBeLessThan(at('Price rises'));
        if (language === 'en') printed.push(preset);
      }
      const xml = await documentXml(await exportAnswerKeyDocxBuffer(worksheet, 'en', [], images));
      if (!xml.includes('Correct diagram')) continue;
      expect(xml, preset).toContain('Price');
      expect((xml.match(/<wp:inline/g) ?? []).length, preset).toBe(1);
    }
    expect(printed).toEqual(['classic', 'hkeaa', 'suggested', 'detailed']);
  });

  it('the key draws a point diagram’s answer layer', () => {
    const json = JSON.stringify(renderAnswerKey({ ...worksheetWith([leaf()]), answerKeyLayout: { preset: 'hkeaa' } } as Worksheet, 'en'));
    expect(json).toContain('"blockId":"pt-dg"');
  });
});

describe('point figures — every block walk reaches them', () => {
  it('found, resized, inserted beside and deleted by id, like any stem figure', () => {
    const worksheet = worksheetWith([leaf()]);
    expect(findTableBlock(worksheet, 'pt-table')?.id).toBe('pt-table');
    expect(blockSize(applyResizeBlock(worksheet, 'pt-dg', 222), 'pt-dg')?.widthPx).toBe(222);
    const inserted = insertBlockAfter(worksheet, 'pt-dg', table('beside', 'x', 'x'));
    expect(pointsOf(inserted)[0].blocks?.map((b) => b.id)).toEqual(['pt-dg', 'beside']);
    const deleted = applyDeleteTarget(worksheet, { kind: 'blockText', blockId: 'pt-dg' });
    expect(pointsOf(deleted)[0].blocks).toBeUndefined();
    expect(pointsOf(deleted)[1].blocks?.map((b) => b.id)).toEqual(['pt-table']);
    // In an essay question's scheme too.
    const essay = worksheetWith([], { scheme: scheme() });
    expect(findTableBlock(essay, 'pt-table')?.id).toBe('pt-table');
  });

  it('the question owns them: a duplicate or copy gets fresh ids, content kept', () => {
    const question = worksheetWith([leaf()]).questions[0] as StructuredQuestion;
    expect(questionBlockLists(question).flat().map((b) => b.id)).toEqual(expect.arrayContaining(['pt-dg', 'pt-table']));
    for (const copy of [freshIds(question), copyQuestion(question, 'other-doc')]) {
      const [p1, p2] = copy.parts[0].scheme!.routes[0].groups[0].points;
      expect(p1.blocks?.[0].kind).toBe('diagram');
      expect(p1.blocks?.[0].id).not.toBe('pt-dg');
      expect(p2.blocks?.[0].id).not.toBe('pt-table');
    }
  });

  it('translation reaches a point table’s words, as teacher-only', () => {
    const cell = collectTexts(worksheetWith([leaf()])).find((slot) => plain(slot.text.en) === 'Price');
    expect(cell?.role).toBe('teacher');
  });
});
