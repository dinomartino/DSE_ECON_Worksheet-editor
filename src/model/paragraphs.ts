import { normalizeRuns, richTextLength, sliceRichText } from './text';
import type { ContentBlock, ParagraphBlock, Question, RichText, Worksheet } from './types';

/**
 * Word's Enter, Backspace and Delete between paragraphs (k-0200).
 *
 * A question's text is a list of paragraph blocks (the sidebar's Add Text makes the second
 * one), so Enter in a paragraph splits it in two at the caret, and Backspace at a
 * paragraph's start (Delete at its end) joins it to the paragraph before (after) in the
 * same list. Nothing here touches a saved paper until a teacher presses the key: these are
 * the same blocks Add Text and Delete already make and remove.
 *
 * One language is typed at a time. Splitting the English keeps the Chinese with the first
 * paragraph (the new one has no Chinese yet, and asks for it); joining keeps both sides,
 * the side not being typed in kept apart by a line break so two translations never run
 * into one sentence.
 */

type Side = 'en' | 'zh';

/**
 * Split paragraph `blockId` at `[start, end)` of `side`: the selected characters go, the
 * text after them moves into a new paragraph `newId` with the same format, as in Word.
 * Returns the worksheet unchanged when the block is not a paragraph found in a block list.
 */
export function splitParagraph(
  worksheet: Worksheet,
  blockId: string,
  side: Side,
  start: number,
  end: number,
  newId: string,
): Worksheet {
  return mapListHolding(worksheet, blockId, (list, index) => {
    const block = list[index];
    if (block.kind !== 'paragraph') return list;
    const runs = block.text[side] ?? [];
    const length = richTextLength(runs);
    const from = Math.max(0, Math.min(start, end, length));
    const to = Math.min(length, Math.max(start, end));
    const first: ParagraphBlock = {
      ...block,
      text: { ...block.text, [side]: sliceRichText(runs, 0, from) },
    };
    const second: ParagraphBlock = {
      kind: 'paragraph',
      id: newId,
      text: side === 'en' ? { en: sliceRichText(runs, to, length), zh: [] } : { en: [], zh: sliceRichText(runs, to, length) },
      ...(block.format ? { format: block.format } : {}),
    };
    return [...list.slice(0, index), first, second, ...list.slice(index + 1)];
  });
}

/** The paragraph a join lands in, and where in it the caret goes. */
export interface JoinResult {
  worksheet: Worksheet;
  blockId: string;
  caret: number;
}

/**
 * Join paragraph `blockId` to its neighbour in the same list: `backward` into the one
 * before it (Backspace at its start), `forward` pulling the one after it in (Delete at its
 * end). `undefined` when that neighbour is not a paragraph (a table, a picture, the end of
 * the list), where the key does nothing, as at the start of a Word document.
 */
export function joinParagraph(
  worksheet: Worksheet,
  blockId: string,
  side: Side,
  direction: 'backward' | 'forward',
): JoinResult | undefined {
  let result: JoinResult | undefined;
  const next = mapListHolding(worksheet, blockId, (list, index) => {
    const at = direction === 'backward' ? index - 1 : index;
    const head = list[at];
    const tail = list[at + 1];
    if (head?.kind !== 'paragraph' || tail?.kind !== 'paragraph') return list;
    const other: Side = side === 'en' ? 'zh' : 'en';
    const caret = richTextLength(head.text[side]);
    const joined: ParagraphBlock = {
      ...head,
      text: {
        ...head.text,
        [side]: normalizeRuns([...(head.text[side] ?? []), ...(tail.text[side] ?? [])]),
        [other]: joinApart(head.text[other], tail.text[other]),
      },
    };
    result = { worksheet, blockId: head.id, caret };
    return [...list.slice(0, at), joined, ...list.slice(at + 2)];
  });
  return result && next !== worksheet ? { ...result, worksheet: next } : undefined;
}

/** Two texts as one, a line break between them when both have words. */
function joinApart(a: RichText | undefined, b: RichText | undefined): RichText {
  const head = a ?? [];
  const tail = b ?? [];
  if (richTextLength(head) === 0) return tail;
  if (richTextLength(tail) === 0) return head;
  return normalizeRuns([...head, { text: '\n' }, ...tail]);
}

/**
 * Apply `edit` to the one block list that holds `blockId` directly — a question's text, a
 * part's (or its interlude), a sub-part's, an option's, a layout element's or a source
 * panel's body — and keep every other list, question and element as it was (the page's
 * render cache is keyed on them). `edit` returning `list` itself changes nothing.
 */
function mapListHolding(
  worksheet: Worksheet,
  blockId: string,
  edit: (list: ContentBlock[], index: number) => ContentBlock[],
): Worksheet {
  let done = false;
  const visit = (list: ContentBlock[] | undefined): ContentBlock[] | undefined => {
    if (done || !list) return list;
    const index = list.findIndex((block) => block.id === blockId);
    if (index !== -1) {
      done = true;
      return edit(list, index);
    }
    let changed: ContentBlock[] | undefined;
    list.forEach((block, at) => {
      if (done || block.kind !== 'source') return;
      const inner = visit(block.blocks);
      if (inner !== block.blocks) (changed ??= [...list])[at] = { ...block, blocks: inner! };
    });
    return changed ?? list;
  };

  type Leaf = { blocks: ContentBlock[]; blocksBefore?: ContentBlock[]; subParts?: Array<{ blocks: ContentBlock[] }> };
  const questions = worksheet.questions.map((question): Question => {
    if (done) return question;
    const blocks = visit(question.blocks)!;
    if (blocks !== question.blocks) return { ...question, blocks } as Question;
    const shaped = question as { parts?: Leaf[]; options?: Array<{ blocks?: ContentBlock[] }> };
    if (shaped.parts) {
      const parts = shaped.parts.map((part) => {
        if (done) return part;
        const before = visit(part.blocksBefore);
        if (before !== part.blocksBefore) return { ...part, blocksBefore: before };
        const own = visit(part.blocks)!;
        if (own !== part.blocks) return { ...part, blocks: own };
        if (!part.subParts) return part;
        const subParts = part.subParts.map((sub) => {
          const subBlocks = visit(sub.blocks)!;
          return subBlocks !== sub.blocks ? { ...sub, blocks: subBlocks } : sub;
        });
        return subParts.some((sub, i) => sub !== part.subParts![i]) ? { ...part, subParts } : part;
      });
      if (parts.some((part, i) => part !== shaped.parts![i])) return { ...question, parts } as Question;
    }
    if (shaped.options) {
      const options = shaped.options.map((option) => {
        const optionBlocks = visit(option.blocks);
        return optionBlocks !== option.blocks ? { ...option, blocks: optionBlocks } : option;
      });
      if (options.some((option, i) => option !== shaped.options![i])) return { ...question, options } as Question;
    }
    return question;
  });
  const layout = worksheet.layout.map((element) => {
    if (done || !('blocks' in element)) return element;
    const blocks = visit(element.blocks)!;
    return blocks !== element.blocks ? { ...element, blocks } : element;
  });
  const questionsChanged = questions.some((question, i) => question !== worksheet.questions[i]);
  const layoutChanged = layout.some((element, i) => element !== worksheet.layout[i]);
  if (!questionsChanged && !layoutChanged) return worksheet;
  return {
    ...worksheet,
    questions: questionsChanged ? questions : worksheet.questions,
    layout: layoutChanged ? layout : worksheet.layout,
  };
}
