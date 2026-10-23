import type { RenderedItem } from '@/render/worksheet';

/**
 * What a flow item asks of the sheets, read off the walker's marks (`render/pageFlow.ts`): the two
 * facts the paginator needs beyond the item's height and its keep chain. Here, apart from the
 * component, so the glue between the IR and `packPages` is tested without a DOM.
 */

/**
 * Whether a sheet opens at this item because a question asked to start a new page (itself, or the
 * heading or source it travels with). Packed as `PackItem.startsSheet`.
 */
export function startsSheetOf(item: RenderedItem): boolean {
  return (item.type === 'question' ? item.question.startsPage : item.layout.startsPage) === true;
}

/**
 * Whether the question asked to be kept on one page and nothing already keeps it whole: the
 * paginator is then offered no break inside it (`breakAfter: []`), though it still measures every
 * node boundary for the case of one taller than a sheet.
 */
export function keptTogetherOf(item: RenderedItem): boolean {
  return item.type === 'question' && item.question.keptTogether === true;
}
