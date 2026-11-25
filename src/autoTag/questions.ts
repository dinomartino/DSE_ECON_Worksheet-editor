import type { Side } from '@/model/textSlots';
import type { Worksheet } from '@/model/types';
import { anchorEmpty, anchorText, qualityQuestions } from '@/quality/collect';
import type { TagQuestion } from './types';

/**
 * What the AI reads of one question (k-0560): its printed words through the registry's
 * `qualityView` (as the coverage check reads them), in the language it is mostly written
 * in, the other only where an entry has nothing on that side. Undefined for a question
 * with no words, or a type without a view: nothing is spent on it.
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
  return { key, rootId, format: view.format, entries, ...(patterns && Object.keys(patterns).length > 0 ? { patterns } : {}) };
}
