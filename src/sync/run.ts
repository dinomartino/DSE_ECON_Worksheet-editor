import { contentOfText, type Content } from './content';
import { documentKey } from './keys';
import { planDocument, planSync, type Copy, type HoldReason, type KeyRevision, type PlanContext, type Seen, type SyncAction } from './plan';
import { readLocal, readLocalDoc, readRemote, readRemoteDoc } from './snapshot';
import type { BaseStore, CopyNamer, HashCache, Place, SyncSource, SyncStore } from './types';

/**
 * The executor: one run = list both sides, plan, apply. Every remote write is a
 * compare-and-swap and every local write re-reads the document first; either finding
 * a change re-plans that one document (bounded). The base is updated only after both
 * sides agree, so a run stopped after any single step loses nothing: the next run sees
 * the half-done step as a change and finishes it. One bad document never stops the run.
 */

export interface SyncReport {
  status: 'ok' | 'unavailable';
  /** With `unavailable`: the source's reason, when it gave one. */
  reason?: string;
  /**
   * The source held no documents at all although the base says it had live ones: a
   * folder emptied or swapped, not a mass delete (deletes go to Trash, which stays). The base was dropped and this run treated as
   * a first sync, so the mirror is filled again from this computer and nothing here is
   * trashed. The interface may say so.
   */
  remoteWasEmpty: boolean;
  counts: Record<Count, number>;
  /** Copies made because both sides changed: the "Needs attention" list. */
  conflicts: { id: string; copyId: string; name: string }[];
  held: { id?: string; key?: string; reason: HoldReason }[];
  errors: { key: string; message: string }[];
}

type Count =
  | 'uploaded'
  | 'downloaded'
  | 'movedRemote'
  | 'movedLocal'
  | 'conflicts'
  | 'providerCopies'
  | 'duplicatesDropped'
  | 'linked'
  | 'forgotten'
  | 'purgedRemote'
  | 'held';

export interface RunOptions {
  store: SyncStore;
  source: SyncSource;
  base: BaseStore;
  namer: CopyNamer;
  now?: () => Date;
  /** Attempts per document when it keeps changing under the run. */
  maxAttempts?: number;
  /**
   * Hashes of unchanged local documents, so they are not loaded every run. Sound only
   * when every write to `store` forgets (`forgetOnWrite`). Absent: every document is loaded.
   */
  hashCache?: HashCache;
  /**
   * A document open with unsaved edits. Nothing is done to it while this says so (held
   * `busy`): its edits are based on what is stored, so they are saved first and the next
   * run compares them. Asked again after each local write: an edit that arrived during
   * one leaves the base as it was, so the edit's save meets that version as a conflict.
   */
  isBusy?: (id: string) => boolean;
}

class SourceUnavailable extends Error {
  constructor(readonly reason?: string) {
    super('unavailable');
  }
}
/** The document changed since it was planned, on either side: re-plan it. */
class Stale extends Error {}
/** Open with unsaved edits (`isBusy`): hold it this run. */
class Busy extends Error {}

const COUNT: Partial<Record<SyncAction['kind'], Count>> = {
  upload: 'uploaded',
  download: 'downloaded',
  moveRemote: 'movedRemote',
  moveLocal: 'movedLocal',
  conflict: 'conflicts',
  providerCopy: 'providerCopies',
  dropDuplicate: 'duplicatesDropped',
  link: 'linked',
  forget: 'forgotten',
  purgeRemote: 'purgedRemote',
  hold: 'held',
};

function emptyReport(): SyncReport {
  const counts = Object.fromEntries(Object.values(COUNT).map((name) => [name, 0])) as Record<Count, number>;
  return { status: 'ok', remoteWasEmpty: false, counts, conflicts: [], held: [], errors: [] };
}

