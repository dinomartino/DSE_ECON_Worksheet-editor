import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UiLanguageOverride } from '@/i18n/language';
import type { LanguageMode } from '@/model/types';
import type { UiLanguage } from '@/settings/language';
import { packName, papersOf, sourceOf } from '@/pastpapers/pack';
import { PaperSelect } from './PastPaperControls';
import { NO_FILTERS } from './usePastPaperBrowse';

/**
 * Names from the pack (topics, papers, sources, search rows) are paper words: they follow the
 * language the questions are shown in, never the interface's (user u-cs6l: English questions
 * under a 中文 interface listed 中文 topic names). The chrome around them stays in the
 * interface language, as everywhere else in the editor.
 */
describe('pack names follow the question language', () => {
  const topic = { en: 'Market and price', zh: '市場與價格' };

  it('one side per view, the other when empty, both only where there is room', () => {
    expect(packName(topic, 'en')).toBe('Market and price');
    expect(packName(topic, 'zh')).toBe('市場與價格');
    expect(packName({ en: 'Elasticity', zh: '' }, 'zh')).toBe('Elasticity');
    expect(packName({ en: '', zh: '彈性' }, 'en')).toBe('彈性');
    expect(packName(topic, 'bilingual')).toBe('Market and price');
    expect(packName(topic, 'bilingual', 'wide')).toBe('Market and price 市場與價格');
    expect(packName({ en: 'CE2010/P2/Q11', zh: 'CE2010/P2/Q11' }, 'bilingual', 'wide')).toBe('CE2010/P2/Q11');
  });

  const papers = papersOf([{ source: sourceOf({ tags: ['DSE2016/P1/Q34'] }) }]);
  const paperSelect = (ui: UiLanguage, language: LanguageMode) =>
    renderToStaticMarkup(
      createElement(UiLanguageOverride.Provider, { value: ui }, createElement(PaperSelect, { filters: NO_FILTERS, papers, language, onChange: () => {} })),
    );

  it('the paper filter names papers in the question language; its label in the interface language', () => {
    const zhUiEnglishQuestions = paperSelect('zh-HK', 'en');
    expect(zhUiEnglishQuestions).toContain('HKDSE 2016 Paper 1');
    expect(zhUiEnglishQuestions).not.toContain('卷一');
    expect(zhUiEnglishQuestions).toContain('試卷');
    const enUiChineseQuestions = paperSelect('en', 'zh');
    expect(enUiChineseQuestions).toContain('香港中學文憑考試 2016 卷一');
    expect(enUiChineseQuestions).toContain('Paper');
  });

  it('no Past paper bank view picks a pack name by the interface language', () => {
    for (const file of ['PastPaperScreen.tsx', 'PastPaperTab.tsx', 'PastPaperIndexCard.tsx', 'PastPaperControls.tsx', 'PastPaperYearPicker.tsx']) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
      expect(source, file).not.toMatch(/=== 'zh-HK' \?[^:]*\.(title|provenance|zh)\b|label\.zh/);
    }
  });
});
