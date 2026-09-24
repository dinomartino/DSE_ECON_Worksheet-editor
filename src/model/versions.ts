import type { OutputMode, Worksheet } from './types';

/**
 * Paper versions A, B, C… (`Worksheet.versions`). Only a count and a seed are stored;
 * each question type derives its own order through the registry's `variant` hook.
 * Version A is always the authored order, so the editor never shows a shuffled page
 * unless asked to.
 */

export const MAX_VERSIONS = 4;

export const versionLetter = (index: number): string => String.fromCharCode(65 + index);

/** 1 when versions are off; otherwise 2–`MAX_VERSIONS`. */
export function versionCount(worksheet: Worksheet): number {
  const count = worksheet.versions?.count;
  if (typeof count !== 'number' || !Number.isInteger(count)) return 1;
  return Math.min(MAX_VERSIONS, Math.max(1, count));
}

/** Every version's letter, or none when versions are off. */
export function versionLetters(worksheet: Worksheet): string[] {
  const count = versionCount(worksheet);
  return count < 2 ? [] : Array.from({ length: count }, (_, index) => versionLetter(index));
}

/**
 * The version this output prints, as an index (0 = A); `undefined` when versions are
 * off. An unknown or out-of-range letter prints A.
 */
export function activeVersion(worksheet: Worksheet, mode: OutputMode): number | undefined {
  const count = versionCount(worksheet);
  if (count < 2) return undefined;
  const letter = mode.variant?.trim().toUpperCase() ?? 'A';
  const index = letter.length === 1 ? letter.charCodeAt(0) - 65 : 0;
  return index >= 0 && index < count ? index : 0;
}

/** The stored seed, or 0 on a hand-edited document that lost it. */
export const versionSeed = (worksheet: Worksheet): number =>
  Number.isFinite(worksheet.versions?.seed) ? worksheet.versions!.seed : 0;

/** A fresh 31-bit seed, never equal to `previous`. */
export function newVersionSeed(previous?: number): number {
  let seed = previous ?? 0;
  while (seed === (previous ?? 0)) seed = Math.floor(Math.random() * 0x7fffffff) + 1;
  return seed;
}

/** FNV-1a: a stable 32-bit hash of the shuffle's key. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, and identical on every JS engine. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A deterministic order for `movable.length` items: `order[printed] = authored`. Items
 * with `movable[i] === false` keep their place. Keyed by (seed, version, item id), so
 * one question's order never depends on another's. When the draw lands on the authored
 * order and something could move, the movable items rotate by one instead.
 */
export function shuffledOrder(
  movable: boolean[],
  key: { seed: number; version: number; id: string },
): number[] {
  const order = movable.map((_, index) => index);
  const free = order.filter((index) => movable[index]);
  if (key.version === 0 || free.length < 2) return order;

  const next = random(hash(`${key.seed}:${versionLetter(key.version)}:${key.id}`));
  const drawn = [...free];
  for (let i = drawn.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [drawn[i], drawn[j]] = [drawn[j], drawn[i]];
  }
  const unchanged = drawn.every((index, i) => index === free[i]);
  const placed = unchanged ? [...drawn.slice(1), drawn[0]] : drawn;
  free.forEach((slot, i) => {
    order[slot] = placed[i];
  });
  return order;
}
