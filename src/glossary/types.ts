/**
 * The EDB Economics glossary (2020) as the app reads it: ranked renderings per sense,
 * matchers both ways, the compliance check, prompt pins and the deterministic auto-fix.
 */
import type { RichText } from '@/model/types';
import type { Direction } from '@/translate/types';

export interface GlossarySense {
  /** '；' order = preference (ranks[0] first); inner arrays are ' / '-equal variants. NFC, no spaces. */
  ranks: string[][];
  /** Usage qualifier stripped from the value. */
  note?: 'floatingRate' | 'fixedRate' | 'quantityOrValue';
}
export interface GlossaryEntry {
  /** Source key order. */
  id: number;
  /** Key verbatim, for display. */
  en: string;
  /** Matchable surface forms ("real GDP", "real Gross Domestic Product"). */
  enForms: string[];
  /** "GDP". */
  abbreviation?: string;
  /** 1, or 2–4 for the numbered entries. */
  senses: GlossarySense[];
  /** Senses the prompt pins (GDP family: [0], HK usage). */
  pinSenses?: number[];
  tier: 'core' | 'generic';
  /** Value verbatim (tooltip / provenance). */
  raw: string;
  /** Rank-1 display of the first pinned sense, after DISPLAY_OVERRIDES (住戶) — or the
   *  entry's PREFERRED_OVERRIDES rendering when it has one. */
  preferred: string;
}

/**
 * The only exception to "rank 1 is preferred": glossary entry key (verbatim, as in the
 * data) → the rendering to pin, prompt, prefer in the check and suggest in Check terms.
 * The import family prefers 進口 over the rank-1 入口; every listed variant still passes.
 * The table itself (`PREFERRED_OVERRIDES`) lives in `src/glossary/overrides.ts`.
 */
export type PreferredOverrides = Readonly<Record<string, string>>;

export type TermState = 'ok' | 'ok-abbr' | 'not-preferred' | 'near' | 'missing' | 'info';
export type TermSeverity = 'none' | 'info' | 'note' | 'warn';
export interface TermCheck {
  entryId: number;
  /** Display key. */
  en: string;
  /** Span in the plain source. */
  source: { text: string; start: number; end: number };
  state: TermState;
  severity: TermSeverity;
  /** The preferred display ('/'-equals joined): rank 1, or the entry's PREFERRED_OVERRIDES form. */
  expected: string;
  /** Original-string offsets. */
  found?: { text: string; start: number; end: number; rank: number };
  /** A deterministic replacement on the target's plain text. */
  fix?: { start: number; end: number; to: string; kind: 'deny' | 'lowerRank'; denyKind?: 'wrong' | 'variant' };
  /** The output uses a form that means something else (coverage rule or a reversal deny form). */
  conflict?: { form: string; meansEn: string };
  /** Multi-sense core entry: a wrong sense can't be told. */
  senseAmbiguous?: boolean;
}
export interface PinnedTerm { entryId: number; line: string; tier: 'core' | 'generic' }
export interface GlossaryMatchEn { entryId: number; start: number; end: number; viaAbbreviation: boolean }
export interface Glossary {
  meta: { source: string; publisher: string; year: number; entries: number };
  entries: readonly GlossaryEntry[];
  /** Leftmost-longest. */
  matchEn(text: string): GlossaryMatchEn[];
  /** All overlaps. */
  matchEnAll(text: string): GlossaryMatchEn[];
  /** Leftmost-longest, original offsets. */
  matchZh(text: string): Array<{ entryIds: number[]; start: number; end: number }>;
  checkEnToZh(sourceEn: string, outputZh: string): TermCheck[];
  checkZhToEn(sourceZh: string, outputEn: string): TermCheck[];
  pin(texts: readonly string[], direction: Direction, opts?: { denyHints?: boolean; limit?: number }): PinnedTerm[];
  /** Non-reversal deny forms of entries present in `sourceEn`, replaced in `zh` (never inside vertAlign runs). */
  autoFix(sourceEn: string, zh: RichText): { runs: RichText; fixes: Array<{ from: string; to: string; entryId: number }> };
}
