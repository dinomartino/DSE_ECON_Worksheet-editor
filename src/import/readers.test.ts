import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLabel, trailingMarks } from './labels';
import { toSourceLines } from './lines';
import { labelZone, tidyText } from './normalize';
import { DRAWING_SRC, readHtml } from './readHtml';
import { readPlain } from './readPlain';

const lines = (plain: string) => toSourceLines(readPlain(plain));
const html = (source: string) => toSourceLines(readHtml(source));

describe('labels', () => {
  it('reads each family, full-width and Cyrillic look-alikes included', () => {
    const family = (s: string) => parseLabel(labelZone(s))?.family;
    expect(family('1.\ttext')).toBe('n.');
    expect(family('（a）\t解釋')).toBe('(a)');
    expect(family('В.\ttext')).toBe('A.');
    expect(family('第3題 寫出')).toBe('第n題');
    expect(family('Q12. Explain')).toBe('Qn');
    expect(family('(ii) text')).toBe('(i)');
    expect(family('6.(a) Explain')).toBe('n.');
    expect(parseLabel(labelZone('(i) text'))).toMatchObject({ family: '(i)', value: 1, alt: { family: '(a)', value: 9 } });
  });

  it('leaves numbers, abbreviations and table cells alone', () => {
    expect(parseLabel(labelZone('1.5 million workers'))).toBeNull();
    expect(parseLabel(labelZone('e.g. a tax'))).toBeNull();
    expect(parseLabel(labelZone('1\t40'))).toBeNull();
    expect(parseLabel(labelZone('1\tExplain why'))?.family).toBe('n.');
  });

  it('reads trailing marks in each style', () => {
    expect(trailingMarks('Explain.\t(3 marks)')?.marks).toBe(3);
    expect(trailingMarks('Explain. [2]')?.marks).toBe(2);
    expect(trailingMarks('解釋。（4分）')?.marks).toBe(4);
    expect(trailingMarks('(1) and (2) only')).toBeNull();
  });
});

describe('plain reader', () => {
  it('tidies a paste: BOM out, NBSP kept only inside numbers', () => {
    expect(tidyText('\uFEFFa\u00A0b 1\u00A0000')).toBe('a b 1\u00A0000');
  });

  it('splits labels, marks, cells and TAB-only answer lines', () => {
    const [q, part, row, space] = lines('1.\tWhy?\n\t(a)\tExplain.\t(3 marks)\nYear\t2024\t2025\n\t');
    expect(q).toMatchObject({ label: '1.', text: 'Why?', labelInfo: { family: 'n.', value: 1 } });
    expect(part).toMatchObject({ label: '(a)', depth: 1, text: 'Explain.', trailingMarks: 3 });
    expect(row.cells?.map((c) => c.map((r) => r.text).join(''))).toEqual(['Year', '2024', '2025']);
    expect(space.tabOnly).toBe(true);
  });

  it('splits an option row and a clump of detached letters', () => {
    const row = lines('A.\t(1) only\tB.\t(2) only\tC.\t(3) only\tD.\tnone');
    expect(row.map((l) => [l.label, l.text])).toEqual([['A.', '(1) only'], ['B.', '(2) only'], ['C.', '(3) only'], ['D.', 'none']]);
    const clump = lines('The old system is A. B. C. D. time rate');
    expect(clump.map((l) => l.text)).toEqual(['The old system is', 'time rate']);
    expect(clump[1].clump).toEqual({ family: 'A.', values: [1, 2, 3, 4] });
  });

  it('reads an option letter that lost its dot only where its dotted siblings run around it', () => {
    const labels = (plain: string) => lines(plain).map((l) => [l.label, l.labelInfo?.value, l.text]);
    expect(labels('A. (1) and (3) only\nB (1) and (4) only\n\nC. (2) and (3) only\nD. (2) and (4) only')).toEqual([
      ['A.', 1, '(1) and (3) only'],
      ['B', 2, '(1) and (4) only'],
      [undefined, undefined, ''],
      ['C.', 3, '(2) and (3) only'],
      ['D.', 4, '(2) and (4) only'],
    ]);
    expect(lines('A (1) only\nB. (2) only\nC. (3) only\nD. (4) only')[0]).toMatchObject({ label: 'A', labelInfo: { family: 'A.', value: 1 } });
    expect(lines('A) rises\nB) falls\nC) unchanged\nD uncertain')[3]).toMatchObject({ labelInfo: { family: 'A)', value: 4 }, text: 'uncertain' });
    // Prose that opens with a capital letter: no run, a broken run, or too few siblings.
    expect(lines('A firm raises its price.\nIts revenue falls.')[0].labelInfo).toBeUndefined();
    expect(lines('A. x\nB y\nD. z')[1].labelInfo).toBeUndefined();
    expect(lines('A. x\nB y\nC. z')[1].labelInfo).toBeUndefined();
    expect(lines('B. x\nC y\nD. z\nE. w')[1].labelInfo).toBeUndefined();
    expect(lines('A. Firm B raises its price\nB. x\nC. y\nD. z').map((l) => l.text)).toEqual(['Firm B raises its price', 'x', 'y', 'z']);
  });

  it('splits the next option set a word space after this one, only when the run from A fits', () => {
    const texts = (plain: string) => lines(plain).map((l) => [l.label, l.text]);
    expect(texts('A. (1) only\nB. (2) only\nC. (1) and (3) only D. (1), (2) and (3)')).toEqual([
      ['A.', '(1) only'],
      ['B.', '(2) only'],
      ['C.', '(1) and (3) only'],
      ['D.', '(1), (2) and (3)'],
    ]);
    expect(texts('A. rises B. falls\nC. stays D. none').map(([l]) => l)).toEqual(['A.', 'B.', 'C.', 'D.']);
    // Prose and runs that do not fit stay whole.
    expect(texts('A. Exports to the U.S. A firm gains.\nB. x\nC. y\nD. z')[0]).toEqual(['A.', 'Exports to the U.S. A firm gains.']);
    expect(texts('A. Plan A. B is cheaper.\nB. x\nC. y\nD. z')[0]).toEqual(['A.', 'Plan A. B is cheaper.']);
    expect(texts('C. Vitamin D. tablets\nD. none')[0]).toEqual(['C.', 'Vitamin D. tablets']);
    expect(texts('A. x\nB. y\nC. Vitamin D. tablets\nD. none')[2]).toEqual(['C.', 'Vitamin D. tablets']);
    expect(texts('A. rises B. falls\nD. none')[0]).toEqual(['A.', 'rises B. falls']);
  });

  it('gives "1.⇥(a)⇥text" a line per level', () => {
    expect(lines('3.\t(a)\tDefine cost.\t(2 marks)').map((l) => [l.label, l.text, l.trailingMarks])).toEqual([
      ['3.', '', undefined],
      ['(a)', 'Define cost.', 2],
    ]);
    expect(lines('6.(a) Define cost.').map((l) => [l.label, l.text])).toEqual([
      ['6.', ''],
      ['(a)', 'Define cost.'],
    ]);
  });
});

