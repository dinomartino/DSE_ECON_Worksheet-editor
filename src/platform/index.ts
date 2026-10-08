/**
 * The one place that knows whether this build is running in a browser tab or in the
 * Tauri desktop shell.
 *
 * **Nothing imports `@tauri-apps/*` statically.** The same source tree ships to Vercel
 * as a static web app; a static import would put Tauri in the web bundle and drag native
 * stubs into vitest. So every Tauri module is reached through a dynamic `import()`
 * *inside* a function — here, in `src/desktop/`, or in `storage/fileStore.ts` — which
 * the bundler splits into a chunk the web path never requests. Guarded by
 * `src/test/tauriImports.test.ts`, lint, and `scripts/check-web-bundle.mjs`.
 *
 * Web: the browser's Save As and folder pickers where it has them (Chrome, Edge), else
 * the anchor download that shipped; PDF is `window.print()`. Desktop: native dialogs and
 * a real path on disk.
 */
import {
  folderHas,
  hasFolderPicker,
  hasSavePicker,
  isAbort,
  pickFolder,
  pickSaveFile,
  writeHandle,
} from './webPicker';
import { platformMessages } from './text';

/** File-type presets for the save dialog and the browser's Save As picker. */
export type SaveFilter = { name: string; extensions: string[] };

/** The name reads the interface language when the dialog opens, not when the module loads. */
const filter = (name: () => string, ...extensions: string[]): SaveFilter[] => [
  {
    get name() {
      return name();
    },
    extensions,
  },
];

export const DOCX_FILTERS = filter(() => platformMessages().wordDocument, 'docx');
export const JSON_FILTERS = filter(() => platformMessages().worksheet, 'json');
export const ZIP_FILTERS = filter(() => platformMessages().worksheetBackup, 'zip');
export const CSV_FILTERS: SaveFilter[] = [{ name: 'CSV', extensions: ['csv'] }];
export const XLSX_FILTERS = filter(() => platformMessages().excelWorkbook, 'xlsx');
export const PDF_FILTERS = filter(() => platformMessages().pdfDocument, 'pdf');
export const PNG_FILTERS = filter(() => platformMessages().pngImage, 'png');

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

/** Remember `folder` for the next dialog. Best effort — never fails the caller. */
function rememberFolder(folder: string): void {
  try {
    window.localStorage.setItem(LAST_FOLDER_KEY, folder);
  } catch {
    // Storage blocked: the next dialog just starts at the default.
  }
}

