import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { UiLanguageOverride } from '@/i18n/language';
import PasteImportDialog from './PasteImportDialog';

const render = (lang: 'en' | 'zh-HK') =>
  renderToStaticMarkup(
    <UiLanguageOverride.Provider value={lang}>
      <PasteImportDialog target="paper" onClose={() => {}} />
    </UiLanguageOverride.Provider>,
  );

describe('PasteImportDialog', () => {
  it('opens on the paste box, in either interface language', () => {
    const en = render('en');
    expect(en).toContain('Paste questions');
    expect(en).toContain('Paste here (⌘V)');
    expect(en).toContain('Read questions');
    const zh = render('zh-HK');
    expect(zh).toContain('貼上題目');
    expect(zh).toContain('讀取題目');
    expect(zh).not.toContain('Read questions');
  });
});
