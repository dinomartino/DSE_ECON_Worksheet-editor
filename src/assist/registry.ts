import type { AiVerb, VerbGroup } from './types';

/** Menu order of the groups; verbs sort by group, then `order`. */
export const GROUP_ORDER: readonly VerbGroup[] = ['translate', 'check', 'write', 'create'];

const registered = new Map<string, AiVerb>();

/** Idempotent by id: a second registration of the same id replaces the first. */
export function registerVerb(verb: AiVerb): void {
  registered.set(verb.id, verb);
}

export function verbs(): AiVerb[] {
  return [...registered.values()].sort(
    (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.order - b.order,
  );
}

export function verbById(id: string): AiVerb | undefined {
  return registered.get(id);
}

/** Test seam. */
export function resetVerbsForTest(): void {
  registered.clear();
}
