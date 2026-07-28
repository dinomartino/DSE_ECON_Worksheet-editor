import { describe, expect, it } from 'vitest';
import {
  compositionKey,
  composePages,
  marqueeBounds,
  marqueeCatches,
  packPages,
  type PackItem,
} from './pagination';

/**
 * The page-break rules, tested without a DOM.
 *
 * Heights are supplied rather than measured, so each case names the one thing it is
 * about — how tall the content is is never the point, only what the packer does at a
 * boundary.
 */

const PAGE = 100;

const item = (key: string, extra: Partial<PackItem> = {}): PackItem => ({ key, ...extra });
const brk = (id: string): PackItem => item(id, { forceBreak: true, breakId: id });

/** Every non-break item is half a page, so two fill a sheet exactly. */
const heights = (items: PackItem[]) =>
  new Map(items.map((i) => [i.key, i.forceBreak ? 0 : PAGE / 2]));

const pack = (items: PackItem[]) => packPages(items, heights(items), PAGE);
const keysOf = (items: PackItem[]) =>
  pack(items).pages.map((page) => page.map((block) => block.key));

describe('packing the flow onto sheets', () => {
  it('starts a new sheet at a manual break, and the break takes no space on it', () => {
    expect(keysOf([item('q1'), brk('b1'), item('q2')])).toEqual([['q1'], ['q2']]);
  });

  it('starts a new sheet when the content overflows', () => {
    expect(keysOf([item('q1'), item('q2'), item('q3')])).toEqual([['q1', 'q2'], ['q3']]);
  });

  it('keeps a trailing page that a manual break opened', () => {
    /*
     * The reported bug: adding "New page" with nothing after it changed nothing on
     * screen, so the page looked like it had not been added — and the natural next
     * move is to add it again.
     */
    const { pages, openedBy } = pack([item('q1'), brk('b1')]);
    expect(pages).toHaveLength(2);
    expect(pages[1]).toEqual([]);
    expect(openedBy[1]).toBe('b1');
  });

  it('still drops a trailing page that only packing slack opened', () => {
    // Two half-page items fill page one exactly; nothing follows, so there is no
    // second sheet. Word emits none either, and inventing one would have the preview
    // disagree with the export about how long the document is.
    expect(keysOf([item('q1'), item('q2')])).toEqual([['q1', 'q2']]);
  });

  it('keeps a blank page in the middle, which is a deliberate arrangement', () => {
    const { pages, openedBy } = pack([item('q1'), brk('b1'), brk('b2'), item('q2')]);
    expect(pages.map((page) => page.map((b) => b.key))).toEqual([['q1'], [], ['q2']]);
    expect(openedBy).toEqual([undefined, 'b1', 'b2']);
  });

  it('gives each of two trailing breaks its own page', () => {
    // Two "New page" clicks mean two pages. Absorbing the second into the first would
    // both hide a page the teacher asked for and leave its break with no sheet to
    // name it, so the rail could neither move nor delete it.
    const { pages, openedBy } = pack([item('q1'), brk('b1'), brk('b2')]);
    expect(pages).toHaveLength(3);
    expect(openedBy).toEqual([undefined, 'b1', 'b2']);
  });

  it('attributes a leading break to the page it put there', () => {
    // A break at the very top of a sheet opens no *further* page, but it is still the
    // reason that sheet exists — so it has to stay addressable.
    const { pages, openedBy } = pack([brk('b1'), item('q1')]);
    expect(pages.map((page) => page.map((b) => b.key))).toEqual([['q1']]);
    expect(openedBy[0]).toBe('b1');
  });

  it('puts everything on one page before the first measurement', () => {
    const items = [item('q1'), item('q2'), item('q3')];
    expect(packPages(items, new Map(), PAGE).pages).toEqual([items]);
  });
});

