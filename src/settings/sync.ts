import { text } from './validators';
import type { SettingsSchema } from './types';

/**
 * Settings → Storage location: this computer's name, used in the names of the copies sync
 * makes ("Mock (Home Mac, 5 Oct 14:32)"). Per computer, never in a document, never synced.
 * Empty means the platform's default ("Mac", "Windows PC"), in the interface language.
 */

export const COMPUTER_NAME_MAX = 40;

export interface SyncSettings {
  computerName: string;
}

export const SYNC_SETTINGS: SettingsSchema<SyncSettings> = {
  section: 'storage',
  version: 1,
  storageKey: 'econgen.settings.sync',
  defaults: () => ({ computerName: '' }),
  fields: { computerName: text(COMPUTER_NAME_MAX) },
};

/** One line, trimmed, at most `COMPUTER_NAME_MAX` characters. */
export function cleanComputerName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, COMPUTER_NAME_MAX).trim();
}
