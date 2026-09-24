import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  answerKeyFileName,
  buildAnswerKeyDocxParts,
  docxFileName,
  exportAnswerKeyDocxBuffer,
} from '@/export/docx';
import { createMcqQuestion, createStructuredQuestion, createWorksheet, newId } from '@/model/factories';
import { createSectionElement } from '@/model/flow';
import { bi, plain } from '@/model/text';
import type { McqQuestion, StructuredQuestion } from '@/model/types';
import { buildAcceptanceWorksheet, withFlow } from '@/test/fixtures';
import { renderWorksheet } from './worksheet';
import { renderAnswerKey, UNANSWERED_MARK } from './answerKey';
import type { RenderNode, TableNode, TextNode } from './ir';

const grids = (nodes: RenderNode[]) =>
  nodes.filter((node): node is TableNode => node.kind === 'table');

/** A grid's cells as [number, letter] pairs, padding dropped. */
const pairs = (grid: TableNode) =>
  grid.rows.flatMap((row) => {
    const out: Array<[string, string]> = [];
    for (let i = 0; i < row.length; i += 2) {
      const number = plain(row[i].text.en);
      if (number) out.push([number, plain(row[i + 1].text.en)]);
    }
    return out;
  });

const texts = (nodes: RenderNode[]) =>
  nodes.filter((node): node is TextNode => node.kind === 'text');

function mcq(answerIndex: number, explanation?: string): McqQuestion {
  const question = createMcqQuestion();
  question.answerIndex = answerIndex;
  if (explanation) question.explanation = bi(explanation, `解說${explanation}`);
  return question;
}