export async function runSync(options: RunOptions): Promise<SyncReport> {
  const { store, source, base } = options;
  const report = emptyReport();
  const listing = await source.list();
  if (listing.status === 'unavailable') return unavailable(report, listing.reason);
  const baseEntries = await base.load();
  const local = await readLocal(store, options.hashCache);
  const remote = await readRemote(source, listing.entries, baseEntries);
  if ('status' in remote) return unavailable(report, remote.reason);

  const hadLive = [...baseEntries.values()].some((entry) => entry.place === 'live');
  if (hadLive && remote.docs.size === 0 && remote.strays.length === 0) {
    for (const id of baseEntries.keys()) await base.remove(id);
    baseEntries.clear();
    report.remoteWasEmpty = true;
  }

  const ctx: PlanContext = { namer: options.namer, now: (options.now ?? (() => new Date()))() };
  const executor = new Executor(options, ctx, report);
  for (const action of planSync(local, remote, baseEntries, ctx)) {
    try {
      await executor.apply(action, 1);
    } catch (error) {
      if (error instanceof SourceUnavailable) return unavailable(report, error.reason);
      report.errors.push({ key: keyOf(action), message: error instanceof Error ? error.message : String(error) });
    }
  }
  return report;
}

const unavailable = (report: SyncReport, reason?: string): SyncReport => ({
  ...report,
  status: 'unavailable',
  ...(reason ? { reason } : {}),
});

function keyOf(action: SyncAction): string {
  if ('id' in action && action.id) return documentKey(action.id, 'live');
  if ('from' in action) return action.from.key;
  return 'key' in action && action.key ? action.key : '';
}

class Executor {
  private readonly maxAttempts: number;

  constructor(
    private readonly options: RunOptions,
    private readonly ctx: PlanContext,
    private readonly report: SyncReport,
  ) {
    this.maxAttempts = options.maxAttempts ?? 3;
  }

  async apply(action: SyncAction, attempt: number): Promise<void> {
    // Planned from a cached hash: load it whole and plan again. Not a retry.
    if (action.kind === 'needsLocal') return this.apply(await this.replan(action.id), attempt);
    try {
      if (action.kind !== 'hold' && 'id' in action && this.busy(action.id)) throw new Busy();
      await this.step(action);
      const count = COUNT[action.kind];
      if (count) this.report.counts[count] += 1;
    } catch (error) {
      if (error instanceof Busy) return this.heldBusy(action);
      if (!(error instanceof Stale)) throw error;
      if (!('id' in action) || !action.id || attempt >= this.maxAttempts) {
        throw new Error('It kept changing during sync; trying again next time.');
      }
      await this.apply(await this.replan(action.id), attempt + 1);
    }
  }

  private async replan(id: string): Promise<SyncAction> {
    const remote = await readRemoteDoc(this.options.source, id);
    if ('status' in remote) throw new SourceUnavailable(remote.reason);
    const local = await this.local(id);
    const base = (await this.options.base.load()).get(id);
    return planDocument(id, local, remote, base, this.ctx);
  }

  private heldBusy(action: SyncAction): void {
    const id = 'id' in action ? action.id : undefined;
    const key = 'from' in action ? action.from.key : undefined;
    this.report.held.push({ ...(id ? { id } : {}), ...(key && !id ? { key } : {}), reason: 'busy' });
    this.report.counts.held += 1;
  }

  private busy(id: string): boolean {
    return this.options.isBusy?.(id) ?? false;
  }

  /** A local write to `id`, never under unsaved edits: checked before, and again after. */
  private async touch<T>(id: string, work: () => Promise<T>): Promise<T> {
    if (this.busy(id)) throw new Busy();
    const result = await work();
    // An edit arrived while this wrote: it is based on the version before. The base is
    // left as it was, so that edit's save is compared with this version (keep both).
    if (this.busy(id)) throw new Busy();
    return result;
  }

  /** Fresh and whole; it refreshes the hash cache too. */
  private local(id: string) {
    return readLocalDoc(this.options.store, id, this.options.hashCache);
  }

