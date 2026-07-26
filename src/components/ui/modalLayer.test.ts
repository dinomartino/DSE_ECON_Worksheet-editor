import { beforeEach, describe, expect, it } from 'vitest';
import { claimModalLayer, isModalLayerOpen, resetModalLayerForTest } from './modalLayer';

/**
 * The counter behind `useModalLayer`.
 *
 * This exists because of a real bug: every keyboard listener in the editor is attached
 * to `window`, so with the drawing canvas open over a selected diagram, Delete ran *both*
 * the canvas's handler and the preview's — removing one curve and the entire diagram
 * block in the same keypress. `preventDefault` cannot stop a sibling listener on the same
 * target, so ownership is tracked explicitly instead.
 *
 * Both failure directions are silent, which is why they are pinned here: a claim that is
 * never released kills every page-level shortcut for the rest of the session, and a
 * claim that never happens brings the original bug straight back.
 */
describe('modal layer', () => {
  beforeEach(resetModalLayerForTest);

  it('leaves page shortcuts enabled when nothing is open', () => {
    expect(isModalLayerOpen()).toBe(false);
  });

  it('claims the keyboard while an overlay is open', () => {
    const release = claimModalLayer();
    expect(isModalLayerOpen()).toBe(true);
    release();
    expect(isModalLayerOpen()).toBe(false);
  });

  it('stays claimed until the last of two stacked overlays closes', () => {
    // The canvas, then a confirm dialog inside it. Releasing the inner one must not
    // hand the keyboard back to the page while the canvas is still up.
    const outer = claimModalLayer();
    const inner = claimModalLayer();
    inner();
    expect(isModalLayerOpen()).toBe(true);
    outer();
    expect(isModalLayerOpen()).toBe(false);
  });

  it('ignores a double release, so the counter cannot go negative', () => {
    // React's development double-invoked effects can run a cleanup twice. Going below
    // zero would leave the guard permanently off and silently restore the bug.
    const release = claimModalLayer();
    release();
    release();
    expect(isModalLayerOpen()).toBe(false);

    claimModalLayer();
    expect(isModalLayerOpen()).toBe(true);
  });

  it('releases in any order, since overlays do not close as a stack', () => {
    const first = claimModalLayer();
    const second = claimModalLayer();
    first();
    expect(isModalLayerOpen()).toBe(true);
    second();
    expect(isModalLayerOpen()).toBe(false);
  });
});
