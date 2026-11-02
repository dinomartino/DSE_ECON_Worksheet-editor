import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { withPaperSet } from '@/model/paperSet';
import type { Worksheet } from '@/model/types';
import {
  addToSet,
  canJoinASet,
  duplicateWorksheet,
  leaveSet,
  LocalStorageWorksheetStore,
  makeSet,
  NewerDocumentError,
  renameSet,
  setGroups,
  summarize,
  summarySet,
  type WorksheetSummary,
} from '.';

const INDEX_KEY = 'econ-worksheet-index';
const PREFIX = 'econ-worksheet:';

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  const storage = {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
  return new Proxy(storage as unknown as Storage, {
    ownKeys: () => [...map.keys()],
    getOwnPropertyDescriptor: (_t, p) =>
      map.has(String(p)) ? { configurable: true, enumerable: true, value: map.get(String(p)) } : undefined,
    get: (target, p) => (p in target ? (target as never)[p] : (map.get(String(p)) as never)),
  });
}

let storage: Storage;
beforeEach(() => {
  storage = fakeStorage();
  vi.stubGlobal('window', { localStorage: storage });
});
const store = () => new LocalStorageWorksheetStore();

const at = (minute: number) => `2026-11-02T08:${String(minute).padStart(2, '0')}:00.000Z`;
const paper = (id: string, type: 'paper1' | 'lqMock' | 'classroom', name: string, minute = 0): Worksheet => ({
  ...createWorksheetFrom({ documentType: type, name }),
  id,
  updatedAt: at(minute),
});

describe('the index row of a paper in a set', () => {
  it('records the set and the exam paper; a classroom worksheet records neither', () => {
    const p1 = summarize(withPaperSet(paper('p1', 'paper1', 'Mock P1'), { id: 'set-1', name: 'Mock' }));
    expect(p1).toMatchObject({ set: { id: 'set-1', name: 'Mock' }, paper: 'paper1', indexRev: 3 });
    expect(summarize(paper('p2', 'lqMock', 'Mock P2'))).toMatchObject({ paper: 'paper2' });
    const sheet = summarize(paper('w', 'classroom', 'Unit 3'));
    expect(sheet).not.toHaveProperty('set');
    expect(sheet).not.toHaveProperty('paper');
  });

  it('a member whose row an older build rewrote (revision 2, no set) is listed in its set again', async () => {
    const member = withPaperSet(paper('p1', 'paper1', 'Mock P1'), { id: 'set-1', name: 'Mock' });
    storage.setItem(PREFIX + 'p1', JSON.stringify(member));
    // What 0.8.7 writes for it: kind recorded, nothing about sets.
    const old = { id: 'p1', title: 'Mock P1', updatedAt: member.updatedAt, questionCount: 0, hasCover: true, indexRev: 2 };
    storage.setItem(INDEX_KEY, JSON.stringify([old, { id: 'broken' }]));
    const [row] = await store().list();
    expect(summarySet(row)).toEqual({ id: 'set-1', name: 'Mock' });
    expect(row.paper).toBe('paper1');
    // Written back, with the damaged row left as it was.
    expect(JSON.parse(storage.getItem(INDEX_KEY)!)).toEqual([{ ...old, set: { id: 'set-1', name: 'Mock' }, paper: 'paper1', indexRev: 3 }, { id: 'broken' }]);
  });

  it('a malformed set on a row is no set, and the row still lists', () => {
    const base: WorksheetSummary = { id: 'x', title: 'X', updatedAt: at(0) };
    for (const set of [null, 'set-1', { id: '' }, { name: 'Mock' }]) {
      expect(summarySet({ ...base, set } as unknown as WorksheetSummary)).toBeUndefined();
    }
    expect(canJoinASet({ ...base, paper: 'paper1' })).toBe(true);
    expect(canJoinASet({ ...base, paper: 'paper1', set: { id: 's', name: 'S' } })).toBe(false);
    expect(canJoinASet({ ...base, paper: 'later-kind' })).toBe(false);
    expect(canJoinASet({ ...base, paper: 'paper2', kind: 'bank' })).toBe(false);
    expect(canJoinASet(base)).toBe(false);
  });
});

describe('set groups', () => {
  const row = (id: string, title: string, paper: string | undefined, set: { id: string; name: string } | undefined, minute: number): WorksheetSummary => ({
    id,
    title,
    updatedAt: at(minute),
    ...(paper ? { paper } : {}),
    ...(set ? { set } : {}),
  });

  it('orders Paper 1 before Paper 2, and the newest member names the set', () => {
    const groups = setGroups([
      row('b', 'Mock P2', 'paper2', { id: 's', name: 'Mock 2026' }, 5),
      row('free', 'Unit 3', undefined, undefined, 4),
      row('a', 'Mock P1', 'paper1', { id: 's', name: 'Mock 2026-27' }, 9),
    ]);
    expect([...groups.keys()]).toEqual(['s']);
    expect(groups.get('s')!.name).toBe('Mock 2026-27');
    expect(groups.get('s')!.members.map((m) => m.id)).toEqual(['a', 'b']);
  });
});

