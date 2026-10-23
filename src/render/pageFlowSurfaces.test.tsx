import { describe, expect, it } from 'vitest';
// The registry loads first: the modules below reach back into it and need it whole.
import '@/registry';
import { questionPreviewHtml } from '@/components/bank/page/questionPreview';
import { keptTogetherOf, startsSheetOf } from '@/components/preview/flowFlags';
import { packPages, pageStarts, type PackItem } from '@/components/preview/pagination';
import { thumbnailHtml } from '@/components/start/thumbnail';
import { CLIPBOARD_PAGE_BREAK, questionClipboardHtml, worksheetClipboardHtml } from '@/export/clipboard';
import { buildDocxParts } from '@/export/docx';
import { createStimulusElement } from '@/model/flow';
import { createWorksheetFrom, type DocumentType } from '@/model/newWorksheet';
import { bi, rt } from '@/model/text';
import type { LanguageMode, LayoutElement, McqQuestion, OutputMode, Question, StructuredQuestion, Worksheet } from '@/model/types';
import { renderWorksheet, type RenderedItem } from '@/render/worksheet';

/**
 * "Start on a new page" reaches every surface from one mark on the walker's output
 * (`startsPage`, § `sheetOpeners`):
 *
 *  - the page and the page rail pack sheets from it (`startsSheetOf` → `PackItem.startsSheet`);
 *  - the `.docx` has no code of its own: it breaks where the preview's sheets break, so the
 *    sheet the paginator opens is a page break at the end of the paragraph before;
 *  - Copy for Word, which has no pages to measure, writes the break itself;
 *  - the start screen's card ends its first page at that break.
 *
 * The browser half (the real Preview measuring, the Export dialog, the rail) is
 * `scripts/page-flow-verify.mjs`.
 */

const EN: OutputMode = { language: 'en', version: 'student' };
const PAGE_BREAK_RUN = '<w:br w:type="page"/>';
const LINES = 3;
const TWIPS = LINES * 12 * 20;

const structured = (id: string, extra: Partial<StructuredQuestion> = {}): StructuredQuestion => ({
  id,
  type: 'structured',
  blocks: [{ id: `${id}-b`, kind: 'paragraph', text: { en: rt(`Stem of ${id}`), zh: rt(`${id} 題幹`) } }],
  parts: [{ id: `${id}-p`, blocks: [{ id: `${id}-pb`, kind: 'paragraph', text: bi(`Part of ${id}`, `${id} 分題`) }], marks: 2 }],
  ...extra,
});

const mcq = (id: string, extra: Partial<McqQuestion> = {}): McqQuestion => ({
  id,
  type: 'mcq',
  blocks: [{ id: `${id}-b`, kind: 'paragraph', text: { en: rt(`Stem of ${id}`), zh: rt(`${id} 題幹`) } }],
  options: ['one', 'two', 'three', 'four'].map((text, i) => ({ id: `${id}-o${i}`, text: { en: rt(text), zh: rt(`選${i}`) } })),
  answerIndex: 0,
  marks: 1,
  ...extra,
});

const section = (): LayoutElement => ({ id: 'sec', kind: 'section', text: bi('Section B', '乙部'), restartNumbering: false });
const pageBreak = (): LayoutElement => ({ id: 'brk', kind: 'pageBreak' });

const isLayout = (item: Question | LayoutElement): item is LayoutElement => 'kind' in item;
function paper(items: Array<Question | LayoutElement>, documentType: DocumentType = 'classroom', extra: Partial<Worksheet> = {}): Worksheet {
  return {
    ...createWorksheetFrom({ documentType, seedSample: false }),
    questions: items.filter((item): item is Question => !isLayout(item)),
    layout: items.filter(isLayout),
    flow: items.map((item) => ({ type: isLayout(item) ? ('layout' as const) : ('question' as const), id: item.id })),
    ...extra,
  } as Worksheet;
}

const keyOf = (item: RenderedItem) => (item.type === 'question' ? item.question.questionId : item.layout.elementId);

/**
 * The sheet starts the real paginator would hand the `.docx` for this paper, if every item were
 * a third of a sheet tall: the walker's marks through `startsSheetOf` into `packPages`, exactly
 * the glue `Preview` uses.
 */
function startsOf(worksheet: Worksheet, mode: OutputMode = EN, each = 30) {
  const blocks: PackItem[] = renderWorksheet(worksheet, mode).items.map((item) => {
    // A New page element is a forced break that takes no room, as `Preview` packs it.
    const manual = item.type === 'layout' && item.layout.nodes.some((node) => node.kind === 'pageBreak');
    return {
      key: keyOf(item),
      ...(manual ? { forceBreak: true, breakId: keyOf(item) } : {}),
      ...(startsSheetOf(item) ? { startsSheet: true } : {}),
    };
  });
  const heights = new Map(blocks.map((block) => [block.key, block.forceBreak ? 0 : each]));
  return pageStarts(packPages(blocks, heights, 100));
}

