import { questionTagSlots } from '@/model/tagSlots';
import type { Side } from '@/model/textSlots';
import type { Question, Worksheet } from '@/model/types';
import { anchorEmpty, anchorText, qualityQuestions } from '@/quality/collect';
import type { TagEntry, TagPart, TagQuestion } from './types';

/**
 * The parts to tag one by one (u-g13t): each leaf slot (a part without sub-parts, or a
 * sub-part) whose part entry has words, in print order; none unless there are two. A part
 * entry carries the slot's label ("(b)(ii)": the registry prints both from the same labels).
 */
export function tagPartsOf(question: Question, entries: readonly TagEntry[]): TagPart[] {
  const worded = new Set(entries.filter((entry) => entry.role === 'part' && entry.label).map((entry) => entry.label));
  const parts = questionTagSlots(question)
    .filter((slot) => slot.leaf && worded.has(slot.label))
    .map((slot) => ({ label: slot.label, slot: slot.key }));
  return parts.length >= 2 ? parts : [];
}

/**
 * What the AI reads of one question (k-0560): its printed words through the registry's
 * `qualityView` (as the coverage check reads them), in the language it is mostly written
 * in, the other only where an entry has nothing on that side. Undefined for a question
 * with no words, or a type without a view: nothing is spent on it. A question with two or
 * more parts with words carries them (`parts`): the AI tags each.
 */
export function tagQuestionOf(
  worksheet: Worksheet,
  questionId: string,
  rootId: string,
  key: string,
  patterns?: TagQuestion['patterns'],
): TagQuestion | undefined {
  const [view] = qualityQuestions(worksheet, { kind: 'questions', ids: [questionId] });
  if (!view) return undefined;
  const anchors = view.anchors.filter((anchor) => !anchorEmpty(anchor));
  if (anchors.length === 0) return undefined;
  const length = (side: Side) => anchors.reduce((n, anchor) => n + anchorText(anchor, side).length, 0);
  const side: Side = length('zh') > length('en') ? 'zh' : 'en';
  const other: Side = side === 'en' ? 'zh' : 'en';
  const entries = anchors
    .map((anchor) => ({
      role: anchor.role,
      ...(anchor.label ? { label: anchor.label } : {}),
      text: anchorText(anchor, side) || anchorText(anchor, other),
      ...(anchor.keyed ? { keyed: true as const } : {}),
    }))
    .filter((entry) => entry.text.trim() !== '');
  if (entries.length === 0) return undefined;
  const question = worksheet.questions.find((q) => q.id === questionId);
  const parts = question ? tagPartsOf(question, entries) : [];
  return {
    key,
    rootId,
    format: view.format,
    entries,
    ...(patterns && Object.keys(patterns).length > 0 ? { patterns } : {}),
    ...(parts.length > 0 ? { parts } : {}),
  };
}
