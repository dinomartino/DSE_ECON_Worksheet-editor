import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEMES } from '@/settings/appearance';

/**
 * The theme contract (`light.css`): one block of primitives per theme, the same variables
 * in every file, nothing that could reach the paper. A theme that misses a variable
 * silently inherits Classic's (a light HUD on a dark theme, say); one that adds a rule
 * could restyle the sheet.
 */

const read = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const GLOBALS = readFileSync(new URL('../globals.css', import.meta.url), 'utf8');
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of a file's single block, as a name → value map. */
function block(css: string): { selector: string; vars: Map<string, string> } {
  const bare = stripComments(css).trim();
  const match = /^([^{}]+)\{([^{}]*)\}$/.exec(bare);
  if (!match) throw new Error('a theme file is exactly one rule');
  const vars = new Map<string, string>();
  for (const declaration of match[2].split(';')) {
    const trimmed = declaration.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(':');
    vars.set(trimmed.slice(0, colon).trim(), trimmed.slice(colon + 1).replace(/\s+/g, ' ').trim());
  }
  return { selector: match[1].replace(/\s+/g, ' ').trim(), vars };
}

const classic = block(read('light.css'));

/** Each outer layer of a box-shadow, with how far above the box it can paint (blur + spread − y). */
function shadowLayers(value: string): { text: string; reachAbove: number }[] {
  return value
    .split(/,(?![^(]*\))/)
    .map((text) => text.trim())
    .filter((text) => text && !text.startsWith('inset'))
    .map((text) => {
      const [, y = 0, blur = 0, spread = 0] = (text.replace(/(rgb|oklch|hsl|color-mix)\([^)]*\)|#[0-9a-f]+/gi, '').match(/-?[\d.]+(?=px|\b)/g) ?? []).map(Number);
      return { text, reachAbove: blur + spread - y };
    });
}
/** Sheets stack 24px apart (`gap-6`, scaled with them); a lift must fade before the next one. */
const SHEET_GAP = 24;
const MAX_REACH = SHEET_GAP - 4;

describe('theme files', () => {
  it('Classic is the root, so a missing or unknown theme looks as it always did', () => {
    expect(classic.selector).toBe(':root, [data-theme="light"]');
  });

  // Each check runs over every registered theme, the theme named in each assertion (k-0611:
  // one describe per theme generated the same five tests seven times).
  const themes = THEMES.map(({ id }) => {
    const css = read(`${id}.css`);
    return { id, css, theme: block(css) };
  });

  it('every theme is imported by globals.css, for the screen only unless it is the default', () => {
    for (const { id } of themes) {
      expect(GLOBALS, id).toContain(`@import "./themes/${id}.css"${id === 'light' ? '' : ' screen'};`);
    }
  });

  it('no theme shadows the sheet above: a later sheet paints its lift over the one before', () => {
    for (const { id, theme } of themes) {
      for (const layer of shadowLayers(theme.vars.get('--sheet-shadow') ?? '')) {
        expect(layer.reachAbove, `${id}: ${layer.text}`).toBeLessThanOrEqual(MAX_REACH);
      }
    }
  });

  it('every theme but Classic is one block on its own data-theme, at html and for a preview subtree', () => {
    for (const { id, theme } of themes.filter((t) => t.id !== 'light')) {
      expect(theme.selector, id).toBe(`:root[data-theme="${id}"], :root [data-theme="${id}"]`);
    }
  });

  it("every theme sets exactly Classic's variables", () => {
    for (const { id, theme } of themes) {
      expect([...theme.vars.keys()].sort(), id).toEqual([...classic.vars.keys()].sort());
    }
  });

  it('every theme sets only custom properties, and loads nothing', () => {
    for (const { id, css, theme } of themes) {
      for (const name of theme.vars.keys()) expect(name, id).toMatch(/^--[a-z0-9-]+$/);
      expect(stripComments(css), id).not.toMatch(/url\(|@import|@font-face|!important|\.paper/);
    }
  });

  it('globals.css imports no theme file that is not registered', () => {
    const imported = [...GLOBALS.matchAll(/@import "\.\/themes\/([a-z-]+)\.css"( screen)?;/g)].map((m) => m[1]);
    expect(imported).toEqual(['tokens', ...THEMES.map((t) => t.id)]);
  });

  it('no theme-specific rule lives outside its file', () => {
    expect(GLOBALS).not.toMatch(/\[data-theme=/);
    expect(stripComments(read('tokens.css'))).not.toMatch(/\[data-theme=/);
  });
});

describe('the paper opts out', () => {
  it("puts the sheet back on Classic's radius and depth scales", () => {
    const tokens = stripComments(read('tokens.css'));
    const paper = /\.paper \{([^{}]*)\}/.exec(tokens);
    expect(paper).not.toBeNull();
    const reset = block(`.paper {${paper![1]}}`).vars;
    const scales = [...classic.vars.keys()].filter((name) => /^--(radius|elev)(-|$)/.test(name));
    expect([...reset.keys()].sort()).toEqual(scales.sort());
    for (const name of scales) expect(reset.get(name)).toBe(classic.vars.get(name));
  });
});
