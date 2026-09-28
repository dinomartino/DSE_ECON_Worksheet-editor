import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerSettingsSection, type CloseGuard, type SettingsSectionDef } from '@/settings/sections';
import { useAppDialogs } from '@/store/appDialogs';
import { AppSettingsDialog, AppSettingsFooter, answerGuard, initialSection } from './AppSettingsDialog';
import { AppSettingsHost } from './AppSettingsHost';

// The section registry is module state; vitest isolates it per file. The zero-section
// cases therefore run first.

const web = { desktop: false };
const loads: string[] = [];
const section = (id: string, order: number, extra: Partial<SettingsSectionDef> = {}): SettingsSectionDef => ({
  id,
  label: `${id} label`,
  hint: `${id} hint`,
  description: `${id} description`,
  order,
  load: () => {
    loads.push(id);
    return Promise.resolve({ default: () => createElement('p', null, `${id} pane`) });
  },
  ...extra,
});
const guard = (run: () => Promise<boolean>): CloseGuard => ({
  message: "You haven't saved this key.",
  save: { label: 'Save & test', run },
});
const footer = (props: Partial<Parameters<typeof AppSettingsFooter>[0]>) =>
  renderToStaticMarkup(
    createElement(AppSettingsFooter, {
      ready: false,
      asking: null,
      guard: null,
      saving: false,
      onClose: () => {},
      onAnswer: () => {},
      ...props,
    }),
  );

afterEach(() => useAppDialogs.setState({ open: null }));

describe('AppSettingsHost with no section registered', () => {
  it('renders nothing, even with a settings request open', () => {
    useAppDialogs.getState().openSettings({ section: 'ai' });
    expect(renderToStaticMarkup(createElement(AppSettingsHost))).toBe('');
  });
});

describe('the Settings dialog', () => {
  it('lists exactly the registered sections, never a placeholder', () => {
    const sections = [section('ai', 10), section('appearance', 20)];
    const html = renderToStaticMarkup(
      createElement(AppSettingsDialog, { sections, env: web, request: {}, onClose: () => {} }),
    );
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html).toContain('ai label');
    expect(html).toContain('appearance label');
    expect(html).toContain('Saved in this browser. Applies to every worksheet; never saved in a worksheet.');
    expect(html).not.toMatch(/coming soon/i);
    expect(loads).toEqual([]);
  });

  it('says "this computer" on desktop', () => {
    const html = renderToStaticMarkup(
      createElement(AppSettingsDialog, { sections: [section('ai', 10)], env: { desktop: true }, request: {}, onClose: () => {} }),
    );
    expect(html).toContain('Saved on this computer.');
  });

  it('opens the deep-linked section, or the first for an unknown id', () => {
    const sections = [section('ai', 10), section('appearance', 20)];
    expect(initialSection(sections, 'appearance')).toBe('appearance');
    expect(initialSection(sections, 'nope')).toBe('ai');
    expect(initialSection(sections)).toBe('ai');
    const html = renderToStaticMarkup(
      createElement(AppSettingsDialog, { sections, env: web, request: { section: 'appearance' }, onClose: () => {} }),
    );
    expect(html).toMatch(/aria-selected="true"[^>]*>(?:(?!<\/button>).)*appearance label/);
  });
});

describe('the Settings footer', () => {
  it('shows Done alone without a pending Translate', () => {
    const html = footer({});
    expect(html).toContain('Done');
    expect(html).not.toContain('Continue');
  });

  it('adds Continue to Translate, disabled with the section hint until ready', () => {
    const blocked = footer({ resume: { label: 'Continue to Translate' }, hint: 'Save & test a key first' });
    expect(blocked).toMatch(/<button[^>]*disabled=""[^>]*title="Save &amp; test a key first"[^>]*>Continue to Translate/);
    expect(blocked).toContain('>Save &amp; test a key first</span>');
    const ready = footer({ resume: { label: 'Continue to Translate' }, ready: true, hint: 'Save & test a key first' });
    expect(ready).not.toContain('disabled=""');
    expect(ready).not.toContain('a key first');
  });

  it('turns into the unsaved-key question while a guard is asking', () => {
    const html = footer({ asking: 'done', guard: guard(async () => true) });
    expect(html).toContain('You haven&#x27;t saved this key.');
    expect(html).toContain('Discard');
    expect(html).toContain('Save &amp; test');
    expect(html).not.toContain('Done');
  });
});

describe('answering the close guard', () => {
  it('proceeds on Discard without saving', async () => {
    const run = vi.fn(async () => true);
    await expect(answerGuard(guard(run), 'discard')).resolves.toBe(true);
    expect(run).not.toHaveBeenCalled();
  });

  it('proceeds only after a successful save', async () => {
    await expect(answerGuard(guard(async () => true), 'save')).resolves.toBe(true);
    await expect(answerGuard(guard(async () => false), 'save')).resolves.toBe(false);
    await expect(answerGuard(guard(() => Promise.reject(new Error('x'))), 'save')).resolves.toBe(false);
  });
});

describe('AppSettingsHost with sections', () => {
  it('mounts each section Effect with the dialog closed, and loads no pane', () => {
    registerSettingsSection(
      section('themed', 5, { Effect: ({ env }) => createElement('i', { 'data-effect': String(env.desktop) }) }),
    );
    registerSettingsSection(section('desk', 6, { available: (env) => env.desktop, Effect: () => createElement('b') }));
    const html = renderToStaticMarkup(createElement(AppSettingsHost));
    expect(html).toBe('<i data-effect="false"></i>');
    expect(loads).toEqual([]);
  });
});
