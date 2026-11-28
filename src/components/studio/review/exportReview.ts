import pkg from '../../../../package.json';
import { chooseSaveTarget, SET_ZIP_FILTERS, type SavedTo } from '@/platform';
import { CHATS_KEY, PAPER_CHATS_KEY, readChat } from '../chat/chatStorage';
import type { Chat } from '../chat/chatTypes';
import { buildReviewFiles, promptIdsOf, type BuiltExport, type ExportChat } from './exportFiles';
import { reviewRecorder } from './live';
import { useReviewNotes } from './notes';
import { sharedReviewStore, type ReviewStore } from './reviewStore';
import type { ChatNotes } from './types';

/**
 * Export for review (k-0598): ask where the .zip goes (the app's own save sheet on the desktop,
 * asked first so the click still counts in a browser), write every note and record still
 * waiting, read what the chosen chats need, build the files (`exportFiles.ts`) and zip them
 * under one folder. `all` = both chat lists (the studio's and the ✦ Write panel's).
 */
export type ReviewScope = 'this' | 'all';

const stamp = (d: Date) => d.toISOString().slice(0, 16).replace('T', '-').replace(':', '');

/** A saved chat list, read as it is stored (no pictures, nothing written back). */
export function storedChats(key: string, store: Pick<Storage, 'getItem'> | undefined = typeof window === 'undefined' ? undefined : window.localStorage): Chat[] {
  try {
    const raw = store?.getItem(key);
    const data: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data.map(readChat).filter((c): c is Chat => c !== undefined) : [];
  } catch {
    return [];
  }
}

/** The chats an export holds: the one open, or every chat of both lists (the shown store's own, in memory, win). */
export function chatsFor(scope: ReviewScope, open: Chat, mine: readonly Chat[], list: ExportChat['list'], read: (key: string) => Chat[] = storedChats): ExportChat[] {
  if (scope === 'this') return [{ chat: open, list }];
  const other: ExportChat['list'] = list === 'studio' ? 'panel' : 'studio';
  const own = mine.filter((c) => c.turns.length > 0);
  const ids = new Set(own.map((c) => c.id));
  const theirs = read(other === 'studio' ? CHATS_KEY : PAPER_CHATS_KEY).filter((c) => c.turns.length > 0 && !ids.has(c.id));
  return [...own.map((chat) => ({ chat, list })), ...theirs.map((chat) => ({ chat, list: other }))];
}

/** Everything one export needs from the review store. */
export async function gather(chats: readonly ExportChat[], store: ReviewStore, now: Date, version: string): Promise<BuiltExport> {
  const ids = chats.map((c) => c.chat.id);
  const traces = await store.turnsOf(ids);
  const notes = new Map<string, ChatNotes>();
  await Promise.all(
    ids.map(async (id) => {
      const found = await store.notesOf(id);
      if (found) notes.set(id, found);
    }),
  );
  const prompts = await store.prompts(promptIdsOf(traces));
  return buildReviewFiles({ chats, traces, notes, prompts, exportedAt: now.toISOString(), version });
}

export async function zipReview(built: BuiltExport, folder: string): Promise<Uint8Array> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const root = zip.folder(folder) ?? zip;
  for (const [path, text] of built.files) root.file(path, text);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

export async function exportForReview(chats: readonly ExportChat[], now: Date = new Date()): Promise<{ saved: SavedTo; built: BuiltExport } | undefined> {
  const folder = `studio-review-${stamp(now)}`;
  const target = await chooseSaveTarget(`${folder}.zip`, SET_ZIP_FILTERS);
  if (!target) return undefined;
  await Promise.all([reviewRecorder().flush(), useReviewNotes.getState().flush()]);
  const built = await gather(chats, sharedReviewStore(), now, pkg.version);
  const saved = await target.write(await zipReview(built, folder));
  return { saved, built };
}
