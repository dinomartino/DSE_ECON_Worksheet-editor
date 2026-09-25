import { listQuestionTypes, requireQuestionType } from '@/registry';
import { documentShape, type DocumentShape } from './documentShape';
import { questionMarks } from './marks';
import { plain } from './text';
import type { LanguageMode, PaperTarget, Question, Worksheet } from './types';

/**
 * The paper summary (IDEAS A5): counts per question type, total marks and estimated
 * minutes, each measured against the optional `worksheet.target`. Derived on demand,
 * never stored. Per-type labels and pace come from the registry's `summary` hook, so
 * this module names no question type (`registry.test.ts` greps it).
 */

export type TargetStatus = 'under' | 'met' | 'over';

export interface Measure {
  actual: number;
  target?: number;
  /** Present exactly when `target` is. */
  status?: TargetStatus;
}

export interface TypeCount extends Measure {
  typeId: string;
  label: { en: string; zh: string };
}

export interface PaperSummary {
  shape: DocumentShape;
  /** Registry order; a type appears when the paper holds one or the target asks for one. */
  counts: TypeCount[];
  marks: Measure;
  minutes: Measure;
}

/**
 * Written marks by paper shape. HKDSE Paper 2 is 2 h 30 min for 120 marks (Section A 50
 * + B 70, HKEAA 2024 framework), so a Paper 2 mock runs at 1.25 min a mark; anything
 * else at the classroom rule of thumb of 1.2.
 */
export const MINUTES_PER_MARK: Record<DocumentShape, number> = {
  classroom: 1.2,
  paper1: 1.2,
  lqWorksheet: 1.2,
  lqMock: 150 / 120,
};

/** One question's working time: its type's per-item pace, else its marks at the shape's rate. */
export function questionMinutes(question: Question, shape: DocumentShape): number {
  const perItem = requireQuestionType(question).summary?.minutesPerItem;
  return perItem ?? questionMarks(question) * MINUTES_PER_MARK[shape];
}

/** To the minute under half an hour, else to 5 — an estimate should not look precise. */
export function roundMinutes(raw: number): number {
  return raw < 30 ? Math.round(raw) : Math.round(raw / 5) * 5;
}

/** Empty questions print a bare number and take no time. */
function isEmpty(question: Question): boolean {
  return requireQuestionType(question).healthFacts?.(question).empty ?? false;
}

export function estimateMinutes(questions: Question[], shape: DocumentShape): number {
  return roundMinutes(
    questions.reduce((sum, q) => (isEmpty(q) ? sum : sum + questionMinutes(q, shape)), 0),
  );
}

const positive = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;

/**
 * The stored target with anything unusable dropped (a hand-edited file may hold a string
 * or a zero). `undefined` when nothing is left to measure against.
 */
export function targetOf(worksheet: Pick<Worksheet, 'target'>): PaperTarget | undefined {
  const raw = worksheet.target;
  if (!raw || typeof raw !== 'object') return undefined;
  const counts: Record<string, number> = {};
  if (raw.counts && typeof raw.counts === 'object') {
    for (const [typeId, value] of Object.entries(raw.counts)) {
      const n = positive(value);
      if (n !== undefined) counts[typeId] = n;
    }
  }
  const target: PaperTarget = {
    ...(positive(raw.marks) !== undefined ? { marks: positive(raw.marks) } : {}),
    ...(positive(raw.minutes) !== undefined ? { minutes: positive(raw.minutes) } : {}),
    ...(Object.keys(counts).length > 0 ? { counts } : {}),
  };
  return Object.keys(target).length > 0 ? target : undefined;
}

function measure(actual: number, target: number | undefined): Measure {
  if (target === undefined) return { actual };
  const status: TargetStatus = actual > target ? 'over' : actual < target ? 'under' : 'met';
  return { actual, target, status };
}

/**
 * Counted over the authored questions: shuffled versions reorder options, never items,
 * so every version has the same summary.
 */
export function summarizePaper(worksheet: Worksheet): PaperSummary {
  const shape = documentShape(worksheet);
  const target = targetOf(worksheet);
  const byType = new Map<string, number>();
  for (const question of worksheet.questions) {
    byType.set(question.type, (byType.get(question.type) ?? 0) + 1);
  }

  const counts: TypeCount[] = [];
  for (const definition of listQuestionTypes()) {
    const actual = byType.get(definition.id) ?? 0;
    const wanted = target?.counts?.[definition.id];
    if (actual === 0 && wanted === undefined) continue;
    counts.push({
      typeId: definition.id,
      label: definition.summary?.label ?? {
        en: plain(definition.displayName.en),
        zh: plain(definition.displayName.zh),
      },
      ...measure(actual, wanted),
    });
  }

  return {
    shape,
    counts,
    marks: measure(
      worksheet.questions.reduce((sum, q) => sum + questionMarks(q), 0),
      target?.marks,
    ),
    minutes: measure(estimateMinutes(worksheet.questions, shape), target?.minutes),
  };
}

export type SummaryPartKind = 'count' | 'marks' | 'minutes' | 'pages';

export interface SummaryPart {
  kind: SummaryPartKind;
  text: string;
  status?: TargetStatus;
}

/**
 * The summary as short phrases — "38/45 MCQ", "52 marks", "~61 min", "3 pages" — in the
 * chrome's language: Chinese in `zh` mode, English otherwise. Minutes are left out of an
 * empty paper unless targeted; pages only when the preview has measured them.
 */
export function summaryParts(
  summary: PaperSummary,
  language: LanguageMode,
  pages?: number,
): SummaryPart[] {
  const zh = language === 'zh';
  const ratio = (m: Measure) => (m.target === undefined ? `${m.actual}` : `${m.actual}/${m.target}`);
  const parts: SummaryPart[] = summary.counts.map((count) => ({
    kind: 'count',
    text: zh ? `${count.label.zh} ${ratio(count)}` : `${ratio(count)} ${count.label.en}`,
    status: count.status,
  }));
  const { marks, minutes } = summary;
  parts.push({
    kind: 'marks',
    text: zh
      ? `${ratio(marks)} 分`
      : `${ratio(marks)} ${marks.actual === 1 && marks.target === undefined ? 'mark' : 'marks'}`,
    status: marks.status,
  });
  if (minutes.actual > 0 || minutes.target !== undefined) {
    parts.push({
      kind: 'minutes',
      text: zh ? `約 ${ratio(minutes)} 分鐘` : `~${ratio(minutes)} min`,
      status: minutes.status,
    });
  }
  if (pages !== undefined && pages > 0) {
    parts.push({
      kind: 'pages',
      text: zh ? `${pages} 頁` : `${pages} ${pages === 1 ? 'page' : 'pages'}`,
    });
  }
  return parts;
}

/** The measures that miss their target, split by direction, as English phrases. */
export function targetMisses(summary: PaperSummary): Record<'over' | 'under', string[]> {
  const misses = { over: [] as string[], under: [] as string[] };
  for (const part of summaryParts(summary, 'en')) {
    if (part.status === 'over' || part.status === 'under') misses[part.status].push(part.text);
  }
  return misses;
}
