import { paperKind } from '@/model/documentShape';
import type { Side } from '@/model/textSlots';
import type { LanguageMode, Worksheet } from '@/model/types';
import type { Recipe } from './types';

/**
 * What a source becomes on this document: only what its own paper can contain
 * (§ A document offers only what its own paper can contain). Paper 1 is answered on a
 * separate sheet, so it gets MCQs only; a Question-Answer Book or LQ worksheet gets one
 * structured question; a classroom worksheet a mix. Derived, never stored.
 */
export function recipeFor(worksheet: Worksheet): Recipe {
  const shape = paperKind(worksheet);
  if (shape === 'paper1') {
    return { paper: 'paper1', mcq: 4, structured: 0, combination: 1, marks: { min: 0, max: 0 }, sourceAs: 'stimulus', answerSpace: false };
  }
  if (shape === 'lqMock' || shape === 'lqWorksheet') {
    return {
      paper: shape,
      mcq: 0,
      structured: 1,
      combination: 0,
      marks: { min: 8, max: 12 },
      sourceAs: 'sourceBlock',
      answerSpace: true,
    };
  }
  return { paper: 'classroom', mcq: 3, structured: 1, combination: 1, marks: { min: 3, max: 6 }, sourceAs: 'stimulus', answerSpace: false };
}

/** The sides this edition prints; the model writes exactly these. */
export function sidesFor(language: LanguageMode): Side[] {
  return language === 'bilingual' ? ['en', 'zh'] : [language];
}

const CJK = /[㐀-鿿豈-﫿]/g;
const LATIN_WORD = /[A-Za-z]+/g;

/** The side a pasted source is written in: Chinese when its characters outnumber English words. */
export function sourceSideOf(source: string): Side {
  const cjk = source.match(CJK)?.length ?? 0;
  const words = source.match(LATIN_WORD)?.length ?? 0;
  return cjk > words ? 'zh' : 'en';
}

/** Dotted lines for a part in a booklet: the seeded sample's rhythm (2 marks → 5, 4 → 8). */
export function answerSpaceFor(marks: number): number {
  return Math.round(marks * 1.5) + 2;
}
