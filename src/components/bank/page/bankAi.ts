import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { isAiError, type AiErrorInfo } from '@/ai/types';
import {
  replaceTerms,
  runBankFill,
  runBankTerms,
  safeFixes,
  termItems,
  termsSummary,
  type BankReviewItem,
  type BankRunDeps,
  type BankUnit,
  type UnitFindings,
} from '@/assist/bankRun';
import { genericError, NOTHING_TO_FILL } from '@/assist/fillRules';
import { TERMS_MATCH } from '@/assist/termRules';
import * as copy from '@/components/translate/copy';
import type { Glossary } from '@/glossary/types';
import { restoreCopies, type CopyRecord, type CopyRef, type CopySkip } from '@/library/sameCopies';
import { rootIdOf } from '@/model/lineage';
import type { Side } from '@/model/textSlots';

/**
 * The question bank's ✦ run, one at a time: running → review (after writing) or error.
 * Mirrors the editor's `useAiRun`, over saved documents: results are written straight
 * away, reviewed after (highlighted in the rail and on the paper, ‹ ›), and Undo all puts
 * back every copy the run wrote that still holds what it wrote. It belongs to one visit
 * of the bank screen: leaving stops it (`settle`) and forgets the review.
 */

/** More than this many questions asks first, with a rough time. */
export const CONFIRM_OVER = 20;
/** A rough time per question: one or two requests, then the writes. */
export const SECONDS_PER_QUESTION = 6;

/** "about 2 minutes", "under a minute". */
export function roughTime(questions: number): string {
  const seconds = questions * SECONDS_PER_QUESTION;
  if (seconds < 60) return 'under a minute';
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? 'about a minute' : `about ${minutes} minutes`;
}

/** The one-line confirm a big fill asks: "Translate 40 questions? About 4 minutes." */
export function confirmLine(questions: number): string {
  const time = roughTime(questions);
  return `Translate ${questions} questions? This takes ${time}. You can stop at any time.`;
}

export const needsConfirm = (questions: number): boolean => questions > CONFIRM_OVER;

export type BankAiVerb = 'fill' | 'terms';

export type BankAiRequest =
  | { verb: 'fill'; side: Side; includeTeacher: boolean; units: BankUnit[]; copiesOf(unit: BankUnit): CopyRef[] }
  | { verb: 'terms'; units: BankUnit[]; copiesOf(unit: BankUnit): CopyRef[] };

export type BankAiPhase =
  | { kind: 'idle' }
  | { kind: 'running'; verb: BankAiVerb; label: string; done: number; total: number }
  | {
      kind: 'review';
      verb: BankAiVerb;
      summary: string;
      items: BankReviewItem[];
      index: number;
      /** Undo all has something to put back. */
      undoable: boolean;
      /** Check terms' Replace N (the safe fixes). */
      applyAll?: { label: string };
      /** A replace or an undo is writing. */
      busy?: boolean;
    }
  | { kind: 'nothing'; summary: string }
  | { kind: 'error'; verb: BankAiVerb; error: AiErrorInfo };

/** What the screen hears: documents were written, copies were left alone, a line to say. */
export interface BankAiHooks {
  onWritten(): void;
  onSkipped(skipped: CopySkip[], saved: number): void;
  onNotice(message: string): void;
}

export interface BankAiState {
  phase: BankAiPhase;
  start(request: BankAiRequest, hooks: BankAiHooks): Promise<void>;
  stop(): void;
  next(): void;
  prev(): void;
  goTo(index: number): void;
  dismiss(): void;
  undoAll(): Promise<void>;
  /** Check terms: Replace N. */
  applyAll(): Promise<void>;
  /** Check terms: one finding's own fix. */
  applyItem(index: number): Promise<void>;
  retry(): void;
  /** Stop, and resolve once nothing is being written (before the screen is left). */
  settle(): Promise<void>;
}

const count = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

