import { appSettings, useSettings } from '@/settings/store';
import type { SettingsSchema } from '@/settings/types';
import { bool } from '@/settings/validators';

/**
 * The studio's one option: whether, with no example picked, it adds 3 to 5 real HKDSE
 * questions on the key point from the Past paper bank as style references (on by default,
 * u-7jvk). Off sends nothing from the bank: the request is the key point alone. A setting on
 * this computer, set on the Write tab.
 */
export interface StudioOptions {
  autoReferences: boolean;
}

export const STUDIO_OPTIONS: SettingsSchema<StudioOptions> = {
  section: 'questionStudioOptions',
  version: 1,
  storageKey: 'econgen.settings.questionStudioOptions',
  defaults: () => ({ autoReferences: true }),
  fields: { autoReferences: bool },
};

export const autoReferencesOn = (): boolean => appSettings.read(STUDIO_OPTIONS).autoReferences;

/** Re-renders when the option changes. */
export function useStudioOptions() {
  return useSettings(STUDIO_OPTIONS);
}
