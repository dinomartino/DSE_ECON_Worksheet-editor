import { describe, expect, it } from 'vitest';
import { loadGlossary } from '@/glossary/load';
import type { Glossary } from '@/glossary/types';
import type { SlotKind } from '@/model/textSlots';
import type { RichText } from '@/model/types';
import { CONVENTIONS } from './conventions';
import { fakeGlossary } from './fakeGlossary';
import { evaluateItem } from './run';
import type { Direction, TranslationJob } from './types';
import { validateItem } from './validate';
import { decodeWire, encodeRuns } from './wire';

function job(source: RichText | string, kind: SlotKind = 'part', direction: Direction = 'toZh', aroundValue?: 'before' | 'after'): TranslationJob {
  const runs = typeof source === 'string' ? [{ text: source }] : source;
  return { key: 't1', direction, kind, aroundValue, groupKey: 'q:1', where: 'Question 1', source: runs, slots: [], replacing: false };
}

function check(source: RichText | string, output: string, kind: SlotKind = 'part', direction: Direction = 'toZh', glossary?: Glossary) {
  const j = job(source, kind, direction);
  const { codec } = encodeRuns(j.source);
  const decoded = decodeWire(output, codec, direction === 'toZh' ? 'zh' : 'en', kind);
  return validateItem(j, codec, output, decoded, glossary);
}
const codes = (...args: Parameters<typeof check>) => check(...args).map((i) => `${i.code}:${i.severity}`);

