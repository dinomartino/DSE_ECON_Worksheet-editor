import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import { resolveMessages } from '@/i18n/catalogue';
import type { ContentBlock } from '@/model/types';
import { EXAMPLE, okOutcome, studioDraft } from '@/questionStudio/fixtures';
import { EMPTY_CORPUS } from '@/questionStudio/nearCopy';
import type { StudioEnv } from '@/questionStudio/session';
import type { SourceQuestion, StudioRequest } from '@/questionStudio/types';
import { STUDIO_CHAT_MESSAGES } from './chat.messages';
import {
  createMemoryPictureStore,
  pictureId,
  PICTURE_TOKEN,
  putPicturesBack,
  takePictures,
  tokenIds,
  type PictureStore,
} from './chatPictures';
import { CHATS_KEY, KNOWN_FOR_MS, localChatStorage, PAPER_CHATS_KEY, PRUNE_GRACE_MS, readChat } from './chatStorage';
import { createChatStore } from './chatStore';
import { saveProblemText } from './ChatSaveNotice';
import type { Chat, ChatDraft } from './chatTypes';
import type { StudioEngine } from './engine';
import { computerPick } from './engine';

/** A picture as the bank gives one: `length` characters of base64 PNG, its bytes from `seed`. */
function picture(seed: number, length = 120_000): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let body = '';
  let x = (seed * 2654435761) >>> 0;
  for (let i = 0; i < length; i += 1) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    body += alphabet[x >>> 26];
  }
  return `data:image/png;base64,${body}`;
}

const image = (src: string, srcZh?: string): ContentBlock => ({ kind: 'image', id: `img-${src.length}-${src.charCodeAt(40)}`, src, ...(srcZh ? { srcZh } : {}), widthPx: 300, heightPx: 200 } as ContentBlock);

/** A reference question with its diagrams kept as blocks (what `source.ts` makes from the bank). */
const withPictures = (id: string, ...srcs: string[]): SourceQuestion => ({
  ...EXAMPLE,
  id,
  label: id,
  hasFigure: true,
  figureBlocks: srcs.map((s) => image(s)),
  figurePlaces: srcs.map(() => 'stem'),
  // The pictures as last sent: never saved (read again from the blocks).
  figures: srcs.map((s) => ({ dataUrl: s })) as never,
});

/** A saved chat: a reference with pictures, one request on it and its draft (the request holds the reference again). */
function chatWith(id: string, source: SourceQuestion, at = '2026-11-25T10:00:00.000Z'): Chat {
  const request: StudioRequest = { keyPoint: 'C.ped', points: [], examples: [source], count: 1, level: 'same', shape: 'any', sides: ['en'], note: '' } as StudioRequest;
  const draft: ChatDraft = { id: `${id}-d1`, no: 1, turnId: `${id}-a`, state: 'open', entry: { draft: studioDraft(`${id}-s1`), request } as ChatDraft['entry'], older: [] };
  return {
    v: 1,
    id,
    createdAt: at,
    updatedAt: at,
    refs: [{ source, who: 'you', keyPoint: 'C.ped' }],
    turns: [
      { id: `${id}-u`, role: 'user', text: 'one like this', refs: [source.label] },
      { id: `${id}-a`, role: 'ai', steps: [], notes: [], draftIds: [`${id}-d1`] },
    ],
    drafts: [draft],
    picks: [],
    settings: { count: 1, level: 'same', language: 'en' },
    lastText: '',
  };
}

/** localStorage with the browser's limit: 5 Mi UTF-16 code units for keys and values together. */
function limitedStorage(limit = 5 * 1024 * 1024) {
  const data = new Map<string, string>();
  const used = () => [...data].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    data,
    used,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      const after = used() - (data.has(k) ? k.length + data.get(k)!.length : 0) + k.length + v.length;
      if (after > limit) throw Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError', code: 22 });
      data.set(k, v);
    },
  };
}

