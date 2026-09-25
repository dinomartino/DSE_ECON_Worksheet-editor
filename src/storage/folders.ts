import type { WorksheetStore } from './types';

/**
 * Folders on the file dashboard — filing metadata, shared by both stores.
 *
 * **A separate list, never a field on an index row or a document.** An older build
 * rewrites the index from rows it knows (`summarize`), so a `folderId` on a row would be
 * dropped by the next save anywhere — every assignment silently undone. Here the folders
 * and the document→folder map live in their own key (`econ-worksheet-folders`) or file
 * (`worksheets/folders.json`), which no older build reads, writes or clears.
 *
 * **Every failure means "at root".** An unreadable file is no folders; a malformed row is
 * skipped alone; an assignment naming a folder that is gone is ignored. Folders only ever
 * narrow the view — no state of this file can hide a document from "All documents".
 */

export interface Folder {
  id: string;
  name: string;
  createdAt?: string;
}

export interface FolderState {
  folders: Folder[];
  /** Document id → folder id. A document with no entry, or a stale one, is at root. */
  assignments: Record<string, string>;
  /** Top-level fields a newer build wrote, kept through a rewrite. */
  __unknown?: Record<string, unknown>;
}

export const EMPTY_FOLDERS: FolderState = { folders: [], assignments: {} };

/** Longest folder name kept; longer is cut, not refused. */
export const FOLDER_NAME_MAX = 60;

const FORMAT = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Parsed JSON → a state this build can use, judged row by row like the index. A folder
 * needs a string `id` and `name` (a repeat id keeps the first); anything else on a row
 * passes through untouched. An assignment needs a string value.
 */
export function usableFolders(parsed: unknown): FolderState {
  if (!isRecord(parsed)) return { folders: [], assignments: {} };
  const { folders: rawFolders, assignments: rawAssignments, ...rest } = parsed;
  delete rest.format;
  const folders: Folder[] = [];
  const seen = new Set<string>();
  if (Array.isArray(rawFolders)) {
    for (const row of rawFolders) {
      if (!isRecord(row) || typeof row.id !== 'string' || typeof row.name !== 'string') continue;
      if (!row.id || seen.has(row.id)) continue;
      seen.add(row.id);
      folders.push(row as unknown as Folder);
    }
  }
  const assignments: Record<string, string> = {};
  if (isRecord(rawAssignments)) {
    for (const [docId, folderId] of Object.entries(rawAssignments)) {
      if (typeof folderId === 'string' && folderId) assignments[docId] = folderId;
    }
  }
  const state: FolderState = { folders, assignments };
  if (Object.keys(rest).length > 0) state.__unknown = rest;
  return state;
}

/** A raw stored string → state; anything unparseable is no folders. */
export function parseFolders(raw: string | null | undefined): FolderState {
  if (!raw) return { folders: [], assignments: {} };
  try {
    return usableFolders(JSON.parse(raw));
  } catch {
    return { folders: [], assignments: {} };
  }
}

export function serializeFolders(state: FolderState): Record<string, unknown> {
  return {
    ...(state.__unknown ?? {}),
    format: FORMAT,
    folders: state.folders,
    assignments: state.assignments,
  };
}

/** Nothing worth a key or a file: no folders and nothing filed. */
export function isEmptyFolders(state: FolderState): boolean {
  return state.folders.length === 0 && Object.keys(state.assignments).length === 0;
}

/** The folder a document is in, or `undefined` for root — a stale assignment is root. */
export function folderOf(state: FolderState, docId: string): Folder | undefined {
  const folderId = state.assignments[docId];
  if (!folderId) return undefined;
  return state.folders.find((folder) => folder.id === folderId);
}

/** Folders in name order, naturally ("Unit 10" after "Unit 9"). */
export function sortedFolders(state: FolderState): Folder[] {
  return [...state.folders].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
  );
}

export function cleanFolderName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, FOLDER_NAME_MAX);
}

/** Why a name cannot be used, or `undefined` if it can. Names are unique, case-blind. */
export function folderNameProblem(
  state: FolderState,
  name: string,
  exceptId?: string,
): string | undefined {
  const clean = cleanFolderName(name);
  if (!clean) return 'Give the folder a name.';
  const taken = state.folders.some(
    (folder) =>
      folder.id !== exceptId &&
      folder.name.localeCompare(clean, undefined, { sensitivity: 'base' }) === 0,
  );
  return taken ? 'There is already a folder with that name.' : undefined;
}

