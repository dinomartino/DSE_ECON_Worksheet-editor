import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SIMPLIFIED_PAIRS, simplifiedChars, toTraditional } from './simplified';

const HAN = /[㐀-鿿豈-﫿]/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    const source = /\.(ts|tsx|json)$/.test(name) && !/\.test\.tsx?$/.test(name);
    // The pair table itself is the one file allowed to hold the keys.
    return source && !path.endsWith(join('translate', 'simplified.ts')) ? [path] : [];
  });
}

describe('SIMPLIFIED_PAIRS', () => {
  it('is a real map: about 250 pairs, every key distinct from every value', () => {
    expect(SIMPLIFIED_PAIRS.size).toBeGreaterThan(240);
    const values = new Set(SIMPLIFIED_PAIRS.values());
    for (const [s, t] of SIMPLIFIED_PAIRS) {
      expect(s).not.toBe(t);
      expect(values.has(s), `${s} is also a Traditional value`).toBe(false);
    }
  });

  it('never matches a character the glossary, the app or the corpus uses', () => {
    // Test files are excluded: diagramShift.test.ts uses 供给 as Simplified test data.
    const used = new Set<string>();
    for (const path of [...sourceFiles('src'), 'src/test/fixtures.ts', 'src/test/corpus/v1-published.json']) {
      for (const ch of readFileSync(path, 'utf8').match(HAN) ?? []) used.add(ch);
    }
    // The bundled glossary (P-GLOSS) joins the guard once it is in the tree.
    const glossary = 'src/glossary/data/edb-economics-2020.json';
    if (existsSync(glossary)) for (const ch of readFileSync(glossary, 'utf8').match(HAN) ?? []) used.add(ch);
    const hits = [...SIMPLIFIED_PAIRS.keys()].filter((ch) => used.has(ch));
    expect(hits).toEqual([]);
  });

  it('finds and converts', () => {
    expect(simplifiedChars('这个价格这')).toEqual(['这', '个', '价']);
    expect(toTraditional('这个价格会上升')).toBe('這個價格會上升');
    expect(simplifiedChars('供應減少，價格上升')).toEqual([]);
  });
});
