import { requireQuestionType } from '@/registry';
import type { QuestionHealthFacts } from '@/registry/types';
import { documentShape, type DocumentShape } from './documentShape';
import { questionMarks, sectionMarksById } from './marks';
import { computeNumbering, toUpperLetter } from './numbering';
import { plain } from './text';
import type { BiText, LanguageMode, LayoutElement, Worksheet } from './types';

/**
 * The pre-print paper check (IDEAS A2): facts and findings about a document, derived on
 * demand and never stored. Per-type facts come from the registry's `healthFacts`, so
 * this module names no question type (`registry.test.ts` greps it).
 */

export type HealthSeverity = 'ok' | 'note' | 'warn';

export type HealthFindingId =
  | 'emptyQuestion'
  | 'unkeyed'
  | 'blankOptions'
  | 'duplicateOptions'
  | 'letterBalance'
  | 'letterRun'
  | 'untranslated'
  | 'unanswered'
  | 'unmarked'
  | 'timeMismatch';

/** A question as the printed paper numbers it. */
export interface QuestionRef {
  questionId: string;
  number: number;
  /** "Q3", or "Section B Q3" when numbering restarts and the bare number is ambiguous. */
  label: string;
}

export interface HealthFinding {
  id: HealthFindingId;
  severity: Exclude<HealthSeverity, 'ok'>;
  message: string;
  questions?: QuestionRef[];
  /** The answer letter a balance or run finding is about. */
  letter?: string;
}

export interface SectionTotal {
  /** Undefined for the questions before the first section marker. */
  sectionId?: string;
  label: string;
  questions: number;
  marks: number;
}

export interface LetterBalance {
  /** A, B, C, D (and E… when any keyed item offers more options). */
  letters: string[];
  counts: Record<string, number>;
  /** Keyed, non-empty lettered-choice items — what the balance is computed over. */
  keyed: number;
  /** Whether the paper is large enough for the balance rule to judge it. */
  judged: boolean;
}

export interface PaperHealthReport {
  shape: DocumentShape;
  questionCount: number;
  totalMarks: number;
  sections: SectionTotal[];
  letters: LetterBalance;
  /** Estimated working time in minutes (see `estimateMinutes`). */
  minutes: number;
  /** Time allowed as printed on the cover or masthead, when it can be read. */
  statedMinutes?: number;
  /** One-sided bilingual strings, by the registry's own count. */
  untranslated: number;
  /** Warnings first, then notes. */
  findings: HealthFinding[];
  severity: HealthSeverity;
}

/** Below this many keyed MCQs the letter balance is noise and is not judged. */
export const BALANCE_MIN_ITEMS = 8;
/** A letter is flagged above 1.6× or below 0.4× its fair share — 40% / 10% on A–D. */
export const BALANCE_OVER = 1.6;
export const BALANCE_UNDER = 0.4;
/** This many consecutive questions keyed to one letter is a pattern a candidate can see. */
export const LETTER_RUN_MIN = 4;

/** HKDSE Paper 1: 45 MCQs in 60 minutes. */
export const MINUTES_PER_CHOICE_ITEM = 60 / 45;
/**
 * Written marks: a Paper 2 mock runs at the DSE Paper 2 pace (150 minutes for about
 * 100 marks); any other document at the classroom rule of thumb of 1.2 minutes a mark.
 */
export const MINUTES_PER_MARK: Record<DocumentShape, number> = {
  classroom: 1.2,
  paper1: 1.2,
  lqWorksheet: 1.2,
  lqMock: 1.5,
};
/** A stated time is worth mentioning only when the estimate is a quarter (and 10 min) off. */
export const TIME_MISMATCH_RATIO = 0.25;
export const TIME_MISMATCH_MIN = 10;

interface Entry {
  ref: QuestionRef;
  marks: number;
  facts: QuestionHealthFacts;
}

