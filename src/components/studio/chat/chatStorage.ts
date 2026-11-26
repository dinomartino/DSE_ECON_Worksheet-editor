import type { LanguageMode } from '@/model/types';
import { shownDraft } from '@/questionStudio/validate';
import { conceptOf } from '@/questionStudio/concept';

const LANGUAGE_MODES: readonly LanguageMode[] = ['en', 'zh', 'bilingual'];
import { CHAT_COUNTS, type Chat, type ChatDraft, type ChatRef, type Turn } from './chatTypes';
import { hasInlinePictures, sharedPictureStore, takePictures, tokenIds, tokenIdsInText, type PictureStore } from './chatPictures';
import { numbered } from './versions';

/**
 * Saved chats (decision 4, u-2ouc): kept on this computer in localStorage, newest first, at
 * most `MAX_CHATS`. Each chat is checked on its own when read, so one damaged chat never
 * empties the list (the index rule of `AGENTS.md`), and a damaged draft inside a chat is
 * dropped without losing the rest. A reference's `figures` (the pictures as sent) are never
 * saved: they are read again from its `figureBlocks`. Those blocks' pictures are kept outside
 * localStorage since k-0551 (`chatPictures.ts`): the saved chat holds a token per picture, the
 * picture goes to IndexedDB, and a save that still fails is reported, never silent.
 *
 * Deleting (k-0564): every save writes the whole list, an empty one too, so a deleted chat stays
 * gone. A write never loses what a newer build saved under the same key: the chats it cannot
 * read because their `v` is above 1 are read from storage again at each write and written back
 * as they are (`heldBack`), and a list that is no longer an array is not written over at all.
 * A newer build keeps this key an array of chats, each with its own `v`, so both can share it.
 */

export const CHATS_KEY = 'econgen.studioChats.v1';
export const MAX_CHATS = 30;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const isBi = (x: unknown): boolean => isObj(x) && isStr(x.en) && isStr(x.zh);

function isDraft(x: unknown): x is ChatDraft {
  if (!isObj(x) || !isStr(x.id) || typeof x.no !== 'number' || !isStr(x.turnId)) return false;
  if (!['open', 'accepted', 'rejected', 'added'].includes(x.state as string)) return false;
  const entry = x.entry;
  if (!isObj(entry) || !isObj(entry.draft) || !isObj(entry.request)) return false;
  const studio = entry.draft;
  const mcq = studio.draft;
  if (!isStr(studio.id) || !Array.isArray(studio.checks) || !isObj(mcq)) return false;
  if (!isBi(mcq.stem) || !Array.isArray(mcq.options) || !mcq.options.every(isBi) || typeof mcq.answerIndex !== 'number') return false;
  if (!Array.isArray(x.older)) return false;
  const request = entry.request;
  return isStr(request.keyPoint) && Array.isArray(request.examples) && Array.isArray(request.sides);
}

function isRef(x: unknown): x is ChatRef {
  return isObj(x) && (x.who === 'you' || x.who === 'ai') && isObj(x.source) && isStr(x.source.id) && isBi(x.source.stem) && Array.isArray(x.source.options);
}

function isTurn(x: unknown): x is Turn {
  if (!isObj(x) || !isStr(x.id)) return false;
  if (x.role === 'user') return isStr(x.text) && Array.isArray(x.refs);
  if (x.role === 'ai') return Array.isArray(x.steps) && Array.isArray(x.notes) && Array.isArray(x.draftIds);
  return false;
}

/**
 * A draft saved before k-0531 as `failed` was left out then; it reads as `look` now, so it
 * shows as a normal card with its red warning (its failed check rows are kept as saved).
 */
function shownChatDraft(draft: ChatDraft): ChatDraft {
  return { ...draft, entry: { ...draft.entry, draft: shownDraft(draft.entry.draft) }, older: draft.older.map(shownDraft) };
}

