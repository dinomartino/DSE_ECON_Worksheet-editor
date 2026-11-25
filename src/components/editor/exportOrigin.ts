import { isNewerThanBuild } from '@/model/migrations';
import { isOriginId, newOriginId } from '@/model/origin';
import type { Worksheet } from '@/model/types';
import { worksheetStore } from '@/storage';
import { useWorksheetStore } from '@/store/worksheetStore';
import { whileSyncPaused } from '@/sync/syncPause';

/**
 * The documents an export is about to write, each with its origin id (k-0558), so every
 * file of one worksheet carries the same id:
 *
 * - **the open document** through the editor (`ensureOrigin`): an id minted on open is
 *   saved by autosave, and the editor's copy stays the one that holds it;
 * - **another saved document** (a set's other paper, a key's "Also include") with no id
 *   yet: given one and saved, content untouched (`updatedAt` too), so its next export
 *   carries the same;
 * - **a newer build's document**: never written by this build, so an id for this export only.
 *
 * A save that fails still exports, with the id it was given.
 */
export async function withOrigins(
  documents: readonly Worksheet[],
  save: (worksheet: Worksheet) => Promise<void> = (worksheet) => worksheetStore.save(worksheet),
): Promise<Worksheet[]> {
  const openId = useWorksheetStore.getState().worksheet.id;
  const unsaved: Worksheet[] = [];
  const out = documents.map((document) => {
    if (document.id === openId) return withOpenOrigin(document);
    if (isOriginId(document.originId)) return document;
    const given = { ...document, originId: newOriginId() };
    if (!isNewerThanBuild(document)) unsaved.push(given);
    return given;
  });
  if (unsaved.length > 0) {
    await whileSyncPaused(async () => {
      for (const document of unsaved) await save(document).catch(() => undefined);
    });
  }
  return out;
}

/**
 * The open document with its origin id, synchronously (inside a click, before a save
 * picker that needs the click's activation). `document` is the editor's.
 */
export function withOpenOrigin(document: Worksheet): Worksheet {
  if (isOriginId(document.originId)) return document;
  const open = useWorksheetStore.getState().ensureOrigin();
  return open.id === document.id ? { ...document, originId: open.originId } : document;
}

/** `withOrigins` for one document. */
export async function withOrigin(document: Worksheet): Promise<Worksheet> {
  const [out] = await withOrigins([document]);
  return out;
}
