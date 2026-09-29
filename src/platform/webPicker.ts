/**
 * The browser's own Save As and folder pickers (File System Access API: Chrome, Edge).
 * Firefox and Safari have neither, and keep the anchor download. Each picker needs the
 * click's user activation, so callers open it before any slow work.
 */

interface PickerType {
  description?: string;
  accept: Record<string, string[]>;
}

/** The two picker entry points; not in TypeScript's DOM lib. */
interface PickerWindow {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: PickerType[];
    id?: string;
    startIn?: string;
  }) => Promise<FileSystemFileHandle>;
  showDirectoryPicker?: (options: {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: string;
  }) => Promise<FileSystemDirectoryHandle>;
}

/** One remembered start folder for every export picker (Chrome keys it by id). */
const PICKER_ID = 'econ-export';

function pickers(): PickerWindow {
  return typeof window === 'undefined' ? {} : (window as unknown as PickerWindow);
}

export function hasSavePicker(): boolean {
  return typeof pickers().showSaveFilePicker === 'function';
}

export function hasFolderPicker(): boolean {
  return typeof pickers().showDirectoryPicker === 'function';
}

/** The teacher closed the picker: nothing is written, and nothing falls back. */
export function isAbort(cause: unknown): boolean {
  return errorName(cause) === 'AbortError';
}

/** A `DOMException`'s name; checked by shape, not `instanceof`, so a fake one counts. */
function errorName(cause: unknown): unknown {
  return typeof cause === 'object' && cause !== null ? (cause as { name?: unknown }).name : undefined;
}

/** Filters as picker types; the mime drops its parameters (`;charset=`), which Chrome rejects. */
function pickerTypes(
  filters: Array<{ name: string; extensions: string[] }>,
  mime: string,
): PickerType[] | undefined {
  const type = mime.split(';')[0];
  const types = filters
    .filter((filter) => filter.extensions.length > 0)
    .map((filter) => ({
      description: filter.name,
      accept: { [type]: filter.extensions.map((extension) => `.${extension}`) },
    }));
  return types.length > 0 ? types : undefined;
}

/** Must be called inside the click: the picker call itself is synchronous. */
export function pickSaveFile(
  suggestedName: string,
  filters: Array<{ name: string; extensions: string[] }>,
  mime: string,
): Promise<FileSystemFileHandle> {
  const show = pickers().showSaveFilePicker;
  if (!show) return Promise.reject(new Error('No save picker'));
  const types = pickerTypes(filters, mime);
  return show({ suggestedName, id: PICKER_ID, startIn: 'documents', ...(types ? { types } : {}) });
}

export function pickFolder(): Promise<FileSystemDirectoryHandle> {
  const show = pickers().showDirectoryPicker;
  if (!show) return Promise.reject(new Error('No folder picker'));
  return show({ id: PICKER_ID, mode: 'readwrite', startIn: 'documents' });
}

/** Replace the file's contents; a failed write leaves the old contents. */
export async function writeHandle(handle: FileSystemFileHandle, blob: Blob): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(blob);
    await writable.close();
  } catch (cause) {
    await writable.abort().catch(() => undefined);
    throw cause;
  }
}

/** Does `name` exist in the folder? Anything but "not found" counts as taken. */
export async function folderHas(folder: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await folder.getFileHandle(name);
    return true;
  } catch (cause) {
    return errorName(cause) !== 'NotFoundError';
  }
}
