import { describe, expect, it } from 'vitest';
// The registry loads first: the model modules below reach back into it and need it whole.
import '@/registry';
import { renderToStaticMarkup } from 'react-dom/server';
import { UiLanguageOverride } from '@/i18n/language';
import type { UiLanguage } from '@/settings/language';
import { SourcePanel } from './SourcePanel';

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
