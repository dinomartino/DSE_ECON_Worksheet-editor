import type { AiErrorInfo } from '@/ai/types';
import * as copy from '@/components/translate/copy';
import type { Glossary } from '@/glossary/types';
import { contentKey } from '@/library/contentKey';
import { questionSlots, writeIntoCopies, type CopyRecord, type CopyRef, type CopySkip } from '@/library/sameCopies';
import { plain } from '@/model/text';
import type { Side, TextPath, TextSlot, TranslationWrite } from '@/model/textSlots';
import type { OutputMode, Worksheet } from '@/model/types';
import type { WorksheetStore } from '@/storage/types';
import { planFromSlots } from '@/translate/plan';
import { runTranslation, writesFor } from '@/translate/run';
import { termFixWrites, termRowsFromSlots } from '@/translate/termCheck';
import type { JobResult, RunDepsResult, RunOutcome, TermRow } from '@/translate/types';
import { depsError, fillCount, fillOptions, needsLook, rowNotes, sideName, usable } from './fillRules';
import { termNotes, termTally, tallySummary } from './termRules';

/**
 * The question bank's ✦ runs, over saved documents instead of the open one: Fill missing
 * 中文 / English and Check terms, for one question, the questions in the list, or every
 * question the page shows. The same engine as the editor's verbs (plan, run, validate, the
 * glossary), with two differences:
 *
 * - **One question at a time.** Each is planned from its own document, sent, then written
 *   before the next starts, so Stop keeps every question already done, and progress counts
 *   questions ("12 of 40").
 * - **Every identical copy.** A result computed on the shown copy is written into every copy
 *   that says the same thing (`src/library/sameCopies.ts`), so the bank still shows one
 *   question. Copies already different are left alone; so is anything read-only.
 *
 * Results are written straight away (no pre-insert review); hard failures never are.
 */

/** One question to run on: the copy it is read from, and what that copy said when listed. */
export interface BankUnit extends CopyRef {
  rootId: string;
  contentKey: string;
  /** Where it lives, for the review card: "Mock 2026 Paper 1 · Q4". */
  label: string;
}

export interface BankRunDeps {
  store: Pick<WorksheetStore, 'list' | 'load' | 'save'>;
  createRunDeps(opts?: { glossary?: boolean }): Promise<RunDepsResult>;
  loadGlossary(): Promise<Glossary>;
  desktop(): boolean;
  now?(): string;
}

export type BankProgress = (done: number, total: number, label: string) => void;

/** A text the preview marks: what was written, or the term a finding is about. */
export interface BankMark {
  text: string;
  tone: 'inserted' | 'look' | 'finding';
}

export type BankItemTone = 'inserted' | 'look' | 'failed' | 'finding';

/** One thing to review: a question a fill wrote (or could not), or one term finding. */
export interface BankReviewItem {
  id: string;
  tone: BankItemTone;
  unit: BankUnit;
  /** Card lines. */
  notes: string[];
  /** The English a finding is about, for context. */
  source?: string;
  marks: BankMark[];
  /** A finding's own fix: `checks[index]` of the row at `path`. */
  fix?: { label: string; path: TextPath; index: number };
}

export const CHANGED_SINCE_READ = 'Changed since the bank read it. Left as it is.';
export const NOT_WRITTEN = 'No copy of it could be written.';

const now = (deps: BankRunDeps) => deps.now?.() ?? new Date().toISOString();
const questions = (n: number) => `${n} ${n === 1 ? 'question' : 'questions'}`;
const sameRef = (a: CopyRef, b: CopyRef) => a.docId === b.docId && a.questionId === b.questionId;

/** The copy a unit names, read now: undefined when it is gone or no longer says what was listed. */
async function readUnit(deps: BankRunDeps, unit: BankUnit): Promise<{ worksheet: Worksheet; slots: TextSlot[] } | undefined> {
  const worksheet = await deps.store.load(unit.docId).catch(() => undefined);
  const question = worksheet?.questions.find((q) => q.id === unit.questionId);
  if (!worksheet || !question || contentKey(question) !== unit.contentKey) return undefined;
  return { worksheet, slots: questionSlots(worksheet, unit.questionId) };
}

