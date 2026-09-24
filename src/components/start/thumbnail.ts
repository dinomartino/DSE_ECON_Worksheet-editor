import { COVER_PANEL } from '@/model/cover';
import { contentWidth, pageDimensions, pageSetupOf } from '@/model/page';
import { answerGraphBox, answerGraphSvgDataUrl } from '@/render/answerGraph';
import type { FontPair, LanguageMode, OutputMode, Worksheet } from '@/model/types';
import { diagramSvgDataUrl } from '@/render/diagram';
import type { CoverRenderNode, RenderNode } from '@/render/ir';
import { renderWorksheet } from '@/render/worksheet';
import {
  escapeHtml,
  formatCss,
  questionClipboardHtml,
  richHtml,
  worksheetClipboardHtml,
  worksheetPlainText,
} from '@/export/clipboard';
import {
  collectAnswerGraphNodes,
  collectDiagramNodes,
  type DiagramImageMap,
} from '@/export/diagramImage';

/**
 * The start screen's first-page thumbnail, derived live from a saved document.
 *
 * The body comes from the clipboard backend — the IR's self-contained, inline-styled
 * HTML reader — so a thumbnail can never disagree with the export about content, order
 * or numbering. Nothing is stored: a thumbnail is recomputed from the document, cached
 * in memory only (`localStorage` is the teachers' documents' quota).
 *
 * The clipboard deliberately drops the cover, so a cover is drawn here from its own IR
 * region frame, mirroring `CoverSheet` in the preview.
 */

const TWIPS_PER_PX = 15; // 1440 twips/in ÷ 96 px/in

export interface ThumbnailPage {
  widthPx: number;
  heightPx: number;
  marginPx: { top: number; right: number; bottom: number; left: number };
}

/** The first page's box at 96dpi, from the same twips Word gets. */
export function thumbnailPage(worksheet: Worksheet): ThumbnailPage {
  const setup = pageSetupOf(worksheet);
  const { width, height } = pageDimensions(setup);
  const { top, right, bottom, left } = setup.margins;
  return {
    widthPx: width / TWIPS_PER_PX,
    heightPx: height / TWIPS_PER_PX,
    marginPx: {
      top: top / TWIPS_PER_PX,
      right: right / TWIPS_PER_PX,
      bottom: bottom / TWIPS_PER_PX,
      left: left / TWIPS_PER_PX,
    },
  };
}

/**
 * Which side to print. The document stores no view language (the editor opens in
 * English), so this is English unless the English side is essentially empty — a
 * Chinese-only paper would otherwise show as bare numbers. Latin letters and CJK
 * characters are counted separately because one Chinese character carries roughly
 * what three or four letters do; derived text ("(4 marks)") keeps a little English
 * in every document, which the threshold absorbs.
 */
export function thumbnailLanguage(worksheet: Worksheet): LanguageMode {
  const latin = (worksheetPlainText(worksheet, { language: 'en', version: 'student' })
    .match(/[A-Za-z]/g) ?? []).length;
  const cjk = (worksheetPlainText(worksheet, { language: 'zh', version: 'student' })
    .match(/[㐀-鿿豈-﫿]/g) ?? []).length;
  return cjk > 0 && latin < cjk ? 'zh' : 'en';
}

/** Student version: what prints, without the teacher's answers over it. */
export function thumbnailMode(worksheet: Worksheet): OutputMode {
  return { language: thumbnailLanguage(worksheet), version: 'student' };
}

/** Whether page 1 is the cover (a mock exam), rather than the first body page. */
export function thumbnailShowsCover(worksheet: Worksheet): boolean {
  return Boolean(worksheet.cover);
}

/* ------------------------------------------------------------------------------------ */
/* HTML                                                                                 */
/* ------------------------------------------------------------------------------------ */

/**
 * Paper typography, mirroring `.paper` in `globals.css`: no paragraph margins, and a
 * fixed 12pt line that scales with the size above 11pt (`exactLineFor`). Declared per
 * element so `em` resolves against each element's own size. Literal hex: on-paper.
 */
const THUMBNAIL_CSS =
  ':host{all:initial;display:block}' +
  '.page{position:relative;box-sizing:border-box;overflow:hidden;background:#ffffff;' +
  'color:#111111;color-scheme:light;text-align:left}' +
  '.page *{line-height:max(12pt,calc(12em / 11))}' +
  '.page p,.page h1,.page h2,.page h3,.page ul,.page ol,.page li{margin-block:0}' +
  '.page hr{margin:6px 0}' +
  '.page img{max-width:100%}' +
  // A 1px dotted rule shrunk to a card's width aliases into dashes; a pale solid line
  // reads as the dotted answer line it stands for.
  '.page p[style*="dotted"]{border-bottom:1px solid #a6a6a6 !important}';

