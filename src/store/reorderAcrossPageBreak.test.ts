import { beforeEach, describe, expect, it } from 'vitest';
import { composePages, packPages, type PackItem } from '@/components/preview/pagination';
import { createMcqQuestion, createWorksheet } from '@/model/factories';
import {
  createPageBreakElement,
  createSectionElement,
  createTextElement,
  resolveFlow,
} from '@/model/flow';
import { bi } from '@/model/text';
import type { McqQuestion } from '@/model/types';
import { withFlow } from '@/test/fixtures';
import { useWorksheetStore } from './worksheetStore';

/*
 * GitHub #4 (0.8.4): a teacher's 24-MC paper had a page break after Q4 and another after
 * Q5, so Q5 sat alone on page 2 with most of the sheet empty. Nothing could be put after
 * Q5: the outline's ↑ on Q6 jumped it over the break *and* Q5, and ↓ on Q5 took the break
 * along. `resolveFlow` files a layout element under the question before it, and
 * `moveQuestion` reordered only `questions`, so the break was glued to Q5.
 */

const store = () => useWorksheetStore.getState();

const qs: McqQuestion[] = [];
const breakAfterQ4 = createPageBreakElement();
const breakAfterQ5 = createPageBreakElement();

beforeEach(() => {
  qs.length = 0;
  for (let n = 1; n <= 24; n += 1) qs.push(createMcqQuestion());
  const worksheet = withFlow(
    createWorksheet(),
    [
      createSectionElement(bi('Section A: Multiple Choice Questions', '甲部')),
      createTextElement(bi('There are 20 questions in this paper.', '')),
      ...qs.slice(0, 4),
      breakAfterQ4,
      qs[4],
      breakAfterQ5,
      ...qs.slice(5),
    ],
    { replaceLayout: true },
  );
  useWorksheetStore.setState({ worksheet, past: [], future: [] });
});

/** The ids in printed order, questions as `Q<n>` (their starting number), breaks as `|`. */
function order(): string[] {
  return resolveFlow(store().worksheet)
    .filter((item) => item.type === 'question' || item.element.kind === 'pageBreak')
    .map((item) => (item.type === 'question' ? `Q${qs.findIndex((q) => q.id === item.id) + 1}` : '|'));
}

/**
 * Which sheet each question lands on, as the paginator packs it: every item 50px on a
 * 1000px sheet, so only the breaks start pages. The `.docx` and the thumbnails draw the
 * same sheets (§ pageBreaks), so this is the page the teacher sees everywhere.
 */
function pageOf(n: number): number {
  const items: PackItem[] = resolveFlow(store().worksheet).map((item) =>
    item.type === 'layout' && item.element.kind === 'pageBreak'
      ? { key: item.id, forceBreak: true, breakId: item.id }
      : { key: item.id },
  );
  const heights = new Map(items.map((item) => [item.key, item.forceBreak ? 0 : 50]));
  const pages = composePages(packPages(items, heights, 1000));
  return pages.findIndex((page) => page.flowIds.includes(qs[n - 1].id)) + 1;
}

describe('reordering MCs around a page break (GitHub #4)', () => {
  it('starts as the teacher had it: Q5 alone on page 2', () => {
    expect(order().slice(0, 8)).toEqual(['Q1', 'Q2', 'Q3', 'Q4', '|', 'Q5', '|', 'Q6']);
    expect([pageOf(4), pageOf(5), pageOf(6)]).toEqual([1, 2, 3]);
  });

  it('↑ on Q6 puts it after Q5 on page 2, not before it', () => {
    store().moveQuestion(qs[5].id, -1);
    expect(order().slice(4, 9)).toEqual(['|', 'Q5', 'Q6', '|', 'Q7']);
    expect([pageOf(5), pageOf(6), pageOf(7)]).toEqual([2, 2, 3]);
  });

  it('↓ on Q5 moves the question, not the page break', () => {
    store().moveQuestion(qs[4].id, 1);
    expect(order().slice(4, 8)).toEqual(['|', '|', 'Q5', 'Q6']);
    expect(pageOf(5)).toBe(3);
    store().moveQuestion(qs[4].id, 1);
    expect(order().slice(4, 8)).toEqual(['|', '|', 'Q6', 'Q5']);
  });

  it('a page can take several questions after its first', () => {
    for (const n of [6, 7, 8]) {
      store().moveQuestion(qs[n - 1].id, -1);
    }
    expect(order().slice(4, 10)).toEqual(['|', 'Q5', 'Q6', 'Q7', 'Q8', '|']);
    expect([5, 6, 7, 8].map(pageOf)).toEqual([2, 2, 2, 2]);
  });

  it('a drop on the lower half of Q5 lands after it, on its page', () => {
    store().reorderFlowItem(qs[9].id, qs[4].id, 'after');
    expect(order().slice(4, 9)).toEqual(['|', 'Q5', 'Q10', '|', 'Q6']);
    expect(pageOf(10)).toBe(2);
  });

  it('each move is one undo step', () => {
    const before = order();
    store().moveQuestion(qs[5].id, -1);
    store().undo();
    expect(order()).toEqual(before);
  });
});
