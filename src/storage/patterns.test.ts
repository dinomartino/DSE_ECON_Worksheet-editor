import { describe, expect, it } from 'vitest';
import { fakeLocalStorage } from '@/library/bankTestKit';
import { LocalStorageWorksheetStore } from '.';
import { vi } from 'vitest';
import {
  addPatternEntries,
  addUnusableRows,
  localPatternFile,
  NewerPatternsError,
  parsePatterns,
  PATTERNS_KEY,
  readPatternRegistry,
  removePatternEntry,
  renamePatternEntry,
  serializePatterns,
  updatePatternRegistry,
  usablePatterns,
  type PatternFile,
  type PatternRegistry,
} from './patterns';

const NOW = '2026-09-29T00:00:00.000Z';
const ped = (name: string, typeId = 'mcq') => ({ topic: 'C.ped', typeId, name });

describe('the 題型 registry is validated row by row', () => {
  it('keeps every usable row when one is malformed', () => {
    const state = usablePatterns({
      format: 1,
      patterns: [
        ped('Calculate PED'),
        null,
        { topic: 'C', typeId: 'mcq', name: 'A coarse topic holds none' },
        { topic: 'C.ped', typeId: '', name: 'No type' },
        { topic: 'C.ped', typeId: 'mcq', name: '   ' },
        { topic: 'C.ped', typeId: 'mcq', name: 42 },
        'text',
        ped('calculate  ped'), // a repeat: the first stays
        ped('Factors', 'structured'),
      ],
    });
    expect(state.patterns.map((p) => [p.typeId, p.name])).toEqual([
      ['mcq', 'Calculate PED'],
      ['structured', 'Factors'],
    ]);
  });

  it('reads anything unreadable as empty, and keeps a newer build’s fields through a rewrite', () => {
    for (const raw of [undefined, '', 'not json', '[]', '{"patterns": "no"}']) expect(parsePatterns(raw).patterns).toEqual([]);
    const state = usablePatterns({ format: 1, patterns: [{ ...ped('A'), colour: 'red' }], future: { x: 1 } });
    expect(state.__unknown).toEqual({ future: { x: 1 } });
    const written = serializePatterns(addPatternEntries(state, [ped('B')], NOW));
    expect(written.future).toEqual({ x: 1 });
    expect((written.patterns as unknown[])[0]).toMatchObject({ name: 'A', colour: 'red' });
  });
});

describe('a newer build’s registry survives this build', () => {
  const later = { topic: 'C.new-sub', typeId: 'mcq', name: 'A later sub-topic' };
  const reshaped = { id: 'p1', topics: ['C.ped'], label: { en: 'Reshaped' } };

  it('judges a sub-topic by the grammar, and keeps rows it cannot use verbatim', () => {
    const state = usablePatterns({ format: 1, patterns: [ped('A'), later, reshaped, 42] });
    expect(state.patterns.map((p) => p.topic)).toEqual(['C.ped', 'C.new-sub']);
    expect(state.__rows).toEqual([reshaped, 42]);
    const written = serializePatterns(removePatternEntry(addPatternEntries(state, [ped('B')], NOW), ped('A')));
    expect(written.patterns).toEqual([later, { ...ped('B'), createdAt: NOW }, reshaped, 42]);
  });

  it('never writes over a registry in a newer format, and a backup carries it verbatim', async () => {
    const stored = { format: 2, patterns: [ped('A'), reshaped], extra: true };
    const file = memoryFile(JSON.stringify(stored));
    const state = await readPatternRegistry(file);
    expect(state.patterns.map((p) => p.name)).toEqual(['A']);
    await expect(updatePatternRegistry(file, (s) => addPatternEntries(s, [ped('B')], NOW))).rejects.toBeInstanceOf(NewerPatternsError);
    expect(JSON.parse(file.text!)).toEqual(stored);
    expect(serializePatterns(state)).toEqual(stored);
  });

  it('a restore adds a backup’s unusable rows once', () => {
    const state = addUnusableRows({ patterns: [], __rows: [reshaped] }, [reshaped, 42, 42]);
    expect(state.__rows).toEqual([reshaped, 42]);
  });

  it('an empty registry holding only rows it cannot use is still written, not removed', async () => {
    const file = memoryFile(JSON.stringify({ format: 1, patterns: [ped('A'), reshaped] }));
    await updatePatternRegistry(file, (s) => removePatternEntry(s, ped('A')));
    expect(JSON.parse(file.text!).patterns).toEqual([reshaped]);
  });
});

