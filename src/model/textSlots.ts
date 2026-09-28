/**
 * The contract every BiText consumer shares: one walker reads and writes every authored
 * string, and translation, counting, scoping and Check terms all go through it
 * (§ AI translation, glossary and app Settings).
 *
 * Imports types only (no registry, no render at runtime), so a question type can use it.
 */
import type { EditTarget } from '@/render/ir';
import type { MarkScheme } from './markSchemeTypes';
import { isRichTextEmpty, normalizeRuns } from './text';
import type { AnswerGraph, BiText, ContentBlock, DiagramBlock, InlineRun, RichText } from './types';

export type Side = 'en' | 'zh';

/** Owner-scoped address of one BiText: '/'-joined segments, e.g.
 *  "q:Kx1/part:P9/blocks/b:B2/cell:C4". Unique within one worksheet state even though
 *  Duplicate keeps block ids; a repeated segment inside one parent gets "#2", "#3".
 *  Request-local: never stored, never sent to a model. */
export type TextPath = string;

/** Who reads it: printed; teacher version / key only; never printed (alt text). */
export type SlotRole = 'print' | 'teacher' | 'meta';

/** What kind of words: the prompt's register and the review labels. */
export type SlotKind =
  | 'title' | 'instructions' | 'heading' | 'sectionHeading' | 'partHeader'
  | 'stem' | 'part' | 'paragraph' | 'statement' | 'option'
  | 'answer' | 'explanation' | 'rationale' | 'provenance'
  | 'schemePoint' | 'schemeLevel' | 'schemeEc'
  | 'tableCell' | 'caption' | 'sourceLabel' | 'sourceFootnote' | 'altText' | 'labelListCell'
  | 'diagramTitle' | 'axisTitle' | 'tickLabel' | 'diagramLabel' | 'flowNode' | 'bubble' | 'speaker'
  | 'coverLine' | 'coverField' | 'bandText' | 'wording' | 'marginNote';

export interface SlotMeta {
  kind: SlotKind;
  role: SlotRole;
  /** Page address when the text is edited on the page (context menu, "Show on page"). */
  target?: EditTarget;
  /** kind 'wording': authored words printed before/after a value the app derives. */
  aroundValue?: 'before' | 'after';
  /** The renderer draws the other side when this one is empty (diagram and answer-graph text). */
  fallsBack?: boolean;
  /** Stored but never printed as the document stands (disabled header/footer, question-level
   *  answer figures under parts). Set only by `walk.unprinted()`; never counted, planned or checked. */
  unprinted?: true;
  /** Location inside the owner, for review rows: "(b)(ii)", "Option C", "y-axis title". */
  label?: string;
}

export interface SlotGroup {
  kind: 'document' | 'cover' | 'bands' | 'layout' | 'question';
  /** Question id or layout element id. */
  id?: string;
  /** "Question 3", "Cover", "Header & footer", "Title & instructions", "Page · Section A heading". */
  label: string;
}

export interface TextSlot extends SlotMeta {
  path: TextPath;
  /** The stored object itself. A visitor returns it (===) to leave the slot alone. */
  text: BiText;
  group: SlotGroup;
  questionId?: string;
  /** Owning flow entry (question id or layout element id); undefined for title, cover, bands. */
  flowId?: string;
  /** Ids of every content block enclosing the text, outermost → innermost (figure row, source,
   *  table, diagram). The page emits the innermost block's id, so scopes match with `includes`. */
  blockIds: readonly string[];
  /** Path of the enclosing DiagramBlock, for review grouping ("Figure 1 · label"). Scoping uses `blockIds`. */
  diagramPath?: TextPath;
}

/** Return `slot.text` itself to leave it; any other object is written. */
export type TextVisitor = (slot: TextSlot) => BiText;

/** Handed to the registry hook. Every method returns its input unchanged (same object)
 *  when nothing beneath it changed, and never creates an absent optional field. */
