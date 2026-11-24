import { computeNumbering } from '@/model/numbering';
import { isRichTextEmpty, plain } from '@/model/text';
import type { Side, TextSlot } from '@/model/textSlots';
import { collectTexts } from '@/model/textWalk';
import type { McqQuestion, Worksheet } from '@/model/types';
import { slotInScope } from '@/translate/plan';
import type { TranslateScope } from '@/translate/types';
import type { PolishField, PolishFieldKind, PolishQuestion } from './types';

/**
 * The MC questions in scope, each with the texts the AI may reword: the stem's paragraphs,
 * the statements and each option's line, in printed order. Table cells, captions, pictures,
 * option figures and the teacher's notes are never offered (a table goes as read-only
 * context, `styleItemOf`). Questions with no words are left out.
 */

const LETTERS = 'ABCDEFGH';

function fieldKind(slot: TextSlot): PolishFieldKind | null {
  if (slot.role !== 'print' || slot.unprinted) return null;
  if (slot.kind === 'stem' && slot.target?.kind === 'blockText') return 'stem';
  if (slot.kind === 'statement') return 'statement';
  if (slot.kind === 'option' && slot.target?.kind === 'mcqOption') return 'option';
  return null;
}

/** Only the stem paragraphs directly in the question (not inside a source or figure row). */
function topLevelStem(slot: TextSlot, question: McqQuestion): boolean {
  return slot.target?.kind === 'blockText' && question.blocks.some((b) => b.kind === 'paragraph' && b.id === (slot.target as { blockId: string }).blockId);
}

export function polishQuestions(ws: Worksheet, scope: TranslateScope, slots: readonly TextSlot[] = collectTexts(ws)): PolishQuestion[] {
  const direct = scope.kind === 'questions' || scope.kind === 'flowItems' ? new Set(scope.ids) : null;
  const touched = new Set<string>();
  if (scope.kind !== 'paper' && !direct) {
    for (const slot of slots) if (slot.questionId && slotInScope(slot, scope)) touched.add(slot.questionId);
  }
  const out: PolishQuestion[] = [];
  for (const { question } of computeNumbering(ws).questions) {
    if (question.type !== 'mcq') continue;
    if (scope.kind !== 'paper' && !(direct ?? touched).has(question.id)) continue;
    const fields: PolishField[] = [];
    let stems = 0;
    let statements = 0;
    for (const slot of slots) {
      if (slot.questionId !== question.id) continue;
      const kind = fieldKind(slot);
      if (!kind || (kind === 'stem' && !topLevelStem(slot, question))) continue;
      const qKey = `q${out.length + 1}`;
      const index = kind === 'option' ? question.options.findIndex((o) => slot.target?.kind === 'mcqOption' && o.id === slot.target.optionId) : -1;
      const key = kind === 'stem' ? `${qKey}.stem${(stems += 1)}` : kind === 'statement' ? `${qKey}.s${(statements += 1)}` : `${qKey}.${LETTERS[index] ?? index}`;
      fields.push({ key, kind, path: slot.path, ...(slot.target ? { target: slot.target } : {}), where: [slot.group.label, slot.label].filter(Boolean).join(' · '), text: slot.text });
    }
    const sides = (['en', 'zh'] as const).filter((side) => fields.some((f) => !isRichTextEmpty(f.text[side]) && plain(f.text[side]).trim() !== ''));
    if (sides.length === 0) continue;
    out.push({ questionId: question.id, key: `q${out.length + 1}`, question, fields, sides: [...sides] as Side[], answer: LETTERS[question.answerIndex] ?? '' });
  }
  return out;
}
