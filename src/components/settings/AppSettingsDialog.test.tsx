import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerSettingsSection, type CloseGuard, type SettingsSectionDef } from '@/settings/sections';
import { useAppDialogs } from '@/store/appDialogs';
import { AppSettingsDialog, AppSettingsFooter, answerGuard, closeStep, initialSection } from './AppSettingsDialog';
import { AppSettingsHost } from './AppSettingsHost';

// The section registry is module state; vitest isolates it per file. The zero-section
// cases therefore run first.

const web = { desktop: false };
const section = (id: string, order: number, extra: Partial<SettingsSectionDef> = {}): SettingsSectionDef => ({
  id,
  label: `${id} label`,
  hint: `${id} hint`,
  description: `${id} description`,
  order,
  load: () => Promise.resolve({ default: () => createElement('p', null, `${id} pane`) }),
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
    // One pane, the shown section's: the other is a tab label only.
    expect(html.match(/Loading…/g)).toHaveLength(1);
    expect(html).toContain('ai description');
    expect(html).not.toContain('appearance description');
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

describe('every route out of the dialog', () => {
  const at = (patch: Partial<Parameters<typeof closeStep>[0]> = {}) => ({
    asking: null,
    saving: false,
    guarded: false,
    ready: true,
    ...patch,
  });

  it('closes at once without an unsaved key', () => {
    expect(closeStep(at(), 'done')).toEqual({ close: true, resume: false });
    expect(closeStep(at(), 'dismiss')).toEqual({ close: true, resume: false });
    expect(closeStep(at(), 'resume')).toEqual({ close: true, resume: true });
    expect(closeStep(at({ ready: false }), 'resume')).toEqual({ close: false, asking: null });
  });

  it('asks first over an unsaved key: Done, Continue, Escape, ✕ and the scrim', () => {
    const guarded = at({ guarded: true });
    expect(closeStep(guarded, 'done')).toEqual({ close: false, asking: 'done' });
    expect(closeStep(guarded, 'resume')).toEqual({ close: false, asking: 'resume' });
    expect(closeStep(guarded, 'dismiss')).toEqual({ close: false, asking: 'done' });
  });

  it('drops the question on a second Escape, and ignores everything while saving', () => {
    expect(closeStep(at({ guarded: true, asking: 'resume' }), 'dismiss')).toEqual({ close: false, asking: null });
    const saving = at({ guarded: true, asking: 'done', saving: true });
    for (const input of ['done', 'resume', 'dismiss', { answered: true }] as const) {
      expect(closeStep(saving, input)).toEqual({ close: false, asking: 'done' });
    }
  });

  it('closes after Discard or a successful save, and stays after a failed save', () => {
    const asking = at({ guarded: true, asking: 'resume' });
    expect(closeStep(asking, { answered: true })).toEqual({ close: true, resume: true });
    expect(closeStep(at({ guarded: true, asking: 'done' }), { answered: true })).toEqual({ close: true, resume: false });
    expect(closeStep(asking, { answered: false })).toEqual({ close: false, asking: null });
    expect(closeStep(at({ guarded: true }), { answered: true })).toEqual({ close: false, asking: null });
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
  });
});
