import { describe, expect, it } from 'vitest';
import { SPLASH_BOOT_SCRIPT, SPLASH_HTML, splashMode, type SplashInput } from './splash';

const input = (over: Partial<SplashInput> = {}): SplashInput => ({
  search: '',
  webdriver: false,
  seen: () => false,
  reducedMotion: false,
  ...over,
});

describe('splashMode', () => {
  it('plays once per session', () => {
    expect(splashMode(input())).toBe('play');
    expect(splashMode(input({ seen: () => true }))).toBe('skip');
  });

  it('plays when storage throws', () => {
    expect(
      splashMode(
        input({
          seen: () => {
            throw new Error('SecurityError');
          },
        }),
      ),
    ).toBe('play');
  });

  it('skips under automation, and on ?nosplash', () => {
    expect(splashMode(input({ webdriver: true }))).toBe('skip');
    expect(splashMode(input({ search: '?nosplash' }))).toBe('skip');
    expect(splashMode(input({ search: '?a=1&nosplash=1' }))).toBe('skip');
  });

  it('?splash=1 plays under automation and after it has played, but never over ?nosplash', () => {
    expect(splashMode(input({ search: '?splash=1', webdriver: true, seen: () => true }))).toBe('play');
    expect(splashMode(input({ search: '?splash=1&nosplash', webdriver: true }))).toBe('skip');
    expect(splashMode(input({ search: '?splash=0', webdriver: true }))).toBe('skip');
  });

  it('fades instead of drawing under reduced motion', () => {
    expect(splashMode(input({ reducedMotion: true }))).toBe('reduce');
    expect(splashMode(input({ reducedMotion: true, search: '?splash=1', webdriver: true }))).toBe('reduce');
    expect(splashMode(input({ reducedMotion: true, seen: () => true }))).toBe('skip');
  });
});

/** Runs the inline boot script far enough to see what it decided and stored. */
function boot({ search = '', webdriver = false, stored = null as string | null, blocked = false, reduce = false }) {
  const attrs: Record<string, string> = {};
  const writes: string[] = [];
  const storage = {
    getItem: () => {
      if (blocked) throw new Error('SecurityError');
      return stored;
    },
    setItem: (_: string, v: string) => {
      if (blocked) throw new Error('SecurityError');
      writes.push(v);
    },
  };
  const noop = () => {};
  const document = {
    documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v), removeAttribute: noop },
    addEventListener: noop,
    getElementById: () => null,
  };
  const window = {
    matchMedia: (q: string) => ({ matches: reduce && q === '(prefers-reduced-motion: reduce)' }),
    addEventListener: noop,
  };
  const timers: unknown[] = [];
  new Function('document', 'window', 'location', 'navigator', 'sessionStorage', 'setTimeout', SPLASH_BOOT_SCRIPT)(
    document,
    window,
    { search },
    { webdriver },
    storage,
    (fn: unknown) => timers.push(fn),
  );
  return { mode: attrs['data-splash'], writes };
}

describe('SPLASH_BOOT_SCRIPT', () => {
  it('runs standalone and agrees with splashMode', () => {
    expect(boot({})).toEqual({ mode: 'play', writes: ['1'] });
    expect(boot({ stored: '1' })).toEqual({ mode: undefined, writes: [] });
    expect(boot({ blocked: true })).toEqual({ mode: 'play', writes: [] });
    expect(boot({ webdriver: true })).toEqual({ mode: undefined, writes: [] });
    expect(boot({ webdriver: true, search: '?splash=1' }).mode).toBe('play');
    expect(boot({ search: '?nosplash' }).mode).toBeUndefined();
    expect(boot({ reduce: true }).mode).toBe('reduce');
  });
});

describe('SPLASH_HTML', () => {
  it('is hidden from assistive tech and from print', () => {
    expect(SPLASH_HTML).toMatch(/^<div id="launch-splash" aria-hidden="true" data-print-hide>/);
    // Nothing in it can take focus.
    expect(SPLASH_HTML).not.toMatch(/tabindex|<a |<button|<input/i);
  });
});
