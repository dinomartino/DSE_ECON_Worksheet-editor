import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The caret opens where the click landed.
 *
 * A field advertises itself with an I-beam once it is locked, and an I-beam promises the
 * next click chooses a position *between* the characters. The editor used to place the
 * caret at the end of the text unconditionally, so on any field long enough to have a
 * middle the promise was broken: clicking into the first line of a wrapped stem sent the
 * caret to the last one.
 *
 * These need a real DOM (hit-testing is the browser's own), which this suite does not
 * have — so the wiring is asserted on the source, the way `nativeEmphasis.test.ts` does
 * for the emphasis tags. Each rule below was observed to fail in a browser.
 */
describe('the caret opens where the click landed', () => {
  const dom = readFileSync('src/components/preview/richTextDom.ts', 'utf8');
  const editable = readFileSync('src/components/preview/RichTextEditable.tsx', 'utf8');
  const inline = readFileSync('src/components/preview/InlineEditable.tsx', 'utf8');

  it('asks the browser which character a point is nearest', () => {
    expect(dom).toContain('export function offsetAtPoint(');
    // Both spellings: `caretPositionFromPoint` is the standard, `caretRangeFromPoint`
    // WebKit's older equivalent. Supporting only the first loses Safari.
    expect(dom).toContain('caretPositionFromPoint');
    expect(dom).toContain('caretRangeFromPoint');
  });

  it('converts the browser’s answer into the model’s offsets', () => {
    // `offsetOf` is the one translation from a DOM position to a plain-text offset;
    // counting characters here instead would be a second copy free to drift.
    expect(dom).toMatch(/offsetAtPoint[\s\S]*?return offsetOf\(host, container, offset\)/);
  });

  it('ignores a point outside the field', () => {
    // A click in the paragraph's margin hit-tests to a node in *other* text; reporting
    // its offset would drop the caret somewhere the teacher never pointed.
    expect(dom).toMatch(/offsetAtPoint[\s\S]*?if \(!host\.contains\(container\)\) return undefined/);
  });

  it('falls back to the end of the text when there is no point', () => {
    // The keyboard route into editing has no click to honour, and a browser may support
    // neither API. Both keep the behaviour every route had before.
    expect(editable).toContain('aimed ?? richTextLength(runs)');
  });

  it('reads the point once, on entry', () => {
    // In a ref: as a dependency it would re-run the paint effect and move the caret out
    // from under someone mid-edit.
    expect(editable).toContain('caretPointRef');
    expect(editable).toMatch(/useRef\(caretPoint\)/);
  });

  it('captures the point from the click that opens the editor', () => {
    expect(inline).toMatch(/beginEditing\(\{ x: event\.clientX, y: event\.clientY \}\)/);
    expect(inline).toContain('caretPoint={caretPointRef.current}');
  });
});

/**
 * The cursor states what the next click does.
 *
 * Three states, three promises: unselected, the click engages the field (pointer); once
 * locked, the click lands a caret between the characters (I-beam); editing, the field
 * takes a caret (I-beam). A single `cursor-text` everywhere promised a caret the first
 * click never places.
 */
describe('the cursor matches what the click does', () => {
  const inline = readFileSync('src/components/preview/InlineEditable.tsx', 'utf8');

  it('is a pointer until the field is locked, then an I-beam', () => {
    expect(inline).toContain("selected ? 'cursor-text' : 'cursor-pointer'");
  });

  it('is an I-beam in the open editor', () => {
    expect(inline).toMatch(/className=\{`m-0 cursor-text/);
  });

  it('states the caret’s own colour', () => {
    // Left to the browser it is drawn in the text colour, at whatever contrast that
    // happens to have against the field's blue tint.
    expect(inline).toContain('caret-[#0d77c9]');
  });
});

/**
 * The selection box is one rectangle, aligned to the text.
 *
 * The field must stay `inline` (an `inline-block` loses the paragraph's hanging indent
 * and the text jumps on entry), and CSS paints an inline box's background and ring *per
 * line box* — so a wrapped stem drew one ragged, separately-closed box per line. The box
 * is therefore a positioned sibling, not the span's own paint.
 */
describe('the selection box', () => {
  const inline = readFileSync('src/components/preview/InlineEditable.tsx', 'utf8');

  it('is drawn as a positioned sibling spanning the paragraph', () => {
    expect(inline).toContain('pointer-events-none absolute inset-0');
  });

  it('reserves no space and never prints', () => {
    // Chrome on the page: it must not shift the paginator's measurements, and a
    // selection ring on paper would read as part of the worksheet.
    expect(inline).toMatch(/absolute inset-0[\s\S]{0,400}?data-print-hide|data-print-hide[\s\S]{0,400}?absolute inset-0/);
    expect(inline).toContain('pointer-events-none');
  });

  it('starts where the text starts, not at the padding edge', () => {
    // `inset-0` resolves to the *padding* box, and a numbered paragraph carries the list
    // indent as `paddingLeft` with its `1.` hanging inside that gutter — so a box at
    // `left: 0` swallows the number and lines up with nothing.
    expect(inline).toContain('left: boxLeft');
    expect(inline).toContain("getComputedStyle(paragraph).paddingLeft");
  });

  it('lifts the text above the box', () => {
    // A *positioned* box paints above non-positioned in-flow text whatever the DOM
    // order — at `z-index: 0` it covered the words.
    expect(inline).toContain('relative z-10');
  });

  it('sits below the caret, which the paragraph paints', () => {
    // Chromium draws the caret in the layer of its containing *block*, not the inline
    // editable span — so a box at `z-index: 0` left the open editor with focus, a
    // collapsed selection, the right `caret-color`, and no visible caret. The box sits
    // at `-1` instead, and the anchor takes `isolation: isolate` so `-1` cannot fall
    // behind the sheet's opaque background (where an un-isolated `-1` box vanished).
    expect(inline).toMatch(/zIndex: -1/);
    expect(inline).not.toMatch(/zIndex: 0/);
    expect(inline).toContain("anchor.style.isolation = 'isolate'");
    // Restored on the way out — the paragraph is not this component's element, and a
    // stacking context left behind would outlive the selection that justified it.
    expect(inline).toContain('anchor.style.isolation = previous');
  });

  it('keeps the inline paint for a table cell', () => {
    // `fillWidth` makes the cell's field `inline-block` and one line tall, so its own
    // box is already the single rectangle the cell wants.
    expect(inline).toMatch(/fillWidth[\s\S]{0,200}?bg-\[#d9ebf8\] shadow-\[0_0_0_2px_#0d77c9\]/);
  });
});
