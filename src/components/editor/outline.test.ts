import { describe, expect, it } from 'vitest';
import type { PageComposition } from '@/components/preview/pagination';
import { groupByPage } from './Outline';

/**
 * Cutting a section's flow into the sheets it landed on.
 *
 * A page is measured, not modelled, so this is a *view* over `resolveFlow` — every case
 * here is about what the grouping does with a composition it did not choose.
 */

type Item = ReturnType<typeof import('@/model/flow').resolveFlow>[number];

/** A resolved item, reduced to the one field the grouping reads. */
const item = (id: string) => ({ type: 'question', id, question: { id } }) as unknown as Item;

const page = (index: number, flowIds: string[], breakId?: string): PageComposition => ({
  index,
  flowIds: breakId ? [breakId, ...flowIds] : flowIds,
  structuralOnly: flowIds.length === 0,
  breakId,
});

const shape = (groups: ReturnType<typeof groupByPage>) =>
  groups.map((group) => [group.pageNumber, group.items.map((i) => i.id)]);

describe('grouping the outline by page', () => {
  it('cuts a flow into the sheets the paginator reported', () => {
    const groups = groupByPage(
      [item('q1'), item('q2'), item('q3')],
      [page(0, ['q1', 'q2']), page(1, ['q3'], 'b1')],
    );
    expect(shape(groups)).toEqual([
      [1, ['q1', 'q2']],
      [2, ['q3']],
    ]);
    expect(groups[1].breakId).toBe('b1');
  });

  it('shows an added but still-empty page, which has no items to group', () => {
    // Nothing in the flow points at this sheet, so the run-based cut cannot produce it
    // — yet it is the page most in need of being visible and droppable.
    const groups = groupByPage([item('q1')], [page(0, ['q1']), page(1, [], 'b1')]);
    expect(shape(groups)).toEqual([
      [1, ['q1']],
      [2, []],
    ]);
    expect(groups[1].breakId).toBe('b1');
  });

  it('places an empty page between the sheets it falls between', () => {
    const groups = groupByPage(
      [item('q1'), item('q2')],
      [page(0, ['q1']), page(1, [], 'b1'), page(2, ['q2'], 'b2')],
    );
    expect(shape(groups)).toEqual([
      [1, ['q1']],
      [2, []],
      [3, ['q2']],
    ]);
  });

  it('keeps unmeasured items visible rather than dropping them', () => {
    // A question added since the last measurement is on no sheet yet. It must still
    // appear, or it would vanish from the outline until the paginator caught up.
    const groups = groupByPage([item('q1'), item('q2')], [page(0, ['q1'])]);
    expect(shape(groups)).toEqual([
      [1, ['q1']],
      [undefined, ['q2']],
    ]);
  });

  it('puts everything in one unplaced group before the first measurement', () => {
    const groups = groupByPage([item('q1'), item('q2')], []);
    expect(shape(groups)).toEqual([[undefined, ['q1', 'q2']]]);
  });

  it('starts a new group when a section resumes on a page it already used', () => {
    // Pages are not unique per section: a section can start mid-sheet, so the same
    // number legitimately appears twice. The number labels a group, never keys it.
    const groups = groupByPage(
      [item('q1'), item('q2'), item('q3')],
      [page(0, ['q1', 'q3']), page(1, ['q2'], 'b1')],
    );
    expect(shape(groups)).toEqual([
      [1, ['q1']],
      [2, ['q2']],
      [1, ['q3']],
    ]);
  });
});
