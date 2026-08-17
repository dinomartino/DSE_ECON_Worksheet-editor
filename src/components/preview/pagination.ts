/**
 * Packing the flow onto sheets.
 *
 * The measuring half of pagination has to live in the component — heights come from a
 * real layout, since font metrics, bilingual stacking and wrapping are the browser's to
 * decide. The *deciding* half does not, and it is where the rules that matter live: what
 * opens a page, which trailing page survives, and what each page is then named by.
 *
 * So it is pure and it is here. Everything below takes measured heights as an argument
 * and returns plain data, which is what lets the page-break rules be tested without a
 * DOM (§`pagination.test.ts`).
 */

/** One item in the printed flow, as the paginator sees it. */
export interface PackItem {
  key: string;
  /** Starts a new sheet at this point regardless of how much room is left. */
  forceBreak?: boolean;
  /**
   * The layout element id of the page break, when `forceBreak` is set.
   *
   * A break consumes no space on the page it opens, so once packed it leaves no trace
   * there — and a page with nothing else on it would be indistinguishable from one that
   * was never asked for. Carrying the id lets the opened page still be *named* in terms
   * the store understands, which is what both a drop onto it and a move of it need.
   */
  breakId?: string;
  /**
   * True for items whose `key` is not a flow id — the masthead, the teacher banner, the
   * instructions, a section heading. Marked at construction rather than inferred from
   * the key, because a prefix test (`heading-…`) would be one id collision away from
   * letting the page rail try to delete a section heading.
   */
  structural?: boolean;
  /**
   * A fill answer space: lands on the current sheet and consumes whatever room is left
   * of it (§3.2). Packed by intent rather than by measured height, because the height
   * is the *last-resolved* count — packing by it gave the system two stable states (on
   * this sheet at the remainder, or alone on the next at a full page), and which one a
   * document landed in depended on the count it happened to store.
   */
  fillsPage?: boolean;
  /**
   * Where this item is allowed to break, as node indices into its own IR array, and how
   * tall it is up to each one (§ *An item taller than a page breaks at a node boundary*).
   *
   * Absent means atomic — the item packs whole, exactly as everything did before
   * splitting existed. Present, and only consulted when the item does not fit a whole
   * page, so an item that fits packs byte-identically either way.
   */
  breakPoints?: BreakPoint[];
}

/**
 * One legal break inside an item: everything up to and including node `index` is `height`
 * px tall, measured from the item's own top.
 *
 * The candidates come from the IR's `keepNext` chain, not from the measured boxes — a
 * node that keeps with the next one is one Word will not break after either, which is
 * what makes the preview's chosen boundary a boundary the `.docx` also takes.
 */
export interface BreakPoint {
  index: number;
  height: number;
}

/**
 * A piece of an item that did not fit a page whole.
 *
 * `key` stays the item's own id so nothing downstream has to learn about fragments; the
 * range is what the sheet renders. `composePages` collapses consecutive fragments of one
 * id back to a single `flowIds` entry, so the page rail, drag/drop and the store keep
 * seeing one item — a fragment is a *rendering* of an item, never a thing in the model.
 */
export interface Fragment {
  /** First node of this piece (inclusive). */
  from: number;
  /** Last node of this piece (inclusive). */
  to: number;
  /** True for every piece after the first, so the sheet can suppress a repeat number. */
  continued: boolean;
}

export interface PackedPages<T extends PackItem> {
  pages: T[][];
  /** For each page, the id of the manual break that opened it, if one did. */
  openedBy: (string | undefined)[];
  /**
   * The piece of its item each *placement* renders, addressed `"<page>:<position>"`.
   *
   * Keyed by position rather than by the item, because a split item is placed twice and
   * the two placements render different ranges of the same object — a `Map` keyed on the
   * item could only remember one of them. Sparse: an item that packed whole has no entry,
   * which is every item in a document with nothing too tall in it.
   */
  fragments: Map<string, Fragment>;
}

/** The address of one placement in `PackedPages.pages`, for the `fragments` map. */
export function placementKey(page: number, position: number): string {
  return `${page}:${position}`;
}

