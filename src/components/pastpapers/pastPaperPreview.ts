import { diagramImages } from '@/components/start/thumbnail';
import { questionClipboardHtml, worksheetClipboardHtml } from '@/export/clipboard';
import { cssFontFamilies } from '@/model/fonts';
import { contentWidth, pageSetupOf } from '@/model/page';
import type { LanguageMode, OutputMode, Worksheet } from '@/model/types';
import type { PastPaperItem } from '@/pastpapers/pack';

/**
 * One past-paper question as it prints, for the Past paper bank's cards (k-0443): through
 * the IR's clipboard reader, as the 題庫 preview (`bank/page/questionPreview.ts`), so the
 * card can never disagree with what a copy prints. The question keeps its number in the
 * paper it came from; a shared stimulus is drawn above it on its own, its range read as
 * "the questions below" (no numbers yet: a copy gets them from the paper it lands in).
 */

const PREVIEW_CSS =
  ':host{all:initial;display:block}' +
  '.sheet{box-sizing:border-box;background:#ffffff;color:#111111;color-scheme:light;text-align:left}' +
  '.sheet *{line-height:max(12pt,calc(12em / 11))}' +
  '.sheet p,.sheet h1,.sheet h2,.sheet h3,.sheet ul,.sheet ol,.sheet li{margin-block:0}' +
  '.sheet img{max-width:100%;height:auto}' +
  '.sheet .stimulus{padding-bottom:8px;margin-bottom:8px;border-bottom:1px dashed #c9c4ba}' +
  // The gap a question keeps above itself on a paper: nothing to read on a card.
  '.sheet>p:first-child,.sheet>.stimulus>p:first-child,.sheet>.stimulus+p{margin-top:0!important}';

const bodyOf = (html: string) => /<body style="[^"]*">([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';

export interface PastPaperPreview {
  html: string;
  widthPx: number;
}

/** Blank lines the question carries above itself (its gap on a paper): nothing to read on a card. */
const withoutLeadingBlanks = (html: string) => html.replace(/^(?:\s*<p[^>]*>(?:&nbsp;|\s|<br\s*\/?>)*<\/p>)+/, '');

/** The Student version: the card's own chip says the answer, so the paper never repeats it. */
export function pastPaperPreviewHtml(item: PastPaperItem, doc: Worksheet, language: LanguageMode): PastPaperPreview | undefined {
  const base: Worksheet = { ...doc, bands: undefined, versions: undefined, layout: [], questions: [], flow: [] };
  const single: Worksheet = { ...base, questions: [item.question], flow: [{ type: 'question', id: item.question.id }] };
  const mode: OutputMode = { language, version: 'student', omitAnswerSpace: true };
  let body = withoutLeadingBlanks(bodyOf(questionClipboardHtml(single, item.question.id, mode, diagramImages(single, mode), item.source.number)));
  if (!body) return undefined;
  if (item.stimulus) {
    const lead: Worksheet = {
      ...base,
      title: { en: [], zh: [] },
      instructions: { en: [], zh: [] },
      layout: [item.stimulus],
      flow: [{ type: 'layout', id: item.stimulus.id }],
    };
    const stimulus = withoutLeadingBlanks(bodyOf(worksheetClipboardHtml(lead, mode, diagramImages(lead, mode))));
    if (stimulus) body = `<div class="stimulus">${stimulus}</div>${body}`;
  }
  const printed = `font-family:${cssFontFamilies(doc.fonts, "'", ',')},serif;font-size:${doc.baseFontSize ?? 11}pt;`;
  const widthPx = contentWidth(pageSetupOf(single)) / 15;
  return {
    widthPx,
    html:
      `<style>${PREVIEW_CSS}</style>` +
      `<div class="sheet" lang="${language === 'zh' ? 'zh-HK' : 'en'}" style="width:${widthPx}px;${printed}">${body}</div>`,
  };
}

/** The answer's letter (A, B…), for the card's chip; undefined when the question names none. */
export function answerLetter(item: PastPaperItem): string | undefined {
  const index = (item.question as { answerIndex?: unknown }).answerIndex;
  return typeof index === 'number' && index >= 0 && index < 26 ? String.fromCharCode(65 + index) : undefined;
}
