import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createWorksheet } from '@/model/factories';
import { createWorksheetFrom } from '@/model/newWorksheet';
import type { Worksheet } from '@/model/types';
import { ExportDialog } from './ExportDialog';

const render = (worksheet: Worksheet) =>
  renderToStaticMarkup(
    <ExportDialog
      worksheet={worksheet}
      mode={{ language: 'en', version: 'student' }}
      onClose={() => {}}
      onExported={() => {}}
    />,
  );

describe('ExportDialog "Include"', () => {
  it('offers the cover and answer space a booklet has, both ticked, under the version', () => {
    const markup = render(createWorksheetFrom({ documentType: 'lqMock' }));
    expect(markup).toContain('Cover page');
    expect(markup).toContain('Answer space');
    expect(markup.match(/<input type="checkbox"[^>]*checked=""/g)).toHaveLength(2);
    expect(markup.indexOf('Paper version')).toBeLessThan(markup.indexOf('Cover page'));
  });

  it('is absent when there is nothing to leave out', () => {
    const markup = render(createWorksheet());
    expect(markup).not.toContain('Cover page');
    expect(markup).not.toContain('Answer space');
  });
});
