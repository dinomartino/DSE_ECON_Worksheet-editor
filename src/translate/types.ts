/**
 * The translation pipeline's contract: what a plan holds, what a run returns, what the
 * prompt carries and what Check terms shows. Types only.
 */
import type { AiClient, AiErrorInfo, HttpDeps, ProviderConfig, ProviderId, ProviderPreset } from '@/ai/types';
import type { Glossary, TermCheck } from '@/glossary/types';
import type { Side, SlotKind, TextPath, TextSlot, TranslationWrite } from '@/model/textSlots';
import type { RichText } from '@/model/types';
import type { SecretError } from '@/platform/secrets';

// ---- planning ----

/** toZh: en source → zh target. */
export type Direction = 'toZh' | 'toEn';
export type TranslateScope =
  | { kind: 'paper' }
  | { kind: 'questions'; ids: string[] }
  /** Question or layout element ids (marquee). */
  | { kind: 'flowItems'; ids: string[] }
  /** Page / cell / field entries. */
  | { kind: 'paths'; paths: TextPath[] }
  | { kind: 'block'; blockId: string; questionId?: string };

export interface TranslateOptions {
  directions: { toZh: boolean; toEn: boolean };
  /** Roles 'teacher' and 'meta'. */
  includeTeacher: boolean;
  includeDiagramLabels: boolean;
  /** Symbol-only page text only (never diagram text). */
  copySymbols: { toZh: boolean; toEn: boolean };
  /** Explicit re-translate: overwrite this side where both exist. Ignored for scope 'paper'. */
  retranslate?: Side;
}
/** The target as read, never []. */
export interface PlannedSlot { path: TextPath; side: Side; sourceSnapshot: RichText; targetSnapshot: RichText }
export interface TranslationJob {
  /** "t1"… request-local; never an app id. */
  key: string;
  direction: Direction;
  kind: SlotKind;
  aroundValue?: 'before' | 'after';
  /** `q:<id>` | `l:<id>` | 'cover' | 'bands' | 'document'. */
  groupKey: string;
  /** "Question 3 · (b) · table cell". */
  where: string;
  /** "printed before the number of questions". */
  note?: string;
  /** Normalised. */
  source: RichText;
  /** Dedupe fan-out (≥ 1). */
  slots: PlannedSlot[];
  /** Re-translate (target side not trimmed-empty). */
  replacing: boolean;
}
/** Wire-encoded, tags kept. */
export interface ContextPair { en: string; zh: string }
export interface Chunk {
  id: string;
  direction: Direction;
  groups: Array<{ groupKey: string; where: string; context: ContextPair[]; jobKeys: string[] }>;
  sourceChars: number;
}
export interface PlanCounts {
  toZh: number;
  toEn: number;
  teacher: number;
  diagramLabels: number;
  /** Symbol-only slots a copy could fill (never diagram text): Setup's copy row. */
  symbols: { toZh: number; toEn: number };
  /** Copies that will be written. */
  copied: number;
  /** Both sides present (scope ≠ paper). */
  replaceable: number;
  contextLines: number;
  chars: number;
  requests: number;
}
export interface TranslationPlan {
  worksheetId: string;
  scope: TranslateScope;
  options: TranslateOptions;
  jobs: ReadonlyMap<string, TranslationJob>;
  /** Symbol-only: no model call. */
  copies: TranslationWrite[];
  chunks: Chunk[];
  counts: PlanCounts;
}

// ---- prompt ----

export interface PromptPayload {
  task: 'translate' | 'repair';
  /** PinnedTerm.line[]. */
  glossary: string[];
  groups: Array<{
    /** "Question 3", "Cover". */
    where: string;
    context: ContextPair[];
    items: Array<{ key: string; kind: SlotKind; text: string; note?: string; previous?: string; fix?: string[] }>;
  }>;
}

// ---- running ----

export type IssueCode =
  | 'missingKey' | 'duplicateKey' | 'empty' | 'untranslated' | 'unbalanced' | 'unknownStyle'
  | 'blanks' | 'breaks' | 'scripts' | 'derived' | 'wordingDigits' | 'simplified' | 'latinInZh'
  | 'emphasis' | 'styles' | 'numbers' | 'symbols' | 'duration' | 'colon' | 'combination' | 'length'
  | 'polarity';
export interface Issue { code: IssueCode; severity: 'fail' | 'warn' | 'note'; message: string }
export interface JobResult {
  key: string;
  status: 'ready' | 'flagged' | 'failed';
  /** Full target runs (lead/trail restored). */
  runs?: RichText;
  issues: Issue[];
  /** Severity ≥ note. */
  terms: TermCheck[];
  fixes: Array<{ from: string; to: string; how: 'autoFix' | 'repair' | 'simplified' }>;
  passes: 1 | 2;
  /** Row-level: safety | truncated | badOutput. */
  error?: AiErrorInfo;
  /** The review's tick policy. */
  defaultAccepted: boolean;
}
export type RunPhase = 'translating' | 'checking' | 'fixing' | 'waiting';
export interface RunProgress { phase: RunPhase; requestsDone: number; requestsTotal: number; waitMs?: number }
export interface RunOutcome {
  /** By job key; copies are not here (plan.copies). */
  results: ReadonlyMap<string, JobResult>;
  /** Remaining chunks not attempted. */
  fatal?: AiErrorInfo;
  /** The signal aborted: finished chunks kept. */
  stopped: boolean;
  model: string;
  ms: number;
  usage?: { input: number; output: number };
}
export interface RunDeps {
  client: AiClient;
  preset: ProviderPreset;
  model: string;
  /** null → no pins, chips, auto-fix or term repair. */
  glossary: Glossary | null;
  sleep?: HttpDeps['sleep'];
  now?: () => number;
}
export type RunDepsResult =
  | { ok: true; deps: RunDeps; config: ProviderConfig }
  | { ok: false; provider: ProviderId; reason: 'noKey' | 'noModel' | 'noBaseUrl' | 'secretError'; error?: SecretError };

// ---- Check terms ----

/** One slot with term findings: checks with a fix or a conflict, severity ≥ note. */
export interface TermRow { path: TextPath; slot: TextSlot; en: RichText; zh: RichText; checks: TermCheck[] }