export function checkPaper(
  worksheet: Worksheet,
  mode: { language?: LanguageMode } = {},
): PaperHealthReport {
  const shape = documentShape(worksheet);
  const plan = computeNumbering(worksheet);
  const sectionsById = new Map(
    worksheet.layout
      .filter((element): element is Extract<LayoutElement, { kind: 'section' }> => element.kind === 'section')
      .map((element) => [element.id, element]),
  );

  const numbers = plan.questions.map((entry) => entry.number);
  const ambiguous = new Set(numbers).size !== numbers.length;
  let untranslated = 0;
  const entries: Entry[] = plan.questions.map(({ question, number, sectionId }) => {
    const definition = requireQuestionType(question);
    untranslated += definition.countMissingTranslations?.(question) ?? 0;
    const section = sectionId ? sectionsById.get(sectionId) : undefined;
    const prefix = ambiguous && section ? `${sectionShortName(section.text)} ` : '';
    return {
      ref: { questionId: question.id, number, label: `${prefix}Q${number}` },
      marks: questionMarks(question),
      facts: definition.healthFacts?.(question) ?? { empty: false },
    };
  });

  const findings: HealthFinding[] = [];
  const flag = (
    id: HealthFindingId,
    severity: HealthFinding['severity'],
    matching: Entry[],
    message: (count: number) => string,
  ) => {
    if (matching.length === 0) return;
    findings.push({ id, severity, message: message(matching.length), questions: matching.map((e) => e.ref) });
  };

  const live = entries.filter((e) => !e.facts.empty);
  const choice = live.filter((e) => e.facts.answerLetter !== undefined);

  flag('emptyQuestion', 'warn', entries.filter((e) => e.facts.empty), (n) =>
    `${plural(n, 'question is', 'questions are')} empty and will print as a bare number.`,
  );
  flag('unkeyed', 'warn', choice.filter((e) => e.facts.answerLetter === null), (n) =>
    `${plural(n, 'MCQ has', 'MCQs have')} no correct answer set.`,
  );
  flag('blankOptions', 'warn', live.filter((e) => (e.facts.blankOptions ?? 0) > 0), (n) =>
    `${plural(n, 'MCQ has', 'MCQs have')} a blank option.`,
  );
  flag('duplicateOptions', 'warn', live.filter((e) => e.facts.duplicateOptions), (n) =>
    `${plural(n, 'MCQ has', 'MCQs have')} two options with the same wording.`,
  );

  const letters = letterBalance(choice);
  findings.push(...balanceFindings(choice, letters), ...runFindings(entries));

  if (mode.language === 'zh' || mode.language === 'bilingual') {
    if (untranslated > 0) {
      findings.push({
        id: 'untranslated',
        severity: 'warn',
        message: `${plural(untranslated, 'string is', 'strings are')} written in one language only.`,
      });
    }
  }

  flag('unanswered', 'note', live.filter((e) => (e.facts.unansweredParts ?? 0) > 0), (n) =>
    `${plural(n, 'question has', 'questions have')} parts with no teacher answer.`,
  );
  flag('unmarked', 'note', live.filter((e) => e.marks === 0), (n) =>
    `${plural(n, 'question carries', 'questions carry')} no marks.`,
  );

  const minutes = estimateMinutes(entries, shape);
  const statedMinutes = statedTimeAllowed(worksheet);
  if (statedMinutes !== undefined && minutes > 0) {
    const gap = Math.abs(minutes - statedMinutes);
    if (gap > TIME_MISMATCH_MIN && gap > statedMinutes * TIME_MISMATCH_RATIO) {
      findings.push({
        id: 'timeMismatch',
        severity: 'note',
        message: `The estimate (~${minutes} min) is ${minutes > statedMinutes ? 'longer' : 'shorter'} than the ${statedMinutes} min allowed.`,
      });
    }
  }

  // Warnings first; `sort` is stable, so each group keeps the order above.
  findings.sort((a, b) => rank(b.severity) - rank(a.severity));

  return {
    shape,
    questionCount: entries.length,
    totalMarks: entries.reduce((sum, e) => sum + e.marks, 0),
    sections: sectionTotals(worksheet, plan.questions, sectionsById),
    letters,
    minutes,
    statedMinutes,
    untranslated,
    findings,
    severity: findings.some((f) => f.severity === 'warn')
      ? 'warn'
      : findings.length > 0
        ? 'note'
        : 'ok',
  };
}

