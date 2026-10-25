import { describe, expect, it, vi } from 'vitest';
// The registry loads first: the model modules below reach back into it and need it whole.
import '@/registry';
import JSZip from 'jszip';
import { renderToStaticMarkup } from 'react-dom/server';
import { clipboardNodeHtml, questionClipboardHtml, worksheetClipboardHtml } from '@/export/clipboard';
import { exportDocxBuffer } from '@/export/docx';
import { UiLanguageOverride } from '@/i18n/language';
import { createMcqQuestion, createTableBlock, createWorksheet } from '@/model/factories';
import { migrate, serializeWorksheet } from '@/model/migrations';
import { cellAlignOf, cellAlignPatch, patchCell, patchCells } from '@/model/table';
import { bi } from '@/model/text';
import type { CellAlign, McqQuestion, OutputMode, TableBlock, TextFormat, Worksheet } from '@/model/types';
import type { TableNode } from '@/render/ir';
import { renderWorksheet } from '@/render/worksheet';
import type { UiLanguage } from '@/settings/language';
import { withFlow } from '@/test/fixtures';
import { NodeView } from './Preview';

/**
 * k-0178 #4: a table cell's text can be justified. One more value of `CellAlign`, the cell's
 * own alignment, set from the Table tools bar (T≡) and printed by every backend: the page
 * (and so the page rail and the print PDF), the `.docx` (`w:jc both`) and Copy for Word
 * (`text-align:justify`). Absent = nothing changes, and "Justify text" does not reach a cell.
 */

const STUDENT_EN: OutputMode = { language: 'en', version: 'student' };
const STUDENT_BOTH: OutputMode = { language: 'bilingual', version: 'student' };

const LONG = 'A price ceiling set below the equilibrium price makes the quantity demanded exceed the quantity supplied.';
const LONG_ZH = '價格上限設於均衡價格之下，會令需求量超過供應量。';

/** A 2×2 table: a heading row, then a short term beside a sentence that wraps. */
function table(sentence?: CellAlign, term?: CellAlign): TableBlock {
  const block = createTableBlock(2, 2);
  const texts = [
    ['Policy', 'How it works'],
    ['Price ceiling', LONG],
  ];
  const zh = [
    ['政策', '運作方式'],
    ['價格上限', LONG_ZH],
  ];
  block.rows.forEach((row, r) => row.cells.forEach((cell, c) => { cell.text = bi(texts[r][c], zh[r][c]); }));
  if (sentence) Object.assign(block.rows[1].cells[1], cellAlignPatch(sentence));
  if (term) Object.assign(block.rows[1].cells[0], cellAlignPatch(term));
  return block;
}

function paper(block: TableBlock = table()): { worksheet: Worksheet; question: McqQuestion } {
  const question: McqQuestion = { ...createMcqQuestion(), blocks: [block] };
  return { worksheet: withFlow(createWorksheet(), [question]), question };
}

function tableNode(worksheet: Worksheet, mode = STUDENT_EN): TableNode {
  return renderWorksheet(worksheet, mode).questions[0].nodes.find((node): node is TableNode => node.kind === 'table')!;
}

async function documentXml(worksheet: Worksheet, mode = STUDENT_EN): Promise<string> {
  const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, mode));
  return zip.file('word/document.xml')!.async('string');
}

/** The `w:jc` of each table cell's paragraph, in reading order. */
function cellJcs(xml: string): Array<string | undefined> {
  return [...xml.matchAll(/<w:tc>(?:(?!<\/w:tc>)[\s\S])*<\/w:tc>/g)].map(
    (cell) => cell[0].match(/<w:jc w:val="(\w+)"\/>/)?.[1],
  );
}

/** Every `<td>`'s text-align, in reading order. */
function tdAligns(html: string): Array<string | undefined> {
  return [...html.matchAll(/<td[^>]*style="([^"]*)"/g)].map((match) => match[1].match(/text-align:\s*([a-z]+)/)?.[1]);
}

