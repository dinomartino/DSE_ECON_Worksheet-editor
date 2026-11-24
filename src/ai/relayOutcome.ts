/**
 * Each finished request through DSEcon Mentor's relay, told to whoever shows the credits
 * (k-0524): the balance Mentor's receipt (or its error) carried, or nothing when it said none
 * (a dropped connection, a cancel), so the listener reads `/ai/credits` instead. Plain
 * pub-sub with no imports, so `client.ts` can tell it and `settings/mentorAccount.ts` hear it
 * without either depending on the other.
 */

export interface RelayOutcome {
  /** Credits left after the request, from Mentor's own answer; absent when it gave none. */
  balance?: number;
}

const listeners = new Set<(outcome: RelayOutcome) => void>();

export function onRelayOutcome(listener: (outcome: RelayOutcome) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function reportRelayOutcome(outcome: RelayOutcome): void {
  for (const l of [...listeners]) {
    try {
      l(outcome);
    } catch (error) {
      console.warn('relay outcome listener failed', error);
    }
  }
}

/** A finite number, or undefined. */
export const balanceOf = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
