/**
 * Sampled tables for the fast lane (k-0611, plan `Outbox/k-0604/TEST-AUDIT.md` §10, §17 R2).
 *
 * `npm test` is the fast lane: a generated table larger than about 60 cases runs a fixed,
 * chosen sample of itself. `npm run test:full` (the isolated lane, nightly and the release
 * gate) sets `TEST_FULL=1` and runs every case. A sample is never random: the same cases
 * run every time, so a red fast lane is the code's fault, not the draw's.
 */
export const FULL = process.env.TEST_FULL === '1';

type Slope = 'normal' | 'steep' | 'flat';
type Size = 'small' | 'normal' | 'large';

/**
 * The 5-triple design (demand slope, supply slope, size): the plain case plus the extremes,
 * every combination of steep and flat met once, at every size. Against the full 27 it killed
 * every mutant the full table kills, including the one only 10 of 1,593 cases catch
 * (`Outbox/k-0604/data/mutation-check-matrix.txt`).
 */
const DESIGN: ReadonlyArray<readonly [Slope, Slope, Size]> = [
  ['normal', 'normal', 'normal'],
  ['steep', 'flat', 'small'],
  ['flat', 'steep', 'large'],
  ['steep', 'steep', 'normal'],
  ['flat', 'flat', 'normal'],
];

/**
 * The (demand, supply, size) triples a table runs: every one under `TEST_FULL`, else the
 * design. A slope or size the caller does not draw (a monopoly with constant MC has only a
 * normal supply) is replaced by the first one it does, so the sample stays inside the table.
 */
export function slopeSizeTriples<D extends Slope, S extends Slope, Z extends Size>(
  demands: readonly D[],
  supplies: readonly S[],
  sizes: readonly Z[],
): Array<{ demand: D; supply: S; size: Z }> {
  const all: Array<{ demand: D; supply: S; size: Z }> = [];
  for (const demand of demands) for (const supply of supplies) for (const size of sizes) all.push({ demand, supply, size });
  if (FULL) return all;
  const within = <T extends string>(list: readonly T[], value: string): T =>
    (list as readonly string[]).includes(value) ? (value as T) : list[0];
  const seen = new Set<string>();
  const out: Array<{ demand: D; supply: S; size: Z }> = [];
  for (const [d, s, z] of DESIGN) {
    const triple = { demand: within(demands, d), supply: within(supplies, s), size: within(sizes, z) };
    const key = `${triple.demand}/${triple.supply}/${triple.size}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(triple);
  }
  return out;
}

/** A seed count: `fast` in the fast lane, `full` under `TEST_FULL`; an explicit env value wins. */
export function seedCount(envValue: string | undefined, fast: number, full: number): number {
  const asked = Number(envValue);
  if (Number.isFinite(asked) && asked > 0) return asked;
  return FULL ? full : fast;
}
