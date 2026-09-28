/**
 * Test-only: a small Glossary over ~20 entries that follows the §D.7 states closely enough
 * to drive the engine (pins, checks, deny auto-fix, coverage conflicts). The real one is
 * P-GLOSS's; integration re-runs the engine tests against it. Never imported by app code.
 */
import type { Glossary, GlossaryEntry, GlossaryMatchEn, PinnedTerm, TermCheck } from '@/glossary/types';
import { plain, replaceRichTextRange } from '@/model/text';
import type { RichText } from '@/model/types';

interface Row {
  en: string;
  forms?: string[];
  abbreviation?: string;
  ranks: string[][];
  preferred?: string;
  tier?: 'core' | 'generic';
  deny?: Array<{ form: string; fix?: string; reversal?: string; kind?: 'wrong' | 'variant' }>;
}

const ROWS: Row[] = [
  { en: 'deadweight loss', ranks: [['效率損失'], ['淨損失'], ['無謂損失']] },
  { en: 'import', ranks: [['入口'], ['進口']], preferred: '進口' },
  { en: 'import quota', ranks: [['入口配額'], ['進口配額']], preferred: '進口配額' },
  { en: 'export', ranks: [['出口']] },
  { en: 'elastic demand', ranks: [['彈性需求']], deny: [{ form: '富彈性需求', fix: '彈性需求' }, { form: '缺乏彈性', reversal: 'inelastic demand' }] },
  { en: 'inelastic demand', ranks: [['低彈性需求']], deny: [{ form: '缺乏彈性需求', fix: '低彈性需求' }] },
  { en: 'demand', ranks: [['需求']] },
  { en: 'supply', ranks: [['供應']], deny: [{ form: '供給', fix: '供應' }] },
  { en: 'consumer surplus', ranks: [['消費者盈餘']], deny: [{ form: '消費者剩餘', fix: '消費者盈餘' }] },
  { en: 'market failure', ranks: [['市場失效']], deny: [{ form: '市場失靈', fix: '市場失效' }] },
  { en: 'price level', ranks: [['物價水平']], deny: [{ form: '價格水平', fix: '物價水平' }] },
  { en: 'per unit tax', forms: ['per unit tax', 'per-unit tax'], ranks: [['從量稅']] },
  { en: 'perfect competition', ranks: [['完全競爭']] },
  { en: 'quantity demanded', ranks: [['需求量']] },
  { en: 'comparative advantage', ranks: [['比較優勢']], deny: [{ form: '比較利益', fix: '比較優勢' }] },
  { en: 'Gross Domestic Product', forms: ['Gross Domestic Product'], abbreviation: 'GDP', ranks: [['本地生產總值']] },
  { en: 'real GDP', forms: ['real GDP'], ranks: [['實質本地生產總值']], deny: [{ form: '實際本地生產總值', fix: '實質本地生產總值' }] },
  { en: 'tax incidence', ranks: [['稅收承擔']], deny: [{ form: '稅項歸宿', fix: '稅收承擔', kind: 'variant' }] },
  { en: 'price', ranks: [['價格', '物價']], tier: 'generic' },
  { en: 'tax', ranks: [['稅', '稅項']], tier: 'generic' },
  { en: 'firm', ranks: [['廠商']] },
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function fakeGlossary(): Glossary {
  const entries: GlossaryEntry[] = ROWS.map((row, id) => ({
    id,
    en: row.en,
    enForms: row.forms ?? [row.en],
    ...(row.abbreviation ? { abbreviation: row.abbreviation } : {}),
    senses: [{ ranks: row.ranks }],
    tier: row.tier ?? 'core',
    raw: row.ranks.map((r) => r.join(' / ')).join('；'),
    preferred: row.preferred ?? row.ranks[0].join(' / '),
  }));
  const preferredOf = (id: number) => ROWS[id].preferred ?? ROWS[id].ranks[0][0];

  function matchEnAll(text: string): GlossaryMatchEn[] {
    const hits: GlossaryMatchEn[] = [];
    entries.forEach((entry) => {
      for (const form of entry.enForms) {
        for (const m of text.matchAll(new RegExp(`(?<![A-Za-z-])${escapeRe(form)}s?(?![A-Za-z])`, 'gi'))) {
          hits.push({ entryId: entry.id, start: m.index!, end: m.index! + m[0].length, viaAbbreviation: false });
        }
      }
      if (entry.abbreviation) {
        for (const m of text.matchAll(new RegExp(`(?<![A-Za-z])${entry.abbreviation}s?(?![A-Za-z])`, 'g'))) {
          if (!hits.some((h) => h.start <= m.index! && h.end >= m.index! + m[0].length && h.entryId !== entry.id)) {
            hits.push({ entryId: entry.id, start: m.index!, end: m.index! + m[0].length, viaAbbreviation: true });
          }
        }
      }
    });
    return hits.sort((a, b) => a.start - b.start || b.end - a.end);
  }
  const matchEn = (text: string) => leftmostLongest(matchEnAll(text));

  const variants = entries.flatMap((entry) => entry.senses[0].ranks.flat().map((form) => ({ form, id: entry.id })));
  function matchZh(text: string) {
    const all = variants.flatMap(({ form, id }) =>
      [...text.matchAll(new RegExp(escapeRe(form), 'g'))].map((m) => ({ entryId: id, start: m.index!, end: m.index! + form.length })),
    );
    return leftmostLongest(all).map((hit) => ({
      entryIds: all.filter((h) => h.start === hit.start && h.end === hit.end).map((h) => h.entryId),
      start: hit.start,
      end: hit.end,
    }));
  }

  return {
    meta: { source: 'fake', publisher: 'test', year: 2020, entries: entries.length },
    entries,
    matchEn,
    matchEnAll,
    matchZh,
    checkEnToZh: (source, output) => checkEnToZh(entries, preferredOf, matchEnAll, matchZh, source, output),
    checkZhToEn: (source, output) =>
      matchZh(source).flatMap((hit) => {
        const entry = entries[hit.entryIds[0]];
        if (entry.tier === 'generic' || matchEnAll(output).some((h) => hit.entryIds.includes(h.entryId))) return [];
        return [termCheck(entry, { text: source.slice(hit.start, hit.end), start: hit.start, end: hit.end }, 'missing', 'warn', entry.en)];
      }),
    pin: (texts, direction, opts) => pin(entries, preferredOf, matchEn, matchZh, texts, direction, opts),
    autoFix: (source, zh) => autoFix(entries, matchEnAll, source, zh),
  };
}

function leftmostLongest<T extends { start: number; end: number }>(hits: T[]): T[] {
  const sorted = [...hits].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: T[] = [];
  for (const hit of sorted) if (!out.length || hit.start >= out[out.length - 1].end) out.push(hit);
  return out;
}

function termCheck(
  entry: GlossaryEntry,
  source: TermCheck['source'],
  state: TermCheck['state'],
  severity: TermCheck['severity'],
  expected: string,
  extra: Partial<TermCheck> = {},
): TermCheck {
  return { entryId: entry.id, en: entry.en, source, state, severity, expected, ...extra };
}

type MatchZh = (text: string) => Array<{ entryIds: number[]; start: number; end: number }>;

function checkEnToZh(
  entries: GlossaryEntry[],
  preferredOf: (id: number) => string,
  matchEnAll: (text: string) => GlossaryMatchEn[],
  matchZh: MatchZh,
  sourceEn: string,
  outputZh: string,
): TermCheck[] {
  const hits = matchEnAll(sourceEn);
  const inSource = new Set(hits.map((h) => h.entryId));
  const spans = matchZh(outputZh);
  const covered = (start: number, end: number) =>
    spans.find((s) => s.start <= start && s.end >= end)?.entryIds ?? [];
  // A hit inside an enclosing hit is reported by the enclosing one.
  const outer = hits.filter((h) => !hits.some((o) => o !== h && o.start <= h.start && o.end >= h.end && o.end - o.start > h.end - h.start));
  return outer.flatMap((hit): TermCheck[] => {
    const entry = entries[hit.entryId];
    const row = ROWS[hit.entryId];
    const source = { text: sourceEn.slice(hit.start, hit.end), start: hit.start, end: hit.end };
    const preferred = preferredOf(entry.id);
    if (entry.tier === 'generic') return [termCheck(entry, source, 'info', 'info', preferred)];
    if (hit.viaAbbreviation && entry.abbreviation && outputZh.includes(entry.abbreviation)) return [];
    let conflict: TermCheck['conflict'];
    const forms = entry.senses[0].ranks.flatMap((rank, r) => rank.map((form) => ({ form, rank: r })));
    for (const { form, rank } of forms.sort((a, b) => Number(b.form === preferred) - Number(a.form === preferred))) {
      const at = outputZh.indexOf(form);
      if (at < 0) continue;
      const owner = covered(at, at + form.length);
      if (owner.length && !owner.some((id) => id === entry.id || inSource.has(id))) {
        const span = spans.find((s) => s.start <= at && s.end >= at + form.length)!;
        conflict = { form: outputZh.slice(span.start, span.end), meansEn: entries[owner[0]].en };
        continue;
      }
      const found = { text: form, start: at, end: at + form.length, rank };
      if (form === preferred) return [];
      return [termCheck(entry, source, 'not-preferred', 'note', preferred, {
        found, fix: { start: at, end: at + form.length, to: preferred, kind: 'lowerRank' } })];
    }
    for (const deny of row.deny ?? []) {
      const at = outputZh.indexOf(deny.form);
      if (at < 0) continue;
      const found = { text: deny.form, start: at, end: at + deny.form.length, rank: -1 };
      if (deny.reversal) return [termCheck(entry, source, 'missing', 'warn', preferred, { found, conflict: { form: deny.form, meansEn: deny.reversal } })];
      return [termCheck(entry, source, 'missing', 'warn', preferred, {
        found, fix: { start: at, end: at + deny.form.length, to: deny.fix ?? preferred, kind: 'deny', denyKind: deny.kind ?? 'wrong' } })];
    }
    if (conflict) return [termCheck(entry, source, 'missing', 'warn', preferred, { conflict })];
    return [termCheck(entry, source, 'missing', entry.en.includes(' ') ? 'warn' : 'note', preferred)];
  });
}

function pin(
  entries: GlossaryEntry[],
  preferredOf: (id: number) => string,
  matchEn: (text: string) => GlossaryMatchEn[],
  matchZh: MatchZh,
  texts: readonly string[],
  direction: 'toZh' | 'toEn',
  opts: { denyHints?: boolean; limit?: number } = {},
): PinnedTerm[] {
  const seen = new Set<number>();
  const out: PinnedTerm[] = [];
  for (const text of texts) {
    const ids = direction === 'toZh' ? matchEn(text).map((h) => h.entryId) : matchZh(text).map((h) => h.entryIds[0]);
    for (const id of ids) {
      const entry = entries[id];
      if (seen.has(id) || (direction === 'toEn' && entry.tier === 'generic')) continue;
      seen.add(id);
      const denies = (ROWS[id].deny ?? []).filter((d) => !d.reversal).slice(0, 2).map((d) => d.form);
      const line =
        direction === 'toEn'
          ? `${preferredOf(id)} → ${entry.en}`
          : entry.tier === 'generic'
            ? `[only if economic sense] ${entry.en} → ${entry.senses[0].ranks[0].join(' / ')}`
            : `${entry.en} → ${preferredOf(id)}${opts.denyHints && denies.length ? `   (not ${denies.join(', ')})` : ''}`;
      out.push({ entryId: id, line, tier: entry.tier });
    }
  }
  return out.slice(0, opts.limit ?? 200);
}

function autoFix(
  entries: GlossaryEntry[],
  matchEnAll: (text: string) => GlossaryMatchEn[],
  sourceEn: string,
  zh: RichText,
): { runs: RichText; fixes: Array<{ from: string; to: string; entryId: number }> } {
  const ids = new Set(matchEnAll(sourceEn).map((h) => h.entryId));
  const rows = [...ids].flatMap((id) => (ROWS[id].deny ?? []).filter((d) => !d.reversal).map((d) => ({ ...d, id })));
  rows.sort((a, b) => b.form.length - a.form.length);
  let runs = zh;
  const fixes: Array<{ from: string; to: string; entryId: number }> = [];
  for (const row of rows) {
    const to = row.fix ?? entries[row.id].preferred;
    let at = plain(runs).indexOf(row.form);
    while (at >= 0) {
      runs = replaceRichTextRange(runs, at, at + row.form.length, to);
      fixes.push({ from: row.form, to, entryId: row.id });
      at = plain(runs).indexOf(row.form, at + to.length);
    }
  }
  return { runs, fixes };
}
