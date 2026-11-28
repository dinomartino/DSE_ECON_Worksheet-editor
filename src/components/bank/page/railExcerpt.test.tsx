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

/**
 * An edited past-paper copy (k-0559, user u-sqrx) says what it was adapted from on the
 * Question bank page's rail, in the interface language; any other question says nothing.
 * It is bank-only: `pastPaperCopies.test.ts` proves the page, .docx and clipboard never carry it.
 */
const adapted = row({ rootId: 'a', tags: ['C.ped'], languages: ['en'], excerpt: { en: 'My own stem', zh: '' }, adaptedFrom: 'DSE2024/P1/Q38' });
const own = row({ rootId: 'b', tags: ['C.ped'], languages: ['en'], excerpt: { en: 'Written from scratch', zh: '' } });

function railRa(ui: UiLanguage, rows = [adapted, own]): string {
  const sections = railSections(groupRows(rows), 'all', ui, 'en');
  const noop = () => {};
  return renderToStaticMarkup(
    <UiLanguageOverride.Provider value={ui}>
      <ReviewPage
        state={{ sections, order: railOrder(sections), focused: undefined, index: 0, picked: new Set(), railHidden: false, language: 'en', version: 'teacher' }}
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

describe('"Adapted from" on the Question bank page (k-0559)', () => {
  it('names the source in English and 中文', () => {
    expect(railRa('en')).toContain('Adapted from DSE2024/P1/Q38');
    expect(railRa('en')).toContain('it never prints');
    expect(railRa('zh-HK')).toContain('改編自 DSE2024/P1/Q38');
    expect(railRa('zh-HK')).toContain('不會印出');
  });

  it('says nothing for a question that is not an edited past paper copy', () => {
    const out = railRa('en', [own]);
    expect(out).not.toContain('data-rail-adapted-from');
    expect(out).not.toContain('Adapted from');
  });
});
