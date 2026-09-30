import { cleanPatternName, samePatternName } from '@/model/patterns';
import { isSubTopicCode } from '@/model/topics';

/**
 * The 題型 registry: the Patterns a teacher has defined, per sub-topic and question type,
 * including ones no question uses yet. App-level, like folders: its own key
 * (`econ-worksheet-patterns`) or file (`worksheets/patterns.json`), never a field of a
 * document or an index row. It rides in the backup's manifest and is restored from it,
 * because nothing can rebuild it: a name no question carries lives only here.
 *
 * The list the bank shows is this registry joined with the names found on questions, so
 * a question's 題型 never depends on it (the tag carries the name).
 *
 * **Every row is judged alone.** A row this build cannot use is kept verbatim and written
 * back (`__rows`); the rest are read. A sub-topic is judged by the code grammar, not by
 * this build's list, so a later build's sub-topic survives. Fields a newer build wrote are
 * kept through a rewrite. A registry stored in a newer `format` is read, never written
 * (`NewerPatternsError`): writing would downgrade it. Anything unreadable is an empty
 * registry, and its text is set aside (`PatternFile.setAside`) before the first write.
 */

export interface PatternEntry {
  /** A sub-topic code by grammar (`isSubTopicCode`); only known ones are shown. */
  topic: string;
  /** The question type it is for (the registry id; MCQ and LQ lists are separate). */
  typeId: string;
  name: string;
  createdAt?: string;
}

export interface PatternRegistry {
  patterns: PatternEntry[];
  /** Rows this build cannot use (malformed, or a newer build's shape), written back verbatim. */
  __rows?: unknown[];
  /** Top-level fields a newer build wrote, kept through a rewrite. */
  __unknown?: Record<string, unknown>;
  /**
   * The stored registry as read, when its `format` is newer than this build's: it is then
   * read-only here, and a backup carries it verbatim.
   */
  __newer?: Record<string, unknown>;
  /** The stored text, when it could not be read at all: set aside before the first write. */
  __corrupt?: string;
}

/** The stored registry is in a newer `format` than this build writes: it is never overwritten. */
export class NewerPatternsError extends Error {
  constructor() {
    super('The 題型 list was saved by a newer version of Econ Studio.');
    this.name = 'NewerPatternsError';
  }
}

/** Web storage key. Outside the document prefix, so no build reads it as a document. */
export const PATTERNS_KEY = 'econ-worksheet-patterns';

/** The registry's stored shape. A later build that reshapes it bumps this; this build then only reads it. */
export const PATTERNS_FORMAT = 1;

