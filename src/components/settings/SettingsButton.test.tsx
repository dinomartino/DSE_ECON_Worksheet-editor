import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerSettingsSection, settingsSections } from '@/settings/sections';
import { useAppDialogs } from '@/store/appDialogs';
import { useBankReturn } from '@/components/bank/page/bankReturn';
import { DEFAULT_FILTERS } from '@/components/bank/page/bankPage';

// A plain read, so the component can be called directly and its button's handler run.
vi.mock('@/settings/sections', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/settings/sections')>();
  return { ...real, useSettingsSections: real.settingsSections };
});

const { SettingsButton } = await import('./SettingsButton');
const { StartScreen } = await import('@/components/start/StartScreen');

const GEAR = /<button type="button" aria-label="Settings"[^>]*data-settings-gear/g;
const gears = (markup: string) => markup.match(GEAR)?.length ?? 0;
const home = () => renderToStaticMarkup(<StartScreen onOpen={() => {}} />);
const bank = () => {
  useBankReturn.getState().set({ level: { kind: 'topics' }, filters: DEFAULT_FILTERS });
  return renderToStaticMarkup(<StartScreen onOpen={() => {}} />);
};
afterEach(() => useBankReturn.getState().clear());

// Order matters: nothing is registered until the third test registers a fake section.
describe('Settings gear', () => {
  it('is absent everywhere with no section registered', () => {
    expect(settingsSections({ desktop: false })).toEqual([]);
    expect(renderToStaticMarkup(<SettingsButton />)).toBe('');
    // `separated` leaves no orphan rule either.
    expect(renderToStaticMarkup(<SettingsButton separated />)).toBe('');
    expect(home()).not.toContain('aria-label="Settings"');
    expect(bank()).not.toContain('aria-label="Settings"');
  });

  it('opens app Settings', () => {
    const gear = SettingsButton({}) as ReactElement<{ label: string; onClick: () => void }>;
    expect(gear).toBeNull();
    registerSettingsSection({
      id: 'fake',
      label: 'Fake',
      description: 'A test section.',
      order: 1,
      load: () => Promise.resolve({ default: () => null }),
    });
    const live = SettingsButton({}) as ReactElement<{ label: string; onClick: () => void }>;
    expect(live.props.label).toBe('Settings');
    live.props.onClick();
    expect(useAppDialogs.getState().open?.kind).toBe('settings');
  });

  it('renders as a labelled gear once a section is registered', () => {
    const markup = renderToStaticMarkup(<SettingsButton />);
    expect(markup).toMatch(/^<button type="button" aria-label="Settings"[^>]*><svg/);
    expect(markup).toContain('<circle cx="12" cy="12" r="3"');
    // Separated: a hidden rule, then the gear, both inside the one outer element.
    expect(renderToStaticMarkup(<SettingsButton separated className="hidden lg:flex" />)).toMatch(
      /^<span class="flex shrink-0 items-center hidden lg:flex"><span aria-hidden="true" class="[^"]*w-px bg-line"><\/span><button type="button" aria-label="Settings"/,
    );
  });

  it('sits top-right on the start screen: the desk header from lg, the panel header when stacked', () => {
    const markup = home();
    // One per layout; CSS shows exactly one at any width.
    expect(gears(markup)).toBe(2);
    // Stacked: the last thing in the panel's header row.
    expect(markup).toMatch(/<header [^>]*>(?:(?!<\/header>).)*class="[^"]*\bml-auto lg:hidden[^"]*"[^>]*data-settings-gear[^>]*>(?:(?!<\/header>).)*<\/svg><\/button><\/header>/);
    // Wide: last in the desk's header row, after the ⋯ menu.
    expect(markup).toMatch(/aria-label="Back up, restore and folders"(?:(?!<main).)*<span class="flex shrink-0 items-center hidden lg:flex">(?:(?!<\/span><\/span><\/div>).)*data-settings-gear/);
    // Not in the panel's footer any more.
    const footer = markup.slice(markup.indexOf('What’s new') - 400, markup.indexOf('</aside>'));
    expect(footer).not.toContain('aria-label="Settings"');
  });

  it('sits at the far right of the question bank header', () => {
    const markup = bank();
    expect(gears(markup)).toBe(1);
    expect(markup).toMatch(/data-settings-gear[^>]*>(?:(?!<\/header>).)*<\/button><\/span><\/header>/);
  });
});