describe('naming a page for the store', () => {
  it('gives a page its own break, so a page move carries what created it', () => {
    /*
     * The second reported bug: dragging a page in the rail reordered the page's
     * questions but left its break behind, so the repagination that immediately
     * followed put the content back roughly where it started. The break leads the
     * list because it precedes the content in the flow.
     */
    const composed = composePages(pack([item('q1'), brk('b1'), item('q2')]));
    expect(composed[1].flowIds).toEqual(['b1', 'q2']);
    expect(composed[1].breakId).toBe('b1');
  });

  it('excludes structural items, which the store cannot act on', () => {
    const items = [item('masthead', { structural: true }), item('q1')];
    const composed = composePages(packPages(items, heights(items), PAGE));
    expect(composed[0].flowIds).toEqual(['q1']);
  });

  it('reports a masthead-only page as scenery but an added page as actionable', () => {
    const items = [item('masthead', { structural: true }), brk('b1')];
    const composed = composePages(packPages(items, heights(items), PAGE));

    // Page one carries nothing the teacher put there...
    expect(composed[0].structuralOnly).toBe(true);
    expect(composed[0].breakId).toBeUndefined();
    // ...while the page they added is empty *and* addressable, which is what lets the
    // rail offer it as a drop target instead of treating it as scenery too.
    expect(composed[1].structuralOnly).toBe(true);
    expect(composed[1].breakId).toBe('b1');
    expect(composed[1].flowIds).toEqual(['b1']);
  });

  it('changes its key when an empty page is added', () => {
    // A newly added trailing page contributes no content ids at all, so a key built
    // from those alone would be identical before and after — and the rail would never
    // be told about the one page whose only identity is its break.
    const before = compositionKey(composePages(pack([item('q1')])));
    const after = compositionKey(composePages(pack([item('q1'), brk('b1')])));
    expect(after).not.toBe(before);
  });
});

/**
 * What a marquee catches.
 *
 * The gesture's own feedback is the reason this is worth pinning: the highlight is
 * applied on every mouse-move, so the predicate runs continuously during the drag rather
 * than once at the end. A rule that is a pixel too strict is not a wrong result the user
 * sees afterwards — it is an item that flickers or never lights up while they are still
 * dragging over it.
 */
describe('marquee hit-testing', () => {
  const item = { left: 100, right: 500, top: 200, bottom: 240 };
  const box = (x0: number, y0: number, x1: number, y1: number) =>
    marqueeBounds({ x0, y0, x1, y1 });

  it('catches an item the box merely touches, not only one it contains', () => {
    // A sweep down the middle of the column, clipping the item's lower half.
    expect(marqueeCatches(box(200, 220, 300, 400), item)).toBe(true);
    // Fully containing it obviously still counts.
    expect(marqueeCatches(box(50, 150, 600, 300), item)).toBe(true);
  });

  it('normalises a box dragged up-and-left, so direction never changes the result', () => {
    const downRight = box(50, 150, 600, 300);
    const upLeft = box(600, 300, 50, 150);
    expect(upLeft).toEqual(downRight);
    expect(marqueeCatches(upLeft, item)).toBe(true);
  });

  it('catches a zero-height item, which a strict overlap test would drop', () => {
    // A collapsed spacer. With `>` rather than `>=` it could never be swept at all.
    const collapsed = { left: 100, right: 500, top: 300, bottom: 300 };
    expect(marqueeCatches(box(80, 280, 520, 320), collapsed)).toBe(true);
  });

  it('catches an item the box only grazes by a pixel on one edge', () => {
    // The boundary case the live highlight makes visible: touching edges count, so an
    // item does not flicker as the pointer crosses its top edge.
    expect(marqueeCatches(box(100, 240, 500, 400), item)).toBe(true);
    expect(marqueeCatches(box(100, 241, 500, 400), item)).toBe(false);
  });

  it('misses an item the box stops short of on either axis', () => {
    expect(marqueeCatches(box(100, 100, 500, 199), item)).toBe(false);
    expect(marqueeCatches(box(501, 100, 600, 400), item)).toBe(false);
  });
});
