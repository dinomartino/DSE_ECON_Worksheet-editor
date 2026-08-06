/**
 * The Paper 1 MCQ booklet's own shape.
 *
 * Three things the reference (DSE 2021 P1) carries that a plain worksheet does not: the
 * lead-in above question 1 with a **derived** count, the running footer with the paper
 * code and page number, and "END OF PAPER" after the last question. The count is the one
 * with teeth — the paper's own cover tells a candidate to check that every question is
 * there, so a stale number is worse than no number.
 */
import { describe, expect, it } from 'vitest';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { createMcqQuestion } from '@/model/factories';
import { resolveFlow } from '@/model/flow';
import { renderWorksheet } from '@/render/worksheet';
import { BLANK_LINE_PT } from '@/render/ir';
import { plain } from '@/model/text';
import type { OutputMode, Worksheet } from '@/model/types';

const MODE: OutputMode = { language: 'en', version: 'student' };

/** Every line of body text the paper renders, in printed order. */
function renderedLines(worksheet: Worksheet): string[] {
  const rendered = renderWorksheet(worksheet, MODE);
  const lines: string[] = [];
  for (const item of rendered.items) {
    const nodes = item.type === 'layout' ? item.layout.nodes : item.question.nodes;
    for (const node of nodes) {
      if (node.kind === 'text') lines.push(plain(node.text.en).trim());
    }
  }
  return lines.filter((line) => line.length > 0);
}

const paper1 = () => createWorksheetFrom({ documentType: 'paper1' });

describe('the lead-in counts the questions that actually print', () => {
  it('reads "There are 1 questions in this paper" for the seeded sample', () => {
    const lines = renderedLines(paper1());
    const leadIn = lines.find((line) => line.includes('questions in this paper'));

    expect(leadIn).toBeDefined();
    expect(leadIn).toContain('There are 1 questions');
    expect(leadIn).toContain('Choose the BEST answer for each question.');
  });

  it('tracks the count as questions are added', () => {
    const worksheet = paper1();
    const extra = [createMcqQuestion(), createMcqQuestion(), createMcqQuestion()];
    const withMore: Worksheet = {
      ...worksheet,
      questions: [...worksheet.questions, ...extra],
      flow: [
        ...worksheet.flow.slice(0, -1),
        ...extra.map((question) => ({ type: 'question' as const, id: question.id })),
        worksheet.flow[worksheet.flow.length - 1],
      ],
    };

    // The whole reason this is an element rather than typed text: a re-cut paper
    // renumbers itself. 1 seeded + 3 added.
    const leadIn = renderedLines(withMore).find((line) => line.includes('questions in this paper'));
    expect(leadIn).toContain('There are 4 questions');
  });

  it('stores no count, so the number can never go stale in the document', () => {
    const worksheet = paper1();
    const element = worksheet.layout.find((item) => item.kind === 'questionCount');

    expect(element).toBeDefined();
    // Wording included: an untouched element stores neither side, so a later correction
    // to the default phrasing reaches documents already saved.
    expect(JSON.stringify(element)).not.toMatch(/\d+ questions/);
    expect(element && 'prefix' in element ? element.prefix : undefined).toBeUndefined();
    expect(element && 'suffix' in element ? element.suffix : undefined).toBeUndefined();
  });

  it('honours retyped wording while keeping the number derived', () => {
    const worksheet = paper1();
    const patched: Worksheet = {
      ...worksheet,
      layout: worksheet.layout.map((element) =>
        element.kind === 'questionCount'
          ? {
              ...element,
              prefix: { en: [{ text: 'This paper contains ' }], zh: [] },
              suffix: { en: [{ text: ' items.' }], zh: [] },
            }
          : element,
      ),
    };

    const line = renderedLines(patched).find((entry) => entry.includes('This paper contains'));
    expect(line).toBe('This paper contains 1 items.');
  });
});

