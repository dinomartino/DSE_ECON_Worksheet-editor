import { layoutBlockLists } from './edits';
import { newId } from './factories';
import { resolveFlow } from './flow';
import { blockIdOwners, questionIdOwners, type IdOwner, type IdSpace } from './lineage';
import type { FlowItem, Worksheet } from './types';

/**
 * Repair on open: renew ids a document holds twice (§ docs/design/question-library.md,
 * Phase 0). Earlier builds duplicated a question without renewing its blocks,
 * options, rows and cells, so an edit to the copy also rewrote the original.
 *
 * The first owner in flow order keeps its ids; later holders get new ones. Not a
 * migration: ids never print, and a document with nothing duplicated comes back as the
 * *same object*, so the corpus round-trip stays byte-identical.
 *
 * Layout element, band and cover ids are not walked: no copy path duplicates them.
 */

/** Every id owner in flow order: each question, then each layout element's blocks. */
function* documentIdOwners(worksheet: Worksheet): Generator<IdOwner> {
  const visited = new Set<object>();
  const layoutOwners = function* (element: Worksheet['layout'][number]) {
    if (visited.has(element)) return;
    visited.add(element);
    for (const blocks of layoutBlockLists(element)) yield* blockIdOwners(blocks);
  };
  for (const item of resolveFlow(worksheet)) {
    if (item.type === 'question') yield* questionIdOwners(item.question);
    else yield* layoutOwners(item.element);
  }
  // `resolveFlow` drops an element whose id another element also holds; walk it anyway.
  for (const element of worksheet.layout) yield* layoutOwners(element);
}

function hasDuplicateIds(worksheet: Worksheet): boolean {
  const seen = new Set<string>();
  for (const { space, owner } of documentIdOwners(worksheet)) {
    const key = `${space}:${owner.id}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

/**
 * Two questions sharing an id make the flow ambiguous: each `{ question, id }` entry
 * anchors both. The n-th entry for an id is taken to mean the n-th question holding it
 * (a duplicate lands after its original in both lists), so entries past the first
 * follow their question to its new id. Surplus entries keep the first owner's id.
 */
function relinkFlow(flow: FlowItem[], renamed: Map<string, string[]>): FlowItem[] {
  if (renamed.size === 0) return flow;
  const count = new Map<string, number>();
  return flow.map((entry) => {
    const later = entry.type === 'question' ? renamed.get(entry.id) : undefined;
    if (!later) return entry;
    const n = count.get(entry.id) ?? 0;
    count.set(entry.id, n + 1);
    return n === 0 || n > later.length ? entry : { ...entry, id: later[n - 1] };
  });
}

export function dedupeIds(worksheet: Worksheet): Worksheet {
  if (!hasDuplicateIds(worksheet)) return worksheet;

  const copy = structuredClone(worksheet);
  const seen = new Map<IdSpace, Set<string>>();
  const renamed = new Map<string, string[]>();
  // Materialised first: renaming a question mid-walk must not change the order walked.
  for (const { space, owner } of [...documentIdOwners(copy)]) {
    const ids = seen.get(space) ?? new Set<string>();
    seen.set(space, ids);
    if (!ids.has(owner.id)) {
      ids.add(owner.id);
      continue;
    }
    const next = newId();
    if (space === 'question') renamed.set(owner.id, [...(renamed.get(owner.id) ?? []), next]);
    owner.id = next;
    ids.add(next);
  }
  return { ...copy, flow: relinkFlow(copy.flow, renamed) };
}