export interface TextWalker {
  text(segment: string, text: BiText, meta: SlotMeta): BiText;
  optional(segment: string, text: BiText | undefined, meta: SlotMeta): BiText | undefined;
  /** Index-addressed lists (statements, scheme alternatives). */
  list(segment: string, texts: BiText[] | undefined, meta: (index: number) => SlotMeta): BiText[] | undefined;
  /** Shared block walker; `paragraphKind` names what a paragraph is here ('stem' | 'part' | 'answer' …). */
  blocks(segment: string, blocks: ContentBlock[], opts?: { role?: SlotRole; paragraphKind?: SlotKind }): ContentBlock[];
  optionalBlocks(
    segment: string,
    blocks: ContentBlock[] | undefined,
    opts?: { role?: SlotRole; paragraphKind?: SlotKind },
  ): ContentBlock[] | undefined;
  diagramBlock(segment: string, block: DiagramBlock | undefined, role: SlotRole): DiagramBlock | undefined;
  scheme(segment: string, scheme: MarkScheme | undefined): MarkScheme | undefined;
  answerGraph(segment: string, graph: AnswerGraph | undefined, role: SlotRole): AnswerGraph | undefined;
  /** Child walker: paths gain `segment`; `label` (if given) prefixes child slot labels ("(b)"). */
  scope(segment: string, label?: string): TextWalker;
  /** Same paths; every slot below is marked `unprinted`. */
  unprinted(): TextWalker;
}

/** A write and its stale guard. */
export interface TranslationWrite {
  path: TextPath;
  /** The side written. */
  side: Side;
  /** The other side, as sent (or as checked). */
  sourceSnapshot: RichText;
  /** The written side's runs exactly as read at plan time — for a fill too, so a
   *  whitespace-only side (a stray Enter) matches and is filled, never "changed". */
  targetSnapshot: RichText;
  next: RichText;
}
export type SkipReason = 'sourceChanged' | 'targetChanged' | 'gone';
export interface ApplyReport {
  applied: number;
  skipped: Array<{ path: TextPath; reason: SkipReason }>;
  resized: number;
  refused?: 'readOnly' | 'otherDocument';
}

// ---- real helpers ----

/** `obj` itself when every value in `changes` is === obj's (absent ≡ undefined); else a
 *  copy with only the differing keys set, so an absent optional field is never created. */
export function patch<T extends object>(obj: T, changes: Partial<T>): T {
  let copy: T | null = null;
  for (const key of Object.keys(changes) as Array<keyof T>) {
    const value = changes[key];
    if (value === obj[key]) continue;
    copy ??= { ...obj };
    copy[key] = value as T[keyof T];
  }
  return copy ?? obj;
}

/** `items` itself when `fn` returned every element unchanged. */
export function mapSame<T>(items: readonly T[], fn: (item: T, index: number) => T): T[] {
  let out: T[] | null = null;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const next = fn(item, index);
    if (out) out.push(next);
    else if (next !== item) out = [...items.slice(0, index), next];
  }
  return out ?? (items as T[]);
}

function sameRun(a: InlineRun, b: InlineRun): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof InlineRun>;
  for (const key of keys) {
    if (key === 'fonts') {
      if (a.fonts?.latin !== b.fonts?.latin || a.fonts?.eastAsia !== b.fonts?.eastAsia) return false;
    } else if (a[key] !== b[key]) return false;
  }
  return true;
}

/** Identity fast path, then structural equality of `normalizeRuns` output. */
export function sameRuns(a: RichText, b: RichText): boolean {
  if (a === b) return true;
  const left = normalizeRuns(a);
  const right = normalizeRuns(b);
  return left.length === right.length && left.every((run, i) => sameRun(run, right[i]));
}

/** The side a one-sided BiText lacks (trimmed-empty rule); null if both or neither. */
export function missingSide(text: BiText): Side | null {
  const noEn = isRichTextEmpty(text.en);
  const noZh = isRichTextEmpty(text.zh);
  if (noEn === noZh) return null;
  return noEn ? 'en' : 'zh';
}
