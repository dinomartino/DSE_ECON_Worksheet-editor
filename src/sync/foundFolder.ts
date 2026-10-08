import { STORAGE_MESSAGES } from '@/components/settings/sections/storageSection/messages';
import { refusalText } from '@/components/settings/sections/storageSection/refusal';
import { resolveMessages } from '@/i18n/catalogue';
import { uiLanguage } from '@/i18n/language';
import { isDesktop } from '@/platform';
import { foundLibrary, type FoundLibrary, type LibraryChooseResult } from '@/platform/library';
import { useAppDialogs } from '@/store/appDialogs';
import { dismiss, notify } from '@/store/notices';
import { SYNC_MESSAGES } from './messages';

/**
 * The second computer (`library-folder.md` § 1.3): at launch, with no folder chosen here, one
 * notice names the cloud folder holding a library and offers Settings' own choose flow with the
 * picker opened there. Never connects by itself. Closing it or using it is recorded on this
 * computer (localStorage), so it shows once. A failed lookup says nothing.
 */

export const FOUND_NOTICE_ID = 'sync-found-folder';
/** Outside the `econ-worksheet:` prefix: every key there is a document. */
export const FOUND_DONE_KEY = 'econgen.sync.foundFolderDone';

export interface FoundFolderDeps {
  /** `librarySync.chooseFolder`, so the first sync starts exactly as from Settings. */
  choose(title: string, start: string): Promise<LibraryChooseResult>;
  find?(): Promise<FoundLibrary | null>;
  openSettings?(): void;
}

let offered = false;

function isDone(): boolean {
  try {
    return window.localStorage.getItem(FOUND_DONE_KEY) !== null;
  } catch {
    return false;
  }
}

function markDone(): void {
  try {
    window.localStorage.setItem(FOUND_DONE_KEY, '1');
  } catch {
    // Blocked storage: the offer may come back next launch, which is harmless.
  }
}

const openStorage = () => useAppDialogs.getState().openSettings({ section: 'storage' });

async function choose(deps: FoundFolderDeps, id: string): Promise<void> {
  const lang = uiLanguage();
  const s = resolveMessages(STORAGE_MESSAGES, lang);
  // A refusal or a failure points to Settings, where the teacher can try again.
  const settings = [{ label: resolveMessages(SYNC_MESSAGES, lang).openStorage, run: deps.openSettings ?? openStorage }];
  try {
    const picked = await deps.choose(s.pickerTitle, id);
    if (picked.status === 'refused') {
      notify({ id: `${FOUND_NOTICE_ID}-refused`, tone: 'warning', title: s.refusedTitle, body: refusalText(s, picked.reason), actions: settings });
    }
  } catch {
    notify({ id: `${FOUND_NOTICE_ID}-failed`, tone: 'error', body: s.failed, actions: settings });
  }
}

/** Once per launch, desktop only: the notice, if a cloud folder holds a library. */
export async function offerFoundFolder(deps: FoundFolderDeps): Promise<void> {
  if (!isDesktop() || offered || isDone()) return;
  offered = true;
  const found = await (deps.find ?? foundLibrary)().catch(() => null);
  if (!found || isDone()) return;
  const m = resolveMessages(SYNC_MESSAGES, uiLanguage());
  notify({
    id: FOUND_NOTICE_ID,
    tone: 'info',
    body: m.found(found.label),
    actions: [
      {
        label: m.foundChoose,
        primary: true,
        run: () => {
          markDone();
          void choose(deps, found.id);
        },
      },
    ],
    onDismiss: markDone,
  });
}

/** A folder was chosen another way (Settings): the offer goes. */
export function withdrawFoundFolder(): void {
  dismiss(FOUND_NOTICE_ID);
}

/** Test seam: a new launch. */
export function resetFoundFolderForTest(): void {
  offered = false;
}