/** A stored chat as the screen can use it, or undefined when it is not one. */
export function readChat(x: unknown): Chat | undefined {
  if (!isObj(x) || x.v !== 1 || !isStr(x.id) || !isStr(x.createdAt) || !isStr(x.updatedAt)) return undefined;
  if (!Array.isArray(x.turns) || !Array.isArray(x.drafts) || !Array.isArray(x.refs) || !isObj(x.settings)) return undefined;
  const s = x.settings;
  const count = CHAT_COUNTS.includes(s.count as never) ? (s.count as Chat['settings']['count']) : 1;
  const level = s.level === 'harder' || s.level === 'easier' ? s.level : 'same';
  const language: LanguageMode = LANGUAGE_MODES.includes(s.language as LanguageMode) ? (s.language as LanguageMode) : 'en';
  const picks = Array.isArray(x.picks) ? x.picks.filter((p): p is Chat['picks'][number] => isObj(p) && isStr(p.code) && isStr(p.reason)) : [];
  return {
    v: 1,
    id: x.id,
    createdAt: x.createdAt,
    updatedAt: x.updatedAt,
    refs: x.refs.filter(isRef),
    turns: x.turns.filter(isTurn),
    // Versions saved before k-0530 get their numbers by place (`numbered`).
    drafts: x.drafts.filter(isDraft).map(shownChatDraft).map(numbered),
    picks,
    ...(conceptOf(x.concept) ? { concept: conceptOf(x.concept) } : {}),
    settings: { count, level, language },
    lastText: isStr(x.lastText) ? x.lastText : '',
    ...(isStr(x.paper) && x.paper ? { paper: x.paper } : {}),
  };
}

/** A copy without anything large or passing: reference pictures. */
function forSaving(chat: Chat): Chat {
  const strip = <T extends { examples: readonly unknown[] }>(request: T): T => ({
    ...request,
    examples: request.examples.map((e) => {
      if (!isObj(e) || !('figures' in e)) return e;
      const rest = { ...e };
      delete rest.figures;
      delete rest.figureAt;
      delete rest.figuresLang;
      return rest;
    }),
  });
  return {
    ...chat,
    refs: chat.refs.map((r) => {
      if (!('figures' in r.source)) return r;
      const source: typeof r.source & { figures?: unknown } = { ...r.source };
      delete source.figures;
      delete source.figureAt;
      delete source.figuresLang;
      return { ...r, source };
    }),
    drafts: chat.drafts.map((d) => ({ ...d, entry: { ...d.entry, request: strip(d.entry.request) } })),
  };
}

/** What went wrong with a save the teacher must hear about (k-0551). */
export interface SaveReport {
  /** `full`: this computer's storage is full; `error`: anything else. Absent: all saved. */
  problem?: 'full' | 'error';
  /** Chats that could not be kept (the oldest); every chat when nothing could be written. */
  left: number;
  /** Chats it tried to keep. */
  of: number;
}

export interface ChatStorage {
  /** The saved chats; their pictures may still be tokens until `restore`. */
  load(): Chat[];
  /**
   * The pictures `chats` name by token, read back (`putPicturesBack` puts them in), and the
   * chats saved before k-0551 moved over: their pictures out of localStorage. Never throws.
   */
  restore?(chats: readonly Chat[]): Promise<ReadonlyMap<string, string>>;
  /** Saves, now or once new pictures are kept; resolves undefined when a later save replaced it. */
  save(chats: readonly Chat[]): void | SaveReport | Promise<SaveReport | undefined>;
}

/** The ✦ Write panel's chats (one list for every paper, each chat naming its paper). */
export const PAPER_CHATS_KEY = 'econgen.paperChats.v1';
/** Every saved list: the pictures any of them names are kept. */
export const CHAT_KEYS = [CHATS_KEY, PAPER_CHATS_KEY] as const;

/** A picture written this long ago is taken as still kept; after it, a save writes it again. */
export const KNOWN_FOR_MS = 5 * 60 * 1000;
/** A picture no list names is dropped only once it is this old (another window may be saving it). */
export const PRUNE_GRACE_MS = 10 * 60 * 1000;

/**
 * What one window knows about the picture store, shared by both lists: the pictures written
 * or read lately, the writes under way, and whether the store works at all here.
 */
