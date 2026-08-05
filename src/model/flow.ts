import { newId } from './factories';
import { emptyBiText, parseRuns, plain } from './text';
import type { BiText, FlowItem, LayoutElement, Question } from './types';

/**
 * Resolving display order. **`questions` is the authority on question order**; `flow`
 * contributes only the position of layout elements relative to them. Anything the
 * flow does not mention is appended — a lost flow entry costs position, never
 * existence. One flow for the whole document; a section is a layout element inside
 * it, which is what lets a section begin mid-sheet.
 */

/** The two lists a flow orders. `Worksheet` satisfies this, and so does a test stub. */
export interface FlowDoc {
  questions: Question[];
  layout?: LayoutElement[];
  flow?: FlowItem[];
}

export type ResolvedItem =
  | { type: 'question'; id: string; question: Question }
  | { type: 'layout'; id: string; element: LayoutElement };

export function resolveFlow(doc: FlowDoc): ResolvedItem[] {
  const layout = doc.layout ?? [];
  if (layout.length === 0) {
    // No layout elements at all, so order is simply question array order.
    return doc.questions.map((question) => ({
      type: 'question' as const,
      id: question.id,
      question,
    }));
  }

  const byId = new Map(layout.map((element) => [element.id, element]));
  const questionIds = new Set(doc.questions.map((question) => question.id));

  // Bucket each layout element under the question it should follow; `null` keys the
  // elements that come before every question.
  const after = new Map<string | null, string[]>();
  const placed = new Set<string>();
  let anchor: string | null = null;

  for (const entry of doc.flow ?? []) {
    if (entry.type === 'question') {
      if (questionIds.has(entry.id)) anchor = entry.id;
      continue;
    }
    if (!byId.has(entry.id) || placed.has(entry.id)) continue;
    const bucket = after.get(anchor);
    if (bucket) bucket.push(entry.id);
    else after.set(anchor, [entry.id]);
    placed.add(entry.id);
  }

  // Elements the flow never mentioned go at the end, so nothing can be hidden.
  const trailing = layout.filter((element) => !placed.has(element.id)).map((e) => e.id);

  const resolved: ResolvedItem[] = [];
  const emit = (ids: string[] | undefined) => {
    for (const id of ids ?? []) {
      const element = byId.get(id);
      if (element) resolved.push({ type: 'layout', id, element });
    }
  };

  emit(after.get(null));
  for (const question of doc.questions) {
    resolved.push({ type: 'question', id: question.id, question });
    emit(after.get(question.id));
  }
  emit(trailing);

  return resolved;
}

/** The flow entries a document currently resolves to, for writing back after a move. */
export function flowOf(doc: FlowDoc): FlowItem[] {
  return resolveFlow(doc).map((item) => ({ type: item.type, id: item.id }) as FlowItem);
}

/**
 * The parts of a document a move rewrites.
 *
 * Because `questions` stays authoritative for question order, a move has to be able
 * to rewrite either list: dragging a question reorders the array, dragging a divider
 * only rewrites the flow. Returning both keeps that decision in one place.
 */
export interface FlowMove {
  questions: Question[];
  flow: FlowItem[];
}

/**
 * Reorder a resolved item list, then split it back into the two stored lists.
 *
 * Exported because an **insert** needs it as much as a move does. `questions` owns
 * question order, so writing a new question's position into `flow` alone does nothing:
 * `resolveFlow` emits questions in array order and the flow entry is ignored. A
 * question appended to the array therefore printed last however the flow read — which
 * is what made "insert after this heading" put the question at the end of the document.
 */
export function applyOrder(doc: FlowDoc, ordered: FlowItem[]): FlowMove {
  const byId = new Map(doc.questions.map((question) => [question.id, question]));
  const questions: Question[] = [];
  for (const entry of ordered) {
    if (entry.type !== 'question') continue;
    const question = byId.get(entry.id);
    if (question) questions.push(question);
  }
  // Any question the ordering missed keeps its place at the end rather than vanishing.
  for (const question of doc.questions) {
    if (!questions.includes(question)) questions.push(question);
  }
  return { questions, flow: ordered };
}

/**
 * Move `id` so it lands next to `targetId`.
 *
 * `position` picks which side of the target to land on, which is what lets the page
 * drag show a drop indicator on the edge the pointer is nearest and then honour it.
 * Removing before inserting means a downward drag lands where the user dropped it
 * rather than one short — the same rule the question-only reorder followed.
 *
 * There is no cross-section counterpart any more: with one document-wide flow, dragging
 * a question past a section heading *is* moving it into that section, because the
 * section it belongs to is decided by which marker precedes it.
 */
