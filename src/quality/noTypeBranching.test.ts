import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('src/quality', () => {
  it('never branches on a question type: questions reach it only through `qualityView`', () => {
    const files = readdirSync('src/quality').filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== 'testKit.ts');
    const sources = [...files.map((name) => `src/quality/${name}`), 'src/assist/verbs/quality.ts'];
    for (const path of sources) {
      const source = readFileSync(path, 'utf8');
      expect(source, `${path} must not branch on 'mcq'`).not.toMatch(/['"]mcq['"]/);
      expect(source, `${path} must not branch on 'structured'`).not.toMatch(/['"]structured['"]/);
    }
  });
});
