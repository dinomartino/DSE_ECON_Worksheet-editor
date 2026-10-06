import type { WorksheetStore } from '@/storage/types';
import type { HashCache, HashEntry } from './types';

/**
 * Local hashes, so a run does not load and hash every document (`readLocal`). A hit
 * needs the list row's `updatedAt` to equal the entry's **and** no local write to the id
 * since the entry was put. `updatedAt` alone is not enough: it is the document's own
 * field, kept by two saves in one millisecond, a write whose index row failed, a
 * hand-edited file. So every local write must `forget` (`forgetOnWrite`).
 */

export function memoryHashCache(): HashCache & { entries: Map<string, HashEntry> } {
  const entries = new Map<string, HashEntry>();
  const forgotten = new Map<string, number>();
  let clock = 0;
  let forgottenAll = 0;
  return {
    entries,
    get: (id) => entries.get(id),
    ticket: () => clock,
    put(entry, ticket) {
      // Loaded before a write that has since landed: the content may be the old one.
      if (ticket < forgottenAll || ticket < (forgotten.get(entry.id) ?? 0)) return;
      entries.set(entry.id, { ...entry });
    },
    forget(id) {
      clock += 1;
      if (id === undefined) {
        forgottenAll = clock;
        entries.clear();
        forgotten.clear();
      } else {
        forgotten.set(id, clock);
        entries.delete(id);
      }
    },
  };
}

/**
 * `store`, forgetting each id it writes once the write settles, failed ones included (a
 * document can land before its index row fails). The app's store and the engine's must
 * be this one; on the web, another tab's `storage` event must forget its id too.
 */
export function forgetOnWrite(store: WorksheetStore, cache: HashCache): WorksheetStore {
  const forgetting = async <T>(work: () => Promise<T>, ids: (result?: T) => (string | undefined)[]): Promise<T> => {
    let result: T | undefined;
    try {
      result = await work();
      return result;
    } finally {
      for (const id of ids(result)) cache.forget(id);
    }
  };
  return {
    list: () => store.list(),
    load: (id) => store.load(id),
    loadTrashed: (id) => store.loadTrashed(id),
    listTrash: () => store.listTrash(),
    readFolders: () => store.readFolders(),
    writeFolders: (state) => store.writeFolders(state),
    save: (worksheet) => forgetting(() => store.save(worksheet), () => [worksheet.id]),
    adopt: (worksheet) => forgetting(() => store.adopt(worksheet), () => [worksheet.id]),
    rename: (id, name) => forgetting(() => store.rename(id, name), () => [id]),
    remove: (id) => forgetting(() => store.remove(id), () => [id]),
    trash: (id) => forgetting(() => store.trash(id), () => [id]),
    // Desktop may restore under a fresh id.
    restore: (id) => forgetting(() => store.restore(id), (restored) => (restored && restored !== id ? [id, restored] : [id])),
    purge: (id) => forgetting(() => store.purge(id), () => [id]),
    emptyTrash: () => forgetting(() => store.emptyTrash(), () => [undefined]),
    clear: () => forgetting(() => store.clear(), () => [undefined]),
  };
}