/**
 * Split the flow across sheets.
 *
 * **An item is kept whole while it can be.** A question that merely runs over the
 * boundary moves to the next sheet intact — breaking one that would have fitted costs
 * the reader a page turn mid-question for nothing, and Word does the same.
 *
 * **An item taller than a whole page is broken at a node boundary**, because the
 * alternative is worse than a break: it used to get its own sheet and overflow off the
 * paper, and the part hanging past the edge printed over the footer and then was simply
 * not there. On the reference booklet's data-response question that silently lost the
 * final table and the essay instruction, and left the preview one sheet shorter than the
 * `.docx`, which had broken the question correctly all along.
 *
 * The order matters: an item that does not fit is **moved first and split second**, so it
 * is only ever broken while it has a sheet to itself. Splitting on the way out — filling
 * the outgoing sheet's slack with the first piece — is what Word does not do, and a
 * preview that did it ended the document a sheet shorter than the export.
 *
 * The break lands where the IR says it may: after a node whose `keepNext` is falsy
 * (`breakPoints`). That is the same chain Word reads, so the sheet the screen ends and
 * the page the export ends are the same one — on the reference question both break
 * before part (d).
 */
export function packPages<T extends PackItem>(
  items: T[],
  heights: Map<string, number>,
  contentHeightPx: number,
): PackedPages<T> {
  // Before the first measurement everything goes on page one. That renders a single
  // correct-looking page for one frame instead of flashing an empty one.
  if (heights.size === 0 || contentHeightPx <= 0) {
    return { pages: [items], openedBy: [undefined], fragments: new Map() };
  }

  const pages: T[][] = [[]];
  const openedBy: (string | undefined)[] = [undefined];
  const fragments = new Map<string, Fragment>();
  let used = 0;

  /*
   * A queue rather than a `for` loop, because a split puts work *back*: the tail of a
   * broken item is packed exactly like any other item, so it can be broken again — which
   * is what lets an item three pages tall cross three sheets without the loop knowing how
   * many pieces there will be.
   */
  const queue: { item: T; piece?: Fragment }[] = items.map((item) => ({ item }));

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const { item, piece } = queue[cursor];
    // A piece's height is what its own range measures, not the whole item's.
    const height = piece ? pieceHeight(item, piece, heights) : (heights.get(item.key) ?? 0);
    const current = pages[pages.length - 1];

    /*
     * A break opens a page whenever the current one holds content *or* was itself
     * opened by a break.
     *
     * The second half is what makes two breaks in a row produce the blank page
     * between them, rather than the second one being absorbed by the first. Testing
     * only `current.length > 0` treated an already-empty page as room to reuse, so a
     * deliberate blank page silently collapsed — and, worse, the second break's id was
     * dropped, leaving that page unnamed and so unmovable and undeletable.
     */
    const openedAlready = openedBy[openedBy.length - 1] !== undefined;
    const mustBreak = item.forceBreak && (current.length > 0 || openedAlready);
    // A fill item overflows only when its sheet is genuinely full — its measured
    // height is the count it resolved to *last* time, not a claim on this sheet.
    const overflows =
      current.length > 0 &&
      (item.fillsPage ? used >= contentHeightPx : used + height > contentHeightPx);

    /*
     * An item that does not fit moves to a fresh sheet **whole and first**, even when it is
     * too tall to fit there either — it is only split once it is at the top of a page, by
     * the rule below.
     *
     * Filling the outgoing sheet's slack with the first piece instead is the tempting
     * wrong answer, and it is wrong twice over. Word moves the paragraph and *then*
     * breaks it, so a preview that split early ended the document a sheet shorter than
     * the export — the disagreement this whole change exists to remove. And a question
     * whose opening lines trail the bottom of the previous sheet reads as a continuation
     * of what is above it, which on a data-response question means the stem lands under
     * somebody else's answer lines.
     */
    if (mustBreak || overflows) {
      pages.push([]);
      openedBy.push(mustBreak ? item.breakId : undefined);
      used = 0;
    } else if (item.forceBreak) {
      // A break at the very top of a not-yet-attributed page does not open a *further*
      // one, but it is still what put this page here — record it so the sheet stays
      // addressable.
      openedBy[openedBy.length - 1] = item.breakId;
    }
    // A forced break is a positioning instruction, not content: it starts the new page
    // but must not occupy space on it.
    if (item.forceBreak) continue;

    /*
     * Taller than the room it has on the sheet it is now on — and, since anything that did
     * not fit was just moved, that sheet is one it has to itself. This is exactly the case
     * the old rule met by letting the item overflow off the paper. There is no room left to
     * gain by moving it again, so it breaks here or it is partly invisible.
     */
    if (!item.fillsPage && used + height > contentHeightPx) {
      const split = splitItem(item, piece, heights, contentHeightPx - used);
      if (split) {
        const target = pages[pages.length - 1];
        fragments.set(placementKey(pages.length - 1, target.length), split.head);
        target.push(item);
        queue.splice(cursor + 1, 0, { item, piece: split.tail });
        pages.push([]);
        openedBy.push(undefined);
        used = 0;
        continue;
      }
    }

    if (piece) fragments.set(placementKey(pages.length - 1, pages[pages.length - 1].length), piece);
    pages[pages.length - 1].push(item);
    // A fill ends its sheet: anything after it starts the next one, which is what
    // makes the resolution a single pass (§ resolveFillCounts).
    used = item.fillsPage ? contentHeightPx : used + height;
  }

  /*
   * A trailing empty page is kept when a manual break opened it, and dropped otherwise.
   *
   * The two cases look identical once packed — an empty last bucket — but they mean
   * opposite things. An *incidental* empty page is packing slack: the flow happened to
   * end exactly at a boundary, Word emits no sheet for it, and showing one would have
   * the preview disagree with the export about how long the document is.
   *
   * A page a teacher explicitly *added* is different. Adding "New page" and seeing the
   * document not change is the preview reporting that the element was never inserted,
   * and the natural response is to add it again — so the flow ends up carrying several
   * breaks nobody wanted. The element exists in the model, the .docx will contain its
   * `w:br`, and the sheet is the only visible evidence of either, so it is shown. A
   * blank page in the middle was always kept, for the same reason.
   */
  while (pages.length > 1 && pages[pages.length - 1].length === 0) {
    if (openedBy[pages.length - 1]) break;
    pages.pop();
    openedBy.pop();
  }

  return pages.length > 0
    ? { pages, openedBy, fragments }
    : { pages: [[]], openedBy: [undefined], fragments };
}

