import { describe, expect, it } from 'vitest';
import { addPatternEntries, removePatternEntry, type PatternFile } from '@/storage/patterns';
import { createPatternStore, isReadOnlyRegistry } from './usePatterns';

const entry = (name: string) => ({ topic: 'C.ped', typeId: 't', name });

function memoryFile(initial?: string) {
  let text = initial;
  let broken = false;
  const file: PatternFile = {
    read: async () => text,
    write: async (next) => {
      if (broken) throw new Error('blocked');
      text = next;
    },
  };
  return { file, text: () => text, set: (next: string) => (text = next), break: () => (broken = true) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the 題型 registry store', () => {
  it('reads on the first reader, writes each change, and re-reads on request', async () => {
    const disk = memoryFile(JSON.stringify({ format: 1, patterns: [entry('A')] }));
    const store = createPatternStore(disk.file);
    let calls = 0;
    const off = store.subscribe(() => (calls += 1));
    await flush();
    expect(store.getSnapshot().patterns.map((p) => p.name)).toEqual(['A']);

    await store.update((state) => addPatternEntries(state, [entry('B')]));
    expect(JSON.parse(disk.text()!).patterns.map((p: { name: string }) => p.name)).toEqual(['A', 'B']);

    disk.set(JSON.stringify({ format: 1, patterns: [entry('C')] }));
    await store.reload();
    expect(store.getSnapshot().patterns.map((p) => p.name)).toEqual(['C']);
    const seen = calls;
    await store.reload(); // unchanged: no notification
    expect(calls).toBe(seen);
    off();
  });

  it('keeps a change for the visit when storage refuses it', async () => {
    const disk = memoryFile();
    const store = createPatternStore(disk.file);
    disk.break();
    await store.update((state) => addPatternEntries(state, [entry('A')]));
    expect(store.getSnapshot().patterns.map((p) => p.name)).toEqual(['A']);
    await store.update((state) => removePatternEntry(state, entry('A')));
    expect(store.getSnapshot().patterns).toEqual([]);
  });

  it('reads a newer-format registry as read-only, keeps it so after a change, never writes it', async () => {
    const stored = JSON.stringify({ format: 99, patterns: [entry('A')], later: true });
    const disk = memoryFile(stored);
    const store = createPatternStore(disk.file);
    await store.reload();
    expect(isReadOnlyRegistry(store.getSnapshot())).toBe(true);
    await store.update((state) => addPatternEntries(state, [entry('B')]));
    // Kept for the visit (the screens say it is not saved), the stored file untouched.
    expect(store.getSnapshot().patterns.map((p) => p.name)).toContain('B');
    expect(isReadOnlyRegistry(store.getSnapshot())).toBe(true);
    expect(disk.text()).toBe(stored);
    expect(isReadOnlyRegistry({ patterns: [] })).toBe(false);
  });
});