describe('changing sets', () => {
  beforeEach(async () => {
    await store().save(paper('p1', 'paper1', 'S6 Mock Paper 1'));
    await store().save(paper('p2', 'lqMock', 'S6 Mock Paper 2'));
    await store().save(paper('p3', 'paper1', 'S5 Final Paper 1'));
  });
  const setOf = async (id: string) => summarySet((await store().list()).find((row) => row.id === id)!);

  it('makes a set of two papers, adds a third, renames it on each, and ungroups it', async () => {
    expect(await makeSet(store(), ['p1', 'p2'], 'S6 Mock', 'set-1')).toEqual({ failed: [] });
    expect(await setOf('p1')).toEqual({ id: 'set-1', name: 'S6 Mock' });
    expect(await setOf('p2')).toEqual({ id: 'set-1', name: 'S6 Mock' });
    expect(await setOf('p3')).toBeUndefined();

    await addToSet(store(), 'p3', { id: 'set-1', name: 'S6 Mock' });
    const group = setGroups(await store().list()).get('set-1')!;
    expect(group.members.map((m) => m.id).sort()).toEqual(['p1', 'p2', 'p3']);

    await renameSet(store(), group, 'S6 Mock 2026-27');
    for (const id of ['p1', 'p2', 'p3']) expect((await setOf(id))?.name).toBe('S6 Mock 2026-27');
    // The documents carry it, not just the index.
    expect((await store().load('p2'))!.paperSet).toEqual({ id: 'set-1', name: 'S6 Mock 2026-27' });

    await leaveSet(store(), ['p3']);
    expect(await setOf('p3')).toBeUndefined();
    await leaveSet(store(), ['p1', 'p2']);
    expect(setGroups(await store().list()).size).toBe(0);
    expect((await store().load('p1'))!).not.toHaveProperty('paperSet');
  });

  it('stamps each change, so sync carries it', async () => {
    const before = (await store().load('p1'))!.updatedAt;
    await makeSet(store(), ['p1'], 'Mock', 'set-1');
    expect((await store().load('p1'))!.updatedAt > before).toBe(true);
  });

  it('names the papers it could not write, and still writes the others', async () => {
    const newer = { ...JSON.parse(storage.getItem(PREFIX + 'p2')!), schemaVersion: 99 };
    storage.setItem(PREFIX + 'p2', JSON.stringify(newer));
    const result = await makeSet(store(), ['p1', 'p2', 'gone'], 'Mock', 'set-1');
    expect(result.failed).toEqual(['p2', 'gone']);
    expect(await setOf('p1')).toEqual({ id: 'set-1', name: 'Mock' });
    // A newer build's paper is never rewritten.
    expect(JSON.parse(storage.getItem(PREFIX + 'p2')!)).toEqual(newer);
    await expect(store().save({ ...(await store().load('p2'))!, name: 'x' })).rejects.toBeInstanceOf(NewerDocumentError);
  });
});

describe('a duplicated paper leaves its set', () => {
  it('the copy is in no set; the original keeps it', () => {
    const original = withPaperSet(paper('p1', 'paper1', 'S6 Mock Paper 1'), { id: 'set-1', name: 'Mock' });
    const copy = duplicateWorksheet(original, 'copy');
    expect(copy).not.toHaveProperty('paperSet');
    expect(original.paperSet).toEqual({ id: 'set-1', name: 'Mock' });
    expect(summarySet(summarize(copy))).toBeUndefined();
  });

  it('names the copy in the interface language; the printed title keeps its own side', () => {
    const original = paper('p1', 'paper1', 'S6 Mock Paper 1');
    expect(duplicateWorksheet(original, 'c', 'en').name).toBe('S6 Mock Paper 1 (copy)');
    expect(duplicateWorksheet(original, 'c', 'zh-HK').name).toBe('S6 Mock Paper 1（副本）');
    const english = { ...original, name: undefined, title: { en: [{ text: 'Mock' }], zh: [{ text: '模擬試' }] } };
    const enCopy = duplicateWorksheet(english, 'c', 'zh-HK');
    expect(enCopy.title).toEqual({ en: [{ text: 'Mock (copy)' }], zh: [{ text: '模擬試' }] });
    const chinese = { ...original, name: undefined, title: { en: [], zh: [{ text: '模擬試' }] } };
    expect(duplicateWorksheet(chinese, 'c', 'zh-HK').title).toEqual({ en: [], zh: [{ text: '模擬試（副本）' }] });
  });
});