/**
 * How tall one piece of an item is.
 *
 * Read off the same cumulative `breakPoints` the split chose from, so a piece's height and
 * the boundary that produced it can never disagree: the piece from node `from` to node
 * `to` is the height at `to` less the height at `from - 1`. A tail whose end is the item's
 * last node measures to the item's own full height, which is the one number the probe
 * measured directly.
 */
function pieceHeight<T extends PackItem>(
  item: T,
  piece: Fragment,
  heights: Map<string, number>,
): number {
  const total = heights.get(item.key) ?? 0;
  const points = item.breakPoints;
  if (!points || points.length === 0) return total;
  const upTo = (index: number) => {
    if (index < 0) return 0;
    let last = 0;
    for (const point of points) {
      if (point.index > index) break;
      last = point.height;
    }
    return last;
  };
  // `to` beyond the last break point means "to the end", whose height is the measured one.
  const lastPoint = points[points.length - 1];
  const end = piece.to >= lastPoint.index ? total : upTo(piece.to);
  return Math.max(0, end - upTo(piece.from - 1));
}

/**
 * Break one item (or one piece of it) so that its head fits `room`.
 *
 * Returns `undefined` when there is nothing useful to do — no measured break points, or
 * no boundary that leaves both halves non-empty. The caller then falls back to the old
 * behaviour, so an item with no interior structure still behaves exactly as it always did.
 *
 * The candidate boundaries are the item's own `breakPoints`, which the preview derives
 * from `keepNext`: a node that keeps with the next is not offered, so a source panel's
 * label never strands from its frame and the break is one Word will take too. **The last
 * boundary that fits wins** — filling the sheet is what keeps the preview's page count
 * equal to the export's.
 *
 * When no legal boundary fits the room, the **first** one is taken anyway: the caller only
 * asks after the item has a sheet to itself, so there is no more room to be had, and the
 * alternative is the silent overflow this replaced. That is the oversized-atom case — a
 * source frame taller than a page — and a frame cut across two sheets is at least a thing
 * a teacher can see and shorten, which content hanging off the paper is not.
 */
