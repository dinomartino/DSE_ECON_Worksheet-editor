import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The same guard as `registry.test.ts`, over this directory: the dialog reads slots and
 *  jobs, never a question type, so a new type needs no edit here. */
describe('src/components/translate', () => {
  it('never branches on a question type', () => {
    const dir = 'src/components/translate';
    const files = readdirSync(dir).filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name));
    expect(files.length).toBeGreaterThan(5);
    for (const name of files) {
      const source = readFileSync(join(dir, name), 'utf8');
      expect(source, `${name} must not branch on 'mcq'`).not.toMatch(/['"]mcq['"]/);
      expect(source, `${name} must not branch on 'structured'`).not.toMatch(/['"]structured['"]/);
    }
  });
});
