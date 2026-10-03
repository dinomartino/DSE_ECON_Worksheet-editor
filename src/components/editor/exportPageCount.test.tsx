import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createWorksheet } from '@/model/factories';
import { checkPaper } from '@/model/paperHealth';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import type { OutputMode } from '@/model/types';
import { ExportDialog, type ExportCheckChoice } from './ExportDialog';
import { ExportPaperCheck, paginatesAlike } from './ExportPaperCheck';
import { summaryLine } from './PaperHealthPanel';

/** The Export dialog's paper check describes the edition chosen there, pages included. */

describe("the export check's page count", () => {
  it('is told the edition the dialog will write', () => {
    const seen: ExportCheckChoice[] = [];
    renderToStaticMarkup(
      <ExportDialog
        worksheet={createWorksheet()}
        mode={{ language: 'zh', version: 'teacher' }}
        onClose={() => {}}
        onExported={() => {}}
        checks={(choice) => {
          seen.push(choice);
          return null;
        }}
      />,
    );
    expect(seen.at(-1)).toEqual({ mode: { language: 'zh', version: 'teacher' }, paper: true });
  });

  it('reuses the page count only for an edition that paginates alike', () => {
    const shown: OutputMode = { language: 'bilingual', version: 'student' };
    expect(paginatesAlike({ ...shown, variant: 'A' }, shown)).toBe(true);
    expect(paginatesAlike({ ...shown, language: 'en' }, shown)).toBe(false);
    expect(paginatesAlike({ ...shown, omitAnswerSpace: true }, shown)).toBe(false);
    expect(paginatesAlike({ ...shown, variant: 'B' }, shown)).toBe(false);

    const worksheet = buildAcceptanceWorksheet();
    const check = (mode: OutputMode) =>
      renderToStaticMarkup(
        <ExportPaperCheck worksheet={worksheet} shown={shown} bodySheets={4} choice={{ mode, paper: true }} />,
      );
    expect(check(shown)).toMatch(/4 pages/);
    // Another language: not the page's count, and a probe is mounted to measure it.
    const english = check({ ...shown, language: 'en' });
    expect(english).not.toMatch(/\d pages?/);
    expect(english).toContain('data-print-hide');
    expect(english).not.toContain('id="print-root"');
  });

  it('ends the summary line', () => {
    const report = checkPaper(buildAcceptanceWorksheet());
    expect(summaryLine(report, 'en', 3)).toMatch(/ · 3 pages$/);
    expect(summaryLine(report, 'zh-HK', 1)).toMatch(/ · 1 頁$/);
    expect(summaryLine(report, 'en')).not.toMatch(/page/);
  });
});
