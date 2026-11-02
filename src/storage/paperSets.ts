import { newId } from '@/model/factories';
import { withoutPaperSet, withPaperSet, withSetName, type SetRole } from '@/model/paperSet';
import type { PaperSet, Worksheet } from '@/model/types';
import type { WorksheetStore, WorksheetSummary } from './types';

/**
 * Paper sets as the file list sees them (k-0299, `model/paperSet.ts`): read from the index
 * rows, grouped, and written back to every member. No set is stored anywhere but in its
 * members, so every change here is one save per member.
 */

/** A row's set, validated like every index field; `undefined` when absent or malformed. */
export function summarySet(row: WorksheetSummary): { id: string; name: string } | undefined {
  const set: unknown = row.set;
  if (!set || typeof set !== 'object') return undefined;
  const { id, name } = set as Record<string, unknown>;
  if (typeof id !== 'string' || id.trim() === '') return undefined;
  return { id, name: typeof name === 'string' ? name : '' };
}

/** A row's exam paper, when it is one: only these may join a set. */
export function summaryRole(row: WorksheetSummary): SetRole | undefined {
  const paper: unknown = row.paper;
  return paper === 'paper1' || paper === 'paper2' ? paper : undefined;
}

/** Whether the row is an exam paper in no set: one that "Make a set…" and "Add to set…" offer. */
export function canJoinASet(row: WorksheetSummary): boolean {
  return summaryRole(row) !== undefined && row.kind === undefined && summarySet(row) === undefined;
}

/** One set as the list shows it. */
export interface SetGroup {
  id: string;
  /** The newest member's name: members disagree only after a conflict, and the latest edit wins. */
  name: string;
  /** Paper 1 before Paper 2, then by name (`compareMembers`). */
  members: WorksheetSummary[];
}

const ROLE_ORDER: Record<SetRole, number> = { paper1: 0, paper2: 1 };

/** Set order: Paper 1, Paper 2, anything else; then by name, "Paper 10" after "Paper 9". */
export function compareMembers(a: WorksheetSummary, b: WorksheetSummary): number {
  const rank = (row: WorksheetSummary) => {
    const role = summaryRole(row);
    return role ? ROLE_ORDER[role] : 2;
  };
  return rank(a) - rank(b) || a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
}

/** Every set among `rows`, by id. */
export function setGroups(rows: readonly WorksheetSummary[]): Map<string, SetGroup> {
  const groups = new Map<string, SetGroup & { newest: string }>();
  for (const row of rows) {
    const set = summarySet(row);
    if (!set) continue;
    const group = groups.get(set.id);
    const at = row.updatedAt ?? '';
    if (!group) {
      groups.set(set.id, { id: set.id, name: set.name, members: [row], newest: at });
      continue;
    }
    group.members.push(row);
    if (at > group.newest) {
      group.newest = at;
      group.name = set.name;
    }
  }
  const out = new Map<string, SetGroup>();
  for (const [id, { newest: _newest, ...group }] of groups) {
    void _newest;
    out.set(id, { ...group, members: [...group.members].sort(compareMembers) });
  }
  return out;
}

/** What a set change did: the papers it could not write (a newer build's, or a failed save). */
export interface SetChangeResult {
  failed: string[];
}

/**
 * Apply `change` to each listed document and save the ones it changed, stamped now so sync
 * carries them. Each paper on its own: one that will not load or save is named in `failed`,
 * and the others are still written (a newer build's paper is never rewritten).
 */
export async function changeSetMembers(
  store: Pick<WorksheetStore, 'load' | 'save'>,
  ids: readonly string[],
  change: (worksheet: Worksheet) => Worksheet,
): Promise<SetChangeResult> {
  const failed: string[] = [];
  const now = new Date().toISOString();
  for (const id of ids) {
    try {
      const worksheet = await store.load(id);
      if (!worksheet) throw new Error('missing');
      const next = change(worksheet);
      if (next === worksheet) continue;
      await store.save({ ...next, updatedAt: now });
    } catch {
      failed.push(id);
    }
  }
  return { failed };
}

/** Make a new set of these papers, named `name`. */
export function makeSet(
  store: Pick<WorksheetStore, 'load' | 'save'>,
  ids: readonly string[],
  name: string,
  id: string = newId(),
): Promise<SetChangeResult> {
  const set: PaperSet = { id, name };
  return changeSetMembers(store, ids, (worksheet) => withPaperSet(worksheet, set));
}

/** Put a paper in an existing set. */
export function addToSet(
  store: Pick<WorksheetStore, 'load' | 'save'>,
  docId: string,
  set: { id: string; name: string },
): Promise<SetChangeResult> {
  return changeSetMembers(store, [docId], (worksheet) => withPaperSet(worksheet, set));
}

/** Take papers out of whatever set they are in ("Leave set", and "Ungroup" on every member). */
export function leaveSet(store: Pick<WorksheetStore, 'load' | 'save'>, ids: readonly string[]): Promise<SetChangeResult> {
  return changeSetMembers(store, ids, withoutPaperSet);
}

/** Rename a set on every member. */
export function renameSet(
  store: Pick<WorksheetStore, 'load' | 'save'>,
  group: Pick<SetGroup, 'id' | 'members'>,
  name: string,
): Promise<SetChangeResult> {
  return changeSetMembers(
    store,
    group.members.map((row) => row.id),
    (worksheet) => withSetName(worksheet, group.id, name),
  );
}