describe('validateItem', () => {
  it('passes a good translation with no issue', () => {
    expect(check([{ text: 'Give ' }, { text: 'TWO', bold: true }, { text: ' reasons why consumer surplus falls.' }],
      '舉出<b>兩個</b>原因，解釋為什麼消費者盈餘會減少。')).toEqual([]);
  });

  it('fails decode errors, empty and untranslated output', () => {
    expect(codes('Explain the result.', '<b>解釋結果。')).toEqual(['unbalanced:fail']);
    expect(codes('Explain the result.', '  ')).toEqual(['empty:fail']);
    expect(codes('Explain the result.', 'Explain the result.')).toContain('untranslated:fail');
    expect(codes('解釋結果。', '解釋結果。', 'part', 'toEn')).toContain('untranslated:fail');
  });

  it('counts blanks, breaks and scripts', () => {
    const blank: RichText = [{ text: 'falls by ' }, { text: ' '.repeat(12), underline: true }, { text: '.' }];
    expect(codes(blank, '減少。')).toContain('blanks:fail');
    expect(codes(blank, '減少<blank/>。')).not.toContain('blanks:fail');
    expect(codes('Price rises.\nExplain.', '價格上升。解釋。')).toContain('breaks:fail');
    expect(codes('Quantity\nof labour', '勞工數量', 'axisTitle')).toEqual([]);
    expect(codes('Quantity', '勞工<br/>數量', 'axisTitle')).toEqual(['breaks:warn']);
    const sub: RichText = [{ text: 'P' }, { text: '1', vertAlign: 'subscript' }, { text: ' rises' }];
    expect(codes(sub, 'P1上升')).toContain('scripts:fail');
    expect(codes(sub, 'P<sub>1</sub>上升')).toEqual([]);
  });

  it('fails derived labels and marks written with no space or full-width forms', () => {
    for (const output of ['(a)解釋需求。', '（a）解釋需求。', '(ii)計算需求。', '（1）政府需求。', '1.解釋需求。', 'A.需求上升。', '第3題解釋需求。', '解釋需求。（4分）']) {
      expect(codes('Explain the demand for rice.', output), output).toContain('derived:fail');
    }
    expect(codes('(1) and (2) only', '只有(1)及(2)', 'option')).toEqual([]);
    expect(codes('only (1) and (2)', '(1) and (2) only', 'option', 'toEn')).not.toContain('derived:fail');
    expect(codes('It rises by 1.5 million.', '1.5百萬增加。')).not.toContain('derived:fail');
    expect(codes('Answer: B', '答案：B')).toEqual([]);
    expect(codes('B', '答案：B', 'answer')).toContain('derived:fail');
  });

  it('fails scheme trails the source lacks', () => {
    for (const output of ['需求增加 (1)', '需求增加 max: 4', '需求增加，最高4分', '需求增加 2@']) {
      expect(codes('Demand increases', output, 'schemePoint'), output).toContain('derived:fail');
    }
    expect(codes('Level 2: explains', '第2級：解釋', 'schemeLevel')).toEqual([]);
    expect(codes('explains fully', '第2級：完整解釋', 'schemeLevel')).toContain('derived:fail');
  });

  it('keeps digits out of wording', () => {
    expect(codes('Full marks:', '總分：', 'wording')).toEqual([]);
    expect(codes('Full marks:', '總分：100', 'wording')).toContain('wordingDigits:fail');
  });

  it('warns on Simplified characters and on Chinese left in English', () => {
    expect(check('The price rises.', '价格上升。')[0]).toMatchObject({ code: 'simplified', severity: 'warn', fix: expect.stringContaining('價, not 价') });
    expect(codes('價格上升。', 'The 價格 rises.', 'part', 'toEn')).toContain('latinInZh:warn');
    expect(codes('價格上升。', 'The price (價格) rises.', 'part', 'toEn')).not.toContain('latinInZh:warn');
  });

  it('checks emphasis both ways', () => {
    expect(codes('State ONE feature of perfect competition.', '寫出完全競爭的一項特徵。')).toEqual(['emphasis:warn']);
    expect(codes('State ONE feature of perfect competition.', '寫出完全競爭的<b>一項</b>特徵。')).toEqual([]);
    const zhBold: RichText = [{ text: '舉出' }, { text: '兩個', bold: true }, { text: '原因。' }];
    expect(codes(zhBold, 'Give <b>two</b> reasons.', 'part', 'toEn')).toEqual(['emphasis:warn']);
    expect(codes(zhBold, 'Give <b>TWO</b> reasons.', 'part', 'toEn')).toEqual([]);
  });

  it('warns when a style class is dropped', () => {
    expect(codes([{ text: 'Note', color: 'C00000' }, { text: ': read the data carefully' }], '注意：細閱資料。')).toEqual(['styles:warn']);
  });

  it('keeps numbers, allowing durations and Chinese counts', () => {
    expect(codes('Output rose by 3 000 units.', '產量增加了3000單位。')).toEqual([]);
    expect(codes('Output rose by 3 000 units.', '產量增加了300單位。')).toContain('numbers:warn');
    expect(codes('Time allowed: 1 hour 30 minutes', '時限：1小時30分鐘', 'coverLine')).toEqual([]);
    expect(codes('Time allowed: 1 hour 30 minutes', '時限：一小時三十分', 'coverLine')).toEqual([]);
    expect(codes('Time allowed: 1 hour 30 minutes', '時限：1小時', 'coverLine')).toEqual(expect.arrayContaining(['numbers:warn', 'duration:warn']));
    expect(codes('Answer any 2 questions.', '任答兩題。', 'instructions')).toEqual([]);
  });

  it('keeps clock times written the Hong Kong way, and the cover’s own timing lines', () => {
    expect(codes('The exam starts at 9:00 am.', '考試於上午9時開始。')).toEqual([]);
    expect(codes('The exam starts at 9:00 am.', '考試於上午九時開始。')).toEqual([]);
    expect(codes('The exam starts at 9:30 am.', '考試於上午9時開始。')).toContain('numbers:warn');
    expect(codes('考試於上午九時三十分開始。', 'The exam starts at 9:30 am.', 'part', 'toEn')).toEqual([]);
    expect(codes('8:30 am – 9:30 am (1 hour)', '一小時完卷<br/>（上午八時三十分至九時三十分）', 'coverLine')).toEqual([]);
    expect(codes('10:15 am – 12:45 pm (2 hours 30 minutes)', '兩小時三十分完卷<br/>（上午十時十五分至下午十二時四十五分）', 'coverLine')).toEqual([]);
    expect(codes('兩小時三十分完卷\n（上午十時十五分至下午十二時四十五分）', '10:15 am – 12:45 pm (2 hours 30 minutes)', 'coverLine', 'toEn'))
      .not.toEqual(expect.arrayContaining([expect.stringMatching(/^(numbers|breaks|duration)/)]));
  });

  it('accepts the HKEAA number forms the prompt asks for', () => {
    expect(codes([{ text: 'Give ' }, { text: '2', bold: true }, { text: ' reasons why demand rises.' }], '舉出<b>兩個</b>原因，解釋需求為何上升。')).not.toContain('numbers:warn');
    expect(codes('Prices rose by 5 per cent.', '價格上升了5%。')).toEqual([]);
    expect(codes('Spending is $45 billion.', '開支為450億元。')).toEqual([]);
    expect(codes('It cost $3.2 million.', '成本為320萬元。')).toEqual([]);
    expect(codes('政府開支為450億元。', 'Government spending is $45 billion.', 'part', 'toEn')).toEqual([]);
    expect(codes('In the 2nd quarter, output fell.', '在第二季，產量下跌。')).toEqual([]);
    expect(codes('It cost $3.2 million.', '成本為32萬元。')).toContain('numbers:warn');
  });

  it('keeps symbols, satisfied by the HKEAA conventions', () => {
    expect(codes('AD shifts to the right.', '總需求向右移。')).toContain('symbols:warn');
    expect(codes('AD shifts to the right.', 'AD向右移。')).toEqual([]);
    expect(codes('Country A exports rice to Country B at HK$500 per tonne.', '甲國以每公噸500港元向乙國出口米。')).toEqual([]);
    expect(codes('Student B disagrees.', '學生乙不同意。')).toEqual([]);
    expect(codes('Answer all questions in Section A.', '甲部所有題目均須作答。', 'instructions')).toEqual([]);
    expect(codes('Illustrate it with an AD-AS diagram.', '以一幅總供需圖說明。')).toEqual([]);
    expect(codes('Country X imports cars.', 'X國進口汽車。')).toEqual([]);
  });

  it('keeps plural and lower-case lettered names: Countries A and B → 甲、乙兩國', () => {
    for (const [en, zh, kind] of [
      ['Countries A and B trade with each other.', '甲國和乙國互相貿易。', 'part'],
      ['Countries A and B trade with each other.', '甲、乙兩國互相貿易。', 'part'],
      ['Students A and B disagree.', '學生甲和學生乙意見不同。', 'part'],
      ['Answer all questions in Sections A and B.', '甲部和乙部所有題目均須作答。', 'instructions'],
      ['In country A, wages rose.', '在甲國，工資上升。', 'part'],
      ['Country E exports rice.', '戊國出口米。', 'part'],
    ] as const) expect(codes(en, zh, kind), en).not.toContain('symbols:warn');
  });

  it('checks heading colons, combination options and length', () => {
    expect(codes('Section A: Short questions', '甲部 短題目', 'sectionHeading')).toContain('colon:warn');
    expect(codes('Section A: Short questions', '甲部：短題目', 'sectionHeading')).toEqual([]);
    expect(codes('(1) and (3) only', '第一及第三項', 'option')).toContain('combination:warn');
    expect(codes('Explain why the price of rice rises.', '解')).toContain('length:warn');
    for (const [zh, en] of [['2025年', '2025'], ['上午10時', '10 am'], ['2024年度', '2024'], ['下午3時30分', '3:30 pm']])
      expect(codes(zh, en, 'tableCell', 'toEn'), zh).not.toContain('length:warn');
  });
});

