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
 * Where desktop files go when the teacher has not chosen yet: a visible folder under
 * Documents, not the hidden app data tree the autosave uses.
 */
export const DEFAULT_FOLDER_NAME = 'Econ Worksheets';

/**
 * The folder the last save or open dialog landed in. Deliberately *not* under the
 * `econ-worksheet:` prefix: the web store treats every key there as a document, and
 * `clear()` removes them all.
 */
export const LAST_FOLDER_KEY = 'econgen.lastFolder';

function lastFolder(): string | undefined {
  try {
    return window.localStorage.getItem(LAST_FOLDER_KEY) || undefined;
  } catch {
    return undefined;
  }
}

/** Remember the folder holding `path`. Best effort — never fails the caller. */
async function rememberFolderOf(path: string): Promise<void> {
  try {
    const { dirname } = await import('@tauri-apps/api/path');
    window.localStorage.setItem(LAST_FOLDER_KEY, await dirname(path));
  } catch {
    // Storage blocked or path unparseable: the next dialog just starts at the default.
  }
}

/** `~/Documents/Econ Worksheets`, created on demand; `undefined` if that fails. */
async function defaultFolder(): Promise<string | undefined> {
  try {
    const { documentDir, join } = await import('@tauri-apps/api/path');
    const folder = await join(await documentDir(), DEFAULT_FOLDER_NAME);
    const { mkdir } = await import('@tauri-apps/plugin-fs');
    await mkdir(folder, { recursive: true });
    return folder;
  } catch {
    return undefined;
  }
}

/** The folder a dialog should open in: the last one used, else the default. */
async function startFolder(): Promise<string | undefined> {
  return lastFolder() ?? (await defaultFolder());
}

/** `folder/name`, or the bare name when there is no folder — never throws. */
async function defaultPathFor(name: string): Promise<string> {
  try {
    const folder = await startFolder();
    if (!folder) return name;
    const { join } = await import('@tauri-apps/api/path');
    return await join(folder, name);
  } catch {
    return name;
  }
}

/**
 * Write a file where the user asks for it.
 *
 * Desktop: a native save sheet opened in the last-used folder (else
 * `~/Documents/Econ Worksheets`), then a write to the chosen path — the dialog's result
 * is auto-scoped by the shell, so no fs capability is needed for the path itself.
 * Returns the path, or `undefined` when the sheet was cancelled.
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
  const path = await save({ defaultPath: await defaultPathFor(suggestedName), filters });
  if (!path) return undefined;

  const bytes = await toBytes(data);
  const fs = await import('@tauri-apps/plugin-fs');
  if (typeof bytes === 'string') await fs.writeTextFile(path, bytes);
  else await fs.writeFile(path, bytes);
  await rememberFolderOf(path);
  return path;
}

/**
 * Let the user pick one text file and read it.
 *
 * Desktop: a native open sheet in the last-used (else default) folder; the dialog
 * plugin adds the picked file to the fs scope, so `readTextFile` needs no wider grant.
 * `undefined` when cancelled — and always on the web, where callers keep their
 * `<input type="file">`.
 */
export async function pickTextFile(
  filters: SaveFilter[],
): Promise<{ name: string; path: string; text: string } | undefined> {
  if (!isDesktop()) return undefined;

  const { open } = await import('@tauri-apps/plugin-dialog');
  const folder = await startFolder();
  const path = await open({
    multiple: false,
    directory: false,
    filters,
    ...(folder ? { defaultPath: folder } : {}),
  });
  if (typeof path !== 'string') return undefined;

  const { readTextFile } = await import('@tauri-apps/plugin-fs');
  const text = await readTextFile(path);
  await rememberFolderOf(path);
  const { basename } = await import('@tauri-apps/api/path');
  return { name: await basename(path), path, text };
}

/**
 * The folder exports go to by default — last used, else `~/Documents/Econ Worksheets`
 * (created if needed). `undefined` on the web, or if neither can be resolved.
 */
export async function exportsFolder(): Promise<string | undefined> {
  if (!isDesktop()) return undefined;
  return startFolder();
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
 *
 * `reveal_item_in_dir` takes no scope (opener 2.5), so this works for any path the
 * save dialog returned; the permission comes from `opener:default`.
 */
export async function revealFile(path: string): Promise<void> {
  if (!isDesktop()) return;
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
  await revealItemInDir(path);
}

/**
 * Open a folder in Finder/Explorer. Desktop only; a no-op on the web.
 *
 * `openPath` is scoped (`opener:allow-open-path` in the capability). A folder outside
 * that scope — one the teacher chose somewhere unusual — falls back to revealing it in
 * its parent, which needs no scope.
 */
export async function openFolder(path: string): Promise<void> {
  if (!isDesktop()) return;
  const { openPath, revealItemInDir } = await import('@tauri-apps/plugin-opener');
  try {
    await openPath(path);
  } catch {
    await revealItemInDir(path);
  }
}

/** The platform's name for "reveal": Finder on macOS, Explorer on Windows. */
export function revealLabel(): string {
  if (typeof navigator === 'undefined') return 'Show in folder';
  const platform = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`;
  if (/Mac/.test(platform)) return 'Show in Finder';
  // Not /win/i: that matches "Darwin".
  if (/Windows|Win32|Win64/.test(platform)) return 'Show in Explorer';
  return 'Show in folder';
}