describe('the paper opens and closes the way the reference does', () => {
  it('puts the lead-in first and END OF PAPER last', () => {
    const worksheet = paper1();
    const order = resolveFlow(worksheet).map((item) =>
      item.type === 'layout' ? item.element.kind : 'question',
    );

    expect(order[0]).toBe('questionCount');
    expect(order[order.length - 1]).toBe('text');

    // The seeded question sits between them — appended, it would print below the line
    // that declares the paper finished.
    expect(order).toContain('question');
    expect(order.indexOf('question')).toBeGreaterThan(0);
    expect(order.indexOf('question')).toBeLessThan(order.length - 1);
  });

  it('prints END OF PAPER after the last question', () => {
    const lines = renderedLines(paper1());
    expect(lines[lines.length - 1]).toBe('END OF PAPER');
  });

  it('opens air before the closing line instead of printing it flush', () => {
    /*
     * A closing landmark needs the blank line a heading gets. Without one it printed
     * directly under the last option, reading as a fifth answer rather than the end of
     * the paper — and the same bug put the QAB's "END OF SECTION A" under the last
     * answer line.
     *
     * Measured on the reference (DSE 2021 P1 page 18, 130dpi): the options sit 9px
     * apart and "END OF PAPER" sits 159px below the last of them.
     */
    const rendered = renderWorksheet(paper1(), MODE);
    const closing = rendered.items[rendered.items.length - 1];

    expect(closing.type).toBe('layout');
    const nodes = closing.type === 'layout' ? closing.layout.nodes : [];
    // The air rides on the closing line's own paragraph rather than a spacer above it,
    // so that a page break falling here does not print it under the top margin
    // (§ `withLeadingGap`).
    expect(nodes[0]?.kind).toBe('text');
    const first = nodes[0];
    expect(first?.kind === 'text' && first.format?.spaceBefore).toBe(BLANK_LINE_PT);
  });

  it('carries no section headings', () => {
    // The reference has none: an MCQ paper is one continuous run of questions.
    expect(paper1().layout.filter((element) => element.kind === 'section')).toHaveLength(0);
  });

  it('leaves the rubric to the cover instead of repeating it in the body', () => {
    /*
     * `createWorksheet` seeds "Answer ALL questions." as body instructions, which is
     * right for a worksheet handed out on its own. On a paper with a cover it prints a
     * second time directly under a cover that already says it — Paper 1's instruction 3
     * is "All questions carry equal marks. Answer ALL questions." The cover is the
     * authority, and a duplicate on page 2 reads as a mistake in the paper.
     */
    // Asserted on the model: the instructions print above the flow, so they are not
    // among the walked items.
    for (const type of ['paper1', 'lqMock'] as const) {
      const worksheet = createWorksheetFrom({ documentType: type });
      expect(plain(worksheet.instructions?.en)).toBe('');
      // And the cover does carry the rubric, so nothing was merely lost. Flattened
      // per line, because "ALL" is its own bold run (§ per-run formatting) and the
      // raw JSON has the sentence split across three of them.
      const instructions = (worksheet.cover?.instructions ?? []).map((line) =>
        plain(line.text.en),
      );
      expect(instructions.some((line) => line.includes('Answer ALL'))).toBe(true);
    }

    // The plain worksheet keeps it: nothing else states it there.
    expect(plain(createWorksheetFrom({ documentType: 'classroom' }).instructions?.en)).toBe(
      'Answer ALL questions.',
    );
  });

  it('keeps every layout element reachable through the flow', () => {
    // § the flow invariant: an element missing from the flow loses its position.
    const worksheet = paper1();
    const flowIds = new Set(worksheet.flow.map((entry) => entry.id));
    for (const element of worksheet.layout) expect(flowIds.has(element.id)).toBe(true);
  });
});

describe('the running footer', () => {
  it('prints the paper code left and the page number centred', () => {
    const footer = paper1().footer;

    expect(footer?.enabled).toBe(true);
    const left = footer?.bands[0].zones.left[0];
    const centre = footer?.bands[0].zones.center[0];

    expect(left?.kind).toBe('pageNumber');
    expect(centre?.kind).toBe('pageNumber');
    // "…-ECON 1–" — the paper number is what distinguishes it from the booklet's "2–".
    expect(plain(left && 'prefix' in left ? left.prefix?.en : undefined)).toContain('-ECON 1–');
  });

  it('sets both footer fields small, unlike the booklet', () => {
    // Measured off page 2 of the 2021 paper at 150dpi: both clusters ~13-14px tall,
    // against the booklet's 16px centre number. A Paper 1 is read straight through and
    // answered on a separate sheet, so nothing about it needs flipping to.
    const p1 = paper1().footer?.bands[0].zones;
    const qab = createWorksheetFrom({ documentType: 'lqMock' }).footer?.bands[0].zones;

    expect(p1?.center[0].format?.fontSize).toBe(9);
    expect(qab?.center[0].format?.fontSize).toBe(14);
  });

  it('takes none of the booklet’s other apparatus', () => {
    const worksheet = paper1();

    // No page furniture: nothing is written in an MCQ paper's margins, so there is no
    // frame and no margin note. The 10pt body it *does* share — the two papers of one
    // mock read at one size — and the reference margins, which the P1 reference layout
    // sets to the identical numbers (§ `QAB_MARGINS`).
    expect(worksheet.pageFurniture).toBeUndefined();
    expect(worksheet.baseFontSize).toBe(10);
    expect(worksheet.pageSetup?.margins).toEqual({
      top: 1296,
      right: 1296,
      bottom: 1440,
      left: 1296,
    });
  });
});
