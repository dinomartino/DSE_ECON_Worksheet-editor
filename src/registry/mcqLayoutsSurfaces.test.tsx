import { describe, expect, it } from 'vitest';
// The registry loads first: the modules below reach back into it and need it whole.
import '@/registry';
import JSZip from 'jszip';
import { renderToStaticMarkup } from 'react-dom/server';
import { questionPreviewHtml } from '@/components/bank/page/questionPreview';
import { NodeView } from '@/components/preview/Preview';
import { thumbnailHtml } from '@/components/start/thumbnail';
import { questionClipboardHtml, worksheetClipboardHtml } from '@/export/clipboard';
import { exportDocxBuffer } from '@/export/docx';
import { contentWidth, pageSetupOf } from '@/model/page';
import type { LanguageMode, McqOptionLayout, McqQuestion, OutputMode, Worksheet } from '@/model/types';
import type { RenderNode } from '@/render/ir';
import { renderWorksheet } from '@/render/worksheet';
import { buildOptionLayoutPaper, type OptionLayoutPaper } from '@/test/optionLayoutFixture';
import { OPTION_LAYOUT_CHOICES, withOptionLayouts, type OptionLayoutChoice } from './mcqLayouts';

/**
 * Setup → Option layout for all MC questions reaches every surface through the question's own
 * `optionLayout`, the field its panel writes, so the page, the thumbnails, the `.docx` and Copy
 * for Word cannot disagree about it (`mcqLayouts.ts`). These prove it on the real renderers:
 *
 *  - what each layout looks like on each surface (the page, the start screen's card, the bank's
 *    preview, the `.docx`, the clipboard), and that they agree where the stops sit;
 *  - that a paper set by the bulk action prints exactly as one whose questions were set by hand;
 *  - the two cases a teacher can be surprised by: options too long for a row (a grid) and
 *    figure options (never in a row).
 *
 * The page rail's thumbnails are clones of the preview sheet in the browser (`PageThumb.tsx`), so
 * they show whatever the page test below shows; the clone itself is checked in a browser.
 */

const EN: OutputMode = { language: 'en', version: 'student' };
const BILINGUAL: OutputMode = { language: 'bilingual', version: 'student' };

/** What each choice should leave on the sample paper's four MC questions, written out by hand. */
const BY_HAND: Record<OptionLayoutChoice, McqOptionLayout[]> = {
  stacked: ['stacked', 'stacked', 'stacked', 'stacked'],
  inline: ['inline', 'inline', 'inline', 'stacked'], // figure options stay put
  columns2: ['columns2', 'columns2', 'columns2', 'columns2'],
  fit: ['inline', 'columns2', 'stacked', 'columns2'],
};

/** The paper with `layouts` written on its MC questions one by one, as each question's panel writes them. */
function setByHand(worksheet: Worksheet, layouts: McqOptionLayout[]): Worksheet {
  let next = 0;
  return {
    ...worksheet,
    questions: worksheet.questions.map((question) =>
      question.type === 'mcq' ? { ...question, optionLayout: layouts[next++] } : question,
    ),
  };
}

/** A paper of just this question, as the sample paper's page one would be. */
function onlyQuestion(paper: OptionLayoutPaper, question: McqQuestion): Worksheet {
  return { ...paper.worksheet, questions: [question], layout: [], flow: [{ type: 'question', id: question.id }] };
}

/** The nodes that lay out options (and their figures); the stem and the gap above them are not the option layout's. */
const optionNodes = (worksheet: Worksheet, mode: OutputMode = EN): RenderNode[] =>
  renderWorksheet(worksheet, mode).questions.flatMap((question) =>
    question.nodes.filter(
      (node) => node.kind === 'optionRow' || node.kind === 'image' || ((node.kind === 'text' || node.kind === 'columns') && node.style === 'MCQ Option'),
    ),
  );

