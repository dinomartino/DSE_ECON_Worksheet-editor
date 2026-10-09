/**
 * `.pdf` file reader: pdf.js text positions and drawing operations → `layoutPdf` → the
 * same `SourceLine`s every reader makes. pdf.js loads on first call (`./pdfjs`), never
 * with the app. Figures become slots; with `prepareImage` in a browser, a crop of the
 * rendered page fills them.
 */
import type { ReadPaste } from './index';
import { toSourceLines } from './lines';
import { layoutPdf, type PdfBox, type PdfGraphic, type PdfItem, type PdfLine, type PdfPage } from './pdfLayout';
import type { PageChrome } from './pageChrome';
import type { ImageRef } from './types';

export type PdfReadError = { kind: 'unreadable' | 'encrypted' | 'notPdf' };
export type PdfRead = ReadPaste & { title?: string; pages: number; chrome?: PageChrome };

export interface ReadPdfOptions {
  /** Turns a cropped figure (PNG) into an image; browser only. Without it figures are slots. */
  prepareImage?: (blob: Blob) => Promise<ImageRef | null>;
}

export const isPdfReadError = (result: PdfRead | PdfReadError): result is PdfReadError => 'kind' in result;

type Pdfjs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type PdfDoc = Awaited<ReturnType<Pdfjs['getDocument']>['promise']>;
type PdfPageProxy = Awaited<ReturnType<PdfDoc['getPage']>>;
type Matrix = number[];

const BOLD = /bold|black|heavy|semibold|demibold|[-,_ ]?(?:W[6-9]|SB|Bd)$/i;
const ITALIC = /italic|oblique|[-,]It$/i;
const GENERIC_TITLE = /^(untitled|document\s*\d*|slide\s*\d*|\s*)$/i;
const OPEN_TIMEOUT_MS = 30_000;

