import type { StudioDraft, VersionMade } from '@/questionStudio/types';
import type { ChatDraft } from './chatTypes';

/**
 * A draft's history (k-0530, u-hyt5): every AI result is a version, and so is the teacher's
 * own edit. Each version keeps the number it was given (第 N 版), so showing an older one
 * moves nothing. A teacher's edit never overwrites an AI version: the first Save on one makes
 * a new 「你修改」 version; further saves while that edited version is shown update it in place.
 * The AI's next change makes a new version from whatever is shown. Nothing is deleted.
 *
 * Storage stays as before (`entry.draft` = the version shown, `older` = the rest), so every
 * reader of `entry.draft` (Add, the page, the AI's next turn) gets the one shown.
 */

/** The SHORT words of a change in the list ("更難", or the teacher's request cut to a phrase). */
export const SAID_MAX = 40;

const numberAt = (draft: ChatDraft, version: StudioDraft): number => {
  if (version.version !== undefined) return version.version;
  const at = draft.older.indexOf(version);
  return at >= 0 ? at + 1 : draft.older.length + 1;
};

/** A draft saved before k-0530: its versions numbered by their place (older first, the one shown last). */
export function numbered(draft: ChatDraft): ChatDraft {
  if (draft.entry.draft.version !== undefined && draft.older.every((v) => v.version !== undefined)) return draft;
  return {
    ...draft,
    older: draft.older.map((v, i) => (v.version === undefined ? { ...v, version: i + 1 } : v)),
    entry: { ...draft.entry, draft: draft.entry.draft.version === undefined ? { ...draft.entry.draft, version: draft.older.length + 1 } : draft.entry.draft },
  };
}

/** Every version, newest (highest number) first, with its number. */
export function versionsOf(draft: ChatDraft): Array<{ no: number; version: StudioDraft; current: boolean }> {
  return [...draft.older, draft.entry.draft]
    .map((version) => ({ no: numberAt(draft, version), version, current: version === draft.entry.draft }))
    .sort((a, b) => b.no - a.no);
}

/** The number the next version gets. */
export const nextNumber = (draft: ChatDraft): number => Math.max(0, ...versionsOf(draft).map((v) => v.no)) + 1;

/** The number of the version shown. */
export const currentNumber = (draft: ChatDraft): number => numberAt(draft, draft.entry.draft);

/** Who made a version, for a draft with no record (an AI version from before k-0530: the first one wrote it). */
export const madeOf = (version: StudioDraft, no: number): VersionMade => version.made ?? { by: 'ai', how: no === 1 ? 'write' : 'change', at: '' };

/** A new AI draft: version 1, written by the AI. */
export const firstVersion = (draft: StudioDraft, at: string, how: VersionMade['how'] = 'write'): StudioDraft => ({ ...draft, version: 1, made: { by: 'ai', how, at } });

/** The AI's change of the version shown: a new version on top, shown. */
export function withAiVersion(draft: ChatDraft, made: StudioDraft, how: VersionMade['how'], said: string, at: string): ChatDraft {
  const base = numbered(draft);
  const version: StudioDraft = { ...made, version: nextNumber(base), made: { by: 'ai', how, ...(said ? { said: said.slice(0, SAID_MAX) } : {}), at } };
  return { ...base, older: [...base.older, base.entry.draft], entry: { ...base.entry, draft: version } };
}

/**
 * The teacher's edit of the version shown. On an AI version: a new 「你修改」 version on top.
 * On a version that is already theirs: that version, updated in place (same number).
 */
export function withEdit(draft: ChatDraft, edited: StudioDraft, at: string): ChatDraft {
  const base = numbered(draft);
  const shown = base.entry.draft;
  if (shown.made?.by === 'you') {
    const version: StudioDraft = { ...edited, version: shown.version, made: { ...shown.made, at } };
    return { ...base, entry: { ...base.entry, draft: version } };
  }
  const version: StudioDraft = { ...edited, version: nextNumber(base), made: { by: 'you', at, from: currentNumber(base) } };
  return { ...base, older: [...base.older, shown], entry: { ...base.entry, draft: version } };
}

/** Show another version (by its id): it becomes the one Add, the page and the AI use. Nothing is deleted or renumbered. */
export function showing(draft: ChatDraft, versionId: string): ChatDraft {
  const base = numbered(draft);
  const picked = base.older.find((v) => v.id === versionId);
  if (!picked) return base;
  return { ...base, older: [...base.older.filter((v) => v !== picked), base.entry.draft], entry: { ...base.entry, draft: picked } };
}

/** Undo edit: show the version the shown edit came from (when it is still there). */
export function undoEdit(draft: ChatDraft): ChatDraft {
  const base = numbered(draft);
  const from = base.entry.draft.made?.by === 'you' ? base.entry.draft.made.from : undefined;
  const target = from === undefined ? undefined : base.older.find((v) => v.version === from);
  return target ? showing(base, target.id) : base;
}