describe('answer key IR', () => {
  it('numbers the grid exactly as the paper does, restarting at a section', () => {
    const worksheet = buildAcceptanceWorksheet();
    const paper = renderWorksheet(worksheet, { language: 'en', version: 'student' });
    const printed = new Map(paper.questions.map((q) => [q.questionId, String(q.number)]));

    const nodes = renderAnswerKey(worksheet, 'en');
    const [grid] = grids(nodes);
    const mcqs = worksheet.questions.filter((q): q is McqQuestion => q.type === 'mcq');
    expect(pairs(grid)).toEqual(mcqs.map((q) => [printed.get(q.id), 'C']));

    // Section B restarts, so its first structured question is "Question 1" again.
    const headings = texts(nodes).filter((node) => node.style === 'Question Stem');
    expect(headings.map((node) => plain(node.text.en))).toEqual(['Question 1', 'Question 2']);
  });

  it('keeps a restart unambiguous: each section gets its own grid under its heading', () => {
    const worksheet = withFlow(
      createWorksheet(),
      [
        createSectionElement(bi('Section A', '甲部')),
        mcq(0),
        mcq(1),
        createSectionElement(bi('Section B', '乙部')),
        mcq(3),
      ],
      { replaceLayout: true },
    );
    const nodes = renderAnswerKey(worksheet, 'en');
    expect(grids(nodes).map(pairs)).toEqual([
      [['1', 'A'], ['2', 'B']],
      [['1', 'D']],
    ]);
    const sectionHeadings = texts(nodes).filter((node) => node.style === 'Section Heading');
    expect(sectionHeadings.map((node) => plain(node.text.en))).toEqual(['Section A', 'Section B']);
  });

  it('continues numbering through a section that does not restart', () => {
    const worksheet = withFlow(
      createWorksheet(),
      [mcq(0), createSectionElement(bi('Part two', '第二部分'), false), mcq(1)],
      { replaceLayout: true },
    );
    expect(grids(renderAnswerKey(worksheet, 'en')).map(pairs)).toEqual([[['1', 'A']], [['2', 'B']]]);
  });

  it('prints a dash for an unkeyed MCQ, never a guessed letter', () => {
    const worksheet = withFlow(createWorksheet(), [mcq(-1), mcq(7), mcq(2)], {
      replaceLayout: true,
    });
    expect(pairs(grids(renderAnswerKey(worksheet, 'en'))[0])).toEqual([
      ['1', UNANSWERED_MARK],
      ['2', UNANSWERED_MARK],
      ['3', 'C'],
    ]);
  });

  it('lays the grid five pairs to a row and pads the last row', () => {
    const worksheet = withFlow(
      createWorksheet(),
      Array.from({ length: 7 }, () => mcq(1)),
      { replaceLayout: true },
    );
    const [grid] = grids(renderAnswerKey(worksheet, 'en'));
    expect(grid.rows).toHaveLength(2);
    expect(grid.rows.every((row) => row.length === 10)).toBe(true);
    expect(grid.columnCount).toBe(10);
    expect(plain(grid.rows[1][4].text.en)).toBe('');
  });

  it('lists explanations under the grid, by number', () => {
    const worksheet = withFlow(createWorksheet(), [mcq(0), mcq(1, 'Because.')], {
      replaceLayout: true,
    });
    const notes = renderAnswerKey(worksheet, 'en').filter((node) => node.kind === 'columns');
    expect(notes).toHaveLength(1);
    const [row] = notes as Extract<RenderNode, { kind: 'columns' }>[];
    expect(plain(row.cells[0].text.en)).toBe('2.');
    expect(plain(row.cells[1].text.zh)).toBe('解說Because.');
  });

  it('gives each part and sub-part its marks and the author’s answer', () => {
    const question: StructuredQuestion = createStructuredQuestion();
    question.parts = [
      { id: newId(), blocks: [], marks: 3, answer: bi('Qd = Qs.', '需求量等於供應量。') },
      {
        id: newId(),
        blocks: [],
        subParts: [
          { id: newId(), blocks: [], marks: 2, answer: bi('Income.', '收入。') },
          { id: newId(), blocks: [], marks: 0 },
        ],
        answer: bi('Overall.', '整體。'),
      },
    ];
    const nodes = texts(renderAnswerKey(withFlow(createWorksheet(), [question], { replaceLayout: true }), 'en'));
    const rows = nodes.slice(1).map((node) => [node.style, plain(node.text.en), node.marks]);
    expect(rows).toEqual([
      ['Question Stem', 'Question 1', undefined],
      ['Sub-question', '(a)', 3],
      ['Marking Scheme', 'Qd = Qs.', undefined],
      ['Sub-question', '(b)', undefined],
      ['Sub-sub-question', '(i)', 2],
      ['Marking Scheme', 'Income.', undefined],
      // Zero is a mark; it prints.
      ['Sub-sub-question', '(ii)', 0],
      ['Marking Scheme', 'Overall.', undefined],
    ]);
  });

  it('prints nothing for absent marks, and a shared label on the last sub-part', () => {
    const question: StructuredQuestion = createStructuredQuestion();
    question.parts = [
      { id: newId(), blocks: [] },
      {
        id: newId(),
        blocks: [],
        marks: 5,
        subParts: [
          { id: newId(), blocks: [] },
          { id: newId(), blocks: [] },
        ],
      },
    ];
    const labels = texts(renderAnswerKey(withFlow(createWorksheet(), [question], { replaceLayout: true }), 'en'))
      .filter((node) => node.style !== 'Worksheet Title')
      .map((node) => [plain(node.text.en), node.marks]);
    expect(labels).toEqual([
      ['Question 1', undefined],
      ['(a)', undefined],
      ['(b)', undefined],
      ['(i)', undefined],
      ['(ii)', 5],
    ]);
  });

  it('prints numbers, letters and markers once in bilingual mode', () => {
    const nodes = renderAnswerKey(buildAcceptanceWorksheet(), 'bilingual');
    const [grid] = grids(nodes);
    expect(grid.rows[0][0].text).toEqual({ en: [{ text: '1' }], zh: [] });
    const label = texts(nodes).find((node) => node.style === 'Sub-question')!;
    expect(label.text).toEqual({ en: [{ text: '(a)' }], zh: [] });
    // In one language the neutral text is on both sides, so the side shown is never empty.
    const zh = renderAnswerKey(buildAcceptanceWorksheet(), 'zh');
    expect(plain(grids(zh)[0].rows[0][1].text.zh)).toBe('C');
  });

  it('titles the key in both languages from the printed title', () => {
    const [title] = texts(renderAnswerKey(buildAcceptanceWorksheet(), 'bilingual'));
    expect(title.style).toBe('Worksheet Title');
    expect(plain(title.text.en)).toBe('S5 Economics Test — Answer key');
    expect(plain(title.text.zh)).toBe('中五經濟科測驗 — 答案及評分參考');
  });
});

