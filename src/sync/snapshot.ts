import type { Worksheet } from '@/model/types';
import { contentOf, contentOfText, type Content } from './content';
import { classifyKey, documentKey } from './keys';
import type { WorksheetSummary } from '@/storage/types';
import type { BaseEntry, HashCache, Place, SourceEntry, SyncSource, SyncStore, Unavailable } from './types';

/**
 * The two sides as the planner sees them. Reading is here; deciding is in `plan.ts`.
 * A local document is loaded only when the hash cache cannot vouch for it; a remote file
 * is read only when its revision differs from the base (or its name does not prove its
 * id). So an unchanged library costs the listings and nothing else.
 */

/** What the planner needs of a local document; `worksheet` and `text` are absent on a cache hit. */
export type LocalContent = Omit<Content, 'worksheet' | 'text'> & Partial<Pick<Content, 'worksheet' | 'text'>>;

/** 'unreadable': listed but will not load. Never read as deleted, never cached. */
export interface LocalDoc<C extends LocalContent = LocalContent> {
  id: string;
  place: Place;
  content: C | 'unreadable';
}

export interface RemoteFile {
  key: string;
  revision: string;
  place: Place;
  /** Absent: not read, because the base proves it unchanged. */
  content?: Content | 'unreadable';
}

/** A document's canonical files. Both present: live wins; the Trash file is an extra (`plan.ts`). */
export interface RemoteDoc {
  live?: RemoteFile;
  trash?: RemoteFile;
}

export interface RemoteSnapshot {
  docs: Map<string, RemoteDoc>;
  /** Document files not at their own id's key: provider conflict copies, and torn files. */
  strays: RemoteFile[];
}

/** A stamp the cache can key on: a parseable time, as a save writes it. */
const stampOf = (updatedAt: unknown): string | undefined =>
  typeof updatedAt === 'string' && !Number.isNaN(Date.parse(updatedAt)) ? updatedAt : undefined;

/** Loaded whole, and cached under the loaded document's own `updatedAt`. */
async function localContent(
  id: string,
  place: Place,
  load: () => Promise<Worksheet | undefined>,
  cache: HashCache | undefined,
): Promise<Content | 'unreadable'> {
  const ticket = cache?.ticket(id) ?? 0;
  let content: Content;
  try {
    const worksheet = await load();
    if (!worksheet) return 'unreadable';
    content = contentOf(worksheet);
  } catch {
    return 'unreadable';
  }
  const updatedAt = stampOf(content.worksheet.updatedAt);
  if (cache && updatedAt) {
    cache.put({ id, place, updatedAt, hash: content.hash, schemaVersion: content.schemaVersion, newer: content.newer }, ticket);
  }
  return content;
}

/** The cached hash when the row's stamp matches it (§ `hashCache.ts`), else loaded. */
async function listedContent(
  row: WorksheetSummary,
  place: Place,
  load: () => Promise<Worksheet | undefined>,
  cache: HashCache | undefined,
): Promise<LocalContent | 'unreadable'> {
  const hit = cache?.get(row.id);
  const stamp = stampOf(row.updatedAt);
  if (hit && stamp && hit.place === place && hit.updatedAt === stamp) {
    return { hash: hit.hash, schemaVersion: hit.schemaVersion, newer: hit.newer };
  }
  return localContent(row.id, place, load, cache);
}

/** Rejects when a listing fails (`strict`): a library that will not list is never read as empty. */
export async function readLocal(store: SyncStore, cache?: HashCache): Promise<Map<string, LocalDoc>> {
  const docs = new Map<string, LocalDoc>();
  for (const row of await store.list({ strict: true })) {
    docs.set(row.id, { id: row.id, place: 'live', content: await listedContent(row, 'live', () => store.load(row.id), cache) });
  }
  for (const row of await store.listTrash({ strict: true })) {
    if (docs.has(row.id)) continue;
    docs.set(row.id, { id: row.id, place: 'trash', content: await listedContent(row, 'trash', () => store.loadTrashed(row.id), cache) });
  }
  return docs;
}

/** One document, fresh and whole: the executor's check before it writes locally. Never a cache hit. */
export async function readLocalDoc(store: SyncStore, id: string, cache?: HashCache): Promise<LocalDoc<Content> | undefined> {
  if ((await store.list({ strict: true })).some((row) => row.id === id)) {
    return { id, place: 'live', content: await localContent(id, 'live', () => store.load(id), cache) };
  }
  if ((await store.listTrash({ strict: true })).some((row) => row.id === id)) {
    return { id, place: 'trash', content: await localContent(id, 'trash', () => store.loadTrashed(id), cache) };
  }
  return undefined;
}

/** The revision of a file that would not read, where no listing gave one. */
const UNREAD_REVISION = 'unread';

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
    // Will not read now: held under the listing's revision, never read as deleted.
    const content = read.status === 'ok' ? remoteContent(read.text) : 'unreadable';
    const revision = read.status === 'ok' ? read.revision : entry.revision;
    const file: RemoteFile = { key: entry.key, revision, place: kind.place, content };
    if (kind.stem === undefined) strays.push(file);
    else if (content === 'unreadable' || content.worksheet.id === kind.stem) place(kind.stem, file);
    else strays.push(file);
  }
  // A Trash file beside a live one (a delete that crossed an edit) is resolved like a
  // provider copy, which needs its content.
  for (const doc of docs.values()) {
    if (!doc.live || !doc.trash || doc.trash.content) continue;
    const read = await source.read(doc.trash.key);
    if (read.status === 'unavailable') return read;
    if (read.status === 'missing') delete doc.trash;
    else if (read.status === 'unreadable') doc.trash = { ...doc.trash, content: 'unreadable' };
    else doc.trash = { ...doc.trash, revision: read.revision, content: remoteContent(read.text) };
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
    if (read.status === 'unreadable') {
      // No revision without the bytes: one no base holds, so the document is held.
      doc[where] = { key, revision: UNREAD_REVISION, place: where, content: 'unreadable' };
      continue;
    }
    const content = remoteContent(read.text);
    // A file at this key holding another id is a stray; the next full run copies it.
    if (content !== 'unreadable' && content.worksheet.id !== id) continue;
    doc[where] = { key, revision: read.revision, place: where, content };
  }
  return doc;
}
