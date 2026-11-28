import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * One guard over a list of directories (k-0611, audit k-0604 §15): no module in them names a
 * concrete question type (`'mcq'`, `'structured'`); types reach them only through the registry,
 * the model, the walker or the hooks named in each row. Before, one copy of this scan lived in
 * each directory's own `noTypeBranching.test.ts` (and `src/answers` in `answers.test.ts`). Each
 * row keeps the file set that copy scanned and the "enough files were found" floor it asserted.
 * The same guard over a fixed file list is in `src/registry/registry.test.ts`, and the import
 * one (every file but `build.ts`) in `src/import/solve.test.ts`.
 */
interface Scan {
  /** The directories read, each by its own listing. */
  dirs: string[];
  /** Which files of those directories are modules (not tests, not kit files). */
  isModule: (name: string) => boolean;
  /** Files outside the directories that carry the same rule. */
  extra?: string[];
  /** The listing must hold more than this many files, so an emptied listing cannot pass. */
  floor?: number;
  why: string;
}

const SCANS: Scan[] = [
  {
    dirs: ['src/quality'],
    isModule: (name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== 'testKit.ts',
    extra: ['src/assist/verbs/quality.ts'],
    why: 'questions reach it only through `qualityView`',
  },
  {
    dirs: ['src/translate'],
    isModule: (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
    floor: 5,
    why: 'text reaches it only through the walker',
  },
  {
    // The same guard as `registry.test.ts`, over the translate entry points and the AI door's
    // verbs and bar: they read slots and jobs, never a question type.
    dirs: ['src/components/translate', 'src/components/ai', 'src/assist', 'src/assist/verbs'],
    isModule: (name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name),
    floor: 10,
    why: 'the translate entry points and the AI door read slots and jobs',
  },
  {
    dirs: ['src/library'],
    isModule: (name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name),
    floor: 5,
    why: 'types reach it only through the registry and model',
  },
  {
    dirs: ['src/answers'],
    isModule: (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
    extra: ['src/model/answerLeaves.ts', 'src/assist/verbs/writeAnswers.ts'],
    floor: 5,
    why: 'leaves reach it only through the registry hook',
  },
];

describe('the shared directories never branch on a question type', () => {
  it.each(SCANS.map((scan) => [scan.dirs.join(' + '), scan] as const))('%s: never branches on a question type', (dir, scan) => {
    const files = scan.dirs.flatMap((d) =>
      readdirSync(d)
        .filter(scan.isModule)
        .map((name) => join(d, name)),
    );
    if (scan.floor !== undefined) expect(files.length, `${dir} must list more than ${scan.floor} files`).toBeGreaterThan(scan.floor);
    for (const path of [...files, ...(scan.extra ?? [])]) {
      const source = readFileSync(path, 'utf8');
      expect(source, `${path} must not branch on 'mcq' (${scan.why})`).not.toMatch(/['"]mcq['"]/);
      expect(source, `${path} must not branch on 'structured' (${scan.why})`).not.toMatch(/['"]structured['"]/);
    }
  });
});
