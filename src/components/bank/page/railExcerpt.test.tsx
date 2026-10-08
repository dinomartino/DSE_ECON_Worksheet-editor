/**
 * The review rail names each question in the view language, never the interface's: a
 * 中文 view reads the 中文 excerpt, and the other side only when that one is empty.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UiLanguageOverride } from '@/i18n/language';
import { groupRows } from '@/library/group';
import { row } from '@/library/testKit';
import type { LanguageMode } from '@/model/types';
import type { UiLanguage } from '@/settings/language';
import { railOrder, railSections } from './bankScreen';
import { ReviewPage } from './ReviewPage';

const both = row({ rootId: 'a', tags: ['C.ped'], languages: ['en', 'zh'], excerpt: { en: 'Demand rises when income rises', zh: '收入上升時需求上升' } });
const enOnly = row({ rootId: 'b', tags: ['C.ped'], languages: ['en'], excerpt: { en: 'Supply falls after a tax', zh: '' } });

function rail(ui: UiLanguage, language: LanguageMode): string {
  const sections = railSections(groupRows([both, enOnly]), 'all', ui, language);
  const noop = () => {};
  return renderToStaticMarkup(
    <UiLanguageOverride.Provider value={ui}>
      <ReviewPage
        state={{ sections, order: railOrder(sections), focused: undefined, index: 0, picked: new Set(), railHidden: false, language, version: 'teacher' }}
        fullGroup={undefined}
        empty={null}
        onFocus={noop}
        onStep={noop}
        onPick={noop}
        onRailHidden={noop}
        onLanguage={noop}
        onVersion={noop}
        onOpen={noop}
      />
    </UiLanguageOverride.Provider>,
  );
}

describe('the review rail reads in the view language', () => {
  it('a 中文 view shows the 中文 excerpt, under either interface', () => {
    for (const ui of ['en', 'zh-HK'] as const) {
      const out = rail(ui, 'zh');
      expect(out).toContain('收入上升時需求上升');
      expect(out).not.toContain('Demand rises when income rises');
    }
  });

  it('falls back to English when the 中文 side is empty', () => {
    expect(rail('zh-HK', 'zh')).toContain('Supply falls after a tax');
  });

  it('an English view under a 中文 interface shows English', () => {
    const out = rail('zh-HK', 'en');
    expect(out).toContain('Demand rises when income rises');
    expect(out).not.toContain('收入上升時需求上升');
  });
});
