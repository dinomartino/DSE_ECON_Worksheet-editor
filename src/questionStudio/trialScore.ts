import { toRuns } from '@/generate/validate';
import { plain } from '@/model/text';
import type { CheckId, StudioDraft } from './types';
import { TRIAL_BRIEFS } from './trialBriefs';
import { isBriefLabel, isMarked, MINE, shownDrafts, type TrialDraft, type TrialRun } from './trialLog';

/**
 * Scoring the trial (k-0499, decision 7a). The bar is the proposal's, to be agreed with the
 * teacher: the key is defensible on 90% or more of what is shown, and 60% or more is usable
 * as it stands or after one edit; and no near-copy is ever shown. The bar is judged on what
 * the teacher has marked, and only once enough is marked to mean something (`minMarked`).
 * Pure over the record (`trialLog.ts`); the page shows the same numbers, `reportText` writes
 * them out for the people tuning the studio.
 */
export const BAR = { keyDefensible: 90, usable: 60, minMarked: 20 } as const;

export interface Gate {
  got: number;
  of: number;
  /** Whole percent; undefined when nothing was counted. */
  percent: number | undefined;
  need: number;
  /** undefined until enough is marked to judge. */
  pass: boolean | undefined;
}

export interface Tally {
  runs: {
    /** Invented briefs run through to drafts. */
    briefs: number;
    /** The teacher's own Write clicks that produced drafts. */
    mine: number;
    /** Another / Harder / Easier / Change… on a draft. */
    refinements: number;
    /** Runs that ended in an error other than Stop. */
    errors: number;
    /** Runs the teacher stopped. */
    stopped: number;
  };
  drafts: { written: number; shown: number; leftOut: number; leftOutBy: { copy: number; shape: number } };
  /** The local checks, over the drafts shown. */
  local: {
    keyAgree: number;
    keyLook: number;
    keySkipped: number;
    lint: number;
    syllabus: number;
    numbers: number;
    terms: number;
    /** Shown with the near-copy check not passed: never above 0. */
    nearCopyShown: number;
    /** The closest a shown draft came to an existing question, whole percent (the limit is `NEAR_COPY_LIMIT`). */
    copyMax: number | undefined;
    copyP90: number | undefined;
    /** Runs whose near-copy check had no Past paper bank to compare with: the near-copy number means less. */
    bankMissing: number;
  };
  marks: { shown: number; marked: number; keyMarked: number; keyOk: number; useMarked: number; asis: number; edit: number; reject: number };
  cost: { runs: number; requests: number; input: number; output: number; thinking: number; ms: number };
  bar: { keyDefensible: Gate; usable: Gate; nearCopy: Gate; verdict: 'pending' | 'pass' | 'fail' };
}

const percentOf = (got: number, of: number): number | undefined => (of > 0 ? Math.round((got / of) * 100) : undefined);

function gate(got: number, of: number, need: number, enough: boolean, higherIsBetter = true): Gate {
  const percent = percentOf(got, of);
  const pass = !enough || percent === undefined ? undefined : higherIsBetter ? (got / of) * 100 >= need : got <= need;
  return { got, of, percent, need, pass };
}

const rowOf = (draft: StudioDraft, id: CheckId) => draft.checks.find((check) => check.id === id);
const looked = (draft: StudioDraft, id: CheckId) => rowOf(draft, id)?.state === 'look';

