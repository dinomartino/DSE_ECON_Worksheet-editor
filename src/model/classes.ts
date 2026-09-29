import type { Worksheet } from './types';

/**
 * Who sat a paper, and when: `Worksheet.classes` and `Worksheet.satOn`. Never printed.
 * A paper with no classes is a draft: the question bank lists where its questions live
 * but never counts it as a use. Cohorts are derived from these (`src/library/cohort.ts`).
 */

/** Lower-cased, spaces removed: "5 a" and "5A" name one class. */
export const classKey = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, '');

/** A calendar date as `satOn` stores it: `YYYY-MM-DD`. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * The date a paper counts from: when it was sat, else when it was made. Never `updatedAt`:
 * tagging or correcting an old paper must not make it look used this year.
 */
export function dateOfUse(worksheet: Pick<Worksheet, 'satOn' | 'createdAt'>): string {
  return isIsoDate(worksheet.satOn) ? worksheet.satOn : worksheet.createdAt;
}

const SCHOOL_YEAR = /^(\d{4})\s*[-/–]\s*(\d{2}|\d{4})$/;

/**
 * Class names typed as one line: "5A, 5B", "5A 5B", "5A/5B". A school year among them
 * ("2025-26") is not a class: it is returned apart, as the year it ends in (2026).
 */
export function parseClasses(text: string): { classes: string[]; schoolYearEnd?: number } {
  const classes: string[] = [];
  const seen = new Set<string>();
  let yearEnd: number | undefined;
  for (const token of text.split(/[,，、;；/\s]+/)) {
    const name = token.trim();
    if (!name) continue;
    const year = SCHOOL_YEAR.exec(name);
    if (year) {
      const start = Number(year[1]);
      let end = Number(year[2]);
      if (year[2].length === 2) {
        end += start - (start % 100);
        if (end <= start) end += 100;
      }
      if (end === start + 1) {
        yearEnd = end;
        continue;
      }
    }
    const key = classKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    classes.push(name);
  }
  return { classes, ...(yearEnd !== undefined ? { schoolYearEnd: yearEnd } : {}) };
}

/** A stored `classes` value, cleaned: trimmed, blanks, repeats and non-strings dropped. Empty → undefined. */
export function cleanClasses(classes: unknown): string[] | undefined {
  if (!Array.isArray(classes)) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of classes) {
    if (typeof raw !== 'string') continue;
    const name = raw.trim();
    const key = classKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Develop builds before release stored one free string, `classTag` ("5A 2025-26"). It
 * never shipped, so this is a tolerant read, not a migration: fold it into `classes`, and
 * when it named a school year the document was not made in, date it to that year's first
 * day. A document that already has `classes` keeps `classTag` untouched (it then rides in
 * `__unknown`, so nothing is lost). Pure; returns `doc` itself when there is nothing to fold.
 */
export function foldLegacyClassTag<T extends Record<string, unknown>>(doc: T): T {
  if (typeof doc.classTag !== 'string' || doc.classes !== undefined) return doc;
  const { classTag, ...rest } = doc;
  const { classes, schoolYearEnd } = parseClasses(classTag);
  const out: Record<string, unknown> = { ...rest };
  if (classes.length > 0) out.classes = classes;
  if (schoolYearEnd !== undefined && out.satOn === undefined) {
    const createdIn = typeof doc.createdAt === 'string' ? schoolYearOf(doc.createdAt) : undefined;
    if (createdIn !== schoolYearEnd) out.satOn = `${schoolYearEnd - 1}-09-01`;
  }
  return out as T;
}

/** The year a September-to-August school year ends in, for an ISO date or timestamp. */
function schoolYearOf(date: string): number | undefined {
  const match = /^(\d{4})-(\d{2})/.exec(date);
  if (!match) return undefined;
  return Number(match[2]) >= 9 ? Number(match[1]) + 1 : Number(match[1]);
}
