import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * `font-sans` is the interface font (k-0568, user u-0ydl). It named `--font-geist-sans`, a
 * variable nothing defined: `font-family: var(<undefined>)` is invalid at computed-value
 * time, so the element inherits, and chrome drawn inside `.paper` (the ✦ Write draft's
 * header and buttons, the AI-made chip) took the paper's Times New Roman / PMingLiU — a
 * 明體 look in 中文. The browser half of this check is `scripts/ai-ui-font-verify.mjs`
 * (with `scripts/ui-font-kit.mjs` in the polish, AI tagging and import-check scripts).
 * `font-mono` named the equally undefined `--font-geist-mono` until k-0570.
 */

const GLOBALS = readFileSync(new URL('../globals.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const LIGHT = readFileSync(new URL('./light.css', import.meta.url), 'utf8');
const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('the interface font utility (k-0568)', () => {
  it('font-sans is the theme’s --ui-font', () => {
    expect(/--font-sans:\s*var\(--ui-font\)\s*;/.test(GLOBALS)).toBe(true);
  });

  it('font-mono is a real monospace stack: system faces, nothing to load, a generic last (k-0570)', () => {
    const value = GLOBALS.match(/--font-mono:\s*([^;]+);/)?.[1].trim() ?? '';
    expect(value).not.toMatch(/var\(/);
    expect(value).toMatch(/^ui-monospace\b/);
    expect(value).toMatch(/,\s*monospace$/);
  });

  it('every variable a font token reads is defined (an undefined one silently inherits the paper’s face)', () => {
    const defined = new Set([...`${GLOBALS}\n${LIGHT}`.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    const tokens = [...GLOBALS.matchAll(/--font-(?:sans|mono|display):\s*([^;]+);/g)].map((m) => m[1]);
    expect(tokens.length).toBe(3);
    for (const value of tokens) {
      for (const [, name] of value.matchAll(/var\((--[\w-]+)/g)) expect(defined.has(name), `${name} is not defined`).toBe(true);
    }
  });

  it('AI chrome drawn on the paper asks for the interface font', () => {
    expect(source('components/studio/panel/PageDrafts.tsx')).toMatch(/className="[^"]*\bfont-sans\b[^"]*" data-ai-ghost-head/);
    expect(source('components/preview/AiMadeChip.tsx')).toMatch(/\bfont-sans\b/);
  });
});
