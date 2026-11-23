import { afterEach, describe, expect, it } from 'vitest';
import { appSettings } from '@/settings/store';
import { STUDIO_TRIAL_SETTINGS, applyTrialRequest, readTrialRequest, setStudioTrial, studioTrialOn } from './trial';

afterEach(() => appSettings.reset(STUDIO_TRIAL_SETTINGS));

describe('the trial switch', () => {
  it('is off until it is turned on, and stays where it was put', () => {
    expect(studioTrialOn()).toBe(false);
    setStudioTrial(true);
    expect(studioTrialOn()).toBe(true);
    setStudioTrial(false);
    expect(studioTrialOn()).toBe(false);
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
    expect(studioTrialOn()).toBe(false);
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
