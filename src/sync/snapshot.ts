import type { Worksheet } from '@/model/types';
import { contentOf, contentOfText, type Content } from './content';
import { classifyKey, documentKey } from './keys';
import type { BaseEntry, Place, SourceEntry, SyncSource, SyncStore, Unavailable } from './types';

/**
 * The two sides as the planner sees them. Reading is here; deciding is in `plan.ts`.
 * Local is read whole; a remote file is read only when its revision differs from the
 * base (or its name does not prove its id), so an unchanged library costs one listing.
 */

/** 'unreadable': listed but will not load. Never read as deleted. */
export interface LocalDoc {
  id: string;
  place: Place;
  content: Content | 'unreadable';
}

export interface RemoteFile {
  key: string;
  revision: string;
  place: Place;
  /** Absent: not read, because the base proves it unchanged. */
  content?: Content | 'unreadable';
}

/** A document's canonical files. Both present: live wins. */
export interface RemoteDoc {
  live?: RemoteFile;
  trash?: RemoteFile;
}

export interface RemoteSnapshot {
  docs: Map<string, RemoteDoc>;
  /** Document files not at their own id's key: provider conflict copies, and torn files. */
  strays: RemoteFile[];
}

async function localContent(load: () => Promise<Worksheet | undefined>): Promise<Content | 'unreadable'> {
  try {
    const worksheet = await load();
    return worksheet ? contentOf(worksheet) : 'unreadable';
  } catch {
    return 'unreadable';
  }
}

export async function readLocal(store: SyncStore): Promise<Map<string, LocalDoc>> {
  const docs = new Map<string, LocalDoc>();
  for (const row of await store.list()) {
    docs.set(row.id, { id: row.id, place: 'live', content: await localContent(() => store.load(row.id)) });
  }
  for (const row of await store.listTrash()) {
    if (docs.has(row.id)) continue;
    docs.set(row.id, { id: row.id, place: 'trash', content: await localContent(() => store.loadTrashed(row.id)) });
  }
  return docs;
}

/** One document, fresh: the executor's check before it writes locally. */
export async function readLocalDoc(store: SyncStore, id: string): Promise<LocalDoc | undefined> {
  if ((await store.list()).some((row) => row.id === id)) {
    return { id, place: 'live', content: await localContent(() => store.load(id)) };
  }
  if ((await store.listTrash()).some((row) => row.id === id)) {
    return { id, place: 'trash', content: await localContent(() => store.loadTrashed(id)) };
  }
  return undefined;
}

function remoteContent(text: string): Content | 'unreadable' {
  try {
    return contentOfText(text);
  } catch {
    return 'unreadable';
  }
}

export async function readRemote(
  source: SyncSource,
  entries: SourceEntry[],
  base: Map<string, BaseEntry>,
): Promise<RemoteSnapshot | Unavailable> {
  const docs = new Map<string, RemoteDoc>();
  const strays: RemoteFile[] = [];
  const place = (id: string, file: RemoteFile) => {
    const doc = docs.get(id) ?? {};
    doc[file.place] = file;
    docs.set(id, doc);
  };
  for (const entry of [...entries].sort((a, b) => a.key.localeCompare(b.key))) {
    const kind = classifyKey(entry.key);
    if (!kind) continue;
    const known = kind.stem !== undefined ? base.get(kind.stem) : undefined;
    if (known && documentKey(known.id, known.place) === entry.key && known.revision === entry.revision) {
      place(known.id, { key: entry.key, revision: entry.revision, place: kind.place });
      continue;
    }
    const read = await source.read(entry.key);
    if (read.status === 'unavailable') return read;
    if (read.status === 'missing') continue; // Gone since the listing: the next run sees it.
    const content = remoteContent(read.text);
    const file: RemoteFile = { key: entry.key, revision: read.revision, place: kind.place, content };
    if (kind.stem === undefined) strays.push(file);
    else if (content === 'unreadable' || content.worksheet.id === kind.stem) place(kind.stem, file);
    else strays.push(file);
  }
  return { docs, strays };
}

/** One document's canonical files, fresh: the executor's re-plan after a conflict. */
export async function readRemoteDoc(source: SyncSource, id: string): Promise<RemoteDoc | Unavailable> {
  const doc: RemoteDoc = {};
  for (const where of ['live', 'trash'] as const) {
    const key = documentKey(id, where);
    const read = await source.read(key);
    if (read.status === 'unavailable') return read;
    if (read.status === 'missing') continue;
    const content = remoteContent(read.text);
    // A file at this key holding another id is a stray; the next full run copies it.
    if (content !== 'unreadable' && content.worksheet.id !== id) continue;
    doc[where] = { key, revision: read.revision, place: where, content };
  }
  return doc;
}
