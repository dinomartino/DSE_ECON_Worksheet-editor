/**
 * A screenshot for in-app feedback. It cannot travel in a link (no server, no token), so
 * the app puts it on the clipboard as PNG and the teacher pastes it into the GitHub issue
 * (which uploads pasted images itself) or the email. Only ever an image the teacher chose:
 * nothing is captured or attached automatically.
 */

/** What a screenshot may be, by MIME type; what the browser decodes everywhere. */
const IMAGE_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

/** For the file input's `accept`. */
export const SCREENSHOT_ACCEPT = [...new Set(Object.values(IMAGE_TYPES))].join(',');

/** The largest file taken in, before any re-encoding. Matches a dropped file's cap. */
export const SCREENSHOT_MAX_BYTES = 20 * 1024 * 1024;

/** GitHub refuses a pasted image over 10 MB; a PNG kept under it pastes anywhere. */
export const SCREENSHOT_PASTE_BYTES = 10 * 1024 * 1024;

/** Longest side kept: a 5K screen's full width. Larger is scaled down on the way in. */
export const SCREENSHOT_MAX_SIDE = 5120;

export type ScreenshotProblem = 'notImage' | 'tooLarge';

/** The image's MIME type, from its own type or else its name; undefined for anything else. */
export function screenshotType(file: { type?: string; name?: string }): string | undefined {
  const type = file.type?.toLowerCase() ?? '';
  if (Object.values(IMAGE_TYPES).includes(type)) return type;
  if (type !== '') return undefined;
  const extension = file.name?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return extension ? IMAGE_TYPES[extension] : undefined;
}

/** Why a file cannot be the screenshot, or undefined when it can. */
export function screenshotProblem(file: { type?: string; name?: string; size: number }): ScreenshotProblem | undefined {
  if (!screenshotType(file)) return 'notImage';
  if (file.size > SCREENSHOT_MAX_BYTES) return 'tooLarge';
  return undefined;
}

/** `width` × `height` scaled to fit `maxSide`, never up; whole pixels, at least 1. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** How much to shrink each side so a PNG of `bytes` comes in under `limit`, with margin. */
export function shrinkFactor(bytes: number, limit: number): number {
  return bytes <= limit ? 1 : Math.sqrt(limit / bytes) * 0.9;
}

/** "412 KB", "3.4 MB": the thumbnail's caption. */
export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type KeyboardOs = 'mac' | 'windows' | 'other';

/** Whose shortcuts to show: ⌘ on a Mac (and an iPad keyboard), Ctrl elsewhere. */
export function keyboardOs(userAgent: string): KeyboardOs {
  if (/Windows NT/.test(userAgent)) return 'windows';
  if (/Mac OS X|Macintosh|iPhone|iPad/.test(userAgent)) return 'mac';
  return 'other';
}

/** The paste chord as the report prints it. */
export function pasteChord(os: KeyboardOs): string {
  return os === 'mac' ? '⌘V' : 'Ctrl+V';
}

export type FeedbackRoute = 'github' | 'mail' | 'copy';
export type ClipboardContent = 'image' | 'text';

/**
 * One clipboard, up to two things for it. What goes on it with the click (`now`), and
 * what the dialog offers to put there after (`offer`), a second click once the first
 * has been pasted. GitHub and mail open a link that already carries the text, so the
 * screenshot goes first; a link cut short (`truncated`) then offers the full text. The
 * Copy route is all clipboard: the text first, the screenshot offered after.
 */
export function clipboardPlan(
  route: FeedbackRoute,
  screenshot: boolean,
  truncated: boolean,
): { now?: ClipboardContent; offer?: ClipboardContent } {
  if (route === 'copy') return { now: 'text', ...(screenshot ? { offer: 'image' } : {}) };
  if (screenshot) return { now: 'image', ...(truncated ? { offer: 'text' } : {}) };
  return truncated ? { now: 'text' } : {};
}

/** The pasted image in a paste event's data, if there is one. */
export function imageFromClipboard(data: DataTransfer | null): File | undefined {
  if (!data) return undefined;
  for (const file of Array.from(data.files ?? [])) {
    if (screenshotType(file)) return file;
  }
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file' && screenshotType({ type: item.type })) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return undefined;
}

export interface Screenshot {
  /** Always PNG, the one image type every clipboard takes. */
  png: Blob;
  width: number;
  height: number;
  /** An object URL for the thumbnail; `releaseScreenshot` frees it. */
  url: string;
}

async function decode(source: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function encodePng(image: HTMLImageElement, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('No canvas'));
  context.drawImage(image, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode PNG'))), 'image/png'),
  );
}

/**
 * The chosen image as a screenshot: decoded, as PNG, at most `SCREENSHOT_MAX_SIDE` on a
 * side and under `SCREENSHOT_PASTE_BYTES`. A PNG that already fits is kept byte for byte.
 */
export async function prepareScreenshot(source: Blob): Promise<Screenshot> {
  const image = await decode(source);
  let { width, height } = fitWithin(image.naturalWidth, image.naturalHeight, SCREENSHOT_MAX_SIDE);
  const kept =
    source.type === 'image/png' && width === image.naturalWidth && source.size <= SCREENSHOT_PASTE_BYTES;
  let png = kept ? source : await encodePng(image, width, height);
  for (let attempt = 0; attempt < 3 && png.size > SCREENSHOT_PASTE_BYTES; attempt += 1) {
    const factor = shrinkFactor(png.size, SCREENSHOT_PASTE_BYTES);
    ({ width, height } = fitWithin(width * factor, height * factor, SCREENSHOT_MAX_SIDE));
    png = await encodePng(image, width, height);
  }
  return { png, width, height, url: URL.createObjectURL(png) };
}

export function releaseScreenshot(screenshot: Screenshot | undefined): void {
  if (screenshot) URL.revokeObjectURL(screenshot.url);
}

/**
 * Put the screenshot on the clipboard. Call it inside the click, before any await: WebKit
 * (Safari, the desktop app on macOS) keeps the click's permission only for a write started
 * there, which is why the PNG is passed as a promise.
 */
export function copyScreenshot(screenshot: Screenshot): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    return Promise.reject(new Error('This browser cannot copy images.'));
  }
  return navigator.clipboard.write([new ClipboardItem({ 'image/png': Promise.resolve(screenshot.png) })]);
}
