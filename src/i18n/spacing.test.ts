import { describe, expect, it } from 'vitest';
import { BANK_SCREEN_MESSAGES } from '@/components/bank/page/QuestionBankScreen.messages';
import { resolveMessages } from './catalogue';
import { spaced } from './spacing';

describe('a Latin name in 中文 chrome is spaced off', () => {
  it('spaces only where a Chinese character meets a Latin edge', () => {
    expect(spaced`在${'Market and Price'}中搜尋`).toBe('在 Market and Price 中搜尋');
    expect(spaced`在${'市場與價格'}中搜尋`).toBe('在市場與價格中搜尋');
    expect(spaced`${'Market and Price'}只剩 3 條。`).toBe('Market and Price 只剩 3 條。');
    expect(spaced`保留${'(a)'}，只移除`).toBe('保留(a)，只移除');
    expect(spaced`「${'Demand'}」已標記為${'C · Market'}`).toBe('「Demand」已標記為 C · Market');
    expect(spaced`分題 ${'(a)'} 考核${'2023 題'}`).toBe('分題 (a) 考核 2023 題');
    expect(spaced`在${''}中搜尋`).toBe('在中搜尋');
  });

  it('the 題庫 search box reads 在 Market and Price 中搜尋', () => {
    const zh = resolveMessages(BANK_SCREEN_MESSAGES, 'zh-HK');
    expect(zh.searchIn('Market and Price')).toBe('在 Market and Price 中搜尋');
    expect(zh.searchIn('市場與價格')).toBe('在市場與價格中搜尋');
  });
});
