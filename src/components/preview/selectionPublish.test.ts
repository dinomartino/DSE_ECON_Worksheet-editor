import { describe, it, expect } from 'vitest';
import { sameSelection as isSame } from './RichTextEditable';

/**
 * A caret is published; an unchanged selection is not.
 *
 * `RichTextEditable` used to drop a collapsed caret, because its only consumer was the
 * format toolbar and formatting an empty range is meaningless. Inserting at one is the
 * ordinary case (a fill-in blank goes *between* two words), so the caret is now
 * reported — and that exposed a second bug: `selectionOffsets` returns a fresh object
 * every call, so publishing unconditionally set state to a value that was equal but
 * never identical, and the resulting render republished until React bailed out with
 * "Maximum update depth exceeded".
 *
 * Both failures are silent in unit terms — one hides a button, the other only shows up
 * in a browser — so the comparison itself is pinned here.
 */


describe('publishing a selection', () => {
  it('treats an equal-but-fresh object as unchanged', () => {
    // The loop: two distinct objects describing the same caret.
    expect(isSame({ start: 4, end: 4 }, { start: 4, end: 4 })).toBe(true);
  });

  it('reports a moved caret', () => {
    expect(isSame({ start: 5, end: 5 }, { start: 4, end: 4 })).toBe(false);
  });

  it('reports a selection growing out of a caret', () => {
    expect(isSame({ start: 4, end: 9 }, { start: 4, end: 4 })).toBe(false);
  });

  it('reports focus arriving and leaving', () => {
    expect(isSame({ start: 0, end: 0 }, undefined)).toBe(false);
    expect(isSame(undefined, { start: 0, end: 0 })).toBe(false);
    expect(isSame(undefined, undefined)).toBe(true);
  });
});
