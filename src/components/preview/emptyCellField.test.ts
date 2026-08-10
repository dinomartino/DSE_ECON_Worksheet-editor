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

/** The idle field's fill rule, as written (a template literal over `isEmpty`). */
const FILL_RULE = INLINE_EDITABLE.match(
  /fillWidth && \(isEmpty \|\| selected\)\s*\n?\s*\? `([^`]*)`/,
)?.[1];

describe('the empty-cell field', () => {
  it('takes width from its cell, never height', () => {
    expect(FILL_RULE).toBeDefined();

    // Width, so the whole cell is the target.
    expect(FILL_RULE).toContain('w-full');
    // `inline-block` is what lets width apply at all — a plain inline span ignores it.
    expect(FILL_RULE).toContain('inline-block');

    /*
     * No height, in any spelling. The box must stay one line tall or the row measures
     * taller than it prints, which is the bug the short prompt was introduced to fix.
     */
    expect(FILL_RULE).not.toMatch(/\bh-\d/);
    expect(FILL_RULE).not.toMatch(/\bmin-h-/);
    expect(FILL_RULE).not.toMatch(/\bpy-\d/);
    // A bare `block` (as opposed to `inline-block`) would take the line to itself.
    expect(FILL_RULE?.split(/[\s`${}]+/)).not.toContain('block');
  });

  /**
   * `text-left` is the *empty prompt's* rule, and only its own.
   *
   * A figure column is `text-align: right`, and a `·` hugging that edge reads as
   * content rather than as an empty field — so the prompt ranges left. But a cell that
   * has text must keep the alignment it prints with: ranging the *selected* state left
   * too made a centred cell jump left on the first click and jump back on the second,
   * when the editing branch (which never carried the class) took over. The alignment
   * appeared to come and go with the engagement.
   */
  it('ranges the empty prompt left, and leaves a filled cell its own alignment', () => {
    expect(FILL_RULE).toContain('text-left');
    // Conditioned on `isEmpty`, never applied to the selected state flatly.
    expect(FILL_RULE).toMatch(/isEmpty \? ' text-left' : ''/);
  });

  /**
   * A selected or open cell is painted across the whole cell, not around its words.
   *
   * Hugging the text drew the state as a ragged box floating inside a much larger cell
   * (92px of highlight in a 190px cell), which reads as a selected *phrase* rather than
   * a selected *cell* — and leaves most of what the teacher clicked unpainted. The cell
   * is the unit the sidebar names and that align and merge act on.
   *
   * Width only, in every state: the paginator measures these boxes, so a reserved
   * height would make the row measure taller than it prints.
   */
  it('fills the cell when selected, and when open for editing', () => {
    const idle = FILL_RULE;
    expect(idle).toContain('w-full');
    expect(idle).toContain('inline-block');

    // The open editor matches the locked box it grew out of, so entry shifts nothing.
    const open = INLINE_EDITABLE.match(
      /fillWidth\s*\n?\s*\? '(inline-block w-full[^']*)'/,
    )?.[1];
    expect(open).toBeDefined();
    expect(open).toContain('w-full');
    expect(open).toContain('inline-block');

    // Neither state may reserve height, in any spelling.
    for (const rule of [idle, open]) {
      expect(rule).not.toMatch(/\bh-\d/);
      expect(rule).not.toMatch(/\bmin-h-/);
      expect(rule).not.toMatch(/\bpy-\d/);
      expect(rule?.split(' ')).not.toContain('block');
    }
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
