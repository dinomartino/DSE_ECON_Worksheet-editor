import { describe, expect, it, vi } from 'vitest';
import '@/registry';
import { renderToStaticMarkup } from 'react-dom/server';
import { UiLanguageOverride } from '@/i18n/language';
import { createWorksheetFrom } from '@/model/newWorksheet';
import type { Worksheet } from '@/model/types';
import type { UiLanguage } from '@/settings/language';

const store = {
  worksheet: createWorksheetFrom({ documentType: 'classroom', seedSample: false }) as Worksheet,
  commit: () => {},
};
vi.mock('@/store/worksheetStore', () => ({
  useWorksheetStore: (select: (s: typeof store) => unknown) => select(store),
}));

const { StartEveryQuestionField } = await import('./StartEveryQuestionField');

function draw(worksheet: Worksheet, ui: UiLanguage = 'en'): string {
  store.worksheet = worksheet;
  return renderToStaticMarkup(
    <UiLanguageOverride.Provider value={ui}>
      <StartEveryQuestionField />
    </UiLanguageOverride.Provider>,
  );
}
const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const ticked = (markup: string) => /<input[^>]*checked/.test(markup);

describe('Start every question on a new page in Setup', () => {
  const base = createWorksheetFrom({ documentType: 'lqWorksheet', seedSample: false });

  it('reads off by default and ticked when the paper has it', () => {
    expect(ticked(draw(base))).toBe(false);
    expect(ticked(draw({ ...base, startEveryQuestionOnNewPage: true }))).toBe(true);
  });

  it('is labelled in English and Hong Kong Traditional Chinese, with a hint', () => {
    expect(text(draw(base))).toContain('Start every question on a new page');
    const zh = text(draw(base, 'zh-HK'));
    expect(zh).toContain('每題由新頁開始');
    expect(zh).toContain('新頁面');
  });
});