/** One correct pair per CONVENTIONS row: HKEAA output must pass with no warn. */
const ROW_SAMPLES: Record<string, [string, string, SlotKind]> = {
  country: ['Country A exports rice to Country B.', '甲國向乙國出口米。', 'part'],
  student: ['Student B disagrees.', '學生乙不同意。', 'part'],
  section: ['Answer all questions in Section A.', '甲部所有題目均須作答。', 'instructions'],
  hkd: ['A ticket costs HK$500.', '一張門票500港元。', 'part'],
  usd: ['A meal costs US$20.', '一頓飯20美元。', 'part'],
  adas: ['Illustrate it with an AD-AS diagram.', '以一幅總供需圖說明。', 'part'],
  supplyDemand: ['Draw a supply-demand diagram.', '繪畫一幅供需圖。', 'part'],
  form: ['S5 Economics Test', '中五經濟科測驗', 'heading'],
  paper: ['PAPER 1', '試卷一', 'bandText'],
  subject: ['ECON', '經濟', 'coverLine'],
};

describe('CONVENTIONS', () => {
  it('every row has a prompt line and a correct sample that passes with no warn', () => {
    for (const row of CONVENTIONS) {
      expect(row.promptLine).toMatch(/→/);
      const sample = ROW_SAMPLES[row.id];
      expect(sample, row.id).toBeDefined();
      expect(row.zh([...sample[0].matchAll(row.en)][0]).some((form) => sample[1].includes(form)), row.id).toBe(true);
      expect(codes(sample[0], sample[1], sample[2]), row.id).toEqual([]);
    }
  });

  it('passes the app’s own cover and band furniture in its seeded Chinese', () => {
    expect(codes('S.6 MOCK EXAMINATION 2026 – 2027', '2026 – 2027 年度中六模擬考試', 'coverLine')).toEqual([]);
    expect(codes('2025 – 2026 S.6 MOCK EXAMINATION', '2025 – 2026 年度中六模擬考試', 'bandText')).toEqual([]);
    expect(codes('ECONOMICS   PAPER 1', '經濟  試卷一', 'coverLine')).toEqual([]);
    expect(codes('PAPER 2', '卷二', 'coverLine')).toEqual([]);
    expect(codes('S1 shifts to S2.', 'S1移至S2。')).toEqual([]);
    expect(codes('S1 shifts to S2.', '中一移至S2。')).toContain('symbols:warn');
  });
});