const docx = (worksheet: Worksheet, mode: OutputMode = EN, starts = startsOf(worksheet, mode)) =>
  buildDocxParts(worksheet, mode, new Map(), starts).documentXml;
const count = (text: string, pattern: string | RegExp) =>
  (text.match(typeof pattern === 'string' ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') : pattern) ?? []).length;

describe.each<{
  name: string;
  documentType: DocumentType;
  make: (id: string, extra?: object) => Question;
  /** Whether the start screen's card shows the body (a booklet's card is its cover). */
  cardShowsBody: boolean;
}>([
  { name: 'a classroom worksheet of structured questions', documentType: 'classroom', make: structured, cardShowsBody: true },
  { name: 'a classroom worksheet of MC questions', documentType: 'classroom', make: mcq, cardShowsBody: true },
  { name: 'a booklet', documentType: 'lqMock', make: structured, cardShowsBody: false },
])('a question that starts a new page on $name', ({ documentType, make, cardShowsBody }) => {
  const asked = paper([make('a'), make('b', { startOnNewPage: true }), make('c')], documentType, { examGapLines: LINES });
  const unasked = paper([make('a'), make('b'), make('c')], documentType, { examGapLines: LINES });

  it('opens a sheet at that question in the paginator, and nowhere else', () => {
    expect(startsOf(asked)).toEqual([{ key: 'b', node: 0 }]);
    expect(startsOf(unasked)).toEqual([]);
  });

  it('writes a page break into the .docx, at the end of the paragraph before the question, not a paragraph of its own', () => {
    const xml = docx(asked);
    expect(count(xml, PAGE_BREAK_RUN)).toBe(1);
    const at = xml.indexOf(PAGE_BREAK_RUN);
    expect(xml.slice(0, at)).toContain('Stem of a');
    expect(xml.slice(0, at)).not.toContain('Stem of b');
    expect(xml.slice(at)).toContain('Stem of b');
    // Riding on a line that exists spends no line of its own, so a full sheet cannot spill a blank page.
    expect(xml).not.toContain(`<w:p>${PAGE_BREAK_RUN.replace('<w:r>', '<w:r>')}</w:p>`);
    expect(xml).not.toContain(`<w:p><w:r>${PAGE_BREAK_RUN}</w:r></w:p>`);
  });

  it('puts no air above the question that opens the page in the .docx, though the paper asks for three lines', () => {
    // Between a and b nothing; between b and c the three lines.
    expect(count(docx(asked), `w:before="${TWIPS}"`)).toBe(1);
    expect(count(docx(unasked), `w:before="${TWIPS}"`)).toBe(2);
  });

  it('writes no break of its own given no measured sheets: Word paginates alone, as for any paper', () => {
    expect(count(docx(asked, EN, []), PAGE_BREAK_RUN)).toBe(0);
  });

  it('writes the break into Copy for Word, once, ahead of that question and no other', () => {
    const html = worksheetClipboardHtml(asked, EN);
    expect(count(html, CLIPBOARD_PAGE_BREAK)).toBe(1);
    const at = html.indexOf(CLIPBOARD_PAGE_BREAK);
    expect(html.slice(0, at)).toContain('Stem of a');
    expect(html.slice(0, at)).not.toContain('Stem of b');
    expect(html.slice(at)).toContain('Stem of b');
    expect(html.slice(at)).toContain("page-break-before:always");
    expect(worksheetClipboardHtml(unasked, EN)).not.toContain(CLIPBOARD_PAGE_BREAK);
  });

  it('leaves the air above it out of Copy for Word too: the paste has the break, not the gap', () => {
    const pt = LINES * 12;
    expect(count(worksheetClipboardHtml(asked, EN), `margin-top:${pt}pt;`)).toBe(1);
    expect(count(worksheetClipboardHtml(unasked, EN), `margin-top:${pt}pt;`)).toBe(2);
  });

  it('copies the question alone without a break, and previews it in the bank without one', () => {
    expect(questionClipboardHtml(asked, 'b', EN)).not.toContain(CLIPBOARD_PAGE_BREAK);
    const preview = questionPreviewHtml(asked, 'b', 'en', 'student')!;
    expect(preview.html).not.toContain(CLIPBOARD_PAGE_BREAK);
    expect(preview.html).not.toContain('page-break-before');
  });

  if (cardShowsBody) {
    it('ends the start screen’s card at that question, as the first sheet does', async () => {
      const html = await thumbnailHtml(asked);
      expect(html).toContain('Stem of a');
      expect(html).not.toContain('Stem of b');
      expect(html).not.toContain('Stem of c');
      const whole = await thumbnailHtml(unasked);
      expect(whole).toContain('Stem of b');
    });
  }

  it.each<LanguageMode>(['en', 'zh', 'bilingual'])('is the same in the %s edition', (language) => {
    const mode: OutputMode = { language, version: 'student' };
    expect(startsOf(asked, mode)).toEqual([{ key: 'b', node: 0 }]);
    expect(count(docx(asked, mode), PAGE_BREAK_RUN)).toBe(1);
    expect(count(worksheetClipboardHtml(asked, mode), CLIPBOARD_PAGE_BREAK)).toBe(1);
  });
});

describe('a heading that travels with the question', () => {
  const asked = paper([structured('a'), section(), structured('b', { startOnNewPage: true })]);

  it('opens the sheet at the heading, so the page never ends on a heading with its question gone', () => {
    expect(startsOf(asked)).toEqual([{ key: 'sec', node: 0 }]);
  });

  it('breaks the .docx before the heading and not between it and the question', () => {
    const xml = docx(asked);
    expect(count(xml, PAGE_BREAK_RUN)).toBe(1);
    const at = xml.indexOf(PAGE_BREAK_RUN);
    expect(xml.slice(0, at)).toContain('Stem of a');
    expect(xml.slice(0, at)).not.toContain('Section B');
    expect(xml.slice(at)).toContain('Section B');
    expect(xml.slice(at)).toContain('Stem of b');
  });

  it('writes Copy for Word’s break before the heading too', () => {
    const html = worksheetClipboardHtml(asked, EN);
    expect(count(html, CLIPBOARD_PAGE_BREAK)).toBe(1);
    const at = html.indexOf(CLIPBOARD_PAGE_BREAK);
    expect(html.slice(0, at)).not.toContain('Section B');
    expect(html.slice(at)).toContain('Section B');
  });
});

describe('where the page already begins', () => {
  it('writes one break under a New page break, the element’s own', () => {
    const w = paper([structured('a'), pageBreak(), structured('b', { startOnNewPage: true })]);
    expect(count(worksheetClipboardHtml(w, EN), CLIPBOARD_PAGE_BREAK)).toBe(1);
    // The element's break is in the file; the paginator opens no second sheet for the question.
    expect(startsOf(w)).toEqual([]);
    expect(count(docx(w), PAGE_BREAK_RUN)).toBe(1);
  });

  it('writes none for the first question', () => {
    const w = paper([structured('a', { startOnNewPage: true }), structured('b')]);
    expect(worksheetClipboardHtml(w, EN)).not.toContain(CLIPBOARD_PAGE_BREAK);
    expect(startsOf(w)).toEqual([]);
    expect(count(docx(w), PAGE_BREAK_RUN)).toBe(0);
  });

  it('writes none on a paper nobody set it on', () => {
    const w = paper([structured('a'), section(), structured('b'), mcq('c'), { ...createStimulusElement(), id: 'stim' }, mcq('d')]);
    expect(worksheetClipboardHtml(w, EN)).not.toContain(CLIPBOARD_PAGE_BREAK);
    // Small enough to share one sheet: the paginator opens none of its own.
    expect(startsOf(w, EN, 10)).toEqual([]);
    expect(count(docx(w, EN, startsOf(w, EN, 10)), PAGE_BREAK_RUN)).toBe(0);
  });
});

describe('a question kept on one page', () => {
  it('reaches the paginator as a mark, and nothing else changes in what a backend writes', () => {
    const asked = paper([structured('a'), structured('b', { keepOnOnePage: true })]);
    const unasked = paper([structured('a'), structured('b')]);
    const items = renderWorksheet(asked, EN).items;
    expect(items.map(keptTogetherOf)).toEqual([false, true]);
    // The .docx and Copy for Word carry no keep flag (the file breaks where the sheets do), so the
    // choice changes the pages, never the bytes of a paper the sheets do not move.
    expect(buildDocxParts(asked, EN).documentXml).toBe(buildDocxParts(unasked, EN).documentXml);
    expect(worksheetClipboardHtml(asked, EN)).toBe(worksheetClipboardHtml(unasked, EN));
    expect(buildDocxParts(asked, EN).documentXml).not.toContain('w:keepNext');
    expect(buildDocxParts(asked, EN).documentXml).not.toContain('w:keepLines');
  });
});
