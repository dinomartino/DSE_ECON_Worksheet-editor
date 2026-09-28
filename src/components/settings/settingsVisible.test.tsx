import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { settingsSections } from '@/settings/sections';
import { MENU_SETTINGS } from '@/components/translate/copy';
import { toolbarMenuEntries } from '@/components/translate/translateMenu';
import { SettingsLink } from '@/components/start/StartScreen';
// The one eager importer: nothing else registers a section.
import './AppSettingsHost';

describe('Settings is visible (§I.1)', () => {
  it('importing only AppSettingsHost registers AI & translation, so every entry point shows', () => {
    const web = settingsSections({ desktop: false });
    expect(web.map((s) => s.id)).toContain('ai');
    expect(settingsSections({ desktop: true }).map((s) => s.id)).toContain('ai');

    expect(renderToStaticMarkup(<SettingsLink />)).toMatch(/<button type="button"[^>]*>Settings<\/button>/);

    const { settings } = toolbarMenuEntries({ worksheetId: 'w', readOnly: false, hasSettings: web.length > 0 });
    expect(settings.map((e) => e.label)).toEqual([MENU_SETTINGS]);
    expect(MENU_SETTINGS).toMatch(/^Settings/);
  });
});
