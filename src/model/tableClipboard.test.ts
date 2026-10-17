import { describe, expect, it } from 'vitest';
import { createTableBlock } from './factories';
import { cellsInRange, mergeRange } from './table';
import {
  fillCells,
  gridFromClipboard,
  gridFromHtml,
  gridFromTabbed,
  rangeToClipboard,
} from './tableClipboard';
import { bi, plain } from './text';
import type { TableBlock } from './types';

/** Tables on the clipboard (Tables vs Word, phase 2): a pasted 2×3 used to land in one cell. */

/** What Word on a Mac puts on the clipboard for a two-row table, trimmed. */
const WORD_HTML = `<html><body><!--StartFragment-->
<table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0>
 <tr><td width=189 valign=top><p class=MsoNormal><span lang=EN-US>Year<o:p></o:p></span></p></td>
  <td width=189 valign=top><p class=MsoNormal><span lang=EN-US>GDP<o:p></o:p></span></p></td>
  <td><p class=MsoNormal>Price&nbsp;level</p></td></tr>
 <tr><td><p class=MsoNormal>2024</p></td><td><p>3 000</p><p>(est.)</p></td><td><p>&lt;100</p></td></tr>
</table><!--EndFragment--></body></html>`;

describe('reading a table off the clipboard', () => {
  it('reads Word’s HTML table, paragraphs inside a cell as lines', () => {
    expect(gridFromHtml(WORD_HTML)).toEqual([
      ['Year', 'GDP', 'Price level'],
      ['2024', '3 000\n(est.)', '<100'],
    ]);
  });

  it('keeps later cells in their columns after a merged one', () => {
    const html = '<table><tr><td colspan="2">Both</td><td>C</td></tr><tr><td>a</td><td>b</td><td>c</td></tr></table>';
    expect(gridFromHtml(html)).toEqual([
      ['Both', '', 'C'],
      ['a', 'b', 'c'],
    ]);
  });

  it('reads Excel’s tab-separated text, quoted cells included', () => {
    expect(gridFromTabbed('Q\tP\r\n10\t"5\n(peak)"\r\n20\t"say ""hi"""\r\n')).toEqual([
      ['Q', 'P'],
      ['10', '5\n(peak)'],
      ['20', 'say "hi"'],
    ]);
  });

  it('leaves text without a table to paste as text', () => {
    expect(gridFromClipboard({ text: 'one line\nanother line' })).toBeUndefined();
    expect(gridFromClipboard({ html: '<p>Just words</p>', text: 'Just words' })).toBeUndefined();
    expect(gridFromHtml('<table><tr><td>alone</td></tr></table>')).toBeUndefined();
  });

  it('prefers the HTML table, falling back to tabbed text', () => {
    expect(gridFromClipboard({ html: '<p>x</p>', text: 'a\tb' })).toEqual([['a', 'b']]);
  });
});

describe('pasting a grid into cells', () => {
  it('fills from the caret’s cell and grows the table to fit', () => {
    const block = createTableBlock(2, 2);
    const filled = fillCells(block, 1, 1, [['a', 'b'], ['c', 'd']], 'en');
    expect(filled.rows).toHaveLength(3);
    expect(filled.rows.every((row) => row.cells.length === 3)).toBe(true);
    expect(filled.rows.map((row) => row.cells.map((cell) => plain(cell.text.en)))).toEqual([
      ['', '', ''],
      ['', 'a', 'b'],
      ['', 'c', 'd'],
    ]);
  });

  it('writes only the side being typed in', () => {
    const block = createTableBlock(1, 2);
    block.rows[0].cells[0].text = bi('old', '舊');
    const filled = fillCells(block, 0, 0, [['new', 'x']], 'en');
    expect(plain(filled.rows[0].cells[0].text.en)).toBe('new');
    expect(plain(filled.rows[0].cells[0].text.zh)).toBe('舊');
  });
});

describe('copying a range', () => {
  const sweep = (block: TableBlock, from: [number, number], to: [number, number]) =>
    cellsInRange(
      block.rows.map((row) => row.cells),
      block.rows[from[0]].cells[from[1]].id,
      block.rows[to[0]].cells[to[1]].id,
      (_, r, c) => block.rows[r]?.cells[c]?.id,
    );

  it('copies as an HTML table with merges, and tabbed text', () => {
    let block = createTableBlock(2, 3);
    block.rows.forEach((row, r) => row.cells.forEach((cell, c) => (cell.text = bi(`${r}${c}`, ''))));
    block = mergeRange(block, sweep(block, [0, 0], [0, 1]));
    const { html, text } = rangeToClipboard(block, sweep(block, [0, 0], [1, 2]), 'en');
    expect(html).toContain('<td colspan="2"');
    expect(text).toBe('"00\n01"\t\t02\n10\t11\t12');
    // What we copy, we can paste back.
    expect(gridFromHtml(html)).toEqual([
      ['00\n01', '', '02'],
      ['10', '11', '12'],
    ]);
  });
});