function percentile(sorted: number[], p: number): number | undefined {
  if (sorted.length === 0) return undefined;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

export function tally(runs: readonly TrialRun[]): Tally {
  const okRuns = runs.filter((run) => run.ok);
  const written = runs.flatMap((run) => run.drafts);
  const shownList = shownDrafts(runs);
  const shown = shownList.map(({ entry }) => entry);
  const failed = written.filter((entry) => entry.draft.status === 'failed');
  const failedWith = (id: CheckId) => failed.filter((entry) => rowOf(entry.draft, id)?.state === 'fail').length;

  const briefLabels = new Set(okRuns.filter((run) => run.kind === 'write' && isBriefLabel(run.label)).map((run) => run.label));
  const copyPercents = shown.flatMap((entry) => {
    const value = rowOf(entry.draft, 'copy')?.value;
    return value === undefined ? [] : [value];
  });
  const sortedCopy = [...copyPercents].sort((a, b) => a - b);

  const keyMarked = shown.filter((entry) => entry.key !== undefined);
  const useMarked = shown.filter((entry) => entry.use !== undefined);
  const keyOk = keyMarked.filter((entry) => entry.key === 'ok').length;
  const asis = useMarked.filter((entry) => entry.use === 'asis').length;
  const edit = useMarked.filter((entry) => entry.use === 'edit').length;
  const reject = useMarked.filter((entry) => entry.use === 'reject').length;

  const nearCopyShown = shown.filter((entry) => {
    const state = rowOf(entry.draft, 'copy')?.state;
    return state !== undefined && state !== 'pass';
  }).length;
  const bankMissing = okRuns.filter((run) => run.compared?.past === null).length;

  const keyDefensible = gate(keyOk, keyMarked.length, BAR.keyDefensible, keyMarked.length >= BAR.minMarked);
  const usable = gate(asis + edit, useMarked.length, BAR.usable, useMarked.length >= BAR.minMarked);
  const nearCopy: Gate = {
    got: nearCopyShown,
    of: shown.length,
    percent: percentOf(nearCopyShown, shown.length),
    need: 0,
    pass: shown.length === 0 ? undefined : nearCopyShown === 0 && bankMissing === 0,
  };
  const gates = [keyDefensible.pass, usable.pass, nearCopy.pass];
  const verdict = gates.some((pass) => pass === undefined) ? 'pending' : gates.every(Boolean) ? 'pass' : 'fail';

  return {
    runs: {
      briefs: briefLabels.size,
      mine: okRuns.filter((run) => run.kind === 'write' && run.label === MINE).length,
      refinements: okRuns.filter((run) => run.kind === 'refine').length,
      errors: runs.filter((run) => !run.ok && run.error !== 'cancelled').length,
      stopped: runs.filter((run) => !run.ok && run.error === 'cancelled').length,
    },
    drafts: { written: written.length, shown: shown.length, leftOut: failed.length, leftOutBy: { copy: failedWith('copy'), shape: failedWith('shape') } },
    local: {
      keyAgree: shown.filter((entry) => rowOf(entry.draft, 'key')?.state === 'pass').length,
      keyLook: shown.filter((entry) => looked(entry.draft, 'key')).length,
      keySkipped: shown.filter((entry) => rowOf(entry.draft, 'key')?.state === 'skipped').length,
      lint: shown.filter((entry) => looked(entry.draft, 'lint')).length,
      syllabus: shown.filter((entry) => looked(entry.draft, 'syllabus')).length,
      numbers: shown.filter((entry) => looked(entry.draft, 'numbers')).length,
      terms: shown.filter((entry) => looked(entry.draft, 'terms')).length,
      nearCopyShown,
      copyMax: sortedCopy.at(-1),
      copyP90: percentile(sortedCopy, 90),
      bankMissing,
    },
    marks: { shown: shown.length, marked: shown.filter(isMarked).length, keyMarked: keyMarked.length, keyOk, useMarked: useMarked.length, asis, edit, reject },
    cost: okRuns.concat(runs.filter((run) => !run.ok)).reduce(
      (sum, run) => ({
        runs: sum.runs + 1,
        requests: sum.requests + run.usage.requests,
        input: sum.input + run.usage.input,
        output: sum.output + run.usage.output,
        thinking: sum.thinking + run.usage.thinking,
        ms: sum.ms + run.usage.ms,
      }),
      { runs: 0, requests: 0, input: 0, output: 0, thinking: 0, ms: 0 },
    ),
    bar: { keyDefensible, usable, nearCopy, verdict },
  };
}

// ---- the report ----

const LETTERS = 'ABCD';

const stemOf = (draft: StudioDraft): string => {
  const text = plain(toRuns(draft.draft.stem.en || draft.draft.stem.zh)).replace(/\s+/g, ' ').trim();
  return text.length > 90 ? `${text.slice(0, 89)}…` : text;
};

/** The checks that said "read it", as their codes. */
export function flagsOf(draft: StudioDraft): string[] {
  return draft.checks.filter((check) => check.state === 'look').flatMap((check) => (check.findings.length > 0 ? check.findings.map((finding) => finding.id) : [check.id]));
}

const pct = (gate: Gate) => (gate.percent === undefined ? 'n/a' : `${gate.percent}%`);
const word = (pass: boolean | undefined) => (pass === undefined ? 'not enough marked yet' : pass ? 'PASS' : 'FAIL');
const seconds = (ms: number, runs: number) => (runs > 0 ? `${Math.round(ms / runs / 1000)} s` : 'n/a');

/**
 * The record as plain text, in English, for the people tuning the studio: the bar and where it
 * stands, the local checks, the cost, each brief's result, and the drafts that need a look.
 */
export function reportText(runs: readonly TrialRun[], today: Date = new Date()): string {
  const t = tally(runs);
  const model = [...runs].reverse().find((run) => run.model)?.model ?? 'unknown';
  const lines: string[] = [];
  const add = (line = '') => lines.push(line);

  add('Question studio trial report');
  add(`Date ${today.toISOString().slice(0, 10)} · model ${model}`);
  add(`Runs: ${t.runs.briefs} of ${TRIAL_BRIEFS.length} invented briefs · ${t.runs.mine} of your own requests · ${t.runs.refinements} refinements · ${t.runs.errors} failed · ${t.runs.stopped} stopped`);
  add(`Drafts: ${t.drafts.written} written · ${t.drafts.shown} shown · ${t.drafts.leftOut} left out (copy ${t.drafts.leftOutBy.copy}, shape ${t.drafts.leftOutBy.shape})`);
  add(`Marked: ${t.marks.marked} of ${t.marks.shown} shown have both marks (key ${t.marks.keyMarked}, use ${t.marks.useMarked})`);
  add();
  add('The bar');
  add(`  Key defensible: ${t.bar.keyDefensible.got} of ${t.bar.keyDefensible.of} = ${pct(t.bar.keyDefensible)} (need ${BAR.keyDefensible}%) ${word(t.bar.keyDefensible.pass)}`);
  add(`  Usable as it stands or after one edit: ${t.bar.usable.got} of ${t.bar.usable.of} = ${pct(t.bar.usable)} (need ${BAR.usable}%) ${word(t.bar.usable.pass)}  [as it stands ${t.marks.asis} · one edit ${t.marks.edit} · reject ${t.marks.reject}]`);
  add(`  Near-copy shown: ${t.bar.nearCopy.got} (must be 0) ${word(t.bar.nearCopy.pass)}${t.local.bankMissing > 0 ? ` · NOT compared with the Past paper bank in ${t.local.bankMissing} runs` : ' · compared with the Past paper bank in every run'}`);
  add(`  Verdict: ${t.bar.verdict.toUpperCase()} (judged once ${BAR.minMarked} are marked)`);
  add();
  add(
    `Local checks on the ${t.drafts.shown} shown: solver agrees ${t.local.keyAgree} · differs or ambiguous ${t.local.keyLook} · key not checked ${t.local.keySkipped} · lint ${t.local.lint} · syllabus ${t.local.syllabus} · numbers ${t.local.numbers} · terms ${t.local.terms}` +
      (t.local.copyMax === undefined ? '' : ` · closest near-copy ${t.local.copyMax}% (90th percentile ${t.local.copyP90}%)`),
  );
  add(`Cost over ${t.cost.runs} runs of the studio: ${t.cost.requests} provider requests · ${Math.round((t.cost.input + t.cost.output) / 1000)}k tokens in and out (thinking ${Math.round(t.cost.thinking / 1000)}k) · about ${seconds(t.cost.ms, t.cost.runs)} a click`);
  add();

  add('By brief');
  const done = new Set<string>();
  for (const brief of TRIAL_BRIEFS) {
    const ofBrief = runs.filter((run) => run.ok && run.kind === 'write' && run.label === brief.id).flatMap((run) => run.drafts);
    if (ofBrief.length === 0) continue;
    done.add(brief.id);
    const shown = ofBrief.filter((entry) => entry.draft.status !== 'failed');
    const count = (pick: (entry: TrialDraft) => boolean) => shown.filter(pick).length;
    add(
      `  ${brief.id} ${[brief.keyPoint, ...(brief.points ?? [])].join(' ')}: asked ${brief.count}, shown ${shown.length}${ofBrief.length > shown.length ? ` (${ofBrief.length - shown.length} left out)` : ''}` +
        ` · key ok ${count((e) => e.key === 'ok')}/${count((e) => e.key !== undefined)} marked · as it stands ${count((e) => e.use === 'asis')}, edit ${count((e) => e.use === 'edit')}, reject ${count((e) => e.use === 'reject')}`,
    );
  }
  const missing = TRIAL_BRIEFS.filter((brief) => !done.has(brief.id)).map((brief) => brief.id);
  if (missing.length > 0) add(`  Not run: ${missing.join(', ')}`);
  add();

  const worth = shownDrafts(runs).filter(({ entry }) => entry.use === 'reject' || entry.key === 'bad');
  add(`Needs a look: rejected, or the key not defensible (${worth.length}${worth.length > 20 ? ', first 20' : ''})`);
  for (const { run, entry } of worth.slice(0, 20)) {
    const flags = flagsOf(entry.draft);
    add(
      `  ${run.label} ${run.request.keyPoint} ${run.request.level}/${run.request.shape}: key ${LETTERS[entry.draft.draft.answerIndex] ?? '?'}` +
        `${entry.key === 'bad' ? ' (not defensible)' : ''}${entry.use ? ` · ${entry.use}` : ''}${flags.length ? ` · ${flags.join(', ')}` : ''} · "${stemOf(entry.draft)}"`,
    );
  }
  return lines.join('\n');
}