describe('cell justify: the model', () => {
  it('survives save and reload, and an old document without it opens unchanged', () => {
    const { worksheet } = paper(table('justify'));
    const reloaded = migrate(JSON.parse(JSON.stringify(serializeWorksheet(worksheet))));
    const cells = (reloaded.questions[0] as McqQuestion).blocks![0] as TableBlock;
    expect(cellAlignOf(cells.rows[1].cells[1])).toBe('justify');
    expect(reloaded.__unknown).toBeUndefined();

    const plain = migrate(JSON.parse(JSON.stringify(serializeWorksheet(paper().worksheet))));
    const old = (plain.questions[0] as McqQuestion).blocks![0] as TableBlock;
    expect(old.rows.flatMap((row) => row.cells.map((cell) => 'align' in cell || 'justify' in cell))).toEqual([
      false, false, false, false,
    ]);
  });

  it('adds no schema version: a saved paper with a justified cell is still schema 1', () => {
    const saved = serializeWorksheet(paper(table('justify')).worksheet);
    expect(saved.schemaVersion).toBe(1);
  });

  it('is stored as its own flag, never as an align a 0.8.5 build would write into w:jc', () => {
    // 0.8.5 and older write a cell's `align` straight into `<w:jc w:val>`, where "justify" is not
    // a value Word accepts. So the saved cell holds `justify: true` and no `align` at all: an older
    // build ignores the flag and prints the cell flush left, its `.docx` valid.
    const saved = JSON.parse(JSON.stringify(serializeWorksheet(paper(table('justify', 'center')).worksheet)));
    const [term, sentence] = saved.questions[0].blocks[0].rows[1].cells;
    expect(sentence.justify).toBe(true);
    expect('align' in sentence).toBe(false);
    expect(term.align).toBe('center');
    expect('justify' in term).toBe(false);
    expect(JSON.stringify(saved)).not.toContain(':"justify"');
  });

  it('reads a develop build\'s align: "justify" as the flag (it never shipped)', () => {
    const saved = JSON.parse(JSON.stringify(serializeWorksheet(paper().worksheet)));
    saved.questions[0].blocks[0].rows[1].cells[1].align = 'justify';
    const reloaded = migrate(saved);
    const cell = ((reloaded.questions[0] as McqQuestion).blocks![0] as TableBlock).rows[1].cells[1];
    expect(cell).toMatchObject({ justify: true });
    expect('align' in cell).toBe(false);
    expect(cellAlignOf(cell)).toBe('justify');
    // The input is left alone, and a paper with nothing to fold comes back as it went in.
    expect(saved.questions[0].blocks[0].rows[1].cells[1].align).toBe('justify');
  });

  it('is set and replaced like the other three alignments, one cell or a swept range', () => {
    const block = table();
    const justified = patchCell(block, 1, 1, cellAlignPatch('justify'));
    expect(cellAlignOf(justified.rows[1].cells[1])).toBe('justify');
    expect(cellAlignOf(justified.rows[1].cells[0])).toBe('left');
    // Another alignment replaces it: the four are one choice.
    expect(cellAlignOf(patchCell(justified, 1, 1, cellAlignPatch('left')).rows[1].cells[1])).toBe('left');
    const centred = patchCell(justified, 1, 1, cellAlignPatch('center')).rows[1].cells[1];
    expect(cellAlignOf(centred)).toBe('center');
    expect(JSON.parse(JSON.stringify(centred)).justify).toBeUndefined();
    // Justifying a centred cell drops the centre, so an older build shows it flush left.
    expect(JSON.parse(JSON.stringify(patchCell(block, 1, 1, cellAlignPatch('center')))).rows[1].cells[1].align).toBe('center');
    expect('align' in JSON.parse(JSON.stringify(patchCell(patchCell(block, 1, 1, cellAlignPatch('center')), 1, 1, cellAlignPatch('justify')).rows[1].cells[1]))).toBe(false);

    const range = [
      { rowIndex: 1, cellIndex: 0 },
      { rowIndex: 1, cellIndex: 1 },
    ];
    const swept = patchCells(block, range, cellAlignPatch('justify'));
    expect(swept.rows[1].cells.map(cellAlignOf)).toEqual(['justify', 'justify']);
    expect(swept.rows[0].cells.map(cellAlignOf)).toEqual(['left', 'left']);
  });
});

