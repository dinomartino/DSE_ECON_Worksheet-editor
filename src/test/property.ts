import fc from 'fast-check';

/**
 * Shared settings for the property tests (`*.property.test.ts`, k-0607).
 *
 * A property states a rule that must hold for every generated input. The seed is fixed,
 * so `npm test` and CI run the same cases every time and a red run is the code's fault,
 * not the dice's. To explore beyond them: `FC_SEED=<n>` picks other cases, `FC_RUNS=<k>`
 * multiplies how many. A failure prints its seed, path and shrunk counterexample; replay
 * it with that `FC_SEED` (fast-check also accepts the printed `path`). Each suite sets a long
 * test timeout: `FC_RUNS` and a busy machine both stretch a run past vitest's 5 s default.
 */
export const PROPERTY_SEED = Number(process.env.FC_SEED ?? 607);

const RUNS_SCALE = Number(process.env.FC_RUNS ?? 1);

/** `fc.assert` with the fixed seed and a bounded number of cases (default 100). */
export function holds<Ts extends [unknown, ...unknown[]]>(
  property: fc.IProperty<Ts>,
  runs = 100,
): void {
  fc.assert(property, {
    seed: PROPERTY_SEED,
    numRuns: Math.max(1, Math.round(runs * RUNS_SCALE)),
  });
}