export const EMPTY_PATTERNS: PatternRegistry = { patterns: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** One registry row, or undefined when it cannot be used. Extra fields pass through. */
export function usablePatternEntry(row: unknown): PatternEntry | undefined {
  if (!isRecord(row)) return undefined;
  const { topic, typeId, name } = row;
  if (!isSubTopicCode(topic)) return undefined;
  if (typeof typeId !== 'string' || !typeId.trim()) return undefined;
  if (typeof name !== 'string' || !cleanPatternName(name)) return undefined;
  const entry = { ...row, topic, typeId, name: cleanPatternName(name) } as PatternEntry;
  if (entry.createdAt !== undefined && typeof entry.createdAt !== 'string') delete entry.createdAt;
  return entry;
}

/** Same sub-topic, same type, same name (ignoring case and spacing). */
export function sameEntry(a: Pick<PatternEntry, 'topic' | 'typeId' | 'name'>, b: Pick<PatternEntry, 'topic' | 'typeId' | 'name'>): boolean {
  return a.topic === b.topic && a.typeId === b.typeId && samePatternName(a.name, b.name);
}

/**
 * Parsed JSON → a registry, row by row: usable rows are read (a repeat keeps the first),
 * any other row is kept verbatim in `__rows`.
 */
export function usablePatterns(parsed: unknown): PatternRegistry {
  if (!isRecord(parsed)) return { patterns: [] };
  const { patterns: rawPatterns, ...rest } = parsed;
  const format = rest.format;
  delete rest.format;
  const patterns: PatternEntry[] = [];
  const unusable: unknown[] = [];
  if (Array.isArray(rawPatterns)) {
    for (const row of rawPatterns) {
      const entry = usablePatternEntry(row);
      if (!entry) unusable.push(row);
      else if (!patterns.some((kept) => sameEntry(kept, entry))) patterns.push(entry);
    }
  }
  const state: PatternRegistry = { patterns };
  if (unusable.length > 0) state.__rows = unusable;
  if (Object.keys(rest).length > 0) state.__unknown = rest;
  if (typeof format === 'number' && format > PATTERNS_FORMAT) state.__newer = parsed;
  return state;
}

/**
 * A stored string → registry. Anything unreadable (not JSON, not an object, a `patterns`
 * that is not a list) reads as empty, carrying the text in `__corrupt` so the next write
 * sets it aside rather than over it.
 */
export function parsePatterns(raw: string | null | undefined): PatternRegistry {
  if (!raw) return { patterns: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { patterns: [], __corrupt: raw };
  }
  if (!isRecord(parsed) || (parsed.patterns !== undefined && !Array.isArray(parsed.patterns))) {
    return { patterns: [], __corrupt: raw };
  }
  return usablePatterns(parsed);
}

/** What is stored: a newer registry exactly as read; otherwise this build's rows, then the kept ones. */
export function serializePatterns(state: PatternRegistry): Record<string, unknown> {
  if (state.__newer) return state.__newer;
  return { ...(state.__unknown ?? {}), format: PATTERNS_FORMAT, patterns: [...state.patterns, ...(state.__rows ?? [])] };
}

/** Nothing to keep: no row, usable or not. */
export function isEmptyPatterns(state: PatternRegistry): boolean {
  return state.patterns.length === 0 && !state.__rows?.length && !state.__newer;
}

/** `rows` not already kept, appended to `__rows` (a restore carrying a newer build's rows). */
export function addUnusableRows(state: PatternRegistry, rows: readonly unknown[] | undefined): PatternRegistry {
  const kept = state.__rows ?? [];
  const seen = new Set(kept.map((row) => JSON.stringify(row)));
  const added = (rows ?? []).filter((row) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return added.length > 0 ? { ...state, __rows: [...kept, ...added] } : state;
}

/** The entries not yet there, appended. The same object when every one is already there. */
export function addPatternEntries(state: PatternRegistry, entries: readonly PatternEntry[], now = new Date().toISOString()): PatternRegistry {
  const patterns = [...state.patterns];
  for (const raw of entries) {
    const entry = usablePatternEntry({ createdAt: now, ...raw });
    if (entry && !patterns.some((kept) => sameEntry(kept, entry))) patterns.push(entry);
  }
  return patterns.length === state.patterns.length ? state : { ...state, patterns };
}

/** Without the entry. The same object when it was not there. */
export function removePatternEntry(state: PatternRegistry, entry: Pick<PatternEntry, 'topic' | 'typeId' | 'name'>): PatternRegistry {
  const patterns = state.patterns.filter((kept) => !sameEntry(kept, entry));
  return patterns.length === state.patterns.length ? state : { ...state, patterns };
}

/**
 * `from` renamed to `to` in place, or (when `to` is there already: a merge) dropped. A
 * `from` never registered adds `to`, so the new name outlives its last question.
 */
export function renamePatternEntry(
  state: PatternRegistry,
  from: Pick<PatternEntry, 'topic' | 'typeId' | 'name'>,
  toName: string,
  now = new Date().toISOString(),
): PatternRegistry {
  const to = { topic: from.topic, typeId: from.typeId, name: cleanPatternName(toName) };
  if (!to.name) return state;
  const at = state.patterns.findIndex((kept) => sameEntry(kept, from));
  if (at < 0) return addPatternEntries(state, [to], now);
  const target = state.patterns.findIndex((kept) => sameEntry(kept, to));
  if (target >= 0 && target !== at) return { ...state, patterns: state.patterns.filter((_, i) => i !== at) };
  if (state.patterns[at].name === to.name) return state;
  const patterns = [...state.patterns];
  patterns[at] = { ...patterns[at], name: to.name };
  return { ...state, patterns };
}

/** Text access to wherever the registry lives: a `localStorage` key or a file. */
export interface PatternFile {
  read(): Promise<string | undefined>;
  /** `undefined` removes it. */
  write(text: string | undefined): Promise<void>;
  /**
   * Keep an unreadable registry's text somewhere no write touches, before it is replaced.
   * Without it, an unreadable registry is never overwritten.
   */
  setAside?(text: string): Promise<void>;
}

/** Where the web keeps an unreadable registry it set aside: this plus a timestamp. */
export const PATTERNS_CORRUPT_PREFIX = `${PATTERNS_KEY}-corrupt-`;

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

/** The web's registry: one `localStorage` key. Blocked storage reads as empty; writes throw. */
export function localPatternFile(storage: () => Storage | undefined): PatternFile {
  return {
    async read() {
      try {
        return storage()?.getItem(PATTERNS_KEY) ?? undefined;
      } catch {
        return undefined;
      }
    },
    async write(text) {
      const store = storage();
      if (!store) throw new Error('storage is not available');
      if (text === undefined) store.removeItem(PATTERNS_KEY);
      else store.setItem(PATTERNS_KEY, text);
    },
    async setAside(text) {
      const store = storage();
      if (!store) throw new Error('storage is not available');
      store.setItem(`${PATTERNS_CORRUPT_PREFIX}${stamp()}`, text);
    },
  };
}

export async function readPatternRegistry(file: PatternFile): Promise<PatternRegistry> {
  try {
    return parsePatterns(await file.read());
  } catch {
    return { patterns: [] };
  }
}

/**
 * Read, change, write: always from what is stored now, so another tab's addition is kept.
 * Resolves with the new registry; nothing is written when the recipe changes nothing.
 * Throws `NewerPatternsError`, writing nothing, when the stored registry is newer.
 */
export async function updatePatternRegistry(
  file: PatternFile,
  recipe: (state: PatternRegistry) => PatternRegistry,
): Promise<PatternRegistry> {
  const state = await readPatternRegistry(file);
  const next = recipe(state);
  if (next === state) return state;
  if (state.__newer) throw new NewerPatternsError();
  if (state.__corrupt !== undefined) {
    // Never write over what could not be read: keep a copy first, or do not write.
    if (!file.setAside) throw new Error('The 題型 list could not be read, and there is nowhere to keep a copy.');
    await file.setAside(state.__corrupt);
  }
  await file.write(isEmptyPatterns(next) && !next.__unknown ? undefined : JSON.stringify(serializePatterns(next)));
  const { __corrupt: _set, ...written } = next;
  void _set;
  return written;
}