export function countWarnings(report: PaperHealthReport): number {
  return report.findings.filter((finding) => finding.severity === 'warn').length;
}

const rank = (severity: HealthSeverity) => (severity === 'warn' ? 2 : severity === 'note' ? 1 : 0);

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "Section A: Multiple Choice" → "Section A"; the label a restarted number needs. */
function sectionShortName(text: BiText): string {
  const side = plain(text.en).trim() || plain(text.zh).trim();
  return side.split(/[:：]/)[0].trim() || 'Section';
}

function letterBalance(choice: Entry[]): LetterBalance {
  const keyed = choice.filter((e) => e.facts.answerLetter);
  const width = Math.max(4, ...keyed.map((e) => e.facts.optionCount ?? 4));
  const letters = Array.from({ length: width }, (_, index) => toUpperLetter(index));
  const counts: Record<string, number> = Object.fromEntries(letters.map((letter) => [letter, 0]));
  for (const e of keyed) counts[e.facts.answerLetter!] = (counts[e.facts.answerLetter!] ?? 0) + 1;
  return { letters, counts, keyed: keyed.length, judged: keyed.length >= BALANCE_MIN_ITEMS };
}

/**
 * Each letter's fair share is what a random key would give it — one over each item's own
 * option count — so a paper mixing four- and five-option items is judged on its own mix.
 */
function balanceFindings(choice: Entry[], balance: LetterBalance): HealthFinding[] {
  if (!balance.judged) return [];
  const keyed = choice.filter((e) => e.facts.answerLetter);
  const n = keyed.length;
  const findings: HealthFinding[] = [];
  balance.letters.forEach((letter, index) => {
    const fair = keyed.reduce((sum, e) => sum + (index < (e.facts.optionCount ?? 4) ? 1 / (e.facts.optionCount ?? 4) : 0), 0);
    if (fair === 0) return;
    const count = balance.counts[letter];
    const share = `${Math.round((count / n) * 100)}%`;
    const fairShare = `${Math.round((fair / n) * 100)}%`;
    if (count > fair * BALANCE_OVER) {
      findings.push({
        id: 'letterBalance',
        severity: 'warn',
        letter,
        message: `${letter} is the answer to ${count} of ${n} MCQs (${share}); a fair key gives each letter about ${fairShare}.`,
        questions: keyed.filter((e) => e.facts.answerLetter === letter).map((e) => e.ref),
      });
    } else if (count < fair * BALANCE_UNDER) {
      findings.push({
        id: 'letterBalance',
        severity: 'warn',
        letter,
        message: `${letter} is the answer to only ${count} of ${n} MCQs (${share}); a fair key gives each letter about ${fairShare}.`,
      });
    }
  });
  return findings;
}

/** Runs are counted over consecutive printed questions; anything unkeyed breaks one. */
function runFindings(entries: Entry[]): HealthFinding[] {
  const findings: HealthFinding[] = [];
  let run: Entry[] = [];
  const close = () => {
    if (run.length >= LETTER_RUN_MIN) {
      findings.push({
        id: 'letterRun',
        severity: 'warn',
        letter: run[0].facts.answerLetter!,
        message: `${run.length} questions in a row have answer ${run[0].facts.answerLetter}.`,
        questions: run.map((e) => e.ref),
      });
    }
    run = [];
  };
  for (const e of entries) {
    const letter = e.facts.empty ? undefined : e.facts.answerLetter;
    if (!letter) {
      close();
      continue;
    }
    if (run.length > 0 && run[0].facts.answerLetter !== letter) close();
    run.push(e);
  }
  close();
  return findings;
}

