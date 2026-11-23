/**
 * AI-made diagrams (k-0515). The one call an engine needs:
 *
 *   const out = await generateDiagram({ question, key, sides, reference }, { client, preset }, signal);
 *   if (out.ok && out.block) …insert out.block where out.spec.placement says…
 *
 * - `question`, `key`: plain text, any language (for an MCQ: stem, statements, options;
 *   key = the correct option and its explanation).
 * - `reference`: a past question's figure, to make a similar but new one: an editor
 *   `diagram` (described in words, works on every provider), an `image` (sent only when
 *   `deps.completeWithImages` is given; `imageSkipped` says when it was not), or `text`.
 * - `out.status`: 'ok' | 'look' (insert, ask the teacher to check `issues`) | 'failed'
 *   (no block; never insert) | 'none' (the question needs no figure).
 * - `out.spec.placement`: 'question' (print with the question) or 'answer' (the model
 *   answer diagram: `QuestionPart.answerDiagram`).
 *
 * The block is an ordinary editable diagram (`model/diagram.ts`): the teacher drags,
 * re-labels and re-shades it in the diagram editor like one they drew.
 */
export { generateDiagram, evaluateReply, blockOf, languageOf } from './run';
export { compileSpec } from './compile';
export { checkAgainstKey, checkDiagram, diagramChanges, keyClaims } from './validate';
export { describeDiagram } from './describe';
export { DIAGRAM_SPEC_SCHEMA, emptySpec, parseSpec } from './schema';
export { buildDiagramRequest, systemPrompt } from './prompt';
export type * from './types';
