import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { sharedReviewStore, type ReviewStore } from './reviewStore';
import type { ChatNotes, TurnNote, TurnTag } from './types';

/**
 * The teacher's own notes for review (k-0598): one on the whole chat, one per reply with an
 * optional quick tag (good / wrong / unclear). Kept with the review records (`reviewStore.ts`),
 * read when a chat is shown, written a moment after typing stops, and always before an export.
 */
export interface NotesState {
  byChat: Record<string, ChatNotes>;
  load(chatId: string): Promise<void>;
  setTurn(chatId: string, turnId: string, patch: { text?: string; tag?: TurnTag | null }): void;
  setChat(chatId: string, text: string): void;
  /** Every note typed so far, written now (the export waits for it). */
  flush(): Promise<void>;
}

export function createNotesStore(store: () => ReviewStore, now: () => Date = () => new Date(), delay = 500): UseBoundStore<StoreApi<NotesState>> {
  return create<NotesState>((set, get) => {
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const loading = new Map<string, Promise<void>>();
    const writes = new Set<Promise<unknown>>();

    const write = (chatId: string) => {
      const timer = timers.get(chatId);
      if (timer) clearTimeout(timer);
      timers.delete(chatId);
      const notes = get().byChat[chatId];
      if (!notes) return;
      const p = store()
        .putNotes(notes)
        .catch(() => false)
        .finally(() => writes.delete(p));
      writes.add(p);
    };
    const later = (chatId: string) => {
      const timer = timers.get(chatId);
      if (timer) clearTimeout(timer);
      timers.set(chatId, setTimeout(() => write(chatId), delay));
    };
    const of = (chatId: string): ChatNotes => get().byChat[chatId] ?? { chatId, turns: {} };

    return {
      byChat: {},
      load: (chatId) => {
        if (get().byChat[chatId]) return Promise.resolve();
        const was = loading.get(chatId);
        if (was) return was;
        const p = store()
          .notesOf(chatId)
          .catch(() => undefined)
          .then((found) => {
            // Typed before the read came back: what was typed wins, the rest is kept.
            const typed = get().byChat[chatId];
            if (found || typed) set({ byChat: { ...get().byChat, [chatId]: { ...found, ...typed, chatId, turns: { ...found?.turns, ...typed?.turns } } } });
          });
        loading.set(chatId, p);
        return p;
      },
      setTurn: (chatId, turnId, patch) => {
        const notes = of(chatId);
        const was: Partial<TurnNote> = notes.turns[turnId] ?? {};
        const next: TurnNote = { at: now().toISOString() };
        const text = patch.text !== undefined ? patch.text : was.text;
        const tag = patch.tag !== undefined ? patch.tag ?? undefined : was.tag;
        if (text) next.text = text;
        if (tag) next.tag = tag;
        const turns = { ...notes.turns };
        if (next.text || next.tag) turns[turnId] = next;
        else delete turns[turnId];
        set({ byChat: { ...get().byChat, [chatId]: { ...notes, turns } } });
        later(chatId);
      },
      setChat: (chatId, text) => {
        const notes = of(chatId);
        const { chat: _was, ...rest } = notes;
        void _was;
        set({ byChat: { ...get().byChat, [chatId]: text ? { ...rest, chat: text } : rest } });
        later(chatId);
      },
      flush: async () => {
        for (const chatId of [...timers.keys()]) write(chatId);
        await Promise.all([...writes]);
      },
    };
  });
}

export const useReviewNotes = createNotesStore(() => sharedReviewStore());
