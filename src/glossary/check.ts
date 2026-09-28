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

/** Strictly inside a longer glossary term (公共財 in 公共財產): correct text, never a deny form. */
const hosted = (o: Occurrence, hosts: readonly FoldedHit[]) =>
  hosts.some((h) => inside(o, h) && h.to - h.from > o.to - o.from);

/** The occurrence has nothing folded away inside it (a space, a line break, a blank), so replacing it drops nothing. */
const contiguous = (f: FoldedZh, o: Occurrence) => f.map[o.to - 1] - f.map[o.from] === o.to - o.from - 1;

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

const STOPWORDS = /^(of|the|a|an|and|to|in|on|for|by)$/;

/**
 * Does the source hold every content word of `entry`, allowing a reshaped word
 * ("unitary elastic" for elasticity)? Then a covering term like 需求彈性 is the source
 * reworded, not a different concept. A shared prefix of 6 letters counts; inelastic never
 * matches elastic, so the reversal stays a conflict.
 */
export function reshapedInSource(entry: GlossaryEntry, sourceWords: readonly string[]): boolean {
  const words = (entry.enForms[0] ?? entry.en).toLowerCase().split(/[^a-z]+/).filter((w) => w && !STOPWORDS.test(w));
  return (
    words.length > 0 &&
    words.every((w) =>
      sourceWords.some((s) => s === w || (s.length >= 6 && w.length >= 6 && s.slice(0, 6) === w.slice(0, 6))),
    )
  );
}

/**
 * The coverage rule: the leftmost-longest span over an occurrence must belong to this entry
 * or to a term the source also has (or rewords), so 低彈性需求 never satisfies "elastic
 * demand". Returns the offending span, or null when the occurrence stands.
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
  if (check.conflict || check.found?.rank === 0 || isMultiWord(entry)) return 'warn';
  return 'note';
}

/** `all` longest first, keeping those that overlap none already kept; in text order. */
function longestFirst<T extends Occurrence>(all: readonly T[]): T[] {
  const taken: T[] = [];
  for (const o of [...all].sort((a, b) => b.to - b.from - (a.to - a.from) || a.from - b.from)) {
    if (!taken.some((t) => overlaps(t, o))) taken.push(o);
  }
  return taken.sort((a, b) => a.from - b.from);
}

/**
 * Folded occurrences of the rows' forms, longest form first, never overlapping one another.
 * A non-reversal form hosted by a longer glossary term is that term's text, not a slip.
 */
function denyOccurrences(
  text: string,
  rows: readonly DenyRow[],
  hosts: readonly FoldedHit[],
): Array<Occurrence & { row: DenyRow }> {
  const all = rows.flatMap((row) =>
    row.forms.flatMap((form) => occurrences(text, foldZh(form).folded).map((o) => ({ ...o, row }))),
  );
  return longestFirst(all.filter((o) => o.row.reversal || !hosted(o, hosts)));
}

/**
 * The first rule of §D.7 that applies to one source term. A lower rank or a deny form gives
 * one check per occurrence in the output, each with its own fix.
 */
