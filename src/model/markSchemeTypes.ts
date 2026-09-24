import type { BiText } from './types';

/**
 * A structured leaf's marking scheme in HKEAA notation (§ A marking scheme is notation,
 * not prose). Optional and additive: `answer` keeps printing as it always did, and a
 * scheme prints after it, teacher version and answer key only.
 *
 * Every mark total is derived (`model/markScheme.ts`), never stored; only the rules a
 * co-marker applies are: `n@`, "any N", "first N only", `max: N`, `/`, OR, levels, EC.
 */
export interface MarkScheme {
  /**
   * Alternative whole approaches to the part, printed with "OR" between them; the
   * candidate is marked on one. Almost always exactly one.
   */
  routes: MarkRoute[];
  /**
   * Level descriptors for an essay-type part, numbered by position: the first is
   * Level 1. When present, the content mark comes from the levels and the points above
   * are indicative content.
   */
  levels?: MarkLevel[];
  /** Effective Communication, awarded on top of the content mark (Paper 2 essays). */
  ec?: MarkEc;
}

export interface MarkRoute {
  id: string;
  groups: MarkGroup[];
}

/** Points marked together under one allocation rule. */
export interface MarkGroup {
  id: string;
  points: MarkPoint[];
  /** `n@`: every point here earns n marks, overriding each point's own. */
  each?: number;
  /** "Any N of the following": at most N points earn credit. */
  take?: number;
  /** With `take`: "[Mark the FIRST N points only.]" — extra answers are not marked. */
  firstOnly?: boolean;
  /** `max: N` — the group never earns more than N. */
  max?: number;
}

export interface MarkPoint {
  id: string;
  text: BiText;
  /** The mark it earns. Absent prints nothing and counts nothing, like part marks. */
  marks?: number;
  /** `/` — other wordings that earn the same mark; accept any one. */
  alternatives?: BiText[];
}

export interface MarkLevel {
  id: string;
  /** Inclusive mark range, e.g. 4–6. */
  min: number;
  max: number;
  /** "Candidates at this level typically…" */
  descriptor: BiText;
}

export interface MarkEc {
  /** The EC marks available; HKEAA essays allot 2. */
  max: number;
  /** One row per awardable mark, as authored (normally 2, 1, 0). */
  descriptors: MarkEcDescriptor[];
}

export interface MarkEcDescriptor {
  id: string;
  marks: number;
  text: BiText;
}