/** Worksheets already in storage (the teacher's documents fill most of it). */
const fillWithDocuments = (store: ReturnType<typeof limitedStorage>, units: number) => store.setItem('econ-worksheet:doc1', 'x'.repeat(units));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
/** A chat as the k-0545 build saved it: pictures inline in the blocks, `figures` left out. */
const oldFormat = (chat: Chat): Chat => {
  const bare = (q: SourceQuestion): SourceQuestion => {
    const rest = { ...q };
    delete rest.figures;
    return rest;
  };
  return readChat(JSON.parse(JSON.stringify({ ...chat, refs: chat.refs.map((r) => ({ ...r, source: bare(r.source) })), drafts: chat.drafts.map((d) => ({ ...d, entry: { ...d.entry, request: { ...d.entry.request, examples: d.entry.request.examples.map(bare) } } })) })))!;
};

const saved = (store: { getItem(k: string): string | null }, key = CHATS_KEY) => JSON.parse(store.getItem(key) ?? '[]') as unknown[];

describe('chat pictures, kept outside localStorage (k-0551)', () => {
  it('swaps each picture for a short token and back, one id per picture however often it appears', () => {
    const a = picture(1);
    const b = picture(2);
    const value = { refs: [{ src: a }, { src: b }], again: [a], small: 'data:image/png;base64,AAAA', text: 'a word' };
    const { value: lean, pictures } = takePictures(value);
    expect(pictures.size).toBe(2);
    expect(JSON.stringify(lean)).not.toContain(a.slice(0, 60));
    expect(lean.refs[0].src).toBe(`${PICTURE_TOKEN}${pictureId(a)}`);
    expect(lean.again[0]).toBe(lean.refs[0].src);
    // Small pictures and words stay; nothing without a picture is copied.
    expect(lean.small).toBe(value.small);
    expect(lean.text).toBe('a word');
    expect([...tokenIds(lean)].sort()).toEqual([pictureId(a), pictureId(b)].sort());
    expect(putPicturesBack(lean, pictures)).toEqual(value);
    const plain = { a: 1, b: ['x'] };
    expect(takePictures(plain).value).toBe(plain);
    // A token whose picture is gone stays a token (words only), never a crash.
    expect(putPicturesBack(lean, new Map([[pictureId(a), a]])).refs[1].src).toBe(lean.refs[1].src);
  });

  it('a different picture gets a different id', () => {
    const ids = new Set(Array.from({ length: 200 }, (_, i) => pictureId(picture(i, 2000))));
    expect(ids.size).toBe(200);
  });

  it('a saved chat holds only tokens; the picture is kept once and read back whole', async () => {
    const store = limitedStorage();
    const pictures = createMemoryPictureStore();
    const storage = localChatStorage(store, CHATS_KEY, pictures);
    const pic = picture(7);
    const chat = chatWith('c1', withPictures('BANK/q1', pic));

    await storage.save([chat]);
    const raw = store.getItem(CHATS_KEY)!;
    expect(raw).not.toContain('data:image');
    expect(raw.length).toBeLessThan(20_000);
    // In the reference and again in the draft's request: one row.
    expect(pictures.rows.size).toBe(1);

    const again = localChatStorage(store, CHATS_KEY, pictures);
    const loaded = again.load();
    const found = await again.restore!(loaded);
    const back = putPicturesBack(loaded[0], found);
    const blocks = back.refs[0].source.figureBlocks as unknown as Array<{ src: string }>;
    expect(blocks[0].src).toBe(pic);
    expect((back.drafts[0].entry.request.examples[0].figureBlocks as unknown as Array<{ src: string }>)[0].src).toBe(pic);
    // The pictures as sent were never saved (they are read again from the blocks).
    expect(back.refs[0].source.figures).toBeUndefined();
  });

  it('chats saved before k-0551 are moved over on first load, every chat and picture kept', async () => {
    const store = limitedStorage();
    const pictures = createMemoryPictureStore();
    const old = [chatWith('c1', withPictures('BANK/q1', picture(1), picture(2)), '2026-11-25T10:00:00.000Z'), chatWith('c2', withPictures('BANK/q2', picture(1)), '2026-11-24T10:00:00.000Z')];
    // As the k-0545 build wrote them: pictures inline, `figures` already left out.
    const inline = old.map(oldFormat);
    store.setItem(CHATS_KEY, JSON.stringify(inline));
    const before = store.getItem(CHATS_KEY)!.length;

    const storage = localChatStorage(store, CHATS_KEY, pictures);
    const loaded = storage.load();
    await storage.restore!(loaded);
    const raw = store.getItem(CHATS_KEY)!;
    expect(raw).not.toContain('data:image');
    expect(raw.length).toBeLessThan(before / 10);
    expect(pictures.rows.size).toBe(2);
    const now = localChatStorage(store, CHATS_KEY, pictures);
    const reread = now.load();
    const found = await now.restore!(reread);
    expect(reread.map((c) => putPicturesBack(c, found))).toEqual(inline);
  });

  it('when the pictures cannot be kept, the old saved list is left exactly as it was', async () => {
    const store = limitedStorage();
    const broken: PictureStore = { ...createMemoryPictureStore(), putAll: async () => false, getAll: async () => undefined };
    const inline = [chatWith('c1', withPictures('BANK/q1', picture(1)))].map((c) => readChat(JSON.parse(JSON.stringify(c)))!);
    const raw = JSON.stringify(inline);
    store.setItem(CHATS_KEY, raw);
    const storage = localChatStorage(store, CHATS_KEY, broken);
    const loaded = storage.load();
    await storage.restore!(loaded);
    expect(store.getItem(CHATS_KEY)).toBe(raw);
    expect(storage.load()[0].refs[0].source.figureBlocks).toHaveLength(1);
  });

  it('many chats with pictures near the storage limit: every chat saved, the worksheets keep their room', async () => {
    const store = limitedStorage();
    // 4 MB of worksheets: about 1 MB left of the 5.
    fillWithDocuments(store, 4 * 1024 * 1024);
    const pictures = createMemoryPictureStore();
    const storage = localChatStorage(store, CHATS_KEY, pictures);
    // 30 chats (the most kept), each with three diagrams of its own: 10.8 MB of pictures.
    const chats = Array.from({ length: 30 }, (_, i) =>
      chatWith(`c${i}`, withPictures(`BANK/q${i}`, picture(i * 3 + 1), picture(i * 3 + 2), picture(i * 3 + 3)), `2026-11-25T10:${String(i).padStart(2, '0')}:00.000Z`),
    );
    const report = await storage.save(chats);
    expect(report).toEqual({ left: 0, of: 30 });
    expect(saved(store)).toHaveLength(30);
    expect(store.getItem(CHATS_KEY)!.length).toBeLessThan(400_000);
    expect(pictures.rows.size).toBe(90);

    // The same chats the old way (pictures inline): most of them were silently dropped.
    const inlineStore = limitedStorage();
    fillWithDocuments(inlineStore, 4 * 1024 * 1024);
    const noPictures: PictureStore = { ...createMemoryPictureStore(), putAll: async () => false };
    const inlineReport = await localChatStorage(inlineStore, CHATS_KEY, noPictures).save(chats);
    expect(inlineReport).toMatchObject({ problem: 'full', of: 30 });
    expect((inlineReport as { left: number }).left).toBeGreaterThan(20);
  });

  it('a save that still does not fit says so: some chats left, or none written', async () => {
    const store = limitedStorage(400_000);
    const pictures = createMemoryPictureStore();
    const storage = localChatStorage(store, CHATS_KEY, pictures);
    const long = (i: number): Chat => ({ ...chatWith(`c${i}`, withPictures(`BANK/q${i}`, picture(i + 1))), updatedAt: `2026-11-25T10:${String(i).padStart(2, '0')}:00.000Z`, lastText: 'w'.repeat(30_000) });
    const chats = Array.from({ length: 20 }, (_, i) => long(i));
    const report = await storage.save(chats);
    expect(report).toMatchObject({ problem: 'full', of: 20 });
    const left = (report as { left: number }).left;
    expect(left).toBeGreaterThan(0);
    // The newest are the ones kept.
    expect((saved(store) as Chat[]).map((c) => c.id)[0]).toBe('c19');
    expect(saved(store)).toHaveLength(20 - left);

    store.data.delete(CHATS_KEY);
    fillWithDocuments(store, 399_000);
    expect(await storage.save(chats.slice(0, 1))).toMatchObject({ problem: 'full', left: 1, of: 1 });

    const failing = { getItem: () => null, setItem: () => { throw new Error('SecurityError'); } };
    expect(await localChatStorage(failing, CHATS_KEY, pictures).save([chatWith('x', EXAMPLE)])).toMatchObject({ problem: 'error', left: 1 });
  });

  it('a save waiting on its pictures never overwrites a newer one', async () => {
    const store = limitedStorage();
    let release!: () => void;
    const slow: PictureStore = {
      ...createMemoryPictureStore(),
      putAll: () => new Promise<boolean>((resolve) => (release = () => resolve(true))),
    };
    const storage = localChatStorage(store, CHATS_KEY, slow);
    const older = storage.save([chatWith('c1', withPictures('BANK/q1', picture(1)))]);
    const newer = storage.save([chatWith('c2', EXAMPLE)]);
    expect(newer).toEqual({ left: 0, of: 1 });
    release();
    expect(await older).toBeUndefined();
    expect((saved(store) as Chat[]).map((c) => c.id)).toEqual(['c2']);
  });

  it('pictures no chat names any more are tidied; one another list or a newer save uses is kept', async () => {
    let clock = 1_000_000;
    const now = () => clock;
    const store = limitedStorage();
    const pictures = createMemoryPictureStore(now);
    const studio = localChatStorage(store, CHATS_KEY, pictures, now);
    const panel = localChatStorage(store, PAPER_CHATS_KEY, pictures, now);
    const shared = picture(1);
    const a = chatWith('a', withPictures('BANK/a', shared, picture(2)));
    const b = chatWith('b', withPictures('BANK/b', picture(3)));
    await studio.save([a, b]);
    await panel.save([chatWith('p', withPictures('BANK/p', shared))]);
    expect(pictures.rows.size).toBe(3);

    // Chat a deleted: its own picture goes once it is past the grace; the shared one stays.
    clock += PRUNE_GRACE_MS + 1;
    await studio.save([b]);
    await settle();
    expect([...pictures.rows.keys()].sort()).toEqual([pictureId(shared), pictureId(picture(3))].sort());

    // A picture written just now (another window may be about to name it) is left alone.
    clock += PRUNE_GRACE_MS + 1;
    await pictures.putAll(new Map([['fresh-1', picture(9)]]));
    await studio.save([chatWith('c', EXAMPLE)]);
    await settle();
    expect(pictures.rows.has('fresh-1')).toBe(true);
    expect(pictures.rows.has(pictureId(picture(3)))).toBe(false);

    // The next start tidies the rest.
    clock += PRUNE_GRACE_MS + 1;
    const next = localChatStorage(store, CHATS_KEY, pictures, now);
    await next.restore!(next.load());
    expect([...pictures.rows.keys()]).toEqual([pictureId(shared)]);
  });

  it('a picture tidied by another window is written again by the next save that names it', async () => {
    let clock = 0;
    const now = () => clock;
    const store = limitedStorage();
    const pictures = createMemoryPictureStore(now);
    const storage = localChatStorage(store, CHATS_KEY, pictures, now);
    const chat = chatWith('c', withPictures('BANK/q', picture(5)));
    await storage.save([chat]);
    pictures.rows.clear();
    clock += KNOWN_FOR_MS + 1;
    await storage.save([{ ...chat, updatedAt: '2026-11-25T11:00:00.000Z' }]);
    expect(pictures.rows.size).toBe(1);
  });
});

