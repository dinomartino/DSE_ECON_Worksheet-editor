import type { AiErrorInfo } from '@/ai/types';
import type { Messages } from '@/i18n/catalogue';
import type { AiCheckOutcome } from './ai';
import type { IMPORT_CHECK_MESSAGES } from './messages';

/**
 * The AI check's own row in words (k-0501, user u-2ywo: "I just click a button and nothing
 * happened"). A run is always in one visible state: not run yet, connecting, checking (how
 * far, how long), or finished — and a finished run always says what it did: a headline
 * (when, how many questions, what came of it, or why it failed) and a few lines of what
 * was sent and what was found. Pure: the clock and the error's wording come in.
 */

type M = Messages<typeof IMPORT_CHECK_MESSAGES>;

export type AiRun =
  | { state: 'idle' }
  | { state: 'connecting' }
  | { state: 'running'; done: number; total: number; batches: number; concurrency: number; startedAt: number }
  | { state: 'done'; at: number; outcome: AiCheckOutcome }
  /** It never started: no provider, no key, a key the keychain would not give. */
  | { state: 'failed'; at: number; error: AiErrorInfo };

export type AiTone = 'ok' | 'found' | 'warn' | 'failed';

export interface AiReport {
  tone: AiTone;
  headline: string;
  lines: string[];
}

/** Rough seconds for one batch of questions, before the run has timed one itself. */
const GUESS_BATCH_S = 15;

export function duration(m: M, ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return m.seconds(s < 10 ? s : Math.round(s / 5) * 5);
  return m.minutes(Math.round(s / 60));
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** "0:12 so far · about 40 s left": from the run's own pace once one batch is back. */
export function aiTiming(m: M, run: Extract<AiRun, { state: 'running' }>, now: number): string {
  const elapsed = now - run.startedAt;
  const ahead =
    run.done > 0 && run.done < run.total
      ? m.aiLeft(duration(m, (elapsed / run.done) * (run.total - run.done)))
      : run.done === 0
        ? m.aiGuess(duration(m, Math.ceil(run.batches / Math.max(1, run.concurrency)) * GUESS_BATCH_S * 1000))
        : '';
  return [m.aiElapsed(clock(elapsed)), ahead].filter(Boolean).join(' · ');
}

/** What a run sent, as one line: "Checked: 30 questions · 96 MC options · 4 pictures…". */
export function checkedLine(m: M, outcome: AiCheckOutcome): string {
  const c = outcome.checked;
  const parts = [
    m.aiQuestionsN(c.questions),
    c.options ? m.aiOptionsN(c.options) : '',
    c.statements ? m.aiStatementsN(c.statements) : '',
    c.pictures ? m.aiPicturesN(c.pictures) : '',
    c.tables ? m.aiTablesN(c.tables) : '',
    c.marks ? m.aiMarksN(c.marks) : '',
  ].filter(Boolean);
  return m.aiCheckedLine(parts.join(m.aiListJoin));
}

/** The findings by kind of issue, most first: "Found: garbled words (2) · marks (1) · 1 with a fix to apply". */
export function foundLine(m: M, outcome: AiCheckOutcome): string {
  const by = new Map<string, number>();
  for (const f of outcome.findings) {
    const issue = String(f.params.issue ?? 'other');
    by.set(issue, (by.get(issue) ?? 0) + 1);
  }
  const fixes = outcome.findings.filter((f) => f.fix).length;
  const parts = [...by].sort((a, b) => b[1] - a[1]).map(([issue, n]) => m.aiIssue(issue, n));
  if (fixes) parts.push(m.aiWithFix(fixes));
  return m.aiFoundLine(parts.join(m.aiListJoin));
}

/**
 * A finished run in words. `time` formats a moment ("14:32"); `why` puts an error in the
 * interface language.
 */
export function aiReport(
  m: M,
  run: Extract<AiRun, { state: 'done' | 'failed' }>,
  time: (at: number) => string,
  why: (error: AiErrorInfo) => string,
): AiReport {
  const at = time(run.at);
  if (run.state === 'failed') return { tone: 'failed', headline: m.aiFailedWhy(why(run.error)), lines: [m.aiRulesStand] };
  const o = run.outcome;
  const found = o.findings.length;
  const notes = [
    o.checked.pictures ? m.aiPicturesNote : '',
    o.dropped ? m.aiDroppedNote(o.dropped) : '',
  ].filter(Boolean);
  if (o.total === 0) return { tone: 'warn', headline: m.aiNothingSent, lines: [m.aiRulesStand] };
  // Nothing came back: the reason is the headline.
  if (o.done === 0 && !o.stopped) {
    const error = o.fatal ?? o.lastError;
    return { tone: 'failed', headline: m.aiFailedWhy(error ? why(error) : m.aiUnreadable), lines: [m.aiRulesStand] };
  }
  const lines = [checkedLine(m, o)];
  if (found) lines.push(foundLine(m, o));
  else if (o.done) lines.push(m.aiLookedFor);
  const missed = o.total - o.done;
  if (o.stopped) return { tone: 'warn', headline: m.aiStopped(o.done, o.total), lines: [...lines, ...notes] };
  if (missed > 0) {
    const error = o.fatal ?? o.lastError;
    return {
      tone: 'warn',
      headline: m.aiPartly(at, o.done, o.total, found),
      lines: [...lines, m.aiFailedNote(missed, error ? why(error) : ''), ...notes],
    };
  }
  return found
    ? { tone: 'found', headline: m.aiFound(at, o.total, found), lines: [...lines, ...notes] }
    : { tone: 'ok', headline: m.aiClean(at, o.total), lines: [...lines, ...notes] };
}

/** The review bar's button, which also says how the last run went. */
export function aiBarLabel(m: M, run: AiRun): string {
  if (run.state === 'connecting') return m.aiBarConnecting;
  if (run.state === 'running') return m.aiBarBusy(run.done, run.total);
  if (run.state === 'failed') return m.aiBarFailed;
  if (run.state === 'done') {
    const o = run.outcome;
    if (o.done === 0 && !o.stopped) return m.aiBarFailed;
    return o.findings.length ? m.aiBarFound(o.findings.length) : m.aiBarClean;
  }
  return m.aiBarButton;
}
