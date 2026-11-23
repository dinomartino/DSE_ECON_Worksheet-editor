import { RELEASE_BUILD } from '@/platform/buildChannel';
import { appSettings, useSettings } from '@/settings/store';
import type { SettingsSchema } from '@/settings/types';
import { bool } from '@/settings/validators';

/**
 * The Question studio's trial switch (k-0499, decision 7a, u-x79v; "shown on develop, no
 * need to turn on", u-z4n3): the studio is built and on `develop`, and is not shipped
 * until the trial (about 20 requests from the teacher and 30 invented briefs on their own
 * key) has shown the questions are good enough. What the switch reads before anyone has
 * set it depends on the build (`platform/buildChannel.ts`):
 *  - a develop build (`npm run dev`, a build on develop or in CI, a desktop preview) shows
 *    the studio from the first launch: nothing to turn on;
 *  - a release build (the Release workflow's, for a `v*` tag) hides it: no Library row, no
 *    screen, the "✦ Write like this" entries are not drawn, and nothing about it is
 *    mentioned to a teacher.
 * Once a setting is given on this computer it wins in either build: `?studio=trial` turns
 * the studio on and `?studio=off` turns it off (the address is cleaned afterwards). In a
 * release build the studio's own foot also turns it off; in a develop build it has no such
 * button, since the desktop app has no address bar to bring it back.
 * Shipping it = making the default `true` here (no build check), plus the CHANGELOG line
 * held in `docs/design/question-studio.md`.
 */

export interface StudioTrialSettings {
  on: boolean;
}

/** What the switch reads before anyone has set it: shown in a develop build, hidden in a release build. */
export const studioDefaultOn = (release: boolean = RELEASE_BUILD): boolean => !release;

export const STUDIO_TRIAL_SETTINGS: SettingsSchema<StudioTrialSettings> = {
  section: 'questionStudio',
  version: 1,
  storageKey: 'econgen.settings.questionStudio',
  defaults: () => ({ on: studioDefaultOn() }),
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