  private async step(action: SyncAction): Promise<void> {
    const { store, source, base } = this.options;
    switch (action.kind) {
      case 'nothing':
        return;
      case 'link':
        return base.put(action.entry);
      case 'forget':
        return base.remove(action.id);
      case 'hold':
        this.report.held.push({ ...(action.id ? { id: action.id } : {}), ...(action.key ? { key: action.key } : {}), reason: action.reason });
        return;
      case 'upload': {
        const content = await this.confirmLocal(action.id, action.seen);
        const target = documentKey(action.id, action.place);
        if (!action.cleanup) return this.record(action.id, action.place, content, await this.write(target, content.text, action.expect));
        // Moving too: change the content where it is, then move the same bytes. No moment
        // shows two different versions, which the other computer would have to keep as a
        // conflict; a stop between the steps leaves a plain move for the next run.
        const leaving: Place = action.place === 'live' ? 'trash' : 'live';
        const inPlace = await this.write(action.cleanup.key, content.text, action.cleanup.revision);
        await this.record(action.id, leaving, content, inPlace);
        const revision = await this.write(target, content.text, action.expect);
        await this.removeIfUnchanged({ key: action.cleanup.key, revision: inPlace });
        return this.record(action.id, action.place, content, revision);
      }
      case 'download':
        return this.pull(action.id, action.place, action.from, action.seen);
      case 'moveRemote': {
        const content = await this.confirmLocal(action.id, action.seen);
        const read = await this.readExact(action.from);
        // The remote bytes move as they are: a move never rewrites content. Written before
        // the old key goes, so the remote never holds no copy.
        const revision = await this.write(documentKey(action.id, action.to), read, action.expect);
        await this.removeIfUnchanged(action.from);
        return this.record(action.id, action.to, content, revision);
      }
      case 'moveLocal': {
        const content = await this.confirmLocal(action.id, action.seen);
        if (action.to === 'trash') await this.touch(action.id, () => store.trash(action.id));
        else if ((await this.touch(action.id, () => store.restore(action.id))) !== action.id) throw new Error('Restored under another id.');
        return this.record(action.id, action.to, content, action.revision);
      }
      case 'conflict': {
        await this.confirmLocal(action.id, action.seen);
        await this.placeCopy(action.copy);
        if (!this.report.conflicts.some((entry) => entry.copyId === action.copy.id)) {
          this.report.conflicts.push({ id: action.id, copyId: action.copy.id, name: action.copy.worksheet.name ?? '' });
        }
        // This computer's version is safe in the copy; the id takes the remote's.
        return this.pull(action.id, action.place, action.from, action.seen);
      }
      case 'purgeRemote': {
        const removed = await source.remove(action.from.key, { expectRevision: action.from.revision });
        if (removed.status === 'unavailable') throw new SourceUnavailable(removed.reason);
        if (removed.status === 'conflict') throw new Stale();
        return base.remove(action.id);
      }
      case 'providerCopy': {
        await this.placeCopy(action.copy);
        // The provider's file goes only once the canonical copy reads back the same.
        const back = await source.read(documentKey(action.copy.id, action.copy.place));
        if (back.status === 'unavailable') throw new SourceUnavailable(back.reason);
        if (back.status === 'ok' && sameContent(back.text, action.copy)) await this.removeIfUnchanged(action.from);
        return;
      }
      case 'dropDuplicate':
        return this.removeIfUnchanged(action.from);
    }
  }

  /** The local document as planned, or Stale: the teacher saved, trashed or restored since. */
  private async confirmLocal(id: string, seen: Seen): Promise<Content> {
    const now = await this.local(id);
    if (!now || now.place !== seen.place || now.content === 'unreadable' || now.content.hash !== seen.hash) throw new Stale();
    return now.content;
  }

