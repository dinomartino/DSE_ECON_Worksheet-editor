import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { bi, marksAnchorRuns, rt, trailingBlankLines } from '@/model/text';
import { renderNodeXml } from '@/export/docx/body';
import type { RenderNode } from '@/render/ir';
import { DEFAULT_FONTS } from '@/model/factories';

/**
 * "(4 marks)" sits at the right-hand end of the **last line that has text**.
 *
 * The `.docx` places it with a right tab stop: a `w:tab` run after the text against a
 * stop at the content edge, so the marks flow to the end of the paragraph and land on
 * whichever line that turns out to be. A tab stop reserves nothing on the other lines, so
 * the body text wraps exactly as it would with no marks at all.
 *
 * The preview has been wrong three times, and only the third cause is testable here:
 *
 * 1. The span was emitted *before* the text and floated right, so it attached to the
 *    **first** line and shortened it, wrapping the stem earlier than Word does.
 * 2. Emitted after the text it still floated: a float is placed on the first line with
 *    *room*, so when the last line was too full it dropped down, and being out of flow it
 *    did not grow the paragraph — the marks overprinted the next one.
 * 3. With the label pinned to the paragraph's bottom, a text ending in a hard line break
 *    put the marks on the **empty** final line, reading as though they sat below the part.
 *
 * Causes 1 and 2 are pure layout — jsdom does not lay text out, so they are verified in a
 * real browser rather than here (see the `MarksTrail` comment for what the preview does).
 * Cause 3 is arithmetic over the model, shared by both backends, so it *is* testable: the
 * count of trailing blank lines and the exporter's placement are asserted directly.
 */
describe('marks sit on the last line with text', () => {
  describe('trailingBlankLines', () => {
    it('counts a single trailing hard break', () => {
      expect(trailingBlankLines(rt('a\nb\n'))).toBe(1);
    });

    it('counts several, so the label clears all of them', () => {
      expect(trailingBlankLines(rt('a\n\n\n'))).toBe(3);
    });

    it('ignores blank lines in the middle, which are content', () => {
      expect(trailingBlankLines(rt('a\n\nb'))).toBe(0);
    });

    it('treats a whitespace-only last line as blank', () => {
      // A line holding one space is not a line with text on it either.
      expect(trailingBlankLines(rt('a\n   '))).toBe(1);
    });

    it('is zero for text with no break at all, and for empty text', () => {
      expect(trailingBlankLines(rt('no break'))).toBe(0);
      expect(trailingBlankLines([])).toBe(0);
      expect(trailingBlankLines(undefined)).toBe(0);
    });

    it('counts across runs, since they form one continuous line sequence', () => {
      // A break ending one run with text starting the next is *not* trailing.
      expect(trailingBlankLines([{ text: 'a\n' }, { text: 'b' }])).toBe(0);
      expect(trailingBlankLines([{ text: 'a' }, { text: '\n' }])).toBe(1);
    });

    it('never counts the only line, so empty text has no blank line to clear', () => {
      expect(trailingBlankLines(rt(''))).toBe(0);
    });
  });

  describe('marksAnchorRuns', () => {
    const text = bi('english', 'chinese');

    it('takes the side being shown in a single-language mode', () => {
      expect(marksAnchorRuns(text, 'en')).toBe(text.en);
      expect(marksAnchorRuns(text, 'zh')).toBe(text.zh);
    });

    it('takes Chinese in bilingual mode, which renders last in the paragraph', () => {
      expect(marksAnchorRuns(text, 'bilingual')).toBe(text.zh);
    });

    it('falls back to English when there is no Chinese to anchor against', () => {
      // Otherwise a part with no translation counts zero blank lines while the page
      // plainly shows the English ones.
      const enOnly = { en: rt('english\n'), zh: [] };
      expect(marksAnchorRuns(enOnly, 'bilingual')).toBe(enOnly.en);
    });
  });

  describe('the .docx puts the label before the trailing breaks', () => {
    const xmlFor = (text: string) => {
      const node: RenderNode = {
        kind: 'text',
        style: 'Sub-question',
        text: bi(text, ''),
        marks: 3,
      };
      return renderNodeXml(node, {
        fonts: DEFAULT_FONTS,
        language: 'en',
        contentWidth: 9026,
        numIds: new Map(),
        imageRelId: () => undefined,
        nextDrawingId: () => 1,
      });
    };

    it('keeps the marks after the text when nothing trails it', () => {
      const xml = xmlFor('one line');
      expect(xml.indexOf('one line')).toBeLessThan(xml.indexOf('<w:tab/>'));
    });

    it('moves a trailing break after the marks, so they share the last text line', () => {
      const xml = xmlFor('a\nb\n');
      // The tab+marks must come before the final <w:br/>, or Word lands the label on the
      // empty line the break opened.
      expect(xml.indexOf('<w:tab/>')).toBeLessThan(xml.lastIndexOf('<w:br/>'));
      // The blank line still prints: the break is moved, never dropped.
      expect(xml.match(/<w:br\/>/g)).toHaveLength(2);
    });

    it('clears several trailing breaks at once', () => {
      const xml = xmlFor('a\n\n\n');
      expect(xml.indexOf('<w:tab/>')).toBeLessThan(xml.lastIndexOf('<w:br/>'));
      expect(xml.match(/<w:br\/>/g)).toHaveLength(3);
    });

    it('leaves a mid-text blank line alone', () => {
      const xml = xmlFor('a\n\nb');
      // Nothing trails 'b', so the marks stay at the very end.
      expect(xml.lastIndexOf('<w:br/>')).toBeLessThan(xml.indexOf('<w:tab/>'));
    });

    it('still declares the right tab stop that positions the label', () => {
      expect(xmlFor('a\nb\n')).toContain('<w:tab w:val="right"');
    });
  });

  it('the preview pins the label rather than floating it', () => {
    // The one source assertion worth keeping: a float reintroduces cause 2, which no
    // jsdom test can catch. Scoped to the component so unrelated CSS cannot satisfy it.
    const source = readFileSync('src/components/preview/Preview.tsx', 'utf8');
    const trail = source.slice(source.indexOf('function MarksTrail'));
    // To the closing brace at column 0 — the destructured parameter list contains its own
    // `\n}`, so the first one is not the end of the function.
    const body = trail.slice(0, trail.indexOf('\n}\n'));
    expect(body).toContain('absolute right-0');
    expect(body).not.toContain('float-right');
    // Lifted by the shared count, so the page and the .docx agree on the line.
    expect(body).toContain('blankLines');
  });
});
