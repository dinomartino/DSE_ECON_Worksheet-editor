import { describe, expect, it } from 'vitest';
import { choiceQuestion, docWith } from '@/library/testKit';
import { createSectionElement, flowOf, resolveFlow } from '@/model/flow';
import { computeNumbering } from '@/model/numbering';
import { bi } from '@/model/text';
import type { Worksheet } from '@/model/types';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { renderWorksheet } from '@/render/worksheet';
import { lastQuestionGap } from '@/store/worksheetStore';
import { pickSlot, provisionalWorksheet, type SlotBox, type SlotGeometry } from './dropSlot';

/** Items stacked 100px tall with a 10px gap: item i spans [i*110, i*110+100]. */
const stack = (n: number, from = 0): SlotBox[] =>
  Array.from({ length: n }, (_, k) => ({ index: from + k, top: k * 110, bottom: k * 110 + 100 }));

const page = (items: SlotBox[], extra: Partial<SlotGeometry> = {}): SlotGeometry => ({
  onPage: true,
  items,
  ghost: [],
  ...extra,
});

const opts = { maxSlot: 99 };

describe('pickSlot', () => {
  it('is no target off the page', () => {
    expect(pickSlot(50, { onPage: false, items: stack(3), ghost: [] }, 2, opts)).toBeNull();
  });

  it('takes the side of the item the pointer is nearer', () => {
    const geometry = page(stack(3));
    expect(pickSlot(20, geometry, null, opts)).toBe(0); // top half of item 0: before it
    expect(pickSlot(80, geometry, null, opts)).toBe(1); // bottom half of item 0: after it
    expect(pickSlot(130, geometry, null, opts)).toBe(1); // top half of item 1
    expect(pickSlot(290, geometry, null, opts)).toBe(3); // bottom half of the last: after it
  });

  it('reaches before the first item and after the last from the paper around them', () => {
    const geometry = page(stack(3, 0));
    expect(pickSlot(-40, geometry, null, opts)).toBe(0);
    expect(pickSlot(900, geometry, null, opts)).toBe(3);
  });

  it('a gap between two consecutive items is the slot between them', () => {
    expect(pickSlot(105, page(stack(3)), null, opts)).toBe(1);
    expect(pickSlot(215, page(stack(3)), 0, opts)).toBe(2);
  });

  it('keeps the slot near an item’s midpoint (hysteresis), but not far from it', () => {
    const geometry = page(stack(3));
    // Item 1 spans 110–210, midpoint 160. The slot sits after it (2).
    expect(pickSlot(155, geometry, 2, opts)).toBe(2);
    expect(pickSlot(165, geometry, 1, opts)).toBe(1);
    // Well past the midpoint, it flips.
    expect(pickSlot(140, geometry, 2, opts)).toBe(1);
    expect(pickSlot(185, geometry, 1, opts)).toBe(2);
    // A slot elsewhere does not hold: the pointer's own item decides.
    expect(pickSlot(155, geometry, 0, opts)).toBe(1);
  });

  it('holds the slot while the pointer is over the provisional question itself', () => {
    const geometry = page(stack(3), { ghost: [{ top: 400, bottom: 600 }] });
    expect(pickSlot(500, geometry, 2, opts)).toBe(2);
  });

  it('holds the slot over a header or footer band: a band is never a target', () => {
    expect(pickSlot(20, page(stack(3), { overBand: true }), 3, opts)).toBe(3);
    expect(pickSlot(20, page(stack(3), { overBand: true }), null, opts)).toBeNull();
  });

  it('treats the gaps either side of a section marker as two slots', () => {
    // Flow: Q0, SECTION(1), Q2 — the marker is an item like any other.
    const geometry = page(stack(3));
    expect(pickSlot(90, geometry, null, opts)).toBe(1); // end of the first section
    expect(pickSlot(120, geometry, null, opts)).toBe(1); // above the marker's midpoint
    expect(pickSlot(200, geometry, null, opts)).toBe(2); // under the marker: first of the next
  });

  it('a page a break opened and nothing fills lands after the break', () => {
    const geometry = page([...stack(2), { index: 2, top: 300, bottom: 1300, blank: true }]);
    expect(pickSlot(320, geometry, null, opts)).toBe(3);
    expect(pickSlot(1200, geometry, null, opts)).toBe(3);
  });

  it('never goes past the last gap a question may take ("END OF PAPER")', () => {
    const geometry = page(stack(4));
    expect(pickSlot(900, geometry, null, { maxSlot: 3 })).toBe(3);
    expect(pickSlot(390, geometry, null, { maxSlot: 3 })).toBe(3);
  });

  it('with nothing on the page, the only slot is the start', () => {
    expect(pickSlot(200, page([]), null, opts)).toBe(0);
  });

  it('between items the page does not draw, takes the nearer edge', () => {
    const geometry = page([
      { index: 0, top: 0, bottom: 100 },
      { index: 3, top: 300, bottom: 400 },
    ]);
    expect(pickSlot(120, geometry, null, opts)).toBe(1);
    expect(pickSlot(280, geometry, null, opts)).toBe(3);
  });
});

