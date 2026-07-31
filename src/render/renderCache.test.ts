import { describe, expect, it } from 'vitest';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { plain, bi } from '@/model/text';
import type { OutputMode, Worksheet } from '@/model/types';
import { renderWorksheet } from './worksheet';

/**
 * The per-question render cache changes *identity*, never content (§renderWorksheet).
 *
 * The preview memoises each item's subtree on its nodes array, so these three claims
 * are load-bearing: an untouched question must keep its identity across a render (or
 * the memo never hits and typing re-renders the whole document), an edited question
 * must lose it (or the page shows stale text), and anything that renumbers or
 * re-streams a question must lose it too (or a dragged section marker leaves the old
 * numbers on screen while the .docx — which renders fresh — restarts them).
 */
describe('per-question render cache', () => {
  const mode: OutputMode = { language: 'bilingual', version: 'teacher' };

  /** An immutable edit, the way every store commit performs one (`mapQuestion`). */
  function editQuestion(worksheet: Worksheet, questionId: string): Worksheet {
    return {
      ...worksheet,
      questions: worksheet.questions.map((question) =>
        question.id === questionId
          ? { ...question, blocks: [{ ...question.blocks[0], kind: 'paragraph' as const, text: bi('Edited', '已修改') }] }
          : question,
      ),
    };
  }

  it('keeps node identity for untouched questions across renders', () => {
    const worksheet = buildAcceptanceWorksheet();
    const first = renderWorksheet(worksheet, mode);
    const second = renderWorksheet(worksheet, mode);
    for (const [index, question] of first.questions.entries()) {
      expect(second.questions[index].nodes).toBe(question.nodes);
    }
  });

  it('rebuilds only the edited question', () => {
    const worksheet = buildAcceptanceWorksheet();
    const before = renderWorksheet(worksheet, mode);
    const target = worksheet.questions[2].id;
    const after = renderWorksheet(editQuestion(worksheet, target), mode);

    for (const [index, question] of before.questions.entries()) {
      if (question.questionId === target) {
        expect(after.questions[index].nodes).not.toBe(question.nodes);
      } else {
        expect(after.questions[index].nodes).toBe(question.nodes);
      }
    }
  });

  it('produces identical output from a warm cache', () => {
    const worksheet = buildAcceptanceWorksheet();
    const cold = renderWorksheet(worksheet, mode);
    const warm = renderWorksheet(worksheet, mode);
    expect(warm).toEqual(cold);
  });

  it('renumbers cached questions when a restarting section moves above them', () => {
    const worksheet = buildAcceptanceWorksheet();
    renderWorksheet(worksheet, mode); // warm the cache with the original numbers

    // Move Section B's marker to the very front of the flow: every question now sits
    // behind a restart, so the MCQs renumber from 1 under the new stream.
    const [sectionB] = worksheet.flow.filter(
      (item, index) => item.type === 'layout' && index > 0,
    );
    const moved: Worksheet = {
      ...worksheet,
      flow: [sectionB, ...worksheet.flow.filter((item) => item !== sectionB)],
    };
    const rendered = renderWorksheet(moved, mode);

    // Question numbers restart across the whole run; the cache may not hand back
    // nodes carrying the old numbering.
    expect(rendered.questions.map((question) => question.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    const markers = rendered.questions.map(
      (question) =>
        question.nodes
          .filter((node) => node.kind === 'text' && node.listRef)
          .map((node) => (node.kind === 'text' ? node.listRef?.stream : undefined))[0],
    );
    // Every question renders on Section B's stream now, not the default one the warm
    // cache was built against.
    for (const stream of markers) {
      expect(stream).toContain('question:');
      expect(stream).not.toBe('question:0');
    }
  });

  it('separates language modes in the cache', () => {
    const worksheet = buildAcceptanceWorksheet();
    const en: OutputMode = { language: 'en', version: 'student' };
    const bilingual = renderWorksheet(worksheet, mode);
    const english = renderWorksheet(worksheet, en);
    // The teacher-only explanation is present in one and absent from the other.
    const text = (nodes: typeof bilingual.questions[number]['nodes']) =>
      nodes
        .map((node) => (node.kind === 'text' ? plain(node.text.en) : ''))
        .join(' ');
    expect(text(bilingual.questions[0].nodes)).toContain('Demand shifts left.');
    expect(text(english.questions[0].nodes)).not.toContain('Demand shifts left.');
  });
});
