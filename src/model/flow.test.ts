import { describe, expect, it } from 'vitest';
import {
  applyOrder,
  createDividerElement,
  createPageBreakElement,
  createSectionElement,
  createSpacerElement,
  flowOf,
  moveInFlow,
  moveRunInFlow,
  nudgeInFlow,
  resolveFlow,
  type FlowDoc,
} from './flow';
import { createMcqQuestion, createWorksheet } from './factories';
import { computeNumbering } from './numbering';
import { bi } from './text';
import type { FlowItem, Worksheet } from './types';

/** An MCQ with a chosen id, so an ordering assertion can name it. */
const q = (id: string) => ({ ...createMcqQuestion(), id });

/**
 * The ordering contract: `questions` is authoritative for question order, and `flow`
 * only positions layout elements relative to them. These tests pin that down, because
 * a second source of truth for order is exactly the bug this design exists to avoid.
 *
 * The subject is a whole document rather than a section: there is one flow now, and a
 * section is a layout element inside it.
 */

function sectionWith(questionCount: number): FlowDoc {
  return {
    questions: Array.from({ length: questionCount }, () => createMcqQuestion()),
  };
}

const ids = (section: FlowDoc) => resolveFlow(section).map((item) => item.id);

describe('resolveFlow', () => {
  it('falls back to plain question order when there is no layout at all', () => {
    const section = sectionWith(3);
    expect(ids(section)).toEqual(section.questions.map((q) => q.id));
  });

  it('ignores a flow that names questions only, deferring to the array order', () => {
    const section = sectionWith(3);
    // A stale flow listing the questions backwards must not reorder them: the array
    // is the authority, so this resolves in array order regardless.
    section.layout = [createDividerElement()];
    section.flow = [
      { type: 'question', id: section.questions[2].id },
      { type: 'question', id: section.questions[1].id },
      { type: 'question', id: section.questions[0].id },
    ];
    expect(ids(section).filter((id) => id !== section.layout![0].id)).toEqual(
      section.questions.map((q) => q.id),
    );
  });

  it('places a layout element after the question it follows in the flow', () => {
    const section = sectionWith(3);
    const divider = createDividerElement();
    section.layout = [divider];
    section.flow = [
      { type: 'question', id: section.questions[0].id },
      { type: 'layout', id: divider.id },
      { type: 'question', id: section.questions[1].id },
      { type: 'question', id: section.questions[2].id },
    ];
    expect(ids(section)).toEqual([
      section.questions[0].id,
      divider.id,
      section.questions[1].id,
      section.questions[2].id,
    ]);
  });

  it('places an element before every question when it leads the flow', () => {
    const section = sectionWith(2);
    const spacer = createSpacerElement();
    section.layout = [spacer];
    section.flow = [
      { type: 'layout', id: spacer.id },
      { type: 'question', id: section.questions[0].id },
    ];
    expect(ids(section)[0]).toBe(spacer.id);
  });

  it('appends layout elements the flow never mentions rather than hiding them', () => {
    const section = sectionWith(1);
    const orphan = createPageBreakElement();
    section.layout = [orphan];
    section.flow = [{ type: 'question', id: section.questions[0].id }];
    expect(ids(section)).toEqual([section.questions[0].id, orphan.id]);
  });

  it('skips flow entries whose element or question no longer exists', () => {
    const section = sectionWith(2);
    const divider = createDividerElement();
    section.layout = [divider];
    section.flow = [
      { type: 'question', id: section.questions[0].id },
      { type: 'layout', id: 'deleted-element' },
      { type: 'layout', id: divider.id },
      { type: 'question', id: section.questions[1].id },
    ];
    // The missing element is dropped; the divider keeps its anchor to question 1.
    expect(ids(section)).toEqual([
      section.questions[0].id,
      divider.id,
      section.questions[1].id,
    ]);
  });

  it('falls back to the leading position when an element follows a deleted question', () => {
    const section = sectionWith(1);
    const divider = createDividerElement();
    section.layout = [divider];
    section.flow = [
      { type: 'question', id: 'deleted-question' },
      { type: 'layout', id: divider.id },
    ];
    // Its anchor is gone, so it lands ahead of everything rather than disappearing.
    expect(ids(section)).toEqual([divider.id, section.questions[0].id]);
  });
});

