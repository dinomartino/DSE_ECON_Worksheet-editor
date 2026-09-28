import { describe, expect, it } from 'vitest';
import { normalizeRuns, plain } from '@/model/text';
import type { InlineRun, RichText } from '@/model/types';
import { shippedBiTexts } from './testKit';
import { decodeWire, digitGroups, encodeRuns, latinSymbolsOf } from './wire';

/** Falsy attributes render like absent ones. */
const clean = (runs: RichText): RichText =>
  normalizeRuns(
    runs.map((run) => Object.fromEntries(Object.entries(run).filter(([, v]) => v !== undefined && v !== false)) as InlineRun),
  );

function roundTrip(runs: RichText): RichText {
  const { wire, codec } = encodeRuns(runs);
  const decoded = decodeWire(wire, codec, 'en', 'paragraph');
  if (!decoded.ok) throw new Error(JSON.stringify(decoded.error));
  return decoded.runs;
}

function translate(runs: RichText, output: string, target: 'en' | 'zh' = 'zh', kind: Parameters<typeof decodeWire>[3] = 'part', around?: 'before' | 'after') {
  const { codec } = encodeRuns(runs);
  const decoded = decodeWire(output, codec, target, kind, around);
  if (!decoded.ok) throw new Error(JSON.stringify(decoded.error));
  return decoded.runs;
}

describe('identity round trip', () => {
  it('decodes every shipped BiText side back to its normalised runs', () => {
    const texts = shippedBiTexts();
    expect(texts.length).toBeGreaterThan(300);
    for (const text of texts) {
      for (const side of [text.en, text.zh]) {
        expect(clean(roundTrip(side)), JSON.stringify(side)).toEqual(clean(side));
      }
    }
  });
});

describe('encodeRuns (§C.3)', () => {
  it('tags bold and keeps the rest plain', () => {
    const { wire, codec } = encodeRuns([{ text: 'Give ' }, { text: 'TWO', bold: true }, { text: ' reasons.' }]);
    expect(wire).toBe('Give <b>TWO</b> reasons.');
    expect(codec.emphasis).toMatchObject({ bold: 1, capitals: 0 });
  });

  it('counts unbolded CAPITALS as emphasis', () => {
    expect(encodeRuns([{ text: 'State ONE feature of perfect competition.' }]).codec.emphasis.capitals).toBe(1);
    expect(encodeRuns([{ text: 'END OF PAPER' }]).codec.emphasis.capitals).toBe(0);
  });

  it('carries subscripts as <sub> and records them', () => {
    const { wire, codec } = encodeRuns([
      { text: 'P' }, { text: '1', vertAlign: 'subscript' }, { text: ' rises to P' }, { text: '2', vertAlign: 'subscript' },
    ]);
    expect(wire).toBe('P<sub>1</sub> rises to P<sub>2</sub>');
    expect(codec.scripts).toEqual(['sub:1', 'sub:2']);
    expect(codec.latinSymbols).toEqual(['P1', 'P2']);
  });

  it('finds a blank inside merged underlined runs, with its exact width', () => {
    const { wire, codec } = encodeRuns([{ text: 'falls by ' }, { text: 'x' + ' '.repeat(12), underline: true }, { text: '.' }]);
    expect(wire).toBe('falls by <u>x</u><blank/>.');
    expect(codec.blanks).toEqual([12]);
  });

  it('sends interior breaks as <br/> and keeps edge newlines out', () => {
    expect(encodeRuns([{ text: 'increase\nin DWL' }]).wire).toBe('increase<br/>in DWL');
    const { wire, codec } = encodeRuns([{ text: 'Answer:\n\n' }]);
    expect(wire).toBe('Answer:');
    expect(codec.trail).toBe(2);
  });

  it('escapes a literal < and numbers style classes', () => {
    expect(encodeRuns([{ text: 'gain (+) < loss (−)' }]).wire).toBe('gain (+) &lt; loss (−)');
    const { wire, codec } = encodeRuns([{ text: 'Note', color: 'C00000', fontSize: 14 }, { text: ': read carefully' }]);
    expect(wire).toBe('<s1>Note</s1>: read carefully');
    expect(codec.styles).toEqual([{ fontSize: 14, color: 'C00000' }]);
  });

  it('drops the rarest classes past nine and flags it', () => {
    const runs: RichText = Array.from({ length: 11 }, (_, i) => ({ text: 'x'.repeat(i + 1) + ' ', fontSize: 8 + i }));
    const { codec, wire } = encodeRuns(runs);
    expect(codec.styles).toHaveLength(9);
    expect(codec.simplified).toBe(true);
    expect(wire.startsWith('x xx <s1>xxx </s1>')).toBe(true);
    expect(wire).not.toContain('<s10>');
  });

  it('nests canonically with minimal churn', () => {
    expect(encodeRuns([{ text: 'x', bold: true }, { text: 'y', bold: true, italic: true }]).wire).toBe('<b>x<i>y</i></b>');
  });
});

