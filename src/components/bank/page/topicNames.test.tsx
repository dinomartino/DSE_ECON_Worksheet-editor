/**
 * Topic names are paper words: they follow the language the questions are shown in, never
 * the interface. The chrome around them (counts, headings) stays in the interface language.
 */
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UiLanguageOverride } from '@/i18n/language';
import { row } from '@/library/testKit';
import { createMcqQuestion } from '@/model/factories';
import { topicNamesFor } from '@/model/topics';
import type { LanguageMode } from '@/model/types';
import type { UiLanguage } from '@/settings/language';
import { ViewLanguageProvider } from '@/settings/paperLanguage';
import { cartTopicLabel } from './bankCart';
import { coverage } from './bankPage';
import { railSections } from './bankScreen';
import { groupRows } from '@/library/group';
import { CoverageBar } from './CoverageBar';
import { TopicCards } from './TopicCards';

const rows = [row({ rootId: 'a', typeId: createMcqQuestion().type, tags: ['C.ped'] })];
const cover = coverage(rows);

function render(ui: UiLanguage, view: LanguageMode, node: ReactNode): string {
  return renderToStaticMarkup(
    <UiLanguageOverride.Provider value={ui}>
      <ViewLanguageProvider value={view}>{node}</ViewLanguageProvider>
    </UiLanguageOverride.Provider>,
  );
}

const cards = (ui: UiLanguage, view: LanguageMode) =>
  render(ui, view, <TopicCards coverage={cover} onTopic={() => {}} onUntagged={() => {}} onAll={() => {}} onClassGap={() => {}} />);

describe('topic names follow the view language', () => {
  it('reads one side for one language, both only where there is room', () => {
    expect(topicNamesFor('en')).toBe('en');
    expect(topicNamesFor('zh', 'wide')).toBe('zh');
    expect(topicNamesFor('bilingual', 'wide')).toBe('both');
    expect(topicNamesFor('bilingual')).toBe('en');
  });

  it('a 中文 interface showing English questions names topics in English, counts in 中文', () => {
    const out = cards('zh-HK', 'en');
    expect(out).toContain('Market and Price');
    expect(out).not.toContain('市場與價格');
    expect(out).toContain('條題目');
  });

  it('an English interface showing 中文 questions names topics in 中文, counts in English', () => {
    const out = cards('en', 'zh');
    expect(out).toContain('市場與價格');
    expect(out).not.toContain('Market and Price');
    expect(out).toMatch(/question/);
    expect(out).not.toContain('條題目');
  });

  it('both languages: a card shows both, a one-line label one side', () => {
    const out = cards('zh-HK', 'bilingual');
    expect(out).toContain('Market and Price');
    expect(out).toContain('市場與價格');
    expect(cartTopicLabel(['C.ped'], 'bilingual')).toBe('C · Price elasticity of demand');
    expect(railSections(groupRows(rows), 'all', 'zh-HK', 'bilingual')[0].label).toBe('C · Market and Price');
  });

  it('the coverage strip names its bars in the view language under a 中文 heading', () => {
    const out = render('zh-HK', 'en', <CoverageBar coverage={cover} onTopic={() => {}} />);
    expect(out).toContain('涵蓋');
    expect(out).toContain('Market and Price');
    expect(out).not.toContain('市場與價格');
  });

  it('with no view decided, the paper language (English by default) names them', () => {
    const out = renderToStaticMarkup(
      <UiLanguageOverride.Provider value="zh-HK">
        <TopicCards coverage={cover} onTopic={() => {}} onUntagged={() => {}} onAll={() => {}} onClassGap={() => {}} />
      </UiLanguageOverride.Provider>,
    );
    expect(out).toContain('Market and Price');
  });
});
