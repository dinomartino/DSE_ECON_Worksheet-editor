import { describe, expect, it } from 'vitest';
import type { Worksheet } from '@/model/types';
import { contentOf } from './content';
import { folderConnect } from './folderTestKit';
import { MemoryCloud } from './memorySource';
import { computer, edit, library, memoryConnect, openEditor, paper, settle, type Computer, type Connect } from './testKit';

/**
 * Random interleavings of edits, trashes, restores, syncs, deliveries and offline
 * spells on two computers. Every version that existed at a sync point must survive —
 * itself, or a later edit made from it — live, as a copy, or in Trash; the two
 * computers must end identical, with no version held twice. (Delete forever and expiry
 * are deliberate deletions and left out.) Run directly and through the folder source,
 * whose revisions are content hashes. Both computers keep a hash cache; in even seeds
 * every edit carries the same `updatedAt`, so only `forgetOnWrite` keeps it honest.
 * With editors, each computer may also hold one document open, typing into it unsaved
 * (`RunOptions.isBusy`); its edits count once saved, and leaving saves them. With outside
 * writers, a save not from the editor (an outgoing document's, a 題庫 write) lands just
 * before or after the engine writes a download, made from what was stored before the run:
 * it counts the moment it is written. `SYNC_SEEDS` raises the seed count for a long run.
 */

const SEEDS = Number(process.env.SYNC_SEEDS) || 120;

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

/**
 * During `c`'s next run: once, a save of a document the engine downloads, made from the copy
 * stored before the run, just before or just after the engine's write. Disarmed by the caller.
 */
async function armOutsideWriter(c: Computer, random: () => number, written: (from: string) => string): Promise<void> {
  const stale = new Map<string, Worksheet>();
  for (const row of await c.store.list()) {
    const worksheet = await c.store.load(row.id);
    if (worksheet && row.id !== c.editor?.worksheet.id) stale.set(row.id, worksheet);
  }
  const write = async (id: string) => {
    const from = stale.get(id);
    if (!from) return;
    c.hooks.beforeAdopt = c.hooks.afterAdopt = undefined;
    const marker = written(from.title.en.map((run) => run.text).join(''));
    await c.store.save({ ...from, title: { ...from.title, en: [{ text: marker }] }, updatedAt: new Date().toISOString() });
  };
  if (random() < 0.5) c.hooks.beforeAdopt = write;
  else c.hooks.afterAdopt = write;
}

async function scenario(seed: number, steps: number, connect: Connect, editors = false, outside = false) {
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
    // The open document is the editor's: nothing else on this computer writes it.
    const live = docs.filter((doc) => doc.place === 'live' && doc.id !== c.editor?.worksheet.id);
    const trash = docs.filter((doc) => doc.place === 'trash' && doc.id !== c.editor?.worksheet.id);
    if (editors && random() < 0.3) {
      const open = c.editor;
      const act = random();
      if (!open) {
        const doc = pick(live);
        if (doc) await openEditor(c, doc.id);
      } else if (act < 0.5) {
        const from = open.worksheet.title.en.map((run) => run.text).join('');
        open.type(marker(from), seed % 2 === 0 ? FROZEN : undefined);
      } else if (act < 0.8) {
        if (open.dirty) await open.save();
      } else {
        if (open.dirty) await open.save();
        open.close();
      }
      for (const other of computers) wrongHits.push(...(await falseHits(other)));
      continue;
    }
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
      if (outside && random() < 0.4) {
        // A teacher's save is never to be lost: it counts at once.
        await armOutsideWriter(c, random, (from) => {
          const written = marker(from);
          atSyncPoint.add(written);
          return written;
        });
      }
      await c.sync();
      c.hooks.beforeAdopt = c.hooks.afterAdopt = undefined;
      if (offline) cloud.setUnavailable(c.name, false);
    }
    for (const other of computers) wrongHits.push(...(await falseHits(other)));
  }
  for (const c of computers) {
    if (c.editor?.dirty) await c.editor.save();
    c.editor?.close();
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

const SOURCES = [
  ['memory', memoryConnect],
  ['folder', folderConnect],
] as [string, Connect][];

describe.each(SOURCES)('two computers, random interleavings, %s source', (_source, connect) => {
  it.each(Array.from({ length: SEEDS }, (_, i) => i + 1))('seed %i: nothing synced is lost, both end identical', async (seed) => {
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

describe.each(SOURCES)('two computers with open editors, %s source', (_source, connect) => {
  it.each(Array.from({ length: SEEDS }, (_, i) => i + 1))('seed %i: unsaved edits are never written under, nothing is lost', async (seed) => {
    const { computers, parent, atSyncPoint, wrongHits } = await scenario(seed, 60, connect, true);
    const [a, b] = computers;
    expect(wrongHits, `the hash cache vouched for a stale hash (seed ${seed})`).toEqual([]);
    expect(await library(a)).toEqual(await library(b));
    const held = (await present(a)).map((doc) => doc.marker);
    const lost = [...atSyncPoint].filter((m) => !held.some((h) => descends(parent, m, h)));
    expect(lost, `lost versions (seed ${seed})`).toEqual([]);
    expect(new Set(held).size, `a version held twice (seed ${seed})`).toBe(held.length);
  });
});

describe.each(SOURCES)('two computers, editors and saves not from the editor mid-run, %s source', (_source, connect) => {
  it.each(Array.from({ length: SEEDS }, (_, i) => i + 1))('seed %i: a save landing beside a download is never lost', async (seed) => {
    const { computers, parent, atSyncPoint, wrongHits } = await scenario(seed, 60, connect, true, true);
    const [a, b] = computers;
    expect(wrongHits, `the hash cache vouched for a stale hash (seed ${seed})`).toEqual([]);
    expect(await library(a)).toEqual(await library(b));
    const held = (await present(a)).map((doc) => doc.marker);
    const lost = [...atSyncPoint].filter((m) => !held.some((h) => descends(parent, m, h)));
    expect(lost, `lost versions (seed ${seed})`).toEqual([]);
    expect(new Set(held).size, `a version held twice (seed ${seed})`).toBe(held.length);
  });
});
