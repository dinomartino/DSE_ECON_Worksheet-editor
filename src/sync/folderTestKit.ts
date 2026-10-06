import type {
  LibraryBridge,
  LibraryChanged,
  LibraryFile,
  LibraryListResult,
  LibraryReadResult,
  LibraryRemoveResult,
  LibraryUnavailable,
  LibraryUnavailableReason,
  LibraryWatch,
  LibraryWriteResult,
} from '@/platform/library';
import { folderSource } from './folderSource';
import { sha256 } from './hash';
import type { MemoryCloud } from './memorySource';
import type { Connect } from './testKit';

/**
 * Test-only: the shell's library commands (`src-tauri/src/library.rs`) as one computer sees
 * its synced folder, over a `MemoryCloud` that plays the cloud client (delayed delivery and
 * provider conflict copies, offline spells). Same rules as the Rust: compare-and-swap on the
 * bytes' hash, identical bytes not written, only valid `*.json` paths listed, the marker
 * skipped, an unusable root `unavailable`, placeholders listed unhashed, unreadable files
 * listed and never written over. Each call reaches the cloud once, as `MemorySource` does.
 */

export const MARKER = 'econ-studio-library.json';

/** `relative_parts` in `library.rs`: the paths the shell accepts. */
export function libraryPath(path: string): boolean {
  if (path === '' || path.length > 1024 || path.startsWith('/')) return false;
  const parts = path.split('/');
  const valid = (name: string) =>
    name !== '' && !name.startsWith('.') && !name.endsWith('.') && !name.endsWith(' ') && !/[\\:\p{Cc}]/u.test(name);
  if (parts.length > 8 || !parts.every(valid)) return false;
  const last = parts[parts.length - 1];
  return !last.endsWith('.tmp') && !(parts.length === 1 && last === MARKER);
}

export class FakeLibrary implements LibraryBridge {
  /** Set: the root cannot be used, for this reason. */
  root: LibraryUnavailableReason | null = null;
  /** `evicted`: listed unhashed, a read downloads it. `stuck`: will not read at all. */
  readonly placeholders = new Map<string, 'evicted' | 'stuck'>();
  watchFails = false;
  private session = 0;
  private readonly listeners = new Map<number, (event: LibraryChanged) => void>();
  private readonly hashes = new Map<string, string>();

  constructor(
    readonly cloud: MemoryCloud,
    readonly client: string,
  ) {}

  async list(): Promise<LibraryListResult> {
    const down = this.reach();
    if (down) return down;
    const files: LibraryFile[] = this.cloud
      .keysFor(this.client)
      .filter((path) => libraryPath(path) && path.endsWith('.json'))
      .map((path) => {
        const text = this.cloud.view(this.client, path)!.text;
        const held = this.placeholders.get(path);
        const state = held === 'evicted' ? 'placeholder' : held === 'stuck' ? 'unreadable' : 'ok';
        return { path, size: text.length, mtimeMs: 0, hash: held ? null : this.hash(text), state };
      });
    return { status: 'ok', files };
  }

  async read(path: string): Promise<LibraryReadResult> {
    this.check(path);
    const down = this.reach();
    if (down) return down;
    if (this.placeholders.get(path) === 'stuck') return { status: 'unreadable' };
    this.placeholders.delete(path); // Reading downloads it.
    const file = this.cloud.view(this.client, path);
    return file ? { status: 'ok', text: file.text, hash: this.hash(file.text) } : { status: 'missing' };
  }

  async write(path: string, text: string, expect: string): Promise<LibraryWriteResult> {
    this.check(path);
    const down = this.reach();
    if (down) return down;
    const current = this.current(path);
    if (current === undefined || current !== expect) return { status: 'conflict' };
    const hash = this.hash(text);
    if (current !== hash) this.cloud.change(this.client, path, text);
    return { status: 'ok', hash };
  }

  async remove(path: string, expect: string): Promise<LibraryRemoveResult> {
    this.check(path);
    const down = this.reach();
    if (down) return down;
    const current = this.current(path);
    if (current === 'absent') return { status: 'missing' };
    if (current === undefined || current !== expect) return { status: 'conflict' };
    this.cloud.recycled.push({ key: path, text: this.cloud.view(this.client, path)!.text });
    this.cloud.change(this.client, path, null);
    return { status: 'ok' };
  }

  async watch(onChange: (event: LibraryChanged) => void): Promise<LibraryWatch | LibraryUnavailable> {
    if (this.watchFails) throw new Error('watcher would not start');
    if (this.root) return { status: 'unavailable', reason: this.root };
    this.session += 1;
    const session = this.session;
    this.listeners.clear(); // Rust keeps one watcher: a new one replaces the old.
    this.listeners.set(session, onChange);
    return { session, stop: () => this.listeners.delete(session) };
  }

  /** A watcher burst, as the shell emits it; `session` defaults to the current one. */
  emit(paths: string[], options: { rescan?: boolean; session?: number } = {}): void {
    const session = options.session ?? this.session;
    for (const listener of this.listeners.values()) listener({ session, paths, rescan: options.rescan ?? false });
  }

  get watching(): boolean {
    return this.listeners.size > 0;
  }

  /** Rust returns `Err` for a bad path: the bridge call rejects. */
  private check(path: string): void {
    if (!libraryPath(path)) throw new Error(`not a library path: ${JSON.stringify(path)}`);
  }

  private reach(): LibraryUnavailable | undefined {
    if (this.root) return { status: 'unavailable', reason: this.root };
    return this.cloud.reach(this.client) ? undefined : { status: 'unavailable', reason: 'root-missing' };
  }

  /** The current bytes' hash, `'absent'`, or undefined: will not read, so never matches. */
  private current(path: string): string | undefined {
    if (this.placeholders.get(path) === 'stuck') return undefined;
    this.placeholders.delete(path);
    const file = this.cloud.view(this.client, path);
    return file ? this.hash(file.text) : 'absent';
  }

  private hash(text: string): string {
    let hash = this.hashes.get(text);
    if (hash === undefined) {
      hash = sha256(text);
      this.hashes.set(text, hash);
    }
    return hash;
  }
}

/** For `testKit.computer`: a computer reaching the cloud through its folder. */
export const folderConnect: Connect = (cloud: MemoryCloud, name: string) => folderSource(new FakeLibrary(cloud, name));
