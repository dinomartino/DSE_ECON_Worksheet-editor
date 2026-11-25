'use client';

import { useEffect } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { Messages } from '@/i18n/catalogue';
import { useMessages } from '@/i18n/language';
import { dismiss, notify } from '@/store/notices';
import { STUDIO_CHAT_MESSAGES } from './chat.messages';
import type { ChatState, SaveProblem } from './chatStore';

/** The notice a chat save that did not keep everything raises; both chat lists share it (one storage). */
export const CHAT_SAVE_NOTICE = 'chat-save';

/** The notice's words for a problem. */
export function saveProblemText(m: Messages<typeof STUDIO_CHAT_MESSAGES>, problem: SaveProblem): string {
  if (problem.problem === 'error') return m.saveError;
  return problem.left > 0 && problem.left < problem.of ? m.saveFullSome(problem.left, problem.of) : m.saveFullNone;
}

/**
 * Tells the teacher when saving chats failed (k-0551), as a notice (the app's rule: never
 * inline), in the interface language. Closing it marks the problem seen; the next save that
 * keeps everything takes it down. Draws nothing itself.
 */
export function ChatSaveNotice({ store }: { store: UseBoundStore<StoreApi<ChatState>> }) {
  const m = useMessages(STUDIO_CHAT_MESSAGES);
  const problem = store((s) => s.saveProblem);

  useEffect(() => {
    if (!problem || problem.seen) {
      dismiss(CHAT_SAVE_NOTICE);
      return;
    }
    notify({
      id: CHAT_SAVE_NOTICE,
      tone: problem.problem === 'full' ? 'warning' : 'error',
      title: m.saveTitle,
      body: saveProblemText(m, problem),
      onDismiss: () => store.getState().dismissSaveProblem(),
    });
  }, [problem, m, store]);

  useEffect(() => () => dismiss(CHAT_SAVE_NOTICE), []);

  return null;
}