function memoryFile(initial?: string): PatternFile & { text?: string } {
  const file: PatternFile & { text?: string } = {
    text: initial,
    read: async () => file.text,
    write: async (text) => void (file.text = text),
  };
  return file;
}

describe('registry edits', () => {
  const base: PatternRegistry = { patterns: [ped('A'), ped('B'), ped('A', 'structured')] };

  it('adds only what is new, keeping MCQ and LQ apart', () => {
    expect(addPatternEntries(base, [ped('a')], NOW)).toBe(base);
    const next = addPatternEntries(base, [ped('C'), ped('B', 'structured')], NOW);
    expect(next.patterns.map((p) => `${p.typeId}:${p.name}`)).toEqual(['mcq:A', 'mcq:B', 'structured:A', 'mcq:C', 'structured:B']);
    expect(next.patterns[3].createdAt).toBe(NOW);
  });

  it('renames in place, merges onto an existing name, and removes', () => {
    expect(renamePatternEntry(base, ped('A'), 'A2', NOW).patterns.map((p) => p.name)).toEqual(['A2', 'B', 'A']);
    // Case-only rename is a rename, not a merge.
    expect(renamePatternEntry(base, ped('A'), 'a', NOW).patterns.map((p) => p.name)).toEqual(['a', 'B', 'A']);
    // Onto B: a merge drops A (MCQ only; the LQ "A" stays).
    expect(renamePatternEntry(base, ped('A'), 'b', NOW).patterns.map((p) => `${p.typeId}:${p.name}`)).toEqual(['mcq:B', 'structured:A']);
    // A name only found on questions: the new name is registered.
    expect(renamePatternEntry(base, ped('Z'), 'Y', NOW).patterns.at(-1)).toMatchObject(ped('Y'));
    expect(removePatternEntry(base, ped('b')).patterns.map((p) => p.name)).toEqual(['A', 'A']);
    expect(removePatternEntry(base, ped('nope'))).toBe(base);
  });
});

describe('where it lives', () => {
  it('reads, changes and writes through one localStorage key; empty removes the key', async () => {
    const storage = fakeLocalStorage();
    const file = localPatternFile(() => storage);
    await updatePatternRegistry(file, (state) => addPatternEntries(state, [ped('A')], NOW));
    expect(JSON.parse(storage.getItem(PATTERNS_KEY)!)).toMatchObject({ format: 1, patterns: [ped('A')] });
    // Another tab added B in between: an update starts from what is stored now.
    storage.setItem(PATTERNS_KEY, JSON.stringify({ format: 1, patterns: [ped('A'), ped('B')] }));
    const next = await updatePatternRegistry(file, (state) => addPatternEntries(state, [ped('C')], NOW));
    expect(next.patterns.map((p) => p.name)).toEqual(['A', 'B', 'C']);
    await updatePatternRegistry(file, () => ({ patterns: [] }));
    expect(storage.getItem(PATTERNS_KEY)).toBeNull();
  });

  it('a file that throws reads as empty', async () => {
    const broken: PatternFile = {
      read: () => Promise.reject(new Error('disk')),
      write: () => Promise.reject(new Error('disk')),
    };
    expect((await readPatternRegistry(broken)).patterns).toEqual([]);
  });

  it('Clear saved documents takes the registry with it (web)', async () => {
    const storage = fakeLocalStorage();
    vi.stubGlobal('window', { localStorage: storage });
    storage.setItem(PATTERNS_KEY, JSON.stringify({ format: 1, patterns: [ped('A')] }));
    storage.setItem('someone-else', 'kept');
    await new LocalStorageWorksheetStore().clear();
    expect(storage.getItem(PATTERNS_KEY)).toBeNull();
    expect(storage.getItem('someone-else')).toBe('kept');
    vi.unstubAllGlobals();
  });
});
