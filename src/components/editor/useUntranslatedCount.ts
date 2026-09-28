import { useMemo } from 'react';
import { mapWorksheetTexts, needsTranslation, questionUntranslated } from '@/model/textWalk';
import type { OutputMode, Question, Worksheet } from '@/model/types';

type CountMode = Pick<OutputMode, 'language' | 'version'>;

/** Per question object and mode: an edit elsewhere never re-walks an untouched question. */
const perQuestion = new WeakMap<Question, Map<string, number>>();

function questionCount(question: Question, mode: CountMode): number {
  const key = `${mode.language}|${mode.version}`;
  let byMode = perQuestion.get(question);
  if (!byMode) perQuestion.set(question, (byMode = new Map()));
  let count = byMode.get(key);
  if (count === undefined) {
    count = questionUntranslated(question, mode);
    byMode.set(key, count);
  }
  return count;
}

/** `countUntranslated`, with each question's share cached on the question object. */
export function untranslatedCount(worksheet: Worksheet, mode: CountMode): number {
  let outside = 0;
  mapWorksheetTexts(
    worksheet,
    (slot) => {
      if (needsTranslation(slot, mode)) outside += 1;
      return slot.text;
    },
    { skipQuestions: true },
  );
  return worksheet.questions.reduce((sum, question) => sum + questionCount(question, mode), outside);
}

/** The toolbar pill: strings this edition prints in one language only. */
export function useUntranslatedCount(worksheet: Worksheet, mode: CountMode): number {
  const { language, version } = mode;
  return useMemo(() => untranslatedCount(worksheet, { language, version }), [worksheet, language, version]);
}
