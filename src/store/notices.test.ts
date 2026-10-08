import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTION_AUTO_HIDE_MS,
  APP_SCOPE,
  AUTO_HIDE_MS,
  MAX_VISIBLE,
  autoHideDelay,
  autoHides,
  closeNotice,
  dismiss,
  dismissHistoryActions,
  dismissScope,
  holdHistoryNotices,
  notify,
  pruneDeadActions,
  resetNoticesForTest,
  runNoticeAction,
  setNoticeInset,
  useNoticeStore,
} from './notices';

const list = () => useNoticeStore.getState().notices;

beforeEach(resetNoticesForTest);

describe('notices', () => {
  it('stacks distinct notices and returns their ids', () => {
    const a = notify({ tone: 'info', body: 'Saved' });
    const b = notify({ tone: 'error', body: 'Could not save' });
    expect(a).not.toBe(b);
    expect(list().map((n) => n.body)).toEqual(['Saved', 'Could not save']);
    expect(list()[0]).toMatchObject({ scope: APP_SCOPE, dismissible: true });
  });

  it('the same id replaces in place, and restarts its clock', () => {
    notify({ id: 'r', tone: 'info', body: 'One' });
    notify({ tone: 'info', body: 'Other' });
    notify({ id: 'r', tone: 'success', body: 'Two' });
    expect(list().map((n) => n.body)).toEqual(['Two', 'Other']);
    expect(list()[0].rev).toBe(2);
  });

  it('the same text in the same place re-flashes rather than stacking', () => {
    notify({ tone: 'success', body: 'Copied' });
    notify({ tone: 'success', body: 'Copied' });
    expect(list()).toHaveLength(1);
    notify({ tone: 'success', body: 'Copied', scope: 'dialog-1' });
    expect(list()).toHaveLength(2);
  });

  it('only plain info and success fade; warnings, errors and actions stay', () => {
    expect(autoHides({ tone: 'info' })).toBe(true);
    expect(autoHides({ tone: 'success', actions: [] })).toBe(true);
    expect(autoHides({ tone: 'warning' })).toBe(false);
    expect(autoHides({ tone: 'error' })).toBe(false);
    expect(autoHides({ tone: 'success', actions: [{ label: 'Show in Finder', run: () => {} }] })).toBe(false);
  });

  it('a convenience button (autoHide) still fades, later; never a warning or an error', () => {
    const reveal = [{ label: 'Show in Finder', run: () => {} }];
    expect(autoHides({ tone: 'success', actions: reveal, autoHide: true })).toBe(true);
    expect(autoHides({ tone: 'warning', actions: reveal, autoHide: true })).toBe(false);
    expect(autoHides({ tone: 'error', autoHide: true })).toBe(false);
    expect(autoHideDelay({ actions: reveal })).toBe(ACTION_AUTO_HIDE_MS);
    expect(autoHideDelay({})).toBe(AUTO_HIDE_MS);
    expect(ACTION_AUTO_HIDE_MS).toBeGreaterThan(AUTO_HIDE_MS);
  });

  it('past the cap, the oldest fading notice goes first; sticky ones are kept', () => {
    expect(MAX_VISIBLE).toBe(4);
    notify({ tone: 'error', body: 'E1' });
    for (const body of ['I1', 'I2', 'I3', 'I4']) notify({ tone: 'info', body });
    notify({ tone: 'error', body: 'E2' });
    expect(list().map((n) => n.body)).toEqual(['E1', 'I3', 'I4', 'E2']);
    // All sticky: nothing is dropped; the stack shows the newest and "+N more".
    for (const body of ['E3', 'E4', 'E5']) notify({ tone: 'error', body });
    expect(list().filter((n) => n.tone === 'error')).toHaveLength(5);
  });

  it('closing runs onDismiss; a programmatic dismiss does not', () => {
    const onDismiss = vi.fn();
    const id = notify({ tone: 'info', body: 'Update ready', onDismiss });
    dismiss(id);
    expect(onDismiss).not.toHaveBeenCalled();
    notify({ id, tone: 'info', body: 'Update ready', onDismiss });
    closeNotice(id);
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(list()).toHaveLength(0);
  });

  it('an action closes its notice unless it keeps it open', () => {
    const run = vi.fn();
    const id = notify({ tone: 'info', body: 'Ready', actions: [{ label: 'Restart', run, keepOpen: true }] });
    runNoticeAction(id, list()[0].actions![0]);
    expect(run).toHaveBeenCalledOnce();
    expect(list()).toHaveLength(1);
    runNoticeAction(id, { label: 'Later', run });
    expect(list()).toHaveLength(0);
  });

  it('a dialog closing takes its notices, and only its notices', () => {
    notify({ tone: 'info', body: 'App' });
    notify({ tone: 'error', body: 'In dialog', scope: 'd1' });
    dismissScope('d1');
    expect(list().map((n) => n.body)).toEqual(['App']);
  });

  it('drops a notice whose Undo no longer applies', () => {
    let live = true;
    notify({ tone: 'info', body: 'Replaced 2 terms', actions: [{ label: 'Undo', run: () => {}, live: () => live }] });
    notify({ tone: 'info', body: 'Other' });
    pruneDeadActions();
    expect(list()).toHaveLength(2);
    live = false;
    pruneDeadActions();
    expect(list().map((n) => n.body)).toEqual(['Other']);
  });

  it('an editor going away takes every Undo with it, live or not', () => {
    notify({ tone: 'info', body: 'Replaced 2 terms', actions: [{ label: 'Undo', run: () => {}, live: () => true }] });
    notify({ tone: 'success', body: 'Saved', actions: [{ label: 'Show in Finder', run: () => {} }] });
    notify({ tone: 'error', body: 'Could not sync' });
    dismissHistoryActions();
    expect(list().map((n) => n.body)).toEqual(['Saved', 'Could not sync']);
  });

  it('holdHistoryNotices prunes on each history move and clears on teardown', () => {
    let move: () => void = () => {};
    const stop = vi.fn();
    const release = holdHistoryNotices((onMove) => {
      move = onMove;
      return stop;
    });
    let live = true;
    notify({ tone: 'info', body: 'Translated', actions: [{ label: 'Undo', run: () => {}, live: () => live }] });
    notify({ tone: 'info', body: 'Replaced', actions: [{ label: 'Undo', run: () => {}, live: () => true }] });
    live = false;
    move();
    expect(list().map((n) => n.body)).toEqual(['Replaced']);
    release();
    expect(stop).toHaveBeenCalledOnce();
    expect(list()).toHaveLength(0);
  });

  it('keeps a docked bar clear, per owner', () => {
    setNoticeInset('tray', 142);
    expect(useNoticeStore.getState().insets).toEqual({ tray: 142 });
    setNoticeInset('tray', undefined);
    expect(useNoticeStore.getState().insets).toEqual({});
  });
});