function splitItem<T extends PackItem>(
  item: T,
  piece: Fragment | undefined,
  heights: Map<string, number>,
  room: number,
): { head: Fragment; tail: Fragment } | undefined {
  const points = item.breakPoints;
  if (!points || points.length === 0) return undefined;

  const from = piece?.from ?? 0;
  const to = piece?.to ?? Number.MAX_SAFE_INTEGER;
  const before =
    from > 0 ? pieceHeight(item, { from: 0, to: from - 1, continued: false }, heights) : 0;

  // Boundaries strictly inside this piece: one at its own end would leave an empty tail.
  const inside = points.filter((point) => point.index >= from && point.index < to);
  if (inside.length === 0) return undefined;

  const fits = inside.filter((point) => point.height - before <= room);
  const forced = fits.length > 0 ? fits[fits.length - 1] : inside[0];

  return {
    head: { from, to: forced.index, continued: piece?.continued ?? false },
    tail: { from: forced.index + 1, to, continued: true },
  };
}

/**
 * One sheet, named by what is on it.
 *
 * `flowIds` holds only the ids the store can act on — questions, layout elements, and
 * the page's own break. Structural items are deliberately excluded: they are not flow
 * items, so they cannot be moved or deleted as page content, and including them would
 * have the rail hand the store ids it would silently fail to find.
 */
export interface PageComposition {
  index: number;
  flowIds: string[];
  /** True when nothing the teacher put on the sheet is a flow item. */
  structuralOnly: boolean;
  /**
   * The manual page break that opened this sheet, when one did.
   *
   * This is what makes a *deliberately added, still empty* page actionable. Such a page
   * has no content ids at all, so without it the rail could only treat it the way it
   * treats a masthead-only first page — as scenery — and the teacher's next move after
   * adding a page (putting something on it) would have nothing to aim at.
   */
  breakId?: string;
}

/**
 * Name each packed page in terms the store understands.
 *
 * **The break that opened a page belongs to that page.** It consumes no space, so the
 * paginator never packs it onto a sheet — but it is the element that puts the sheet
 * there, and leaving it out of `flowIds` made every page-level action operate on a
 * page's content while its own break stayed behind: dragging page 3 above page 2 moved
 * the questions and stranded the break, so the repagination that followed put them back
 * roughly where they started, and deleting a page removed its questions and left the
 * break, which then showed as a blank page appearing out of nowhere.
 *
 * It leads the list because it precedes the content in the flow, which is what keeps a
 * moved run reading in document order.
 */
export function composePages<T extends PackItem>({
  pages,
  openedBy,
  fragments,
}: PackedPages<T>): PageComposition[] {
  /*
   * A split item belongs to the page it *starts* on, and to that page only.
   *
   * Its id would otherwise appear on both sheets it crosses, and every page-level action
   * reads these lists as "the things on this page": the rail would offer to delete the
   * same question from two cards, a drag of page 2 would carry a question whose head is on
   * page 1, and `moveRunInFlow` would be handed the same id twice. The continuation is a
   * *rendering* of an item that lives on the previous sheet — there is nothing on this one
   * a teacher can act on separately, because the model holds one question either way.
   */
  return pages.map((pageItems, index) => {
    const contentIds = pageItems
      .filter((item, position) => {
        if (item.structural) return false;
        return !fragments.get(placementKey(index, position))?.continued;
      })
      .map((item) => item.key);
    const breakId = openedBy[index];
    return {
      index,
      flowIds: breakId ? [breakId, ...contentIds] : contentIds,
      structuralOnly: contentIds.length === 0,
      breakId,
    };
  });
}

/**
 * A stable key for a composition, for deciding whether to re-publish it.
 *
 * `breakId` is part of the key, not just the content ids: a page added at the end of the
 * document contributes no content at all, so keying on those alone would leave the rail
 * never told about the one page whose only identity *is* its break.
 */
export function compositionKey(pages: PageComposition[]): string {
  return pages.map((page) => `${page.breakId ?? ''}:${page.flowIds.join(',')}`).join('|');
}

/**
 * Where a run dropped on a page card should land, or `undefined` for "nothing to do".
 * The run (never one id — a drag on a multi-selection member carries the selection)
 * lands after the target page's last non-moving member; a card has no meaningful
 * "between". `undefined` when everything on the page is moving or the run already is
 * the tail, so an accidental release costs no undo entry. An empty page's own break
 * serves as the anchor.
 */
