/**
 * AI wording enhancement (k-0549): an existing MC question reworded to the HKDSE house style
 * (`src/dseStyle`), offered field by field. The editor's verb is `assist/verbs/polish.ts`.
 */
export { applyPolishEdits, type PolishEdit } from './apply';
export { polishQuestions } from './collect';
export { diffText, type DiffPart } from './diff';
export { numbersMoved, orderMoved, questionWith } from './guard';
export { POLISH_MARKER, POLISH_PROMPT_VERSION, SYSTEM_POLISH, buildRequest, parsePolishReply } from './prompt';
export { changesOf, runPolish, tidyRuns } from './run';
export type * from './types';