const PAGE_BREAK = '<p style="page-break-before:always"></p>';

function fontFamily(fonts: FontPair): string {
  return `font-family:'${fonts.latin}','${fonts.eastAsia}',serif;`;
}

/**
 * Diagrams as SVG data URLs rather than the export's canvas-rasterised PNGs: the same
 * `diagramSvg` drawing, but it needs no canvas (so it works in node), costs no decode
 * pass, and an `<img>` scales a vector crisply.
 */
function diagramImages(worksheet: Worksheet, mode: OutputMode): DiagramImageMap {
  const images: DiagramImageMap = new Map();
  for (const node of collectDiagramNodes(worksheet, mode)) {
    try {
      images.set(
        node.blockId,
        diagramSvgDataUrl(node.diagram, {
          widthPx: node.widthPx,
          heightPx: node.heightPx,
          language: mode.language,
          fonts: worksheet.fonts,
        }),
      );
    } catch {
      // One bad figure leaves a gap, not a blank card.
    }
  }
  // Graph answer spaces, by the same rule and the same key the export uses.
  const textWidth = contentWidth(pageSetupOf(worksheet));
  for (const node of collectAnswerGraphNodes(worksheet, mode)) {
    const box = answerGraphBox(node, textWidth);
    images.set(
      node.key,
      answerGraphSvgDataUrl(node, {
        widthPx: box.widthPx,
        heightPx: box.imageHeightPx,
        language: mode.language,
        fonts: worksheet.fonts,
      }),
    );
  }
  return images;
}

const bodyOf = (html: string) => /<body style="[^"]*">([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';

/**
 * The first body page: the clipboard HTML up to the first forced page break, with each
 * question wrapped in one element. The paginator never splits an item, so the card
 * trims whole questions at the bottom margin; the per-question clipboard HTML is the
 * same emitter over the same nodes, so it is found verbatim inside the whole.
 */
function bodyHtml(worksheet: Worksheet, mode: OutputMode): string {
  const images = diagramImages(worksheet, mode);
  const whole = bodyOf(worksheetClipboardHtml(worksheet, mode, images));
  const pieces: string[] = [];
  let cursor = 0;
  for (const { questionId } of renderWorksheet(worksheet, mode).questions) {
    const fragment = bodyOf(questionClipboardHtml(worksheet, questionId, mode, images));
    const at = fragment ? whole.indexOf(fragment, cursor) : -1;
    if (at < 0) continue;
    pieces.push(whole.slice(cursor, at), `<div data-item>${fragment}</div>`);
    cursor = at + fragment.length;
  }
  pieces.push(whole.slice(cursor));
  let body = pieces.join('');
  const cut = body.indexOf(PAGE_BREAK);
  if (cut >= 0) body = body.slice(0, cut);
  /*
   * The clipboard prefixes every paragraph with its paste font at 12pt; the page prints
   * at the document's body size (11pt, the QAB's 10pt). The prefix is rebuilt here from
   * the same fonts, so a change to its spelling fails `thumbnail.test.ts`, not silently.
   */
  const pasted = `${fontFamily(worksheet.fonts)}font-size:12pt;`;
  const printed = `${fontFamily(worksheet.fonts)}font-size:${worksheet.baseFontSize ?? 11}pt;`;
  return body.split(pasted).join(printed);
}

/* The cover's regions are text, instruction rows and blank lines — a small emitter over
   the clipboard backend's run and format helpers. */

const COVER_STYLE_CSS: Record<string, string> = {
  'Section Heading': 'font-size:14pt;font-weight:bold;',
};

function coverNodeHtml(node: RenderNode, language: LanguageMode): string {
  if (node.kind === 'text') {
    const css = `${COVER_STYLE_CSS[node.style] ?? ''}${formatCss(node.format)}`;
    return `<p style="${css}">${richHtml(node.text, language) || '&nbsp;'}</p>`;
  }
  if (node.kind === 'spacer') return `<div style="height:${node.heightPt}pt"></div>`;
  if (node.kind === 'columns') {
    // The preview's shape: the row starts at `indent - hanging`, the marker cell is the
    // hanging gutter, the last cell takes the rest (§ ColumnsNode.hanging).
    const cells = node.cells
      .map((cell, index) => {
        const next = node.cells[index + 1];
        const flex =
          node.hanging && index === 0
            ? `0 0 ${node.hanging / 20}pt`
            : next
              ? `0 0 ${(next.at - cell.at) * 100}%`
              : '1 1 auto';
        const marker = cell.marker ? `${escapeHtml(cell.marker)}&nbsp;` : '';
        return (
          `<span style="min-width:0;flex:${flex};text-align:${cell.align ?? 'left'};` +
          `${formatCss(cell.format)}">${marker}${richHtml(cell.text, language)}</span>`
        );
      })
      .join('');
    const indent = node.indent ? `margin-left:${(node.indent - (node.hanging ?? 0)) / 20}pt;` : '';
    return `<div style="display:flex;${indent}">${cells}</div>`;
  }
  return '';
}

