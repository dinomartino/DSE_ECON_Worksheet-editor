import { CURRENT_SCHEMA_VERSION } from '@/model/migrations';
import type { Worksheet } from '@/model/types';
import { worksheetTitle } from '@/storage/document';
import { contentOf, type Content } from './content';
import { derivedId } from './hash';
import type { LocalDoc, RemoteDoc, RemoteFile, RemoteSnapshot } from './snapshot';
import type { BaseEntry, CopyNamer, Place } from './types';

/**
 * The planner: a pure function of (local, remote, base) per document. Change is
 * detected only by local content hash against the base and remote revision against the
 * base; two computers' clocks are never compared. Rules, per document:
 *
 * | local \ remote | same            | edited    | moved (trashed/restored) | gone             |
 * |----------------|-----------------|-----------|--------------------------|------------------|
 * | same           | nothing         | download  | move local               | live: to Trash   |
 * | edited         | upload          | keep both | upload (edit wins)       | upload           |
 * | moved          | move remote     | download (edit wins) | link          | trash: nothing; live: upload |
 * | gone           | live: download back; trash: purge remote | download | download | forget |
 *
 * No base (first sync, a second computer joining): one side only → copy it across;
 * same content → link (a trashed side is restored: live wins); different → keep both.
 * Keep both: the remote keeps the id, this computer's version becomes a copy.
 * A newer build's file is never uploaded over; unreadable files are held, never read
 * as deleted. Remote files not at their own id's key, and a Trash file beside a live
 * one, are planned first (`planStray`).
 */

export interface PlanContext {
  namer: CopyNamer;
  /** A conflict copy's date when its document's `updatedAt` will not parse. */
  now: Date;
}

export interface KeyRevision {
  key: string;
  revision: string;
}

/** The local state an action was planned against; the executor re-checks it first. */
export interface Seen {
  place: Place;
  hash: string;
}

/** A document sync creates: a conflict copy, or a provider's copy made canonical. */
export interface Copy extends Content {
  id: string;
  place: Place;
}

export type HoldReason = 'unreadable' | 'unreadable-local' | 'newer-build';

export type SyncAction =
  | { kind: 'nothing'; id: string }
  | { kind: 'link'; id: string; entry: BaseEntry }
  | { kind: 'forget'; id: string }
  | { kind: 'upload'; id: string; place: Place; seen: Seen; expect: string | null; cleanup?: KeyRevision }
  | { kind: 'download'; id: string; place: Place; from: KeyRevision; seen: Seen | null }
  | { kind: 'moveRemote'; id: string; from: KeyRevision; to: Place; expect: string | null; seen: Seen; schemaVersion: number }
  | { kind: 'moveLocal'; id: string; to: Place; seen: Seen; revision: string; schemaVersion: number }
  | { kind: 'conflict'; id: string; seen: Seen; copy: Copy; place: Place; from: KeyRevision }
  | { kind: 'purgeRemote'; id: string; from: KeyRevision }
  | { kind: 'providerCopy'; from: KeyRevision; copy: Copy }
  | { kind: 'dropDuplicate'; from: KeyRevision }
  | { kind: 'hold'; id?: string; key?: string; reason: HoldReason };

type Delta = 'same' | 'edited' | 'moved' | 'gone';

const keyRev = (file: RemoteFile): KeyRevision => ({ key: file.key, revision: file.revision });

/** Remote's state is its live file if it has one (live wins), else its trashed one. */
const stateFile = (remote: RemoteDoc | undefined) => remote?.live ?? remote?.trash;

function localDelta(local: Content | undefined, place: Place | undefined, base: BaseEntry): Delta {
  if (!local) return 'gone';
  if (local.hash !== base.hash) return 'edited';
  return place === base.place ? 'same' : 'moved';
}

function remoteDelta(file: RemoteFile | undefined, base: BaseEntry): Delta {
  if (!file) return 'gone';
  if (file.place === base.place && file.revision === base.revision) return 'same';
  const content = file.content as Content; // read whenever it differs from the base
  if (content.hash !== base.hash) return 'edited';
  return file.place === base.place ? 'same' : 'moved';
}

/** The schema of a remote file; an unread one holds the base's content. */
const remoteSchema = (file: RemoteFile, base: BaseEntry | undefined) =>
  file.content && file.content !== 'unreadable' ? file.content.schemaVersion : (base?.schemaVersion ?? 0);

