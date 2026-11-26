/**
 * An edited past-paper copy (k-0559, user u-sqrx) says what it was adapted from on the
 * Question bank page's rail, in the interface language; any other question says nothing.
 * It is bank-only: `pastPaperCopies.test.ts` proves the page, .docx and clipboard never carry it.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UiLanguageOverride } from '@/i18n/language';
import { groupRows } from '@/library/group';
import { row } from '@/library/testKit';
import type { UiLanguage } from '@/settings/language';
import { railOrder, railSections } from './bankScreen';
import { ReviewPage } from './ReviewPage';

const adapted = row({ rootId: 'a', tags: ['C.ped'], languages: ['en'], excerpt: { en: 'My own stem', zh: '' }, adaptedFrom: 'DSE2024/P1/Q38' });
const own = row({ rootId: 'b', tags: ['C.ped'], languages: ['en'], excerpt: { en: 'Written from scratch', zh: '' } });

function rail(ui: UiLanguage, rows = [adapted, own]): string {
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
    expect(rail('en')).toContain('Adapted from DSE2024/P1/Q38');
    expect(rail('en')).toContain('it never prints');
    expect(rail('zh-HK')).toContain('改編自 DSE2024/P1/Q38');
    expect(rail('zh-HK')).toContain('不會印出');
  });

  it('says nothing for a question that is not an edited past paper copy', () => {
    const out = rail('en', [own]);
    expect(out).not.toContain('data-rail-adapted-from');
    expect(out).not.toContain('Adapted from');
  });
});