describe('moveInFlow / nudgeInFlow', () => {
  it('reorders questions by rewriting the questions array, not just the flow', () => {
    const section = sectionWith(3);
    const [first, second, third] = section.questions.map((q) => q.id);
    const moved = moveInFlow(section, third, first);

    // The array is what carries question order, so it must be the thing that changed:
    // question 3 lands at question 1's position and the rest shift down.
    expect(moved.questions.map((q) => q.id)).toEqual([third, first, second]);
  });

  it('keeps a layout element anchored to the question it was dragged past', () => {
    const section = sectionWith(3);
    const divider = createDividerElement();
    section.layout = [divider];
    section.flow = [
      { type: 'question', id: section.questions[0].id },
      { type: 'layout', id: divider.id },
      { type: 'question', id: section.questions[1].id },
      { type: 'question', id: section.questions[2].id },
    ];

    // Drag the divider down onto question 3.
    const moved = moveInFlow(section, divider.id, section.questions[2].id);
    const next: FlowDoc = { ...section, ...moved };
    expect(ids(next)).toEqual([
      section.questions[0].id,
      section.questions[1].id,
      divider.id,
      section.questions[2].id,
    ]);
  });

  it('honours the drop edge, so "after" lands past the target rather than before it', () => {
    const section = sectionWith(3);
    const [first, second, third] = section.questions.map((q) => q.id);

    // Dragging question 1 onto the *bottom* half of question 3 puts it last.
    const after = moveInFlow(section, first, third, 'after');
    expect(after.questions.map((q) => q.id)).toEqual([second, third, first]);

    // The same drag onto the top half puts it immediately before question 3.
    const before = moveInFlow(section, first, third, 'before');
    expect(before.questions.map((q) => q.id)).toEqual([second, first, third]);
  });

  it('nudges an item one position and is a no-op at the ends', () => {
    const section = sectionWith(3);
    const first = section.questions[0].id;

    const down = nudgeInFlow(section, first, 1);
    expect(down.questions[1].id).toBe(first);

    // Already at the top: nothing moves.
    const up = nudgeInFlow(section, first, -1);
    expect(up.questions.map((q) => q.id)).toEqual(section.questions.map((q) => q.id));
  });

  it('never drops a question, even when the flow is missing entries', () => {
    const section = sectionWith(3);
    section.layout = [createDividerElement()];
    section.flow = [{ type: 'question', id: section.questions[1].id }];
    const moved = moveInFlow(section, section.questions[1].id, section.questions[1].id);
    expect(moved.questions).toHaveLength(3);
  });
});

describe('flowOf', () => {
  it('materialises the implicit order so later inserts have something to anchor to', () => {
    const section = sectionWith(2);
    expect(flowOf(section)).toEqual([
      { type: 'question', id: section.questions[0].id },
      { type: 'question', id: section.questions[1].id },
    ]);
  });
});

/**
 * Moving a *run* — what dragging a page thumbnail does. A page has no identity in the
 * model, so the only way to express "move page 3 above page 2" is to move the items
 * the paginator put on it, together and in order.
 */
describe('moveRunInFlow', () => {
  it('moves a run as a group, keeping its internal order', () => {
    const section = sectionWith(5);
    const [q0, q1, q2, q3, q4] = section.questions.map((q) => q.id);

    // Drag "page" [q3, q4] above q1.
    const moved = moveRunInFlow(section, [q3, q4], q1, 'before');
    expect(moved.questions.map((q) => q.id)).toEqual([q0, q3, q4, q1, q2]);
  });

  it('does not reverse a run dragged upward', () => {
    // The failure mode of moving items one at a time: each insert shifts the next
    // one's landing index, so the run arrives backwards.
    const section = sectionWith(4);
    const [q0, q1, q2, q3] = section.questions.map((q) => q.id);
    const moved = moveRunInFlow(section, [q2, q3], q0, 'before');
    expect(moved.questions.map((q) => q.id)).toEqual([q2, q3, q0, q1]);
  });

  it('lands after the target when asked, without swallowing what follows', () => {
    const section = sectionWith(4);
    const [q0, q1, q2, q3] = section.questions.map((q) => q.id);
    const moved = moveRunInFlow(section, [q0], q2, 'after');
    expect(moved.questions.map((q) => q.id)).toEqual([q1, q2, q0, q3]);
  });

  it('carries layout elements along with the questions in the run', () => {
    const section = sectionWith(3);
    const divider = createDividerElement();
    section.layout = [divider];
    const [q0, q1, q2] = section.questions.map((q) => q.id);
    section.flow = [
      { type: 'question', id: q0 },
      { type: 'question', id: q1 },
      { type: 'layout', id: divider.id },
      { type: 'question', id: q2 },
    ];

    const moved = moveRunInFlow(section, [q1, divider.id], q0, 'before');
    expect(moved.flow.map((entry) => entry.id)).toEqual([q1, divider.id, q0, q2]);
    // The ordering invariant still holds: `questions` is rewritten to match.
    expect(moved.questions.map((q) => q.id)).toEqual([q1, q0, q2]);
  });

  it('refuses to drop a run inside itself rather than scrambling it', () => {
    const section = sectionWith(3);
    const [q0, q1, q2] = section.questions.map((q) => q.id);
    const moved = moveRunInFlow(section, [q0, q1], q1, 'before');
    expect(moved.questions.map((q) => q.id)).toEqual([q0, q1, q2]);
  });

  it('never drops a question, whatever the run contains', () => {
    const section = sectionWith(4);
    const moved = moveRunInFlow(
      section,
      [section.questions[1].id, 'not-a-real-id'],
      section.questions[3].id,
      'after',
    );
    expect(moved.questions).toHaveLength(4);
  });
});
/**
 * Moving between sections, without a cross-section move.
 *
 * `moveAcrossSections` is gone. A section owns nothing, so "into Section B" is just
 * "after Section B's heading" — an ordinary move in the one flow. These pin down that
 * the replacement really does change which section a question reads under, since that
 * is the behaviour the deleted function existed to provide.
 */
