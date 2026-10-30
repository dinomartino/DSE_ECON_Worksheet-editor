import { documentShape } from './documentShape';
import { areBlocksEmpty, emptyBiText, isBiTextEmpty, isRichTextEmpty } from './text';
import type { McqQuestion, Worksheet } from './types';

/**
 * Word's Enter on the last MC option (k-0263): as at the end of a list in Word, Enter on
 * an option with words in it starts the next option — E, F — and Enter on an empty option
 * it added takes it away again and finishes. Each is one commit, so one ⌘Z.
 *
 * - **Up to the paper's limit** (`optionLimit`): a Paper 1's questions are A–D, as every DSE
 *   MC paper is, so there Enter on D finishes as it always did; any other paper goes to F.
 * - **Bilingual:** "has words" is read on the side being typed. A new option is empty on
 *   both sides; an option is only taken away when it is empty on both sides and has no
 *   picture or note, so English typed in an E is never lost to an Enter in its 中文.
 * - **The answer key:** a new option goes after the last, so no letter moves and
 *   `answerIndex` stands; an option that is the key is never taken away, nor one of the
 *   first four (an empty D on a new question is waiting to be typed, not to be removed).
 */

/** The four letters every DSE MC question has; never taken away by Enter. */
export const STANDARD_OPTION_COUNT = 4;

/** The most options Enter makes outside a Paper 1: A–F. */
export const MAX_OPTION_COUNT = 6;

type Side = 'en' | 'zh';

/** The most options Enter on the last one may make on this paper. */
export function optionLimit(worksheet: Worksheet): number {
  return documentShape(worksheet) === 'paper1' ? STANDARD_OPTION_COUNT : MAX_OPTION_COUNT;
}

/** What Enter on an MC's last option does: add the next, take this one away, or finish. */
export type LastOptionEnter = 'add' | 'remove' | undefined;

export function lastOptionEnter(worksheet: Worksheet, questionId: string, optionId: string, side: Side): LastOptionEnter {
  const question = mcq(worksheet, questionId);
  if (!question) return undefined;
  const index = question.options.findIndex((option) => option.id === optionId);
  if (index < 0 || index !== question.options.length - 1) return undefined;
  const option = question.options[index];
  if (!isRichTextEmpty(option.text[side] ?? [])) {
    return question.options.length < optionLimit(worksheet) ? 'add' : undefined;
  }
  const removable =
    index >= STANDARD_OPTION_COUNT &&
    question.answerIndex !== index &&
    isBiTextEmpty(option.text) &&
    areBlocksEmpty(option.blocks) &&
    isBiTextEmpty(option.rationale) &&
    !option.pinned;
  return removable ? 'remove' : undefined;
}

/** `worksheet` with an empty option `id` after the question's last one (the key stays put). */
export function addOptionAfterLast(worksheet: Worksheet, questionId: string, id: string): Worksheet {
  return mapMcq(worksheet, questionId, (question) =>
    question.options.length >= optionLimit(worksheet)
      ? question
      : { ...question, options: [...question.options, { id, text: emptyBiText() }] },
  );
}

/** `worksheet` without the question's last option, when Enter may take it away (§ `lastOptionEnter`). */
export function removeEmptyLastOption(worksheet: Worksheet, questionId: string, optionId: string, side: Side): Worksheet {
  if (lastOptionEnter(worksheet, questionId, optionId, side) !== 'remove') return worksheet;
  return mapMcq(worksheet, questionId, (question) => ({ ...question, options: question.options.slice(0, -1) }));
}

function mcq(worksheet: Worksheet, questionId: string): McqQuestion | undefined {
  const question = worksheet.questions.find((q) => q.id === questionId);
  return question?.type === 'mcq' ? question : undefined;
}

function mapMcq(worksheet: Worksheet, questionId: string, change: (question: McqQuestion) => McqQuestion): Worksheet {
  let changed = false;
  const questions = worksheet.questions.map((question) => {
    if (question.id !== questionId || question.type !== 'mcq') return question;
    const next = change(question);
    changed = next !== question;
    return next;
  });
  return changed ? { ...worksheet, questions } : worksheet;
}
