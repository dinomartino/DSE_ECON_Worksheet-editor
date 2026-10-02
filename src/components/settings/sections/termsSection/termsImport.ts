import type { ChoosableTerm, CustomTerm } from '@/glossary/types';
import type { CsvTermRow } from '@/settings/termsCsv';
import { cleanCustomTerm, cleanRenderings, newTermId } from '@/settings/termData';
import { type Prefs, withOwn } from './termRows';

/**
 * Import CSV, pure: what each row of a file would do to the teacher's terms (the preview),
 * then the result of merging it in or replacing with it. Merge adds what is new and keeps
 * the teacher's own where the file differs; Replace makes the file the whole list.
 */

export type ImportKind = 'add' | 'same' | 'conflict' | 'invalid';
export type InvalidReason = 'noEnglish' | 'noChinese' | 'badChosen' | 'namesEdb' | 'repeat';

export interface ImportItem {
  line: number;
  english: string;
  kind: ImportKind;
  /** An EDB term (its key) or a term of the teacher's. */
  edbKey?: string;
  reason?: InvalidReason;
  /** The EDB key a custom row's form or abbreviation names (`namesEdb`), or the repeated line. */
  detail?: string;
  /** What the row holds, valid parts only. */
  own?: string[];
  chosen?: string;
  related?: boolean;
  term?: CustomTerm;
}

export interface ImportPreview {
  items: ImportItem[];
  counts: Record<ImportKind, number>;
}

/**
 * Classifies every row against the EDB data (`rows`, by key; `edbKeyFor` for English the
 * glossary matches) and the teacher's current terms.
 */
export function previewImport(
  csv: readonly CsvTermRow[],
  rows: ReadonlyMap<string, ChoosableTerm>,
  edbKeyFor: (english: string) => string | undefined,
  current: Prefs,
): ImportPreview {
  const items: ImportItem[] = [];
  const seen = new Map<string, number>();
  const currentByName = new Map<string, [string, CustomTerm]>();
  for (const [id, term] of Object.entries(current.terms)) {
    for (const n of [term.en, ...(term.forms ?? []), ...(term.abbreviation ? [term.abbreviation] : [])]) currentByName.set(n.toLowerCase(), [id, term]);
  }
  for (const row of csv) {
    const base = { line: row.line, english: row.english };
    if (!row.english) {
      items.push({ ...base, kind: 'invalid', reason: 'noEnglish' });
      continue;
    }
    const edbKey = rows.has(row.english) ? row.english : edbKeyFor(row.english);
    const name = (edbKey ?? row.english).toLowerCase();
    if (seen.has(name)) {
      items.push({ ...base, kind: 'invalid', reason: 'repeat', detail: String(seen.get(name)) });
      continue;
    }
    seen.set(name, row.line);

    if (edbKey) {
      const edbRow = rows.get(edbKey)!;
      const listed = new Set(edbRow.groups.flatMap((g) => g.options.filter((o) => !o.own).map((o) => o.display)));
      const own = cleanRenderings(row.chinese).filter((d) => !listed.has(d));
      const chosen = row.chosen.normalize('NFC');
      const options = withOwn(edbRow, [...new Set([...(current.own[edbKey] ?? []), ...own])]).groups.flatMap((g) => g.options);
      if (chosen && !options.some((o) => o.display === chosen)) {
        items.push({ ...base, edbKey, kind: 'invalid', reason: 'badChosen' });
        continue;
      }
      if (!own.length && !chosen) {
        items.push({ ...base, edbKey, kind: row.chinese.length ? 'invalid' : 'same', reason: row.chinese.length ? 'noChinese' : undefined });
        continue;
      }
      const mine = current.own[edbKey] ?? [];
      const newOwn = own.filter((d) => !mine.includes(d));
      const had = current.choices[edbKey];
      const kind: ImportKind =
        chosen && had && had !== chosen ? 'conflict' : !newOwn.length && (!chosen || had === chosen) && (!row.related || current.related[edbKey]) ? 'same' : 'add';
      items.push({ ...base, edbKey, kind, own, ...(chosen ? { chosen } : {}), related: row.related });
      continue;
    }

    const zh = row.chosen && row.chinese.includes(row.chosen) ? [row.chosen, ...row.chinese.filter((z) => z !== row.chosen)] : row.chinese;
    const term = cleanCustomTerm({ en: row.english, forms: row.forms, abbreviation: row.abbreviation || undefined, zh });
    if (!term) {
      items.push({ ...base, kind: 'invalid', reason: zh.length ? 'noEnglish' : 'noChinese' });
      continue;
    }
    const edbName = [...(term.forms ?? []), ...(term.abbreviation ? [term.abbreviation] : [])].find((n) => edbKeyFor(n));
    if (edbName) {
      items.push({ ...base, kind: 'invalid', reason: 'namesEdb', detail: edbKeyFor(edbName) });
      continue;
    }
    const names = [term.en, ...(term.forms ?? []), ...(term.abbreviation ? [term.abbreviation] : [])];
    const existing = names.map((n) => currentByName.get(n.toLowerCase())).find(Boolean);
    const same = existing && sameTerm(existing[1], term);
    items.push({ ...base, kind: existing ? (same ? 'same' : 'conflict') : 'add', term });
  }
  const counts: Record<ImportKind, number> = { add: 0, same: 0, conflict: 0, invalid: 0 };
  for (const item of items) counts[item.kind]++;
  return { items, counts };
}

const sameTerm = (a: CustomTerm, b: CustomTerm) =>
  a.en === b.en &&
  (a.abbreviation ?? '') === (b.abbreviation ?? '') &&
  (a.forms ?? []).join('\n') === (b.forms ?? []).join('\n') &&
  a.zh.join('\n') === b.zh.join('\n');

/**
 * The teacher's terms after an import. Merge: every new row is added, and where the file
 * and the teacher differ the teacher's stays. Replace: the file's valid rows become the
 * whole list (choices, own renderings and terms); invalid rows are skipped either way.
 */
export function applyImport(preview: ImportPreview, current: Prefs, mode: 'merge' | 'replace'): Prefs {
  const next: { choices: Record<string, string>; related: Record<string, true>; own: Record<string, readonly string[]>; terms: Record<string, CustomTerm> } =
    mode === 'replace' ? { choices: {}, related: {}, own: {}, terms: {} } : { choices: { ...current.choices }, related: { ...current.related }, own: { ...current.own }, terms: { ...current.terms } };
  const byName = new Map<string, string>();
  for (const [id, term] of Object.entries(next.terms)) byName.set(term.en.toLowerCase(), id);
  for (const item of preview.items) {
    if (item.kind === 'invalid' || (mode === 'merge' && item.kind === 'same')) continue;
    const keepMine = mode === 'merge' && item.kind === 'conflict';
    if (item.edbKey) {
      const key = item.edbKey;
      const own = [...new Set([...(next.own[key] ?? []), ...(item.own ?? [])])];
      if (own.length) next.own[key] = own;
      if (item.chosen && !(keepMine && next.choices[key])) next.choices[key] = item.chosen;
      if (item.related && next.choices[key]) next.related[key] = true;
      continue;
    }
    if (!item.term || keepMine) continue;
    const id = byName.get(item.term.en.toLowerCase()) ?? newTermId((x) => x in next.terms);
    next.terms[id] = item.term;
    byName.set(item.term.en.toLowerCase(), id);
  }
  return next;
}