const pageMarkup = (worksheet: Worksheet, mode: OutputMode = EN): string[] =>
  optionNodes(worksheet, mode).map((node) => renderToStaticMarkup(<NodeView node={node} language={mode.language} />));

async function documentXml(worksheet: Worksheet, mode: OutputMode = EN): Promise<string> {
  const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, mode, new Map()));
  return zip.file('word/document.xml')!.async('string');
}

/** Every MCQOption paragraph in the `.docx`, in order. */
const docxOptionParagraphs = (xml: string): string[] =>
  [...xml.matchAll(/<w:p>(?:(?!<\/w:p>)[\s\S])*?<w:pStyle w:val="MCQOption"\/>[\s\S]*?<\/w:p>/g)].map((match) => match[0]);

/** The tab stops of one `.docx` paragraph, in twips. */
const docxStops = (paragraph: string): number[] =>
  [...paragraph.matchAll(/<w:tab w:val="left" w:pos="(\d+)"\/>/g)].map((match) => Number(match[1]));

/** The `tab-stops:` paragraphs of some clipboard-built HTML, each as its stops in twips. */
function htmlRows(html: string): number[][] {
  return [...html.matchAll(/<p style="[^"]*tab-stops:([^;"]*);/g)].map((match) =>
    match[1].split(' ').filter(Boolean).map((stop) => Math.round(parseFloat(stop) * 20)),
  );
}

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

describe('what each layout looks like', () => {
  const paper = buildOptionLayoutPaper();
  const sheet = (layout: McqOptionLayout) => withOptionLayouts(onlyQuestion(paper, paper.short), layout, 'en');

  it('stacked: one option to a line', async () => {
    const worksheet = sheet('stacked');
    const ir = optionNodes(worksheet);
    expect(ir.map((node) => node.kind)).toEqual(['text', 'text', 'text', 'text']);

    const page = pageMarkup(worksheet);
    expect(page).toHaveLength(4);
    for (const row of page) expect(row).toContain('data-tab-host');

    const xml = docxOptionParagraphs(await documentXml(worksheet));
    expect(xml).toHaveLength(4);
    for (const paragraph of xml) {
      expect(paragraph).toContain('<w:numPr>'); // the lettering is Word's own list
      expect(paragraph).not.toContain('<w:tabs>');
    }

    const clipboard = questionClipboardHtml(worksheet, paper.short.id, EN)!;
    expect(htmlRows(clipboard)).toEqual([]);
    expect(clipboard).toContain('A.&nbsp;(1) only');
    expect(clipboard).toContain('D.&nbsp;(1), (2) and (3)');
  });

  it('in a row: all four on one line, three stops across the width', async () => {
    const worksheet = sheet('inline');
    const ir = optionNodes(worksheet);
    expect(ir.map((node) => node.kind)).toEqual(['columns']);
    expect(ir[0].kind === 'columns' && ir[0].cells).toHaveLength(4);

    const page = pageMarkup(worksheet);
    expect(page).toHaveLength(1);
    expect(count(page[0], /flex:0 0 25%/g)).toBe(3);

    const xml = docxOptionParagraphs(await documentXml(worksheet));
    expect(xml).toHaveLength(1);
    expect(docxStops(xml[0])).toHaveLength(3);
    expect(count(xml[0], /<w:tab\/>/g)).toBe(3);
    expect(xml[0]).not.toContain('<w:numPr>'); // a row of tab stops, so the letters are text

    const clipboard = questionClipboardHtml(worksheet, paper.short.id, EN)!;
    expect(htmlRows(clipboard)).toEqual([docxStops(xml[0])]);
  });

  it('in 2 columns: two rows of two, one stop each', async () => {
    const worksheet = sheet('columns2');
    const ir = optionNodes(worksheet);
    expect(ir.map((node) => node.kind)).toEqual(['columns', 'columns']);
    for (const row of ir) expect(row.kind === 'columns' && row.cells).toHaveLength(2);

    const page = pageMarkup(worksheet);
    expect(page).toHaveLength(2);
    for (const row of page) expect(count(row, /flex:0 0 50%/g)).toBe(1);

    const xml = docxOptionParagraphs(await documentXml(worksheet));
    expect(xml).toHaveLength(2);
    expect(xml.map(docxStops).map((stops) => stops.length)).toEqual([1, 1]);

    const clipboard = questionClipboardHtml(worksheet, paper.short.id, EN)!;
    expect(htmlRows(clipboard)).toEqual(xml.map(docxStops));
  });

  it('puts the stops where the rest of the paper puts them: quarters of the width after the option indent, or the middle', async () => {
    const width = contentWidth(pageSetupOf(paper.worksheet));
    const at = (fraction: number) => Math.round(480 + fraction * (width - 480));
    const [row] = docxOptionParagraphs(await documentXml(sheet('inline'))).map(docxStops);
    const [pair] = docxOptionParagraphs(await documentXml(sheet('columns2'))).map(docxStops);
    expect(row).toEqual([at(0.25), at(0.5), at(0.75)]);
    expect(pair).toEqual([at(0.5)]);
  });
});

describe('the start screen’s card and the bank’s preview', () => {
  const paper = buildOptionLayoutPaper();
  const worksheet = (layout: McqOptionLayout) => withOptionLayouts(onlyQuestion(paper, paper.short), layout, 'en');
  /** How many tab-stop rows each draws for the one question. */
  const rows = async (layout: McqOptionLayout) => {
    const ws = worksheet(layout);
    const card = htmlRows(await thumbnailHtml(ws));
    const bank = htmlRows(questionPreviewHtml(ws, paper.short.id, 'en', 'student')!.html);
    return { card, bank, clipboard: htmlRows(questionClipboardHtml(ws, paper.short.id, EN)!) };
  };

  it('draw stacked options as plain lines', async () => {
    expect(await rows('stacked')).toEqual({ card: [], bank: [], clipboard: [] });
  });

  it('draw a row as one line of four cells', async () => {
    const { card, bank, clipboard } = await rows('inline');
    expect(clipboard).toHaveLength(1);
    expect(clipboard[0]).toHaveLength(3);
    expect(card).toEqual(clipboard);
    expect(bank).toEqual(clipboard);
    // The card lays a row out by the cells' widths (`--w`), since a thumbnail has no tab stops.
    expect(count(await thumbnailHtml(worksheet('inline')), /--w:25\.000%/g)).toBe(3);
  });

  it('draw 2 columns as two lines of two', async () => {
    const { card, bank, clipboard } = await rows('columns2');
    expect(clipboard).toHaveLength(2);
    expect(card).toEqual(clipboard);
    expect(bank).toEqual(clipboard);
    expect(count(await thumbnailHtml(worksheet('columns2')), /--w:50\.000%/g)).toBe(2);
  });
});

describe('a paper set by the bulk action prints as one set by hand', () => {
  const choices = OPTION_LAYOUT_CHOICES as readonly OptionLayoutChoice[];

  it.each(choices.map((choice) => [choice] as const))('%s: the same on the page, the card, the bank, the clipboard and in Word', async (choice) => {
    const base = buildOptionLayoutPaper().worksheet;
    const bulk = withOptionLayouts(base, choice, 'en');
    const hand = setByHand(base, BY_HAND[choice]);

    expect(JSON.stringify(optionNodes(bulk))).toBe(JSON.stringify(optionNodes(hand)));
    expect(pageMarkup(bulk)).toEqual(pageMarkup(hand));
    expect(await thumbnailHtml(bulk)).toBe(await thumbnailHtml(hand));
    for (const question of base.questions) {
      expect(questionPreviewHtml(bulk, question.id, 'en', 'student')).toEqual(
        questionPreviewHtml(hand, question.id, 'en', 'student'),
      );
    }
    expect(worksheetClipboardHtml(bulk, EN)).toBe(worksheetClipboardHtml(hand, EN));
    expect(await documentXml(bulk)).toBe(await documentXml(hand));
  });

  it('and each choice does change what prints, from the untouched paper', async () => {
    const base = buildOptionLayoutPaper().worksheet;
    const untouched = await documentXml(base);
    for (const choice of ['inline', 'columns2', 'fit'] as const) {
      expect(await documentXml(withOptionLayouts(base, choice, 'en'))).not.toBe(untouched);
    }
    // Stacked is what an untouched paper already is.
    expect(await documentXml(withOptionLayouts(base, 'stacked', 'en'))).toBe(untouched);
  });
});

describe('options too long for a row', () => {
  const paper = buildOptionLayoutPaper();
  const rowed = withOptionLayouts(onlyQuestion(paper, paper.long), 'inline', 'en');

  it('are stored in a row but print in a grid, in every backend', async () => {
    expect((rowed.questions[0] as McqQuestion).optionLayout).toBe('inline');

    const [node] = optionNodes(rowed);
    expect(node.kind).toBe('optionRow');
    expect(node.kind === 'optionRow' && node.textGrid?.perRow).toBe(2);

    const xml = await documentXml(rowed);
    expect(count(xml, /<w:tbl>/g)).toBe(1);
    expect(docxOptionParagraphs(xml)).toHaveLength(4);

    expect(questionClipboardHtml(rowed, paper.long.id, EN)).toContain('<table');
    expect(await thumbnailHtml(rowed)).toContain('<table');
    expect(questionPreviewHtml(rowed, paper.long.id, 'en', 'student')!.html).toContain('<table');
    expect(pageMarkup(rowed)[0]).toContain('items-start');
  });

  it('come back to a row, untouched, if shortened to fit: nothing was rewritten', () => {
    const shortened: McqQuestion = {
      ...(rowed.questions[0] as McqQuestion),
      options: paper.short.options,
    };
    const ws: Worksheet = { ...rowed, questions: [shortened] };
    expect(optionNodes(ws).map((node) => node.kind)).toEqual(['columns']);
  });
});

describe('figure options', () => {
  const paper = buildOptionLayoutPaper();
  const figureSheet = onlyQuestion(paper, paper.figures);

  it('stay stacked under "All in a row": a picture cannot sit in a tab-stop cell', async () => {
    const next = withOptionLayouts(figureSheet, 'inline', 'en');
    expect(next).toBe(figureSheet);
    const kinds = optionNodes(next).map((node) => node.kind);
    expect(kinds).toEqual(['text', 'image', 'text', 'image', 'text', 'image', 'text', 'image']);
    expect(count(await documentXml(next), /<w:tbl>/g)).toBe(0);
  });

  it('go two to a row, each picture under its letter, under "All 2 columns"', async () => {
    const next = withOptionLayouts(figureSheet, 'columns2', 'en');
    expect(optionNodes(next).map((node) => node.kind)).toEqual(['optionRow', 'optionRow']);

    // One layout table per row of two, in Word.
    expect(count(await documentXml(next), /<w:tbl>/g)).toBe(2);
    const clipboard = questionClipboardHtml(next, paper.figures.id, EN)!;
    expect(count(clipboard, /<table/g)).toBe(2);
    expect(count(clipboard, /<img/g)).toBe(4);
    expect(count(await thumbnailHtml(next), /<table/g)).toBe(2);
  });
});

describe('a bilingual paper', () => {
  it('prints a row as a grid: two languages cannot share one tab-stop line', async () => {
    const paper = buildOptionLayoutPaper();
    const rowed = withOptionLayouts(onlyQuestion(paper, paper.short), 'inline', 'bilingual' satisfies LanguageMode);
    expect((rowed.questions[0] as McqQuestion).optionLayout).toBe('inline');

    const [node] = optionNodes(rowed, BILINGUAL);
    expect(node.kind).toBe('optionRow');
    expect(count(await documentXml(rowed, BILINGUAL), /<w:tbl>/g)).toBe(1);
  });
});
