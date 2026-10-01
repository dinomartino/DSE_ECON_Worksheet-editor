import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { registeredCatalogues, type Catalogue, type MessageEntry } from './catalogue';
import { wordingProblems } from './wording';

/**
 * The guard over every interface catalogue in `src/`: each `messages.ts` or
 * `*.messages.ts` is imported here, so a new one is checked without registering it.
 */

const SRC = path.resolve(__dirname, '..');
const CONVENTION = /(^|\.)messages\.ts$/;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const files = walk(SRC);
const catalogueFiles = files.filter((f) => CONVENTION.test(path.basename(f)));
const rel = (f: string) => path.relative(SRC, f);

/** Argument lists tried in turn: a function entry passes when one works on both sides. */
const SAMPLES: ((n: number) => unknown[])[] = [
  (n) => Array.from({ length: n }, () => 'Sample'),
  (n) => Array.from({ length: n }, () => 2),
  (n) => Array.from({ length: n }, () => 1),
  (n) => Array.from({ length: n }, () => true),
  (n) => Array.from({ length: n }, () => false),
];

type Rendered = { en: string; zh: string }[];

function render(entry: MessageEntry): Rendered | string {
  if (typeof entry.en === 'string' && typeof entry.zh === 'string') return [{ en: entry.en, zh: entry.zh }];
  if (typeof entry.en !== 'function' || typeof entry.zh !== 'function') return 'en and zh are not the same kind';
  const out: Rendered = [];
  for (const sample of SAMPLES) {
    const args = sample(Math.max(entry.en.length, entry.zh.length));
    let en: unknown;
    try {
      en = entry.en(...args);
    } catch {
      continue;
    }
    if (typeof en !== 'string') continue;
    let zh: unknown;
    try {
      zh = entry.zh(...args);
    } catch (error) {
      return `zh throws where en does not: ${String(error)}`;
    }
    if (typeof zh !== 'string') return 'zh returns no string where en does';
    out.push({ en, zh });
  }
  return out.length > 0 ? out : 'not callable with any sample arguments';
}

function problems(entry: MessageEntry): string[] {
  const rendered = render(entry);
  if (typeof rendered === 'string') return [rendered];
  return [...new Set(rendered.flatMap(({ en, zh }) => wordingProblems(en, zh)))];
}

const byFile = new Map<string, Catalogue[]>();
for (const file of catalogueFiles) {
  const before = registeredCatalogues().length;
  await import(/* @vite-ignore */ file);
  byFile.set(rel(file), registeredCatalogues().slice(before));
}

describe('interface catalogues', () => {
  it('are found', () => {
    expect(catalogueFiles.length).toBeGreaterThan(0);
  });

  it('are defined only in messages.ts or *.messages.ts, and each such file defines one', () => {
    const misplaced = files.filter(
      (f) =>
        !CONVENTION.test(path.basename(f)) &&
        !/\.test\.tsx?$/.test(f) &&
        rel(f) !== path.join('i18n', 'catalogue.ts') &&
        /\bdefineMessages\(/.test(readFileSync(f, 'utf8')),
    );
    expect(misplaced.map(rel)).toEqual([]);
    const empty = [...byFile].filter(([, list]) => list.length === 0).map(([file]) => file);
    expect(empty).toEqual([]);
  });

  for (const [file, list] of byFile) {
    it(`${file}: every entry has Hong Kong Chinese that keeps the English terms`, () => {
      const found: string[] = [];
      for (const catalogue of list) {
        for (const [key, entry] of Object.entries(catalogue)) {
          for (const problem of problems(entry)) found.push(`${key}: ${problem}`);
        }
      }
      expect(found).toEqual([]);
    });
  }
});

describe('the guard itself', () => {
  it('catches each kind of mistake', () => {
    expect(problems({ en: 'Save', zh: ' ' })).toContain('empty zh');
    expect(problems({ en: 'Download PNG', zh: '下載圖片' })).toContain('"PNG" must stay in English in zh');
    expect(problems({ en: 'Saved in this browser', zh: '儲存在這個瀏覽器' })).toEqual([]);
    expect(problems({ en: 'Press Enter to save', zh: '按 Enter 儲存' })).toEqual([]);
    expect(problems({ en: 'Enter the address', zh: '輸入位址' })).toEqual([]);
    expect(problems({ en: 'Margins 2 cm', zh: '邊界 2 厘米' })).toContain('"cm" must stay in English in zh');
    expect(problems({ en: '4.2 × 3.3 in', zh: '4.2 × 3.3' })).toContain('"in" must stay in English in zh');
    expect(problems({ en: 'Move 2 in your list', zh: '移動清單中的 2 項' })).toEqual([]);
    expect(problems({ en: 'Settings', zh: '设置' })[0]).toMatch(/Simplified/);
    expect(problems({ en: 'Software', zh: '軟體' })).toContain('Taiwan wording 軟體');
    expect(problems({ en: 'Done.', zh: '完成.' })[0]).toMatch(/half-width/);
    expect(problems({ en: (n: number) => `${n}`, zh: () => { throw new Error('x'); } })[0]).toMatch(/zh throws/);
  });
});
