import { describe, expect, it } from 'vitest';
import raw from './data/edb-economics-2020.json';
import { parseGlossary, type RawGlossary } from './parse';
import { foldZh } from './fold';
import { DENY } from './deny';
import { createGlossary } from './glossary';

const entries = parseGlossary(raw as RawGlossary);
const byKey = new Map(entries.map((e) => [e.en, e]));
const fold = (s: string) => foldZh(s).folded;
const variantsOf = (key: string) => new Set(byKey.get(key)!.senses.flatMap((s) => s.ranks.flat()).map(fold));
/** Folded variant → the keys it renders. */
const owners = new Map<string, string[]>();
for (const e of entries) {
  for (const v of new Set(e.senses.flatMap((s) => s.ranks.flat()).map(fold))) owners.set(v, [...(owners.get(v) ?? []), e.en]);
}

describe('DENY', () => {
  it('names real glossary keys', () => {
    expect(DENY.filter((row) => !byKey.has(row.en)).map((row) => row.en)).toEqual([]);
  });

  it('fixes to a variant of the same entry', () => {
    for (const row of DENY.filter((r) => !r.reversal)) {
      const to = row.fix ?? byKey.get(row.en)!.preferred;
      expect(variantsOf(row.en), `${row.en} → ${to}`).toContain(fold(to));
    }
  });

  it('never denies a rendering of its own entry', () => {
    for (const row of DENY) {
      for (const form of row.forms) expect(variantsOf(row.en).has(fold(form)), `${row.en}: ${form}`).toBe(false);
    }
  });

  it('marks a form that renders another entry as a reversal', () => {
    for (const row of DENY) {
      for (const form of row.forms) {
        const others = (owners.get(fold(form)) ?? []).filter((key) => key !== row.en);
        if (others.length) expect(row.reversal, `${row.en}: ${form} renders ${others.join(', ')}`).toBe(true);
      }
    }
  });

  it('covers every entry that shares a rendering with a row entry', () => {
    // Shares a rendering, but the row's slip is no slip for it: 應課稅入息 is taxable income's.
    const exempt: Record<string, string> = { 'assessable income': 'taxable income', 'aggregate income': 'total revenue' };
    const formsOf = (key: string) =>
      new Set(DENY.filter((r) => r.en === key && !r.reversal).flatMap((r) => r.forms));
    for (const key of new Set(DENY.filter((r) => !r.reversal).map((r) => r.en))) {
      const sharing = [...variantsOf(key)].flatMap((v) => owners.get(v) ?? []).filter((k) => k !== key);
      for (const other of new Set(sharing)) {
        if (exempt[other] === key) continue;
        expect([...formsOf(key)].filter((f) => !formsOf(other).has(f)), `${other} shares a rendering with ${key}`).toEqual([]);
      }
    }
  });

  it('never rewrites a longer glossary term that holds a deny form', () => {
    const g = createGlossary(raw as RawGlossary);
    for (const row of DENY.filter((r) => !r.reversal)) {
      for (const form of row.forms.map(fold)) {
        for (const host of owners.keys()) {
          if (host.length <= form.length || !host.includes(form)) continue;
          expect(g.autoFix(row.en, [{ text: host }]).fixes, `${row.en}: ${form} in ${host}`).toEqual([]);
        }
      }
    }
  });

  it('says what a reversal means, and never fixes it', () => {
    for (const row of DENY.filter((r) => r.reversal)) {
      expect(byKey.has(row.means ?? '')).toBe(true);
      expect(row.fix).toBeUndefined();
    }
  });

  it('cites evidence on every row', () => {
    for (const row of DENY) expect(row.evidence.length).toBeGreaterThan(3);
  });
});
