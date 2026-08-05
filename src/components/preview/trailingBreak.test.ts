import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Two line boxes HTML silently drops and Word prints — both invisible to a render
 * test because jsdom does not lay out lines.
 *
 * 1. The line after a block's final `<br>`: a trailing hard break is counted *as* the
 *    stem→options gap (`pushGap`), and the .docx prints its empty line, so the preview
 *    must materialize it with a filler `<br>` or the gap exists only on paper — and the
 *    paginator measures one line short of Word.
 * 2. An empty contenteditable generates no line box at all, so an option being edited
 *    over empty text collapsed to zero height and the next option drew over it. A
 *    zero-width space in a pseudo-element keeps the line open without entering the DOM
 *    `readRuns` walks.
 */
const PREVIEW = readFileSync(new URL('./Preview.tsx', import.meta.url), 'utf8');
const RICH_TEXT_EDITABLE = readFileSync(
  new URL('./RichTextEditable.tsx', import.meta.url),
  'utf8',
);
const GLOBALS = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');

describe('a trailing hard break', () => {
  it('renders the blank line the .docx prints, via a filler <br>', () => {
    expect(PREVIEW).toContain('{trailingBreakFiller && <br aria-hidden />}');
    // Counted from the model, and only where the marks twin does not already hold the
    // final line open — a marks paragraph with a filler would gain a line Word lacks.
    expect(PREVIEW).toMatch(/node\.marks === undefined && trailingBlankLines\(tailRuns\) > 0/);
  });
});

describe('an empty editing field', () => {
  it('keeps one line box open through a pseudo-element, not DOM content', () => {
    expect(RICH_TEXT_EDITABLE).toContain('rich-text-editable ');
    // `:empty::after` with a zero-width space: not a child node, so `readRuns` cannot
    // read it back into the model as phantom text.
    expect(GLOBALS).toMatch(/\.rich-text-editable:empty::after\s*\{\s*content: '\\200b';/);
  });
});