/** Remember the folder holding `path`. Best effort — never fails the caller. */
async function rememberFolderOf(path: string): Promise<void> {
  try {
    const { dirname } = await import('@tauri-apps/api/path');
    rememberFolder(await dirname(path));
  } catch {
    // Path unparseable: the next dialog just starts at the default.
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
 * Where a save went. `path`: on disk (desktop), what `revealFile` shows. `name`: the file
 * or folder the teacher picked in a browser picker. Neither for a plain download.
 */
export interface SavedTo {
  path?: string;
  name?: string;
}

/** A place chosen for one file, written once the file is built. */
export interface SaveTarget {
  write(data: Blob | Uint8Array | string): Promise<SavedTo>;
}

/** A folder chosen for several files. A name already there gets ` (2)`: nothing is replaced. */
export interface FolderTarget {
  name?: string;
  path?: string;
  write(fileName: string, data: Blob | Uint8Array | string): Promise<SavedTo>;
}

/** Will a save ask where (a save sheet or Save As), so that it can be cancelled? */
export function canChooseLocation(): boolean {
  return isDesktop() || hasSavePicker();
}

/** Can several files go to one folder picked once? */
export function canChooseFolder(): boolean {
  return isDesktop() || hasFolderPicker();
}

async function writePath(path: string, data: Blob | Uint8Array | string): Promise<void> {
  const bytes = await toBytes(data);
  const fs = await import('@tauri-apps/plugin-fs');
  if (typeof bytes === 'string') await fs.writeTextFile(path, bytes);
  else await fs.writeFile(path, bytes);
}

/**
 * Ask where one file goes; write it later with `target.write`. `undefined` = cancelled.
 *
 * Desktop: a native save sheet in the last-used folder (else `~/Documents/Econ
 * Worksheets`); the shell scopes the chosen path, so no fs grant is needed for it.
 * Web: the browser's Save As picker, opened before any `await` so the click's activation
 * still holds; without one (Firefox, Safari), or if it fails, the anchor download.
 */
export async function chooseSaveTarget(
  suggestedName: string,
  filters: SaveFilter[] = [],
): Promise<SaveTarget | undefined> {
  if (!isDesktop()) {
    const mime = mimeFor(suggestedName);
    if (hasSavePicker()) {
      try {
        const handle = await pickSaveFile(suggestedName, filters, mime);
        return {
          write: async (data) => {
            await writeHandle(handle, toBlob(data, mime));
            return { name: handle.name };
          },
        };
      } catch (cause) {
        if (isAbort(cause)) return undefined;
        // Lost activation, a cross-origin frame, a policy: the download still works.
      }
    }
    return {
      write: async (data) => {
        const { triggerDownload } = await import('@/storage/download');
        triggerDownload(toBlob(data, mime), suggestedName);
        return {};
      },
    };
  }

  const { save } = await import('@tauri-apps/plugin-dialog');
  const path = await save({ defaultPath: await defaultPathFor(suggestedName), filters });
  if (!path) return undefined;
  return {
    write: async (data) => {
      await writePath(path, data);
      await rememberFolderOf(path);
      return { path };
    },
  };
}

/**
 * Write a file where the user asks for it: `chooseSaveTarget`, then the write. Only for
 * data already in hand; a file built after the click should choose its target first.
 * `undefined` when the teacher cancelled, so nothing was written.
 */
export async function saveFile(
  data: Blob | Uint8Array | string,
  suggestedName: string,
  filters: SaveFilter[] = [],
): Promise<SavedTo | undefined> {
  const target = await chooseSaveTarget(suggestedName, filters);
  return target ? target.write(data) : undefined;
}

/** `name`, else `name (2).ext`, `(3)`…: a folder export never replaces a file. */
export async function freeName(
  name: string,
  taken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  for (let copy = 1; copy < 100; copy += 1) {
    const candidate = copy === 1 ? name : `${stem} (${copy})${extension}`;
    if (!(await taken(candidate))) return candidate;
  }
  throw new Error(`That folder already has too many copies of ${name}.`);
}

/**
 * Ask once for a folder to hold several files. Desktop: the native folder sheet (the
 * dialog plugin scopes the folder's files at runtime). Web: the browser's folder picker.
 * `unavailable` when there is none, or it failed for a reason other than a cancel.
 */
export async function chooseFolderTarget(): Promise<FolderTarget | 'cancelled' | 'unavailable'> {
  if (!isDesktop()) {
    if (!hasFolderPicker()) return 'unavailable';
    let folder: FileSystemDirectoryHandle;
    try {
      folder = await pickFolder();
    } catch (cause) {
      return isAbort(cause) ? 'cancelled' : 'unavailable';
    }
    return {
      name: folder.name,
      write: async (fileName, data) => {
        const name = await freeName(fileName, (candidate) => folderHas(folder, candidate));
        const handle = await folder.getFileHandle(name, { create: true });
        await writeHandle(handle, toBlob(data, mimeFor(name)));
        return { name };
      },
    };
  }

  const { open } = await import('@tauri-apps/plugin-dialog');
  const start = await startFolder();
  const folder = await open({
    directory: true,
    multiple: false,
    canCreateDirectories: true,
    title: platformMessages().chooseExportFolder,
    ...(start ? { defaultPath: start } : {}),
  });
  if (typeof folder !== 'string') return 'cancelled';
  rememberFolder(folder);
  const { join } = await import('@tauri-apps/api/path');
  const { exists } = await import('@tauri-apps/plugin-fs');
  return {
    path: folder,
    write: async (fileName, data) => {
      const name = await freeName(fileName, async (candidate) => exists(await join(folder, candidate)));
      const path = await join(folder, name);
      await writePath(path, data);
      return { path, name };
    },
  };
}

/**
 * Ask where a file should go, without writing it: the same save sheet and start folder
 * as `saveFile`, for a file something else writes (the PDF). Desktop only; `undefined`
 * when cancelled, and always on the web.
 */
export async function chooseSavePath(
  suggestedName: string,
  filters: SaveFilter[] = [],
): Promise<string | undefined> {
  if (!isDesktop()) return undefined;
  const { save } = await import('@tauri-apps/plugin-dialog');
  const path = await save({ defaultPath: await defaultPathFor(suggestedName), filters });
  if (!path) return undefined;
  await rememberFolderOf(path);
  return path;
}

/**
 * The page box a PDF is written at: portrait width × height in points, the turn, and the
 * sheet count (0 = all) — WebKit can add a blank page for a last sheet a sub-pixel over.
 */
export interface PdfPage {
  widthPt: number;
  heightPt: number;
  landscape: boolean;
  pages: number;
}

/**
 * Print the page straight to a PDF file at `path` — no print sheet. Desktop only: the
 * shell's `print_to_pdf` command (WKWebView save job on macOS, WebView2 `PrintToPdf` on
 * Windows), which uses print media CSS like the sheet does. Resolves once the file is
 * written; rejects on the web or when the engine cannot, and the caller falls back to
 * `printPage()`.
 */
export async function savePdf(path: string, page: PdfPage): Promise<void> {
  if (!isDesktop()) throw new Error('Saving a PDF file directly needs the desktop app.');
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('print_to_pdf', {
    path,
    widthPt: page.widthPt,
    heightPt: page.heightPt,
    landscape: page.landscape,
    pages: page.pages,
  });
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
 * `pickTextFile` for binary files (a backup `.zip`): the same sheet, read as bytes.
 * `undefined` when cancelled, and always on the web.
 */
export async function pickFile(
  filters: SaveFilter[],
): Promise<{ name: string; path: string; bytes: Uint8Array } | undefined> {
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

  const { readFile } = await import('@tauri-apps/plugin-fs');
  const bytes = await readFile(path);
  await rememberFolderOf(path);
  const { basename } = await import('@tauri-apps/api/path');
  return { name: await basename(path), path, bytes };
}

/**
 * The open sheet with several files allowed (Import from Word or PDF…). Each file is read
 * when its `read` is called, so the caller can show progress. `[]` when cancelled, and
 * always on the web.
 */
export async function pickFiles(
  filters: SaveFilter[],
): Promise<Array<{ name: string; path: string; read: () => Promise<Uint8Array> }>> {
  if (!isDesktop()) return [];

  const { open } = await import('@tauri-apps/plugin-dialog');
  const folder = await startFolder();
  const picked: unknown = await open({
    multiple: true,
    directory: false,
    filters,
    ...(folder ? { defaultPath: folder } : {}),
  });
  const paths = (Array.isArray(picked) ? picked : typeof picked === 'string' ? [picked] : []).filter(
    (p): p is string => typeof p === 'string',
  );
  if (paths.length === 0) return [];

  await rememberFolderOf(paths[0]);
  const { readFile } = await import('@tauri-apps/plugin-fs');
  const { basename } = await import('@tauri-apps/api/path');
  return Promise.all(paths.map(async (path) => ({ name: await basename(path), path, read: () => readFile(path) })));
}

/** A native file drag over the window, as the start screen needs it (positions dropped). */
export type FileDragEvent =
  | { type: 'enter'; paths: string[] }
  | { type: 'over' }
  | { type: 'drop'; paths: string[] }
  | { type: 'leave' };

/**
 * Listen for files dragged onto the window from Finder/Explorer. Returns the unlisten,
 * which never rejects (`unlistenSafely`).
 *
 * Desktop only: with `dragDropEnabled` on, the webview never sees HTML5 file drops;
 * they arrive as Tauri's `DragDrop` events instead. The fs plugin adds each dropped path
 * to its runtime scope before the event reaches the page — the same route as a path
 * picked in the open sheet — so `readDroppedFile` needs no wider fs grant. A no-op on
 * the web, where the page's own `drop` handler sees the files. These are
 * `onDragDropEvent`'s four events, heard one by one: its unlisten drops their promises.
 */
export async function listenForFileDrops(
  handler: (event: FileDragEvent) => void,
): Promise<() => void> {
  if (!isDesktop()) return () => undefined;
  const { getCurrentWebview } = await import('@tauri-apps/api/webview');
  const webview = getCurrentWebview();
  const on = (event: string, toDrag: (paths: string[]) => FileDragEvent) =>
    webview.listen<{ paths?: string[] } | null>(event, ({ payload }) =>
      handler(toDrag(payload?.paths ?? [])),
    );
  const listening = await Promise.allSettled([
    on('tauri://drag-enter', (paths) => ({ type: 'enter', paths })),
    on('tauri://drag-over', () => ({ type: 'over' })),
    on('tauri://drag-drop', (paths) => ({ type: 'drop', paths })),
    on('tauri://drag-leave', () => ({ type: 'leave' })),
  ]);
  const unlistens = listening.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  const stop = () => unlistens.forEach((unlisten) => unlistenSafely(unlisten));
  const failed = listening.find((r) => r.status === 'rejected');
  if (failed) {
    stop();
    throw failed.reason;
  }
  return stop;
}

/**
 * `listenForFileDrops` for a React effect: a synchronous cleanup that also stops a listen
 * still in flight (StrictMode unmounts before it resolves) — once, and the handler goes
 * quiet the moment it runs.
 */
export function subscribeToFileDrops(handler: (event: FileDragEvent) => void): () => void {
  let stopped = false;
  let stop: (() => void) | undefined;
  void listenForFileDrops((event) => {
    if (!stopped) handler(event);
  }).then(
    (unlisten) => {
      if (stopped) unlisten();
      else stop = unlisten;
    },
    () => undefined,
  );
  return () => {
    if (stopped) return;
    stopped = true;
    stop?.();
  };
}

const UNLISTEN_RETRY_MS = [10, 20, 40, 80, 160];

/**
 * Tauri registers a listener's page half by an eval that can land after `listen`
 * resolves; an unlisten before then throws (`listeners[eventId].handlerId`) and leaves
 * the listener live. So retry briefly, and never reject.
 */
export function unlistenSafely(unlisten: () => unknown, attempt = 0): void {
  const retry = () => {
    const wait = UNLISTEN_RETRY_MS[attempt];
    if (wait !== undefined) setTimeout(() => unlistenSafely(unlisten, attempt + 1), wait);
  };
  try {
    Promise.resolve(unlisten()).catch(retry);
  } catch {
    retry();
  }
}

/** Larger than any worksheet or backup; a drop past it is refused unread. */
export const DROPPED_FILE_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Read a file the teacher dropped on the window (desktop). Throws when it is not a
 * file, is over `DROPPED_FILE_MAX_BYTES`, or cannot be read.
 */
export async function readDroppedFile(path: string): Promise<Uint8Array> {
  if (!isDesktop()) throw new Error('Dropped paths exist only in the desktop app.');
  const { readFile, stat } = await import('@tauri-apps/plugin-fs');
  const info = await stat(path);
  if (!info.isFile) throw new Error('not a file');
  if (info.size > DROPPED_FILE_MAX_BYTES) throw new Error('too large to be a worksheet');
  return readFile(path);
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
  if (fileName.endsWith('.zip')) return 'application/zip';
  if (fileName.endsWith('.csv')) return 'text/csv;charset=utf-8';
  if (fileName.endsWith('.png')) return 'image/png';
  if (fileName.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (fileName.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return 'application/octet-stream';
}

/**
 * Print: the engine's own print of the real paginated sheets (§ PDF export uses print
 * CSS), whose system dialog offers "Save as PDF" — the web's PDF route, and the
 * desktop's fallback when `savePdf` fails. The caller keeps its own rAF timing.
 *
 * Web: `window.print()` blocks until the dialog closes. macOS desktop: the shell swaps
 * `window.print` for an async `plugin:webview|print` invoke (WKWebView has no print of
 * its own), which needs `core:webview:allow-print` and resolves once the sheet is up —
 * so a denial arrives as a rejection here, not as an unhandled one.
 */
export async function printPage(): Promise<void> {
  await (window.print() as unknown as Promise<void> | undefined);
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

/**
 * Open an `https:` or `mailto:` link outside the app.
 *
 * Desktop: the default browser or mail client, via the opener (`opener:default` grants
 * both schemes). Web: a new tab for https; a mailto goes through `location` so no blank
 * tab is left behind.
 */
export async function openExternal(url: string): Promise<void> {
  if (!/^(https:|mailto:)/.test(url)) throw new Error(`Refusing to open ${url}`);
  if (isDesktop()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return;
  }
  if (url.startsWith('mailto:')) window.location.href = url;
  else window.open(url, '_blank', 'noopener');
}

/** The platform's name for "reveal": Finder on macOS, Explorer on Windows. */
export function revealLabel(): string {
  const m = platformMessages();
  if (typeof navigator === 'undefined') return m.showInFolder;
  const platform = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`;
  if (/Mac/.test(platform)) return m.showInFinder;
  // Not /win/i: that matches "Darwin".
  if (/Windows|Win32|Win64/.test(platform)) return m.showInExplorer;
  return m.showInFolder;
}
