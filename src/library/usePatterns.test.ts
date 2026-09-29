import { describe, expect, it } from 'vitest';
import { addPatternEntries, removePatternEntry, type PatternFile } from '@/storage/patterns';
import { createPatternStore } from './usePatterns';

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
});
