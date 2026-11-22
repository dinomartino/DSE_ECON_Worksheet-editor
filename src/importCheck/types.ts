import type { Analysis, Pin } from '@/import';
import type { Question } from '@/model/types';
import type { QRef } from './address';
import type { CheckOp } from './ops';

/**
 * The import check (k-0494): what an imported paper is compared with, and what it finds.
 * Design: `docs/design/paste-import.md` § Import check. Nothing here is stored.
 */

export type FindingKind =
  | 'junk' // page numbers, "Turn over", a picture credit Word added, copyright lines
  | 'marksInText' // "(4 marks)" / "[4m]" left in the words
  | 'marksTotal' // the file's marks and the paper's differ
  | 'marksMissing' // a part the file marks has none
  | 'spaceMissing' // answer lines the file has, the paper not
  | 'lostText' // words of the file nowhere on the paper
  | 'lostDrawing' // a diagram drawn with Word shapes, a chart or SmartArt: not imported
  | 'lostPicture' // a picture of the file nowhere on the paper
  | 'pictureMoved' // a picture in another question than the file's
  | 'pictureSize' // wider than the text column, or not the file's size
  | 'optionCount'
  | 'optionsMerged' // "A. … B. …" on one option line
  | 'mcAsWritten' // an MC whose options are pictures became a written question
  | 'questionMerged' // the next question's number kept as text inside this one
  | 'partMerged' // a part's label kept as text
  | 'language' // Chinese words on the English side or the reverse
  | 'garbled' // symbol-font characters, replacement characters
  | 'emptyBlock' // empty paragraphs left at the ends
  | 'split' // one sentence cut into two paragraphs
  | 'tableAsText' // a table of the file read as lines of text
  | 'tableChanged' // the paper's table and the file's differ
  | 'ai'; // the AI's finding (its own words)

/** A fix: an edit of the paper, or (in the import review only) a fix of the import itself. */
export type CheckFix = { op: CheckOp } | { pins: Pin[] };

export interface ImportFinding {
  /** Stable within a run: kind, question and what it is about. */
  id: string;
  kind: FindingKind;
  /** Index into the checked questions. */
  q: number;
  /** "(b)", "C", "(b)(ii)"; '' for the question itself. */
  place: string;
  /** What the message needs: numbers, the words concerned (short). */
  params: Record<string, string | number>;
  /** The fix's preview: the words as they are, and as they will be. */
  before?: string;
  after?: string;
  /** A picture the fix puts back or moves, for the preview. */
  image?: string;
  fix?: CheckFix;
  /** Applied by "Apply all safe fixes": undoable, and only where no judgement is needed. */
  safe: boolean;
  from: 'check' | 'ai';
  /** The file's line it is about (the review highlights it). */
  line?: number;
}

/** What the check compares: the file as read and solved, and the questions made from it. */
export interface CheckInput {
  /** The file solved: its lines, their roles, the outline. */
  analysis: Analysis;
  /** The questions as the importer builds them from `analysis` (`materialize(buildImport(…))`). */
  fresh: readonly Question[];
  /** The questions checked: the review's build, or the open paper's, in print order. */
  paper: readonly Question[];
  /** How a fix names each checked question: its index (review) or its id (open paper). */
  refs: readonly QRef[];
  /** Each checked question's outline question, when it has one. */
  map: ReadonlyArray<number | undefined>;
  /** `review`: fixes may be pins. `paper`: edits only. */
  mode: 'review' | 'paper';
  /** The text column, px: a picture wider than this overflows. */
  maxWidthPx: number;
  /** Text printed outside the questions (a lead stimulus): words found there are not lost. */
  elsewhere?: string;
  /** Lines the teacher already settled in the review (a picture added, "no picture"). */
  settled?: ReadonlySet<number>;
}