interface Keeper {
  store: PictureStore;
  now: () => number;
  known: Map<string, number>;
  writing: Map<string, Promise<boolean>>;
  /** False once the store failed: pictures stay inline for the rest of the session. */
  works: boolean;
}

const keepers = new WeakMap<PictureStore, Keeper>();
/**
 * Plain statements on purpose: written as `if (!k) keepers.set(store, (k = {…}))`, the
 * production minifier inlined it into `localChatStorage` as `(e=…)||…; let e`, a use before
 * its declaration that broke prerendering `/` (k-0551 build fix).
 */
function keeperOf(store: PictureStore, now: () => number): Keeper {
  const found = keepers.get(store);
  if (found) return found;
  const made: Keeper = { store, now, known: new Map(), writing: new Map(), works: true };
  keepers.set(store, made);
  return made;
}

const isKnown = (keeper: Keeper, id: string) => {
  const at = keeper.known.get(id);
  return at !== undefined && keeper.now() - at < KNOWN_FOR_MS;
};

/** Keeps the pictures not known yet; true when every one of them is kept. */
async function keep(keeper: Keeper, pictures: ReadonlyMap<string, string>): Promise<boolean> {
  const waits: Promise<boolean>[] = [];
  const fresh = new Map<string, string>();
  for (const [id, url] of pictures) {
    if (isKnown(keeper, id)) continue;
    const under = keeper.writing.get(id);
    if (under) waits.push(under);
    else fresh.set(id, url);
  }
  if (fresh.size) {
    const write = keeper.store.putAll(fresh).then((ok) => {
      const at = keeper.now();
      for (const id of fresh.keys()) {
        keeper.writing.delete(id);
        if (ok) keeper.known.set(id, at);
      }
      if (!ok) keeper.works = false;
      return ok;
    });
    for (const id of fresh.keys()) keeper.writing.set(id, write);
    waits.push(write);
  }
  return (await Promise.all(waits)).every(Boolean);
}

/** A chat a newer build saved (`v` above 1): this build cannot read it, so it keeps it as it is. */
const isNewer = (x: unknown): boolean => isObj(x) && typeof x.v === 'number' && x.v > 1;

/**
 * What a write must keep from the list saved now (k-0564): the newer build's chats in it, or
 * `'newer'` when the saved list is not an array but an object (a shape this build does not
 * know: never written over). Nothing to keep when it is missing, unreadable or this build's.
 */
export function heldBack(raw: string | null): unknown[] | 'newer' {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (isObj(data)) return 'newer';
  return Array.isArray(data) ? data.filter(isNewer) : [];
}

const isQuota = (error: unknown) => {
  const e = error as { name?: string; code?: number } | null;
  return e?.name === 'QuotaExceededError' || e?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e?.code === 22 || e?.code === 1014;
};

