import { describe, expect, it } from 'vitest';
import { blankLine, endsInBlankLine, pushGap, type RenderNode } from './ir';
import { renderWorksheet } from './worksheet';
import { createWorksheet } from '@/model/factories';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { bi, rt } from '@/model/text';
import type { LayoutElement, McqQuestion, StructuredQuestion, Worksheet } from '@/model/types';

/**
 * Every gap on the page is exactly one spent line, however the text was typed.
 *
 * With the document on a fixed 12pt line and no paragraph spacing anywhere, separation
 * costs a blank line — so a gap has to *count what is already there*. Text ending in a
 * trailing hard break (Shift+Enter) prints its own blank line, and a separator pushed
 * blindly after it opened a double gap: a part typed with a trailing break sat twice as
 * far from the next part as its neighbours, for a reason invisible in the document.
 *
 * The break still prints; it counts as the gap rather than adding to one.
 */
describe('a gap counts what is already there', () => {
  const text = (s: string): RenderNode => ({
    kind: 'text',
    style: 'Body',
    text: { en: rt(s), zh: [] },
  });

  describe('endsInBlankLine', () => {
    it('is false for an empty stream, which has no boundary yet', () => {
      expect(endsInBlankLine([])).toBe(false);
    });

    it('sees an explicit blank line', () => {
      expect(endsInBlankLine([text('a'), blankLine()])).toBe(true);
    });

    it('sees a trailing hard break, which spends the same line', () => {
      expect(endsInBlankLine([text('a\n')])).toBe(true);
    });

    it('is false for ordinary text', () => {
      expect(endsInBlankLine([text('a')])).toBe(false);
    });

    it('ignores a break in the middle, which is content', () => {
      expect(endsInBlankLine([text('a\nb')])).toBe(false);
    });

    it('counts a trailing break on either language side', () => {
      // The IR is language-neutral: one IR feeds all three backends, so the gap cannot
      // be decided per language without the preview and the .docx disagreeing about the
      // document's height — and the paginator measures these boxes.
      const zhOnly: RenderNode = { kind: 'text', style: 'Body', text: { en: rt('a'), zh: rt('b\n') } };
      expect(endsInBlankLine([zhOnly])).toBe(true);
    });

    it('is false after a node that spends no line of its own', () => {
      expect(endsInBlankLine([{ kind: 'pageBreak' }])).toBe(false);
    });
  });

  describe('pushGap', () => {
    it('adds a line when the boundary has none', () => {
      const nodes = [text('a')];
      pushGap(nodes);
      expect(nodes.map((n) => n.kind)).toEqual(['text', 'spacer']);
    });

    it('adds nothing when a trailing break already spent one', () => {
      const nodes = [text('a\n')];
      pushGap(nodes);
      expect(nodes.map((n) => n.kind)).toEqual(['text']);
    });

    it('never doubles an explicit blank line', () => {
      const nodes = [text('a'), blankLine()];
      pushGap(nodes);
      expect(nodes.map((n) => n.kind)).toEqual(['text', 'spacer']);
    });
  });

  describe('in a rendered structured question', () => {
    const build = (aText: string): Worksheet => {
      const question: StructuredQuestion = {
        id: 'q1',
        type: 'structured',
        blocks: [{ id: 'b0', kind: 'paragraph', text: bi('Stem', '') }],
        parts: [
          { id: 'pa', blocks: [{ id: 'ba', kind: 'paragraph', text: { en: rt(aText), zh: [] } }], marks: 3 },
          { id: 'pb', blocks: [{ id: 'bb', kind: 'paragraph', text: bi('part b', '') }], marks: 4 },
        ],
      };
      return {
        ...createWorksheet(),
        questions: [question],
        layout: [],
        flow: [{ type: 'question', id: 'q1' }],
      } as Worksheet;
    };

    /*
     * From the stem onward, so the assertion is about the *part boundaries* rather than
     * the leading item gap — the default worksheet carries a title, which prints above
     * the flow and correctly earns question 1 a gap of its own.
     */
    const kinds = (w: Worksheet) => {
      const nodes = renderWorksheet(w, { language: 'en', version: 'student' }).questions[0].nodes;
      const stem = nodes.findIndex((n) => n.kind === 'text');
      return nodes.slice(stem).map((n) => n.kind);
    };

    it('separates parts by exactly one line when the text ends normally', () => {
      // stem, gap, (a), gap, (b)
      expect(kinds(build('part a'))).toEqual(['text', 'spacer', 'text', 'spacer', 'text']);
    });

    it('does not double the gap when part (a) ends in a trailing break', () => {
      // The trailing break is inside (a)'s own text node and prints there, so (b) still
      // sits exactly one line below it — the separator is the one that gives way.
      expect(kinds(build('part a\n'))).toEqual(['text', 'spacer', 'text', 'text']);
    });
  });

  describe('a heading below a title', () => {
    const section: LayoutElement = {
      id: 's1',
      kind: 'section',
      text: bi('Section A', ''),
      restartNumbering: false,
    };
    const withSection = (extra: Partial<Worksheet>): Worksheet =>
      ({
        ...createWorksheet(),
        questions: [],
        layout: [section],
        flow: [{ type: 'layout', id: 's1' }],
        bands: [],
        title: { en: [], zh: [] },
        instructions: { en: [], zh: [] },
        ...extra,
      }) as Worksheet;

    const firstKinds = (w: Worksheet) => {
      const first = renderWorksheet(w, { language: 'en', version: 'student' }).items[0];
      return first.type === 'layout' ? first.layout.nodes.map((n) => n.kind) : [];
    };

    it('gets its blank line when a title prints above the flow', () => {
      // Flow index 0 is not the top of the page: the title renders above it.
      expect(firstKinds(withSection({ title: bi('Paper', '') }))).toEqual(['spacer', 'text']);
    });

    it('gets it when instructions print above the flow', () => {
      expect(firstKinds(withSection({ instructions: bi('Answer ALL', '') }))).toEqual([
        'spacer',
        'text',
      ]);
    });

    it('goes without at the true top of a bare page, where a gap is only top margin', () => {
      expect(firstKinds(withSection({}))).toEqual(['text']);
    });
  });

  /*
   * An exam paper spaces its questions wider than a worksheet does.
   *
   * Measured off the reference (DSE 2021 P1): consecutive MCQs sit three empty
   * paragraphs apart, while a stem sits one line from its own options — the boundary
   * between two self-contained questions has to read as a stronger break than the
   * boundary inside one.
   *
   * The number lives on the type definition (`examGapLines`) and the walker only asks
   * for it, because `render/worksheet.ts` may not name a concrete type id
   * (`registry.test.ts` greps it). The scope is what these tests pin.
   */
  describe('the wide boundary between two MCQs on a Paper 1', () => {
    const mcq = (id: string): McqQuestion => ({
      id,
      type: 'mcq',
      blocks: [{ id: `${id}-b`, kind: 'paragraph', text: { en: rt(`stem ${id}`), zh: [] } }],
      options: [
        { id: `${id}-o1`, text: { en: rt('one'), zh: [] } },
        { id: `${id}-o2`, text: { en: rt('two'), zh: [] } },
        { id: `${id}-o3`, text: { en: rt('three'), zh: [] } },
        { id: `${id}-o4`, text: { en: rt('four'), zh: [] } },
      ],
      answerIndex: 0,
      marks: 1,
    });

    /** Two MCQs in a document of the given shape, with nothing else in the flow. */
    const twoQuestions = (
      base: Worksheet,
      questions: Worksheet['questions'] = [mcq('q1'), mcq('q2')],
    ): Worksheet =>
      ({
        ...base,
        questions,
        layout: [],
        flow: questions.map((q) => ({ type: 'question' as const, id: q.id })),
      }) as Worksheet;

    /** The leading spacers on question 2 — the boundary's actual width. */
    const leadingGap = (w: Worksheet): number => {
      const nodes = renderWorksheet(w, { language: 'en', version: 'student' }).questions[1].nodes;
      return nodes.findIndex((n) => n.kind !== 'spacer');
    };

    // A real Paper 1 from the wizard, so the shape is genuinely derived from the cover
    // rather than asserted — a hand-built document must space identically (§ derived,
    // never stored).
    const paper1 = () => createWorksheetFrom({ documentType: 'paper1', seedSample: false });

    it('spends three blank lines, not one', () => {
      expect(leadingGap(twoQuestions(paper1()))).toBe(3);
    });

    it('leaves a classroom worksheet holding the same questions at one', () => {
      // Its questions are answered on the sheet itself; it is not the reference paper,
      // and widening it would re-paginate documents teachers already have.
      expect(leadingGap(twoQuestions(createWorksheet()))).toBe(1);
    });

    it('counts a trailing break towards the three, as every other gap does', () => {
      // The break prints its own line, so the boundary owes two more — not three on top
      // of it. One rule, whatever the text happens to end in.
      const first = mcq('q1');
      const ended: McqQuestion = {
        ...first,
        options: first.options.map((option, i) =>
          i === 3 ? { ...option, text: { en: rt('four\n'), zh: [] } } : option,
        ),
      };
      expect(leadingGap(twoQuestions(paper1(), [ended, mcq('q2')]))).toBe(2);
    });

    it('never widens the first question, which has no question before it', () => {
      // These two documents differ only in what precedes question 1: nothing at all
      // (the true top of the page, which owes no gap) versus a title above the flow
      // (one line, the ordinary boundary). Neither is ever the wide one — three lines
      // of air under the top margin would read as a missing question.
      const leading = (w: Worksheet) => {
        const nodes = renderWorksheet(w, { language: 'en', version: 'student' }).questions[0].nodes;
        return nodes.findIndex((n) => n.kind !== 'spacer');
      };
      expect(leading(twoQuestions(paper1()))).toBe(0);
      expect(leading({ ...twoQuestions(paper1()), title: bi('Paper 1', '') } as Worksheet)).toBe(1);
    });

    /*
     * The lead-in is rubric addressed to the candidate before they start, not a caption
     * on question 1 — so it stands off by two lines: more than the one that separates
     * ordinary neighbours, less than the three between two whole questions, since it
     * still belongs to the run it introduces.
     */
    it('gives the lead-in two lines above question 1, not one and not three', () => {
      // The wizard's own Paper 1, so the seeded lead-in element is the real one.
      const base = createWorksheetFrom({ documentType: 'paper1', seedSample: false });
      const leadIn = base.layout.find((el) => el.kind === 'questionCount');
      expect(leadIn, 'a Paper 1 seeds a questionCount lead-in').toBeDefined();

      const questions = [mcq('q1'), mcq('q2')];
      const w = {
        ...base,
        questions,
        layout: [leadIn!],
        flow: [
          { type: 'layout' as const, id: leadIn!.id },
          ...questions.map((q) => ({ type: 'question' as const, id: q.id })),
        ],
      } as Worksheet;

      const rendered = renderWorksheet(w, { language: 'en', version: 'student' });
      const lead = rendered.questions[0].nodes.findIndex((n) => n.kind !== 'spacer');
      expect(lead).toBe(2);
      // …and the question boundary behind it is still the wide one, unaffected.
      expect(leadingGap(w)).toBe(3);
    });

    it('leaves every other layout element at its ordinary single gap', () => {
      // "END OF PAPER" three lines under the last option would read as detached from the
      // paper rather than as the end of it; a heading owns its own leading gap already.
      const note: LayoutElement = { id: 'n1', kind: 'text', text: bi('Note', '') };
      const questions = [mcq('q1')];
      const w = {
        ...createWorksheetFrom({ documentType: 'paper1', seedSample: false }),
        questions,
        layout: [note],
        flow: [
          { type: 'layout' as const, id: 'n1' },
          { type: 'question' as const, id: 'q1' },
        ],
      } as Worksheet;
      const nodes = renderWorksheet(w, { language: 'en', version: 'student' }).questions[0].nodes;
      expect(nodes.findIndex((n) => n.kind !== 'spacer')).toBe(1);
    });

    it('does not widen a boundary against an unlike question', () => {
      const structured: StructuredQuestion = {
        id: 'q2',
        type: 'structured',
        blocks: [{ id: 'sb', kind: 'paragraph', text: bi('Stem', '') }],
        parts: [{ id: 'sp', blocks: [{ id: 'spb', kind: 'paragraph', text: bi('a', '') }], marks: 2 }],
      };
      expect(leadingGap(twoQuestions(paper1(), [mcq('q1'), structured]))).toBe(1);
    });
  });
});
