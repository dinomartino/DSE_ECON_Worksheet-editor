import type { AiErrorInfo } from '@/ai/types';
import type { OutputMode, Worksheet } from '@/model/types';
import type { TranslateScope } from '@/translate/types';

/**
 * The AI door's contract: every AI action is an `AiVerb` registered in `./registry`,
 * offered by the one menu, run by `useAiRun`. Results are inserted directly (one commit,
 * one ⌘Z); review happens after, on the page and in the bar. Nothing here is persisted.
 */

/** What a verb acts on. Same union the translation engine already takes. */
export type AiScope = TranslateScope;

export type VerbGroup = 'translate' | 'check' | 'write' | 'create';

export interface VerbContext {
  worksheet: Worksheet;
  mode: OutputMode;
  scope: AiScope;
  /** Human label of the scope: "Whole paper", "Question 2", "3 questions", "This text". */
  scopeLabel: string;
}

export interface VerbAvailability {
  /** Right-hand count in the menu ("52 texts"); absent = no count shown. */
  count?: number;
  /** Unit after the count, e.g. "texts", "parts". */
  unit?: string;
  /** Greyed with this reason instead of runnable (e.g. "Nothing to fill here"). */
  disabledReason?: string;
}

export interface VerbInput {
  kind: 'text';
  label: string;
  placeholder: string;
  minChars: number;
}

export interface AiVerb {
  /** Stable id, 'translate.fill', 'check.terms', 'write.answers', 'create.fromSource', 'check.quality'. */
  id: string;
  group: VerbGroup;
  /** Menu order within its group (lower first). */
  order: number;
  label(ctx: VerbContext): string;
  /** null = not offered in this context (hidden). */
  available(ctx: VerbContext): VerbAvailability | null;
  /** True: needs a configured provider; the menu shows SetupCard first when none is set. */
  needsKey: boolean;
  /** One line under the label while highlighted, e.g. "Sends 52 texts to Gemini with your key". */
  sendsLine?(ctx: VerbContext, providerLabel: string): string;
  /** Present when the teacher must give input before running (E3's pasted source). */
  input?: VerbInput;
  run(ctx: VerbContext, io: VerbIO, input?: string): Promise<VerbOutcome>;
}

export interface VerbIO {
  signal: AbortSignal;
  progress(done: number, total: number, label?: string): void;
}

/** How a reviewed thing shows on the page and in the bar. */
export type ReviewTone = 'inserted' | 'look' | 'failed' | 'finding';

export interface ReviewItem {
  id: string;
  tone: ReviewTone;
  /** `editTargetKey(target)` of the page text it lives on — highlight + scroll. */
  targetKey?: string;
  /** Scroll/select fallback when there is no text target (whole question). */
  questionId?: string;
  /** Card header: "Question 2 (b)". */
  where: string;
  /** Source text for context (translation), plain. */
  source?: string;
  /** Card lines: "EDB: 物價水平", "Bold not kept", "Two options are defensible". */
  notes: string[];
  /** One-click action in the card: "Replace with 稅收承擔", "Remove". Commits once;
   *  `false` = nothing changed (the text moved on), so the item stays open. */
  action?: { label: string; run(): boolean | void };
  /** Its action ran: the card reads Done, no chip counts it. Set by `useAiRun.act`. */
  resolved?: true;
}

/** A findings outcome's bar after a card's action, re-read from the paper as it is now. */
export interface FindingsRefresh {
  summary: string;
  applyAll?: { label: string; run(): void };
}

export type VerbOutcome =
  /** Something was written: `undo` reverts exactly that one commit (null once stale). */
  | { kind: 'inserted'; summary: string; items: ReviewItem[]; undo: { run(): void; live(): boolean } | null; showSide?: 'en' | 'zh'; showTeacher?: boolean }
  /** Nothing written, things to look at (Check terms, Quality check). */
  | { kind: 'findings'; summary: string; items: ReviewItem[]; applyAll?: { label: string; run(): void }; refresh?(): FindingsRefresh }
  | { kind: 'nothing'; summary: string }
  | { kind: 'error'; error: AiErrorInfo };
