/**
 * The glossary data must stay a lazy chunk: only `load.ts` reaches it, by dynamic import,
 * and nothing statically imported from `index.ts` pulls the data or the engine in.
 * `scripts/check-web-bundle.mjs` proves the same in the real build.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { loadGlossary } from './load';

const SRC = join(__dirname, '..');
const HERE = __dirname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Static (value) import and re-export specifiers of one file. */
function staticImports(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  for (const node of source.statements) {
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push(node.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push(node.moduleSpecifier.text);
    }
  }
  return out;
}

describe('the glossary loads lazily', () => {
  it('names the data file only in load.ts', () => {
    const naming = sourceFiles(SRC)
      .filter((file) => /edb-economics-2020|glossary\/data\//.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));
    expect(naming).toEqual(['glossary/load.ts']);
  });

  it('load.ts reaches the data and the engine only by dynamic import', () => {
    // The term preferences it reads are settings, which never import the glossary.
    expect(staticImports(join(HERE, 'load.ts'))).toEqual(['@/settings/termPreferences']);
    expect(staticImports(join(SRC, 'settings/termPreferences.ts')).sort()).toEqual(['./store']);
  });

  it('index.ts and useGlossary.ts re-export nothing that imports the data', () => {
    expect(staticImports(join(HERE, 'index.ts')).sort()).toEqual(['./attribution', './load', './types']);
    expect(staticImports(join(HERE, 'useGlossary.ts')).sort()).toEqual([
      './load',
      '@/settings/store',
      '@/settings/termPreferences',
      'react',
    ]);
    expect(staticImports(join(HERE, 'attribution.ts'))).toEqual([]);
  });

  it('imports once and hands every caller the same glossary', async () => {
    const first = loadGlossary();
    expect(loadGlossary()).toBe(first);
    const glossary = await first;
    expect(glossary.entries).toHaveLength(1350);
    expect(glossary.meta).toEqual({
      source: 'An English-Chinese Glossary of Terms Commonly Used in the Teaching of Economics in Secondary Schools',
      publisher: 'Curriculum Development Institute, Education Bureau, HKSAR',
      year: 2020,
      entries: 1350,
    });
    expect(await loadGlossary()).toBe(glossary);
  });

  it('does not cache a failed load: the next caller tries again', async () => {
    vi.resetModules();
    let calls = 0;
    vi.doMock('./glossary', async (importOriginal) => {
      const real = await importOriginal<typeof import('./glossary')>();
      return {
        createGlossary: (...args: Parameters<typeof real.createGlossary>) => {
          if (++calls === 1) throw new Error('chunk failed');
          return real.createGlossary(...args);
        },
      };
    });
    try {
      const fresh = await import('./load');
      await expect(fresh.loadGlossary()).rejects.toThrow('chunk failed');
      const glossary = await fresh.loadGlossary();
      expect(glossary.entries).toHaveLength(1350);
      expect(calls).toBe(2);
    } finally {
      vi.doUnmock('./glossary');
      vi.resetModules();
    }
  });
});
