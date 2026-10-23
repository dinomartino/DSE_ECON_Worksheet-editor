import { describe, expect, it } from 'vitest';
// The registry loads first: the modules below reach back into it and need it whole.
import '@/registry';
import { renderToStaticMarkup } from 'react-dom/server';
import { questionPreviewHtml } from '@/components/bank/page/questionPreview';
import { NodeView } from '@/components/preview/Preview';
import { thumbnailHtml } from '@/components/start/thumbnail';
import { questionClipboardHtml, worksheetClipboardHtml } from '@/export/clipboard';
import { buildDocxParts } from '@/export/docx';
import { createTableBlock } from '@/model/factories';
import { createWorksheetFrom, type DocumentType } from '@/model/newWorksheet';
import { bi, rt } from '@/model/text';
import type { LanguageMode, McqQuestion, OutputMode, Question, StructuredQuestion, Worksheet } from '@/model/types';
import { BLANK_LINE_PT, type RenderNode } from '@/render/ir';
import { renderWorksheet } from '@/render/worksheet';

/**
 * Space between questions reaches every surface through the first paragraph of the question
 * below (`withLeadingGap`: `spaceBefore` on the IR node), so the page, the start screen's card,
 * Copy for Word and the `.docx` cannot disagree about it. These prove it on the real renderers,
 * for a classroom worksheet of MC questions, one of structured questions, and a booklet:
 *
 *  - three lines (36 pt, 720 twips) above the second question on each surface, and the plain
 *    default (one line) where nobody chose;
 *  - the same in English, 中文 and both languages;
 *  - the question that opens a sheet sheds it in the `.docx`, as the page does;
 *  - the case a teacher can be surprised by: a question that begins with a table.
 *
 * The page rail's thumbnails are clones of the preview sheet in the browser (`PageThumb.tsx`), so
 * they show whatever the page test shows; the clone itself is checked in a browser
 * (`scripts/question-gap-verify.mjs`).
 */

const EN: OutputMode = { language: 'en', version: 'student' };
const LINES = 3;
const POINTS = LINES * BLANK_LINE_PT;
const TWIPS = POINTS * 20;

const mcq = (id: string): McqQuestion => ({
  id,
  type: 'mcq',
  blocks: [{ id: `${id}-b`, kind: 'paragraph', text: { en: rt(`Stem of ${id}`), zh: rt(`${id} 題幹`) } }],
  options: ['one', 'two', 'three', 'four'].map((text, i) => ({ id: `${id}-o${i}`, text: { en: rt(text), zh: rt(`選${i}`) } })),
  answerIndex: 0,
  marks: 1,
});

const structured = (id: string, extra: Partial<StructuredQuestion> = {}): StructuredQuestion => ({
  id,
  type: 'structured',
  blocks: [{ id: `${id}-b`, kind: 'paragraph', text: { en: rt(`Stem of ${id}`), zh: rt(`${id} 題幹`) } }],
  parts: [{ id: `${id}-p`, blocks: [{ id: `${id}-pb`, kind: 'paragraph', text: bi(`Part of ${id}`, `${id} 分題`) }], marks: 2 }],
  ...extra,
});

function paper(documentType: DocumentType, questions: Question[], extra: Partial<Worksheet> = {}): Worksheet {
  return {
    ...createWorksheetFrom({ documentType, seedSample: false }),
    questions,
    layout: [],
    flow: questions.map((q) => ({ type: 'question' as const, id: q.id })),
    ...extra,
  } as Worksheet;
}

/** A paper of three like questions, with three lines asked for between them (or no number at all). */
interface Case {
  name: string;
  make: (extra?: Partial<Worksheet>) => Worksheet;
  /** The id of the second question, whose first paragraph carries the gap. */
  second: string;
  /** Whether the start screen's card shows the body (a booklet's card is its cover). */
  cardShowsBody: boolean;
}
const CASES: Case[] = [
  { name: 'classroom MC', make: (e) => paper('classroom', [mcq('a'), mcq('b'), mcq('c')], e), second: 'b', cardShowsBody: true },
  { name: 'classroom structured', make: (e) => paper('classroom', [structured('a'), structured('b'), structured('c')], e), second: 'b', cardShowsBody: true },
  { name: 'booklet', make: (e) => paper('lqMock', [structured('a'), structured('b'), structured('c')], e), second: 'b', cardShowsBody: false },
];

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;
const textNodes = (nodes: RenderNode[]) => nodes.filter((node) => node.kind === 'text');

