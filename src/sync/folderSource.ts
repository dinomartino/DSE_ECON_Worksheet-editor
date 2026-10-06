import type { LibraryBridge, LibraryChanged, LibraryFile, LibraryWatch } from '@/platform/library';
import type { ChangesResult, ListResult, ReadResult, RemoveResult, SyncSource, Unavailable, WriteResult } from './types';

/**
 * The cloud folder as a `SyncSource` (`docs/design/sync-engine.md`), over the shell's library
 * commands (`src/platform/library.ts:desktopLibrary`) or a fake in tests.
 *
 * - Keys are the folder's relative paths, every `*.json` the shell lists. A provider's conflict
 *   copy ("x.worksheet (1).json") keeps its own name, so the planner sees it as a stray.
 * - Revision = SHA-256 of the file's bytes. Writes and removes are compare-and-swap on it.
 * - A root that cannot be used (missing, no marker, a newer build's) is `unavailable`, with the
 *   shell's reason.
 * - A file that will not read is `unreadable`: the engine holds that document, and the shell
 *   makes every compare-and-swap write over it conflict. (`missing` would trash it;
 *   `unavailable` would stop every run for one bad file.)
 */

export interface FolderSource extends SyncSource {
  /** Stops the watcher. */
  close(): void;
}

const UNAVAILABLE: Unavailable = { status: 'unavailable' };

/** Listed but not hashed (not downloaded, or unreadable): differs from every base, so it is read. */
function revisionOf(file: LibraryFile): string {
  return file.hash ?? `unread:${file.size}:${file.mtimeMs}`;
}

let instances = 0;

class LibraryFolderSource implements FolderSource {
  /** Cursors from another instance (a restart) always reset. */
  private readonly instance = `${Date.now().toString(36)}-${(instances += 1).toString(36)}`;
  private epoch = 0;
  private generation = 0;
  private log: { generation: number; keys: string[] }[] = [];
  private watch?: LibraryWatch;
  private starting?: Promise<'ok' | 'none' | Unavailable>;
  private closed = false;

  constructor(
    private readonly bridge: LibraryBridge,
    private readonly maxLog: number,
  ) {}

  async list(): Promise<ListResult> {
    const listed = await this.bridge.list();
    if (listed.status !== 'ok') return this.lost(listed.reason);
    return { status: 'ok', entries: listed.files.map((file) => ({ key: file.path, revision: revisionOf(file), size: file.size })) };
  }

  async read(key: string): Promise<ReadResult> {
    const read = await this.bridge.read(key);
    switch (read.status) {
      case 'ok':
        return { status: 'ok', text: read.text, revision: read.hash };
      case 'missing':
        return { status: 'missing' };
      case 'unreadable':
        return { status: 'unreadable' };
      default:
        return this.lost(read.reason);
    }
  }

  async write(key: string, text: string, options: { expectRevision: string | null }): Promise<WriteResult> {
    const written = await this.bridge.write(key, text, options.expectRevision ?? 'absent');
    if (written.status === 'ok') return { status: 'ok', revision: written.hash };
    return written.status === 'conflict' ? written : this.lost(written.reason);
  }

  async remove(key: string, options: { expectRevision: string }): Promise<RemoveResult> {
    const removed = await this.bridge.remove(key, options.expectRevision);
    return removed.status === 'unavailable' ? this.lost(removed.reason) : removed;
  }

  /**
   * From watcher events. `reset` whenever one may have been missed: the first call, a watcher
   * (re)start, a `rescan` event, more events than the log holds, a watcher that would not
   * start (then every call resets, and the start is retried).
   */
  async changes(cursor: string | null): Promise<ChangesResult> {
    const watching = await this.ensureWatching();
    if (typeof watching === 'object') return watching;
    const now = this.cursor();
    if (watching === 'none' || cursor === null) return { status: 'reset', cursor: now };
    const split = cursor.lastIndexOf(':');
    const since = Number(cursor.slice(split + 1));
    if (cursor.slice(0, split) !== this.era() || !Number.isInteger(since) || since > this.generation) {
      return { status: 'reset', cursor: now };
    }
    const keys = [...new Set(this.log.filter((entry) => entry.generation > since).flatMap((entry) => entry.keys))];
    return { status: 'ok', keys, cursor: now };
  }

  close(): void {
    this.closed = true;
    this.dropWatch();
  }

  private era(): string {
    return `${this.instance}.${this.epoch}`;
  }

  private cursor(): string {
    return `${this.era()}:${this.generation}`;
  }

  /** Forget every event so far: each older cursor resets. */
  private restart(): void {
    this.epoch += 1;
    this.log = [];
  }

  private ensureWatching(): Promise<'ok' | 'none' | Unavailable> {
    if (this.watch) return Promise.resolve('ok');
    if (this.closed) return Promise.resolve('none');
    this.starting ??= this.startWatching().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }

  private async startWatching(): Promise<'ok' | 'none' | Unavailable> {
    let started: Awaited<ReturnType<LibraryBridge['watch']>>;
    try {
      started = await this.bridge.watch((event) => this.heard(event));
    } catch {
      return 'none';
    }
    if ('status' in started) return { status: 'unavailable', reason: started.reason };
    if (this.closed) {
      started.stop();
      return 'none';
    }
    this.watch = started;
    this.restart();
    return 'ok';
  }

  private heard(event: LibraryChanged): void {
    if (!this.watch || event.session !== this.watch.session) return;
    // The root itself changed (moved, deleted, remounted): watch it afresh.
    if (event.rescan) return this.dropWatch();
    this.generation += 1;
    this.log.push({ generation: this.generation, keys: event.paths });
    if (this.log.length > this.maxLog) this.restart();
  }

  private dropWatch(): void {
    this.watch?.stop();
    this.watch = undefined;
    this.restart();
  }

  /** The root went away: its watcher watches nothing now. */
  private lost(reason?: string): Unavailable {
    if (this.watch) this.dropWatch();
    return reason ? { status: 'unavailable', reason } : UNAVAILABLE;
  }
}

/** `maxLog`: watcher bursts remembered between two `changes` calls before they reset. */
export function folderSource(bridge: LibraryBridge, options: { maxLog?: number } = {}): FolderSource {
  return new LibraryFolderSource(bridge, options.maxLog ?? 500);
}
