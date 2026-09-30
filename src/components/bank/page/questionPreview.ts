import { questionClipboardHtml } from '@/export/clipboard';
import { cssFontFamilies } from '@/model/fonts';
import { computeNumbering } from '@/model/numbering';
import { contentWidth, pageSetupOf } from '@/model/page';
import type { LanguageMode, OutputMode, VersionMode, Worksheet } from '@/model/types';
import { diagramImages } from '@/components/start/thumbnail';

/**
 * One bank question as its paper prints it (Teacher version by default), for the bank
 * screen's preview.
 *
 * The same route as the start screen's thumbnails: the IR's clipboard reader (so content,
 * answers and mark schemes can never disagree with the export), diagrams as SVG data URLs.
 * The question is rendered alone in its own document's page setup and fonts, under the
 * number it has in that document (the facts say "Q24", so the paper does too). Answer
 * space is left out: a preview is for reading, not writing in.
 */

/** A copy of `worksheet` holding only this question, with nothing that prints around it. */
export function oneQuestionWorksheet(worksheet: Worksheet, questionId: string): Worksheet | undefined {
  const question = worksheet.questions.find((q) => q.id === questionId);
  if (!question) return undefined;
  return {
    ...worksheet,
    questions: [question],
    layout: [],
    flow: [{ type: 'question', id: question.id }],
    bands: undefined,
    versions: undefined,
  };
}

export interface QuestionPreview {
  html: string;
  /** The text column's width at 96dpi: the width the HTML is laid out at before scaling. */
  widthPx: number;
}

/** Paper typography (as `thumbnail.ts`): no paragraph margins, the fixed 12pt line. Literal hex. */
const PREVIEW_CSS =
  ':host{all:initial;display:block}' +
  '.sheet{box-sizing:border-box;background:#ffffff;color:#111111;color-scheme:light;text-align:left}' +
  '.sheet *{line-height:max(12pt,calc(12em / 11))}' +
  '.sheet p,.sheet h1,.sheet h2,.sheet h3,.sheet ul,.sheet ol,.sheet li{margin-block:0}' +
  '.sheet hr{margin:6px 0}' +
  '.sheet img{max-width:100%;height:auto}' +
  // ✦ review marks (`PaperPreview`'s `marks`): the editor's page colours, screen only.
  '.sheet [data-ai-mark]{text-decoration-line:underline;text-decoration-thickness:1.5px;text-underline-offset:3px;text-decoration-skip-ink:none;border-radius:2px}' +
  '.sheet [data-ai-mark="inserted"]{background-color:#eef6fc;text-decoration-color:#0d77c9}' +
  '.sheet [data-ai-mark="look"]{background-color:#fdf1d8;text-decoration-color:#c27c0e}' +
  '.sheet [data-ai-mark="finding"]{text-decoration-style:wavy;text-decoration-thickness:1px;text-decoration-color:#c27c0e}';

const bodyOf = (html: string) => /<body style="[^"]*">([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';

export function questionPreviewHtml(
  worksheet: Worksheet,
  questionId: string,
  language: LanguageMode,
  version: VersionMode = 'teacher',
): QuestionPreview | undefined {
  const single = oneQuestionWorksheet(worksheet, questionId);
  if (!single) return undefined;
  const mode: OutputMode = { language, version, omitAnswerSpace: true };
  const number = computeNumbering(worksheet).byQuestionId.get(questionId)?.number;
  const body = bodyOf(questionClipboardHtml(single, questionId, mode, diagramImages(single, mode), number));
  // The clipboard writes its paste size (12pt); the page prints at the document's body size.
  const family = `font-family:${cssFontFamilies(worksheet.fonts, "'", ',')},serif;`;
  const printed = `${family}font-size:${worksheet.baseFontSize ?? 11}pt;`;
  const html = body.split(`${family}font-size:12pt;`).join(printed);
  const widthPx = contentWidth(pageSetupOf(single)) / 15;
  return {
    widthPx,
    html:
      `<style>${PREVIEW_CSS}</style>` +
      `<div class="sheet" lang="${language === 'zh' ? 'zh-HK' : 'en'}" style="width:${widthPx}px;${printed}">${html}</div>`,
  };
}