const inches = (twips: number) => `${twips / 1440}in`;

/** The cover sheet, mirroring `CoverSheet` in `Preview.tsx` without its edit chrome. */
function coverHtml(cover: CoverRenderNode, language: LanguageMode, page: ThumbnailPage): string {
  const { left, gap, right } = cover.columns;
  const total = left + gap + right;
  const pct = (value: number) => `${(value / total) * 100}%`;
  const region = (nodes: RenderNode[]) =>
    nodes.map((node) => coverNodeHtml(node, language)).join('');

  const corner =
    cover.corner.length > 0
      ? '<div style="position:absolute;left:-0.65in;top:-0.25in;width:1.893in;height:1.882in">' +
        `<div style="white-space:nowrap;padding-top:0.217in;width:1.056in">${region(cover.corner)}</div>` +
        (cover.cornerRule
          ? '<div style="position:absolute;inset:0;background:linear-gradient(to bottom right,' +
            'transparent calc(50% - 1.5pt),#000 calc(50% - 1.5pt),#000 calc(50% + 1.5pt),' +
            'transparent calc(50% + 1.5pt))"></div>'
          : '') +
        '</div>'
      : '';

  const leftColumn =
    `<div style="position:relative;min-width:0;width:${cover.panel.present ? pct(left) : '100%'};` +
    `${cover.corner.length > 0 ? 'padding-top:1.5in;' : ''}">` +
    `${corner}${region(cover.head)}${region(cover.instructions)}</div>`;

  const foot =
    cover.foot.length > 0 || cover.footNote
      ? `<div style="position:absolute;display:flex;align-items:flex-end;bottom:0.5in;` +
        `left:${page.marginPx.left}px;right:${page.marginPx.right}px">` +
        `<div style="min-width:0;flex:1">${region(cover.foot)}</div>` +
        (cover.footNote
          ? `<div style="border:1px solid #000;padding:4px;width:${inches(3200)}">` +
            `${coverNodeHtml(cover.footNote, language)}</div>`
          : '') +
        '</div>'
      : '';

  let panel = '';
  if (cover.panel.present) {
    const note = cover.panel.note
      ? `<div style="margin-bottom:16px;border:1px solid #000;padding:8px;` +
        `margin-left:${inches(COVER_PANEL.indent)};min-height:${inches(COVER_PANEL.noteMinHeight)}">` +
        `${coverNodeHtml(cover.panel.note, language)}</div>`
      : '';
    const label = cover.panel.fieldLabel
      ? `<div style="display:flex;align-items:center;width:${inches(COVER_PANEL.labelWidth)}">` +
        `${coverNodeHtml(cover.panel.fieldLabel, language)}</div>`
      : '';
    const boxes = Array.from(
      { length: cover.panel.boxes },
      (_, index) =>
        `<span style="border:1px solid #000;width:${inches(COVER_PANEL.boxWidth)};` +
        `height:${inches(COVER_PANEL.boxHeight)};margin-left:${index ? '-1px' : '0'}"></span>`,
    ).join('');
    const grid =
      label || boxes
        ? `<div style="display:flex;align-items:stretch;margin-left:${inches(COVER_PANEL.indent)}">` +
          `${label}${boxes}</div>`
        : '';
    panel =
      `<div style="min-width:0;padding-left:16px;width:${pct(right)};border-left:1.5pt solid #000">` +
      `${note}${grid}</div>`;
  }

  return `<div style="display:flex;gap:${pct(gap)}">${leftColumn}${foot}${panel}</div>`;
}

/**
 * The first page as self-contained HTML: a `<style>` plus one `.page` box at true size
 * (`thumbnailPage`), margins as padding, clipped at one page. Meant for a shadow root;
 * it carries no script and no event handlers. Async so a later rasterising step can
 * slot in without changing callers.
 */
