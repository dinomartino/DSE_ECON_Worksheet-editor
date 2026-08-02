import { describe, expect, it } from 'vitest';
import {
  compositionKey,
  composePages,
  dropRunAnchor,
  marqueeBounds,
  marqueeCatches,
  packPages,
  resolveFillCounts,
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
 * Where a run dropped on a page card lands.
 *
 * The rail is the only route to a page that is off screen, and it is the one drop whose
 * target names no position — a card is a whole page, not an edge — so the anchor is
 * derived rather than pointed at. Worth pinning because both failure modes are silent:
 * the wrong anchor moves items to a page nobody aimed at, and a missing one is a
 * gesture that simply does nothing.
 */
describe('dropping a run on a page card', () => {
  it('anchors after the page’s last item', () => {
    const page = { flowIds: ['a', 'b', 'c'] };
    expect(dropRunAnchor(['x'], page)).toBe('c');
  });

  it('skips members of the run when picking the anchor', () => {
    // `x` is already on this page but not at its end, so the drop is a real move and
    // the anchor has to be the last id that is *staying* — ordering a run against one
    // of its own members would be a move relative to itself.
    const page = { flowIds: ['x', 'a', 'b'] };
    expect(dropRunAnchor(['x', 'y'], page)).toBe('b');
  });

  it('moves a whole selection, not just the grabbed item', () => {
    // The regression this exists for: five swept items dropped on another page used to
    // move one. All five have to resolve to the same single anchor.
    const page = { flowIds: ['p', 'q'] };
    expect(dropRunAnchor(['a', 'b', 'c', 'd', 'e'], page)).toBe('q');
  });

  it('uses the break of a page the teacher added but never filled', () => {
    // Landing *after* the break is what puts an item on the sheet that break opened.
    const page = { flowIds: ['brk'], breakId: 'brk' };
    expect(dropRunAnchor(['x'], page)).toBe('brk');
  });

  it('declines a run that already ends the page', () => {
    const page = { flowIds: ['a', 'x', 'y'] };
    expect(dropRunAnchor(['x', 'y'], page)).toBeUndefined();
  });

  it('declines when every id on the page is moving', () => {
    // Nothing left to order against. The first sheet reaches this and is rescued
    // positionally by `moveToDocumentStart`, which needs no anchor at all.
    const page = { flowIds: ['x', 'y'] };
    expect(dropRunAnchor(['x', 'y'], page)).toBeUndefined();
  });

  it('declines an empty run', () => {
    expect(dropRunAnchor([], { flowIds: ['a'] })).toBeUndefined();
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

describe('resolveFillCounts (§3.2)', () => {
  const item = (key: string): PackItem => ({ key });
  const heights = (entries: Record<string, number>) => new Map(Object.entries(entries));
  /** Every fill line is 10px tall in these cases; `q` items are questions. */
  const pitchOf = (fills: string[]) => (key: string) =>
    fills.includes(key) ? 10 : undefined;

  it('gives a fill element the room its sheet has left, in whole lines', () => {
    const pages = [[item('q1'), item('fill')]];
    const counts = resolveFillCounts(
      pages,
      heights({ q1: 42, fill: 30 }),
      100,
      pitchOf(['fill']),
      1,
    );
    // 100 - 42 = 58px of slack → 5 whole lines. The fill's own measured 30px is not a
    // claim on the page — the element is what is being sized.
    expect(counts.get('fill')).toBe(5);
  });

  it('resolves a fill alone on a sheet to a full page of lines', () => {
    // The reference's pure answer pages are exactly this: a fill element after a page
    // break, nothing else on the sheet.
    const counts = resolveFillCounts(
      [[item('fill')]],
      heights({ fill: 10 }),
      100,
      pitchOf(['fill']),
      1,
    );
    expect(counts.get('fill')).toBe(10);
  });

  it('floors at minLines when the sheet is already full', () => {
    const counts = resolveFillCounts(
      [[item('q1'), item('fill')]],
      heights({ q1: 99, fill: 10 }),
      100,
      pitchOf(['fill']),
      2,
    );
    expect(counts.get('fill')).toBe(2);
  });

  it('gives a second fill on the same sheet only the floor', () => {
    // The first fill takes the slack — there is no more room to share, and the floor
    // keeps the second visible enough to notice and move.
    const counts = resolveFillCounts(
      [[item('q1'), item('a'), item('b')]],
      heights({ q1: 40, a: 10, b: 10 }),
      100,
      pitchOf(['a', 'b']),
      1,
    );
    expect(counts.get('a')).toBe(6);
    expect(counts.get('b')).toBe(1);
  });

  it('resolves each sheet independently', () => {
    const counts = resolveFillCounts(
      [
        [item('q1'), item('a')],
        [item('q2'), item('b')],
      ],
      heights({ q1: 42, a: 10, q2: 77, b: 10 }),
      100,
      pitchOf(['a', 'b']),
      1,
    );
    expect(counts.get('a')).toBe(5);
    expect(counts.get('b')).toBe(2);
  });

  it('returns nothing for a document with no fill elements', () => {
    const counts = resolveFillCounts(
      [[item('q1')]],
      heights({ q1: 42 }),
      100,
      () => undefined,
      1,
    );
    expect(counts.size).toBe(0);
  });
});

describe('packing a fill element (§3.2)', () => {
  it('keeps a fill on the current sheet whatever its stored height says', () => {
    // The fill's measured height is only its *last-resolved* count. Packing by it gave
    // two stable states — absorb this sheet's remainder, or take a fresh sheet whole —
    // and which one a document landed in depended on the stale number it stored.
    const items: PackItem[] = [
      { key: 'q1' },
      { key: 'fill', fillsPage: true },
      { key: 'q2' },
    ];
    // q1 half a page, the fill claiming a FULL page of measured height.
    const heights = new Map([
      ['q1', 50],
      ['fill', 100],
      ['q2', 50],
    ]);
    const { pages } = packPages(items, heights, 100);
    expect(pages.map((page) => page.map((i) => i.key))).toEqual([['q1', 'fill'], ['q2']]);
  });

  it('starts the next item on a fresh sheet — a fill ends its page', () => {
    const items: PackItem[] = [
      { key: 'q1' },
      { key: 'fill', fillsPage: true },
      { key: 'q2' },
    ];
    // Even a tiny fill consumes the rest of the sheet: q2 cannot share it.
    const heights = new Map([
      ['q1', 10],
      ['fill', 5],
      ['q2', 10],
    ]);
    const { pages } = packPages(items, heights, 100);
    expect(pages.map((page) => page.map((i) => i.key))).toEqual([['q1', 'fill'], ['q2']]);
  });

  it('moves a fill to the next sheet only when its sheet is genuinely full', () => {
    const items: PackItem[] = [{ key: 'q1' }, { key: 'fill', fillsPage: true }];
    const heights = new Map([
      ['q1', 100],
      ['fill', 10],
    ]);
    const { pages } = packPages(items, heights, 100);
    expect(pages.map((page) => page.map((i) => i.key))).toEqual([['q1'], ['fill']]);
  });
});
