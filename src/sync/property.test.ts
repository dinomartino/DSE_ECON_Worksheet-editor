import { describe, expect, it } from 'vitest';
import type { Worksheet } from '@/model/types';
import { contentOf } from './content';
import { folderConnect } from './folderTestKit';
import { MemoryCloud } from './memorySource';
import { computer, edit, library, memoryConnect, paper, settle, type Computer, type Connect } from './testKit';

/**
 * Random interleavings of edits, trashes, restores, syncs, deliveries and offline
 * spells on two computers. Every version that existed at a sync point must survive —
 * itself, or a later edit made from it — live, as a copy, or in Trash; the two
 * computers must end identical, with no version held twice. (Delete forever and expiry
 * are deliberate deletions and left out.) Run directly and through the folder source,
 * whose revisions are content hashes. Both computers keep a hash cache; in even seeds
 * every edit carries the same `updatedAt`, so only `forgetOnWrite` keeps it honest.
 */

const FROZEN = '2026-10-05T06:32:00.000Z';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function present(c: Computer): Promise<{ place: string; id: string; marker: string }[]> {
  return (await library(c)).map((row) => {
    const [place, id, marker] = row.split(' ');
    return { place, id, marker };
  });
}

/** Rows the hash cache would vouch for with a hash that is not the document's: a false "same". */
async function falseHits(c: Computer): Promise<string[]> {
  const wrong: string[] = [];
  const check = async (id: string, updatedAt: string, place: 'live' | 'trash', load: () => Promise<Worksheet | undefined>) => {
    const hit = c.hashCache.get(id);
    if (!hit || hit.place !== place || hit.updatedAt !== updatedAt) return;
    const worksheet = await load().catch(() => undefined);
    if (!worksheet || contentOf(worksheet).hash !== hit.hash) wrong.push(`${c.name} ${place} ${id}`);
  };
  const live = await c.store.list();
  for (const row of live) await check(row.id, row.updatedAt, 'live', () => c.store.load(row.id));
  for (const row of await c.store.listTrash()) {
    if (!live.some((l) => l.id === row.id)) await check(row.id, row.updatedAt, 'trash', () => c.store.loadTrashed(row.id));
  }
  return wrong;
}

async function scenario(seed: number, steps: number, connect: Connect) {
  const random = mulberry32(seed);
  const pick = <T,>(items: T[]): T | undefined => items[Math.floor(random() * items.length)];
  const cloud = new MemoryCloud();
  cloud.delayed = random() < 0.5;
  const computers = [computer(cloud, 'A', undefined, connect), computer(cloud, 'B', undefined, connect)];
  const parent = new Map<string, string | null>();
  const atSyncPoint = new Set<string>();
  const wrongHits: string[] = [];
  let next = 0;
  const marker = (from: string | null) => {
    next += 1;
    const name = `m${next}`;
    parent.set(name, from);
    return name;
  };

  for (let step = 0; step < steps; step += 1) {
    const c = pick(computers)!;
    const docs = (await present(c)).sort((x, y) => x.marker.localeCompare(y.marker));
    const live = docs.filter((doc) => doc.place === 'live');
    const trash = docs.filter((doc) => doc.place === 'trash');
    const roll = random();
    if (roll < 0.15) {
      await c.store.save(paper(marker(null), { id: `doc${next}` }));
    } else if (roll < 0.45 && live.length) {
      const doc = pick(live)!;
      await edit(c, doc.id, marker(doc.marker), seed % 2 === 0 ? FROZEN : undefined);
    } else if (roll < 0.52 && live.length) {
      await c.store.trash(pick(live)!.id);
    } else if (roll < 0.57 && trash.length) {
      await c.store.restore(pick(trash)!.id);
    } else if (roll < 0.65) {
      cloud.deliver();
    } else {
      for (const doc of docs) atSyncPoint.add(doc.marker);
      const offline = random() < 0.15;
      if (offline) cloud.failAfter(c.name, Math.floor(random() * 8));
      await c.sync();
      if (offline) cloud.setUnavailable(c.name, false);
    }
    for (const other of computers) wrongHits.push(...(await falseHits(other)));
  }
  for (const c of computers) for (const doc of await present(c)) atSyncPoint.add(doc.marker);
  await settle(cloud, ...computers);
  for (const c of computers) wrongHits.push(...(await falseHits(c)));
  return { computers, parent, atSyncPoint, wrongHits };
}

const descends = (parent: Map<string, string | null>, from: string, to: string) => {
  for (let at: string | null | undefined = to; at; at = parent.get(at)) if (at === from) return true;
  return false;
};

describe.each([
  ['memory', memoryConnect],
  ['folder', folderConnect],
] as [string, Connect][])('two computers, random interleavings, %s source', (_source, connect) => {
  it.each(Array.from({ length: 120 }, (_, i) => i + 1))('seed %i: nothing synced is lost, both end identical', async (seed) => {
    const { computers, parent, atSyncPoint, wrongHits } = await scenario(seed, 40, connect);
    const [a, b] = computers;
    expect(wrongHits, `the hash cache vouched for a stale hash (seed ${seed})`).toEqual([]);
    expect(await library(a)).toEqual(await library(b));
    const held = (await present(a)).map((doc) => doc.marker);
    const lost = [...atSyncPoint].filter((m) => !held.some((h) => descends(parent, m, h)));
    expect(lost, `lost versions (seed ${seed})`).toEqual([]);
    expect(new Set(held).size, `a version held twice (seed ${seed})`).toBe(held.length);
  });
});
