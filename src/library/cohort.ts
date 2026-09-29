import { classKey } from '@/model/classes';

/**
 * Who sat a paper, as the bank's anti-repeat filters compare it. Derived, never stored: a
 * document stores only `classes` and `satOn`. A class whose name starts with a form number
 * ("5A", "S5A", "中五甲") on a known date belongs to a DSE cohort — the year its students
 * sit the DSE — so 4A in 2024-25 and 5A in 2025-26 are the same students.
 */

/** One class on one paper: its name, its compare key, and its DSE year when derivable. */
export interface ClassRef {
  name: string;
  /** Lower-cased, spaces removed: "5 a" = "5A". */
  key: string;
  cohort?: number;
}

/** What "not used with …" protects: a cohort, a class by name, or both (a paper's own class). */
export interface ClassTarget {
  cohort?: number;
  key?: string;
}

const CHINESE_FORM: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

/** Secondary form 1–6 a class name starts with: "5A", "S5A", "S.5 A", "F.4", "中五甲"; else undefined. */
export function formOf(name: string): number | undefined {
  const text = name.trim();
  const latin = /^(?:[sf]\.?\s*)?([1-6])(?!\d)/i.exec(text);
  if (latin) return Number(latin[1]);
  const chinese = /^中([一二三四五六])/.exec(text);
  return chinese ? CHINESE_FORM[chinese[1]] : undefined;
}

/**
 * The calendar year a Hong Kong school year ends in (September to August): 2025-11-03 →
 * 2026, 2026-08-31 → 2026, 2026-09-01 → 2027. Reads the date as written (YYYY-MM…).
 */
export function schoolYearEnd(date: string): number | undefined {
  const match = /^(\d{4})-(\d{2})/.exec(date);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return undefined;
  return month >= 9 ? year + 1 : year;
}

/** "25-26" for a school year ending in 2026. */
export function schoolYearLabel(endYear: number): string {
  const two = (year: number) => String(year % 100).padStart(2, '0');
  return `${two(endYear - 1)}-${two(endYear)}`;
}

/** The DSE year of `name`'s students on `date`: school year end + (6 − form). */
export function cohortOf(name: string, date: string): number | undefined {
  const form = formOf(name);
  const end = schoolYearEnd(date);
  return form === undefined || end === undefined ? undefined : end + (6 - form);
}

/** A paper's classes on its use date. No classes (a draft) → none. */
export function classRefs(classes: readonly string[] | undefined, date: string): ClassRef[] {
  const out: ClassRef[] = [];
  const seen = new Set<string>();
  for (const raw of classes ?? []) {
    const name = raw.trim();
    const key = classKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const cohort = cohortOf(name, date);
    out.push({ name, key, ...(cohort !== undefined ? { cohort } : {}) });
  }
  return out;
}

/** Same students: by cohort when both sides have one, else by class name. */
export function sameStudents(ref: ClassRef, target: ClassTarget): boolean {
  if (ref.cohort !== undefined && target.cohort !== undefined) return ref.cohort === target.cohort;
  return target.key !== undefined && ref.key === target.key;
}

/** Whether any of `refs` are any of `targets`' students. */
export function anySameStudents(refs: readonly ClassRef[], targets: readonly ClassTarget[]): boolean {
  return refs.some((ref) => targets.some((target) => sameStudents(ref, target)));
}

/** A cohort's name: "DSE 2027". */
export const cohortLabel = (cohort: number): string => `DSE ${cohort}`;

/** "5A, 5B (DSE 2027)": a paper's classes as the editor's filter names them. */
export function classesLabel(refs: readonly ClassRef[]): string {
  const names = refs.map((ref) => ref.name).join(', ');
  const cohorts = [...new Set(refs.flatMap((ref) => (ref.cohort !== undefined ? [ref.cohort] : [])))];
  return cohorts.length === 0 ? names : `${names} (${cohorts.map(cohortLabel).join(', ')})`;
}
