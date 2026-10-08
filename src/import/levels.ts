/**
 * The sequence solver's two global decisions: which level each label family takes,
 * and which question-family lines really start questions. Consistency of numbering,
 * not any one teacher's style, decides both.
 */
import { isInstruction } from './detectors';
import { labelLevel } from './labels';
import type { Family, Level, Role, SourceLine } from './types';

/** Share of neighbours that step by one; a restart to 1 counts half. */
export function runQuality(values: readonly number[]): number {
  if (values.length < 2) return values.length ? 0.5 : 0;
  let good = 0;
  for (let k = 1; k < values.length; k++) {
    if (values[k] === values[k - 1] + 1) good += 1;
    else if (values[k] === 1) good += 0.5;
  }
  return good / (values.length - 1);
}

const PART_FAMILIES: Family[] = ['(a)', 'a)', 'a.'];
const ROMAN_FAMILIES: Family[] = ['(i)', 'i)', 'i.'];

/**
 * Each family's level. `forced` (profile, pins) wins. Numeric families compete for the
 * question level by run quality; the losers become statements (lists inside a stem).
 * Roman numerals become parts when no letter family is used for parts.
 */
export function inferLevels(lines: readonly SourceLine[], forced: ReadonlyMap<Family, Level>): Map<Family, Level> {
  const values = new Map<Family, number[]>();
  const depths = new Map<Family, number[]>();
  for (const line of lines) {
    if (!line.labelInfo) continue;
    const f = line.labelInfo.family;
    (values.get(f) ?? values.set(f, []).get(f)!).push(line.labelInfo.value);
    (depths.get(f) ?? depths.set(f, []).get(f)!).push(line.depth);
  }
  const levels = new Map<Family, Level>();
  for (const f of values.keys()) levels.set(f, labelLevel(f));

  const numeric = [...values.keys()].filter((f) => labelLevel(f) === 'question' && !forced.has(f));
  const score = (f: Family) => values.get(f)!.length * (0.2 + runQuality(values.get(f)!));
  numeric.sort((a, b) => score(b) - score(a));
  const primary = numeric[0];
  for (const f of numeric.slice(1)) {
    // A second numbering style joins the questions only if the merged run stays clean.
    const merged = lines.filter((l) => l.labelInfo && (l.labelInfo.family === f || l.labelInfo.family === primary)).map((l) => l.labelInfo!.value);
    if (runQuality(merged) < 0.8 * runQuality(values.get(primary)!)) levels.set(f, 'statement');
  }
  // "(1)" as the only numbering, with long clean runs and no letters for options: questions.
  const statements = values.get('(n)');
  const hasOptions = [...values.keys()].some((f) => labelLevel(f) === 'option');
  if (!primary && statements && statements.length >= 3 && runQuality(statements) > 0.8 && !hasOptions && Math.max(...statements) >= 5) {
    levels.set('(n)', 'question');
  }
  const letterParts = PART_FAMILIES.filter((f) => values.has(f));
  if (!letterParts.length) for (const f of ROMAN_FAMILIES) if (values.has(f)) levels.set(f, 'part');
  // Two letter families where one always sits deeper: the deeper one is the sub-part level.
  if (letterParts.length === 2 && !ROMAN_FAMILIES.some((f) => values.has(f))) {
    const mean = (f: Family) => depths.get(f)!.reduce((a, b) => a + b, 0) / depths.get(f)!.length;
    const [a, b] = letterParts;
    if (Math.abs(mean(a) - mean(b)) >= 1) levels.set(mean(a) > mean(b) ? a : b, 'subpart');
  }
  for (const [f, level] of forced) levels.set(f, level);
  return levels;
}

export type RunVerdict = 'ok' | 'skip' | 'restart' | 'nested' | 'instructions' | 'outlier';

/**
 * Walk the question-role lines in order and judge each against the run so far:
 * the next number, a restart (after a heading, or a new run), a short nested run
 * (a list inside a stem, `<ol>` statements) that the outer run resumes after, a small
 * skip, or an outlier. Then reject leading runs that read as an instructions list.
 */
export function settleQuestionRuns(lines: readonly SourceLine[], roles: readonly Role[], fixed: ReadonlySet<number>): Map<number, RunVerdict> {
  const verdict = new Map<number, RunVerdict>();
  const qs = lines.filter((l) => roles[l.i] === 'question' && l.labelInfo && !fixed.has(l.i));
  const index = new Map(qs.map((l, k) => [l.i, k]));
  let last: number | undefined;
  let headingSince = false;
  let k = 0;
  for (const line of lines) {
    if (roles[line.i] === 'heading') headingSince = true;
    const at = index.get(line.i);
    if (at === undefined || at < k) continue;
    const v = line.labelInfo!.value;
    if (last === undefined || v === last + 1 || headingSince) {
      verdict.set(line.i, last === undefined || v === last + 1 || v === 1 ? 'ok' : 'skip');
      last = v;
      headingSince = false;
      k = at + 1;
      continue;
    }
    // A short run v, v+1, … that the outer run resumes after (last + 1) is nested.
    const ahead = qs.slice(at, at + 8).map((l) => l.labelInfo!.value);
    let nested = 0;
    for (let j = 0; j < ahead.length; j++) {
      if (j > 0 && ahead[j] === last + 1) {
        nested = j;
        break;
      }
      if (ahead[j] !== v + j) break;
    }
    if (nested && (v <= 3 || v < last)) {
      for (let j = 0; j < nested; j++) verdict.set(qs[at + j].i, 'nested');
      k = at + nested;
      continue;
    }
    if (v === 1 || v < last) verdict.set(line.i, 'restart');
    else if (v <= last + 4 || ahead[1] === v + 1) verdict.set(line.i, 'skip');
    else {
      verdict.set(line.i, 'outlier');
      k = at + 1;
      continue;
    }
    last = v;
    headingSince = false;
    k = at + 1;
  }
  rejectInstructionRuns(lines, roles, qs, verdict);
  return verdict;
}

const EVIDENCE: ReadonlySet<Role> = new Set(['option', 'statement', 'part', 'subpart', 'marks', 'answerSpace']);

/** A leading run whose items have no options, parts or marks and read as instructions. */
function rejectInstructionRuns(lines: readonly SourceLine[], roles: readonly Role[], qs: readonly SourceLine[], verdict: Map<number, RunVerdict>): void {
  const accepted = qs.filter((l) => {
    const v = verdict.get(l.i);
    return v === 'ok' || v === 'skip' || v === 'restart';
  });
  const runs: SourceLine[][] = [];
  for (const line of accepted) {
    const v = line.labelInfo!.value;
    const run = runs[runs.length - 1];
    const prev = run?.[run.length - 1];
    if (!run || verdict.get(line.i) === 'restart' || (prev && v <= prev.labelInfo!.value)) runs.push([line]);
    else run.push(line);
  }
  if (runs.length < 2) return;
  const starts = accepted.map((l) => l.i);
  for (const run of runs.slice(0, -1)) {
    let score = 0;
    for (const line of run) {
      const next = starts.find((i) => i > line.i) ?? lines.length;
      let evidence = line.trailingMarks !== undefined || /[?？]$/.test(line.text) ? 1 : 0;
      for (let j = line.i + 1; j < next && !evidence; j++) if (EVIDENCE.has(roles[j]) || lines[j].trailingMarks !== undefined) evidence = 1;
      score += evidence - (isInstruction(line) ? 1 : 0);
    }
    if (score / run.length > 0.2) break;
    for (const line of run) verdict.set(line.i, 'instructions');
  }
}