describe('decodeWire (§C.3, §C.4)', () => {
  it('moves bold with the Chinese words', () => {
    const runs = translate([{ text: 'Give ' }, { text: 'TWO', bold: true }, { text: ' reasons.' }], '舉出<b>兩個</b>原因。');
    expect(runs).toEqual([{ text: '舉出' }, { text: '兩個', bold: true }, { text: '原因。' }]);
  });

  it('restores a blank as its source width of underlined spaces', () => {
    const runs = translate([{ text: 'falls by ' }, { text: ' '.repeat(12), underline: true }, { text: '.' }], '減少<blank/>。');
    expect(runs).toEqual([{ text: '減少' }, { text: ' '.repeat(12), underline: true }, { text: '。' }]);
  });

  it('restores edge newlines verbatim and keeps interior breaks', () => {
    expect(plain(translate([{ text: 'Answer:\n\n' }], '答案：'))).toBe('答案：\n\n');
    expect(plain(translate([{ text: 'increase\nin DWL' }], '效率損失<br/>增加'))).toBe('效率損失\n增加');
  });

  it('keeps a raw < that is not a tag, and decodes entities', () => {
    expect(plain(translate([{ text: 'a < b' }], '收入增加 (+) < 減少 &amp; &nbsp;x'))).toBe('收入增加 (+) < 減少 &  x');
  });

  it('maps a style class back to its format', () => {
    const runs = translate([{ text: 'Note', color: 'C00000', fontSize: 14 }, { text: ': read carefully' }], '<s1>注意</s1>：細閱。');
    expect(runs[0]).toEqual({ text: '注意', color: 'C00000', fontSize: 14 });
  });

  it('is lenient on tag spelling and strict on balance', () => {
    const source = [{ text: 'a' }, { text: 'b', bold: true }, { text: '\nc' }];
    expect(plain(translate(source, '甲<B>乙</B><br>丙'))).toBe('甲乙\n丙');
    const { codec } = encodeRuns(source);
    expect(decodeWire('<b>乙', codec, 'zh', 'part')).toMatchObject({ ok: false, error: { code: 'unbalanced' } });
    expect(decodeWire('乙</i>', codec, 'zh', 'part')).toMatchObject({ ok: false, error: { code: 'unbalanced' } });
    expect(decodeWire('<s2>乙</s2>', codec, 'zh', 'part')).toMatchObject({ ok: false, error: { code: 'unknownStyle', n: 2 } });
  });

  it('cleans hygiene: CRLF, zero-width, spaces between CJK', () => {
    expect(plain(translate([{ text: 'a\nb' }], '甲​ 乙\r\n丙'))).toBe('甲乙\n丙');
  });
});

describe('boundary spaces', () => {
  const before: RichText = [{ text: 'There are ' }];
  it('never carries English padding into Chinese', () => {
    expect(plain(translate(before, '本卷共有', 'zh', 'wording', 'before'))).toBe('本卷共有');
  });
  it('gives English wording exactly one space on the value side', () => {
    expect(plain(translate([{ text: '本卷共有' }], 'There are', 'en', 'wording', 'before'))).toBe('There are ');
    expect(plain(translate([{ text: '題' }], 'questions', 'en', 'wording', 'after'))).toBe(' questions');
    expect(plain(translate([{ text: '題' }], '.', 'en', 'wording', 'after'))).toBe('.');
    expect(plain(translate([{ text: '總分：' }], 'Full marks:', 'en', 'wording', 'before'))).toBe('Full marks:');
    expect(plain(translate([{ text: '(' }], 'HK$', 'en', 'wording', 'before'))).toBe('HK$');
  });
  it('keeps the source spaces otherwise', () => {
    expect(plain(translate([{ text: ' Price ' }], '價格', 'en', 'tableCell'))).toBe(' 價格 ');
  });
});

describe('source facts', () => {
  it('normalises digit groups', () => {
    expect(digitGroups('3 000 units, $14 000 and ２５% in 2025')).toEqual(['3000', '14000', '25%', '2025']);
  });

  it('lists symbols, not emphasis or all-caps phrases', () => {
    const symbols = (text: string) => latinSymbolsOf([{ text }]);
    expect(symbols('END OF PAPER')).toEqual([]);
    expect(symbols('A firm raises its price. I agree.')).toEqual([]);
    expect(symbols('State ONE reason why AD shifts from E1')).toEqual(['AD', 'E1']);
    expect(symbols('MC = MR at Q₀')).toEqual(['MC', 'MR', 'Q0']);
    expect(symbols('SECTION A')).toEqual([]);
  });
});
