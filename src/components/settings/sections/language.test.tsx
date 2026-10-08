import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UiLanguageOverride } from '@/i18n/language';
import { settingsSections } from '@/settings/sections';
import { AppSettingsDialog } from '../AppSettingsDialog';

describe('the Language section', () => {
  it('registers after Appearance with an Effect, and its pane offers English and 繁體中文', async () => {
    await import('./index');
    expect(settingsSections({ desktop: false }).map((s) => s.id)).toEqual(['ai', 'terms', 'appearance', 'language']);
    const language = settingsSections({ desktop: false })[3];
    expect(language).toMatchObject({ label: { en: 'Language 語言', zh: '語言' } });
    expect(typeof language.Effect).toBe('function');
    const Pane = (await language.load()).default;
    const html = renderToStaticMarkup(<Pane env={{ desktop: false }} setCloseGuard={() => {}} />);
    expect(html).toMatch(/role="radio" aria-checked="true" lang="en"[^>]*>.*English/);
    expect(html).toMatch(/role="radio" aria-checked="false" lang="zh-HK"[^>]*>.*繁體中文/);
  });

  it('keeps the paper language a separate group, English by default', async () => {
    await import('./index');
    const Pane = (await settingsSections({ desktop: false })[3].load()).default;
    const html = renderToStaticMarkup(<Pane env={{ desktop: false }} setCloseGuard={() => {}} />);
    const groups = html.match(/role="radiogroup" aria-label="[^"]*"/g);
    expect(groups).toEqual(['role="radiogroup" aria-label="Interface language"', 'role="radiogroup" aria-label="Paper language"']);
    const papers = html.slice(html.indexOf('aria-label="Paper language"'));
    expect(papers.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(papers).toMatch(/aria-checked="true"[\s\S]*?>EN</);
    expect(papers).toContain('EN+中');
    expect(html).toContain('Each paper can still be switched on its own.');
  });

  it('turns the Settings dialog itself into Chinese', async () => {
    await import('./index');
    const sections = settingsSections({ desktop: false });
    const dialog = (lang: 'en' | 'zh-HK') =>
      renderToStaticMarkup(
        <UiLanguageOverride.Provider value={lang}>
          <AppSettingsDialog sections={sections} env={{ desktop: false }} request={{ section: 'language' }} onClose={() => {}} />
        </UiLanguageOverride.Provider>,
      );
    const en = dialog('en');
    expect(en).toContain('Settings');
    expect(en).toContain('AI &amp; translation');
    expect(en).toContain('Saved in this browser. Applies to every worksheet; never saved in a worksheet.');
    const zh = dialog('zh-HK');
    expect(zh).toContain('設定');
    expect(zh).toContain('AI 與翻譯');
    expect(zh).toContain('外觀');
    expect(zh).toContain('儲存在這個瀏覽器');
    expect(zh).toContain('完成');
    expect(zh).not.toContain('Appearance');
  });
});
