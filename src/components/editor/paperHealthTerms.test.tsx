import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { terminologyFinding } from '@/components/translate/copy';
import { buildAcceptanceWorksheet } from '@/test/fixtures';

// The real check plus the terminology finding it emits once the glossary has loaded.
vi.mock('@/model/paperHealth', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/model/paperHealth')>();
  return {
    ...real,
    checkPaper: (...args: Parameters<typeof real.checkPaper>) => {
      const report = real.checkPaper(...args);
      const finding = { id: 'terminology' as const, severity: 'warn' as const, message: terminologyFinding(2) };
      return { ...report, findings: [...report.findings, finding] };
    },
  };
});

const { PaperHealthPanel } = await import('./PaperHealthPanel');

describe('PaperHealthPanel terminology finding', () => {
  it('links to Review terms… only when a handler is given (never read-only)', () => {
    const worksheet = buildAcceptanceWorksheet();
    const noop = () => {};
    const editable = renderToStaticMarkup(
      <PaperHealthPanel worksheet={worksheet} language="bilingual" onTranslate={noop} onReviewTerms={noop} />,
    );
    expect(editable).toContain('2 terms differ from the EDB glossary.');
    expect(editable).toMatch(/<button[^>]*>Review terms…<\/button>/);
    const readOnly = renderToStaticMarkup(<PaperHealthPanel worksheet={worksheet} language="bilingual" />);
    expect(readOnly).toContain('2 terms differ from the EDB glossary.');
    expect(readOnly).not.toContain('Review terms…');
  });
});
