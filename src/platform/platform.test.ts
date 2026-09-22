/**
 * The web path must stay exactly what shipped: `isDesktop()` is false anywhere but the
 * Tauri webview, and `saveFile` then falls through to the anchor download. If this ever
 * flips, a browser build would try to import `@tauri-apps/*` and fail at runtime.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDesktop, saveFile } from '.';

const downloads: Array<{ fileName: string; text: string }> = [];

vi.mock('@/storage/download', () => ({
  triggerDownload: async (blob: Blob, fileName: string) => {
    downloads.push({ fileName, text: await blob.text() });
  },
}));

afterEach(() => {
  downloads.length = 0;
  vi.unstubAllGlobals();
});

describe('isDesktop', () => {
  it('is false with no window at all', () => {
    expect(isDesktop()).toBe(false);
  });

  it('is false in a plain browser window', () => {
    vi.stubGlobal('window', {});
    expect(isDesktop()).toBe(false);
  });

  it('is true only when the shell has injected its internals', () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    expect(isDesktop()).toBe(true);
  });
});

describe('saveFile on the web', () => {
  it('downloads the text and returns no path', async () => {
    const path = await saveFile('{"a":1}', 'doc.worksheet.json');
    // Web has no destination to report — the browser chose it.
    expect(path).toBeUndefined();
    // triggerDownload's blob read is async; let it land.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(downloads).toEqual([{ fileName: 'doc.worksheet.json', text: '{"a":1}' }]);
  });

  it('passes a Blob through unchanged', async () => {
    await saveFile(new Blob(['zip-bytes']), 'paper.docx');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(downloads[0]).toEqual({ fileName: 'paper.docx', text: 'zip-bytes' });
  });

  it('wraps raw bytes', async () => {
    await saveFile(new TextEncoder().encode('hi'), 'x.docx');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(downloads[0]?.text).toBe('hi');
  });
});
