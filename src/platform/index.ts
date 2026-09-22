/**
 * The one place that knows whether this build is running in a browser tab or in the
 * Tauri desktop shell.
 *
 * **Nothing outside this directory may import `@tauri-apps/*`.** The same source tree
 * ships to Vercel as a static web app, where those modules do not exist; a top-level
 * import would break the web bundle and drag native stubs into vitest. So every Tauri
 * module is reached through a dynamic `import()` *inside* a function, which the bundler
 * splits into a chunk that the web path never requests and the tests never evaluate.
 *
 * The web behaviour is the unchanged one: an anchor download and `window.print()`.
 * Desktop adds a real save dialog and a real path on disk.
 */

/** File-type presets for the save dialog; the web path ignores them. */
export type SaveFilter = { name: string; extensions: string[] };

export const DOCX_FILTERS: SaveFilter[] = [
  { name: 'Word document', extensions: ['docx'] },
];
export const JSON_FILTERS: SaveFilter[] = [{ name: 'Worksheet', extensions: ['json'] }];

/**
 * Are we inside the Tauri webview?
 *
 * `__TAURI_INTERNALS__` is injected onto `window` by the shell before any app code
 * runs, so this is true from the first render and needs no async probe. It is false in
 * jsdom, in node, during SSR/static export, and in every browser.
 */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function toBytes(data: Blob | Uint8Array | string): Promise<Uint8Array | string> {
  if (typeof data === 'string') return data;
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(await data.arrayBuffer());
}

function toBlob(data: Blob | Uint8Array | string, type: string): Blob {
  if (data instanceof Blob) return data;
  // `BlobPart` does not accept a generic Uint8Array under TS 5.7's ArrayBufferLike
  // split, so hand it the backing buffer slice explicitly.
  if (typeof data === 'string') return new Blob([data], { type });
  return new Blob([data.slice().buffer as ArrayBuffer], { type });
}

/**
 * Write a file where the user asks for it.
 *
 * Desktop: a native save sheet, then a write to the chosen path — the dialog's result is
 * auto-scoped by the shell, so no capability beyond `dialog:allow-save` is needed for
 * the path itself. Returns the path, or `undefined` when the sheet was cancelled.
 *
 * Web: the existing anchor download, byte-for-byte the behaviour that shipped. The
 * browser owns the destination, so there is no path to return — `undefined`.
 */
export async function saveFile(
  data: Blob | Uint8Array | string,
  suggestedName: string,
  filters: SaveFilter[] = [],
): Promise<string | undefined> {
  if (!isDesktop()) {
    const { triggerDownload } = await import('@/storage/download');
    triggerDownload(toBlob(data, mimeFor(suggestedName)), suggestedName);
    return undefined;
  }

  const { save } = await import('@tauri-apps/plugin-dialog');
  const path = await save({ defaultPath: suggestedName, filters });
  if (!path) return undefined;

  const bytes = await toBytes(data);
  const fs = await import('@tauri-apps/plugin-fs');
  if (typeof bytes === 'string') await fs.writeTextFile(path, bytes);
  else await fs.writeFile(path, bytes);
  return path;
}

function mimeFor(fileName: string): string {
  if (fileName.endsWith('.json')) return 'application/json';
  if (fileName.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return 'application/octet-stream';
}

/**
 * Print.
 *
 * Identical on both: the PDF is produced by the engine's own print of the real
 * paginated sheets (§ PDF export uses print CSS), and the Tauri webview drives the same
 * platform print dialog. The caller keeps its own rAF timing — this is only the call.
 */
export function printPage(): void {
  window.print();
}

/**
 * Show a saved file in Finder/Explorer. Desktop only; a no-op on the web, where the
 * browser already put the file somewhere the user chose and we have no path.
 */
export async function revealFile(path: string): Promise<void> {
  if (!isDesktop()) return;
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
  await revealItemInDir(path);
}