export function dropRunAnchor(
  itemIds: string[],
  page: Pick<PageComposition, 'flowIds' | 'breakId'>,
): string | undefined {
  if (itemIds.length === 0) return undefined;
  const moving = new Set(itemIds);

  const tail = page.flowIds.slice(-moving.size);
  if (tail.length === moving.size && tail.every((id) => moving.has(id))) return undefined;

  const staying = page.flowIds.filter((id) => !moving.has(id));
  const anchor = staying[staying.length - 1] ?? page.breakId;
  if (!anchor || moving.has(anchor)) return undefined;
  return anchor;
}

/**
 * Resolve every fill answer-space to the room left on its sheet.
 *
 * The paginator is the one place that knows the remaining height (§ the line count is
 * not authorable — it is "fill the page"), so this is where a fill element's count
 * becomes a number. Deliberately a **single pass over an already-packed layout** rather
 * than an iteration to a fixed point: a fill element absorbs its sheet's slack and
 * therefore *ends* the sheet, so resolving it never changes which sheet anything before
 * it landed on — and anything after it starts the next sheet whatever count is chosen.
 *
 * `fillPitchOf` names the fill items and their line pitch (px). The first fill on a
 * sheet takes all the slack; a second fill on the same sheet resolves to the floor —
 * there is no more room to share, and the floor keeps it visible enough to notice and
 * move (§`MIN_ANSWER_LINES`).
 *
 * The fill item's own measured height is excluded from "used": the element is being
 * re-sized, so its current size is not a claim on the page.
 *
 * `fragments` lets a sheet carrying a *piece* of a split item charge only that piece:
 * charging the whole item would have a fill share a sheet with a continuation and resolve
 * to a count much too small. Optional, so callers with nothing split pass nothing.
 */
export function resolveFillCounts<T extends PackItem>(
  pages: T[][],
  heights: Map<string, number>,
  contentHeightPx: number,
  fillPitchOf: (key: string) => number | undefined,
  minLines: number,
  fragments?: Map<string, Fragment>,
): Map<string, number> {
  const counts = new Map<string, number>();
  if (contentHeightPx <= 0) return counts;

  pages.forEach((page, pageIndex) => {
    const fills = page.filter((item) => fillPitchOf(item.key) !== undefined);
    if (fills.length === 0) return;

    const used = page.reduce((sum, item, position) => {
      if (fillPitchOf(item.key) !== undefined) return sum;
      const piece = fragments?.get(placementKey(pageIndex, position));
      return sum + (piece ? pieceHeight(item, piece, heights) : (heights.get(item.key) ?? 0));
    }, 0);

    fills.forEach((item, index) => {
      const pitch = fillPitchOf(item.key)!;
      const room = contentHeightPx - used;
      const lines = index === 0 ? Math.floor(room / pitch) : minLines;
      counts.set(item.key, Math.max(minLines, lines));
    });
  });
  return counts;
}

/** A rectangle in viewport coordinates. */
export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Whether a marquee box catches an item.
 *
 * The box catches what it **touches**, rather than only what it fully contains. Full
 * containment reads as unfriendly on a worksheet: page items span the whole text column,
 * so enclosing one means dragging from outside the left margin to outside the right, and
 * a sweep that clips the last question by two pixels silently drops it. Touching is what
 * a teacher means by "from here to here".
 *
 * Zero-area items — a collapsed spacer — still count, hence `>=` rather than `>`;
 * otherwise an element with no height could never be swept at all.
 *
 * Pure and here rather than inline in the sweep handler for the reason this whole module
 * exists: it is the *deciding* half of a gesture whose measuring half needs a real
 * layout, and the rule is worth testing without a DOM.
 */
export function marqueeCatches(box: Rect, item: Rect): boolean {
  return (
    item.left <= box.right &&
    item.right >= box.left &&
    item.top <= box.bottom &&
    item.bottom >= box.top
  );
}

/** Normalise a drag's two corners into a rectangle, whichever way it was drawn. */
export function marqueeBounds(drag: { x0: number; y0: number; x1: number; y1: number }): Rect {
  return {
    left: Math.min(drag.x0, drag.x1),
    right: Math.max(drag.x0, drag.x1),
    top: Math.min(drag.y0, drag.y1),
    bottom: Math.max(drag.y0, drag.y1),
  };
}
