import { anchorSchemeMismatch } from '@/model/markScheme';
import { plain } from '@/model/text';
import type { QualityAnchor } from '@/registry/types';
import type { QualityFinding, QualityQuestion } from './types';

/** "Question 3 (b)", "Question 5 · Option C", "Question 2". */
export function whereOf(question: QualityQuestion, anchor?: QualityAnchor): string {
  if (!anchor || !anchor.label) return question.where;
  return anchor.role === 'part' ? `${question.where} ${anchor.label}` : `${question.where} · ${anchor.label}`;
}

const marksWord = (n: number) => `${n} mark${n === 1 ? '' : 's'}`;

/** Statement numbers an option names: "(1) and (3) only" → [1, 3]; 中文 "（1）" too. */
function statementNumbers(anchor: QualityAnchor): number[] {
  const words = `${plain(anchor.text?.en)} ${plain(anchor.text?.zh)}`;
  return [...words.matchAll(/[(（]\s*(\d{1,2})\s*[)）]/g)].map((m) => Number(m[1]));
}

/**
 * The checks that need no model and never cost a call: a marking scheme that totals
 * differently from the printed marks, and an option naming a statement that isn't there.
 */
export function deterministicFindings(question: QualityQuestion): QualityFinding[] {
  const out: QualityFinding[] = [];
  const add = (anchor: QualityAnchor, finding: Pick<QualityFinding, 'issue' | 'message'>) =>
    out.push({
      id: `check:${question.questionId}:${anchor.ref}:${finding.issue}`,
      questionId: question.questionId, anchor, where: whereOf(question, anchor), severity: 'fix', from: 'check', ...finding,
    });

  for (const anchor of question.anchors) {
    const mismatch = anchorSchemeMismatch(anchor);
    if (mismatch) {
      add(anchor, {
        issue: 'schemeMarks',
        message: `The marking scheme awards ${marksWord(mismatch.scheme)}, but the paper prints ${marksWord(mismatch.printed)}.`,
      });
    }
  }

  const statements = question.anchors.filter((anchor) => anchor.role === 'statement').length;
  if (statements > 0) {
    for (const anchor of question.anchors) {
      if (anchor.role !== 'option') continue;
      const missing = [...new Set(statementNumbers(anchor).filter((n) => n < 1 || n > statements))];
      if (missing.length) {
        add(anchor, {
          issue: 'statementRange',
          message: `This option names statement ${missing.map((n) => `(${n})`).join(', ')}, but the question has only ${statements}.`,
        });
      }
    }
  }
  return out;
}