function looksLikePdf(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 1024));
  for (let k = 0; k + 4 < head.length; k++) {
    if (head[k] === 0x25 && head[k + 1] === 0x50 && head[k + 2] === 0x44 && head[k + 3] === 0x46 && head[k + 4] === 0x2d) return true;
  }
  return false;
}

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/** The page's own space: viewport points, flipped so y runs up from the bottom. */
function boxThrough(m: Matrix, height: number, x0: number, y0: number, x1: number, y1: number): PdfBox {
  const pts = [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ].map(([x, y]) => [m[0] * x + m[2] * y + m[4], height - (m[1] * x + m[3] * y + m[5])]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/** Pictures, rules and other paths from the operator list, with the CTM tracked. */
function graphicsOf(ops: { fnArray: number[]; argsArray: unknown[] }, OPS: Pdfjs['OPS'], view: Matrix, height: number): PdfGraphic[] {
  const out: PdfGraphic[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const PAINT = new Set<number>([OPS.stroke, OPS.closeStroke, OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const IMAGES = new Set<number>([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintImageXObjectRepeat, OPS.paintSolidColorImageMask]);
  for (let k = 0; k < ops.fnArray.length; k++) {
    const fn = ops.fnArray[k];
    const args = ops.argsArray[k] as unknown[];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = multiply(ctm, args as Matrix);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      if (Array.isArray(args?.[0])) ctm = multiply(ctm, args[0] as Matrix);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (IMAGES.has(fn)) out.push({ kind: 'image', box: boxThrough(multiply(view, ctm), height, 0, 0, 1, 1) });
    else if (fn === OPS.constructPath) {
      const [paint, data, minMax] = args as [number, ArrayLike<number>[] | ArrayLike<number> | null, ArrayLike<number> | null];
      if (!PAINT.has(paint) || !minMax || !Number.isFinite(minMax[0])) continue;
      const box = boxThrough(multiply(view, ctm), height, minMax[0], minMax[1], minMax[2], minMax[3]);
      // Thin lines and the dots where table borders meet are rules; a drawing needs some size.
      const thin = box.h <= 1.5 || box.w <= 1.5 || (box.w <= 3 && box.h <= 3);
      out.push({ kind: thin ? 'rule' : 'shape', box, ...(curvedPath(data) ? { curved: true } : {}) });
    }
  }
  return out;
}

/** A path with a curve, or a line that is neither level nor upright (a graph's slope). */
function curvedPath(data: ArrayLike<number>[] | ArrayLike<number> | null): boolean {
  const parts = !data ? [] : typeof (data as ArrayLike<number>[])[0] === 'number' ? [data as ArrayLike<number>] : (data as ArrayLike<number>[]);
  for (const d of parts) {
    let x = 0;
    let y = 0;
    for (let k = 0; k < d.length; ) {
      const op = d[k];
      if (op === 0 || op === 1) {
        const nx = d[k + 1];
        const ny = d[k + 2];
        if (op === 1 && Math.abs(nx - x) > 1 && Math.abs(ny - y) > 1) return true;
        x = nx;
        y = ny;
        k += 3;
      } else if (op === 2) return true;
      else if (op === 3) return true;
      else k += 1;
    }
  }
  return false;
}

function fontStyle(page: PdfPageProxy, fontName: string, cache: Map<string, { bold: boolean; italic: boolean }>) {
  const known = cache.get(fontName);
  if (known) return known;
  let style = { bold: false, italic: false };
  try {
    const font = page.commonObjs.get(fontName) as { name?: string; bold?: boolean; black?: boolean; italic?: boolean } | undefined;
    const name = (font?.name ?? '').replace(/^[A-Z]{6}\+/, '');
    style = { bold: !!(font?.bold || font?.black) || BOLD.test(name), italic: !!font?.italic || ITALIC.test(name) };
  } catch {
    // Not loaded: plain.
  }
  cache.set(fontName, style);
  return style;
}

/** One page as layout input (exported for local debugging). */
export async function readPage(pdfjs: Pdfjs, page: PdfPageProxy): Promise<PdfPage> {
  const viewport = page.getViewport({ scale: 1 });
  const view = viewport.transform as Matrix;
  const height = viewport.height;
  const content = await page.getTextContent();
  // The operator list also loads the fonts, whose names say bold and italic.
  const ops = await page.getOperatorList();
  const fonts = new Map<string, { bold: boolean; italic: boolean }>();
  const items: PdfItem[] = [];
  for (const raw of content.items) {
    if (!('str' in raw) || !raw.str) continue;
    const [a, b, c, d, e, f] = multiply(view, raw.transform as Matrix);
    const size = Math.hypot(c, d) || Math.hypot(a, b);
    const rotated = Math.abs(b) > size * 0.05 || Math.abs(c) > size * 0.05 || a < 0;
    const style = raw.fontName ? fontStyle(page, raw.fontName, fonts) : { bold: false, italic: false };
    items.push({
      str: raw.str,
      x: e,
      y: height - f,
      w: raw.width,
      size,
      ...(style.bold ? { bold: true } : {}),
      ...(style.italic ? { italic: true } : {}),
      ...(rotated ? { rotated: true } : {}),
    });
  }
  return { width: viewport.width, height, items, graphics: graphicsOf(ops, pdfjs.OPS, view, height) };
}

function titleOf(info: unknown): string | undefined {
  const raw = (info as { Title?: unknown } | undefined)?.Title;
  if (typeof raw !== 'string') return undefined;
  const title = raw
    .replace(/^Microsoft (Word|PowerPoint) - /i, '')
    .replace(/\.(docx?|pptx?|pdf|pages|odt)$/i, '')
    .trim();
  return GENERIC_TITLE.test(title) ? undefined : title;
}

/** Render each page with figures once (lines come in page order), crop each figure to PNG, and let the caller store it. */
async function cropFigures(doc: PdfDoc, lines: PdfLine[], prepareImage: NonNullable<ReadPdfOptions['prepareImage']>): Promise<void> {
  const scale = 2;
  const pad = 4;
  let renderedPage = 0;
  let canvas: HTMLCanvasElement | null = null;
  for (const line of lines) {
    if (!line.figure) continue;
    try {
      if (renderedPage !== line.page) {
        renderedPage = line.page;
        canvas = null;
        const page = await doc.getPage(line.page);
        const viewport = page.getViewport({ scale });
        const target = document.createElement('canvas');
        target.width = Math.ceil(viewport.width);
        target.height = Math.ceil(viewport.height);
        const ctx = target.getContext('2d');
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, canvas: target, viewport }).promise;
        canvas = target;
      }
      if (!canvas) continue;
      const box = line.figure;
      const sx = Math.max(0, (box.x - pad) * scale);
      const sy = Math.max(0, canvas.height - (box.y + box.h + pad) * scale);
      const sw = Math.min(canvas.width - sx, (box.w + pad * 2) * scale);
      const sh = Math.min(canvas.height - sy, (box.h + pad * 2) * scale);
      if (sw < 4 || sh < 4) continue;
      const crop = document.createElement('canvas');
      crop.width = Math.round(sw);
      crop.height = Math.round(sh);
      crop.getContext('2d')?.drawImage(canvas, sx, sy, sw, sh, 0, 0, crop.width, crop.height);
      const blob = await new Promise<Blob | null>((resolve) => crop.toBlob(resolve, 'image/png'));
      const image = blob && (await prepareImage(blob));
      if (image) line.image = image;
    } catch {
      // The slot stays for the teacher to fill.
    }
  }
}

const withTimeout = <T>(promise: Promise<T>, ms: number, check: () => Error | null): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const started = Date.now();
    const tick = setInterval(() => {
      const failure = check();
      if (failure || Date.now() - started > ms) {
        clearInterval(tick);
        reject(failure ?? new Error('timed out'));
      }
    }, 100);
    promise.then(
      (value) => {
        clearInterval(tick);
        resolve(value);
      },
      (error: unknown) => {
        clearInterval(tick);
        reject(error);
      },
    );
  });

interface OpenedPdf {
  task: { destroy(): Promise<void> };
  doc: PdfDoc;
  pdfjs: Pdfjs;
}

/** pdf.js loaded and the file opened, on the worker or (when it will not start) this thread. */
async function openPdf(bytes: ArrayBuffer): Promise<OpenedPdf | PdfReadError> {
  if (!looksLikePdf(bytes)) return { kind: 'notPdf' };
  let lib: typeof import('./pdfjs');
  try {
    lib = await import('./pdfjs');
  } catch {
    return { kind: 'unreadable' };
  }
  const open = async () => {
    // pdf.js takes ownership of the buffer it is given; the caller keeps theirs.
    const task = lib.pdfjsLib().getDocument({ data: new Uint8Array(bytes.slice(0)), fontExtraProperties: true, verbosity: 0 });
    try {
      return { task, doc: await withTimeout(task.promise, OPEN_TIMEOUT_MS, lib.workerFailure) };
    } catch (error) {
      void task.destroy();
      throw error;
    }
  };
  // A file read just before (the text pass, then the scan's pages) may still be closing.
  const settled = async () => {
    try {
      return await open();
    } catch (error) {
      if (!/being destroyed/i.test((error as Error)?.message ?? '')) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
      return open();
    }
  };
  let opened: Awaited<ReturnType<typeof open>>;
  try {
    opened = await settled();
  } catch (error) {
    if ((error as { name?: string })?.name === 'PasswordException') return { kind: 'encrypted' };
    if (!lib.workerFailure()) return { kind: 'unreadable' };
    // The worker would not start (a webview that refuses it): parse on this thread instead.
    try {
      await lib.useMainThread();
      opened = await open();
    } catch (again) {
      return { kind: (again as { name?: string })?.name === 'PasswordException' ? 'encrypted' : 'unreadable' };
    }
  }
  return { ...opened, pdfjs: lib.pdfjsLib() };
}

/** One page of a scan, rendered for text recognition. */
export interface RenderedPage {
  /** 1-based. */
  page: number;
  pages: number;
  png: Uint8Array;
  /** Image pixels per PDF point. */
  scale: number;
}

/** Pixels past this on a side are never rendered (a poster-sized page). */
const MAX_RENDER_SIDE = 4000;

/**
 * Render a PDF's pages one at a time to PNG at `dpi` (browser only), for text recognition.
 * Only the page being rendered is held. Rejects with `PdfReadError`-shaped `{ kind }` when the
 * file will not open; stops between pages when `signal` aborts.
 */
export async function* renderPdfPages(bytes: ArrayBuffer, options: { dpi?: number; signal?: AbortSignal } = {}): AsyncGenerator<RenderedPage> {
  const opened = await openPdf(bytes);
  if ('kind' in opened) throw opened;
  const { task, doc } = opened;
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      if (options.signal?.aborted) return;
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min((options.dpi ?? 200) / 72, MAX_RENDER_SIDE / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw { kind: 'unreadable' } satisfies PdfReadError;
      // A scan on a transparent page would read as black on black.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, canvas, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
      if (!blob) throw { kind: 'unreadable' } satisfies PdfReadError;
      yield { page: n, pages: doc.numPages, png: new Uint8Array(await blob.arrayBuffer()), scale };
    }
  } finally {
    await task.destroy().catch(() => undefined);
  }
}