/* ------------------------------------------------------------------------------------ */
/* Fill missing 中文 / English                                                           */
/* ------------------------------------------------------------------------------------ */

export interface FillRequest {
  units: readonly BankUnit[];
  side: Side;
  /** Teacher text (answers, mark schemes) too: the preview shows Teacher or AI Settings say so. */
  includeTeacher: boolean;
  /** Every copy the unit's result goes to (`identicalCopies`), the unit's own first. */
  copiesOf(unit: BankUnit): CopyRef[];
}

export type FillOutcome =
  | { kind: 'error'; error: AiErrorInfo }
  | {
      kind: 'done';
      summary: string;
      items: BankReviewItem[];
      /** Every copy written, for Undo all. */
      records: CopyRecord[];
      /** Copies left alone (read-only, in Trash, changed since): reported, never retried. */
      skipped: CopySkip[];
      /** Questions written. */
      filled: number;
      done: number;
      total: number;
      stopped: boolean;
    };

/** "Filled 中文 in 12 questions, 2 need a look" / "Stopped. 12 of 40 done." */
export function bankFillSummary(o: {
  side: Side;
  filled: number;
  look: number;
  failed: number;
  stopped: boolean;
  done: number;
  total: number;
  notSent?: { count: number; reason: string };
}): string {
  const lead = o.stopped
    ? `Stopped. ${o.done} of ${o.total} done`
    : o.filled > 0
      ? `Filled ${sideName(o.side)} in ${questions(o.filled)}`
      : `Nothing filled`;
  const parts = [
    lead,
    o.look > 0 ? `${o.look} ${o.look === 1 ? 'needs' : 'need'} a look` : '',
    o.failed > 0 ? `${o.failed} couldn't be translated` : '',
    o.notSent && o.notSent.count > 0 ? `${questions(o.notSent.count)} not sent (${o.notSent.reason})` : '',
  ].filter(Boolean);
  return o.stopped && parts.length === 1 ? `${lead}.` : parts.join(', ');
}

/** A question's card: what came back worth a look, or why it failed, text by text. */
function fillItem(unit: BankUnit, plan: ReturnType<typeof planFromSlots>, outcome: RunOutcome, writes: readonly TranslationWrite[], slots: readonly TextSlot[], written: boolean): BankReviewItem {
  const byPath = new Map(slots.map((slot) => [slot.path, slot]));
  const notes: string[] = [];
  let look = false;
  let failed = false;
  const results = new Map<string, JobResult>();
  for (const [key, job] of plan.jobs) {
    const result = outcome.results.get(key);
    if (!result) continue;
    results.set(key, result);
    const where = byPath.get(job.slots[0].path)?.label ?? '';
    const lines = rowNotes(result).map((note) => note.text);
    if (!usable(result)) failed = true;
    else if (needsLook(result)) look = true;
    for (const line of lines) notes.push(where ? `${where}: ${line}` : line);
  }
  const lookPaths = new Set(
    [...plan.jobs].filter(([key]) => {
      const result = results.get(key);
      return result && usable(result) && needsLook(result);
    }).flatMap(([, job]) => job.slots.map((slot) => slot.path)),
  );
  const marks: BankMark[] = written
    ? writes.map((write) => ({ text: plain(write.next), tone: lookPaths.has(write.path) ? ('look' as const) : ('inserted' as const) })).filter((mark) => mark.text.trim())
    : [];
  if (!written) notes.push(NOT_WRITTEN);
  const tone: BankItemTone = !written || failed ? 'failed' : look ? 'look' : 'inserted';
  return { id: `${unit.docId}\u0000${unit.questionId}`, tone, unit, notes, marks };
}

