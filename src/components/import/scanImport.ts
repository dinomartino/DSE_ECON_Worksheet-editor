import { renderPdfPages, type PdfReadError } from '@/import';
import { imageScale, inkCell, inkMap, readOcrPages, scanFigures, type OcrRead, type PxBox, type ScanFigures } from '@/import/ocrLayout';
import type { ImageRef } from '@/import/types';
import { OCR_MAX_SIDE, OcrError, type OcrEngine, type OcrResult } from '@/platform/ocr';

/**
 * Scanned pages read by text recognition (`docs/design/paste-import.md` § 13): a scanned
 * PDF rendered page by page at 200 DPI, or pictures of a paper (one picture, one page),
 * each sent to the desktop engine in turn and laid out as a PDF's text is. A page's
 * drawings are cropped from it as pictures while it is open (`findScanFigures`). Only the
 * page being read is held. Stops between pages when the signal aborts.
 */

export const SCAN_DPI = 200;

export interface ScanProgress {
  /** 1-based: the page being read now. */
  page: number;
  pages: number;
}

export interface ScanReader {
  /** The engine, asked for only when a file turns out to be a scan; undefined: none here. */
  engine: () => Promise<OcrEngine | undefined>;
  signal?: AbortSignal;
  onProgress?: (progress: ScanProgress) => void;
  /** Rendering a PDF's pages and opening a picture (tests replace them; both need a DOM). */
  render?: (bytes: ArrayBuffer, signal?: AbortSignal) => AsyncIterable<ScanPage>;
  decode?: (bytes: ArrayBuffer, name: string) => Promise<{ png: Uint8Array; width: number }>;
  /** Stores a cropped drawing (PNG). Without it, a scan's drawings stay as their text. */
  prepareImage?: (blob: Blob) => Promise<ImageRef | null>;
  /** A page's pixels, for finding and cropping its drawings (tests replace it; needs a DOM). */
  raster?: (png: Uint8Array) => Promise<PageRaster | undefined>;
}

/** One page's pixels, held while its drawings are found and cropped. */
export interface PageRaster {
  width: number;
  height: number;
  /** RGBA, row by row. */
  rgba: ArrayLike<number>;
  /** A region as PNG. */
  crop: (box: PxBox) => Promise<Blob | null>;
  close: () => void;
}

export type ScanResult =
  | { kind: 'ok'; read: OcrRead }
  | { kind: 'stopped' }
  /** The engine failed (its models, or anything else). */
  | { kind: 'failed' }
  /** No page could be opened as a picture. */
  | { kind: 'undecodable' };

/** One page ready for the engine. */
export interface ScanPage {
  page: number;
  pages: number;
  png: Uint8Array;
  /** Image pixels per point; pictures are read as A4 pages. */
  scale?: number;
}

/** Each page through the engine, then all of them through the layout. */
export async function recognisePages(pages: AsyncIterable<ScanPage>, engine: OcrEngine, options: Omit<ScanReader, 'engine'> = {}): Promise<ScanResult> {
  const results: OcrResult[] = [];
  const scales: number[] = [];
  const figures: Array<ScanFigures | undefined> = [];
  let undecodable = 0;
  try {
    for await (const p of pages) {
      if (options.signal?.aborted) return { kind: 'stopped' };
      options.onProgress?.({ page: p.page, pages: p.pages });
      try {
        const result = await engine.read(p.png);
        const scale = p.scale ?? imageScale(result.width);
        results.push(result);
        scales.push(scale);
        figures.push(options.prepareImage ? await pageFigures(p.png, result, scale, options.prepareImage, options.raster ?? decodeRaster) : undefined);
      } catch (error) {
        if (error instanceof OcrError && error.kind === 'decode') {
          undecodable++;
          continue;
        }
        console.warn('Text recognition failed:', error);
        return { kind: 'failed' };
      }
      if (options.signal?.aborted) return { kind: 'stopped' };
    }
  } catch (error) {
    if ((error as { kind?: string })?.kind === 'undecodable') return { kind: 'undecodable' };
    console.warn('Scanned pages could not be prepared:', error);
    return { kind: 'failed' };
  }
  if (options.signal?.aborted) return { kind: 'stopped' };
  if (!results.length) return { kind: undecodable ? 'undecodable' : 'failed' };
  return { kind: 'ok', read: readOcrPages(results, scales, figures) };
}

/**
 * A page's drawings, each cropped and stored as soon as it is found; the page's pixels
 * are let go before the next page. Undefined when the page cannot be opened as a picture
 * (its drawings then stay text, as before).
 */
