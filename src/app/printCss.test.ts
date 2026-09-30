import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * WebKit prints with screen-width breakpoints, so hidden chrome overflows the paper and
 * the whole PDF shrinks to fit. Clipping every ancestor of `#print-root` stops that; jsdom
 * does no print layout, so the rule itself is the guard.
 */
const GLOBALS = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');

describe('print CSS', () => {
  it('clips horizontal overflow on the ancestors of #print-root', () => {
    const printBlock = GLOBALS.split('@media print').find((b) =>
      b.includes('#print-root {\n    position: absolute'),
    );
    expect(printBlock).toBeDefined();
    expect(printBlock).toMatch(
      /body \*:has\(#print-root\)\s*\{\s*overflow-x: clip !important;\s*\}/,
    );
  });
});