describe('moving past a section marker', () => {
  const docWith = (questionCount: number) => {
    const questions = Array.from({ length: questionCount }, () => createMcqQuestion());
    const sectionB = createSectionElement(bi('Section B', '乙部'));
    // Two questions, then the Section B heading, then the rest.
    const doc: FlowDoc = {
      questions,
      layout: [sectionB],
      flow: [
        { type: 'question', id: questions[0].id },
        { type: 'question', id: questions[1].id },
        { type: 'layout', id: sectionB.id },
        ...questions.slice(2).map((q) => ({ type: 'question' as const, id: q.id })),
      ],
    };
    return { doc, sectionB };
  };

  it('moves a question under another section by landing it after that heading', () => {
    const { doc, sectionB } = docWith(4);
    const moving = doc.questions[0].id;

    const moved = moveInFlow(doc, moving, sectionB.id, 'after');
    const order = moved.flow.map((entry) => entry.id);

    // It now sits immediately after the heading, so it reads under Section B.
    expect(order.indexOf(moving)).toBe(order.indexOf(sectionB.id) + 1);
    // And no question was lost on the way — the invariant `applyOrder` protects.
    expect(moved.questions).toHaveLength(4);
  });

  it('renumbers from the marker, which is what a section is for', () => {
    const { doc, sectionB } = docWith(4);
    sectionB.restartNumbering = true;
    const worksheet = { ...createWorksheet(), ...doc, layout: [sectionB] } as Worksheet;

    const before = computeNumbering(worksheet);
    // Questions 1-2 precede the marker; 3-4 follow it and restart at 1.
    expect(before.questions.map((entry) => entry.number)).toEqual([1, 2, 1, 2]);

    // Drag the first question below the heading: it joins Section B's run.
    const moved = moveInFlow(worksheet, worksheet.questions[0].id, sectionB.id, 'after');
    const after = computeNumbering({ ...worksheet, ...moved });
    expect(after.questions.map((entry) => entry.number)).toEqual([1, 1, 2, 3]);
  });
});

/*
 * `questions` owns question order, so a *position* must be written into both lists.
 *
 * This is the invariant's sharpest edge and it cost a real bug: an insert that recorded
 * its position in `flow` alone had no effect on a question at all — `resolveFlow` emits
 * questions in array order — so "add after this heading" put the question on the last
 * page while the flow claimed otherwise. A layout element never showed the fault,
 * because `layout` carries existence only and `flow` alone positions it.
 */
describe('applyOrder writes a position into both lists', () => {
  it('moves a question in `questions`, not only in `flow`', () => {
    const doc: FlowDoc = {
      questions: [q('q1'), q('q2'), q('q3')],
      layout: [{ kind: 'divider', id: 'd1' }],
      flow: [
        { type: 'question', id: 'q1' },
        { type: 'layout', id: 'd1' },
        { type: 'question', id: 'q2' },
        { type: 'question', id: 'q3' },
      ],
    };

    // The order an insert after `d1` would produce.
    const ordered: FlowItem[] = [
      { type: 'question', id: 'q1' },
      { type: 'layout', id: 'd1' },
      { type: 'question', id: 'q3' },
      { type: 'question', id: 'q2' },
    ];

    const moved = applyOrder(doc, ordered);
    // The array itself has to change, or resolving reverts the move.
    expect(moved.questions.map((question) => question.id)).toEqual(['q1', 'q3', 'q2']);
    expect(
      resolveFlow({ ...doc, ...moved }).map((item) => item.id),
    ).toEqual(['q1', 'd1', 'q3', 'q2']);
  });

  it('keeps a question the ordering never mentioned, rather than dropping it', () => {
    const doc: FlowDoc = { questions: [q('q1'), q('q2')] };
    const moved = applyOrder(doc, [{ type: 'question', id: 'q2' }]);
    expect(moved.questions.map((question) => question.id)).toEqual(['q2', 'q1']);
  });
});
