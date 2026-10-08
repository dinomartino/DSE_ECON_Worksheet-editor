/**
 * The scorecard: every synthetic fixture is analysed, built and materialised, then compared
 * with its expected outline. It prints per-fixture accuracy and fails if a category falls
 * below its floor.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analysePaste } from '.';
import { FIXTURES, type ExpectedFixture } from './fixtures/expected';
import { scoreAnalysis, type Score } from './fixtures/score';

const FLOOR: Record<ExpectedFixture['category'], { split: number; detail: number }> = {
  word: { split: 0.95, detail: 0.95 },
  pdf: { split: 0.85, detail: 0.85 },
  ocr: { split: 0.5, detail: 0.5 },
  empty: { split: 1, detail: 1 },
};

type Row = Score & ExpectedFixture;

function run(fx: ExpectedFixture): Row {
  const source = readFileSync(`src/import/fixtures/${fx.file}`, 'utf8');
  const analysis = fx.file.endsWith('.html') ? analysePaste({ html: source }) : analysePaste({ plain: source });
  return { ...fx, ...scoreAnalysis(analysis, fx) };
}

describe('paste import scorecard', () => {
  const rows = FIXTURES.map(run);

  it('prints the scorecard', () => {
    const pct = (n: number) => `${Math.round(n * 100)}%`.padStart(5);
    const lines = rows.map((s) => `${s.file.padEnd(38)} ${s.category.padEnd(6)} q ${String(s.got).padStart(2)}/${String(s.expected).padEnd(2)} split ${pct(s.split)}  detail ${pct(s.detail)}${s.failures.length ? `  ✗ ${s.failures.slice(0, 3).join('; ')}` : ''}`);
    console.log(['paste import scorecard', ...lines].join('\n'));
    expect(rows.length).toBeGreaterThanOrEqual(12);
  });

  for (const category of Object.keys(FLOOR) as Array<ExpectedFixture['category']>) {
    it(`keeps every ${category} fixture above its floor`, () => {
      for (const row of rows.filter((r) => r.category === category)) {
        expect(row.failures.filter((f) => f.startsWith('kind')), `${row.file} must read as ${row.kind}`).toEqual([]);
        expect(row.split, `${row.file}: ${row.failures.join('; ')}`).toBeGreaterThanOrEqual(FLOOR[category].split);
        expect(row.detail, `${row.file}: ${row.failures.join('; ')}`).toBeGreaterThanOrEqual(FLOOR[category].detail);
      }
    });
  }
});
