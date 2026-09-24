import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createWorksheet } from '@/model/factories';
import { ExportDialog } from './ExportDialog';

const render = (checks?: React.ReactNode) =>
  renderToStaticMarkup(
    <ExportDialog
      worksheet={createWorksheet()}
      mode={{ language: 'zh', version: 'teacher' }}
      onClose={() => {}}
      onExported={() => {}}
      checks={checks}
    />,
  );

describe('ExportDialog', () => {
  it('puts the checks slot at the top of the body, before the choices', () => {
    const markup = render(<div data-testid="checks">Paper check</div>);
    expect(markup).toContain('Paper check');
    expect(markup.indexOf('Paper check')).toBeLessThan(markup.indexOf('Question paper'));
  });

  it('offers paper, key and both, and starts from the editor’s own mode', () => {
    const markup = render();
    for (const label of ['Question paper', 'Answer key', 'Both', 'Paper version']) {
      expect(markup).toContain(label);
    }
    // 中文 and Teacher are the checked radios.
    expect(markup).toMatch(/aria-checked="true"[^>]*>中文/);
    expect(markup).toMatch(/aria-checked="true"[^>]*>Teacher/);
    expect(markup).toContain('Export .docx');
  });
});
