/**
 * The compliance check (EN source → ZH output, and the weaker reverse) and the deterministic
 * deny-list auto-fix. Rank numbers in `found.rank` are 1-based; 0 means a deny form, which
 * is no glossary rendering at all.
 */
import type { RichText } from '@/model/types';
import { plain, replaceRichTextRange } from '@/model/text';
import type { GlossaryEntry, TermCheck, TermSeverity, TermState } from './types';
import type { DenyRow } from './deny';
import { PREFERRED_OVERRIDES } from './overrides';
import { foldZh, unfoldSpan, type FoldedZh } from './fold';
import type { EnHit, EnMatcher } from './matchEn';
import { variantForms, type FoldedHit, type ZhMatcher } from './matchZh';

export interface Variant {
  display: string;
  /** Folded forms: the variant and its 的-less alias. */
  forms: string[];
  sense: number;
  /** 1-based. */
  rank: number;
  /** Rank 1 of a pinned sense, or the entry's PREFERRED_OVERRIDES rendering. */
  preferred: boolean;
}

/** Everything the check, the pins and the auto-fix read; built once per load. */
export interface GlossaryIndex {
  entries: readonly GlossaryEntry[];
  en: EnMatcher;
  zh: ZhMatcher;
  variants: ReadonlyMap<number, readonly Variant[]>;
  deny: ReadonlyMap<number, readonly DenyRow[]>;
}

export function indexVariants(entry: GlossaryEntry): Variant[] {
  const override = PREFERRED_OVERRIDES[entry.en];
  const out: Variant[] = [];
  entry.senses.forEach((sense, s) => {
    sense.ranks.forEach((rank, r) => {
      for (const display of rank) {
        const pinned = entry.pinSenses ? entry.pinSenses.includes(s) : true;
        const preferred = override ? display === override : r === 0 && pinned;
        out.push({ display, forms: variantForms(display), sense: s, rank: r + 1, preferred });
      }
    });
  });
  return out;
}

/** The preferred display, '/'-equals joined: what a teacher is told to write. */
export function expectedFor(entry: GlossaryEntry): string {
  const override = PREFERRED_OVERRIDES[entry.en];
  if (override) return override;
  return entry.senses[entry.pinSenses?.[0] ?? 0].ranks[0].join(' / ');
}

interface Occurrence {
  from: number;
  to: number;
}

function occurrences(haystack: string, needle: string): Occurrence[] {
  const out: Occurrence[] = [];
  if (!needle) return out;
  for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + 1)) {
    out.push({ from: i, to: i + needle.length });
  }
  return out;
}

const inside = (a: Occurrence, b: Occurrence) => a.from >= b.from && a.to <= b.to;
const overlaps = (a: Occurrence, b: Occurrence) => a.from < b.to && a.to > b.from;

/** Hits not strictly inside a longer hit, one per entry: the outer term is reported once. */
function outermost(hits: readonly EnHit[]): EnHit[] {
  const out: EnHit[] = [];
  const seen = new Set<number>();
  for (const h of hits) {
    const nested = hits.some((o) => o.start <= h.start && o.end >= h.end && o.end - o.start > h.end - h.start);
    if (nested || seen.has(h.entryId)) continue;
    seen.add(h.entryId);
    out.push(h);
  }
  return out;
}

/**
 * The coverage rule: the leftmost-longest span over an occurrence must belong to this entry
 * or to a term the source also has, so 低彈性需求 never satisfies "elastic demand". Returns
 * the offending span, or null when the occurrence stands.
 */
function coverageConflict(
  occ: Occurrence,
  segments: readonly FoldedHit[],
  allowed: (id: number) => boolean,
): FoldedHit | null {
  const covering = segments.find((s) => s.from <= occ.from && s.to >= occ.to);
  if (covering) return covering.entryIds.some(allowed) ? null : covering;
  const straddling = segments.filter(
    (s) => overlaps({ from: s.from, to: s.to }, occ) && (s.from < occ.from || s.to > occ.to),
  );
  return straddling.find((s) => !s.entryIds.some(allowed)) ?? null;
}

const dropDeXing = (s: string) => s.replace(/[的性]/g, '');

/** `needle`'s characters in order inside a window of its length + 3. */
function subsequenceNear(text: string, needle: string): boolean {
  if (needle.length < 2) return false;
  for (let p = text.indexOf(needle[0]); p >= 0; p = text.indexOf(needle[0], p + 1)) {
    const end = Math.min(text.length, p + needle.length + 3);
    let k = 1;
    for (let q = p + 1; q < end && k < needle.length; q++) if (text[q] === needle[k]) k++;
    if (k === needle.length) return true;
  }
  return false;
}

/**
 * No variant, but something close: the shortest variant as a loose subsequence, a match
 * once 的/性 are dropped (實證陳述 ≈ 實證性陳述), or the head of a 的-phrase variant
 * (搭便車問題 ≈ 搭便車的人).
 */
function isNear(text: string, variants: readonly Variant[]): boolean {
  const bareText = dropDeXing(text);
  let shortest = '';
  for (const v of variants) {
    const folded = v.forms[0];
    if (!shortest || folded.length < shortest.length) shortest = folded;
    const bare = dropDeXing(folded);
    if (bare.length >= 2 && bareText.includes(bare)) return true;
    const de = folded.indexOf('的');
    if (de >= 3 && text.includes(folded.slice(0, de))) return true;
  }
  return subsequenceNear(text, shortest);
}

const isMultiWord = (entry: GlossaryEntry) => /\s/.test(entry.enForms[0] ?? entry.en);

function severityFor(entry: GlossaryEntry, state: TermState, check: Partial<TermCheck>): TermSeverity {
  if (entry.tier === 'generic') return 'info';
  if (state === 'ok' || state === 'ok-abbr') return check.senseAmbiguous ? 'note' : 'none';
  if (state === 'not-preferred' || state === 'near') return 'note';
  if (check.conflict || check.fix?.kind === 'deny' || isMultiWord(entry)) return 'warn';
  return 'note';
}
