import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UiLanguageOverride } from '@/i18n/language';
import type { UiLanguage } from '@/settings/language';
import { EditHint } from './EditHint';

/**
 * "Double-click text to edit" beside the zoom control. On an iPad in portrait the canvas column
 * is about 190px, and the hint, sharing the zoom's line, was squeezed to a 24px sliver under it
 * (k-0197). Below 30rem of column it now stands above the zoom; the widths are checked in Chrome.
 */
const draw = (ui: UiLanguage = 'en') =>
  renderToStaticMarkup(
    <UiLanguageOverride.Provider value={ui}>
      <EditHint onDismiss={() => {}} />
    </UiLanguageOverride.Provider>,
  );

describe('the edit hint', () => {
  it('asks the canvas column’s width, not the window’s', () => {
    expect(draw()).toMatch(/^<div data-print-hide="true" class="@container pointer-events-none absolute inset-x-0 bottom-0 z-30">/);
  });

  it('from 30rem shares the zoom’s line as before, keeping the zoom’s 136px clear', () => {
    const markup = draw();
    expect(markup).toContain('@min-[30rem]:grid @min-[30rem]:grid-cols-[minmax(0,1fr)_auto_minmax(136px,1fr)] @min-[30rem]:items-center @min-[30rem]:pb-[13px]');
    expect(markup).toContain('@min-[30rem]:flex-row @min-[30rem]:flex-wrap');
  });

  it('below that stands right-aligned above the zoom: 16px, its 38px, 8px', () => {
    const markup = draw();
    expect(markup).toContain('class="flex justify-end px-4 pb-[62px] ');
    // The zoom it clears floats 16px up, at the column's right (Preview, AnswerKeyPreview).
    for (const file of ['src/components/preview/Preview.tsx', 'src/components/preview/AnswerKeyPreview.tsx']) {
      expect(readFileSync(file, 'utf8'), file).toContain('fixed bottom-4 right-[416px]');
    }
  });

  it('never breaks a phrase, and keeps its width where the column is narrower than it', () => {
    const markup = draw();
    expect(markup).toMatch(/data-edit-hint="true" class="[^"]*\bshrink-0\b/);
    expect(markup).toContain('<span class="whitespace-nowrap">Double-click text to edit</span>');
    expect(markup).toContain('<span class="whitespace-nowrap text-ink-subtle">按頁面文字即可編輯</span>');
  });

  it('in 中文 says it once', () => {
    const markup = draw('zh-HK');
    expect(markup).toContain('<span class="whitespace-nowrap">按兩下文字即可編輯</span>');
    expect(markup).not.toContain('按頁面文字即可編輯');
  });
});