function named(worksheet: Worksheet, id: string, name: string, place: Place): Copy {
  return { ...contentOf({ ...worksheet, id, name }), id, place };
}

export function planDocument(
  id: string,
  localDoc: LocalDoc | undefined,
  remote: RemoteDoc | undefined,
  base: BaseEntry | undefined,
  ctx: PlanContext,
): SyncAction {
  // A Trash file beside a live one is planned on its own (`planSync`); here it is not
  // there, so no write can land on it unresolved — a write expecting nothing conflicts.
  if (remote?.live && remote.trash) remote = { live: remote.live };
  const file = stateFile(remote);
  if (localDoc?.content === 'unreadable') return { kind: 'hold', id, reason: 'unreadable-local' };
  if (file?.content === 'unreadable') return { kind: 'hold', id, key: file.key, reason: 'unreadable' };
  const local = localDoc?.content;
  const place = localDoc?.place;
  const seen: Seen | null = local && place ? { place, hash: local.hash } : null;

  const link = (f: RemoteFile, c: Content, at: Place = f.place): SyncAction => ({
    kind: 'link',
    id,
    entry: { id, kind: 'worksheet', place: at, hash: c.hash, revision: f.revision, schemaVersion: c.schemaVersion },
  });

  /** Remote's new content comes here. A newer build's local copy never takes an older schema. */
  const download = (f: RemoteFile): SyncAction => {
    if (local?.newer && remoteSchema(f, base) < local.schemaVersion) return { kind: 'hold', id, reason: 'newer-build' };
    return { kind: 'download', id, place: f.place, from: keyRev(f), seen };
  };

  /** Keep both: remote keeps the id; this computer's version is saved under a derived id. */
  const conflict = (f: RemoteFile): SyncAction => {
    if (!local || !place || !seen) return download(f);
    if (local.newer && remoteSchema(f, base) < local.schemaVersion) return { kind: 'hold', id, reason: 'newer-build' };
    const at = Date.parse(local.worksheet.updatedAt);
    const name = ctx.namer.conflictCopy(worksheetTitle(local.worksheet), Number.isNaN(at) ? ctx.now : new Date(at));
    // Derived from this version, so a run interrupted after the copy re-makes the same one.
    const copy = named(local.worksheet, derivedId('conflict', id, local.hash), name, place);
    return { kind: 'conflict', id, seen, copy, place: f.place, from: keyRev(f) };
  };

  /** Local's content goes up. Never over a newer build's file; a newer document only where nothing is. */
  const upload = (): SyncAction => {
    if (!local || !place || !seen) return { kind: 'nothing', id };
    const target = remote?.[place];
    const other = remote?.[place === 'live' ? 'trash' : 'live'];
    if (local.newer && (target || other)) return { kind: 'hold', id, reason: 'newer-build' };
    if (file && remoteSchema(file, base) > CURRENT_SCHEMA_VERSION) return conflict(file);
    return {
      kind: 'upload',
      id,
      place,
      seen,
      expect: target?.revision ?? null,
      // Only the state file is known to hold nothing new; a stray extra key is left alone.
      ...(other && other === file ? { cleanup: keyRev(other) } : {}),
    };
  };

  /** Same content on both sides, maybe in different places: live wins. */
  const agree = (f: RemoteFile): SyncAction => {
    if (!local || !place || !seen) return { kind: 'nothing', id };
    if (place === f.place) return link(f, local);
    if (place === 'live') {
      return { kind: 'moveRemote', id, from: keyRev(f), to: 'live', expect: remote?.live?.revision ?? null, seen, schemaVersion: local.schemaVersion };
    }
    return { kind: 'moveLocal', id, to: 'live', seen, revision: f.revision, schemaVersion: local.schemaVersion };
  };

  if (!base) {
    if (!file) return local ? upload() : { kind: 'nothing', id };
    if (!local) return download(file);
    const theirs = file.content as Content; // no base: always read
    return theirs.hash === local.hash ? agree(file) : conflict(file);
  }

  const ld = localDelta(local, place, base);
  const rd = remoteDelta(file, base);

  switch (ld) {
    case 'same':
      if (rd === 'same') return file!.revision === base.revision ? { kind: 'nothing', id } : link(file!, local!);
      if (rd === 'edited') return download(file!);
      if (rd === 'moved') {
        return { kind: 'moveLocal', id, to: file!.place, seen: seen!, revision: file!.revision, schemaVersion: base.schemaVersion };
      }
      // Gone remotely, unchanged here: to Trash (never deleted). Already in Trash: keep it there.
      return place === 'live'
        ? { kind: 'moveLocal', id, to: 'trash', seen: seen!, revision: '', schemaVersion: base.schemaVersion }
        : { kind: 'nothing', id };
    case 'edited':
      if (rd === 'edited') return (file!.content as Content).hash === local!.hash ? agree(file!) : conflict(file!);
      // An edit beats a delete or a move on the other side.
      return upload();
    case 'moved':
      if (rd === 'same') {
        return { kind: 'moveRemote', id, from: keyRev(file!), to: place!, expect: remote?.[place!]?.revision ?? null, seen: seen!, schemaVersion: base.schemaVersion };
      }
      if (rd === 'edited') return download(file!);
      if (rd === 'moved') return link(file!, local!);
      // Gone remotely: a restore here comes back; Trash here stays Trash.
      return place === 'live' ? upload() : { kind: 'nothing', id };
    case 'gone':
      if (rd === 'gone') return { kind: 'forget', id };
      // Nothing in the app removes a live document without Trash, so its absence here is a
      // loss (storage evicted, a dangling row): bring it back. Gone from Trash is a purge.
      if (rd === 'same' && base.place === 'trash') return { kind: 'purgeRemote', id, from: keyRev(file!) };
      return download(file!);
  }
}