export function moveInFlow(
  doc: FlowDoc,
  id: string,
  targetId: string,
  position: 'before' | 'after' = 'before',
): FlowMove {
  const entries = flowOf(doc);
  const from = entries.findIndex((entry) => entry.id === id);
  if (from < 0 || id === targetId) return applyOrder(doc, entries);

  const [moved] = entries.splice(from, 1);
  const to = entries.findIndex((entry) => entry.id === targetId);
  if (to < 0) entries.push(moved);
  else entries.splice(position === 'after' ? to + 1 : to, 0, moved);
  return applyOrder(doc, entries);
}

/**
 * Move a whole run of items so it lands next to `targetId`, keeping their order.
 *
 * This is what dragging a *page* thumbnail does. A page is not a thing in the model —
 * it is whatever the paginator packed onto one sheet (§preview) — so "move page 3
 * above page 2" can only be expressed as "move these six items, together, to there".
 *
 * The run is lifted in one pass rather than by repeated single moves: moving items one
 * at a time would make each one's landing index depend on the ones already moved, which
 * silently reverses a run dragged upward.
 *
 * `targetId` must not itself be in `ids` — a run cannot land inside itself. The caller
 * gets the list back untouched in that case rather than a scrambled one.
 */
export function moveRunInFlow(
  doc: FlowDoc,
  ids: string[],
  targetId: string,
  position: 'before' | 'after' = 'before',
): FlowMove {
  const entries = flowOf(doc);
  const moving = new Set(ids);
  if (moving.size === 0 || moving.has(targetId)) return applyOrder(doc, entries);

  // Preserve document order within the run, not the order the caller happened to list
  // them in, so a page always reads the same after a move as before it.
  const run = entries.filter((entry) => moving.has(entry.id));
  if (run.length === 0) return applyOrder(doc, entries);

  const rest = entries.filter((entry) => !moving.has(entry.id));
  const to = rest.findIndex((entry) => entry.id === targetId);
  if (to < 0) return applyOrder(doc, [...rest, ...run]);
  rest.splice(position === 'after' ? to + 1 : to, 0, ...run);
  return applyOrder(doc, rest);
}

/** Shift `id` one position up (-1) or down (+1) in the document flow. */
export function nudgeInFlow(doc: FlowDoc, id: string, direction: -1 | 1): FlowMove {
  const entries = flowOf(doc);
  const index = entries.findIndex((entry) => entry.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= entries.length) return applyOrder(doc, entries);
  [entries[index], entries[target]] = [entries[target], entries[index]];
  return applyOrder(doc, entries);
}

/**
 * The human name of a layout kind.
 *
 * Shared rather than spelled per surface: the add rail, the outline row and the
 * insertion label all name the same nine things, and three copies would drift the
 * moment a tenth kind is added — the rail would offer "Blank space" while the outline
 * called the result something else.
 */
export const LAYOUT_NAME: Record<LayoutElement['kind'], string> = {
  section: 'Section',
  heading: 'Heading',
  text: 'Text',
  spacer: 'Blank space',
  divider: 'Divider',
  pageBreak: 'New page',
  answerLines: 'Answer lines',
  answerSpace: 'Answer space',
  partHeader: 'Part header',
  labelList: 'Label list',
  questionCount: 'Question count',
};

/**
 * Name the item a new insert would land behind, for the add rail's destination label.
 *
 * A question is named by its **number**, because that is what a teacher calls it and
 * what the page shows; the number is derived, so the caller passes the one it already
 * computed rather than making this recompute a numbering plan.
 *
 * A layout element prefers **its own text** over its kind. "after section" is ambiguous
 * the moment a paper has two of them — which is every real paper — so a heading that
 * says "Section B" names itself. Text is truncated because these are headings, not
 * prose, and an untitled element falls back to its kind rather than to an empty label.
 *
 * Returns undefined when the id names nothing, which is what "append to the end" looks
 * like: the rail then says so rather than naming a ghost.
 */
const MAX_LABEL_CHARS = 24;

export function flowItemLabel(
  doc: FlowDoc,
  id: string | undefined,
  questionNumber?: (questionId: string) => number | undefined,
): string | undefined {
  if (!id) return undefined;
  const question = doc.questions.find((item) => item.id === id);
  if (question) {
    const number = questionNumber?.(question.id);
    return number === undefined ? 'question' : `Q${number}`;
  }

  const element = (doc.layout ?? []).find((item) => item.id === id);
  if (!element) return undefined;
  const kind = LAYOUT_NAME[element.kind].toLowerCase();
  if (!('text' in element)) return kind;

  // Either language will do — a teacher working in Chinese should see the Chinese.
  const text = (plain(element.text.en) || plain(element.text.zh)).trim();
  if (!text) return kind;
  return text.length > MAX_LABEL_CHARS ? `${text.slice(0, MAX_LABEL_CHARS).trimEnd()}…` : text;
}

