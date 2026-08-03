import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * An empty table cell has to look like a field you can type in.
 *
 * The chain of failures this pins, each of which shipped:
 *
 * 1. The long prompt ("Double-click to add English") wrapped to four lines in a figure
 *    column and pushed the row to nearly double its printed height — and the paginator
 *    measures these boxes, so the preview and Word disagreed about the height of any
 *    table holding an empty cell.
 * 2. Shortening it to `·` fixed the height and left a few pixels of hit target that read
 *    as blank paper: nothing said the cell was editable.
 * 3. So the empty field fills the cell's **width** — turning the dashed rule into a
 *    visible "write here" and making the whole cell the target — while staying exactly
 *    one line tall.
 *
 * Asserted against the source because the failure is a missing class, and both
 * directions are invisible to a render test: a reserved *height* looks fine on screen
 * and breaks pagination, while a missing width looks fine to the paginator and leaves
 * the cell unclickable.
 */
const INLINE_EDITABLE = readFileSync(
  new URL('./InlineEditable.tsx', import.meta.url),
  'utf8',
);
const PREVIEW = readFileSync(new URL('./Preview.tsx', import.meta.url), 'utf8');

describe('the empty-cell field', () => {
  it('takes width from its cell, never height', () => {
    const rule = INLINE_EDITABLE.match(/fillWidth && isEmpty \? '([^']*)'/)?.[1];
    expect(rule).toBeDefined();

    // Width, so the whole cell is the target.
    expect(rule).toContain('w-full');
    // `inline-block` is what lets width apply at all — a plain inline span ignores it.
    expect(rule).toContain('inline-block');

    /*
     * No height, in any spelling. The box must stay one line tall or the row measures
     * taller than it prints, which is the bug the short prompt was introduced to fix.
     */
    expect(rule).not.toMatch(/\bh-\d/);
    expect(rule).not.toMatch(/\bmin-h-/);
    expect(rule).not.toMatch(/\bpy-\d/);
    // A bare `block` (as opposed to `inline-block`) would take the line to itself.
    expect(rule?.split(' ')).not.toContain('block');
  });

  it('ranges its prompt left, whatever the cell aligns to', () => {
    // A figure column is `text-align: right`, and a prompt hugging the right edge reads
    // as content rather than as an empty field.
    const rule = INLINE_EDITABLE.match(/fillWidth && isEmpty \? '([^']*)'/)?.[1];
    expect(rule).toContain('text-left');
  });

  it('is marked as an author prompt, so it never prints', () => {
    // The tint and the rule are authoring chrome. `data-empty-placeholder` is what the
    // print stylesheet hides — by `visibility`, which keeps the box so nothing reflows
    // between preview and print.
    expect(INLINE_EDITABLE).toContain("data-empty-placeholder={isEmpty ? 'true' : undefined}");
  });

  it('only table cells opt in', () => {
    // A stem or a heading has the width of the text column, so the long prompt fits and
    // is more useful. `compactPlaceholder` is passed at the cell call site and drives
    // both the short prompt and the fill.
    expect(PREVIEW).toContain('fillWidth={compactPlaceholder}');
    expect(PREVIEW).toMatch(/compactPlaceholder \? "·"/);
  });
});
