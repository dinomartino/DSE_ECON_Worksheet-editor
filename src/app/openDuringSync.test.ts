import { afterEach, describe, expect, it } from 'vitest';
import type { Worksheet } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { MemoryCloud } from '@/sync/memorySource';
import { openEditorGuard } from '@/sync/openEditor';
import { setSyncPause, whileSyncPaused } from '@/sync/syncPause';
import { computer, edit, paper, settle, titles } from '@/sync/testKit';
import { openDocument } from './EditorHost';

/**
 * Opening a document while sync downloads a newer version of it (review 2026-10-08): the
 * open read the old version, the download landed, then the open saved the old one back
 * and the next run uploaded it over the newer one. The read and the writes now run with
 * sync held, and the editor counts as open before the swap.
 */

const initial = useWorksheetStore.getState();
afterEach(() => {
  useWorksheetStore.setState(initial, true);
  setSyncPause(undefined);
});

const printed = (worksheet: Worksheet) => worksheet.title.en.map((run) => run.text).join('');

async function downloading() {
  const cloud = new MemoryCloud();
  const a = computer(cloud, 'A');
  const b = computer(cloud, 'B');
  const doc = paper('One');
  await a.store.save(doc);
  await settle(cloud, a, b);
  await edit(a, doc.id, 'Two');
  await a.sync();
  // B's editor, as the app wires it: the guard hears B's store and reads `open`.
  let open = false;
  const guard = openEditorGuard(() => open);
  b.feed.subscribe(guard.onStoreChange);
  // A run is in flight on B (it will download "Two"); the scheduler's suspend waits it out.
  const run = b.sync();
  setSyncPause(() => ({ suspend: async (work) => (await run, work()) }));
  const markOpen = () => {
    open = true;
  };
  return { cloud, a, b, doc, run, markOpen };
}

describe('opening a document while sync downloads it', () => {
  it('from the start screen: opens the downloaded version and never saves the old one back', async () => {
    const { cloud, a, b, doc, markOpen } = await downloading();
    await whileSyncPaused(async () => {
      const loaded = (await b.store.load(doc.id))!;
      await openDocument(loaded, false, markOpen, b.store);
    });
    expect(printed(useWorksheetStore.getState().worksheet)).toBe('Two');
    await settle(cloud, a, b);
    expect(await titles(a)).toEqual({ live: ['Two'], trash: [] });
    expect(await titles(b)).toEqual({ live: ['Two'], trash: [] });
  });

  it('opened from elsewhere with the old version: the download is taken in, not saved over', async () => {
    const { cloud, a, b, doc, markOpen } = await downloading();
    const old = (await b.store.load(doc.id))!;
    await openDocument(old, false, markOpen, b.store);
    expect(printed(useWorksheetStore.getState().worksheet)).toBe('Two');
    await settle(cloud, a, b);
    expect(await titles(a)).toEqual({ live: ['Two'], trash: [] });
  });

  it('a stored document reopened is not written again; a new one is', async () => {
    const { b, doc, run, markOpen } = await downloading();
    await run;
    b.feed.events.length = 0;
    await openDocument((await b.store.load(doc.id))!, false, markOpen, b.store);
    expect(b.feed.events).toEqual([]);
    const fresh = paper('New');
    await openDocument(fresh, true, markOpen, b.store);
    expect(b.feed.events).toEqual([{ docId: fresh.id, kind: 'saved' }]);
  });
});
