import { buildsOf, insertIntoOpenPaper, type InsertResult } from '@/questionStudio/deliver';
import { liveEnv, useTrialLog } from '@/questionStudio/live';
import { liveTrace } from '../review/live';
import { MINE } from '@/questionStudio/trialLog';
import { flowOf } from '@/model/flow';
import { useWorksheetStore } from '@/store/worksheetStore';
import { localChatStorage, PAPER_CHATS_KEY } from '../chat/chatStorage';
import { createChatStore } from '../chat/chatStore';
import type { Chat } from '../chat/chatTypes';
import { liveEngine } from '../chat/engine';
import { acceptable } from './ghosts';
import { useWritePanel } from './writePanelState';

export { acceptable, useWritePanel };

/**
 * The editor's ✦ Write panel (k-0516 package B): the studio's chat, docked beside the paper it
 * writes for. Its own store and its own saved list (`PAPER_CHATS_KEY`), each chat naming its
 * paper, so the studio's Chats ▾ and the panel never trade places. The drafts are written in
 * the paper's language and shown on the page where Accept will put them (`ghosts.ts`).
 */
export const usePaperChat = createChatStore({
  env: liveEnv,
  engine: liveEngine,
  storage: localChatStorage(undefined, PAPER_CHATS_KEY),
  language: () => useWorksheetStore.getState().mode.language,
  onRun: (info) => useTrialLog.getState().record({ label: MINE, ...info }),
  trace: liveTrace,
});

export const activePaperChat = (): Chat => {
  const s = usePaperChat.getState();
  return s.chats.find((c) => c.id === s.activeId) ?? s.chats[0];
};


/**
 * These drafts into the open paper at its insert anchor (the cursor), in draft order, one
 * commit and one ⌘Z (`insertIntoOpenPaper`). Only the paper the chat writes for.
 */
export function acceptDrafts(ids: readonly string[]): InsertResult {
  const chat = activePaperChat();
  if (chat.paper !== useWorksheetStore.getState().worksheet.id) return { ok: false, reason: 'otherDocument' };
  const wanted = new Set(ids);
  const entries = chat.drafts.filter((d) => wanted.has(d.id) && acceptable(d)).sort((a, b) => a.no - b.no);
  // Where they went, so an undo can put the cursor back there with the drafts.
  const after = useWorksheetStore.getState().insertAnchorId;
  const result = insertIntoOpenPaper(buildsOf(entries.map((d) => d.entry)));
  if (!result.ok) return result;
  // The cursor stays after what went in (the first is selected), so the drafts left follow it.
  const last = result.ids[result.ids.length - 1];
  if (last) useWorksheetStore.getState().setInsertAnchor(last);
  usePaperChat.getState().delivered(entries.map((d) => d.id));
  const placed = { ...useWritePanel.getState().placed };
  entries.forEach((d, i) => {
    if (result.ids[i]) placed[d.id] = { paper: chat.paper as string, question: result.ids[i], ...(after ? { after } : {}) };
  });
  useWritePanel.setState({ placed });
  return result;
}

/**
 * Accepted drafts whose question is no longer in `paper` (⌘Z, or deleted) go back on the
 * page as drafts. Returns the draft ids it reopened.
 */
export function reopenUndone(paper: string, questionIds: ReadonlySet<string>): string[] {
  const { placed } = useWritePanel.getState();
  const gone = Object.entries(placed)
    .filter(([, at]) => at.paper === paper && !questionIds.has(at.question))
    .map(([d]) => d);
  if (gone.length === 0) return [];
  usePaperChat.getState().undelivered(gone);
  // The undo also took the cursor (it was on the question that went): back where the drafts were written.
  const editor = useWorksheetStore.getState();
  const after = placed[gone[0]].after;
  if (after && editor.insertAnchorId === undefined && editor.worksheet.id === paper && flowOf(editor.worksheet).some((item) => item.id === after)) editor.setInsertAnchor(after);
  const next = { ...placed };
  for (const id of gone) delete next[id];
  useWritePanel.setState({ placed: next });
  return gone;
}
