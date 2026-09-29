import { cleanPatternName, holdsPatterns, samePatternName } from '@/model/patterns';

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
 * **Every row is judged alone.** A malformed row is skipped; the rest survive. Anything
 * unreadable is an empty registry. Fields a newer build wrote are kept through a rewrite.
 */

export interface PatternEntry {
  /** A sub-topic code (`holdsPatterns`). */
  topic: string;
  /** The question type it is for (the registry id; MCQ and LQ lists are separate). */
  typeId: string;
  name: string;
  createdAt?: string;
}

export interface PatternRegistry {
  patterns: PatternEntry[];
  /** Top-level fields a newer build wrote, kept through a rewrite. */
  __unknown?: Record<string, unknown>;
}

/** Web storage key. Outside the document prefix, so no build reads it as a document. */
export const PATTERNS_KEY = 'econ-worksheet-patterns';

const FORMAT = 1;

export const EMPTY_PATTERNS: PatternRegistry = { patterns: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** One registry row, or undefined when it cannot be used. Extra fields pass through. */
export function usablePatternEntry(row: unknown): PatternEntry | undefined {
  if (!isRecord(row)) return undefined;
  const { topic, typeId, name } = row;
  if (typeof topic !== 'string' || !holdsPatterns(topic)) return undefined;
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

/** Parsed JSON → a registry this build can use, row by row. A repeat keeps the first. */
export function usablePatterns(parsed: unknown): PatternRegistry {
  if (!isRecord(parsed)) return { patterns: [] };
  const { patterns: rawPatterns, ...rest } = parsed;
  delete rest.format;
  const patterns: PatternEntry[] = [];
  if (Array.isArray(rawPatterns)) {
    for (const row of rawPatterns) {
      const entry = usablePatternEntry(row);
      if (entry && !patterns.some((kept) => sameEntry(kept, entry))) patterns.push(entry);
    }
  }
  const state: PatternRegistry = { patterns };
  if (Object.keys(rest).length > 0) state.__unknown = rest;
  return state;
}

/** A stored string → registry; anything unparseable is an empty one. */
export function parsePatterns(raw: string | null | undefined): PatternRegistry {
  if (!raw) return { patterns: [] };
  try {
    return usablePatterns(JSON.parse(raw));
  } catch {
    return { patterns: [] };
  }
}

export function serializePatterns(state: PatternRegistry): Record<string, unknown> {
  return { ...(state.__unknown ?? {}), format: FORMAT, patterns: state.patterns };
}

export function isEmptyPatterns(state: PatternRegistry): boolean {
  return state.patterns.length === 0;
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
}

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
 */
export async function updatePatternRegistry(
  file: PatternFile,
  recipe: (state: PatternRegistry) => PatternRegistry,
): Promise<PatternRegistry> {
  const state = await readPatternRegistry(file);
  const next = recipe(state);
  if (next === state) return state;
  await file.write(isEmptyPatterns(next) && !next.__unknown ? undefined : JSON.stringify(serializePatterns(next)));
  return next;
}
