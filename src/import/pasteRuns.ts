/**
 * A paste into a text on the page (k-0201, `docs/design/paste-import.md` § 14). Pure: no DOM.
 *
 *  - `pastedRuns`: what lands in the text. Word's clipboard HTML (or any web page's) read
 *    by the engine's own `readHtml`, kept to the run attributes the model can print: bold,
 *    italic, underline, sub/superscript, and tabs. Fonts, sizes, colours and highlight are
 *    dropped, so the words take the formatting at the caret (`replaceRichTextRangeWithRuns`).
 *    The plain text wins when the HTML carries less of it, as `readPaste` decides.
 *  - `pastedQuestions`: whether the paste reads as questions ("1.", "(a)", "A.", "(2 marks)"),
 *    for the "Make these into questions" offer; the same engine as Import from Word.
 */
import { analyseLines, buildImport, readPaste, type ImportBatch } from './index';
import { readHtml } from './readHtml';
import type { RawLine, RawRun } from './readPlain';
import type { InlineRun, RichText } from '@/model/types';

export interface ClipboardText {
  html?: string;
  text?: string;
}

const keep = (run: RawRun): InlineRun => ({
  text: run.text,
  ...(run.bold ? { bold: true } : {}),
  ...(run.italic ? { italic: true } : {}),
  ...(run.underline ? { underline: true } : {}),
  ...(run.vertAlign ? { vertAlign: run.vertAlign } : {}),
});

const ink = (text: string) => text.replace(/\s/g, '').length;

function lineRuns(line: RawLine): InlineRun[] {
  // A table row comes in as its cells, a tab between each, as Word's own plain text has it.
  const body = line.cells
    ? line.cells.flatMap((cell, index) => [...(index > 0 ? [{ text: '\t' }] : []), ...cell.map(keep)])
    : line.runs.map(keep);
  // A list's number is not in the runs (Word draws it); the plain text has it with a tab.
  return line.listLabel ? [{ text: `${line.listLabel}\t` }, ...body] : body;
}

/** The plain text a paste carries, as a field stores it: `\n` line breaks, no last one. */
export function cleanPlainText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
}

/** The runs a paste puts in a text; empty when it carries no text. */
export function pastedRuns({ html, text = '' }: ClipboardText): RichText {
  const plain = cleanPlainText(text);
  if (html?.trim()) {
    // Pictures in Word's HTML point at files on the teacher's computer: nothing to read, so a
    // line that is only a picture adds nothing, and trailing empty lines are dropped.
    const lines = readHtml(html).filter((line) => !line.pageBreak);
    while (lines.length > 0 && lineRuns(lines[lines.length - 1]).every((run) => !run.text.trim()) && !lines[lines.length - 1].cells) lines.pop();
    const runs: InlineRun[] = lines.flatMap((line, index) => [...(index > 0 ? [{ text: '\n' }] : []), ...lineRuns(line)]);
    const fromHtml = runs.map((run) => run.text).join('');
    if (ink(fromHtml) > 0 && ink(fromHtml) >= ink(plain) * 0.6) return mergeRuns(runs);
  }
  return plain ? [{ text: plain }] : [];
}

function mergeRuns(runs: InlineRun[]): RichText {
  const out: InlineRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const last = out[out.length - 1];
    if (
      last &&
      last.bold === run.bold &&
      last.italic === run.italic &&
      last.underline === run.underline &&
      last.vertAlign === run.vertAlign
    ) {
      out[out.length - 1] = { ...last, text: last.text + run.text };
    } else out.push({ ...run });
  }
  return out;
}

/**
 * The questions a paste would make, when it reads as questions: two numbered questions or
 * more, or one numbered question with options or parts. Undefined for ordinary prose, a
 * single sentence, or a list the engine cannot number.
 */
export function pastedQuestions({ html, text }: ClipboardText): ImportBatch | undefined {
  if (!text?.trim() && !html?.trim()) return undefined;
  const analysis = analyseLines(readPaste({ plain: text ?? '', html: html ?? '' }));
  if (analysis.kind !== 'ok') return undefined;
  const numbered = analysis.outline.questions.filter((question) => question.label !== undefined);
  const looksLikeQuestions =
    numbered.length >= 2 ||
    (numbered.length === 1 && (numbered[0].options.length >= 2 || numbered[0].parts.length >= 1));
  if (!looksLikeQuestions) return undefined;
  const batch = buildImport(analysis);
  return batch.builds.length > 0 ? batch : undefined;
}
