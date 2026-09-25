import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHANGELOG_MD } from './changelog.generated';

describe('the bundled changelog', () => {
  it('is an exact copy of CHANGELOG.md — if this fails, run `npm run changelog`', () => {
    const source = readFileSync(path.resolve(__dirname, '../../CHANGELOG.md'), 'utf8');
    expect(CHANGELOG_MD === source, 'src/whatsNew/changelog.generated.ts is stale: run `npm run changelog`').toBe(true);
  });
});