export function localChatStorage(
  store: Pick<Storage, 'getItem' | 'setItem'> | undefined = typeof window === 'undefined' ? undefined : window.localStorage,
  key: string = CHATS_KEY,
  pictures: PictureStore = sharedPictureStore(),
  now: () => number = Date.now,
): ChatStorage {
  const keeper = keeperOf(pictures, now);
  /** Bumped by every save: an older save still waiting on its pictures writes nothing. */
  let generation = 0;
  /** The pictures the last write named: one dropped from it is a reason to tidy. */
  let named: Set<string> | undefined;
  const lean = new WeakMap<Chat, { chat: Chat; pictures: Map<string, string> }>();

  const leanOf = (chat: Chat) => {
    const hit = lean.get(chat);
    if (hit) return hit;
    const { value, pictures: found } = takePictures(forSaving(chat));
    const made = { chat: value, pictures: found };
    lean.set(chat, made);
    return made;
  };

  /** Pictures neither list names, older than the grace, dropped. Never throws. */
  const tidy = async () => {
    if (!store || !keeper.works) return;
    try {
      const keepIds = new Set<string>();
      for (const k of CHAT_KEYS) tokenIdsInText(store.getItem(k), keepIds);
      const gone = await pictures.prune(keepIds, now() - PRUNE_GRACE_MS);
      for (const id of gone) keeper.known.delete(id);
    } catch {
      // Tidying is a nicety: the next start tries again.
    }
  };

  /**
   * Writes the list, the oldest chats dropped until it fits; what the teacher must hear. An
   * empty list is written too (k-0564: the last chat deleted stays deleted), always with the
   * newer build's chats kept (`heldBack`, read now: another window may have saved since).
   */
  const write = (list: readonly Chat[], { keepOnFailure = false } = {}): SaveReport => {
    let current: string | null = null;
    try {
      current = store!.getItem(key);
    } catch {
      // Unreadable now: nothing of it can be kept; the write below says whether storage works.
    }
    const back = heldBack(current);
    if (back === 'newer') return { problem: 'error', left: list.length, of: list.length };
    // Two builds open at once may hold the same chat: this build's copy is the one written.
    const mineIds = new Set(list.map((c) => c.id));
    const held = back.filter((x) => !mineIds.has((x as { id?: unknown }).id as string));
    let count = list.length;
    let problem: SaveReport['problem'];
    for (;;) {
      try {
        store!.setItem(key, JSON.stringify([...list.slice(0, count), ...held]));
        break;
      } catch (error) {
        problem ??= isQuota(error) ? 'full' : 'error';
        // Moving old chats over: what is there stays as it is rather than lose a chat.
        if (keepOnFailure) return { problem, left: list.length, of: list.length };
        if (count === 0) break;
        count -= 1;
      }
    }
    const ids = tokenIds(list.slice(0, count));
    const dropped = named !== undefined && [...named].some((id) => !ids.has(id));
    named = ids;
    if (dropped) void tidy();
    return { ...(problem ? { problem } : {}), left: list.length - count, of: list.length };
  };

  const save = (chats: readonly Chat[], opts: { keepOnFailure?: boolean } = {}): SaveReport | Promise<SaveReport | undefined> | undefined => {
    if (!store) return undefined;
    const mine = ++generation;
    // Only chats with something in them; newest first; at most MAX_CHATS.
    const kept = chats
      .filter((c) => c.turns.length > 0)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_CHATS);
    const leans = kept.map(leanOf);
    const all = new Map<string, string>();
    for (const each of leans) for (const [id, url] of each.pictures) all.set(id, url);
    // Pictures that cannot be kept stay inline, as before k-0551; moving old chats over then
    // writes nothing at all (the saved list is already that).
    const inline = (): SaveReport => (opts.keepOnFailure ? { left: 0, of: kept.length } : write(kept.map(forSaving), opts));
    if (all.size === 0) return write(leans.map((l) => l.chat), opts);
    if (!keeper.works) return inline();
    if ([...all.keys()].every((id) => isKnown(keeper, id))) return write(leans.map((l) => l.chat), opts);
    // New pictures: kept first, so no saved chat ever names a picture that is not there.
    return keep(keeper, all).then((ok) => {
      if (mine !== generation) return undefined;
      return ok ? write(leans.map((l) => l.chat), opts) : inline();
    });
  };

  return {
    load() {
      if (!store) return [];
      try {
        const raw = store.getItem(key);
        if (!raw) return [];
        const data: unknown = JSON.parse(raw);
        if (!Array.isArray(data)) return [];
        return data.map(readChat).filter((c): c is Chat => c !== undefined);
      } catch {
        return [];
      }
    },
    async restore(chats) {
      if (!store) return new Map();
      let found = new Map<string, string>();
      const before = generation;
      try {
        const ids = tokenIds(chats);
        if (ids.size) {
          const read = await pictures.getAll(ids);
          if (read) {
            found = read;
            const at = now();
            for (const id of read.keys()) keeper.known.set(id, at);
          }
        }
        // Chats saved before k-0551 hold their pictures inline: move them out now, or leave
        // the saved list exactly as it is if that fails. A save made meanwhile (the teacher
        // already changed something) has moved them with the newer chats: nothing to do.
        if (hasInlinePictures(chats)) {
          if (generation === before) await save(chats, { keepOnFailure: true });
        }
        else named = tokenIds(chats);
      } catch {
        // Words only for now; the saved list is untouched.
      }
      await tidy();
      return found;
    },
    save: (chats) => save(chats),
  };
}
