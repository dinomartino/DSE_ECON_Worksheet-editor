import type { BiText, ContentBlock } from './types';

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
  /**
   * How the points print (k-0470). Absent: a line per point with its mark, as every
   * build before printed it. `paragraph`: HKEAA's other style, each route's points run
   * together as one paragraph with the route's total beside it; the group rules (`n@`,
   * any N, first only, `max`) stay stored and count, but do not print. A value a build
   * does not know reads as absent and is kept (`model/markScheme.ts:schemeDisplay`).
   */
  display?: 'paragraph';
  /**
   * The content mark, stated (k-0475): "The maximum mark for content is 12 marks." For an
   * essay part whose points are indicative content with no mark each, as HKEAA marks a
   * DRQ's last part. Set, it is the content total (`model/markScheme.ts:contentMax`),
   * whatever the points add up to; absent, the points' rules derive it as before.
   */
  contentMax?: number;
}

export interface MarkRoute {
  id: string;
  groups: MarkGroup[];
}

/** Points marked together under one allocation rule. */
export interface MarkGroup {
  id: string;
  /**
   * The underlined line HKEAA prints above a group (k-0475): "Possible reasons:",
   * "Verbal elaboration:", "How Objective 1 may be achieved:". Absent prints nothing.
   */
  heading?: BiText;
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
  /**
   * The point's own figures (k-0595, u-m9g9): diagrams and tables (and pictures) that
   * belong to this point — "(1) Correct diagram: D shifts right…" with the diagram under
   * its line. They print straight under the point's wording, carry its mark, and move,
   * split, join and delete with it. The same blocks a stem holds, so every block walk
   * (edit, resize, delete, copy, translate) reaches them (`model/edits.ts:questionBlockLists`).
   * Absent or empty = none; written only through `model/markScheme.ts:withPointBlocks`.
   * A point with any is schema v4 (`model/migrations.ts`: older builds open the paper
   * read-only, the point's words still showing).
   */
  blocks?: ContentBlock[];
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
