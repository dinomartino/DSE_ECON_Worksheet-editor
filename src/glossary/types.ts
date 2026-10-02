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
   *  entry's PREFERRED_OVERRIDES rendering, or the teacher's choice (`choice`). */
  preferred: string;
  /** Settings → Translation terms: the teacher's choice in force for this entry, set only
   *  on a glossary built with preferences. Absent = the defaults. */
  choice?: TermChoice;
}

/**
 * The renderings in force for one sense of an entry. PREFERRED_OVERRIDES are choices the
 * code makes; a teacher's preference replaces them (overrides < user preferences).
 */
export interface TermChoice {
  /** The preferred renderings, '/'-equals; `[0]` becomes `preferred`. */
  displays: string[];
  /** The sense they belong to. A GDP-family choice may move the pin to sense (2). */
  sense: number;
  /** Renderings the EDB data does not list, accepted only because of the choice
   *  (實質國內生產總值 once GDP is 國內生產總值). */
  derived: string[];
  /** 'default': PREFERRED_OVERRIDES. 'teacher': picked in Settings. 'related': follows
   *  the teacher's choice for `follows` (the parent's key). */
  source: 'default' | 'teacher' | 'related';
  follows?: string;
}

/**
 * The teacher's term preferences as stored (Settings → Translation terms): entry key
 * (verbatim) → the chosen rendering, and the keys whose choice also applies to related
 * terms. Never in a document. A glossary validates it against the data on every build.
 */
export interface TermPreferences {
  choices: Readonly<Record<string, string>>;
  related: Readonly<Record<string, true>>;
}

/** One rendering a teacher may pick. */
export interface TermOption { display: string; sense: number; rank: number }
/** The renderings of one sense (or, for the GDP family, of both senses) to choose among. */
export interface TermOptionGroup {
  /** The sense, or undefined when the group spans senses (the GDP family). */
  sense?: number;
  options: TermOption[];
  /** What is preferred with no choice: rank 1, or the PREFERRED_OVERRIDES rendering. */
  defaults: string[];
}
/** An entry whose renderings include equal-meaning alternatives. */
export interface ChoosableTerm {
  entryId: number;
  en: string;
  groups: TermOptionGroup[];
  /** The GDP family and the import family: shown first, as common choices. */
  common: boolean;
}
/** A term that would follow a choice ("Also use in related terms"). */
export interface RelatedTerm {
  entryId: number;
  en: string;
  /** Preferred renderings before and after. */
  from: string[];
  to: string[];
  /** Of `to` and its equals, those the EDB data does not list. */
  derived: string[];
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
  /** `expected` is the teacher's choice (Settings → Translation terms), not the EDB's first. */
  chosen?: true;
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
  /** The term preferences this glossary was built with, after validation (stale rows dropped). */
  preferences: TermPreferences;
  /** Every entry with a choice, in source order, as the data defines it (never the preferences). */
  choosable: readonly ChoosableTerm[];
  /** The terms that would follow choosing `display` for the entry `key`. */
  related(key: string, display: string): RelatedTerm[];
}