async function pageFigures(
  png: Uint8Array,
  result: OcrResult,
  scale: number,
  prepareImage: NonNullable<ScanReader['prepareImage']>,
  raster: NonNullable<ScanReader['raster']>,
): Promise<ScanFigures | undefined> {
  const page = await raster(png).catch(() => undefined);
  if (!page) return undefined;
  try {
    if (page.width !== result.width || page.height !== result.height) return undefined;
    const { found, figures } = scanFigures(result, inkMap(page.rgba, page.width, page.height, inkCell(scale)), scale);
    const crops: ScanFigures['crops'] = [];
    for (const { box, crop } of figures) {
      const blob = await page.crop(crop).catch(() => null);
      crops.push({ box, image: blob ? await prepareImage(blob).catch(() => null) : null });
    }
    return { found, crops };
  } catch (error) {
    console.warn('Pictures on a scanned page could not be cropped:', error);
    return undefined;
  } finally {
    page.close();
  }
}

/** A page picture's pixels, decoded by this webview (browser only). */
export async function decodeRaster(png: Uint8Array): Promise<PageRaster | undefined> {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return undefined;
  const bitmap = await createImageBitmap(new Blob([png as BlobPart], { type: 'image/png' }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    return undefined;
  }
  ctx.drawImage(bitmap, 0, 0);
  const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  canvas.width = 0;
  canvas.height = 0;
  return {
    width: bitmap.width,
    height: bitmap.height,
    rgba,
    crop: async (box) => {
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(box.w));
      out.height = Math.max(1, Math.round(box.h));
      const c = out.getContext('2d');
      if (!c) return null;
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, out.width, out.height);
      c.drawImage(bitmap, box.x, box.y, box.w, box.h, 0, 0, out.width, out.height);
      const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
      out.width = 0;
      out.height = 0;
      return blob;
    },
    close: () => bitmap.close(),
  };
}

/** A scanned PDF's pages, rendered one at a time. Throws `{ kind }` as `readPdf` reports it. */
export async function* pdfScanPages(bytes: ArrayBuffer, signal?: AbortSignal): AsyncGenerator<ScanPage> {
  for await (const page of renderPdfPages(bytes, { dpi: SCAN_DPI, signal })) yield page;
}

const PICTURE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', heic: 'image/heic', heif: 'image/heif' };

/** A picture of a paper, by name or by its first bytes. */
export function isPictureFile(name: string, bytes?: ArrayBuffer): boolean {
  if (/\.(png|jpe?g|heic|heif)$/i.test(name)) return true;
  if (!bytes || bytes.byteLength < 4) return false;
  const b = new Uint8Array(bytes, 0, 4);
  return (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) || (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff);
}

/**
 * A picture as the engine reads it: decoded by this webview (so a phone photo's rotation
 * is applied, and HEIC opens where the webview opens it), no larger than the engine reads,
 * as PNG. Throws `{ kind: 'undecodable' }` when this webview cannot open it.
 */
export async function pictureToPng(bytes: ArrayBuffer, name: string): Promise<{ png: Uint8Array; width: number }> {
  const type = PICTURE_TYPES[name.split('.').pop()?.toLowerCase() ?? ''] ?? '';
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes], type ? { type } : {}), { imageOrientation: 'from-image' });
  } catch {
    throw { kind: 'undecodable' };
  }
  const fit = Math.min(1, OCR_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * fit));
  canvas.height = Math.max(1, Math.round(bitmap.height * fit));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw { kind: 'undecodable' };
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  const width = canvas.width;
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw { kind: 'undecodable' };
  return { png: new Uint8Array(await blob.arrayBuffer()), width };
}

/** Pictures in the order given, one page each; one that will not open is skipped. */
export async function* pictureScanPages(
  pictures: ReadonlyArray<{ name: string; read: () => Promise<ArrayBuffer> }>,
  signal?: AbortSignal,
  decode: NonNullable<ScanReader['decode']> = pictureToPng,
): AsyncGenerator<ScanPage> {
  let opened = 0;
  for (const [k, picture] of pictures.entries()) {
    if (signal?.aborted) return;
    try {
      const { png, width } = await decode(await picture.read(), picture.name);
      opened++;
      yield { page: k + 1, pages: pictures.length, png, scale: imageScale(width) };
    } catch {
      // Skipped: the others still make the paper.
    }
  }
  if (!opened) throw { kind: 'undecodable' };
}

export type { PdfReadError };
