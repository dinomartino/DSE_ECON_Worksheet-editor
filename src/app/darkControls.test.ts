import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** jsdom paints no native controls, so the rule itself is the guard. */
const GLOBALS = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');

describe('native ticks and radios in a dark theme', () => {
  it('follow a dark theme in the chrome, never on the paper', () => {
    expect(GLOBALS).toMatch(
      /:root\[data-scheme="dark"\] input:is\(\[type="checkbox"\], \[type="radio"\]\):not\(\.paper \*\) \{\s*color-scheme: dark;\s*\}/,
    );
  });
});
