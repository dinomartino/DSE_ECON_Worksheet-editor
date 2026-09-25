import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createWorksheet } from '@/model/factories';
import { createWorksheetFrom } from '@/model/newWorksheet';
import type { Worksheet } from '@/model/types';
import { ExportDialog } from './ExportDialog';
import type { ExportFormat } from './exportSession';

const render = (
  checks?: React.ReactNode,
  initialFormat?: ExportFormat,
  worksheet: Worksheet = createWorksheet(),
) =>
  renderToStaticMarkup(
    <ExportDialog
      worksheet={worksheet}
      mode={{ language: 'zh', version: 'teacher' }}
      onClose={() => {}}
      onExported={() => {}}
      onPrint={() => {}}
      checks={checks}
      initialFormat={initialFormat}
    />,
  );

/** The radio button labelled `label`, as markup. */
const radio = (markup: string, label: string) =>
  markup.match(new RegExp(`<button[^>]*role="radio"[^>]*>${label}<`))?.[0] ?? '';

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

  it('offers one format choice — .docx, PDF, .json — opening on .docx', () => {
    const markup = render();
    for (const label of ['.docx', 'PDF', '.json']) expect(radio(markup, label)).not.toBe('');
    expect(radio(markup, '.docx')).toContain('aria-checked="true"');
    expect(markup.indexOf('Format')).toBeLessThan(markup.indexOf('Question paper'));
  });

  it('PDF: only the question paper, the rest disabled in place with the reason', () => {
    const markup = render(undefined, 'pdf');
    expect(radio(markup, 'PDF')).toContain('aria-checked="true"');
    expect(radio(markup, 'Question paper')).not.toContain('disabled');
    for (const label of ['Answer key', 'Both', 'Other apps']) {
      expect(radio(markup, label)).toContain('disabled=""');
      expect(radio(markup, label)).toContain('Not as PDF');
    }
    expect(markup).toContain('PDF prints the question paper only');
    // Language and version still apply: the page switches, then prints.
    expect(markup).toContain('The page switches to this language and version');
    expect(radio(markup, 'Teacher')).not.toContain('disabled');
    expect(markup).toContain('Print to PDF');
    expect(markup).not.toContain('Export .docx');
  });

  it('PDF keeps the cover and answer-space toggles, for this print only', () => {
    const markup = render(undefined, 'pdf', createWorksheetFrom({ documentType: 'lqMock' }));
    expect(markup).toContain('Cover page');
    expect(markup).toContain('Answer space');
    expect(markup).toContain('leave it out of this print');
  });

  it('PDF prints one paper version: "All" is disabled', () => {
    const worksheet = { ...createWorksheet(), versions: { count: 3, seed: 7 } };
    const markup = render(undefined, 'pdf', worksheet);
    expect(radio(markup, 'All')).toContain('disabled=""');
    expect(radio(markup, 'A')).toContain('aria-checked="true"');
    expect(markup).toContain('PDF prints one version at a time.');
    // .docx still writes every version.
    expect(radio(render(undefined, 'docx', worksheet), 'All')).not.toContain('disabled');
  });

  it('.json: the paper options are greyed and inert, and the hint says why', () => {
    const markup = render(undefined, 'json');
    expect(radio(markup, '.json')).toContain('aria-checked="true"');
    expect(markup).toContain('The options below do not apply.');
    expect(markup).toMatch(/<div inert=""[^>]*opacity-40/);
    expect(markup.indexOf('inert=""')).toBeLessThan(markup.indexOf('Question paper'));
    expect(markup).toContain('Export .json');
  });
});
