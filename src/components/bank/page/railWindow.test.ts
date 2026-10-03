import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { groupRows } from '@/library/group';
import { row } from '@/library/testKit';
import { railOrder, railSections } from './bankScreen';
import { ReviewPage, type ReviewState } from './ReviewPage';
import { estimatedHeight, RAIL_WINDOW_FROM, railRows, rowAt, rowOffsets, scrollToShow, visibleRange } from './railWindow';

/** `count` questions under two sub-topics of C. */
function bank(count: number) {
  const rows = Array.from({ length: count }, (_, i) =>
    row({ rootId: `q${i}`, questionId: `q${i}`, docId: `d${i % 40}`, tags: [i % 2 ? 'C.ped' : 'C.equilibrium'], excerpt: { en: `Question ${i}`, zh: '' } }),
  );
  const sections = railSections(groupRows(rows), 'C', 'en');
  return { sections, order: railOrder(sections) };
}

describe('railWindow arithmetic', () => {
  const { sections } = bank(40);
  const rows = railRows(sections, () => false);

  it('lists each heading then its entries, in reading order', () => {
    expect(rows.filter((r) => r.kind === 'section')).toHaveLength(sections.length);
    expect(rows.filter((r) => r.kind === 'entry')).toHaveLength(40);
    expect(rows[0].kind).toBe('section');
  });

  it('offsets use a measured height where there is one, else the estimate', () => {
    const plain = rowOffsets(rows, new Map());
    expect(plain[1]).toBe(estimatedHeight(rows[0]));
    const measured = rowOffsets(rows, new Map([[rows[0].key, 50]]));
    expect(measured[1]).toBe(50);
    expect(measured.at(-1)! - plain.at(-1)!).toBe(50 - estimatedHeight(rows[0]));
  });

  it('finds the rows in view, with overscan', () => {
    const offsets = rowOffsets(rows, new Map());
    expect(rowAt(offsets, 0)).toBe(0);
    expect(rowAt(offsets, offsets[5] + 1)).toBe(5);
    const [start, end] = visibleRange(offsets, offsets[10], 200, 0);
    expect(start).toBe(10);
    expect(offsets[end]).toBeGreaterThanOrEqual(offsets[10] + 200);
    expect(offsets[end - 1]).toBeLessThan(offsets[10] + 200);
    expect(visibleRange(offsets, 0, 100_000)).toEqual([0, rows.length]);
    expect(visibleRange([0], 0, 100)).toEqual([0, 0]);
  });

  it('scrolls the least distance to show a row, below the pinned heading', () => {
    const offsets = rowOffsets(rows, new Map());
    expect(scrollToShow(offsets, 3, 0, 1000, 32)).toBeUndefined();
    // Above the view: its top lands under the heading.
    expect(scrollToShow(offsets, 3, offsets[3], 1000, 32)).toBe(offsets[3] - 32);
    // Below the view: its bottom lands at the bottom edge.
    expect(scrollToShow(offsets, 30, 0, 300, 32)).toBe(offsets[31] - 300);
  });
});

describe('the review rail of a large bank', () => {
  const noop = () => undefined;
  const render = (count: number) => {
    const { sections, order } = bank(count);
    const state: ReviewState = {
      sections,
      order,
      focused: undefined,
      index: -1,
      picked: new Set(),
      railHidden: false,
      language: 'en',
      version: 'student',
    };
    return renderToStaticMarkup(
      createElement(ReviewPage, {
        state,
        fullGroup: undefined,
        empty: 'Nothing',
        onFocus: noop,
        onStep: noop,
        onPick: noop,
        onRailHidden: noop,
        onLanguage: noop,
        onVersion: noop,
        onOpen: noop,
      }),
    );
  };
  const drawn = (html: string) => html.match(/data-rail-entry=/g)?.length ?? 0;

  it('draws every entry below the threshold', () => {
    expect(drawn(render(RAIL_WINDOW_FROM - 1))).toBe(RAIL_WINDOW_FROM - 1);
  });

  it('draws only a window of 3000 questions, the rest as spacer height', () => {
    const html = render(3000);
    const count = drawn(html);
    expect(count).toBeGreaterThan(10);
    expect(count).toBeLessThan(100);
    expect(html).toContain('Question 0');
    expect(html).not.toContain('Question 2999<');
  });
});