export function createFolder(
  state: FolderState,
  name: string,
  id: string,
  now = new Date().toISOString(),
): FolderState {
  return {
    ...state,
    folders: [...state.folders, { id, name: cleanFolderName(name), createdAt: now }],
  };
}

export function renameFolder(state: FolderState, id: string, name: string): FolderState {
  return {
    ...state,
    folders: state.folders.map((folder) =>
      folder.id === id ? { ...folder, name: cleanFolderName(name) } : folder,
    ),
  };
}

/**
 * The folder goes; its documents — live or in the Trash — return to root. Never deletes
 * a document: a folder is a label, not a container.
 */
export function deleteFolder(state: FolderState, id: string): FolderState {
  return {
    ...state,
    folders: state.folders.filter((folder) => folder.id !== id),
    assignments: Object.fromEntries(
      Object.entries(state.assignments).filter(([, folderId]) => folderId !== id),
    ),
  };
}

/** File documents into a folder; `undefined` (or an unknown folder) takes them to root. */
export function moveToFolder(
  state: FolderState,
  docIds: string[],
  folderId: string | undefined,
): FolderState {
  const known = folderId !== undefined && state.folders.some((folder) => folder.id === folderId);
  const assignments = { ...state.assignments };
  for (const docId of docIds) {
    if (known) assignments[docId] = folderId;
    else delete assignments[docId];
  }
  return { ...state, assignments };
}

/**
 * Drop the assignments of documents deleted for good. A document moved to Trash keeps
 * its assignment, so Restore puts it back in its folder; only a purge forgets it.
 */
export function forgetDocuments(state: FolderState, docIds: string[]): FolderState {
  if (!docIds.some((docId) => docId in state.assignments)) return state;
  const assignments = { ...state.assignments };
  for (const docId of docIds) delete assignments[docId];
  return { ...state, assignments };
}

/** A copy sits where its original did (duplicate; a restore beside a live twin). */
export function copyAssignment(state: FolderState, fromId: string, toId: string): FolderState {
  const folder = folderOf(state, fromId);
  return folder ? moveToFolder(state, [toId], folder.id) : state;
}

/** How many of `docIds` sit in each folder — the folder list's counts. */
export function folderCounts(state: FolderState, docIds: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const docId of docIds) {
    const folder = folderOf(state, docId);
    if (folder) counts.set(folder.id, (counts.get(folder.id) ?? 0) + 1);
  }
  return counts;
}

/**
 * The folder part of a backup: every folder, and the assignments of the documents in it.
 */
export function foldersForBackup(state: FolderState, docIds: string[]): FolderState {
  const assignments: Record<string, string> = {};
  for (const docId of docIds) {
    const folder = folderOf(state, docId);
    if (folder) assignments[docId] = folder.id;
  }
  return { folders: state.folders, assignments };
}

/**
 * A backup's folders merged into what is here, **never overwriting**: a folder already
 * here (same id, or same name) is reused as it is; a new one is added. Each restored
 * document is filed only if it has no folder here yet. `placed` maps a backup document
 * id to the id it was saved under (a copy has a new one); documents not in it — skipped
 * as already here, or unsaved — are left exactly where they are.
 */
export function mergeBackupFolders(
  current: FolderState,
  incoming: FolderState,
  placed: Map<string, string>,
): FolderState {
  let next = current;
  const mapped = new Map<string, string>();
  for (const folder of incoming.folders) {
    const byId = next.folders.find((f) => f.id === folder.id);
    const byName = next.folders.find(
      (f) => f.name.localeCompare(folder.name, undefined, { sensitivity: 'base' }) === 0,
    );
    const reuse = byId ?? byName;
    if (reuse) {
      mapped.set(folder.id, reuse.id);
      continue;
    }
    next = { ...next, folders: [...next.folders, { ...folder, name: cleanFolderName(folder.name) }] };
    mapped.set(folder.id, folder.id);
  }
  for (const [fromId, toId] of placed) {
    const target = mapped.get(incoming.assignments[fromId] ?? '');
    if (!target || folderOf(next, toId)) continue;
    next = moveToFolder(next, [toId], target);
  }
  return next;
}

/**
 * Read, change, write — always from what is stored now, never from a copy a screen
 * has held since it loaded, so two edits cannot undo each other.
 */
export async function updateFolders(
  store: Pick<WorksheetStore, 'readFolders' | 'writeFolders'>,
  recipe: (state: FolderState) => FolderState,
): Promise<FolderState> {
  const next = recipe(await store.readFolders());
  await store.writeFolders(next);
  return next;
}
