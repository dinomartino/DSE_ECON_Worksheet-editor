import { questionMarks } from '@/model/marks';
import type { Question } from '@/model/types';
import type { QualityQuestion } from '@/quality/types';
import type { MarkedUnit } from './types';

/**
 * The marked units of a question, read from its `qualityView` anchors (no type branching):
 * every leaf part or sub-part, except that sub-parts sharing one marks label are one unit
 * with their part, so marks are never invented. A question with no parts is one unit worth
 * its marks (an MC question).
 */
export function markedUnits(view: QualityQuestion, question: Question | undefined, qKey: string): MarkedUnit[] {
  const parts = view.anchors.filter((anchor) => anchor.role === 'part');
  const whole = (): MarkedUnit[] => [{ key: qKey, label: '', marks: question ? questionMarks(question) : 0 }];
  if (parts.length === 0) return whole();
  const within = (inner: string, outer: string) => inner !== outer && inner.startsWith(outer);
  const unit = (anchor: (typeof parts)[number]): MarkedUnit => ({
    key: `${qKey}.${anchor.ref.replace(/\s+/g, '')}`,
    label: anchor.label,
    marks: anchor.marks ?? 0,
  });
  const units: MarkedUnit[] = [];
  for (const part of parts) {
    if (parts.some((other) => within(part.ref, other.ref))) continue; // a sub-part: handled under its part
    const subs = parts.filter((other) => within(other.ref, part.ref));
    if (subs.some((sub) => sub.marks !== undefined)) units.push(...subs.map(unit));
    else units.push(unit(part));
  }
  return units.length ? units : whole();
}