describe('answer key .docx', () => {
  async function unzip(language: 'en' | 'zh' | 'bilingual') {
    const zip = await JSZip.loadAsync(await exportAnswerKeyDocxBuffer(buildAcceptanceWorksheet(), language));
    const read = async (path: string) => {
      const file = zip.file(path);
      if (!file) throw new Error(`Missing part: ${path}`);
      return file.async('string');
    };
    return { zip, read };
  }

  it('is a complete package with the grid letters and the scheme in it', async () => {
    const { zip, read } = await unzip('en');
    for (const path of [
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
      'word/styles.xml',
      'word/numbering.xml',
      'word/settings.xml',
      'word/fontTable.xml',
      'word/footer1.xml',
      'word/_rels/document.xml.rels',
      'docProps/core.xml',
    ]) {
      expect(zip.file(path), path).toBeTruthy();
    }
    // No header part and no cover: the key carries only a page number.
    expect(zip.file('word/header1.xml')).toBeNull();

    const document = await read('word/document.xml');
    expect(document).toContain('<w:tbl>');
    const cells = [...document.matchAll(/<w:tc>.*?<\/w:tc>/g)].map((m) =>
      [...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((t) => t[1]).join(''),
    );
    expect(cells.slice(0, 10)).toEqual(['1', 'C', '2', 'C', '3', 'C', '4', 'C', '5', 'C']);
    expect(document).toContain('S5 Economics Test — Answer key');
    expect(document).toContain('Shortage results.');
    expect(document).toContain('(5 marks)');
    expect(document).not.toContain('答案及評分參考');
    expect(await read('word/footer1.xml')).toContain(' PAGE ');
    expect(await read('docProps/core.xml')).toContain('S5 Economics Test — Answer key');
  });

  it('follows the language mode', async () => {
    const zh = await (await unzip('zh')).read('word/document.xml');
    expect(zh).toContain('中五經濟科測驗 — 答案及評分參考');
    expect(zh).toContain('造成短缺。');
    expect(zh).not.toContain('Shortage results.');

    const both = await (await unzip('bilingual')).read('word/document.xml');
    expect(both).toContain('Shortage results.');
    expect(both).toContain('造成短缺。');
  });

  it('takes the paper’s page setup and never its header, bands or cover', () => {
    const worksheet = buildAcceptanceWorksheet();
    worksheet.pageSetup = { ...worksheet.pageSetup!, orientation: 'landscape' };
    const parts = buildAnswerKeyDocxParts(worksheet, 'en');
    expect(parts.documentXml).toContain('w:orient="landscape"');
    expect(parts.headerFooter.header).toBeUndefined();
    expect(parts.documentXml).not.toContain('headerReference');
  });

  it('names the file apart from both papers', () => {
    const worksheet = buildAcceptanceWorksheet();
    const key = answerKeyFileName(worksheet, 'bilingual');
    expect(key).toBe('S5 Economics Test (Answer key) (Bilingual).docx');
    expect(key).not.toBe(docxFileName(worksheet, { language: 'bilingual', version: 'teacher' }));
  });
});
