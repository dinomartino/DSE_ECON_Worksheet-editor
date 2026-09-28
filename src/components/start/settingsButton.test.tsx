import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerSettingsSection, settingsSections } from '@/settings/sections';
import { useAppDialogs } from '@/store/appDialogs';

// A plain read, so the component can be called directly and its button's handler run.
vi.mock('@/settings/sections', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/settings/sections')>();
  return { ...real, useSettingsSections: real.settingsSections };
});

const { SettingsButton } = await import('./StartScreen');

describe('start screen Settings gear', () => {
  it('is absent with no section registered, and appears once one is', () => {
    expect(settingsSections({ desktop: false })).toEqual([]);
    expect(renderToStaticMarkup(<SettingsButton />)).toBe('');

    // A fake section; the real one registers through `sections/index.ts` (P-SETTINGS).
    registerSettingsSection({
      id: 'fake',
      label: 'Fake',
      description: 'A test section.',
      order: 1,
      load: () => Promise.resolve({ default: () => null }),
    });
    const markup = renderToStaticMarkup(<SettingsButton />);
    expect(markup).toMatch(/^<button type="button" aria-label="Settings"[^>]*><svg/);
    expect(markup).toContain('<circle cx="12" cy="12" r="3"');
  });

  it('opens app Settings', () => {
    const gear = SettingsButton() as ReactElement<{ label: string; onClick: () => void }>;
    expect(gear.props.label).toBe('Settings');
    gear.props.onClick();
    expect(useAppDialogs.getState().open?.kind).toBe('settings');
  });
});
