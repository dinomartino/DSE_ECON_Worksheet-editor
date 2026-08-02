import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Native Cmd+B / Cmd+I / Cmd+U inside a contenteditable.
 *
 * These are the browser's own editing commands: it wraps the selection in a `<b>`, `<i>`
 * or `<u>` **inside** the run span, without touching `data-run-attrs`. `readRuns` reads a
 * run's attributes from its `[data-run]` element, so the emphasis was thrown away the
 * moment the field lost focus — the shortcut appeared to work and then silently undid
 * itself, while the toolbar (which writes the model directly) survived.
 *
 * `readRuns` needs a real DOM, which this suite does not have, so the wiring is asserted
 * on the source in the manner `listIndent.test.ts` uses for the list geometry. The
 * failure it guards is invisible in unit terms and only shows up in a browser.
 */
describe('native emphasis from a keyboard shortcut', () => {
  const source = readFileSync('src/components/preview/richTextDom.ts', 'utf8');

  it('reads the tags the browser inserts between the text and its run', () => {
    expect(source).toContain('function nativeEmphasis(');
    // Every tag a browser produces for the three shortcuts, including the semantic
    // spellings Chrome and Safari differ on (`<b>` vs `<strong>`, `<i>` vs `<em>`).
    for (const tag of ["'B'", "'STRONG'", "'I'", "'EM'", "'U'"]) {
      expect(source).toContain(`case ${tag}:`);
    }
  });

  it('adds to the run’s own attributes rather than replacing them', () => {
    // A keystroke inside an already-14pt phrase means "bold as well", never "bold
    // instead" — so the stored attributes have to spread first.
    expect(source).toContain('{ ...base, ...nativeEmphasis(node, owner) }');
  });

  it('walks up to the run element, so two shortcuts both survive', () => {
    // `<b><i>text</i></b>` is what pressing both produces; inspecting only the immediate
    // parent would see the `<i>` and lose the `<b>`.
    expect(source).toMatch(/while \(current && current !== owner\)/);
  });
});
