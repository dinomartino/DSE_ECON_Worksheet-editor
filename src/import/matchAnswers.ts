/**
 * An answer file's entries placed on a solved paper, as pins: MC letters as `answer`
 * pins, written answers and schemes as `scheme` pins. Numbering restarts per section
 * (Part A 1–19, Part B 1–6), so each sheet section is first matched to a run of the
 * paper's numbering. A sheet section that fits nowhere (Paper 2's scheme beside Paper 1's
 * key, in one file) is left for another paper: `unused`, not `extra`.
 */
import { sectionKey, type AnswerSheet } from './answerSheet';
import { fold } from './normalize';
import type { Analysis, OutPart, OutQuestion, OutSubPart, Pin } from './types';

export type MatchStatus = 'matched' | 'missing' | 'extra' | 'conflict' | 'mismatch';

export type MatchDetail =
  | 'letterOutOfRange' // the sheet's letter is past the question's options (E on a 4-option MC)
  | 'noLetter' // text for an MC, with no letter in it
  | 'notWritten' // a letter for a written question
  | 'needsPart' // text with no part label for a question with several parts
  | 'noSuchPart' // a part or sub-part the question does not have
  | 'noSuchQuestion' // no question with that number in the matched section
  | 'duplicate' // a second answer for the same question or part
  | 'severalAnswers'; // the sheet accepts several letters ("A/C"): the first is set

/** One row per paper question, in order, then one per entry of a used section that landed nowhere. */
export interface AnswerMatch {
  status: MatchStatus;
  /** Index into `analysis.outline.questions`. Absent on an `extra` row with no question. */
  question?: number;
  /** Indices into `sheet.entries`. */
  entries: number[];
  detail?: MatchDetail;
  /** `conflict`: the paper's own answer (key, bold, "Ans:", a pin) and the sheet's, which is set. 0 = A. */
  paperAnswer?: number;
  sheetAnswer?: number;
  /** `severalAnswers`: every letter the sheet accepts. */
  letters?: number[];
  /** A written question some of whose parts got nothing (0-based). */
  missingParts?: Array<{ part: number }>;
  /** Where the sheet's marks and the paper's printed marks differ. */
  marks?: Array<{ part?: number; subPart?: number; sheet: number; paper: number }>;
}

export interface AnswerMatchResult {
  pins: Pin[];
  report: AnswerMatch[];
  /** Sheet sections matched to this paper. */
  sections: number[];
  /** Entries in sections that fit this paper nowhere: for another paper, never extra here. */
  unused: number[];
}

/** What `matchAnswers` reads of a sheet: any source (a reader, OCR, AI) can make it. */
export type AnswerSource = Pick<AnswerSheet, 'entries' | 'sections'>;

interface NumberRun {
  questions: number[];
  /** Section keys of the headings inside it ("A", "B") and the paper's own ("P1"). */
  keys: Set<string>;
}

/** The paper's numbering runs: a run ends where numbering goes back (Part B 1.). */
export function numberRuns(analysis: Analysis): NumberRun[] {
  const { questions, headings } = analysis.outline;
  const out: NumberRun[] = [];
  let prev: OutQuestion | undefined;
  const keysBetween = (from: number, to: number) =>
    headings.filter((h) => h > from && h < to).map((h) => sectionKey(analysis.lines[h].text)).filter((x): x is string => !!x);
  questions.forEach((q, k) => {
    const restart = prev?.number !== undefined && q.number !== undefined && q.number <= prev.number;
    if (!out.length || restart) out.push({ questions: [], keys: new Set() });
    const run = out[out.length - 1];
    for (const key of keysBetween(prev?.start ?? -1, q.start)) run.keys.add(key);
    run.questions.push(k);
    prev = q;
  });
  return out;
}

/** Sheet section → paper run, in order: names first (Part B ↔ Part B, Paper 2 ↔ Paper 2), then numbers of the right kind. */
function alignSections(analysis: Analysis, sheet: AnswerSource, runs: NumberRun[]): Map<number, number> {
  const out = new Map<number, number>();
  const paperKeys = new Set(runs.flatMap((r) => [...r.keys]).filter((k) => k.startsWith('P')));
  let from = 0;
  for (const section of sheet.sections) {
    const entries = sheet.entries.filter((e) => e.sectionIndex === section.index);
    if (!entries.length) continue;
    // "Paper 2" on the sheet against a paper titled "Paper 1": not this one.
    if (section.paper && paperKeys.size && !paperKeys.has(section.paper)) continue;
    let best = -1;
    let bestScore = 0;
    for (let p = from; p < runs.length; p++) {
      const qs = runs[p].questions.map((k) => analysis.outline.questions[k]);
      const key = section.key && !section.key.startsWith('P') ? section.key : undefined;
      const letters = [...runs[p].keys].filter((k) => !k.startsWith('P'));
      let score = key && letters.length ? (letters.includes(key) ? 1000 : -1000) : 0;
      for (const e of entries) {
        const q = qs.find((x) => x.number === e.question);
        if (!q) continue;
        const keyEntry = e.letter !== undefined && !e.points?.length;
        score += keyEntry === (q.kind === 'mc') ? 2 : -1;
      }
      if (score > bestScore) {
        best = p;
        bestScore = score;
      }
    }
    if (best >= 0) {
      out.set(section.index, best);
      from = best;
    }
  }
  return out;
}

const labelKey = (label: string | undefined) => (label ? fold(label).toLowerCase().replace(/[^a-z0-9]/g, '') : '');
const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };

/** A part (or sub-part) by its label, else by position when the paper's items have none. */
function findItem(items: readonly OutSubPart[], label: string, roman: boolean): number {
  const byLabel = items.findIndex((it) => labelKey(it.label) === label);
  if (byLabel >= 0) return byLabel;
  const n = roman ? ROMAN[label] : label.length === 1 ? label.charCodeAt(0) - 96 : undefined;
  return n !== undefined && items[n - 1] && !items[n - 1].label ? n - 1 : -1;
}

/**
 * Match an answer file to a solved paper. Give the pins to `analyseLines` before the
 * teacher's own fixes, so a later click on an option wins. Re-run on the new analysis
 * to refresh the report; the pins are keyed by line like every other pin.
 */
export function matchAnswers(analysis: Analysis, sheet: AnswerSource): AnswerMatchResult {
  const { questions } = analysis.outline;
  const runs = numberRuns(analysis);
  const aligned = alignSections(analysis, sheet, runs);
  const rows: AnswerMatch[] = questions.map((_, k) => ({ status: 'missing', question: k, entries: [] }));
  const extra: AnswerMatch[] = [];
  const unused: number[] = [];
  const pins: Pin[] = [];
  const taken = new Set<string>();
  const covered = new Map<number, Set<number>>();

  const problem = (row: AnswerMatch, entry: number, detail: MatchDetail, more: Partial<AnswerMatch> = {}) => {
    row.entries.push(entry);
    if (row.status !== 'mismatch') Object.assign(row, { status: 'mismatch', detail, ...more });
  };
  const ok = (row: AnswerMatch, entry: number) => {
    row.entries.push(entry);
    if (row.status === 'missing') row.status = 'matched';
  };

  sheet.entries.forEach((e, n) => {
    const p = aligned.get(e.sectionIndex);
    if (p === undefined) {
      unused.push(n);
      return;
    }
    const pool = runs[p].questions;
    const numbered = pool.some((k) => questions[k].number !== undefined);
    const k = numbered ? pool.find((x) => questions[x].number === e.question) : pool[e.question - 1];
    if (k === undefined) {
      extra.push({ status: 'extra', entries: [n], detail: 'noSuchQuestion' });
      return;
    }
    const q = questions[k];
    const row = rows[k];
    const target = `${k}:${e.part ?? ''}:${e.subPart ?? ''}`;
    if (taken.has(target)) {
      extra.push({ status: 'extra', question: k, entries: [n], detail: 'duplicate' });
      return;
    }
    const notes = e.notes?.length ? { notes: e.notes.map((x) => x.runs) } : {};
    const points = (e.points ?? []).map(({ runs: r, marks }) => ({ runs: r, ...(marks !== undefined ? { marks } : {}) }));

    if (q.kind === 'mc') {
      if (e.part) {
        extra.push({ status: 'extra', question: k, entries: [n], detail: 'noSuchPart' });
        return;
      }
      if (e.letter === undefined) return problem(row, n, 'noLetter');
      if (e.letter >= q.options.length) return problem(row, n, 'letterOutOfRange', { sheetAnswer: e.letter });
      taken.add(target);
      pins.push({ kind: 'answer', line: q.start, index: e.letter, from: 'sheet' });
      if (points.length || e.notes?.length) pins.push({ kind: 'scheme', line: q.start, points, ...notes });
      ok(row, n);
      if (q.answer && q.answer.from !== 'sheet' && q.answer.index !== e.letter) {
        Object.assign(row, { status: 'conflict', paperAnswer: q.answer.index, sheetAnswer: e.letter });
      } else if (e.letters) Object.assign(row, { detail: 'severalAnswers', letters: e.letters });
      return;
    }

    if (!points.length && !e.notes?.length) return problem(row, n, e.letter !== undefined ? 'notWritten' : 'noLetter');
    let part: number | undefined;
    let subPart: number | undefined;
    if (e.part) {
      part = findItem(q.parts as readonly OutPart[], e.part, false);
      if (part >= 0 && e.subPart) subPart = findItem(q.parts[part].subParts, e.subPart, true);
      if (part < 0 || subPart === -1) {
        extra.push({ status: 'extra', question: k, entries: [n], detail: 'noSuchPart' });
        return;
      }
    } else if (q.parts.length === 1) part = 0;
    else if (q.parts.length > 1) return problem(row, n, 'needsPart');
    taken.add(target);
    pins.push({
      kind: 'scheme',
      line: q.start,
      ...(part !== undefined ? { part } : {}),
      ...(subPart !== undefined ? { subPart } : {}),
      points,
      ...notes,
      ...(e.each !== undefined ? { each: e.each } : {}),
      ...(e.max !== undefined ? { max: e.max } : {}),
    });
    ok(row, n);
    if (part !== undefined) covered.set(k, (covered.get(k) ?? new Set()).add(part));
    const leaf = part === undefined ? q : subPart === undefined ? q.parts[part] : q.parts[part].subParts[subPart];
    if (leaf.marks !== undefined && e.marks !== undefined && leaf.marks !== e.marks) {
      (row.marks ??= []).push({ ...(part !== undefined ? { part } : {}), ...(subPart !== undefined ? { subPart } : {}), sheet: e.marks, paper: leaf.marks });
    }
  });

  for (const [k, set] of covered) {
    const missing = questions[k].parts.flatMap((_, p) => (set.has(p) ? [] : [{ part: p }]));
    if (missing.length) rows[k].missingParts = missing;
  }
  const sections = [...new Set(aligned.keys())];
  return { pins, report: [...rows, ...extra], sections, unused };
}