/** Read a `.pdf` file. Errors come back as `{ kind }`; a scan reads as image lines only (`analyseLines` → `scan`). */
export async function readPdf(bytes: ArrayBuffer, options: ReadPdfOptions = {}): Promise<PdfRead | PdfReadError> {
  const opened = await openPdf(bytes);
  if ('kind' in opened) return opened;
  const { task, doc, pdfjs } = opened;
  try {
    const pages: PdfPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) pages.push(await readPage(pdfjs, await doc.getPage(n)));
    const layout = layoutPdf(pages);
    const hasText = pages.some((p) => p.items.some((it) => it.str.trim()));
    if (options.prepareImage && hasText && typeof document !== 'undefined') await cropFigures(doc, layout.lines, options.prepareImage);
    const meta = await doc.getMetadata().catch(() => null);
    const title = titleOf(meta?.info) ?? layout.heading;
    const lines = toSourceLines(
      layout.lines.map((line) => {
        const { figure, ...rest } = line;
        void figure;
        return rest;
      }),
    );
    return { lines, source: 'pdf', pages: doc.numPages, ...(title ? { title } : {}), ...(layout.chrome ? { chrome: layout.chrome } : {}) };
  } catch {
    return { kind: 'unreadable' };
  } finally {
    await task.destroy().catch(() => undefined);
  }
}