export function createBankAi(deps: BankRunDeps): UseBoundStore<StoreApi<BankAiState>> {
  let controller: AbortController | null = null;
  let pending: Promise<void> = Promise.resolve();
  let hooks: BankAiHooks | null = null;
  let last: BankAiRequest | null = null;
  // The review's working state, never shown directly.
  let records: CopyRecord[] = [];
  let findings: UnitFindings[] = [];
  let glossary: Glossary | null = null;

  /** Queue a write behind any in flight, so settle() waits for it. */
  const track = <T>(work: Promise<T>): Promise<T> => {
    pending = pending.then(
      () => work.then(() => undefined, () => undefined),
      () => work.then(() => undefined, () => undefined),
    );
    return work;
  };

  return create<BankAiState>((set, get) => {
    const itemCount = () => {
      const phase = get().phase;
      return phase.kind === 'review' ? phase.items.length : 0;
    };

    /** Check terms' review from the current findings; `lead` goes first in the summary. */
    const showFindings = (lead?: string, index = 0) => {
      const items = termItems(findings);
      const safe = safeFixes(findings).reduce((n, { accepted }) => n + [...accepted.values()].reduce((m, s) => m + s.size, 0), 0);
      if (items.length === 0 && !lead) {
        set({ phase: { kind: 'nothing', summary: TERMS_MATCH } });
        return;
      }
      const summary = [lead, items.length > 0 ? termsSummary(findings) : ''].filter(Boolean).join(' · ');
      set({
        phase: {
          kind: 'review',
          verb: 'terms',
          summary,
          items,
          index: Math.min(index, Math.max(0, items.length - 1)),
          undoable: records.length > 0,
          ...(safe > 0 ? { applyAll: { label: `Replace ${safe}` } } : {}),
        },
      });
    };

    /** Apply fixes to some questions: every identical copy, one write per question. */
    const replace = async (targets: { unit: UnitFindings; accepted: Map<string, Set<number>> }[], index: number) => {
      const phase = get().phase;
      if (phase.kind !== 'review' || phase.busy || !glossary) return;
      set({ phase: { ...phase, busy: true } });
      let terms = 0;
      const skipped: CopySkip[] = [];
      let saved = 0;
      for (const { unit, accepted } of targets) {
        const result = await track(replaceTerms(unit, accepted, glossary, deps));
        records.push(...result.records);
        skipped.push(...result.skipped);
        saved += new Set(result.records.map((r) => r.docId)).size;
        terms += result.terms;
        findings = findings.map((f) => (f === unit ? result.next : f)).filter((f) => f.rows.length > 0);
      }
      if (saved > 0) hooks?.onWritten();
      if (skipped.length > 0) hooks?.onSkipped(skipped, saved);
      showFindings(terms > 0 ? copy.replacedTermsFlash(terms) : copy.NOTHING_REPLACED, index);
    };

    return {
      phase: { kind: 'idle' },

      start: async (request, heard) => {
        if (controller || get().phase.kind === 'running') return;
        hooks = heard;
        last = request;
        records = [];
        findings = [];
        glossary = null;
        const own = new AbortController();
        controller = own;
        const label = request.verb === 'fill' ? 'Translating' : 'Checking terms';
        set({ phase: { kind: 'running', verb: request.verb, label, done: 0, total: request.units.length } });
        const progress = (done: number, total: number, text: string) => {
          if (controller === own) set({ phase: { kind: 'running', verb: request.verb, label: text, done, total } });
        };
        const work = (async () => {
          try {
            if (request.verb === 'fill') {
              const outcome = await runBankFill(request, deps, own.signal, progress);
              if (controller !== own) return;
              if (outcome.kind === 'error') {
                set({ phase: { kind: 'error', verb: 'fill', error: outcome.error } });
                return;
              }
              records = outcome.records;
              const saved = new Set(outcome.records.map((r) => r.docId)).size;
              if (saved > 0) heard.onWritten();
              if (outcome.skipped.length > 0) heard.onSkipped(outcome.skipped, saved);
              if (outcome.items.length === 0 && !outcome.stopped) {
                set({ phase: { kind: 'nothing', summary: NOTHING_TO_FILL } });
                return;
              }
              set({
                phase: { kind: 'review', verb: 'fill', summary: outcome.summary, items: outcome.items, index: 0, undoable: records.length > 0 },
              });
              return;
            }
            const outcome = await runBankTerms(request, deps, own.signal, progress);
            if (controller !== own) return;
            if (outcome.kind === 'error') {
              set({ phase: { kind: 'error', verb: 'terms', error: outcome.error } });
              return;
            }
            findings = outcome.findings;
            glossary = outcome.glossary;
            showFindings(outcome.stopped ? 'Stopped' : undefined);
          } catch (err) {
            if (controller === own) set({ phase: { kind: 'error', verb: request.verb, error: isAiError(err) ? err.info : genericError(err) } });
          } finally {
            if (controller === own) controller = null;
          }
        })();
        await track(work);
      },

      stop: () => controller?.abort(),

      next: () => {
        const phase = get().phase;
        const n = itemCount();
        if (phase.kind === 'review' && n > 0) set({ phase: { ...phase, index: (phase.index + 1) % n } });
      },
      prev: () => {
        const phase = get().phase;
        const n = itemCount();
        if (phase.kind === 'review' && n > 0) set({ phase: { ...phase, index: (phase.index - 1 + n) % n } });
      },
      goTo: (index) => {
        const phase = get().phase;
        if (phase.kind === 'review' && index >= 0 && index < phase.items.length) set({ phase: { ...phase, index } });
      },

      dismiss: () => {
        const phase = get().phase;
        if (phase.kind === 'running' || (phase.kind === 'review' && phase.busy)) return;
        records = [];
        findings = [];
        set({ phase: { kind: 'idle' } });
      },

      undoAll: async () => {
        const phase = get().phase;
        if (phase.kind !== 'review' || phase.busy || records.length === 0) return;
        set({ phase: { ...phase, busy: true } });
        const result = await track(restoreCopies(deps.store, records));
        findings = [];
        set({ phase: { kind: 'idle' } });
        if (result.saved.size > 0) hooks?.onWritten();
        const roots = new Map(records.map((r) => [`${r.docId}\u0000${r.questionId}`, rootIdOf(r.before)]));
        const questions = new Set(result.restored.map((ref) => roots.get(`${ref.docId}\u0000${ref.questionId}`))).size;
        records = [];
        if (result.skipped.length > 0) hooks?.onSkipped(result.skipped, result.saved.size);
        else hooks?.onNotice(questions > 0 ? `Put back ${count(questions, 'question')} as ${questions === 1 ? 'it was' : 'they were'}.` : 'Nothing to put back.');
      },

      applyAll: async () => {
        const phase = get().phase;
        if (phase.kind !== 'review' || phase.verb !== 'terms') return;
        await replace(safeFixes(findings), 0);
      },

      applyItem: async (index) => {
        const phase = get().phase;
        if (phase.kind !== 'review' || phase.verb !== 'terms') return;
        const item = phase.items[index];
        if (!item?.fix) return;
        const unit = findings.find((f) => f.unit.docId === item.unit.docId && f.unit.questionId === item.unit.questionId);
        if (!unit) return;
        await replace([{ unit, accepted: new Map([[item.fix.path, new Set([item.fix.index])]]) }], index);
      },

      retry: () => {
        if (!last || !hooks || get().phase.kind === 'running') return;
        void get().start(last, hooks);
      },

      settle: async () => {
        controller?.abort();
        await pending;
      },
    };
  });
}
