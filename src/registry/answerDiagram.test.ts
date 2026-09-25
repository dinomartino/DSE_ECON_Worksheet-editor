import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANSWER_DIAGRAM_WIDTH_PX,
  createAnswerDiagram,
  createWorksheet,
} from '@/model/factories';
import {
  applyDeleteTarget,
  applyResizeBlock,
  findDiagramBlock,
  isAnswerDiagram,
  replaceBlockById,
} from '@/model/edits';
import { migrate, serializeWorksheet } from '@/model/migrations';
import { bi } from '@/model/text';
import type {
  DiagramBlock,
  OutputMode,
  QuestionPart,
  StructuredQuestion,
  Worksheet,
} from '@/model/types';
import { worksheetClipboardHtml } from '@/export/clipboard';
import { collectDiagramNodes, collectDiagramNodesIn } from '@/export/diagramImage';
import {
  buildAnswerKeyDocxParts,
  exportAnswerKeyDocxBuffer,
  exportDocxBuffer,
} from '@/export/docx';
import { renderAnswerKey, renderCombinedAnswerKey } from '@/render/answerKey';
import type { RenderNode } from '@/render/ir';
import { renderWorksheet } from '@/render/worksheet';
import { TINY_PNG } from '@/test/fixtures';
import { structuredType } from './structured';

/** A model answer diagram on a leaf (§ `QuestionPart.answerDiagram`): teacher-only figure. */

const TEACHER: OutputMode = { language: 'en', version: 'teacher' };
const STUDENT: OutputMode = { language: 'en', version: 'student' };

const paragraph = (id: string, text: string) => ({
  kind: 'paragraph' as const,
  id,
  text: bi(text, text),
});

function diagram(id: string): DiagramBlock {
  return { ...createAnswerDiagram(), id };
}

function worksheetWith(parts: QuestionPart[], extra: Partial<StructuredQuestion> = {}): Worksheet {
  const question: StructuredQuestion = {
    id: 'q1',
    type: 'structured',
    blocks: [paragraph('stem', 'A government imposes a price ceiling on rice.')],
    parts,
    ...extra,
  };
  const worksheet = createWorksheet();
  worksheet.questions = [question];
  worksheet.flow = [{ type: 'question', id: question.id }];
  return worksheet;
}

/** One leaf part with an answer, a model diagram, a scheme and graph space. */
function leafPart(): QuestionPart {
  return {
    id: 'a',
    blocks: [paragraph('a-text', 'Draw a diagram to show the shortage.')],
    marks: 4,
    answer: bi('Shortage Qd − Qs.', '短缺。'),
    answerDiagram: diagram('dg-a'),
    scheme: {
      routes: [
        { id: 'r', groups: [{ id: 'g', points: [{ id: 'p', text: bi('Correct curves', '正確曲線'), marks: 1 }] }] },
      ],
    },
    answerGraph: { lines: 16, width: 'half' },
  };
}

const questionNodes = (worksheet: Worksheet, mode: OutputMode): RenderNode[] =>
  renderWorksheet(worksheet, mode).items.flatMap((item) =>
    item.type === 'question' ? item.question.nodes : [],
  );

const shape = (nodes: RenderNode[]) =>
  nodes.map((node) =>
    node.kind === 'text' ? node.style : node.kind === 'diagram' ? `diagram:${node.blockId}` : node.kind,
  );

