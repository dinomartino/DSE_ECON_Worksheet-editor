import { appSettings, useSettings } from '@/settings/store';
import type { SettingsSchema } from '@/settings/types';
import { bool } from '@/settings/validators';

/**
 * The Question studio's trial switch (k-0499, decision 7a, u-x79v): the studio ships built
 * but off until the trial (about 20 requests from the teacher and 30 invented briefs on
 * their own key) has shown the questions are good enough. Off = no Library row, no
 * screen, and the "✦ Write like this" entries are not drawn; nothing about it is
 * mentioned to a teacher. The switch is a setting on this computer, turned on by opening
 * the app once with `?studio=trial` (and off again with `?studio=off`, or from the
 * studio's own foot). Taking the trial out for good = removing the check, not the code.
 */

export interface StudioTrialSettings {
  on: boolean;
}

export const STUDIO_TRIAL_SETTINGS: SettingsSchema<StudioTrialSettings> = {
  section: 'questionStudio',
  version: 1,
  storageKey: 'econgen.settings.questionStudio',
  defaults: () => ({ on: false }),
  fields: { on: bool },
};

export const studioTrialOn = (): boolean => appSettings.read(STUDIO_TRIAL_SETTINGS).on;

export const setStudioTrial = (on: boolean): void => {
  appSettings.write(STUDIO_TRIAL_SETTINGS, { on });
};

/** Re-renders when the switch changes. */
export function useStudioTrial(): boolean {
  return useSettings(STUDIO_TRIAL_SETTINGS)[0].on;
}

export interface TrialRequest {
  /** `on` / `off` when the address names the switch, else undefined. */
  request?: 'on' | 'off';
  /** The query without that parameter, `?a=b` or '' (what the address becomes). */
  search: string;
}

const PARAM = 'studio';

/** `?studio=trial` turns the studio on, `?studio=off` turns it off; any other value is left alone. */
export function readTrialRequest(search: string): TrialRequest {
  const params = new URLSearchParams(search);
  const value = params.get(PARAM);
  if (value !== 'trial' && value !== 'off') return { search };
  params.delete(PARAM);
  const rest = params.toString();
  return { request: value === 'trial' ? 'on' : 'off', search: rest ? `?${rest}` : '' };
}

/**
 * Applies the address's request once, and removes it from the address (so a reload or a
 * shared link never carries it). A no-op without `window`.
 */
export function applyTrialRequest(win: Pick<Window, 'location' | 'history'> | undefined = typeof window === 'undefined' ? undefined : window): boolean | undefined {
  if (!win) return undefined;
  const { request, search } = readTrialRequest(win.location.search);
  if (!request) return undefined;
  setStudioTrial(request === 'on');
  try {
    win.history.replaceState(win.history.state, '', `${win.location.pathname}${search}${win.location.hash}`);
  } catch {
    // A sandboxed frame: the switch is set, the address keeps its parameter.
  }
  return request === 'on';
}