describe.each(CASES)('three lines between questions on a $name', ({ make, second, cardShowsBody }) => {
  const asked = make({ examGapLines: LINES });
  const unasked = make();

  it('puts the gap on the second question’s first paragraph in the IR, and on no other question', () => {
    const rendered = renderWorksheet(asked, EN);
    const first = (id: string) => {
      const node = rendered.questions.find((q) => q.questionId === id)!.nodes[0];
      return node.kind === 'text' ? node : undefined;
    };
    expect(first(second)?.format?.spaceBefore).toBe(POINTS);
    expect(first(second)?.boundaryGap).toBe(true);
    // The first question has nothing above it to widen; the third is under the second, a like
    // question, so it is widened too.
    expect(first('a')?.format?.spaceBefore ?? 0).toBeLessThanOrEqual(BLANK_LINE_PT);
    expect(first('c')?.format?.spaceBefore).toBe(POINTS);
  });

  it('draws it on the page as the question’s top margin, marked as a gap that dies at a sheet top', () => {
    const rendered = renderWorksheet(asked, EN);
    const stem = textNodes(rendered.questions.find((q) => q.questionId === second)!.nodes)[0];
    const markup = renderToStaticMarkup(<NodeView node={stem} language="en" />);
    expect(markup).toContain(`margin-top:${POINTS}pt`);
    expect(markup).toContain('data-gap-carrier');
  });

  it('writes it into the .docx as space before that paragraph, twice in all (the second and third question)', () => {
    const xml = buildDocxParts(asked, EN).documentXml;
    expect(count(xml, new RegExp(`<w:spacing w:before="${TWIPS}" w:line="240" w:lineRule="exact"/>`, 'g'))).toBe(2);
  });

  it('copies it to Word as a top margin on the question’s first paragraph', () => {
    const whole = worksheetClipboardHtml(asked, EN);
    expect(count(whole, new RegExp(`margin-top:${POINTS}pt;`, 'g'))).toBe(2);
    // Copying one question carries the gap it has on the page, as it always has.
    expect(questionClipboardHtml(asked, second, EN)).toContain(`margin-top:${POINTS}pt;`);
    expect(questionClipboardHtml(asked, 'a', EN)).not.toContain(`margin-top:${POINTS}pt;`);
  });

  // A booklet's card is its cover, which carries no questions.
  if (cardShowsBody) {
    it('shows it on the start screen’s card', async () => {
      expect(count(await thumbnailHtml(asked), new RegExp(`margin-top:${POINTS}pt;`, 'g'))).toBe(2);
    });
  }

  it('shows none in the bank’s preview of the question alone, which has nothing above it', () => {
    const preview = questionPreviewHtml(asked, second, 'en', 'student')!;
    expect(preview.html).not.toContain(`margin-top:${POINTS}pt;`);
  });

  it('prints one line, as before, where nobody chose a number', () => {
    const xml = buildDocxParts(unasked, EN).documentXml;
    expect(xml).not.toContain(`w:before="${TWIPS}"`);
    expect(worksheetClipboardHtml(unasked, EN)).not.toContain(`margin-top:${POINTS}pt;`);
    const rendered = renderWorksheet(unasked, EN);
    for (const q of rendered.questions.slice(1)) {
      const node = q.nodes[0];
      expect(node.kind === 'text' && node.format?.spaceBefore).toBe(BLANK_LINE_PT);
    }
  });

  it.each<LanguageMode>(['en', 'zh', 'bilingual'])('is the same in the %s edition', (language) => {
    const mode: OutputMode = { language, version: 'student' };
    const rendered = renderWorksheet(asked, mode);
    const node = rendered.questions.find((q) => q.questionId === second)!.nodes[0];
    expect(node.kind === 'text' && node.format?.spaceBefore).toBe(POINTS);
    expect(buildDocxParts(asked, mode).documentXml).toContain(`w:before="${TWIPS}"`);
    expect(worksheetClipboardHtml(asked, mode)).toContain(`margin-top:${POINTS}pt;`);
  });

  it('is shed by the question that opens a sheet in the .docx, as the page sheds it', () => {
    const xml = buildDocxParts(asked, EN, new Map(), [{ key: second, node: 0 }]).documentXml;
    // Question c is still under b; b opens a sheet, so only c keeps its three lines.
    expect(count(xml, new RegExp(`w:before="${TWIPS}"`, 'g'))).toBe(1);
  });

  it('gives a question its own number over the paper’s on every surface', () => {
    const own = make({ examGapLines: LINES });
    own.questions = own.questions.map((q) => (q.id === second ? { ...q, gapBefore: 5 } : q));
    const node = renderWorksheet(own, EN).questions.find((q) => q.questionId === second)!.nodes[0];
    expect(node.kind === 'text' && node.format?.spaceBefore).toBe(5 * BLANK_LINE_PT);
    expect(buildDocxParts(own, EN).documentXml).toContain(`w:before="${5 * 240}"`);
    expect(worksheetClipboardHtml(own, EN)).toContain(`margin-top:${5 * BLANK_LINE_PT}pt;`);
  });
});

describe('a question that begins with a table', () => {
  // The question's number is its own paragraph, ahead of any stem block, so a table-first stem
  // still has a paragraph to carry the gap: it dies at the top of a sheet like any other.
  it('carries the gap on its numbered line, ahead of the table', () => {
    const tableFirst: StructuredQuestion = { ...structured('b'), blocks: [createTableBlock(2, 2)] };
    const rendered = renderWorksheet(paper('classroom', [structured('a'), tableFirst], { examGapLines: LINES }), EN);
    const nodes = rendered.questions[1].nodes;
    expect(nodes[0].kind).toBe('text');
    expect(nodes[0].kind === 'text' && nodes[0].format?.spaceBefore).toBe(POINTS);
    expect(nodes[0].kind === 'text' && nodes[0].boundaryGap).toBe(true);
    expect(nodes.some((node) => node.kind === 'table')).toBe(true);
    // And the .docx sheds it when the question opens a sheet.
    const worksheet = paper('classroom', [structured('a'), tableFirst], { examGapLines: LINES });
    expect(buildDocxParts(worksheet, EN).documentXml).toContain(`w:before="${TWIPS}"`);
    expect(buildDocxParts(worksheet, EN, new Map(), [{ key: 'b', node: 0 }]).documentXml).not.toContain(`w:before="${TWIPS}"`);
  });
});