export function createHeadingElement(text: BiText = emptyBiText()): LayoutElement {
  return { kind: 'heading', id: newId(), text };
}

export function createTextElement(text: BiText = emptyBiText()): LayoutElement {
  return { kind: 'text', id: newId(), text };
}

/**
 * The MCQ lead-in's wording, either side of the derived count.
 *
 * The reference (DSE 2021 P1, page 2) reads "There are 45 questions in this paper.
 * Choose the BEST answer for each question." — with **BEST** bold, which is why the
 * suffix is parsed rather than built with `bi()`: the emphasis is a stretch of
 * characters, not a property of the line (§ per-run formatting). The double space
 * before "Choose" is the reference's own sentence spacing.
 *
 * Defaults, not fixtures: an element stores nothing until a teacher retypes a side, so
 * a document that never touches the wording exports byte-identically and picks up any
 * later correction here.
 */
export const DEFAULT_QUESTION_COUNT_WORDING: { prefix: BiText; suffix: BiText } = {
  prefix: { en: parseRuns('There are '), zh: parseRuns('本卷共有') },
  suffix: {
    en: parseRuns(' questions in this paper.  Choose the **BEST** answer for each question.'),
    zh: parseRuns('題。請為每題選出**最佳**答案。'),
  },
};

export function createQuestionCountElement(): LayoutElement {
  return { kind: 'questionCount', id: newId() };
}

/*
 * The floors for the two sizeable layout elements.
 *
 * Both are resized by dragging an edge on the page, and a drag that overshoots must
 * land on something that still reads as the element rather than on nothing at all.
 * Zero answer lines and a zero-height spacer both render as *absence*: the element is
 * still in the flow, still selectable in the outline, but invisible on the page — so
 * the teacher's next move is to add another one, and the document accumulates elements
 * nobody can see. One line is the smallest thing that still says "this is here".
 *
 * They live beside the factories rather than in `edits.ts` next to `MIN_BLOCK_WIDTH_PX`
 * because every surface that can produce one of these values — factory, sidebar field,
 * page drag — has to agree, and the factory is what the other two are sizing *from*.
 */
export const MIN_ANSWER_LINES = 1;
export const MIN_SPACER_PT = 6;

/** Clamp a line count to something that still prints. */
export function clampAnswerLines(lines: number): number {
  return Math.max(MIN_ANSWER_LINES, Math.round(lines));
}

/** Clamp a spacer height to something that still occupies space. */
export function clampSpacerPt(heightPt: number): number {
  return Math.max(MIN_SPACER_PT, Math.round(heightPt));
}

export function createSpacerElement(heightPt = 48): LayoutElement {
  return { kind: 'spacer', id: newId(), heightPt: clampSpacerPt(heightPt) };
}

export function createDividerElement(): LayoutElement {
  return { kind: 'divider', id: newId() };
}

export function createPageBreakElement(): LayoutElement {
  return { kind: 'pageBreak', id: newId() };
}

export function createAnswerLinesElement(lines = 4): LayoutElement {
  return { kind: 'answerLines', id: newId(), lines: clampAnswerLines(lines) };
}

/**
 * The QAB answer space (§ dotted lines). Eight lines is the smallest block the
 * reference booklet ever grants a part, so a fresh element reads as writing room
 * rather than as a stray rule.
 */
export function createAnswerSpaceElement(lines = 8, fill = false): LayoutElement {
  return {
    kind: 'answerSpace',
    id: newId(),
    lines: clampAnswerLines(lines),
    ...(fill ? { fill: true } : {}),
  };
}

/**
 * A section heading, and the point numbering restarts.
 *
 * `restartNumbering` defaults to true because that is what a teacher adding a section
 * means by it — "Section B" starting at question 1 is the convention every DSE paper
 * follows, and a section that continued the previous count would look like a mistake.
 */
export function createSectionElement(
  text: BiText = emptyBiText(),
  restartNumbering = true,
): Extract<LayoutElement, { kind: 'section' }> {
  return { kind: 'section', id: newId(), text, restartNumbering };
}

/** A part header; its marks total is derived from the section at render time. */
export function createPartHeaderElement(text: BiText = emptyBiText()): LayoutElement {
  return { kind: 'partHeader', id: newId(), text, showMarks: true };
}

export function createLabelListElement(rowCount = 3): LayoutElement {
  return {
    kind: 'labelList',
    id: newId(),
    rows: Array.from({ length: rowCount }, () => ({
      id: newId(),
      label: emptyBiText(),
      value: emptyBiText(),
    })),
  };
}
