import { verbs } from '@/assist/registry';
import type { AiVerb, VerbAvailability, VerbContext, VerbGroup } from '@/assist/types';

/** The AI menu's rows, pure: what the popover renders and the keyboard walks. */

export const GROUP_HEADING: Readonly<Record<VerbGroup, string>> = {
  translate: 'Translate',
  check: 'Check',
  write: 'Write',
  create: 'Create',
};

export interface MenuRow {
  verb: AiVerb;
  label: string;
  availability: VerbAvailability;
  /** False: greyed, `availability.disabledReason` as its tooltip. */
  runnable: boolean;
}

export interface MenuGroup {
  group: VerbGroup;
  heading: string;
  rows: MenuRow[];
}

/** Every offered verb in registry order, grouped; `available() === null` hides one, and
 *  `query` filters by label (case-insensitive). */
export function menuGroups(ctx: VerbContext, query = ''): MenuGroup[] {
  const needle = query.trim().toLowerCase();
  const groups: MenuGroup[] = [];
  for (const verb of verbs()) {
    const availability = verb.available(ctx);
    if (!availability) continue;
    const label = verb.label(ctx);
    if (needle && !label.toLowerCase().includes(needle)) continue;
    const row: MenuRow = { verb, label, availability, runnable: availability.disabledReason === undefined };
    const last = groups[groups.length - 1];
    if (last?.group === verb.group) last.rows.push(row);
    else groups.push({ group: verb.group, heading: GROUP_HEADING[verb.group], rows: [row] });
  }
  return groups;
}

export const runnableIds = (groups: readonly MenuGroup[]): string[] =>
  groups.flatMap((g) => g.rows.filter((r) => r.runnable).map((r) => r.verb.id));

/** The highlighted verb: the pointer's or keyboard's choice while it is still runnable,
 *  else the preselected verb, else the first runnable one. */
export function highlighted(groups: readonly MenuGroup[], active?: string, preselect?: string): string | undefined {
  const ids = runnableIds(groups);
  if (active !== undefined && ids.includes(active)) return active;
  if (preselect !== undefined && ids.includes(preselect)) return preselect;
  return ids[0];
}

/** ↑ / ↓ over the runnable verbs, wrapping. */
export function stepHighlight(groups: readonly MenuGroup[], current: string | undefined, delta: 1 | -1): string | undefined {
  const ids = runnableIds(groups);
  if (ids.length === 0) return undefined;
  const at = current === undefined ? -1 : ids.indexOf(current);
  if (at < 0) return delta === 1 ? ids[0] : ids[ids.length - 1];
  return ids[(at + delta + ids.length) % ids.length];
}

export type MenuStep = { kind: 'list' } | { kind: 'setup'; verbId: string } | { kind: 'input'; verbId: string };

/** What choosing a verb does: set a provider up first, ask for its input, or run now. */
export function stepFor(verb: AiVerb, configured: boolean): MenuStep | 'run' {
  if (verb.needsKey && !configured) return { kind: 'setup', verbId: verb.id };
  if (verb.input) return { kind: 'input', verbId: verb.id };
  return 'run';
}

/** "52 texts", "1 part", or nothing. */
export function countLabel(a: VerbAvailability): string {
  if (a.count === undefined) return '';
  return a.unit ? `${a.count} ${a.unit}` : String(a.count);
}
