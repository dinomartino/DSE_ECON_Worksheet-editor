import { describe, expect, it, vi } from 'vitest';
// The registry loads first: the model modules below reach back into it and need it whole.
import '@/registry';
import { renderToStaticMarkup } from 'react-dom/server';
import { UiLanguageOverride } from '@/i18n/language';
import { createStructuredQuestion, createWorksheet } from '@/model/factories';
import type { Worksheet } from '@/model/types';
import { withOptionLayouts } from '@/registry/mcqLayouts';
import type { UiLanguage } from '@/settings/language';
import { withFlow } from '@/test/fixtures';
import { buildOptionLayoutPaper } from '@/test/optionLayoutFixture';

const store: { worksheet: Worksheet; readOnly: boolean } = { worksheet: createWorksheet(), readOnly: false };
vi.mock('@/store/worksheetStore', () => ({
  useWorksheetStore: Object.assign((select: (s: typeof store) => unknown) => select(store), { getState: () => store }),
}));

const { OptionLayoutField } = await import('./OptionLayoutField');

/**
 * Setup → Option layout for all MC questions, as drawn: four buttons under a line saying how
 * the paper stands. The click itself is `optionLayoutAction.test.ts`; this is what is on offer.
 */

function draw(worksheet: Worksheet, ui: UiLanguage = 'en', readOnly = false): string {
  store.worksheet = worksheet;
  store.readOnly = readOnly;
  return renderToStaticMarkup(
    <UiLanguageOverride.Provider value={ui}>
      <OptionLayoutField />
    </UiLanguageOverride.Provider>,
  );
}

/** Each button as `label` or `label (disabled)`, in order. */
function buttons(markup: string): string[] {
  return [...markup.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map(
    ([, attributes, label]) => `${label.replace(/<[^>]+>/g, '')}${/\sdisabled(=|\s|>)/.test(`${attributes}>`) ? ' (disabled)' : ''}`,
  );
}

const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('the option layout block in Setup', () => {
  const { worksheet } = buildOptionLayoutPaper();

  it('offers Fit each question first, then the three layouts', () => {
    expect(buttons(draw(worksheet))).toEqual(['Fit each question', 'All stacked', 'All in a row', 'All 2 columns']);
  });

  it('says what it does, and what it replaces, in the hint', () => {
    const shown = text(draw(worksheet));
    expect(shown).toContain('Option layout for all MC questions');
    expect(shown).toContain('replacing layouts you chose one by one');
    expect(shown).toContain('Undo puts them back');
    expect(shown).toContain('figure options never go in a row');
  });

  it('tells each button’s effect on hover', () => {
    const markup = draw(worksheet);
    expect(markup).toContain('title="Give each question the layout that suits how long its options are"');
    expect(markup).toContain('title="One option per line in every MC question"');
    expect(markup).toContain('title="All the options on one line in every MC question"');
    expect(markup).toContain('title="Two options per line in every MC question"');
  });

  it('says how the paper stands now, and follows it', () => {
    expect(text(draw(worksheet))).toContain('Now: 4 stacked');
    expect(text(draw(withOptionLayouts(worksheet, 'fit', 'en')))).toContain('Now: 1 stacked · 1 in a row · 2 in two columns');
    expect(text(draw(withOptionLayouts(worksheet, 'columns2', 'en')))).toContain('Now: 4 in two columns');
  });

  it('announces a change to the line, for a screen reader', () => {
    expect(draw(worksheet)).toMatch(/<p[^>]*aria-live="polite"[^>]*>Now: /);
  });

  it('groups the buttons under the block’s name', () => {
    expect(draw(worksheet)).toMatch(/role="group" aria-label="Option layout for all MC questions"/);
  });

  it('is not there on a paper with no MC question', () => {
    expect(draw(withFlow(createWorksheet(), [createStructuredQuestion()]))).toBe('');
  });

  it('leaves the buttons off, not hidden, on a paper that cannot be edited', () => {
    expect(buttons(draw(worksheet, 'en', true))).toEqual([
      'Fit each question (disabled)',
      'All stacked (disabled)',
      'All in a row (disabled)',
      'All 2 columns (disabled)',
    ]);
  });
});

describe('in 繁體中文', () => {
  const { worksheet } = buildOptionLayoutPaper();

  it('reads in the draft wording the user approved', () => {
    const markup = draw(worksheet, 'zh-HK');
    expect(buttons(markup)).toEqual(['配合各題內容', '全部直列', '全部橫列', '全部兩欄']);
    expect(text(markup)).toContain('全部 MC 題的選項排列');
    expect(text(markup)).toContain('目前：4 題直列');
  });

  it('keeps MC and the numbers in the counts', () => {
    expect(text(draw(withOptionLayouts(worksheet, 'fit', 'en'), 'zh-HK'))).toContain('目前：1 題直列 · 1 題橫列 · 2 題兩欄');
  });
});
