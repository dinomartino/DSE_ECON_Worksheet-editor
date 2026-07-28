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
}

export interface PackedPages<T extends PackItem> {
  pages: T[][];
  /** For each page, the id of the manual break that opened it, if one did. */
  openedBy: (string | undefined)[];
}

/**
 * Split the flow across sheets.
 *
 * Items are kept whole. Splitting a question across a page boundary would need Word's
 * own line-breaking to agree with ours to be worth anything, and a question that runs
 * over the boundary is better shown intact on the next page than cut at a place Word
 * will not cut. An item taller than a whole page gets its own page and is allowed to
 * overflow, which is the honest rendering of "this cannot fit".
 */
export function packPages<T extends PackItem>(
  items: T[],
  heights: Map<string, number>,
  contentHeightPx: number,
): PackedPages<T> {
  // Before the first measurement everything goes on page one. That renders a single
  // correct-looking page for one frame instead of flashing an empty one.
  if (heights.size === 0 || contentHeightPx <= 0) {
    return { pages: [items], openedBy: [undefined] };
  }

  const pages: T[][] = [[]];
  const openedBy: (string | undefined)[] = [undefined];
  let used = 0;

  for (const item of items) {
    const height = heights.get(item.key) ?? 0;
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
    const overflows = current.length > 0 && used + height > contentHeightPx;

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

    pages[pages.length - 1].push(item);
    used += height;
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

  return pages.length > 0 ? { pages, openedBy } : { pages: [[]], openedBy: [undefined] };
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
}: PackedPages<T>): PageComposition[] {
  return pages.map((pageItems, index) => {
    const contentIds = pageItems
      .filter((item) => !item.structural)
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