/** Fill one side of every unit that lacks it, one question at a time. Never rejects. */
export async function runBankFill(req: FillRequest, deps: BankRunDeps, signal: AbortSignal, onProgress: BankProgress): Promise<FillOutcome> {
  const total = req.units.length;
  const label = `Translating into ${sideName(req.side)}`;
  onProgress(0, total, label);
  const resolved = await deps.createRunDeps({ glossary: true });
  if (!resolved.ok) return { kind: 'error', error: depsError(resolved, deps.desktop()) };
  const provider = resolved.deps.preset.label;
  const mode: OutputMode = { language: req.side, version: req.includeTeacher ? 'teacher' : 'student' };
  const options = fillOptions(mode, req.includeTeacher, req.side, false);

  const items: BankReviewItem[] = [];
  const records: CopyRecord[] = [];
  const skipped: CopySkip[] = [];
  let done = 0;
  let filled = 0;
  let stopped = false;
  let fatal: AiErrorInfo | undefined;

  for (const unit of req.units) {
    if (signal.aborted) {
      stopped = true;
      break;
    }
    const read = await readUnit(deps, unit);
    if (!read) {
      items.push({ id: `${unit.docId}\u0000${unit.questionId}`, tone: 'failed', unit, notes: [CHANGED_SINCE_READ], marks: [] });
      done += 1;
      onProgress(done, total, label);
      continue;
    }
    const plan = planFromSlots(read.worksheet.id, read.slots, { kind: 'questions', ids: [unit.questionId] }, options);
    // A question missing nothing on this side is skipped without a word.
    if (fillCount(plan) === 0) {
      done += 1;
      onProgress(done, total, label);
      continue;
    }
    let outcome: RunOutcome = { results: new Map(), stopped: false, model: '', ms: 0 };
    if (plan.jobs.size > 0) {
      outcome = await runTranslation(plan, resolved.deps, signal, (p) => {
        if (p.phase === 'waiting') onProgress(done, total, copy.waitingLine(provider, p.waitMs ?? 0));
        else onProgress(done, total, label);
      });
    }
    const ok = new Set([...outcome.results].filter(([, result]) => usable(result)).map(([key]) => key));
    if (plan.jobs.size > 0 && ok.size === 0 && (outcome.fatal || outcome.stopped)) {
      fatal = outcome.fatal;
      stopped = outcome.stopped;
      break;
    }
    // Hard failures are never written: `writesFor` takes the usable results only.
    const writes = writesFor(plan, outcome, ok, true);
    const result = await writeIntoCopies(deps.store, { sourceSlots: read.slots, writes, copies: req.copiesOf(unit), expectedKey: unit.contentKey }, now(deps));
    records.push(...result.written);
    skipped.push(...result.skipped);
    const written = result.written.some((record) => sameRef(record, unit));
    if (written) filled += 1;
    if (writes.length > 0 || outcome.results.size > 0) items.push(fillItem(unit, plan, outcome, writes, read.slots, written));
    done += 1;
    onProgress(done, total, label);
    if (outcome.fatal || outcome.stopped) {
      fatal = outcome.fatal;
      stopped = outcome.stopped;
      break;
    }
  }

  if (fatal && records.length === 0 && items.length === 0) return { kind: 'error', error: fatal };
  const count = (tone: BankItemTone) => items.filter((item) => item.tone === tone).length;
  const summary = bankFillSummary({
    side: req.side,
    filled,
    look: count('look'),
    failed: count('failed'),
    stopped: stopped && !fatal,
    done,
    total,
    ...(fatal ? { notSent: { count: total - done, reason: fatal.message } } : {}),
  });
  return { kind: 'done', summary, items, records, skipped, filled, done, total, stopped };
}

/* ------------------------------------------------------------------------------------ */
/* Check terms                                                                          */
/* ------------------------------------------------------------------------------------ */

/** One question's findings, with what a fix needs: its slots as checked, and its copies. */
export interface UnitFindings {
  unit: BankUnit;
  slots: TextSlot[];
  rows: TermRow[];
  copies: CopyRef[];
}

export type TermsOutcome = { kind: 'error'; error: AiErrorInfo } | { kind: 'checked'; findings: UnitFindings[]; glossary: Glossary; stopped: boolean };

const TERMS_ERROR: AiErrorInfo = { kind: 'badOutput', provider: 'gemini', message: copy.TERMS_UNAVAILABLE, fatal: false, actions: ['retry'] };

