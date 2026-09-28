import { describe, expect, it } from 'vitest';
import type { SlotKind } from '@/model/textSlots';
import type { RichText } from '@/model/types';
import { CONVENTIONS } from './conventions';
import type { Direction, TranslationJob } from './types';
import { validateItem } from './validate';
import { decodeWire, encodeRuns } from './wire';

function job(source: RichText | string, kind: SlotKind = 'part', direction: Direction = 'toZh', aroundValue?: 'before' | 'after'): TranslationJob {
  const runs = typeof source === 'string' ? [{ text: source }] : source;
  return { key: 't1', direction, kind, aroundValue, groupKey: 'q:1', where: 'Question 1', source: runs, slots: [], replacing: false };
}

function check(source: RichText | string, output: string, kind: SlotKind = 'part', direction: Direction = 'toZh') {
  const j = job(source, kind, direction);
  const { codec } = encodeRuns(j.source);
  const decoded = decodeWire(output, codec, direction === 'toZh' ? 'zh' : 'en', kind);
  return validateItem(j, codec, output, decoded);
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

  it('keeps symbols, satisfied by the HKEAA conventions', () => {
    expect(codes('AD shifts to the right.', '總需求向右移。')).toContain('symbols:warn');
    expect(codes('AD shifts to the right.', 'AD向右移。')).toEqual([]);
    expect(codes('Country A exports rice to Country B at HK$500 per tonne.', '甲國以每公噸500港元向乙國出口米。')).toEqual([]);
    expect(codes('Student B disagrees.', '學生乙不同意。')).toEqual([]);
    expect(codes('Answer all questions in Section A.', '甲部所有題目均須作答。', 'instructions')).toEqual([]);
    expect(codes('Illustrate it with an AD-AS diagram.', '以一幅總供需圖說明。')).toEqual([]);
    expect(codes('Country X imports cars.', 'X國進口汽車。')).toEqual([]);
  });

  it('checks heading colons, combination options and length', () => {
    expect(codes('Section A: Short questions', '甲部 短題目', 'sectionHeading')).toContain('colon:warn');
    expect(codes('Section A: Short questions', '甲部：短題目', 'sectionHeading')).toEqual([]);
    expect(codes('(1) and (3) only', '第一及第三項', 'option')).toContain('combination:warn');
    expect(codes('Explain why the price of rice rises.', '解')).toContain('length:warn');
  });
});

describe('CONVENTIONS', () => {
  it('every row has a prompt line with its Chinese form', () => {
    for (const row of CONVENTIONS) expect(row.promptLine).toMatch(/→/);
  });
});