function checkTerm(
  index: GlossaryIndex,
  hit: EnHit,
  sourceEn: string,
  outputZh: string,
  out: FoldedZh,
  segments: readonly FoldedHit[],
  hosts: readonly FoldedHit[],
  inSource: (id: number) => boolean,
): TermCheck[] {
  const entry = index.entries[hit.entryId];
  const T = out.folded;
  const base = {
    entryId: entry.id,
    en: entry.en,
    source: { text: sourceEn.slice(hit.start, hit.end), start: hit.start, end: hit.end },
    expected: expectedFor(entry),
  };
  const result = (state: TermState, extra: Partial<TermCheck> = {}): TermCheck => ({
    ...base,
    state,
    severity: severityFor(entry, state, extra),
    ...extra,
  });
  /** An occurrence in the teacher's own string. */
  const original = (o: Occurrence, rank: number) => {
    const { start, end } = unfoldSpan(out, o.from, o.to);
    return { text: outputZh.slice(start, end), start, end, rank };
  };
  /** A replacement of `o`, unless replacing it would also drop what the fold skipped. */
  const fixAt = (o: Occurrence, to: string, kind: 'deny' | 'lowerRank', denyKind?: DenyRow['kind']) => {
    if (!contiguous(out, o)) return {};
    const { start, end } = unfoldSpan(out, o.from, o.to);
    return { fix: { start, end, to, kind, ...(denyKind ? { denyKind } : {}) } };
  };

  if (hit.viaAbbreviation && entry.abbreviation && T.includes(entry.abbreviation)) return [result('ok-abbr')];

  const denied = denyOccurrences(T, index.deny.get(entry.id) ?? [], hosts);
  const allowed = (id: number) => id === entry.id || inSource(id);
  const variants = index.variants.get(entry.id) ?? [];
  const standing: Array<Occurrence & { v: Variant }> = [];
  let conflict: { occ: Occurrence; seg: FoldedHit } | undefined;
  for (const v of variants) {
    for (const form of v.forms) {
      for (const occ of occurrences(T, form)) {
        // Part of a wrong form (富彈性需求) or touched by a reversal (缺乏彈性需求): not a rendering.
        if (denied.some((d) => overlaps(occ, d))) continue;
        const seg = coverageConflict(occ, segments, allowed);
        if (seg) conflict ??= { occ, seg };
        else standing.push({ ...occ, v });
      }
    }
  }

  const best = standing.find((o) => o.v.preferred);
  if (best) {
    // A multi-sense entry met on a later sense: the check can't tell a wrong sense (公司 for firm).
    const ambiguous =
      entry.senses.length > 1 && !entry.pinSenses && !standing.some((o) => o.v.preferred && o.v.sense === 0);
    return [result('ok', { found: original(best, best.v.rank), ...(ambiguous ? { senseAmbiguous: true } : {}) })];
  }
  if (standing.length) {
    return longestFirst(standing).map((o) => {
      const pinned = !entry.pinSenses || entry.pinSenses.includes(o.v.sense);
      const to = PREFERRED_OVERRIDES[entry.en] ?? (pinned ? entry.senses[o.v.sense].ranks[0][0] : entry.preferred);
      return result('not-preferred', { found: original(o, o.v.rank), ...fixAt(o, to, 'lowerRank') });
    });
  }
  const wrong = denied.filter((d) => !d.row.reversal);
  if (wrong.length) {
    return wrong.map((d) =>
      result('missing', { found: original(d, 0), ...fixAt(d, d.row.fix ?? entry.preferred, 'deny', d.row.kind) }),
    );
  }
  if (denied.length) {
    const at = original(denied[0], 0);
    return [result('missing', { found: at, conflict: { form: at.text, meansEn: denied[0].row.means ?? '' } })];
  }
  if (conflict) {
    const form = original(conflict.seg, 0).text;
    const meansEn = index.entries[conflict.seg.entryIds[0]].en;
    return [result('missing', { conflict: { form, meansEn } })];
  }
  if (isNear(T, variants)) return [result('near')];
  return [result('missing')];
}

/**
 * Fixes never overlap, so Check terms can apply them all. A fix inside a longer one is that
 * one's job (總供給 → 總供應 also mends supply's 供給), so its check goes; a fix that only
 * partly overlaps a kept one loses its fix and keeps its check.
 */
function separateFixes(checks: readonly TermCheck[]): TermCheck[] {
  type Fix = NonNullable<TermCheck['fix']>;
  const span = (f: Fix) => ({ from: f.start, to: f.end });
  const kept: Fix[] = [];
  const drop = new Set<TermCheck>();
  const strip = new Set<TermCheck>();
  const withFix = checks.filter((c) => c.fix).sort((a, b) => {
    const [x, y] = [a.fix!, b.fix!];
    return y.end - y.start - (x.end - x.start) || x.start - y.start;
  });
  for (const c of withFix) {
    const f = span(c.fix!);
    if (kept.some((k) => inside(f, span(k)))) drop.add(c);
    else if (kept.some((k) => overlaps(f, span(k)))) strip.add(c);
    else kept.push(c.fix!);
  }
  return checks
    .filter((c) => !drop.has(c))
    .map((c) => {
      if (!strip.has(c)) return c;
      const { fix: _fix, ...rest } = c;
      return rest;
    });
}

/**
 * Each glossary term in `sourceEn`, checked against `outputZh`. Nested terms are covered by
 * their outer term, so a source term is reported once, or once per offending occurrence.
 * A single-word term may also be covered by a term the source rewords (reshapedInSource);
 * a multi-word term keeps the strict rule, so a second clause can't vouch for 低彈性需求.
 */
export function checkEnToZh(index: GlossaryIndex, sourceEn: string, outputZh: string): TermCheck[] {
  const hits = index.en.matchEnAll(sourceEn);
  if (!hits.length) return [];
  const ids = new Set(hits.map((h) => h.entryId));
  const words = sourceEn.toLowerCase().match(/[a-z]+/g) ?? [];
  const reworded = (id: number) => ids.has(id) || reshapedInSource(index.entries[id], words);
  const out = foldZh(outputZh);
  const segments = index.zh.matchFolded(out.folded);
  const hosts = index.zh.matchFoldedAll(out.folded);
  const checks = outermost(hits).flatMap((h) => {
    const inSource = isMultiWord(index.entries[h.entryId]) ? (id: number) => ids.has(id) : reworded;
    return checkTerm(index, h, sourceEn, outputZh, out, segments, hosts, inSource);
  });
  return separateFixes(checks);
}