/**
 * Guard: a dismissible or transient notice goes through `notify()`, never inline
 * (SYSTEM_ARCHITECTURE.md § Notices). The inline banner's signature was a live region
 * on a tinted box (danger, accent) or one sliding into the flow; none may come back.
 * Persistent state notices (warn tint) and field validation stay inline by design.
 */
describe('no inline notice banners', () => {
  const root = path.resolve(__dirname, '../components');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return files(full);
      return name.endsWith('.tsx') && !name.includes('.test.') ? [full] : [];
    });
  const opening = /<(?:p|div|span|ul|section)\s[^>]*\brole=(?:"(?:alert|status)"|\{[^}]*\})[^>]*>/g;
  const banner = /bg-danger-soft|bg-accent-soft|animate-slide-down-in/;
  // Persistent, never dismissible: the read-only state lasts while the document is open,
  // and the bar is there from the editor's first paint (classified in § Notices).
  const allowed = [path.join('editor', 'NewerVersionNotice.tsx'), path.join('ui', 'NoticeLayer.tsx')];

  it('finds the component tree', () => {
    expect(files(root).length).toBeGreaterThan(50);
  });

  it('no live region is drawn as an inline banner', () => {
    const offenders = files(root)
      .filter((file) => !allowed.some((name) => file.endsWith(name)))
      .flatMap((file) =>
        [...readFileSync(file, 'utf8').matchAll(opening)]
          .filter((match) => banner.test(match[0]))
          .map((match) => `${path.relative(root, file)}: ${match[0].slice(0, 80)}`),
      );
    expect(offenders).toEqual([]);
  });
});
