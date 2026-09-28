import { describe, expect, it } from 'vitest';
import { settingsSections } from '@/settings/sections';

describe('the Appearance section registration', () => {
  it('registers after AI with an app-wide Effect, and loads the pane only on demand', async () => {
    await import('./appearance');
    await import('./ai');
    for (const desktop of [false, true]) {
      expect(settingsSections({ desktop }).map((s) => s.id)).toEqual(['ai', 'appearance']);
    }
    const appearance = settingsSections({ desktop: false })[1];
    expect(appearance).toMatchObject({ label: 'Appearance', hint: 'Light, dark or system' });
    expect(typeof appearance.Effect).toBe('function');
    expect(typeof (await appearance.load()).default).toBe('function');
  });
});
