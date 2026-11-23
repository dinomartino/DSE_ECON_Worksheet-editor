import type { BiDraft, McqDraft } from '@/generate/types';
import { toRuns, visible } from '@/generate/validate';
import { plain } from '@/model/text';
import type { Side } from '@/model/textSlots';
import type { Finding } from './types';

/**
 * Item lint: the cues that make a multiple-choice question easy without knowing the
 * subject (the key is the longest option, options of very different length, "all of the
 * above", a negative stem not in bold, a key always in the same place). The repo's own
 * research (docs/design/ai-pattern-questions.md): about half of AI-written items have
 * such flaws. Findings are notes to read, never a block.
 */

/** The key is this much longer than the next longest option. */
const LONGEST_RATIO = 1.25;
/** Options are this far apart in length (longest ÷ shortest) and by at least this many characters. */
const UNEVEN_RATIO = 2.5;
const UNEVEN_GAP = 25;
/** Below this length every option is short and length says nothing. */
const SHORT = 18;

const ALL_NONE_EN = /\b(?:all|none|both)\s+of\s+the\s+above\b|\bnone\s+of\s+these\b|\ball\s+of\s+these\b/i;
const ALL_NONE_ZH = /以上(?:皆是|皆非|全部|全對|全錯|都是|都不是|皆對|皆錯)|皆非|全部皆是|以上(?:兩項|三項)/;

/** A negative cue in the stem: HKEAA prints these in bold capitals (**NOT**). */
const NEGATIVE_EN = /\b(?:not|except|least|incorrect|false)\b/i;
const NEGATIVE_ZH = /並非|不正確|錯誤|除[^，。]{0,14}外|最不|(?:何者|哪項|哪一項|哪個)不是/;

const lengthOf = (text: string) => visible(text).replace(/\s+/g, ' ').length;

/** The first side with every option written: the side the length checks read. */
function readableSide(draft: McqDraft, sides: readonly Side[]): Side | null {
  return sides.find((side) => draft.options.length > 0 && draft.options.every((o) => visible(o[side]))) ?? null;
}

/** The sentence that asks the question: a "not" in a scenario sentence is not a negative question. */
function lastSentence(text: string): string {
  return text.trim().split(/(?<=[.?!。？！])\s*/).filter(Boolean).at(-1) ?? '';
}

function negativeStem(stem: BiDraft, side: Side): boolean {
  const cue = side === 'en' ? NEGATIVE_EN : NEGATIVE_ZH;
  const runs = toRuns(stem[side]);
  // Bold means the cue itself is bold (**NOT**), not that something else in the stem is.
  return cue.test(lastSentence(plain(runs))) && !runs.some((run) => run.bold && cue.test(run.text));
}

/** Lint findings for one draft. The key must be an index 0–3 (a draft with a bad key fails earlier). */
export function lintDraft(draft: McqDraft, sides: readonly Side[]): Finding[] {
  const out: Finding[] = [];
  const side = readableSide(draft, sides);
  const combination = draft.statements.length >= 2;

  if (side && draft.options.length === 4 && !combination) {
    const lengths = draft.options.map((o) => lengthOf(o[side]));
    const key = lengths[draft.answerIndex];
    const others = lengths.filter((_, i) => i !== draft.answerIndex);
    if (key !== undefined && Math.max(...lengths) >= SHORT && key >= Math.max(...others) * LONGEST_RATIO) out.push({ id: 'lint.keyLongest' });
    const longest = Math.max(...lengths);
    const shortest = Math.max(1, Math.min(...lengths));
    if (longest >= SHORT && longest / shortest >= UNEVEN_RATIO && longest - shortest >= UNEVEN_GAP) out.push({ id: 'lint.uneven' });
  }

  const optionText = (s: Side) => draft.options.map((o) => plain(toRuns(o[s])));
  if (sides.includes('en') && optionText('en').some((t) => ALL_NONE_EN.test(t))) out.push({ id: 'lint.allNone' });
  else if (sides.includes('zh') && optionText('zh').some((t) => ALL_NONE_ZH.test(t))) out.push({ id: 'lint.allNone' });

  const negative = sides.some((s) => visible(draft.stem[s]) && negativeStem(draft.stem, s));
  if (negative) out.push({ id: 'lint.negativeStem' });
  return out;
}

const LETTERS = 'ABCD';

/**
 * Batch lint: a key letter used too often. With three or more drafts, one letter on more
 * than half of them (never fewer than three) is a pattern a student can learn.
 */
export function lintBatch(answers: readonly number[]): Finding[] {
  if (answers.length < 3) return [];
  const counts = [0, 0, 0, 0];
  for (const a of answers) if (a >= 0 && a <= 3) counts[a] += 1;
  const most = Math.max(...counts);
  if (most < 3 || most <= answers.length / 2) return [];
  return [{ id: 'lint.keySpread', params: { letter: LETTERS[counts.indexOf(most)], count: most, of: answers.length } }];
}
