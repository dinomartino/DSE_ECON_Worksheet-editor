import { bi } from './text';
import type { FigureGridBlock } from './types';

/**
 * What a build before v4 shows in place of a figure grid (k-0545).
 *
 * Those builds (0.10.x and older) draw a block kind they do not know as a picture: they read
 * `src`, `widthPx`, `heightPx` and `altText` off it, and a block without them stopped the
 * whole page from loading ("Cannot read properties of undefined (reading 'en')"). So every
 * stored grid also carries this small picture, which says in both languages that the
 * diagrams were made in a newer version and to update. The document opens read-only there
 * (it is written at v4) under the "newer version" bar. This build never reads these fields.
 */
export const FIGURE_GRID_FALLBACK = {
  src: 'data:image/png;base64,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',
  widthPx: 480,
  heightPx: 96,
  altText: bi(
    'Diagrams (1)–(4) were made in a newer Econ Studio. Update Econ Studio to see and print them.',
    '圖表 (1)–(4) 由較新版本的 Econ Studio 製作，請更新以檢視及列印。',
  ),
} as const;

/** The grid with the older builds' picture on it (the same block when it already has one). */
export function withGridFallback(block: FigureGridBlock): FigureGridBlock {
  if (typeof block.src === 'string' && block.altText && typeof block.widthPx === 'number' && typeof block.heightPx === 'number') return block;
  return { ...block, ...FIGURE_GRID_FALLBACK, altText: { en: [...FIGURE_GRID_FALLBACK.altText.en], zh: [...FIGURE_GRID_FALLBACK.altText.zh] } };
}

/** Every grid anywhere in a stored record given its fallback picture; the same value when none needs one. */
export function withGridFallbacks<T>(value: T): T {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((entry) => {
      const out = withGridFallbacks(entry);
      if (out !== entry) changed = true;
      return out;
    });
    return (changed ? next : value) as T;
  }
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (record.kind === 'figureGrid' && Array.isArray(record.cells)) return withGridFallback(record as unknown as FigureGridBlock) as T;
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    const out = withGridFallbacks(entry);
    if (out !== entry) changed = true;
    next[key] = out;
  }
  return (changed ? next : value) as T;
}