describe('the chat store with kept pictures (k-0551)', () => {
  const preset = presetFor('gemini');
  const engineFor = (seen: StudioRequest[]): StudioEngine => ({
    pick: async (input) => computerPick(input),
    write: async (request) => {
      seen.push(request);
      return okOutcome([studioDraft('w1')]);
    },
    refine: async () => okOutcome([studioDraft('r1')]),
  });
  const env = (figures: SourceQuestion[][]): StudioEnv => ({
    resolve: async () => ({ ok: true, deps: { client: {} as never, preset, glossary: null, corpus: EMPTY_CORPUS }, compared: { past: 10, mine: 0 } }),
    references: async () => [],
    figures: async (examples) => {
      figures.push([...examples]);
      return [...examples];
    },
  });

  it('reads the pictures back after a reload, and a run sends them, not the tokens', async () => {
    const store = limitedStorage();
    const pictures = createMemoryPictureStore();
    const pic = picture(11);
    await localChatStorage(store, CHATS_KEY, pictures).save([chatWith('c1', withPictures('BANK/q1', pic))]);
    expect(store.getItem(CHATS_KEY)).not.toContain('data:image');

    const seen: StudioRequest[] = [];
    const read: SourceQuestion[][] = [];
    const useChat = createChatStore({ env: env(read), engine: engineFor(seen), storage: localChatStorage(store, CHATS_KEY, pictures), language: () => 'en' });
    useChat.getState().openChat('c1');
    await useChat.getState().send('one more like this', undefined, { asNew: true });
    const blocks = read[0][0].figureBlocks as unknown as Array<{ src: string }>;
    expect(blocks[0].src).toBe(pic);
    const shown = useChat.getState().chats.find((c) => c.id === 'c1')!;
    expect((shown.refs[0].source.figureBlocks as unknown as Array<{ src: string }>)[0].src).toBe(pic);
    expect(store.getItem(CHATS_KEY)).not.toContain('data:image');
    expect(useChat.getState().saveProblem).toBeUndefined();
  });

  it('a save that fails raises the problem once; closed stays closed; a good save clears it', async () => {
    const store = limitedStorage(60_000);
    const pictures = createMemoryPictureStore();
    const useChat = createChatStore({ env: env([]), engine: engineFor([]), storage: localChatStorage(store, CHATS_KEY, pictures), language: () => 'en' });
    await settle();
    fillWithDocuments(store, 59_000);
    await useChat.getState().send('3 MC on price elasticity of demand');
    await settle();
    expect(useChat.getState().saveProblem).toMatchObject({ problem: 'full', left: 1, of: 1 });
    useChat.getState().dismissSaveProblem();
    useChat.getState().setSettings({ level: 'harder' });
    await settle();
    expect(useChat.getState().saveProblem?.seen).toBe(true);

    // Room made (a worksheet deleted): the next save keeps everything, the problem is gone.
    store.data.delete('econ-worksheet:doc1');
    useChat.getState().setSettings({ level: 'easier' });
    await settle();
    expect(useChat.getState().saveProblem).toBeUndefined();
    expect(saved(store)).toHaveLength(1);
  });

  it('tells it in English and 中文', () => {
    for (const lang of ['en', 'zh-HK'] as const) {
      const m = resolveMessages(STUDIO_CHAT_MESSAGES, lang);
      const some = saveProblemText(m, { problem: 'full', left: 3, of: 30 });
      const none = saveProblemText(m, { problem: 'full', left: 1, of: 1 });
      const error = saveProblemText(m, { problem: 'error', left: 0, of: 0 });
      expect(new Set([some, none, error]).size).toBe(3);
      if (lang === 'zh-HK') {
        expect(some).toContain('儲存空間已滿');
        expect(some).toContain('3');
        expect(error).toContain('未能儲存');
      } else {
        expect(some).toContain('the oldest 3 chats of your 30');
        expect(none).toContain('were not saved');
      }
    }
  });
});