describe('HTML reader', () => {
  it('reads Word mso-list labels, tab spans and answer formatting', () => {
    const source = `<p style='mso-list:l0 level1 lfo1'><![if !supportLists]><span style='mso-list:Ignore'>1.<span>&nbsp;&nbsp; </span></span><![endif]>Why do prices rise?</p>
      <p style='mso-list:l1 level2 lfo2'><![if !supportLists]><span style='mso-list:Ignore'>(a)<span>&nbsp;</span></span><![endif]>Explain.<span style='mso-tab-count:1'>&nbsp;&nbsp;</span>(2 marks)</p>
      <p><b>A.</b><span style='mso-tab-count:1'> </span><b>a rise in costs</b></p>
      <p><span style='mso-tab-count:1;text-decoration:underline dotted'>&nbsp;</span></p>`;
    const [q, part, option, space] = html(source);
    expect(q).toMatchObject({ label: '1.', labelSource: 'list', text: 'Why do prices rise?', depth: 0 });
    expect(part).toMatchObject({ label: '(a)', depth: 1, text: 'Explain.', trailingMarks: 2 });
    expect(option).toMatchObject({ label: 'A.', emphasis: 'bold' });
    expect(space.tabOnly).toBe(true);
  });

  it('numbers <ol start type> items from their attributes, including inside table cells', () => {
    const source = '<ol start="4"><li><p>Which?</p></li></ol><table><tr><td><ol type="A"><li>yes</li></ol></td><td><ol type="A" start="2"><li>no</li></ol></td></tr></table>';
    expect(html(source).map((l) => [l.label, l.text])).toEqual([['4.', 'Which?'], ['A.', 'yes'], ['B.', 'no']]);
  });

  it('reads a Mac Word copy: bare VML pictures and drawings, text boxes as paragraphs', () => {
    const read = html(readFileSync('src/import/fixtures/18-html-mac-word-vml.html', 'utf8'));
    expect(read.filter((l) => l.image).map((l) => l.image)).toEqual([
      // A floating picture: `v:imagedata` with a file:// path only, sized from its shape (pt → px).
      { src: expect.stringMatching(/^file:\/\/\/\/Users\/.*clip_image001\.png$/), widthPx: 400, heightPx: 240 },
      // A graph drawn from lines and text boxes: one picture, its labels kept as alt text.
      { src: DRAWING_SRC, widthPx: 320, heightPx: 240, alt: 'Price ($) · Quantity' },
      // A picture group inside a framed one-cell table: after the table, never inside a cell.
      { src: expect.stringMatching(/clip_image002\.png$/), widthPx: 120, heightPx: 80, alt: 'A cup of tea' },
    ]);
    const texts = read.map((l) => l.text);
    // A text box's own `<![if !mso]><table>` is not a table row; drawing labels are not lines.
    expect(texts).toContain('Figure 1');
    expect(read.find((l) => l.text === 'Figure 1')?.cells).toBeUndefined();
    expect(texts.some((t) => /Price \(\$\)|Quantity|A cup of tea/.test(t))).toBe(false);
    const after = read.findIndex((l) => l.text.startsWith('Twelve new bubble tea'));
    expect(read[after + 1].image?.alt).toBe('A cup of tea');
  });

  it('keeps a picture right after a bare list label as its own line, label first', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo';
    const source = `<p style='mso-list:l1 level1 lfo2'><![if !supportLists]><span style='mso-list:Ignore'>A.<span>&nbsp;</span></span><![endif]><img width=160 height=120 src="${png}"></p><p>B.<span style='mso-tab-count:1'> </span><img width=160 height=120 src="${png}"></p>`;
    expect(html(source).map((l) => [l.label, l.text, Boolean(l.image)])).toEqual([
      ['A.', '', false],
      [undefined, '', true],
      ['B.', '', false],
      [undefined, '', true],
    ]);
  });

  it('keeps highlight as emphasis, decodes entities, skips head and scripts', () => {
    const source = '<head><style>p{}</style><title>x</title></head><script>alert(1)</script><p>C.&nbsp;<span style="background:yellow">it&#8217;s &amp; ok</span></p>';
    const [line] = html(source);
    expect(line).toMatchObject({ label: 'C.', text: 'it’s & ok', emphasis: 'highlight' });
    expect(line.runs.every((r) => !('highlight' in r))).toBe(true);
  });
});
