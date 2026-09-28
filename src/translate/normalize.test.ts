import { describe, expect, it } from 'vitest';
import { plain } from '@/model/text';
import type { RichText } from '@/model/types';
import { normalizeEn, normalizeZh, traditionalize } from './normalize';

const zh = (text: string) => plain(normalizeZh([{ text }]).runs);
const en = (text: string) => plain(normalizeEn([{ text }]).runs);

describe('normalizeZh', () => {
  it('widens punctuation next to Chinese, not between digits', () => {
    expect(zh('價格上升,需求量下降.')).toBe('價格上升，需求量下降。');
    expect(zh('為什麼?')).toBe('為什麼？');
    expect(zh('資料A: 參考以下資料')).toBe('資料A：參考以下資料');
    expect(zh('增加1.5百萬')).toBe('增加1.5百萬');
    expect(zh('3,000')).toBe('3,000');
  });

  it('widens parentheses around Chinese only', () => {
    expect(zh('價格 ($)')).toBe('價格 ($)');
    expect(zh('本地生產總值 (GDP)')).toBe('本地生產總值 (GDP)');
    expect(zh('(提示:參考圖1)')).toBe('（提示：參考圖1）');
  });

  it('quotes Chinese with 「」 and fixes HK forms', () => {
    expect(zh('老師說"價格會上升"')).toBe('老師說「價格會上升」');
    expect(zh('甚麼是住户?')).toBe('什麼是住戶？');
  });

  it('removes a typed space between CJK and Latin or digits, and keeps it around =', () => {
    expect(zh('資料 A 顯示 2025 年')).toBe('資料A顯示2025年');
    expect(zh('AD = 總需求')).toBe('AD = 總需求');
    expect(zh('MC = MR')).toBe('MC = MR');
  });

  it('never touches subscripts or blanks, and keeps run boundaries', () => {
    const runs: RichText = [
      { text: '價格由P' },
      { text: '1', vertAlign: 'subscript' },
      { text: ' 上升,減少' },
      { text: '    ', underline: true },
      { text: '.' },
    ];
    const out = normalizeZh(runs);
    expect(out.normalized).toBe(true);
    expect(out.runs).toEqual([
      { text: '價格由P' },
      { text: '1', vertAlign: 'subscript' },
      { text: '上升，減少' },
      { text: '    ', underline: true },
      { text: '.' },
    ]);
  });

  it('reports no change as the same runs', () => {
    const runs: RichText = [{ text: '價格上升。' }];
    expect(normalizeZh(runs)).toEqual({ runs, normalized: false });
  });
});

describe('normalizeEn', () => {
  it('mirrors punctuation and widths', () => {
    expect(en('Price rises，so demand falls。')).toBe('Price rises, so demand falls.');
    expect(en('「Good X」（units）')).toBe('“Good X”(units)');
    expect(en('Ｑ１  rises')).toBe('Q1 rises');
  });
});

describe('traditionalize', () => {
  it('converts what remains and lists each pair once', () => {
    const out = traditionalize([{ text: '这个这' }]);
    expect(plain(out.runs)).toBe('這個這');
    expect(out.converted).toEqual([{ from: '这', to: '這' }, { from: '个', to: '個' }]);
  });
});
