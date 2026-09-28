import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('src/translate', () => {
  it('never branches on a question type: text reaches it only through the walker', () => {
    const files = readdirSync('src/translate').filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(5);
    for (const name of files) {
      const source = readFileSync(`src/translate/${name}`, 'utf8');
      expect(source, `${name} must not branch on 'mcq'`).not.toMatch(/['"]mcq['"]/);
      expect(source, `${name} must not branch on 'structured'`).not.toMatch(/['"]structured['"]/);
    }
  });
});