describe('cell justify: the render IR', () => {
  it('stamps the cell, and says left when nothing is set', () => {
    const justified = tableNode(paper(table('justify')).worksheet);
    expect(justified.rows[1].map((cell) => cell.align)).toEqual(['left', 'justify']);
    expect(tableNode(paper().worksheet).rows[1].map((cell) => cell.align)).toEqual(['left', 'left']);
  });

  it('is not what "Justify text" does: a paper that justifies its body leaves every cell as set', () => {
    const { worksheet } = paper(table('justify', 'center'));
    const justifying = { ...worksheet, justifyText: true } as Worksheet;
    expect(tableNode(justifying).rows[1].map((cell) => cell.align)).toEqual(['center', 'justify']);
    // And a cell nobody set stays flush left, as it prints in every saved paper.
    expect(tableNode({ ...paper().worksheet, justifyText: true } as Worksheet).rows[1].map((cell) => cell.align)).toEqual(['left', 'left']);
  });

  it('is the cell\'s own: a stale format.align from the old format bar changes nothing', () => {
    // Before 0.8.3 the format bar could store `align` on a cell's `format`; it aligned nothing
    // then and must not start now that the cell can justify.
    const stale: TextFormat = { align: 'justify' };
    const block = table();
    block.rows[1].cells[1].format = stale;
    expect(tableNode(paper(block).worksheet).rows[1].map((cell) => cell.align)).toEqual(['left', 'left']);
  });
});

describe('cell justify: the three backends agree', () => {
  it.each([
    ['left', 'left'],
    ['center', 'center'],
    ['right', 'right'],
    ['justify', 'both'],
  ] as const)('%s: the page says it, Word says %s, Copy for Word says it', async (align, jc) => {
    const { worksheet } = paper(table(align));
    const node = tableNode(worksheet);
    expect(tdAligns(renderToStaticMarkup(<NodeView node={node} language="en" />))).toEqual(['left', 'left', 'left', align]);
    expect(tdAligns(clipboardNodeHtml(node, 'en', ''))).toEqual(['left', 'left', 'left', align]);
    expect(cellJcs(await documentXml(worksheet))).toEqual(['left', 'left', 'left', jc]);
  });

  it('exports w:jc both on the cell, adding nothing else', async () => {
    const justified = await documentXml(paper(table('justify')).worksheet);
    const plain = await documentXml(paper().worksheet);
    expect(justified.match(/<w:jc w:val="both"\/>/g)).toHaveLength(1);
    expect(justified.replace('<w:jc w:val="both"/>', '<w:jc w:val="left"/>')).toBe(plain);
    // "justify" is no value of w:jc.
    expect(justified).not.toContain('w:val="justify"');
  });

  it('keeps a bilingual cell\'s English line ragged in Word, as on the page', async () => {
    const settings = async (worksheet: Worksheet) =>
      (await JSZip.loadAsync(await exportDocxBuffer(worksheet, STUDENT_BOTH))).file('word/settings.xml')!.async('string');
    expect(await settings(paper(table('justify')).worksheet)).toContain('doNotExpandShiftReturn');
    expect(await settings(paper().worksheet)).not.toContain('doNotExpandShiftReturn');
  });

  it('writes the same cell in either language and in both', async () => {
    for (const language of ['en', 'zh', 'bilingual'] as const) {
      const xml = await documentXml(paper(table('justify')).worksheet, { language, version: 'student' });
      expect(cellJcs(xml)).toEqual(['left', 'left', 'left', 'both']);
    }
  });

  it('copies as text-align:justify on that cell alone', () => {
    const { worksheet, question } = paper(table('justify'));
    const copied = questionClipboardHtml(worksheet, question.id, STUDENT_BOTH);
    expect(copied.match(/text-align:justify;/g)).toHaveLength(1);
    expect(tdAligns(copied)).toEqual(['left', 'left', 'left', 'justify']);
    const before = paper();
    expect(questionClipboardHtml(before.worksheet, before.question.id, STUDENT_BOTH)).not.toContain('text-align:justify');
  });

  it('is the same HTML the start screen\'s card and the bank\'s preview draw', () => {
    const { worksheet } = paper(table('justify'));
    expect(worksheetClipboardHtml(worksheet, STUDENT_EN)).toContain('text-align:justify;');
  });

  it('draws on the page with the cell\'s own text-align, over any format', () => {
    const block = table('justify');
    block.rows[1].cells[1].format = { align: 'center', bold: true };
    const html = renderToStaticMarkup(<NodeView node={tableNode(paper(block).worksheet)} language="en" />);
    expect(tdAligns(html)).toEqual(['left', 'left', 'left', 'justify']);
    expect(html).toContain('font-weight:700');
  });
});

