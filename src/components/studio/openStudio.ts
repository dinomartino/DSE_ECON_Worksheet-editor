import type { PastPaperItem } from '@/pastpapers/pack';
import type { SourceQuestion } from '@/questionStudio/types';
import { useChat } from './chat/live';

/**
 * "✦ Write like this" on a bank question (k-0516, the one-click start of the k-0513 mockup D):
 * a fresh chat with that question as the reference, and writing starts at once with the
 * chat's defaults (no form, no topic: the AI picks the key point). The screen itself opens
 * through the start screen. A chat that is busy keeps the question for the teacher to send.
 */
export type WriteLikeResult = 'added' | 'already' | 'full';

export function writeLikeThis(source: SourceQuestion, keyPoint?: string, item?: PastPaperItem): WriteLikeResult {
  const chat = useChat.getState();
  if (chat.run) {
    const current = chat.chats.find((c) => c.id === chat.activeId);
    if (current?.refs.some((r) => r.source.id === source.id)) return 'already';
    return chat.addReference(source, keyPoint, item) ? 'added' : 'full';
  }
  chat.newChat();
  if (!useChat.getState().addReference(source, keyPoint, item)) return 'full';
  void useChat.getState().send('');
  return 'added';
}
