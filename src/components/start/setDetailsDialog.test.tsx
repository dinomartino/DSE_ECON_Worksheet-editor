/** Set details (k-0299 step B): only what the teacher changed is written; drift is said. */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMockSet } from '@/model/mockSet';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { withPaperSet } from '@/model/paperSet';
import { draftPatch, SetDetailsDialog } from './SetDetailsDialog';

const noop = () => {};

describe('the Set details dialog', () => {
  it('writes only the details that were changed', () => {
    const base = { name: 'Mock', school: { en: ' St Mary ', zh: '' }, exam: { en: 'X', zh: '' }, satOn: '2027-02-10', classes: '6a, 6B' };
    expect(draftPatch({ ...base, touched: new Set() })).toEqual({});
    expect(draftPatch({ ...base, touched: new Set(['school', 'classes'] as const) })).toEqual({
      school: { en: 'St Mary', zh: '' },
      classes: ['6A', '6B'],
    });
    expect(draftPatch({ ...base, satOn: '', touched: new Set(['satOn'] as const) })).toEqual({ satOn: '' });
  });

  it('starts from the papers’ values and lists both papers; a set made in one go shows no drift', () => {
    const { chosen, blank } = createMockSet({ documentType: 'paper1', name: 'S6 Mock Paper 1', coverDetails: { school: 'St Mary College' } });
    const markup = renderToStaticMarkup(<SetDetailsDialog name="S6 Mock" papers={[chosen, blank]} onClose={noop} onApply={noop} />);
    expect(markup).toContain('value="St Mary College"');
    expect(markup).toContain('S6 Mock Paper 2');
    expect(markup).not.toContain('data-set-drift');
  });

  it('says where the papers disagree, and offers the filled-in value', () => {
    const { chosen } = createMockSet({ documentType: 'paper1', name: 'S6 Mock Paper 1', coverDetails: { school: 'St Mary College' } });
    const other = withPaperSet(createWorksheetFrom({ documentType: 'lqMock', name: 'Old Paper 2' }), chosen.paperSet!);
    const markup = renderToStaticMarkup(
      <SetDetailsDialog name="S6 Mock" papers={[{ ...chosen, updatedAt: '2027-01-02T00:00:00.000Z' }, { ...other, updatedAt: '2027-01-01T00:00:00.000Z' }]} onClose={noop} onApply={noop} />,
    );
    expect(markup).toContain('data-set-drift');
    expect(markup).toContain('data-drift="school"');
    expect(markup).toContain('Paper 2 · Old Paper 2: SCHOOL NAME');
    expect(markup).toContain('Use “St Mary College” on every paper');
  });
});
