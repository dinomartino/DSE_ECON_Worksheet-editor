import { documentShape, type DocumentShape } from '@/model/documentShape';
import { resolveFlow, type ResolvedItem } from '@/model/flow';
import type { LayoutElement, Worksheet } from '@/model/types';

/**
 * What a question asks of the page it prints on: to be kept on one, or to start a new one.
 *
 * Two optional flags on the question (`keepOnOnePage`, `startOnNewPage`), read here and by
 * nothing else, so the walker (`renderWorksheet`), the paginator that packs the sheets and
 * the panels that offer the choices cannot disagree. Neither reaches the `.docx` by code of
 * its own: the file breaks its pages where the preview's sheets break (`pageBreaks.ts`), so
 * a sheet the paginator opens at a question is a page break in Word, and a question kept
 * whole is one the paginator never cut.
 */

/**
 * Whether a question is kept on one sheet without anybody asking: every question of a Paper 1
 * (the exam paper never splits one), and any of a type that asks for it (`keepWhole` on its
 * definition: an MC stem without its options cannot be answered). The IR carries that as a
 * keep chain (`keepQuestionWhole`); `keepOnOnePage` is for the rest.
 */
export function isKeptWhole(shape: DocumentShape, definition: { keepWhole?: boolean }): boolean {
  return shape === 'paper1' || definition.keepWhole === true;
}

/**
 * A layout element that introduces what is below it, so a page never ends between the two: a
 * heading, a shared source with its lead-in, and the exam paper's lead-in ("There are 45 questions
 * in this paper"). A question asked to start a page takes the run that starts at one of them along
 * (the paginator already holds a heading with the item after it when a page fills up; this is the
 * same promise when the teacher asks for the break).
 */
function introduces(element: LayoutElement): boolean {
  switch (element.kind) {
    case 'section':
    case 'heading':
    case 'partHeader':
    case 'stimulus':
    case 'questionCount':
      return true;
    default:
      return false;
  }
}

/**
 * Whether asking a question to start a new page does anything where it stands:
 *
 * - `applies`: a sheet opens at `opener`, the question itself or the heading, lead-in or source
 *   that opens the run of elements directly above it.
 * - `first`: it (with whatever travels with it) is the first thing on the paper, which opens
 *   the first page already. The masthead above is not a reason to push it to page 2: a title
 *   page is made with a New page element.
 * - `afterBreak`: a New page break stands straight above it, which already starts a page.
 */
export type StartsPageStatus = 'applies' | 'first' | 'afterBreak';

export interface SheetStart {
  status: StartsPageStatus;
  /** Index in the flow of the item that opens the sheet (`index` itself unless something travels with it). */
  opener: number;
}

/**
 * The verdict for the question at `index` of a resolved flow.
 *
 * What travels with the question is read off the run of layout elements directly above it, up to
 * a page break or a question: from the topmost heading, lead-in or source in that run down to the
 * question, notes and all (a rubric under a heading belongs to the heading). With none in the run
 * the question opens the sheet alone, so a closing line like "END OF SECTION A", which stands
 * above the next section's heading, stays on the page it ends.
 */
export function sheetStart(flow: readonly ResolvedItem[], index: number): SheetStart {
  let runStart = index;
  while (runStart > 0) {
    const above = flow[runStart - 1];
    if (above.type !== 'layout' || above.element.kind === 'pageBreak') break;
    runStart -= 1;
  }
  let opener = index;
  for (let at = runStart; at < index; at += 1) {
    const item = flow[at];
    if (item.type === 'layout' && introduces(item.element)) {
      opener = at;
      break;
    }
  }
  if (opener === 0) return { status: 'first', opener };
  const above = flow[opener - 1];
  if (above.type === 'layout' && above.element.kind === 'pageBreak') {
    return { status: 'afterBreak', opener };
  }
  return { status: 'applies', opener };
}

/**
 * Whether the paper asks every question to start a new page (`startEveryQuestionOnNewPage`).
 * Not on a Paper 1, whatever is stored: the switch is not offered there, and a document that
 * stops being a Paper 1 gets its answer back.
 */
export function startsEveryQuestion(worksheet: Worksheet): boolean {
  return worksheet.startEveryQuestionOnNewPage === true && documentShape(worksheet) !== 'paper1';
}

/**
 * The document with "Start every question on a new page" on or off: off removes the field, so a
 * paper switched back is the paper it was. The same object when nothing changes, so `commit`
 * records no undo step for a no-op.
 */
export function withStartEveryQuestionOnNewPage(worksheet: Worksheet, on: boolean): Worksheet {
  if ((worksheet.startEveryQuestionOnNewPage === true) === on) return worksheet;
  const next: Worksheet = { ...worksheet, startEveryQuestionOnNewPage: true };
  if (!on) delete next.startEveryQuestionOnNewPage;
  return next;
}

/**
 * The flow items that must open a sheet because a question that asked to start a page is theirs
 * (itself, or the heading it travels with). The walker stamps `startsPage` on exactly these.
 * `every` is the paper-wide switch (`startsEveryQuestion`): then every question asks, and the
 * same rules (heading travels, the first and one under a New page open nothing) apply to each.
 */
export function sheetOpeners(flow: readonly ResolvedItem[], every = false): Set<number> {
  const openers = new Set<number>();
  flow.forEach((item, index) => {
    if (item.type !== 'question' || !(every || item.question.startOnNewPage === true)) return;
    const start = sheetStart(flow, index);
    if (start.status === 'applies') openers.add(start.opener);
  });
  return openers;
}

/**
 * Why a question's "Start on a new page" does or does not do anything, for the control that sets
 * it. Read off the same flow the walker reads, so the sentence a panel prints is the page's.
 * A question that is not in the flow (a stale id) says nothing.
 */
export function startsPageStatus(worksheet: Worksheet, questionId: string): StartsPageStatus {
  const flow = resolveFlow(worksheet);
  const at = flow.findIndex((item) => item.type === 'question' && item.id === questionId);
  return at < 0 ? 'applies' : sheetStart(flow, at).status;
}