describe('provisionalWorksheet', () => {
  const q1 = choiceQuestion('One');
  const q2 = choiceQuestion('Two');
  const q3 = choiceQuestion('Three');
  const section = createSectionElement(bi('Section B', ''));
  const base: Worksheet = docWith([q1, q2, q3], {
    layout: [section],
    flow: [
      { type: 'question', id: q1.id },
      { type: 'question', id: q2.id },
      { type: 'layout', id: section.id },
      { type: 'question', id: q3.id },
    ],
  });
  const ghost = choiceQuestion('From the bank');
  const order = (worksheet: Worksheet) => resolveFlow(worksheet).map((item) => item.id);

  it('puts the question in the slot and renumbers what follows', () => {
    const shown = provisionalWorksheet(base, ghost, 1);
    expect(order(shown)).toEqual([q1.id, ghost.id, q2.id, section.id, q3.id]);
    const numbers = computeNumbering(shown).byQuestionId;
    expect(numbers.get(ghost.id)?.number).toBe(2);
    expect(numbers.get(q2.id)?.number).toBe(3);
  });

  it('lands either side of a section marker, which decides its section', () => {
    expect(order(provisionalWorksheet(base, ghost, 2))).toEqual([q1.id, q2.id, ghost.id, section.id, q3.id]);
    expect(order(provisionalWorksheet(base, ghost, 3))).toEqual([q1.id, q2.id, section.id, ghost.id, q3.id]);
    // Section B restarts at 1: the ghost under it is its first question.
    expect(computeNumbering(provisionalWorksheet(base, ghost, 3)).byQuestionId.get(ghost.id)?.number).toBe(1);
  });

  it('reaches the very start and the very end', () => {
    expect(order(provisionalWorksheet(base, ghost, 0))[0]).toBe(ghost.id);
    expect(order(provisionalWorksheet(base, ghost, 4)).at(-1)).toBe(ghost.id);
    expect(order(provisionalWorksheet(base, ghost, 40)).at(-1)).toBe(ghost.id);
  });

  it('keeps every existing question object, so the render cache still holds them', () => {
    const shown = provisionalWorksheet(base, ghost, 2);
    expect(shown.questions.filter((q) => q !== ghost)).toEqual([q1, q2, q3]);
    shown.questions.filter((q) => q !== ghost).forEach((q, i) => expect(q).toBe([q1, q2, q3][i]));
    // Questions before the slot keep their number, so their rendered nodes are the cached ones.
    // The preview's mode object is stable across a drag; the cache keys on it too.
    const mode = { language: 'en', version: 'student' } as const;
    const before = renderWorksheet(base, mode);
    const after = renderWorksheet(shown, mode);
    const nodesOf = (rendered: typeof before, id: string) =>
      rendered.items.find((item) => item.type === 'question' && item.question.questionId === id);
    const first = nodesOf(before, q1.id);
    const again = nodesOf(after, q1.id);
    expect(first?.type === 'question' && again?.type === 'question' && again.question.nodes === first.question.nodes).toBe(true);
  });

  it('is derived: the document it came from is untouched', () => {
    const snapshot = JSON.stringify(base);
    provisionalWorksheet(base, ghost, 1);
    expect(JSON.stringify(base)).toBe(snapshot);
    expect(flowOf(base).some((entry) => entry.id === ghost.id)).toBe(false);
  });
});

describe('lastQuestionGap', () => {
  it('stops a drop ahead of "END OF PAPER" on an exam paper, and at the end otherwise', () => {
    const paper = createWorksheetFrom({ documentType: 'paper1', seedSample: false });
    const flow = flowOf(paper);
    expect(flow.at(-1)?.id).toBe(paper.layout.at(-1)!.id);
    expect(lastQuestionGap(paper)).toBe(flow.length - 1);
    const classroom = createWorksheetFrom({ documentType: 'classroom', seedSample: false });
    expect(lastQuestionGap(classroom)).toBe(flowOf(classroom).length);
  });
});
