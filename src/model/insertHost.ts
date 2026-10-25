import type { ContentBlock, LayoutElement, Question, Worksheet } from './types';

/**
 * Where Insert → Table or Picture puts its block (k-0201). A table or picture lives inside
 * a question's text or a shared stimulus, never loose in the flow, so the rail names one:
 *
 *  - the question or shared stimulus the rail is pointed at (the insert anchor) takes it at
 *    the end of its text, under what is there;
 *  - anything else (no anchor, a heading, a page break) gets a new question there, holding it.
 *    The menu's header already says where ("Inserts after …", "Inserts at the end"), so the
 *    block lands where the header promised.
 */
export type InsertHost =
  | { kind: 'question'; id: string }
  | { kind: 'stimulus'; id: string };

export function insertHostFor(worksheet: Worksheet, anchorId: string | undefined): InsertHost | undefined {
  if (!anchorId) return undefined;
  if (worksheet.questions.some((question) => question.id === anchorId)) return { kind: 'question', id: anchorId };
  const element = (worksheet.layout ?? []).find((item) => item.id === anchorId);
  return element?.kind === 'stimulus' ? { kind: 'stimulus', id: anchorId } : undefined;
}

/** `block` appended to the host's own blocks (a question's text, before any parts). */
export function appendBlockToHost(worksheet: Worksheet, host: InsertHost, block: ContentBlock): Worksheet {
  if (host.kind === 'question') {
    return {
      ...worksheet,
      questions: worksheet.questions.map((question) =>
        question.id === host.id ? ({ ...question, blocks: [...question.blocks, block] } as Question) : question,
      ),
    };
  }
  return {
    ...worksheet,
    layout: (worksheet.layout ?? []).map((element): LayoutElement =>
      element.id === host.id && element.kind === 'stimulus'
        ? { ...element, blocks: [...element.blocks, block] }
        : element,
    ),
  };
}

/** The kind of question a new host is: an MC on a Paper 1, which holds nothing else. */
export function newHostQuestionType(paper1: boolean): 'mcq' | 'structured' {
  return paper1 ? 'mcq' : 'structured';
}
