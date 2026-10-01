import { describe, expect, it } from 'vitest';
import { settingsSections } from '@/settings/sections';

describe('the AI section registration', () => {
  it('registers metadata on import and loads the pane only on demand', async () => {
    expect(settingsSections({ desktop: false })).toEqual([]);
    await import('./ai');
    const [ai] = settingsSections({ desktop: false });
    expect(ai).toMatchObject({ id: 'ai', label: { en: 'AI & translation' }, hint: { en: 'Provider, key, model' } });
    expect(settingsSections({ desktop: true }).map((s) => s.id)).toEqual(['ai']);
    const pane = await ai.load();
    expect(typeof pane.default).toBe('function');
  });
});