  private async write(key: string, text: string, expect: string | null): Promise<string> {
    const written = await this.options.source.write(key, text, { expectRevision: expect });
    if (written.status === 'unavailable') throw new SourceUnavailable(written.reason);
    if (written.status === 'conflict') throw new Stale();
    return written.revision;
  }

  private async readExact(from: KeyRevision): Promise<string> {
    const read = await this.options.source.read(from.key);
    if (read.status === 'unavailable') throw new SourceUnavailable(read.reason);
    // Gone, changed or unreadable since it was planned: plan it again (an unreadable one is held).
    if (read.status !== 'ok' || read.revision !== from.revision) throw new Stale();
    return read.text;
  }

  /** A key whose content is already elsewhere. Changed since: left alone (an edit wins). */
  private async removeIfUnchanged(from: KeyRevision): Promise<void> {
    const removed = await this.options.source.remove(from.key, { expectRevision: from.revision });
    if (removed.status === 'unavailable') throw new SourceUnavailable(removed.reason);
  }

  private async record(id: string, place: Place, content: Content, revision: string): Promise<void> {
    await this.options.base.put({ id, kind: 'worksheet', place, hash: content.hash, revision, schemaVersion: content.schemaVersion });
  }

  /** Remote's content into the local store, at `place`. */
  private async pull(id: string, place: Place, from: KeyRevision, seen: Seen | null): Promise<void> {
    const { store } = this.options;
    const incoming = contentOfText(await this.readExact(from));
    if (incoming.worksheet.id !== id) throw new Error('The file holds another document.');
    const now = await this.local(id);
    const unchanged = seen
      ? now && now.place === seen.place && now.content !== 'unreadable' && now.content.hash === seen.hash
      : !now;
    if (!unchanged) throw new Stale();
    const differs = !now || (now.content as Content).hash !== incoming.hash;
    if (place === 'live') {
      if (now?.place === 'trash' && (await this.touch(id, () => store.restore(id))) !== id) throw new Error('Restored under another id.');
      if (differs) await this.touch(id, () => store.adopt(incoming.worksheet));
    } else {
      if (differs) await this.touch(id, () => store.adopt(incoming.worksheet));
      if (differs || now?.place === 'live') await this.touch(id, () => store.trash(id));
    }
    const after = await this.local(id);
    if (!after || after.content === 'unreadable') throw new Error('The downloaded document will not load.');
    await this.record(id, place, after.content, from.revision);
  }

  /**
   * A copy sync makes, on both sides, idempotently: a resumed run finds it and moves on.
   * Its id is derived from the version it copies, so one already there under that id is
   * that copy — maybe edited since, and then it syncs as a document of its own.
   */
  private async placeCopy(copy: Copy): Promise<void> {
    const { store, source } = this.options;
    const existing = await this.local(copy.id);
    if (existing && (existing.content === 'unreadable' || existing.content.hash !== copy.hash)) return;
    if (!existing) {
      await this.touch(copy.id, () => store.adopt(copy.worksheet));
      if (copy.place === 'trash') await this.touch(copy.id, () => store.trash(copy.id));
    }
    const key = documentKey(copy.id, copy.place);
    const written = await source.write(key, copy.text, { expectRevision: null });
    if (written.status === 'unavailable') throw new SourceUnavailable(written.reason);
    let revision: string;
    if (written.status === 'ok') revision = written.revision;
    else {
      const there = await source.read(key);
      if (there.status === 'unavailable') throw new SourceUnavailable(there.reason);
      if (there.status !== 'ok' || !sameContent(there.text, copy)) return;
      revision = there.revision;
    }
    const placed = await this.local(copy.id);
    if (!placed || placed.content === 'unreadable') throw new Error('The copy will not load.');
    await this.record(copy.id, copy.place, placed.content, revision);
  }
}

function sameContent(text: string, copy: Copy): boolean {
  try {
    return contentOfText(text).hash === copy.hash;
  } catch {
    return false;
  }
}
