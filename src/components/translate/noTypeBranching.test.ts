import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The same guard as `registry.test.ts`, over the translate entry points and the AI door's
 *  verbs and bar: they read slots and jobs, never a question type. */
describe('translate and the AI door', () => {
  it('never branch on a question type', () => {
    const dirs = ['src/components/translate', 'src/components/ai', 'src/assist', 'src/assist/verbs'];
    const files = dirs.flatMap((dir) =>
      readdirSync(dir)
        .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
        .map((name) => join(dir, name)),
    );
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} must not branch on 'mcq'`).not.toMatch(/['"]mcq['"]/);
      expect(source, `${file} must not branch on 'structured'`).not.toMatch(/['"]structured['"]/);
    }
  });
});
