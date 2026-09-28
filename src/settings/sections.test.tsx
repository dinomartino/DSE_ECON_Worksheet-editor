import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  registerSettingsSection,
  settingsSections,
  useSettingsSections,
  type SettingsSectionDef,
} from './sections';

// The registry is module state; vitest isolates it per file.

const pane = () => Promise.resolve({ default: () => null });
const def = (id: string, order: number, extra: Partial<SettingsSectionDef> = {}): SettingsSectionDef => ({
  id,
  label: id,
  description: `${id} settings`,
  order,
  load: pane,
  ...extra,
});

const web = { desktop: false };
const desktop = { desktop: true };

function Rail({ env }: { env: { desktop: boolean } }) {
  const sections = useSettingsSections(env);
  return createElement('ul', null, sections.map((s) => createElement('li', { key: s.id }, s.label)));
}

describe('the Settings section registry', () => {
  it('starts empty, so every entry point can hide itself', () => {
    expect(settingsSections(web)).toEqual([]);
    expect(renderToStaticMarkup(createElement(Rail, { env: web }))).toBe('<ul></ul>');
  });

  it('sorts by order and filters by availability', () => {
    registerSettingsSection(def('b', 20));
    registerSettingsSection(def('a', 10));
    registerSettingsSection(def('desk', 15, { available: (env) => env.desktop }));
    expect(settingsSections(web).map((s) => s.id)).toEqual(['a', 'b']);
    expect(settingsSections(desktop).map((s) => s.id)).toEqual(['a', 'desk', 'b']);
  });

  it('replaces a def registered again under the same id', () => {
    registerSettingsSection(def('a', 10, { label: 'Again' }));
    const ids = settingsSections(web).map((s) => s.id);
    expect(ids.filter((id) => id === 'a')).toHaveLength(1);
    expect(settingsSections(web).find((s) => s.id === 'a')?.label).toBe('Again');
  });

  it('renders through the hook with a stable snapshot', () => {
    expect(renderToStaticMarkup(createElement(Rail, { env: web }))).toBe('<ul><li>Again</li><li>b</li></ul>');
    expect(renderToStaticMarkup(createElement(Rail, { env: desktop }))).toBe(
      '<ul><li>Again</li><li>desk</li><li>b</li></ul>',
    );
  });
});