// The bar's own store: `TableRow` reads which cell is active and what is swept.
const store: { activeCell?: { blockId: string; cellId: string }; cellSelection?: { blockId: string; anchorId: string; focusId: string } } = {};
vi.mock('@/store/worksheetStore', () => ({
  useWorksheetStore: Object.assign((select: (s: typeof store) => unknown) => select(store), { getState: () => store }),
}));

const { TableRow } = await import('./ContextBar');

/** The "Cell text" buttons as `[glyph, label, pressed]`, in order. */
function cellTextButtons(block: TableBlock, ui: UiLanguage = 'en'): Array<[string, string, string]> {
  const markup = renderToStaticMarkup(
    <UiLanguageOverride.Provider value={ui}>
      <TableRow block={block} />
    </UiLanguageOverride.Provider>,
  );
  return [...markup.matchAll(/<button[^>]*aria-label="([^"]*)"[^>]*aria-pressed="(true|false)"[^>]*>(T[⇤↔⇥≡])<\/button>/g)].map(
    ([, label, pressed, glyph]) => [glyph, label, pressed],
  );
}

describe('cell justify: the Table tools bar', () => {
  it('offers Justify beside the three alignments, in the cell\'s own group', () => {
    const block = table();
    store.activeCell = { blockId: block.id, cellId: block.rows[1].cells[1].id };
    store.cellSelection = undefined;
    expect(cellTextButtons(block)).toEqual([
      ['T⇤', 'Align cell text left', 'true'],
      ['T↔', 'Center cell text', 'false'],
      ['T⇥', 'Align cell text right', 'false'],
      ['T≡', 'Justify cell text', 'false'],
    ]);
  });

  it('reads pressed for the justified cell, and for none of the others', () => {
    const block = table('justify');
    store.cellSelection = undefined;
    store.activeCell = { blockId: block.id, cellId: block.rows[1].cells[1].id };
    expect(cellTextButtons(block).map(([glyph, , pressed]) => `${glyph}:${pressed}`)).toEqual(['T⇤:false', 'T↔:false', 'T⇥:false', 'T≡:true']);
    store.activeCell = { blockId: block.id, cellId: block.rows[1].cells[0].id };
    expect(cellTextButtons(block).map(([glyph, , pressed]) => `${glyph}:${pressed}`)).toEqual(['T⇤:true', 'T↔:false', 'T⇥:false', 'T≡:false']);
  });

  it('over a sweep reads pressed only when every swept cell agrees', () => {
    const [heading, term, sentence] = [table(), table('justify'), table('justify', 'justify')];
    const sweep = (block: TableBlock) => {
      store.activeCell = { blockId: block.id, cellId: block.rows[1].cells[0].id };
      store.cellSelection = { blockId: block.id, anchorId: block.rows[1].cells[0].id, focusId: block.rows[1].cells[1].id };
      return cellTextButtons(block).map(([glyph, , pressed]) => `${glyph}:${pressed}`);
    };
    expect(sweep(heading)).toContain('T≡:false');
    expect(sweep(term)).toEqual(['T⇤:false', 'T↔:false', 'T⇥:false', 'T≡:false']); // one left, one justified: none agree
    expect(sweep(sentence)).toEqual(['T⇤:false', 'T↔:false', 'T⇥:false', 'T≡:true']);
  });

  it('says so in 繁體中文 with the word the format bar already uses', () => {
    const block = table();
    store.cellSelection = undefined;
    store.activeCell = { blockId: block.id, cellId: block.rows[1].cells[1].id };
    expect(cellTextButtons(block, 'zh-HK').map(([, label]) => label)).toEqual([
      '儲存格文字靠左對齊',
      '儲存格文字置中',
      '儲存格文字靠右對齊',
      '儲存格文字左右對齊',
    ]);
  });
});