describe('model answer diagram — model', () => {
  it('defaults to demand and supply at the answer width', () => {
    const block = createAnswerDiagram();
    expect(block.kind).toBe('diagram');
    expect(block.widthPx).toBe(ANSWER_DIAGRAM_WIDTH_PX);
    expect(block.diagram.templateId).toBe('supply-demand');
  });

  it('survives a save and reload at every depth', () => {
    const worksheet = worksheetWith(
      [
        leafPart(),
        {
          id: 'b',
          blocks: [paragraph('b-text', 'Explain.')],
          answerDiagram: diagram('dg-b'),
          subParts: [{ id: 'b1', blocks: [paragraph('b1-text', '(i)')], answerDiagram: diagram('dg-b1') }],
        },
      ],
    );
    const partless = worksheetWith([], { id: 'q2', answerDiagram: diagram('dg-q') });
    worksheet.questions.push(partless.questions[0]);
    const reloaded = migrate(JSON.parse(JSON.stringify(serializeWorksheet(worksheet))));
    const [q1, q2] = reloaded.questions as StructuredQuestion[];
    expect(q1.parts[0].answerDiagram?.id).toBe('dg-a');
    expect(q1.parts[0].answerDiagram?.diagram).toEqual(
      (worksheet.questions[0] as StructuredQuestion).parts[0].answerDiagram?.diagram,
    );
    expect(q1.parts[1].answerDiagram?.id).toBe('dg-b');
    expect(q1.parts[1].subParts?.[0].answerDiagram?.id).toBe('dg-b1');
    expect(q2.answerDiagram?.id).toBe('dg-q');
  });

  it('is found, patched, resized and deleted by block id like a stem diagram', () => {
    const worksheet = worksheetWith([
      leafPart(),
      { id: 'b', blocks: [], subParts: [{ id: 'b1', blocks: [], answerDiagram: diagram('dg-b1') }] },
    ]);
    expect(findDiagramBlock(worksheet, 'dg-a')?.id).toBe('dg-a');
    expect(findDiagramBlock(worksheet, 'dg-b1')?.id).toBe('dg-b1');
    expect(isAnswerDiagram(worksheet, 'dg-b1')).toBe(true);
    expect(isAnswerDiagram(worksheet, 'a-text')).toBe(false);

    const found = findDiagramBlock(worksheet, 'dg-b1')!;
    const patched = replaceBlockById(worksheet, 'dg-b1', {
      ...found,
      diagram: { ...found.diagram, showOrigin: true },
    });
    expect(findDiagramBlock(patched, 'dg-b1')?.diagram.showOrigin).toBe(true);
    // A stale handle cannot turn it into another kind.
    const unchanged = replaceBlockById(worksheet, 'dg-a', paragraph('dg-a', 'x'));
    expect(findDiagramBlock(unchanged, 'dg-a')).toEqual(findDiagramBlock(worksheet, 'dg-a'));

    expect(findDiagramBlock(applyResizeBlock(worksheet, 'dg-a', 400), 'dg-a')?.widthPx).toBe(400);

    const deleted = applyDeleteTarget(worksheet, { kind: 'blockText', blockId: 'dg-a' });
    const part = (deleted.questions[0] as StructuredQuestion).parts[0];
    expect('answerDiagram' in part).toBe(false);
    expect(part.answer).toEqual(leafPart().answer);
  });
});

describe('model answer diagram — render', () => {
  it('prints after the answer text and before the scheme, in the teacher version only', () => {
    const worksheet = worksheetWith([leafPart()]);
    const teacher = shape(questionNodes(worksheet, TEACHER));
    const answer = teacher.indexOf('Marking Scheme');
    const figure = teacher.indexOf('diagram:dg-a');
    expect(answer).toBeGreaterThan(-1);
    expect(figure).toBe(answer + 1);
    expect(teacher.slice(figure + 1)).toContain('Marking Scheme');
    expect(teacher.indexOf('answerGraph')).toBeGreaterThan(figure);
    const node = questionNodes(worksheet, TEACHER).find((n) => n.kind === 'diagram');
    expect(node).toMatchObject({ teacherOnly: true, blockId: 'dg-a' });

    const student = shape(questionNodes(worksheet, STUDENT));
    expect(student.some((entry) => entry.startsWith('diagram:'))).toBe(false);
    expect(student).toContain('answerGraph');
  });

  it('covers a sub-part, the aggregate after a group, and a partless question', () => {
    const grouped = worksheetWith([
      {
        id: 'b',
        blocks: [paragraph('b-text', 'Explain.')],
        answerDiagram: diagram('dg-b'),
        subParts: [
          { id: 'b1', blocks: [paragraph('b1-text', 'First.')], answerDiagram: diagram('dg-b1') },
          { id: 'b2', blocks: [paragraph('b2-text', 'Second.')] },
        ],
      },
    ]);
    const nodes = shape(questionNodes(grouped, TEACHER));
    expect(nodes.indexOf('diagram:dg-b1')).toBeLessThan(nodes.indexOf('Sub-sub-question', nodes.indexOf('diagram:dg-b1')));
    // The part's own figure prints after the whole group.
    expect(nodes.indexOf('diagram:dg-b')).toBeGreaterThan(nodes.lastIndexOf('Sub-sub-question'));

    const partless = worksheetWith([], { answerDiagram: diagram('dg-q'), answerGraph: { lines: 12 } });
    const leaf = shape(questionNodes(partless, TEACHER));
    expect(leaf.indexOf('diagram:dg-q')).toBeLessThan(leaf.indexOf('answerGraph'));
    expect(shape(questionNodes(partless, STUDENT))).not.toContain('diagram:dg-q');
  });

  it('only asks the pre-pass for a figure the mode prints', () => {
    const worksheet = worksheetWith([leafPart()]);
    expect(collectDiagramNodes(worksheet, TEACHER).map((node) => node.blockId)).toEqual(['dg-a']);
    expect(collectDiagramNodes(worksheet, STUDENT)).toEqual([]);
  });

  it('pastes into Word in the teacher copy, not the student one', () => {
    const worksheet = worksheetWith([leafPart()]);
    const images = new Map([['dg-a', TINY_PNG]]);
    expect(worksheetClipboardHtml(worksheet, TEACHER, images)).toContain(TINY_PNG);
    expect(worksheetClipboardHtml(worksheet, STUDENT, images)).not.toContain(TINY_PNG);
  });

  it('counts a leaf as answered', () => {
    const bare: QuestionPart = { id: 'a', blocks: [paragraph('a-text', 'Draw.')] };
    const question = worksheetWith([bare]).questions[0] as StructuredQuestion;
    expect(structuredType.healthFacts!(question).unansweredParts).toBe(1);
    const drawn = { ...question, parts: [{ ...bare, answerDiagram: diagram('dg-a') }] };
    expect(structuredType.healthFacts!(drawn).unansweredParts).toBe(0);
    const sub = {
      ...question,
      parts: [{ ...bare, subParts: [{ id: 'a1', blocks: [], answerDiagram: diagram('dg-a1') }] }],
    };
    expect(structuredType.healthFacts!(sub).unansweredParts).toBe(0);
  });
});

