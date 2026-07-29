import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * "(4 marks)" trails the **last** line of a part, as a real paper prints it.
 *
 * The `.docx` has always done this: it appends a `w:tab` run after the text against a
 * right-aligned stop at the content edge, so the marks flow to the end of the paragraph
 * and land on whichever line that turns out to be.
 *
 * The preview disagreed. Its marks span was emitted *before* the text and floated right,
 * and a float is placed when the line box it sits in is built — so it always attached to
 * the **first** line, and worse, it shortened that line, wrapping the stem earlier than
 * Word does. A one-line part looked fine, which is why this survived: it only shows on a
 * part long enough to wrap, and then it disagrees with the export about both the marks'
 * position and where the text breaks.
 *
 * This is asserted on the source because the placement is a property of the *rendered*
 * layout — jsdom does not lay text out, so a DOM test here would pass either way.
 */
describe('marks trail the last line', () => {
  const source = readFileSync('src/components/preview/Preview.tsx', 'utf8');

  it('emits the marks after the text, not before it', () => {
    const marks = source.indexOf('marksLabel(node.marks, language)');
    const text = source.indexOf('richNodes(node.text, language, node.edit, ctx)');
    expect(marks).toBeGreaterThan(-1);
    expect(text).toBeGreaterThan(-1);
    // Order in the JSX is the whole fix: coming last is what makes the final line box
    // the only one the float can attach to.
    expect(marks).toBeGreaterThan(text);
  });

  it('keeps the label whole rather than letting it break', () => {
    // A float that wraps would split "(4" from "marks)" across two lines.
    expect(source).toMatch(/float-right whitespace-nowrap/);
  });

  it('still uses a right tab stop in the .docx, which already behaved', () => {
    const body = readFileSync('src/export/docx/body.ts', 'utf8');
    // The tab run comes after the text runs, which is what carries the marks to the end
    // of the paragraph; `tabRight` puts the stop at the content edge.
    expect(body).toMatch(/runs \+= '<w:r><w:tab\/><\/w:r>' \+ marksRuns/);
    expect(body).toContain('tabRight: node.marks !== undefined');
  });
});
