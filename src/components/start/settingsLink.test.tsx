import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerSettingsSection, settingsSections } from '@/settings/sections';
import { SettingsLink } from './StartScreen';

describe('start screen Settings link', () => {
  it('is absent with no section registered, and appears once one is', () => {
    expect(settingsSections({ desktop: false })).toEqual([]);
    expect(renderToStaticMarkup(<SettingsLink />)).toBe('');

    // A fake section; the real one registers through `sections/index.ts` (P-SETTINGS).
    registerSettingsSection({
      id: 'fake',
      label: 'Fake',
      description: 'A test section.',
      order: 1,
      load: () => Promise.resolve({ default: () => null }),
    });
    expect(renderToStaticMarkup(<SettingsLink />)).toMatch(/<button type="button"[^>]*>Settings<\/button>/);
  });
});
