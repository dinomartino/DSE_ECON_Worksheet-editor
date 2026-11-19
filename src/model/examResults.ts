import type { BiText, ExamResults, LanguageMode, RichText } from './types';
import { isBiTextEmpty, plain } from './text';

/**
 * After the exam (k-0471, GitHub #6): how the candidates did, entered by the teacher and
 * printed in the answer key only, as HKEAA's answer keys and examination reports print it.
 * `Worksheet.examResults` holds each MC question's % correct (by question id, so it follows
 * the question when the paper is reordered) and two comments, on the MC and on the
 * structured questions. Nothing on the paper reads it.
 *
 * - **Stores nothing when empty.** An untouched paper carries no field at all, so its key
 *   prints exactly as before.
 * - **Read tolerantly.** A % that is not a number from 0 to 100, or a comment that is not
 *   text, is dropped on load; unknown keys (a newer build's) are kept. Nothing here can make
 *   a document fail to open.
 * - **Belongs to one sitting.** A duplicate (a document or a whole set) leaves it behind, as
 *   it leaves the classes and the date sat: nobody has sat the copy yet.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isRichText = (value: unknown): value is RichText =>
  Array.isArray(value) && value.every((run) => isRecord(run) && typeof run.text === 'string');

const isBiText = (value: unknown): value is BiText =>
  isRecord(value) && isRichText(value.en) && isRichText(value.zh);

/** A stored % this build prints: a finite number from 0 to 100. */
export const isPercent = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;

const COMMENT_KEYS = ['mcComments', 'sqComments'] as const;
export type ExamComment = (typeof COMMENT_KEYS)[number];

/**
 * The stored field as saved, minus what cannot be read: not an object → nothing; a % that
 * is not a number from 0 to 100 → that entry dropped; a comment that is not text, or is
 * empty → dropped. Unknown keys are kept. Empty → undefined.
 */
export function normalizeExamResults(raw: unknown): ExamResults | undefined {
  if (!isRecord(raw)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'mcPercent') {
      if (!isRecord(value)) continue;
      const kept = Object.fromEntries(Object.entries(value).filter(([, percent]) => isPercent(percent)));
      if (Object.keys(kept).length > 0) out.mcPercent = kept;
    } else if ((COMMENT_KEYS as readonly string[]).includes(key)) {
      if (isBiText(value) && !isBiTextEmpty(value)) out[key] = value;
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? (out as ExamResults) : undefined;
}

/** `worksheet` carrying `results`, the field removed when there is nothing in them. */
export function withExamResults<T extends { examResults?: ExamResults }>(
  worksheet: T,
  results: ExamResults | undefined,
): T {
  const { examResults: _previous, ...rest } = worksheet;
  void _previous;
  const next = normalizeExamResults(results);
  return (next ? { ...rest, examResults: next } : rest) as T;
}

/** The % correct entered for one MC question, if any. */
export function mcPercentOf(results: ExamResults | undefined, questionId: string): number | undefined {
  const value = results?.mcPercent?.[questionId];
  return isPercent(value) ? value : undefined;
}

/** "65", "65.5": at most one decimal, no trailing zero. */
export function formatPercent(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/**
 * A typed % as stored: empty → undefined (no result), a number from 0 to 100 (an
 * optional "%" after it) → that number to one decimal, anything else → 'invalid'.
 */
export function parsePercent(text: string): number | undefined | 'invalid' {
  const trimmed = text.trim().replace(/[%％]$/, '').trim();
  if (trimmed === '') return undefined;
  if (!/^\d{1,3}(\.\d+)?$/.test(trimmed)) return 'invalid';
  const value = Math.round(Number(trimmed) * 10) / 10;
  return isPercent(value) ? value : 'invalid';
}

/**
 * A comment as the key prints it in `language`: its paragraphs, each on one side. A side
 * left empty borrows the other in a one-language key (a teacher who typed only 中文 still
 * gets it in an English key); a bilingual key prints English then 中文, each as typed.
 */
export function commentParagraphs(comment: BiText | undefined, language: LanguageMode): BiText[] {
  if (!comment) return [];
  const lines = (text: RichText) =>
    plain(text)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  const en = lines(comment.en);
  const zh = lines(comment.zh);
  const one = (line: string): BiText => ({ en: [{ text: line }], zh: [{ text: line }] });
  if (language === 'en') return (en.length > 0 ? en : zh).map(one);
  if (language === 'zh') return (zh.length > 0 ? zh : en).map(one);
  return [
    ...en.map((line): BiText => ({ en: [{ text: line }], zh: [] })),
    ...zh.map((line): BiText => ({ en: [], zh: [{ text: line }] })),
  ];
}

/** Whether `results` holds anything to print. */
export function hasExamResults(results: ExamResults | undefined): boolean {
  const read = normalizeExamResults(results);
  return read?.mcPercent !== undefined || COMMENT_KEYS.some((key) => read?.[key] !== undefined);
}
