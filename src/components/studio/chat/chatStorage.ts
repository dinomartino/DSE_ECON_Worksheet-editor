import type { LanguageMode } from '@/model/types';
import { shownDraft } from '@/questionStudio/validate';

const LANGUAGE_MODES: readonly LanguageMode[] = ['en', 'zh', 'bilingual'];
import { CHAT_COUNTS, type Chat, type ChatDraft, type ChatRef, type Turn } from './chatTypes';
import { numbered } from './versions';

/**
 * Saved chats (decision 4, u-2ouc): kept on this computer in localStorage, newest first, at
 * most `MAX_CHATS`. Each chat is checked on its own when read, so one damaged chat never
 * empties the list (the index rule of `AGENTS.md`), and a damaged draft inside a chat is
 * dropped without losing the rest. Pictures (a reference's `figures`) are never saved: they
 * are large and can be read again from the bank.
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
      return rest;
    }),
  });
  return {
    ...chat,
    refs: chat.refs.map((r) => {
      if (!('figures' in r.source)) return r;
      const source: typeof r.source & { figures?: unknown } = { ...r.source };
      delete source.figures;
      return { ...r, source };
    }),
    drafts: chat.drafts.map((d) => ({ ...d, entry: { ...d.entry, request: strip(d.entry.request) } })),
  };
}

export interface ChatStorage {
  load(): Chat[];
  save(chats: readonly Chat[]): void;
}

/** The ✦ Write panel's chats (one list for every paper, each chat naming its paper). */
export const PAPER_CHATS_KEY = 'econgen.paperChats.v1';

export function localChatStorage(
  store: Pick<Storage, 'getItem' | 'setItem'> | undefined = typeof window === 'undefined' ? undefined : window.localStorage,
  key: string = CHATS_KEY,
): ChatStorage {
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
    save(chats) {
      if (!store) return;
      // Only chats with something in them; newest first; drop the oldest until it fits.
      let list = chats
        .filter((c) => c.turns.length > 0)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, MAX_CHATS)
        .map(forSaving);
      while (list.length > 0) {
        try {
          store.setItem(key, JSON.stringify(list));
          return;
        } catch {
          list = list.slice(0, -1);
        }
      }
    },
  };
}
