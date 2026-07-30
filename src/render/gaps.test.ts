import { describe, expect, it } from 'vitest';
import { blankLine, endsInBlankLine, pushGap, type RenderNode } from './ir';
import { renderWorksheet } from './worksheet';
import { createWorksheet } from '@/model/factories';
import { bi, rt } from '@/model/text';
import type { LayoutElement, StructuredQuestion, Worksheet } from '@/model/types';

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
});
