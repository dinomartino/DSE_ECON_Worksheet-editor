import { describe, expect, it } from 'vitest';
import {
  createDividerElement,
  createPageBreakElement,
  createSpacerElement,
  flowOf,
  moveInFlow,
  moveRunInFlow,
  nudgeInFlow,
  resolveFlow,
} from './flow';
import { createMcqQuestion, createSection } from './factories';
import type { Section } from './types';

/**
 * The ordering contract: `questions` is authoritative for question order, and `flow`
 * only positions layout elements relative to them. These tests pin that down, because
 * a second source of truth for order is exactly the bug this design exists to avoid.
 */

function sectionWith(questionCount: number): Section {
  const section = createSection();
  section.questions = Array.from({ length: questionCount }, () => createMcqQuestion());
  return section;
}

const ids = (section: Section) => resolveFlow(section).map((item) => item.id);

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
    const next: Section = { ...section, ...moved };
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