/**
 * Lettered-choice items at the Paper 1 rate; every other question's marks at the
 * shape's minutes-per-mark. Rounded to the minute under half an hour, else to 5.
 */
function estimateMinutes(entries: Entry[], shape: DocumentShape): number {
  let raw = 0;
  for (const e of entries) {
    if (e.facts.empty) continue;
    raw += e.facts.answerLetter !== undefined ? MINUTES_PER_CHOICE_ITEM : e.marks * MINUTES_PER_MARK[shape];
  }
  return raw < 30 ? Math.round(raw) : Math.round(raw / 5) * 5;
}

const ZH_DIGITS: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

/** Arabic, or Chinese numerals up to 99 ("三十", "四十五", "十五"). */
function zhNumber(text: string): number | undefined {
  if (/^\d+$/.test(text)) return Number(text);
  const [tens, units] = text.includes('十') ? text.split('十') : ['', text];
  const t = text.includes('十') ? (tens ? ZH_DIGITS[tens] : 1) : 0;
  const u = units ? ZH_DIGITS[units] : 0;
  return t === undefined || u === undefined ? undefined : t * 10 + u;
}

/**
 * Minutes in one line: "(2 hours 30 minutes)", "Time allowed: 60 minutes", or
 * "兩小時三十分完卷". Chinese minutes count only after 小時 or as 分鐘, so a clock time
 * ("十時十五分") is never read as a duration.
 */
export function parseDuration(line: string): number | undefined {
  const hours = line.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i);
  const mins = line.match(/(\d+)\s*(?:minutes?|mins?)\b/i);
  if (hours || mins) return Math.round(Number(hours?.[1] ?? 0) * 60 + Number(mins?.[1] ?? 0));
  const num = '([零一二兩三四五六七八九十\\d]+)';
  const zhHours = line.match(new RegExp(`${num}\\s*小時(?:${num}分)?`));
  if (zhHours) {
    const h = zhNumber(zhHours[1]);
    const m = zhHours[2] ? zhNumber(zhHours[2]) : 0;
    if (h !== undefined && m !== undefined) return h * 60 + m;
  }
  const zhMins = line.match(new RegExp(`${num}\\s*分鐘`));
  const m = zhMins ? zhNumber(zhMins[1]) : undefined;
  return m;
}

/** The first duration printed on the cover's identity lines or in the masthead. */
function statedTimeAllowed(worksheet: Worksheet): number | undefined {
  const texts: BiText[] = [
    ...(worksheet.cover?.headLines ?? []).map((line) => line.text),
    ...(worksheet.bands ?? []).flatMap((band) =>
      [...(band.zones?.left ?? []), ...(band.zones?.center ?? []), ...(band.zones?.right ?? [])].flatMap(
        (field) => (field.kind === 'text' ? [field.text] : []),
      ),
    ),
  ];
  for (const text of texts) {
    const minutes = parseDuration(plain(text.en)) ?? parseDuration(plain(text.zh));
    if (minutes) return minutes;
  }
  return undefined;
}

function sectionTotals(
  worksheet: Worksheet,
  numbered: ReturnType<typeof computeNumbering>['questions'],
  sectionsById: Map<string, Extract<LayoutElement, { kind: 'section' }>>,
): SectionTotal[] {
  if (sectionsById.size === 0) return [];
  const marks = sectionMarksById(worksheet);
  const counts = new Map<string | undefined, number>();
  for (const { sectionId } of numbered) counts.set(sectionId, (counts.get(sectionId) ?? 0) + 1);
  const totals: SectionTotal[] = [];
  for (const [sectionId, total] of marks) {
    const questions = counts.get(sectionId) ?? 0;
    // The run before the first marker is a section only if it holds something.
    if (sectionId === undefined && questions === 0) continue;
    const element = sectionId ? sectionsById.get(sectionId) : undefined;
    const label = element ? sectionShortName(element.text) : 'Before the first section';
    totals.push({ sectionId, label, questions, marks: total });
  }
  return totals;
}
