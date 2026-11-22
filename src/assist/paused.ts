/**
 * Verbs built and registered but hidden from teachers until the AI is good enough: the
 * menu never lists them and `startVerb` refuses them. Remove an id to bring it back.
 * An id pauses its family too: 'check.syllabus' pauses 'check.syllabus.set' (k-0489).
 */
export const PAUSED_VERBS: ReadonlySet<string> = new Set(['write.answers', 'create.fromSource', 'check.quality']);

let paused: ReadonlySet<string> = PAUSED_VERBS;

export function isPaused(verbId: string): boolean {
  for (let id = verbId; ; id = id.slice(0, id.lastIndexOf('.'))) {
    if (paused.has(id)) return true;
    if (!id.includes('.')) return false;
  }
}

/** Test seam: pause exactly `ids` (none by default) so a paused verb's own tests can run
 *  it; `null` restores `PAUSED_VERBS`. */
export function setPausedForTest(ids: Iterable<string> | null = []): void {
  paused = ids === null ? PAUSED_VERBS : new Set(ids);
}
