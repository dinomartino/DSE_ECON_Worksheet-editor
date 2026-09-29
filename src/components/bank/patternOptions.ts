import { cleanPatternName, matchPatternName, samePatternName, type PatternMatch } from '@/model/patterns';

/**
 * The 題型 picker's list for what has been typed (§ PatternPicker.tsx). Matching names
 * come first, best first; names only close to the typed one follow; "New 題型" is last and
 * only when no name is the same. The highlight starts on the best match, so Enter picks
 * an existing 題型 rather than making a near-duplicate; with no match it starts on New.
 */
export type PatternOption =
  | { kind: 'name'; name: string; match?: PatternMatch }
  | { kind: 'new'; name: string; close: string[] }
  | { kind: 'clear' };

export interface PatternOptions {
  options: PatternOption[];
  /** The highlighted option on open or after typing; -1 when nothing is. */
  active: number;
}

const RANK: Record<PatternMatch, number> = { same: 0, prefix: 1, contains: 2, close: 3 };

export function patternOptions(
  names: readonly string[],
  query: string,
  { value, clearable = false }: { value?: string | null; clearable?: boolean } = {},
): PatternOptions {
  const typed = cleanPatternName(query);
  if (!typed) {
    const options: PatternOption[] = [
      ...(clearable ? [{ kind: 'clear' } as const] : []),
      ...names.map((name) => ({ kind: 'name', name }) as const),
    ];
    const active =
      value === null
        ? options.findIndex((option) => option.kind === 'clear')
        : value
          ? options.findIndex((option) => option.kind === 'name' && samePatternName(option.name, value))
          : -1;
    return { options, active };
  }
  const scored = names
    .map((name, order) => ({ name, order, match: matchPatternName(typed, name) }))
    .filter((item): item is { name: string; order: number; match: PatternMatch } => item.match !== undefined)
    .sort((a, b) => RANK[a.match] - RANK[b.match] || a.order - b.order);
  const options: PatternOption[] = scored.map(({ name, match }) => ({ kind: 'name', name, match }));
  const same = scored.some((item) => item.match === 'same');
  if (!same) options.push({ kind: 'new', name: typed, close: scored.filter((item) => item.match === 'close').map((item) => item.name) });
  const best = scored.findIndex((item) => item.match !== 'close');
  return { options, active: best >= 0 ? best : options.length - 1 };
}

/** The next highlight for ↑ (-1) or ↓ (+1), wrapping; from nothing, ↓ is the first. */
export function stepActive(active: number, delta: number, count: number): number {
  if (count === 0) return -1;
  if (active < 0) return delta > 0 ? 0 : count - 1;
  return (active + delta + count) % count;
}