/** Keyless: every unit's 中文 against the EDB glossary. Nothing is written. */
export async function runBankTerms(
  req: { units: readonly BankUnit[]; copiesOf(unit: BankUnit): CopyRef[] },
  deps: BankRunDeps,
  signal: AbortSignal,
  onProgress: BankProgress,
): Promise<TermsOutcome> {
  const total = req.units.length;
  onProgress(0, total, 'Checking terms');
  let glossary: Glossary;
  try {
    glossary = await deps.loadGlossary();
  } catch {
    return { kind: 'error', error: TERMS_ERROR };
  }
  const findings: UnitFindings[] = [];
  let done = 0;
  for (const unit of req.units) {
    if (signal.aborted) return { kind: 'checked', findings, glossary, stopped: true };
    const read = await readUnit(deps, unit);
    if (read) {
      const rows = termRowsFromSlots(read.slots, glossary, { kind: 'questions', ids: [unit.questionId] });
      if (rows.length > 0) findings.push({ unit, slots: read.slots, rows, copies: req.copiesOf(unit) });
    }
    done += 1;
    onProgress(done, total, 'Checking terms');
  }
  return { kind: 'checked', findings, glossary, stopped: false };
}

/** Every finding as a review item, question by question, in reading order. */
export function termItems(findings: readonly UnitFindings[]): BankReviewItem[] {
  return findings.flatMap(({ unit, rows }) =>
    rows.flatMap((row) =>
      row.checks.map((check, index): BankReviewItem => {
        const where = row.slot.label ?? '';
        const notes = termNotes(row, check);
        return {
          id: `${unit.docId}\u0000${unit.questionId}\u0000${row.path}#${index}`,
          tone: 'finding',
          unit,
          notes: where ? [where, ...notes] : notes,
          source: plain(row.en),
          marks: check.found?.text ? [{ text: check.found.text, tone: 'finding' }] : [],
          ...(check.fix ? { fix: { label: `Replace with ${check.fix.to}`, path: row.path, index } } : {}),
        };
      }),
    ),
  );
}

/** "3 to fix · 1 textbook variant in 2 questions". */
export function termsSummary(findings: readonly UnitFindings[]): string {
  const { tally } = termTally(findings.flatMap((f) => f.rows));
  return `${tallySummary(tally)} in ${questions(findings.length)}`;
}

/** Replace N: the safe fixes of every question. */
export function safeFixes(findings: readonly UnitFindings[]): { unit: UnitFindings; accepted: Map<TextPath, Set<number>> }[] {
  return findings.flatMap((unit) => {
    const { safe } = termTally(unit.rows);
    return safe.size > 0 ? [{ unit, accepted: safe }] : [];
  });
}

export interface ReplaceResult {
  records: CopyRecord[];
  skipped: CopySkip[];
  /** Terms replaced in the shown copy. */
  terms: number;
  /** The question re-checked as written; the old findings when it was not written. */
  next: UnitFindings;
}

/**
 * Apply fixes to one question's shown copy and every identical copy, then re-check it as
 * written, so the next fix reads the text as it now is.
 */
export async function replaceTerms(
  findings: UnitFindings,
  accepted: ReadonlyMap<TextPath, ReadonlySet<number>>,
  glossary: Glossary,
  deps: BankRunDeps,
): Promise<ReplaceResult> {
  const { unit } = findings;
  const writes = termFixWrites(findings.rows, accepted);
  const result = await writeIntoCopies(deps.store, { sourceSlots: findings.slots, writes, copies: findings.copies, expectedKey: unit.contentKey }, now(deps));
  const saved = result.saved.get(unit.docId);
  const question = saved?.questions.find((q) => q.id === unit.questionId);
  if (!saved || !question || !result.written.some((record) => sameRef(record, unit))) {
    return { records: result.written, skipped: result.skipped, terms: 0, next: findings };
  }
  const terms = writes.reduce((n, write) => n + (accepted.get(write.path)?.size ?? 0), 0);
  const slots = questionSlots(saved, unit.questionId);
  const rows = termRowsFromSlots(slots, glossary, { kind: 'questions', ids: [unit.questionId] });
  const copies = result.written.filter((record) => record.docId !== unit.docId || record.questionId !== unit.questionId);
  return {
    records: result.written,
    skipped: result.skipped,
    terms,
    next: {
      unit: { ...unit, contentKey: contentKey(question) },
      slots,
      rows,
      copies: [{ docId: unit.docId, questionId: unit.questionId }, ...copies.map(({ docId, questionId }) => ({ docId, questionId }))],
    },
  };
}
