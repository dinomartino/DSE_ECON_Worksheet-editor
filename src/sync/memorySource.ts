import { WORKSHEET_SUFFIX } from './keys';
import type {
  ChangesResult,
  ListResult,
  ReadResult,
  RemoveResult,
  SyncSource,
  Unavailable,
  WriteResult,
} from './types';

/**
 * An in-memory cloud shared by simulated computers, each reaching it through its own
 * `client(name)`. Faults on demand:
 * - `delayed`: a client sees its own writes at once, others only after `deliver()`;
 *   a delivered write that meets a newer one becomes a provider conflict copy
 *   ("<id> (conflict copy).worksheet.json"), a delivered delete that meets an edit is
 *   dropped — what cloud clients do.
 * - `put` / `drop`: an edit or delete made outside the app (by hand, another device).
 * - `setUnavailable`, `failAfter(n)`: offline now, or after n more calls (mid-run).
 * Removed entries go to `recycled`, as a source's own trash.
 */

interface StoredFile {
  text: string;
  revision: string;
}

interface PendingOp {
  key: string;
  /** null: a delete. */
  text: string | null;
  /** The revision the client saw when it changed the key; null: none. */
  base: string | null;
  revision: string;
}

const UNAVAILABLE: Unavailable = { status: 'unavailable' };

export class MemoryCloud {
  readonly files = new Map<string, StoredFile>();
  readonly recycled: { key: string; text: string }[] = [];
  delayed = false;
  private counter = 0;
  private epoch = 0;
  private log: { seq: number; key: string }[] = [];
  private seq = 0;
  private readonly pending = new Map<string, PendingOp[]>();
  private readonly offline = new Set<string>();
  private readonly budget = new Map<string, number>();

  client(name = 'default'): SyncSource {
    return new MemorySource(this, name);
  }

  nextRevision(): string {
    this.counter += 1;
    return `r${this.counter}`;
  }

  /** An edit from outside the app, committed at once. */
  put(key: string, text: string): string {
    const revision = this.nextRevision();
    this.commit(key, { text, revision });
    return revision;
  }

  /** A delete from outside the app. */
  drop(key: string): void {
    const file = this.files.get(key);
    if (file) this.recycled.push({ key, text: file.text });
    this.commit(key, undefined);
  }

  setUnavailable(client: string, unavailable: boolean): void {
    if (unavailable) this.offline.add(client);
    else this.offline.delete(client);
    this.budget.delete(client);
  }

  /** The client goes offline after `calls` more calls succeed. */
  failAfter(client: string, calls: number): void {
    this.budget.set(client, calls);
  }

  /** Forget the change log: every older cursor gets `reset`. */
  compactLog(): void {
    this.epoch += 1;
    this.log = [];
  }

  /** Bring every client's pending changes to everyone, in client then write order. */
  deliver(): void {
    for (const ops of this.pending.values()) {
      for (const op of ops) {
        const current = this.files.get(op.key);
        if ((current?.revision ?? null) === op.base) {
          this.commit(op.key, op.text === null ? undefined : { text: op.text, revision: op.revision });
        } else if (op.text !== null && current?.text !== op.text) {
          this.commit(this.conflictName(op.key), { text: op.text, revision: this.nextRevision() });
        }
        // A delete that met an edit is dropped: the edit wins.
      }
    }
    this.pending.clear();
  }

  /** Called by every client operation: false when the client is offline. */
  reach(client: string): boolean {
    if (this.offline.has(client)) return false;
    const left = this.budget.get(client);
    if (left === undefined) return true;
    if (left <= 0) {
      this.offline.add(client);
      this.budget.delete(client);
      return false;
    }
    this.budget.set(client, left - 1);
    return true;
  }

  view(client: string, key: string): StoredFile | undefined {
    const ops = this.pending.get(client)?.filter((op) => op.key === key);
    const last = ops?.at(-1);
    if (last) return last.text === null ? undefined : { text: last.text, revision: last.revision };
    return this.files.get(key);
  }

  keysFor(client: string): string[] {
    const keys = new Set(this.files.keys());
    for (const op of this.pending.get(client) ?? []) {
      if (op.text === null) keys.delete(op.key);
      else keys.add(op.key);
    }
    return [...keys].sort();
  }

  change(client: string, key: string, text: string | null): string {
    const revision = this.nextRevision();
    if (!this.delayed) {
      this.commit(key, text === null ? undefined : { text, revision });
      return revision;
    }
    const ops = this.pending.get(client) ?? [];
    // Based on what this client saw, so its own successive writes chain on delivery.
    ops.push({ key, text, base: this.view(client, key)?.revision ?? null, revision });
    this.pending.set(client, ops);
    return revision;
  }

  changesSince(cursor: string | null): ChangesResult {
    const now = `${this.epoch}:${this.seq}`;
    const [epoch, seq] = (cursor ?? '').split(':').map(Number);
    if (cursor === null || epoch !== this.epoch || Number.isNaN(seq)) return { status: 'reset', cursor: now };
    const keys = [...new Set(this.log.filter((entry) => entry.seq > seq).map((entry) => entry.key))];
    return { status: 'ok', keys, cursor: now };
  }

  private commit(key: string, file: StoredFile | undefined): void {
    if (file) this.files.set(key, file);
    else this.files.delete(key);
    this.seq += 1;
    this.log.push({ seq: this.seq, key });
  }

  private conflictName(key: string): string {
    const stem = key.endsWith(WORKSHEET_SUFFIX) ? key.slice(0, -WORKSHEET_SUFFIX.length) : key;
    for (let n = 1; ; n += 1) {
      const name = `${stem} (conflict copy${n > 1 ? ` ${n}` : ''})${WORKSHEET_SUFFIX}`;
      if (!this.files.has(name)) return name;
    }
  }
}

class MemorySource implements SyncSource {
  constructor(
    private readonly cloud: MemoryCloud,
    private readonly name: string,
  ) {}

  async list(): Promise<ListResult> {
    if (!this.cloud.reach(this.name)) return UNAVAILABLE;
    const entries = this.cloud.keysFor(this.name).map((key) => {
      const file = this.cloud.view(this.name, key)!;
      return { key, revision: file.revision, size: file.text.length };
    });
    return { status: 'ok', entries };
  }

  async read(key: string): Promise<ReadResult> {
    if (!this.cloud.reach(this.name)) return UNAVAILABLE;
    const file = this.cloud.view(this.name, key);
    return file ? { status: 'ok', text: file.text, revision: file.revision } : { status: 'missing' };
  }

  async write(key: string, text: string, options: { expectRevision: string | null }): Promise<WriteResult> {
    if (!this.cloud.reach(this.name)) return UNAVAILABLE;
    const current = this.cloud.view(this.name, key);
    if ((current?.revision ?? null) !== options.expectRevision) return { status: 'conflict' };
    return { status: 'ok', revision: this.cloud.change(this.name, key, text) };
  }

  async remove(key: string, options: { expectRevision: string }): Promise<RemoveResult> {
    if (!this.cloud.reach(this.name)) return UNAVAILABLE;
    const current = this.cloud.view(this.name, key);
    if (!current) return { status: 'missing' };
    if (current.revision !== options.expectRevision) return { status: 'conflict' };
    this.cloud.recycled.push({ key, text: current.text });
    this.cloud.change(this.name, key, null);
    return { status: 'ok' };
  }

  async changes(cursor: string | null): Promise<ChangesResult> {
    if (!this.cloud.reach(this.name)) return UNAVAILABLE;
    return this.cloud.changesSince(cursor);
  }
}