/**
 * A provider's conflict copy: the id inside decides, the name only labels. The same
 * content as its document's live (or only) file is a duplicate to drop; anything else
 * becomes its own document under an id derived from its content, so every computer
 * makes the same one. A Trash file beside a live one is judged the same way.
 */
export function planStray(
  stray: RemoteFile,
  remote: RemoteSnapshot,
  base: Map<string, BaseEntry>,
  ctx: PlanContext,
  local: Map<string, LocalDoc> = new Map(),
): SyncAction {
  if (!stray.content || stray.content === 'unreadable') return { kind: 'hold', key: stray.key, reason: 'unreadable' };
  if (stray.content.newer) return { kind: 'hold', key: stray.key, reason: 'newer-build' };
  const inner = stray.content.worksheet.id;
  // This computer's own unsynced version (a run stopped mid-upload): its document's own
  // action uploads or copies it, so the stray holds nothing that would be lost.
  const mine = local.get(inner)?.content;
  if (mine && mine !== 'unreadable' && mine.hash === stray.content.hash && mine.hash !== base.get(inner)?.hash) {
    return { kind: 'dropDuplicate', from: keyRev(stray) };
  }
  const own = stateFile(remote.docs.get(inner));
  const ownBase = base.get(inner);
  const ownHash =
    own?.content && own.content !== 'unreadable'
      ? own.content.hash
      : own && ownBase && own.place === ownBase.place && own.revision === ownBase.revision
        ? ownBase.hash
        : undefined;
  if (ownHash === stray.content.hash) return { kind: 'dropDuplicate', from: keyRev(stray) };
  const worksheet = stray.content.worksheet;
  const copy = named(worksheet, derivedId('provider', inner, stray.content.hash), ctx.namer.providerCopy(worksheetTitle(worksheet)), stray.place);
  return { kind: 'providerCopy', from: keyRev(stray), copy };
}

export function planSync(
  local: Map<string, LocalDoc>,
  remote: RemoteSnapshot,
  base: Map<string, BaseEntry>,
  ctx: PlanContext,
): SyncAction[] {
  const ids = [...new Set([...local.keys(), ...remote.docs.keys(), ...base.keys()])].sort();
  const actions = ids.map((id) => planDocument(id, local.get(id), remote.docs.get(id), base.get(id), ctx));
  const extras = [...remote.docs.values()].flatMap((doc) => (doc.live && doc.trash ? [doc.trash] : []));
  const strays = [...extras, ...remote.strays].map((stray) => planStray(stray, remote, base, ctx, local));
  // Strays first: a document's own action must not write over one still unresolved.
  return [...strays, ...actions].filter((action) => action.kind !== 'nothing');
}
