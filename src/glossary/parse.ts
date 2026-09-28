/**
 * The verbatim EDB JSON → `GlossaryEntry[]`, keeping the ranking the source defines:
 * `；` ranks (first preferred), ` / ` equal variants, `(1)…，(2)…` separate senses.
 * Pure; about a millisecond for 1350 entries.
 */
import type { GlossaryEntry, GlossarySense } from './types';
import {
  DISPLAY_OVERRIDES,
  EN_ALIASES,
  EN_OVERRIDES,
  GENERIC_TIER,
  PIN_SENSES,
  PREFERRED_OVERRIDES,
  ZH_OVERRIDES,
} from './overrides';

export interface RawGlossary {
  meta: { source: string; publisher: string; year: number; subject?: string; total_entries: number };
  entries: Record<string, string>;
}

const QUALIFIERS: Readonly<Record<string, NonNullable<GlossarySense['note']>>> = {
  浮動匯率制下之: 'floatingRate',
  固定匯率制下之: 'fixedRate',
  指量或值: 'quantityOrValue',
};

export function displayZh(s: string): string {
  let out = s;
  for (const [from, to] of Object.entries(DISPLAY_OVERRIDES)) out = out.split(from).join(to);
  return out;
}

/** One `；` rank → its equal variants, with a usage qualifier lifted out. */
function parseRank(rank: string): { variants: string[]; note?: GlossarySense['note'] } {
  let note: GlossarySense['note'];
  const variants: string[] = [];
  for (const part of rank.split(' / ')) {
    let v = part.replace(/\(\s*([^()]*?)\s*\)/g, (whole, inner: string) => {
      const q = QUALIFIERS[inner];
      if (!q) return whole;
      note = q;
      return '';
    });
    v = v.replace(/\s+/g, '');
    // 通貨膨脹缺口（通脹缺口）: the full-width short form is an equal variant.
    const alias = v.match(/^(.+?)（([^（）]+)）$/);
    if (alias) variants.push(displayZh(alias[1]), displayZh(alias[2]));
    else if (v) variants.push(displayZh(v));
  }
  return { variants, note };
}

export function parseSenses(key: string, raw: string): GlossarySense[] {
  const override = ZH_OVERRIDES[key];
  if (override) return override.map((s) => ({ ...s, ranks: s.ranks.map((r) => [...r]) }));
  const value = raw.normalize('NFC');
  // Split only a value that starts with (1), and only before "(n)": 大市場，小政府 stays whole.
  const senses = /^\(\s*1\s*\)/.test(value)
    ? value.split(/，(?=\(\s*\d\s*\))/).map((s) => s.replace(/^\(\s*\d\s*\)\s*/, ''))
    : [value];
  return senses.map((sense) => {
    let note: GlossarySense['note'];
    const ranks: string[][] = [];
    for (const rank of sense.split('；')) {
      const parsed = parseRank(rank);
      note ??= parsed.note;
      if (parsed.variants.length) ranks.push([...new Set(parsed.variants)]);
    }
    return note ? { ranks, note } : { ranks };
  });
}

const SKIP_INITIAL = /^(of|and|on|the)$/i;

/**
 * Matchable English forms. An abbreviation replaces only the capitalised run that spells
 * it, so `real Gross Domestic Product (GDP)` gives "real GDP", not a second bare "GDP".
 */
export function parseEnForms(key: string): { forms: string[]; abbreviation?: string } {
  const abbreviation = key.match(/\(([A-Z]{2,})\)/)?.[1];
  const override = EN_OVERRIDES[key];
  const forms = new Set<string>();
  if (override) {
    for (const f of override) forms.add(f);
  } else {
    const k = key.replace(/’/g, "'").replace(/^the /i, '');
    const ab = k.match(/^(.*?)\s*\(([A-Z]{2,})\)\s*(.*)$/);
    if (ab) {
      const [, full, abbr, rest] = ab;
      const tail = rest ? ` ${rest}` : '';
      forms.add(`${full}${tail}`);
      const words = full.split(' ');
      let initials = '';
      let i = words.length;
      while (i > 0 && initials.length < abbr.length) {
        const w = words[--i];
        if (!SKIP_INITIAL.test(w)) initials = w[0].toUpperCase() + initials;
      }
      if (initials !== abbr) i = 0;
      forms.add(`${[...words.slice(0, i), abbr].join(' ')}${tail}`);
    } else {
      forms.add(k);
    }
  }
  for (const alias of EN_ALIASES[key] ?? []) forms.add(alias);
  return abbreviation ? { forms: [...forms], abbreviation } : { forms: [...forms] };
}

/** First-listed rendering of a sense's rank 1. */
function rank1(sense: GlossarySense): string {
  return sense.ranks[0]?.[0] ?? '';
}

export function parseGlossary(raw: RawGlossary): GlossaryEntry[] {
  return Object.entries(raw.entries).map(([en, value], id) => {
    const senses = parseSenses(en, value);
    const { forms, abbreviation } = parseEnForms(en);
    const pinSenses = PIN_SENSES[en];
    const entry: GlossaryEntry = {
      id,
      en,
      enForms: forms,
      senses,
      tier: GENERIC_TIER.has(en) ? 'generic' : 'core',
      raw: value,
      preferred: PREFERRED_OVERRIDES[en] ?? rank1(senses[pinSenses?.[0] ?? 0]),
    };
    if (abbreviation) entry.abbreviation = abbreviation;
    if (pinSenses) entry.pinSenses = [...pinSenses];
    return entry;
  });
}
