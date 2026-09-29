import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('src/library', () => {
  it('never branches on a question type: types reach it only through the registry and model', () => {
    const files = readdirSync('src/library').filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name));
    expect(files.length).toBeGreaterThan(5);
    for (const name of files) {
      const source = readFileSync(`src/library/${name}`, 'utf8');
      expect(source, `${name} must not branch on 'mcq'`).not.toMatch(/['"]mcq['"]/);
      expect(source, `${name} must not branch on 'structured'`).not.toMatch(/['"]structured['"]/);
    }
  });
});
