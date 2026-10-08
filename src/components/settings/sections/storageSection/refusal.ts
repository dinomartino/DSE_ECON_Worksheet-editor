import type { Messages } from '@/i18n/catalogue';
import type { LibraryRefusal } from '@/platform/library';
import type { STORAGE_MESSAGES } from './messages';

/** Why the shell would not use the picked folder, for the teacher. */
export function refusalText(m: Messages<typeof STORAGE_MESSAGES>, reason: LibraryRefusal): string {
  switch (reason) {
    case 'app-data':
      return m.refusedAppData;
    case 'home':
      return m.refusedHome;
    case 'drive-root':
      return m.refusedDriveRoot;
    case 'inside-library':
      return m.refusedInsideLibrary;
  }
}
