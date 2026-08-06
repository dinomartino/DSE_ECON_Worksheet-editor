import { describe, expect, it } from 'vitest';
import { BLANK_LINE_PT, blankLine, endsInBlankLine, pushGap, type RenderNode } from './ir';
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

  /**
   * The boundary gap above an item, in blank lines.
   *
   * A gap *between* two top-level items rides on the item's own first paragraph as
   * `spaceBefore`, rather than as leading blank-line spacers, so that it vanishes when
   * the boundary falls on a page break (§ `withLeadingGap` in `ir.ts`). Word drops
   * `w:before` at the top of a page by itself; an empty paragraph would print there.
   *
   * Spacers still separate items *inside* a question, where a page break cannot fall.
   */
  const gapAbove = (nodes: RenderNode[]): number => {
    const first = nodes[0];
    if (!first) return 0;
    const pt =
      first.kind === 'text'
        ? first.format?.spaceBefore
        : first.kind === 'columns'
          ? first.spaceBefore
          : undefined;
    return pt === undefined ? 0 : pt / BLANK_LINE_PT;
  };

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

    /** The heading's own nodes, and the boundary gap standing above them. */
    const firstNodes = (w: Worksheet) => {
      const first = renderWorksheet(w, { language: 'en', version: 'student' }).items[0];
      return first.type === 'layout' ? first.layout.nodes : [];
    };
    const firstGap = (w: Worksheet) => gapAbove(firstNodes(w));

    it('gets its blank line when a title prints above the flow', () => {
      // Flow index 0 is not the top of the page: the title renders above it.
      const w = withSection({ title: bi('Paper', '') });
      expect(firstGap(w)).toBe(1);
      // The gap is spacing on the heading itself, not a spacer paragraph above it, so
      // it dies at a page top (§ `withLeadingGap`).
      expect(firstNodes(w).map((n) => n.kind)).toEqual(['text']);
    });

    it('gets it when instructions print above the flow', () => {
      expect(firstGap(withSection({ instructions: bi('Answer ALL', '') }))).toBe(1);
    });

    it('goes without at the true top of a bare page, where a gap is only top margin', () => {
      expect(firstGap(withSection({}))).toBe(0);
      expect(firstNodes(withSection({})).map((n) => n.kind)).toEqual(['text']);
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

    /**
     * The boundary's actual width above question 2, in blank lines.
     *
     * A boundary gap rides on the item's own first paragraph as `spaceBefore`, not as
     * leading spacers, so that it dies at the top of a sheet (§ `withLeadingGap`) —
     * hence reading the spacing rather than counting nodes.
     */
    const leadingGap = (w: Worksheet): number =>
      gapAbove(renderWorksheet(w, { language: 'en', version: 'student' }).questions[1].nodes);

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
      const leading = (w: Worksheet) =>
        gapAbove(renderWorksheet(w, { language: 'en', version: 'student' }).questions[0].nodes);
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
      expect(gapAbove(rendered.questions[0].nodes)).toBe(2);
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
      expect(gapAbove(nodes)).toBe(1);
    });

    it('honours the document’s own examGapLines over the type’s', () => {
      // A teacher tightening or widening the paper stores one number on the document
      // (§ `Worksheet.examGapLines`); the type's 3 is only the default beneath it.
      expect(leadingGap({ ...twoQuestions(paper1()), examGapLines: 5 } as Worksheet)).toBe(5);
      expect(leadingGap({ ...twoQuestions(paper1()), examGapLines: 2 } as Worksheet)).toBe(2);
      expect(leadingGap({ ...twoQuestions(paper1()), examGapLines: 1 } as Worksheet)).toBe(1);
    });

    it('ignores the override off the exam paper, where the wide boundary does not exist', () => {
      expect(
        leadingGap({ ...twoQuestions(createWorksheet()), examGapLines: 5 } as Worksheet),
      ).toBe(1);
    });

    it('lets one question state its own gap, over both the paper and the type', () => {
      // The nearest statement wins (§ `Question.gapBefore`): this boundary's own
      // number beats the document's, which beats the type's measured 3.
      const perQuestion = (gapBefore: number, examGapLines?: number) =>
        leadingGap({
          ...twoQuestions(paper1(), [mcq('q1'), { ...mcq('q2'), gapBefore }]),
          ...(examGapLines !== undefined ? { examGapLines } : {}),
        } as Worksheet);
      expect(perQuestion(5)).toBe(5);
      expect(perQuestion(1)).toBe(1);
      expect(perQuestion(2, 6)).toBe(2);
    });

    it('ignores a question’s own gap off the exam paper too', () => {
      expect(
        leadingGap(twoQuestions(createWorksheet(), [mcq('q1'), { ...mcq('q2'), gapBefore: 5 }])),
      ).toBe(1);
    });

    it('reports the adjustable boundary to the preview, and only there', () => {
      // `adjustableGap` is what the on-page drag handle mounts on: present exactly
      // where `boundaryGapLines` would read a stored number.
      const rendered = renderWorksheet(twoQuestions(paper1()), {
        language: 'en',
        version: 'student',
      });
      expect(rendered.questions[0].adjustableGap).toBeUndefined(); // nothing above it
      expect(rendered.questions[1].adjustableGap).toBe(3);

      const classroom = renderWorksheet(twoQuestions(createWorksheet()), {
        language: 'en',
        version: 'student',
      });
      expect(classroom.questions[1].adjustableGap).toBeUndefined();
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

    /*
     * The preview's paginator never splits an item, so a question that does not fit
     * moves whole to the next sheet — and without Word being told the same, the .docx
     * broke the page inside the question and every page from there on disagreed with
     * the screen. `keepQuestionWhole` spells the rule in Word's own vocabulary.
     */
    describe('and the question is kept whole in Word', () => {
      it('chains keepNext through every node but the last, with keepLines on text rows', () => {
        const rendered = renderWorksheet(twoQuestions(paper1()), {
          language: 'en',
          version: 'student',
        });
        const nodes = rendered.questions[0].nodes;
        nodes.forEach((node, index) => {
          if (index < nodes.length - 1) {
            expect(node, `node ${index} must keep with the next`).toMatchObject({
              keepNext: true,
            });
          }
          if (node.kind === 'text' || node.kind === 'columns') {
            expect(node.keepLines, `node ${index} must keep its own lines`).toBe(true);
          }
        });
        // The last node stays free, or the chain would glue this question to the next.
        expect(nodes[nodes.length - 1]).not.toMatchObject({ keepNext: true });
      });

      it('puts the boundary gap where the page may break, with nothing to break inside', () => {
        /*
         * The boundary between two questions is where Word is allowed to break — and
         * the gap belongs to that boundary, so it must not survive the break.
         *
         * Carrying it as `spaceBefore` on question 2's own first paragraph is what
         * guarantees that: Word discards `w:before` at the top of a page, so a question
         * opening a sheet starts flush against the top margin, exactly as the preview
         * draws it. Loose spacer paragraphs could not — Word would break *between* them
         * and strand one or two blank lines at the top of the new page, a different
         * number on every boundary.
         */
        const rendered = renderWorksheet(twoQuestions(paper1()), {
          language: 'en',
          version: 'student',
        });
        const nodes = rendered.questions[1].nodes;
        expect(gapAbove(nodes)).toBe(3);
        // Nothing precedes the paragraph that carries the gap, so the break has no
        // interior to land in.
        expect(nodes[0].kind).toBe('text');
      });

      it('leaves a classroom worksheet free to split, byte-identically', () => {
        const rendered = renderWorksheet(twoQuestions(createWorksheet()), {
          language: 'en',
          version: 'student',
        });
        for (const question of rendered.questions) {
          for (const node of question.nodes) {
            expect('keepLines' in node && node.keepLines).toBeFalsy();
          }
        }
      });
    });
  });

  /*
   * A boundary gap dies at the top of a sheet.
   *
   * The air belongs to the *boundary* between two items, so once that boundary falls on
   * a page break there is nothing left to separate and the gap is only a shifted top
   * margin — on Paper 1's three-line boundary it reads as a missing question, which is
   * the bug this exists to prevent.
   *
   * Neither backend can be told where the pages fall from here: the preview measures
   * them in the browser, and Word decides its own. So the rule is carried by the *form*
   * the gap takes rather than by a decision made at render time — `w:before`, which
   * Word drops at a page top by itself, and which the preview drops with a rule keyed
   * on the same flag. These tests pin the form; the preview's half is verified in the
   * browser (§ *Verifying work*).
   */
  describe('a boundary gap is carried in the one form that dies at a page top', () => {
    const paper1 = () => createWorksheetFrom({ documentType: 'paper1', seedSample: false });
    const mcq = (id: string): McqQuestion => ({
      id,
      type: 'mcq',
      blocks: [{ id: `${id}-b`, kind: 'paragraph', text: { en: rt(`stem ${id}`), zh: [] } }],
      options: [
        { id: `${id}-o1`, text: { en: rt('one'), zh: [] } },
        { id: `${id}-o2`, text: { en: rt('two'), zh: [] } },
      ],
      answerIndex: 0,
      marks: 1,
    });

    const render = (base: Worksheet) => {
      const questions = [mcq('q1'), mcq('q2')];
      return renderWorksheet(
        {
          ...base,
          questions,
          layout: [],
          flow: questions.map((q) => ({ type: 'question' as const, id: q.id })),
        } as Worksheet,
        { language: 'en', version: 'student' },
      );
    };

    it('spells the gap as spacing on the item, never as spacers above it', () => {
      // A spacer paragraph occupies its line wherever it lands, so it would print at
      // the top of the new sheet — and Word, free to break between loose spacers, would
      // strand a different number of them on every boundary.
      const nodes = render(paper1()).questions[1].nodes;
      expect(nodes[0].kind).toBe('text');
      expect(gapAbove(nodes)).toBe(3);
    });

    it('marks it as a boundary, so authored spacing is not dropped with it', () => {
      // The preview keys its suppression on this flag rather than on the presence of
      // `spaceBefore`. Spacing a teacher set is theirs and must survive a page top.
      const first = render(paper1()).questions[1].nodes[0];
      expect(first.kind === 'text' && first.boundaryGap).toBe(true);
    });

    it('carries no flag where there is no gap, so nothing is dropped at the true top', () => {
      const bare = {
        ...paper1(),
        bands: [],
        title: { en: [], zh: [] },
        instructions: { en: [], zh: [] },
      } as Worksheet;
      const first = render(bare).questions[0].nodes[0];
      expect(first.kind === 'text' && first.format?.spaceBefore).toBeUndefined();
      expect(first.kind === 'text' && first.boundaryGap).toBeUndefined();
    });

    it('applies to every shape, since a gap at a page top is always only a margin', () => {
      // Not scoped to Paper 1: a classroom worksheet's single leading line is the same
      // thing one line wide.
      const nodes = render(createWorksheet()).questions[1].nodes;
      expect(gapAbove(nodes)).toBe(1);
      expect(nodes[0].kind === 'text' && nodes[0].boundaryGap).toBe(true);
    });
  });
});
