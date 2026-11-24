import type { AiErrorInfo } from '@/ai/types';
import type { LanguageMode } from '@/model/types';
import type { SheetDraft } from '@/questionStudio/session';
import type { Level, SourceQuestion, StudioDraft } from '@/questionStudio/types';
import type { KeyPick } from './engine';

/**
 * The chat studio's data (k-0516). A chat is one conversation: the reference questions, what
 * the teacher asked, what the AI did (as steps, stored as codes so the words follow the
 * interface language), and the drafts it wrote. Chats are kept on this computer
 * (`chatStorage.ts`); nothing here is a worksheet until the teacher adds a draft.
 */

export const CHAT_COUNTS = [1, 3, 5] as const;
export type ChatCount = (typeof CHAT_COUNTS)[number];

export interface ChatSettings {
  count: ChatCount;
  level: Level;
  /** The paper language the drafts are written in. */
  language: LanguageMode;
}

/** A reference question: picked by the teacher, or chosen by the studio as a style to follow. */
export interface ChatRef {
  source: SourceQuestion;
  /** The key point its bank tags name, if any. */
  keyPoint?: string;
  who: 'you' | 'ai';
}

/** One thing the AI did for a request, shown as a line in its reply. */
export type Step =
  | { kind: 'read'; state: StepState; labels: string[] }
  | { kind: 'pick'; state: StepState; picks: KeyPick[]; by: 'ai' | 'you' | 'computer' | 'draft' }
  | { kind: 'refs'; state: StepState; labels: string[] }
  | { kind: 'write'; state: StepState; count: number; done?: number; total?: number }
  | { kind: 'check'; state: StepState }
  | { kind: 'diagram'; state: StepState }
  | { kind: 'change'; state: StepState; draftNo: number; how: ChangeHow };

export type StepState = 'run' | 'done' | 'fail';
export type ChangeHow = 'harder' | 'easier' | 'change' | 'another';

/** What the AI says after its steps, as codes (the words are the catalogue's). */
export type Note =
  | { kind: 'written'; ok: number; look: number; failed: number }
  | { kind: 'changed'; draftNo: number; version: number }
  | { kind: 'another'; draftNo: number }
  | { kind: 'stopped' }
  | { kind: 'noPick' }
  | { kind: 'pickChanged'; code: string }
  | { kind: 'kept' };

export interface UserTurn {
  id: string;
  role: 'user';
  text: string;
  /** Labels of the references it was sent with. */
  refs: string[];
  /** The draft it was about ("Make draft 2 harder"). */
  draftNo?: number;
  /** A quick change from the draft's buttons: the words are the catalogue's. */
  how?: ChangeHow;
}

export interface AiTurn {
  id: string;
  role: 'ai';
  steps: Step[];
  notes: Note[];
  /** Drafts this reply made or changed, by draft id. */
  draftIds: string[];
  error?: AiErrorInfo;
  /** The teacher closed the error's notice: it is not raised again. */
  errorSeen?: boolean;
  /** A question back to the teacher: the key point changed while drafts exist (decision 3). */
  ask?: { kind: 'rewrite'; code: string; answer?: 'rewrite' | 'keep' };
}

export type Turn = UserTurn | AiTurn;

export type DraftState = 'open' | 'accepted' | 'rejected' | 'added';

/** A draft on the paper: its current version, older versions, and what the teacher did with it. */
export interface ChatDraft {
  /** Stable across versions (the engine gives each version its own id). */
  id: string;
  /** "Draft 3": numbered in the order written, never renumbered. */
  no: number;
  entry: SheetDraft;
  /** Older versions, oldest first (v1 …); the current one is `entry.draft`. */
  older: StudioDraft[];
  state: DraftState;
  /** The reply that wrote it. */
  turnId: string;
}

export interface Chat {
  v: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  refs: ChatRef[];
  turns: Turn[];
  drafts: ChatDraft[];
  /** The key point(s) the drafts are written on: the AI's pick, or the teacher's change. */
  picks: KeyPick[];
  settings: ChatSettings;
  /** The last request's words, so a rewrite asks the same thing on a new key point. */
  lastText: string;
  /** The paper it writes for (a worksheet id): a chat of the editor's ✦ Write panel. */
  paper?: string;
}

/** A chat's line in the Chats ▾ list. */
export interface ChatSummary {
  id: string;
  updatedAt: string;
  /** The first request's words, or the first reference's label. */
  title: string;
  like?: string;
  drafts: number;
  added: number;
}

export const summaryOf = (chat: Chat): ChatSummary => {
  const first = chat.turns.find((t): t is UserTurn => t.role === 'user');
  return {
    id: chat.id,
    updatedAt: chat.updatedAt,
    title: first?.text ?? '',
    like: first?.refs[0] ?? chat.refs.find((r) => r.who === 'you')?.source.label,
    drafts: chat.drafts.length,
    added: chat.drafts.filter((d) => d.state === 'added').length,
  };
};