describe('validateItem through the pipeline (normalise first)', async () => {
  // The real glossary once P-GLOSS is in the tree; the fake stands in until then.
  const real = await loadGlossary();
  const glossary = real.entries.length > 0 ? real : fakeGlossary();
  const through = (source: string, output: string, direction: Direction = 'toZh', kind: SlotKind = 'part') =>
    evaluateItem(job(source, kind, direction), output, glossary).issues.map((i) => `${i.code}:${i.severity}`);

  it('fails a Chinese echo in toEn although normalizeEn made its punctuation ASCII', () => {
    expect(through('需求上升。', '需求上升。', 'toEn')).toContain('untranslated:fail');
    expect(through('需求上升，價格下降。', '需求上升, 價格下降.', 'toEn')).toContain('untranslated:fail');
    expect(through('需求上升。', 'Demand rises.', 'toEn')).toEqual([]);
  });

  it('flags a reversed elasticity predicate, which the glossary cannot see', () => {
    expect(through('Demand for rice is price inelastic.', '米的需求富價格彈性。')).toContain('polarity:warn');
    expect(through('Demand for rice is elastic.', '米的需求缺乏彈性。')).toContain('polarity:warn');
    expect(through('Demand for rice is price inelastic.', '米的需求缺乏價格彈性。')).toEqual([]);
    expect(through('Demand for rice is elastic.', '米的需求富彈性。')).toEqual([]);
    // The noun phrase is the term check's conflict, not a second note.
    expect(through('Rice has an elastic demand.', '米的需求缺乏彈性。')).not.toContain('polarity:warn');
  });

  it('keeps an abbreviation rendered through its glossary term', () => {
    expect(through('GDP rises.', '本地生產總值上升。')).toEqual([]);
    expect(through('Real GDP falls.', '實質本地生產總值下降。')).toEqual([]);
    // GDP is an acronym, not a diagram symbol: the term check owns 產出 for real GDP.
    expect(through('Real GDP falls.', '實質產出下降。')).not.toContain('symbols:warn');
    expect(through('The US imposes a tariff on steel.', '美國向鋼鐵徵收關稅。')).not.toContain('symbols:warn');
    expect(through('Draw a PPF.', '畫出生產可能曲線。')).toEqual([]);
  });
});
