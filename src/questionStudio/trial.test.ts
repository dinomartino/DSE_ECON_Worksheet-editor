import { afterEach, describe, expect, it, vi } from 'vitest';
import { appSettings } from '@/settings/store';
import { STUDIO_TRIAL_SETTINGS, applyTrialRequest, readTrialRequest, setStudioTrial, studioDefaultOn, studioTrialOn } from './trial';

afterEach(() => {
  appSettings.reset(STUDIO_TRIAL_SETTINGS);
  delete process.env.NEXT_PUBLIC_RELEASE_BUILD;
  vi.resetModules();
});

const addressOf = (search: string) =>
  ({ location: { search, pathname: '/', hash: '' }, history: { state: null, replaceState: () => {} } }) as unknown as Pick<Window, 'location' | 'history'>;

describe('the trial switch', () => {
  it('shows the studio in a develop build without anyone turning it on (these tests run as one)', () => {
    expect(studioDefaultOn()).toBe(true);
    expect(STUDIO_TRIAL_SETTINGS.defaults({ desktop: false })).toEqual({ on: true });
    expect(studioTrialOn()).toBe(true);
  });

  it('stays where it was put, and Reset goes back to what the build shows', () => {
    setStudioTrial(false);
    expect(studioTrialOn()).toBe(false);
    setStudioTrial(true);
    expect(studioTrialOn()).toBe(true);
    setStudioTrial(false);
    appSettings.reset(STUDIO_TRIAL_SETTINGS);
    expect(studioTrialOn()).toBe(true);
  });

  it('hides it in a release build unless it was turned on, whichever way the build is asked', () => {
    expect(studioDefaultOn(true)).toBe(false);
    expect(studioDefaultOn(false)).toBe(true);
  });

  it('reads ?studio=trial and ?studio=off, and hands back the address without it', () => {
    expect(readTrialRequest('?studio=trial')).toEqual({ request: 'on', search: '' });
    expect(readTrialRequest('?studio=off&nosplash')).toEqual({ request: 'off', search: '?nosplash=' });
    expect(readTrialRequest('?a=1&studio=trial&b=2')).toEqual({ request: 'on', search: '?a=1&b=2' });
  });

  it('leaves any other address alone', () => {
    expect(readTrialRequest('')).toEqual({ search: '' });
    expect(readTrialRequest('?studio=yes')).toEqual({ search: '?studio=yes' });
    expect(readTrialRequest('?other=trial')).toEqual({ search: '?other=trial' });
  });

  it('applies the request once and removes it from the address', () => {
    const replaced: string[] = [];
    const win = {
      location: { search: '?studio=trial&nosplash', pathname: '/editor', hash: '#top' },
      history: { state: null, replaceState: (_s: unknown, _t: string, url: string) => replaced.push(url) },
    } as unknown as Pick<Window, 'location' | 'history'>;
    expect(applyTrialRequest(win)).toBe(true);
    expect(studioTrialOn()).toBe(true);
    expect(replaced).toEqual(['/editor?nosplash=#top']);
    const off = { ...win, location: { ...win.location, search: '?studio=off' } } as Pick<Window, 'location' | 'history'>;
    expect(applyTrialRequest(off)).toBe(false);
    expect(studioTrialOn()).toBe(false);
  });

  it('does nothing for an address that does not name it, or with no window', () => {
    const win = { location: { search: '?x=1', pathname: '/', hash: '' }, history: { state: null, replaceState: () => { throw new Error('no'); } } } as unknown as Pick<Window, 'location' | 'history'>;
    expect(applyTrialRequest(win)).toBeUndefined();
    expect(studioTrialOn()).toBe(true);
    expect(applyTrialRequest(undefined)).toBeUndefined();
  });

  it('survives an address that cannot be rewritten (the switch is still set)', () => {
    const win = {
      location: { search: '?studio=trial', pathname: '/', hash: '' },
      history: { state: null, replaceState: () => { throw new Error('sandboxed'); } },
    } as unknown as Pick<Window, 'location' | 'history'>;
    expect(applyTrialRequest(win)).toBe(true);
    expect(studioTrialOn()).toBe(true);
  });
});

describe('in a release build (the Release workflow sets the flag)', () => {
  // Next inlines the flag when it builds, so a release is a module graph that read it as 1.
  const releaseModules = async () => {
    process.env.NEXT_PUBLIC_RELEASE_BUILD = '1';
    vi.resetModules();
    const [store, trial] = await Promise.all([import('@/settings/store'), import('./trial')]);
    return { appSettings: store.appSettings, ...trial };
  };

  it('is hidden on a first launch: no one has to ask for it to be hidden', async () => {
    const t = await releaseModules();
    expect(t.studioDefaultOn()).toBe(false);
    expect(t.studioTrialOn()).toBe(false);
    expect(t.STUDIO_TRIAL_SETTINGS.defaults({ desktop: true })).toEqual({ on: false });
  });

  it('is still turned on by ?studio=trial and off by ?studio=off, and Reset goes back to hidden', async () => {
    const t = await releaseModules();
    expect(t.applyTrialRequest(addressOf('?studio=trial'))).toBe(true);
    expect(t.studioTrialOn()).toBe(true);
    expect(t.applyTrialRequest(addressOf('?studio=off'))).toBe(false);
    expect(t.studioTrialOn()).toBe(false);
    t.setStudioTrial(true);
    t.appSettings.reset(t.STUDIO_TRIAL_SETTINGS);
    expect(t.studioTrialOn()).toBe(false);
  });
});

describe('in a develop build, with the address', () => {
  it('?studio=off hides it, and ?studio=trial shows it again', () => {
    expect(applyTrialRequest(addressOf('?studio=off'))).toBe(false);
    expect(studioTrialOn()).toBe(false);
    expect(applyTrialRequest(addressOf('?studio=trial'))).toBe(true);
    expect(studioTrialOn()).toBe(true);
  });
});
