import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { bandFieldSegments } from '@/model/bandSegments';
import { createTotalMarksField, createFillInField } from '@/model/bands';
import { createPageNumberField } from '@/model/page';
import { plain } from '@/model/text';

/**
 * The affordance for adding wording must not print.
 *
 * Every side of a band field is editable, so an *empty* side still has to be clickable —
 * it renders a `+` inviting the teacher to write one. A `pageNumber` ships with no
 * wording at all, so both its sides are empty and both draw that `+`.
 *
 * That is chrome, and chrome on the sheet reaches the PDF: `window.print()` runs over the
 * real sheets, so anything not marked `data-print-hide` prints. Before it was marked, a
 * bare `+` appeared beside every page number on the printed page and in print preview.
 *
 * `data-empty-placeholder` is deliberately *not* the mechanism, and this is the reason:
 * it hides the prompt with `visibility: hidden`, keeping the box so a stem does not
 * reflow. Correct for a field that is a whole paragraph; wrong for one that is a fragment
 * of a phrase, where a reserved box opens a gap inside "Full marks: 45 marks".
 */
describe('empty-side affordance is chrome, not content', () => {
  it('marks an empty computed side print-hidden rather than merely placeholder-hidden', () => {
    const source = readFileSync('src/components/preview/BandEditor.tsx', 'utf8');
    // The prop is passed, and it is conditioned on the side being empty — a blanket
    // `printHidden` would drop a teacher's real wording from the printed page.
    expect(source).toMatch(/printHidden=\{/);
    expect(source).toContain("field.kind !== 'text'");

    const editable = readFileSync('src/components/preview/InlineEditable.tsx', 'utf8');
    // It has to reach `data-print-hide`, which is what the print rules key on; the
    // component owning the attribute is what stops the two drifting apart.
    expect(editable).toMatch(/data-print-hide=\{printHidden && isEmpty/);
  });

  it('a page number really does have two empty sides to hide', () => {
    // The premise of the rule above. If a page number ever shipped with wording, this
    // test failing is the signal that the `+` no longer appears and the guard is moot.
    const segments = bandFieldSegments(createPageNumberField('plain'), { totalMarks: 0 });
    const authored = segments.filter((segment) => segment.kind === 'text');
    expect(authored).toHaveLength(2);
    expect(authored.every((segment) => plain(segment.text.en) === '')).toBe(true);
  });

  it('a field that ships with wording is not hidden', () => {
    // The other direction: "Full marks: " and " marks" are content and must print.
    const segments = bandFieldSegments(createTotalMarksField(), { totalMarks: 24 });
    const authored = segments.filter((segment) => segment.kind === 'text');
    expect(authored.map((segment) => plain(segment.text.en))).toEqual([
      'Full marks: ',
      ' marks',
    ]);

    // A fill-in carries a label but no trailing wording, so exactly one side is empty.
    const fill = bandFieldSegments(
      createFillInField({ en: [{ text: 'Name:' }], zh: [] }, 10),
      { totalMarks: 0 },
    ).filter((segment) => segment.kind === 'text');
    expect(plain(fill[0].text.en)).toBe('Name:');
    expect(plain(fill[1].text.en)).toBe('');
  });

  it('keeps the spacing the wording carries, which HTML would collapse', () => {
    /*
     * "Full marks: " ends in a space and " marks" opens with one; they are separate DOM
     * nodes now, and HTML collapses whitespace at an inline boundary. Both band paths
     * therefore set `whitespace-pre-wrap` — without it the page read "Full marks:45marks"
     * while the .docx (which writes `xml:space="preserve"`) spaced it correctly: a
     * preview that lies about the document.
     */
    for (const path of [
      'src/components/preview/BandEditor.tsx',
      'src/components/preview/Preview.tsx',
    ]) {
      expect(readFileSync(path, 'utf8')).toContain('whitespace-pre-wrap');
    }
  });
});
