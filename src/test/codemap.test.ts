import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The docs under `docs/` are a map of the code, and a map rots silently. This parses
 * every backticked repo-relative path out of them and fails naming each one that no
 * longer exists, plus each `path:symbol` whose identifier is no longer in that file.
 *
 * Line numbers are deliberately never cited in those docs — they rot faster than paths.
 */

const ROOT = path.resolve(__dirname, '../..');

const DOCS = [
  'docs/CODEMAP.md',
  'docs/RECIPES.md',
  'docs/GLOSSARY.md',
  'docs/STATUS.md',
  'docs/IDEAS.md',
  'docs/Diagram_Requirements/COVERAGE.md',
];

/** A backticked token that starts with one of the repo's top-level directories. */
const REF = /`((?:src|scripts|docs|\.github|src-tauri)\/[^`\s]+)`/g;

/** A glob (`scripts/*.test.ts`) or a placeholder (`src/registry/<type>.ts`) names no one file. */
const PATTERN = /[*<>?]/;

/** Identifiers only: a `path:Symbol` reference, not a path with a stray colon. */
const SYMBOL = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

interface Ref {
  doc: string;
  raw: string;
  file: string;
  symbol?: string;
}

function collect(): Ref[] {
  const refs: Ref[] = [];
  for (const doc of DOCS) {
    const full = path.join(ROOT, doc);
    if (!existsSync(full)) throw new Error(`Missing doc: ${doc}`);
    const text = readFileSync(full, 'utf8');
    for (const match of text.matchAll(REF)) {
      const raw = match[1];
      if (PATTERN.test(raw)) continue;
      const colon = raw.indexOf(':');
      if (colon === -1) {
        refs.push({ doc, raw, file: raw });
        continue;
      }
      const file = raw.slice(0, colon);
      const symbol = raw.slice(colon + 1);
      if (SYMBOL.test(symbol)) refs.push({ doc, raw, file, symbol });
      else refs.push({ doc, raw, file: raw });
    }
  }
  return refs;
}

const refs = collect();

describe('the docs map the code that is actually here', () => {
  it('cites at least one path per doc', () => {
    for (const doc of DOCS) {
      expect(refs.filter((r) => r.doc === doc).length, `${doc} cites no paths`).toBeGreaterThan(0);
    }
  });

  it('every cited path exists', () => {
    const missing = refs
      .filter((ref) => !existsSync(path.join(ROOT, ref.file)))
      .map((ref) => `${ref.doc}: ${ref.raw} → no such file ${ref.file}`);
    expect(missing).toEqual([]);
  });

  it('every cited symbol is in its file', () => {
    const cache = new Map<string, string>();
    const missing: string[] = [];
    for (const ref of refs) {
      if (!ref.symbol) continue;
      const full = path.join(ROOT, ref.file);
      if (!existsSync(full)) continue; // already reported above
      let source = cache.get(full);
      if (source === undefined) {
        source = readFileSync(full, 'utf8');
        cache.set(full, source);
      }
      const found = new RegExp(`\\b${ref.symbol}\\b`).test(source);
      if (!found) missing.push(`${ref.doc}: ${ref.raw} → ${ref.symbol} not found in ${ref.file}`);
    }
    expect(missing).toEqual([]);
  });
});
