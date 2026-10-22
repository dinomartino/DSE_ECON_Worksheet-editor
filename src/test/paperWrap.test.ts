import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Layout is not testable in this node environment, so this pins the rule itself: the A4
 * sheet (`.paper`, also what the page thumbnails render) wraps a long unbroken string at
 * the text column. Without it a string with no spaces ran past the page edge in the
 * editor while the .docx wrapped it.
 */
describe('.paper wraps long unbroken text', () => {
  it('sets overflow-wrap: break-word on the sheet', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');
    const block = css.match(/^\.paper \{[^}]*\}/m)?.[0] ?? '';
    expect(block).toMatch(/overflow-wrap:\s*break-word/);
  });
});
