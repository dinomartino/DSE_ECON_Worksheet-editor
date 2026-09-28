/**
 * `src/ai/` is plain transport: it reaches nothing else in `src/` (so not the store,
 * `src/model`, `src/settings` or `@/platform`), and no React, zustand or Tauri. The AI
 * settings and status hooks live in `src/settings/aiSettings.ts` instead.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = __dirname;
const FORBIDDEN_PACKAGES = [/^react(-dom)?(\/|$)/, /^zustand(\/|$)/, /^@tauri-apps\//];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

/** Every module specifier: static imports, re-exports, dynamic import() and require(). */
function specifiers(text: string): string[] {
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]/g,
  ];
  return patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((m) => m[1]));
}

function allowed(file: string, spec: string): boolean {
  if (spec.startsWith('.')) return (resolve(dirname(file), spec) + sep).startsWith(DIR + sep);
  if (spec.startsWith('@/')) return spec.startsWith('@/ai/');
  return !FORBIDDEN_PACKAGES.some((pattern) => pattern.test(spec));
}

describe('src/ai imports', () => {
  it('reach nothing outside plain transport', () => {
    const violations = files(DIR).flatMap((file) =>
      specifiers(readFileSync(file, 'utf8'))
        .filter((spec) => !allowed(file, spec))
        .map((spec) => `${relative(DIR, file)}: ${spec}`),
    );
    expect(violations).toEqual([]);
  });

  it('are really read, and a reach outside would be caught', () => {
    const client = join(DIR, 'client.ts');
    expect(specifiers(readFileSync(client, 'utf8'))).toContain('./http');
    expect(allowed(join(DIR, 'adapters', 'gemini.ts'), '../types')).toBe(true);
    for (const spec of ['../model/types', '@/settings/aiSettings', '@/platform', 'react', '@tauri-apps/api/core', 'zustand']) {
      expect(allowed(client, spec), spec).toBe(false);
    }
    expect(allowed(join(DIR, 'adapters', 'gemini.ts'), '../../store/worksheetStore')).toBe(false);
  });
});
