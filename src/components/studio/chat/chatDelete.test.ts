import { describe, expect, it } from 'vitest';
import type { StudioEnv } from '@/questionStudio/session';
import { createMemoryPictureStore } from './chatPictures';
import { CHATS_KEY, heldBack, localChatStorage, PAPER_CHATS_KEY, PRUNE_GRACE_MS, readChat } from './chatStorage';
import { createChatStore } from './chatStore';
import type { Chat } from './chatTypes';
import type { StudioEngine } from './engine';

/**
 * Deleting saved chats (k-0564, u-gnmu): the last chat deleted stays deleted after a reload,
 * deleting one of several keeps the rest, and no write ever loses what a newer build saved.
 */

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

const chat = (id: string, at: string, paper?: string): Chat =>
  readChat({
    v: 1,
    id,
    createdAt: at,
    updatedAt: at,
    refs: [],
    turns: [{ id: `${id}-u`, role: 'user', text: `asked in ${id}`, refs: [] }],
    drafts: [],
    settings: {},
    ...(paper ? { paper } : {}),
  })!;

/** A chat as a later build might save it: a shape this build cannot read. */
const newer = { v: 2, id: 'n1', title: 'from a newer build', parts: [{ kind: 'x' }] };

/** The chat screen as a page load makes it, on `store` under `key`. */
const open = (store: ReturnType<typeof memory>, key = CHATS_KEY) =>
  createChatStore({ env: {} as StudioEnv, engine: {} as StudioEngine, storage: localChatStorage(store, key, createMemoryPictureStore()), language: () => 'en' });

/** The saved chats a reload shows (the blank chat every load starts with left out). */
const shown = (store: ReturnType<typeof memory>, key = CHATS_KEY) =>
  open(store, key)
    .getState()
    .chats.filter((c) => c.turns.length > 0)
    .map((c) => c.id);

const raw = (store: ReturnType<typeof memory>, key = CHATS_KEY) => JSON.parse(store.data.get(key) ?? 'null') as unknown;