describe('model answer diagram — answer key', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-25T09:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('rides on the row and prints under the answer text', () => {
    const worksheet = worksheetWith([leafPart()]);
    const entry = structuredType.answerKey!(worksheet.questions[0] as StructuredQuestion, {
      questionNumber: 1,
    });
    expect(entry.kind === 'scheme' && entry.rows[0].diagram?.id).toBe('dg-a');

    const nodes = renderAnswerKey(worksheet, 'en');
    const kinds = shape(nodes);
    const answer = kinds.indexOf('Marking Scheme');
    expect(kinds[answer + 1]).toBe('diagram:dg-a');
    const figure = nodes.find((node) => node.kind === 'diagram');
    expect(figure && 'teacherOnly' in figure ? figure.teacherOnly : undefined).toBeFalsy();

    const other = worksheetWith([], { id: 'q9', answerDiagram: diagram('dg-q9') });
    const combined = renderCombinedAnswerKey([worksheet, other], 'en');
    expect(collectDiagramNodesIn(combined).map((node) => node.blockId)).toEqual(['dg-a', 'dg-q9']);
  });

  it('embeds the picture in the answer-key .docx', async () => {
    const worksheet = worksheetWith([leafPart()]);
    const images = new Map([['dg-a', TINY_PNG]]);
    const parts = buildAnswerKeyDocxParts(worksheet, 'en', [], images);
    expect(parts.assets).toHaveLength(1);
    expect(parts.documentXml).toContain('<w:drawing>');

    const zip = await JSZip.loadAsync(await exportAnswerKeyDocxBuffer(worksheet, 'en', [], images));
    expect(Object.keys(zip.files).some((path) => path.startsWith('word/media/'))).toBe(true);
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string');
    expect(rels).toMatch(/relationships\/image/);
    const types = await zip.file('[Content_Types].xml')!.async('string');
    expect(types).toContain('image/png');
  });

  it('adds no picture to a key without one', async () => {
    const worksheet = worksheetWith([{ ...leafPart(), answerDiagram: undefined }]);
    expect(buildAnswerKeyDocxParts(worksheet, 'en').assets).toEqual([]);
    const zip = await JSZip.loadAsync(await exportAnswerKeyDocxBuffer(worksheet, 'en'));
    expect(Object.keys(zip.files).some((path) => path.startsWith('word/media/'))).toBe(false);
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string');
    expect(rels).not.toMatch(/relationships\/image/);
  });

  it('embeds it in the teacher .docx and leaves the student one clean', async () => {
    const worksheet = worksheetWith([leafPart()]);
    const images = new Map([['dg-a', TINY_PNG]]);
    const media = async (mode: OutputMode) =>
      Object.values((await JSZip.loadAsync(await exportDocxBuffer(worksheet, mode, images))).files).filter(
        (file) => !file.dir && file.name.startsWith('word/media/'),
      );
    expect(await media(TEACHER)).toHaveLength(1);
    expect(await media(STUDENT)).toHaveLength(0);
  });
});
