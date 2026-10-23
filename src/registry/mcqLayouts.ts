import { mapSame } from '@/model/textSlots';
import type { LanguageMode, McqOptionLayout, McqQuestion, Worksheet } from '@/model/types';
import { resolveOptionLayout, suggestOptionLayout } from './mcq';

/**
 * Setting the option layout of every MC question at once (Setup → Option layout for all MC
 * questions; `docs/design/format-settings.md` § 4.1).
 *
 * Nothing new is stored. Each question keeps its own `optionLayout`, the field the MC panel
 * already writes, so the page, the thumbnails, the `.docx` and Copy for Word agree on it
 * through the IR with no code of their own, and one question can still be changed from its
 * panel afterwards. This file is only the rule for what a choice means for each question.
 */

/** `fit` asks `suggestOptionLayout` per question; the rest set every question the same. */
export type OptionLayoutChoice = 'fit' | McqOptionLayout;

/** In the order Setup offers them. */
export const OPTION_LAYOUT_CHOICES: readonly OptionLayoutChoice[] = ['fit', 'stacked', 'inline', 'columns2'];

/** How many MC questions sit in each layout (`resolveOptionLayout`, so what the panel shows). */
export interface OptionLayoutTally {
  total: number;
  stacked: number;
  inline: number;
  columns2: number;
}

/** What a choice would do: how many MC questions it would change, of how many. */
export interface OptionLayoutPlan {
  total: number;
  changes: number;
  /** Questions the choice cannot apply to (figure options asked to go in a row); left as they are. */
  skipped: number;
}

const hasFigureOptions = (question: McqQuestion): boolean =>
  question.options.some((option) => (option.blocks?.length ?? 0) > 0);

/**
 * A question with figure options is never put in a row: one line of tab stops cannot hold a
 * picture per cell (`resolveOptionLayout`). Storing `inline` on it would be harmless today
 * and then reappear the day its figures are removed, so "all in a row" leaves it as it is.
 */
const cannotTake = (question: McqQuestion, choice: OptionLayoutChoice): boolean =>
  choice === 'inline' && hasFigureOptions(question);

/**
 * The layout to write on `question`, or `undefined` when it already is what the choice asks
 * (judged on `resolveOptionLayout`, so an absent field counts as stacked and stays absent).
 */
function layoutToWrite(
  question: McqQuestion,
  choice: OptionLayoutChoice,
  language: LanguageMode,
): McqOptionLayout | undefined {
  if (cannotTake(question, choice)) return undefined;
  const wanted = choice === 'fit' ? suggestOptionLayout(question, language) : choice;
  return wanted === resolveOptionLayout(question) ? undefined : wanted;
}

function mcqQuestions(worksheet: Worksheet): McqQuestion[] {
  return worksheet.questions.filter((question): question is McqQuestion => question.type === 'mcq');
}

/** Where the paper's MC questions stand now. */
export function optionLayoutTally(worksheet: Worksheet): OptionLayoutTally {
  const tally: OptionLayoutTally = { total: 0, stacked: 0, inline: 0, columns2: 0 };
  for (const question of mcqQuestions(worksheet)) {
    tally.total += 1;
    tally[resolveOptionLayout(question)] += 1;
  }
  return tally;
}

/** How many questions `choice` would change in `language` (the one the page is showing). */
export function planOptionLayouts(
  worksheet: Worksheet,
  choice: OptionLayoutChoice,
  language: LanguageMode,
): OptionLayoutPlan {
  const questions = mcqQuestions(worksheet);
  return {
    total: questions.length,
    changes: questions.filter((question) => layoutToWrite(question, choice, language) !== undefined).length,
    skipped: questions.filter((question) => cannotTake(question, choice)).length,
  };
}

/**
 * The paper with every MC question set to `choice`. `fit` measures the options in
 * `language`, as the panel's Fit to content does.
 *
 * Stacked is the default and is stored as absence, like `baseFontSize` at 11, so putting a
 * paper back to "all stacked" hands back questions identical to ones never touched (their
 * `contentKey` included). The same object when nothing changes, so `commit` records no
 * undo step for a no-op; otherwise every change lands in the one commit.
 */
export function withOptionLayouts(
  worksheet: Worksheet,
  choice: OptionLayoutChoice,
  language: LanguageMode,
): Worksheet {
  const questions = mapSame(worksheet.questions, (question) => {
    if (question.type !== 'mcq') return question;
    const layout = layoutToWrite(question, choice, language);
    if (layout === undefined) return question;
    const next: McqQuestion = { ...question, optionLayout: layout };
    if (layout === 'stacked') delete next.optionLayout;
    return next;
  });
  return questions === worksheet.questions ? worksheet : { ...worksheet, questions };
}