describe('deleting saved chats (k-0564)', () => {
  it('the last chat deleted stays gone after a reload', () => {
    const store = memory();
    localChatStorage(store).save([chat('a', '2026-11-26T09:00:00.000Z')]);
    expect(shown(store)).toEqual(['a']);
    const page = open(store);
    page.getState().deleteChat('a');
    expect(raw(store)).toEqual([]);
    expect(shown(store)).toEqual([]);
  });

  it('deleting one of several keeps the others, in order', () => {
    const store = memory();
    localChatStorage(store).save([chat('a', '2026-11-26T09:00:00.000Z'), chat('b', '2026-11-26T10:00:00.000Z'), chat('c', '2026-11-26T11:00:00.000Z')]);
    expect(shown(store)).toEqual(['c', 'b', 'a']);
    open(store).getState().deleteChat('b');
    expect(shown(store)).toEqual(['c', 'a']);
    const page = open(store);
    page.getState().deleteChat('c');
    page.getState().deleteChat('a');
    expect(shown(store)).toEqual([]);
  });

  it('the ✦ Write panel’s list behaves the same and never touches the studio’s', () => {
    const store = memory();
    localChatStorage(store).save([chat('s', '2026-11-26T09:00:00.000Z')]);
    localChatStorage(store, PAPER_CHATS_KEY).save([chat('p1', '2026-11-26T09:00:00.000Z', 'paper-1'), chat('p2', '2026-11-26T10:00:00.000Z', 'paper-2')]);
    const panel = open(store, PAPER_CHATS_KEY);
    panel.getState().deleteChat('p2');
    expect(shown(store, PAPER_CHATS_KEY)).toEqual(['p1']);
    panel.getState().deleteChat('p1');
    expect(shown(store, PAPER_CHATS_KEY)).toEqual([]);
    expect(raw(store, PAPER_CHATS_KEY)).toEqual([]);
    expect(shown(store)).toEqual(['s']);
  });

  it('a newer build’s chats are kept as they are, when the last chat this build reads is deleted too', () => {
    const store = memory();
    store.setItem(CHATS_KEY, JSON.stringify([JSON.parse(JSON.stringify(chat('a', '2026-11-26T09:00:00.000Z'))), newer]));
    expect(shown(store)).toEqual(['a']);
    open(store).getState().deleteChat('a');
    expect(raw(store)).toEqual([newer]);
    // An ordinary save keeps them too (before k-0564 any save dropped them).
    localChatStorage(store).save([chat('b', '2026-11-26T10:00:00.000Z')]);
    expect(raw(store)).toEqual([expect.objectContaining({ id: 'b' }), newer]);
  });

  it('reads the saved list again at each write: a newer build’s chat saved after this page loaded survives', () => {
    const store = memory();
    localChatStorage(store).save([chat('a', '2026-11-26T09:00:00.000Z')]);
    const page = open(store);
    // Another window, a newer build, saves its chat beside ours.
    store.setItem(CHATS_KEY, JSON.stringify([...(raw(store) as unknown[]), newer]));
    page.getState().deleteChat('a');
    expect(raw(store)).toEqual([newer]);
  });

  it('never writes over a saved list in a shape it does not know, and says so', () => {
    const store = memory();
    const theirs = JSON.stringify({ v: 2, chats: [newer] });
    store.setItem(CHATS_KEY, theirs);
    expect(shown(store)).toEqual([]);
    expect(localChatStorage(store).save([])).toEqual({ problem: 'error', left: 0, of: 0 });
    const page = open(store);
    page.getState().deleteChat(page.getState().activeId);
    expect(store.data.get(CHATS_KEY)).toBe(theirs);
    expect(localChatStorage(store).save([chat('a', '2026-11-26T09:00:00.000Z')])).toEqual({ problem: 'error', left: 1, of: 1 });
    expect(store.data.get(CHATS_KEY)).toBe(theirs);
  });

  it('heldBack keeps only the newer build’s chats; damaged or this build’s entries are not kept', () => {
    expect(heldBack(null)).toEqual([]);
    expect(heldBack('not json')).toEqual([]);
    expect(heldBack('"a string"')).toEqual([]);
    expect(heldBack(JSON.stringify([{ v: 1, id: 'a' }, { v: 3, id: 'z' }, null, 'x', { id: 'no v' }]))).toEqual([{ v: 3, id: 'z' }]);
    expect(heldBack(JSON.stringify({ v: 2 }))).toBe('newer');
  });

  it('two builds holding the same chat: this build’s copy is written once', () => {
    const store = memory();
    const a = chat('a', '2026-11-26T09:00:00.000Z');
    store.setItem(CHATS_KEY, JSON.stringify([{ v: 2, id: 'a' }]));
    localChatStorage(store).save([a]);
    expect((raw(store) as Array<{ id: string }>).map((c) => c.id)).toEqual(['a']);
  });

  it('a failed write when deleting the last chat is reported, not silent', () => {
    const failing = { getItem: () => '[]', setItem: () => { throw new Error('SecurityError'); } };
    expect(localChatStorage(failing, CHATS_KEY, createMemoryPictureStore()).save([])).toEqual({ problem: 'error', left: 0, of: 0 });
  });

  it('the deleted chat’s pictures are tidied once nothing names them', async () => {
    let clock = 1_000_000;
    const now = () => clock;
    const store = memory();
    const pictures = createMemoryPictureStore(now);
    const storage = localChatStorage(store, CHATS_KEY, pictures, now);
    const big = `data:image/png;base64,${'A'.repeat(20_000)}`;
    const withPicture = { ...chat('a', '2026-11-26T09:00:00.000Z'), refs: [{ who: 'you', source: { id: 'BANK/a', label: 'a', stem: { en: '', zh: '' }, options: [], figureBlocks: [{ kind: 'image', id: 'i', src: big }] } }] } as unknown as Chat;
    await storage.save([withPicture]);
    expect(pictures.rows.size).toBe(1);
    clock += PRUNE_GRACE_MS + 1;
    await storage.save([]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pictures.rows.size).toBe(0);
  });
});
