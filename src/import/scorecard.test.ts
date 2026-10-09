/**
 * The scorecard: every synthetic fixture is analysed, built and materialised, then compared
 * with its expected outline. It prints per-fixture accuracy and fails if a category falls
 * below its floor.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyseLines, analysePaste, readAnswerSheet } from '.';
import { FIXTURES, type ExpectedFixture } from './fixtures/expected';
import { DPI, KEY, OCR_PAGE_FIXTURES, schemePages } from './fixtures/ocrPages';
import { scoreAnalysis, type Score } from './fixtures/score';
import { readOcrPages, scaleAt } from './ocrLayout';

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

  // Recognised scans (`docs/design/paste-import.md` § 13): boxes through the OCR adapter
  // and `layoutPdf`, as the desktop app reads them. Text read well must split as a PDF does.
  const ocrRows = OCR_PAGE_FIXTURES.map((fx) => {
    const pages = fx.pages();
    const read = readOcrPages(pages, pages.map(() => scaleAt(DPI)));
    return { name: fx.name, ...scoreAnalysis(analyseLines(read), { kind: 'ok', questions: fx.questions }) };
  });
  const scheme = (() => {
    const pages = schemePages();
    const sheet = readAnswerSheet(readOcrPages(pages, pages.map(() => scaleAt(DPI))));
    const keys = sheet.entries.filter((e) => e.letter !== undefined && !e.part && KEY[e.question - 1] === 'ABCDE'[e.letter]).length;
    const parts = ['1a', '1b', '2a', '2b'].filter((p) => sheet.entries.some((e) => `${e.question}${e.part ?? ''}` === p)).length;
    return { keys, parts, merged: sheet.lines.filter((l) => /→/.test(l.raw) && /\(1\)/.test(l.raw)).length };
  })();

  it('prints the OCR rows', () => {
    const pct = (n: number) => `${Math.round(n * 100)}%`.padStart(5);
    console.log(
      [
        ...ocrRows.map((s) => `${s.name.padEnd(38)} ocr    q ${String(s.got).padStart(2)}/${String(s.expected).padEnd(2)} split ${pct(s.split)}  detail ${pct(s.detail)}${s.failures.length ? `  ✗ ${s.failures.slice(0, 3).join('; ')}` : ''}`),
        `${'ocr pages: key grid + 2 scheme tables'.padEnd(38)} ocr    key ${scheme.keys}/45 (one cell misread)  scheme parts ${scheme.parts}/4  merged lines ${scheme.merged}`,
      ].join('\n'),
    );
  });

  it('keeps recognised pages at the PDF floor', () => {
    for (const row of ocrRows) {
      expect(row.split, `${row.name}: ${row.failures.join('; ')}`).toBeGreaterThanOrEqual(FLOOR.pdf.split);
      expect(row.detail, `${row.name}: ${row.failures.join('; ')}`).toBeGreaterThanOrEqual(FLOOR.pdf.detail);
    }
    expect(scheme).toEqual({ keys: 44, parts: 4, merged: 0 });
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