/**
 * Chinese hits worth pinning or checking: 3+ characters, or 2 with a core entry. Generic
 * entries never count, and 稅 alone never does. Returns the core candidates, or null.
 */
export function pinnableZh(index: GlossaryIndex, hit: FoldedHit): GlossaryEntry[] | null {
  const core = hit.entryIds.map((id) => index.entries[id]).filter((e) => e.tier === 'core');
  if (!core.length || hit.to - hit.from < 2) return null;
  return core;
}

/**
 * The reverse check (secondary): every pinnable Chinese term in the source must reach one of
 * its English keys in the output. A term with several keys (總收入: aggregate income or
 * total revenue) is info once met; the only warning is a term none of whose keys appear.
 */
export function checkZhToEn(index: GlossaryIndex, sourceZh: string, outputEn: string): TermCheck[] {
  const src = foldZh(sourceZh);
  const inOutput = new Set(index.en.matchEnAll(outputEn).map((h) => h.entryId));
  const seen = new Set<string>();
  const checks: TermCheck[] = [];
  for (const seg of index.zh.matchFolded(src.folded)) {
    const candidates = pinnableZh(index, seg);
    const key = src.folded.slice(seg.from, seg.to);
    if (!candidates || seen.has(key)) continue;
    seen.add(key);
    const { start, end } = unfoldSpan(src, seg.from, seg.to);
    const met = candidates.find((e) => inOutput.has(e.id));
    const entry = met ?? candidates[0];
    const state: TermState = !met ? 'missing' : candidates.length > 1 ? 'info' : 'ok';
    checks.push({
      entryId: entry.id,
      en: entry.en,
      source: { text: sourceZh.slice(start, end), start, end },
      state,
      severity: state === 'missing' ? 'warn' : state === 'info' ? 'info' : 'none',
      expected: candidates.map((e) => e.en).join(' / '),
    });
  }
  return checks;
}

/** Replace `[start, end)` so the new text takes the replaced span's own format. */
function replaceSpan(runs: RichText, start: number, end: number, to: string): RichText {
  // Inserting after the span's first character inherits that character's run; then drop it.
  const inserted = replaceRichTextRange(runs, start + 1, end, to);
  return replaceRichTextRange(inserted, start, start + 1, '');
}

/**
 * Deny forms of terms in `sourceEn`, replaced in `zh` with the glossary rendering: longest
 * form first, right to left. Never inside a sub/superscript run, a longer glossary term
 * (公共財產) or across folded-away text (a space, a line break). The new text takes the
 * format of the replaced span's first character. Unchanged input comes back as the same array.
 */
export function autoFix(
  index: GlossaryIndex,
  sourceEn: string,
  zh: RichText,
): { runs: RichText; fixes: Array<{ from: string; to: string; entryId: number }> } {
  const inSource = new Set(index.en.matchEnAll(sourceEn).map((h) => h.entryId));
  const rows = [...inSource].flatMap((id) => (index.deny.get(id) ?? []).filter((r) => !r.reversal));
  if (!rows.length) return { runs: zh, fixes: [] };
  const text = plain(zh);
  const out = foldZh(text);
  const hosts = index.zh.matchFoldedAll(out.folded);
  const locked: Occurrence[] = [];
  let at = 0;
  for (const run of zh) {
    if (run.vertAlign) locked.push({ from: at, to: at + run.text.length });
    at += run.text.length;
  }
  const byKey = new Map(index.entries.map((e) => [e.en, e]));
  const fixes: Array<{ from: string; to: string; entryId: number; start: number; end: number }> = [];
  for (const d of denyOccurrences(out.folded, rows, hosts)) {
    if (!contiguous(out, d)) continue;
    const { start, end } = unfoldSpan(out, d.from, d.to);
    if (locked.some((l) => overlaps(l, { from: start, to: end }))) continue;
    const entry = byKey.get(d.row.en);
    if (!entry) continue;
    fixes.push({ from: text.slice(start, end), to: d.row.fix ?? entry.preferred, entryId: entry.id, start, end });
  }
  if (!fixes.length) return { runs: zh, fixes: [] };
  let runs = zh;
  for (const f of [...fixes].reverse()) runs = replaceSpan(runs, f.start, f.end, f.to);
  return { runs, fixes: fixes.map(({ from, to, entryId }) => ({ from, to, entryId })) };
}
