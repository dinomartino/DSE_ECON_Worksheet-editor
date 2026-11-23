import { describe, expect, it, vi } from 'vitest';
// The registry loads first: the model modules below reach back into it and need it whole.
import '@/registry';
import { renderToStaticMarkup } from 'react-dom/server';
import { UiLanguageOverride } from '@/i18n/language';
import type { UiLanguage } from '@/settings/language';
import type { StudioForm } from '@/questionStudio/session';
import { SourcePanel } from './SourcePanel';

// A server render reads a store's initial state, so the studio's form is set through a
// thin stand-in for the live session: the real one, with `form` patched where a test asks.
const patch = vi.hoisted(() => ({ form: undefined as Partial<StudioForm> | undefined }));
vi.mock('@/questionStudio/live', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/questionStudio/live')>();
  const live = real.useStudio;
  const state = () => {
    const now = live.getState();
    return patch.form ? { ...now, form: { ...now.form, ...patch.form } } : now;
  };
  const useStudio = Object.assign(<T,>(selector: (s: ReturnType<typeof state>) => T) => selector(state()), { ...live, getState: state });
  return { ...real, useStudio };
});

const panel = (onTrialOff?: () => void, ui: UiLanguage = 'en') =>
  renderToStaticMarkup(
    <UiLanguageOverride.Provider value={ui}>
      <SourcePanel pastPapersOn={false} onGoTo={() => {}} onTrialOff={onTrialOff} />
    </UiLanguageOverride.Provider>,
  );

describe('the studio’s foot line', () => {
  it('says nothing is sent until Write, and offers to turn the trial off where the studio is opt-in', () => {
    const html = panel(() => {});
    expect(html).toContain('Trial: nothing here is saved or sent until you press Write.');
    expect(html).toContain('data-studio-trial-off');
    expect(html).toContain('Turn the trial off');
  });

  it('has no off button in a develop build: the desktop app has no address bar to bring the studio back', () => {
    const html = panel(undefined);
    expect(html).toContain('Trial: nothing here is saved or sent until you press Write.');
    expect(html).not.toContain('data-studio-trial-off');
    expect(html).not.toContain('Turn the trial off');
  });

  it('is in Hong Kong Chinese for a Chinese interface, with the button or without it', () => {
    expect(panel(() => {}, 'zh-HK')).toContain('關閉試用');
    const bare = panel(undefined, 'zh-HK');
    expect(bare).toContain('試用：按「擬題」之前，這裏不會儲存或傳送任何內容。');
    expect(bare).not.toContain('關閉試用');
  });
});

describe('syllabus names follow the studio’s language, not the interface (k-0500)', () => {
  const withForm = (language: 'en' | 'zh' | 'bilingual', ui: UiLanguage) => {
    patch.form = { language, keyPoint: 'C.individual-demand' };
    try {
      return panel(undefined, ui);
    } finally {
      patch.form = undefined;
    }
  };

  it('an English studio in a 中文 interface: English topic, key-point and point names, 中文 headings', () => {
    const html = withForm('en', 'zh-HK');
    expect(html).toContain('Market and Price');
    expect(html).toContain('Law of Demand');
    expect(html).toContain('Factors affecting individual demand');
    expect(html).not.toContain('市場與價格');
    expect(html).not.toContain('需求定律');
    expect(html).not.toContain('影響個別需求的因素');
    expect(html).toContain('學習要點');
  });

  it('a 中文 studio in an English interface: 中文 names, English headings', () => {
    const html = withForm('zh', 'en');
    expect(html).toContain('市場與價格');
    expect(html).toContain('需求定律');
    expect(html).toContain('影響個別需求的因素');
    expect(html).not.toContain('Market and Price');
    expect(html).not.toContain('Factors affecting individual demand');
    expect(html).toContain('Key point');
  });

  it('both languages: both names', () => {
    const html = withForm('bilingual', 'zh-HK');
    expect(html).toContain('Law of Demand 需求定律');
    expect(html).toContain('Market and Price 市場與價格');
    expect(html).toContain('Factors affecting individual demand 影響個別需求的因素');
  });
});