export async function thumbnailHtml(worksheet: Worksheet): Promise<string> {
  const mode = thumbnailMode(worksheet);
  const page = thumbnailPage(worksheet);
  const { top, right, bottom, left } = page.marginPx;

  let content: string;
  const cover = worksheet.cover ? renderWorksheet(worksheet, mode).cover : undefined;
  if (cover) content = coverHtml(cover, mode.language, page);
  else content = bodyHtml(worksheet, mode);

  const pageCss =
    `width:${page.widthPx}px;height:${page.heightPx}px;` +
    `padding:${top}px ${right}px ${bottom}px ${left}px;` +
    `${fontFamily(worksheet.fonts)}font-size:${worksheet.baseFontSize ?? 11}pt;`;

  return (
    `<style>${THUMBNAIL_CSS}</style>` +
    `<div class="page" lang="${mode.language === 'zh' ? 'zh-HK' : 'en'}" style="${pageCss}">` +
    `<div class="content">${content}</div></div>`
  );
}

/* ------------------------------------------------------------------------------------ */
/* Cache and scheduling                                                                 */
/* ------------------------------------------------------------------------------------ */

export interface Thumbnail {
  html: string;
  page: ThumbnailPage;
  /** Page 1 is the cover; the card may want to say so. */
  showsCover: boolean;
}

/** How many thumbnails are built at once. The work is synchronous, so this mostly
 *  decides how often the list yields back to the browser between documents. */
export const THUMBNAIL_CONCURRENCY = 2;

/** The cache holds whole-document HTML, embedded photos included; budget it by size. */
const CACHE_BUDGET_CHARS = 24_000_000;

interface Entry {
  promise: Promise<Thumbnail | undefined>;
  size: number;
}

const cache = new Map<string, Entry>();
let cachedChars = 0;

const keyOf = (id: string, updatedAt: string) => `${id}:${updatedAt}`;

function drop(key: string): void {
  const entry = cache.get(key);
  if (!entry) return;
  cachedChars -= entry.size;
  cache.delete(key);
}

function setSize(key: string, entry: Entry, size: number): void {
  if (cache.get(key) !== entry) return;
  cachedChars += size - entry.size;
  entry.size = size;
  // Oldest first — a Map iterates in insertion order and hits re-insert.
  for (const [other] of cache) {
    if (cachedChars <= CACHE_BUDGET_CHARS || other === key) break;
    drop(other);
  }
}

let running = 0;
const queue: Array<() => void> = [];

/** Resolves on a later macrotask, so one document's build never shares a frame with
 *  the list's first paint or with the previous document's. */
const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function limited<T>(task: () => Promise<T>): Promise<T> {
  // A finishing task hands its slot straight to the next waiter, so a caller arriving
  // in between cannot slip in and push the count past the limit.
  if (running >= THUMBNAIL_CONCURRENCY) await new Promise<void>((resolve) => queue.push(resolve));
  else running += 1;
  try {
    await yieldToBrowser();
    return await task();
  } finally {
    const next = queue.shift();
    if (next) next();
    else running -= 1;
  }
}

/**
 * A document's thumbnail, loaded and built at most once per saved version.
 *
 * Keyed by `${id}:${updatedAt}`: a later save is a new key, and the stale version of the
 * same document is dropped. A hit returns the same promise. A failure is not cached, so
 * the next visit tries again; a missing document resolves `undefined`.
 */
export function loadThumbnail(
  id: string,
  updatedAt: string,
  load: (id: string) => Promise<Worksheet | undefined>,
): Promise<Thumbnail | undefined> {
  const key = keyOf(id, updatedAt);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit.promise;
  }

  for (const other of [...cache.keys()]) {
    if (other.startsWith(`${id}:`)) drop(other);
  }

  const entry: Entry = { promise: Promise.resolve(undefined), size: 0 };
  entry.promise = limited(async () => {
    const worksheet = await load(id);
    if (!worksheet) return undefined;
    return {
      html: await thumbnailHtml(worksheet),
      page: thumbnailPage(worksheet),
      showsCover: thumbnailShowsCover(worksheet),
    };
  });
  cache.set(key, entry);
  entry.promise.then(
    (thumbnail) => setSize(key, entry, thumbnail?.html.length ?? 0),
    () => {
      if (cache.get(key) === entry) drop(key);
    },
  );
  return entry.promise;
}

/**
 * Replace a cached thumbnail's HTML with the trimmed copy a mounted card produced (only
 * what fits on page 1), so the cache stops holding pages nobody sees.
 */
export function settleThumbnail(id: string, updatedAt: string, thumbnail: Thumbnail): void {
  const key = keyOf(id, updatedAt);
  const entry = cache.get(key);
  if (!entry) return;
  entry.promise = Promise.resolve(thumbnail);
  setSize(key, entry, thumbnail.html.length);
}

/** Forget every cached thumbnail. For tests, and for a store that was cleared. */
export function clearThumbnailCache(): void {
  cache.clear();
  cachedChars = 0;
}
