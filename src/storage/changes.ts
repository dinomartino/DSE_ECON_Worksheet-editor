import type { StoreChange } from '@/library/types';
import type { Worksheet } from '@/model/types';
import type { WorksheetStore } from './types';

/**
 * The change feed: every mutation of the store singleton, announced after it succeeded.
 *
 * Nothing else announces a save — about ten call sites write documents — so the feed is a
 * decorator at the one choke point (`worksheetStore`). It never alters a call's behaviour
 * or result; a listener that throws is ignored. A `saved` event carries the worksheet
 * that was written, so a listener need not read it back.
 */

export type StoreChangeListener = (change: StoreChange, worksheet?: Worksheet) => void;

const listeners = new Set<StoreChangeListener>();

/** Hear every store change from now on; returns the unsubscribe. */
export function onStoreChange(listener: StoreChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitStoreChange(change: StoreChange, worksheet?: Worksheet): void {
  for (const listener of [...listeners]) {
    try {
      listener(change, worksheet);
    } catch {
      // A listener's failure is its own; the store call already succeeded.
    }
  }
}

/**
 * `store`, announcing each successful mutation through `emit`. A purge or Empty Trash
 * touches only trashed documents, so it is announced without an id: "re-check the list".
 */
export function withChangeFeed(
  store: WorksheetStore,
  emit: StoreChangeListener = emitStoreChange,
): WorksheetStore {
  const announce: StoreChangeListener = (change, worksheet) => {
    try {
      emit(change, worksheet);
    } catch {
      // The call succeeded; a listener's failure must not turn it into an error.
    }
  };
  return {
    list: () => store.list(),
    load: (id) => store.load(id),
    loadTrashed: (id) => store.loadTrashed(id),
    listTrash: () => store.listTrash(),
    readFolders: () => store.readFolders(),
    writeFolders: (state) => store.writeFolders(state),
    async save(worksheet) {
      await store.save(worksheet);
      announce({ docId: worksheet.id, kind: 'saved' }, worksheet);
    },
    async adopt(worksheet) {
      await store.adopt(worksheet);
      announce({ docId: worksheet.id, kind: 'saved', origin: 'sync' }, worksheet);
    },
    async rename(id, name) {
      await store.rename(id, name);
      announce({ docId: id, kind: 'saved' });
    },
    async remove(id) {
      await store.remove(id);
      announce({ docId: id, kind: 'removed' });
    },
    async trash(id) {
      await store.trash(id);
      announce({ docId: id, kind: 'trashed' });
    },
    async restore(id) {
      const restored = await store.restore(id);
      if (restored !== undefined) announce({ docId: restored, kind: 'restored' });
      return restored;
    },
    async purge(id) {
      await store.purge(id);
      announce({ kind: 'removed' });
    },
    async emptyTrash() {
      await store.emptyTrash();
      announce({ kind: 'removed' });
    },
    async clear() {
      await store.clear();
      announce({ kind: 'cleared' });
    },
  };
}
