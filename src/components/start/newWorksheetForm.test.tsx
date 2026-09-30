/**
 * The new-worksheet form asks for a name first, and will not create without one.
 * The name is `Worksheet.name` (filing only); the factory side is in newWorksheet.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DocumentType } from '@/model/newWorksheet';
import {
  NAME_REQUIRED_MESSAGE,
  NewWorksheetForm,
  namePlaceholder,
  newWorksheetName,
} from './NewWorksheetForm';

const TYPES: DocumentType[] = ['classroom', 'lqWorksheet', 'paper1', 'lqMock'];
const render = (initialType?: DocumentType) =>
  renderToStaticMarkup(<NewWorksheetForm initialType={initialType} onCreate={() => {}} />);

describe('the Name field', () => {
  it('comes first, focused, and says it does not print', () => {
    const markup = render();
    const input = markup.match(/<input[^>]*aria-label="Name"[^>]*>/)?.[0] ?? '';
    expect(input).not.toBe('');
    expect(markup.indexOf('aria-label="Name"')).toBeLessThan(markup.indexOf('Document type'));
    expect(markup).toContain('doesn&#x27;t print on the paper');
    // No message until Create is pressed with it empty.
    expect(markup).not.toContain(NAME_REQUIRED_MESSAGE);
    expect(input).toContain('aria-invalid="false"');
  });

  it.each(TYPES)('offers a realistic example for %s', (type) => {
    expect(render(type)).toContain(`placeholder="${namePlaceholder(type)}"`);
  });

  it('derives the mock papers’ year rather than hard-coding one', () => {
    const october2026 = new Date(2026, 9, 1);
    expect(namePlaceholder('paper1', october2026)).toBe('S6 Mock Paper 1 2026-27');
    expect(namePlaceholder('lqMock', october2026)).toBe('S6 Mock Paper 2 2026-27');
  });

  it('has no em dash in its teacher-facing copy', () => {
    for (const type of TYPES) expect(render(type)).not.toContain('—');
  });
});

describe('the required name', () => {
  it('refuses blank and whitespace, and trims what it keeps', () => {
    expect(newWorksheetName('')).toBeUndefined();
    expect(newWorksheetName('   \t ')).toBeUndefined();
    expect(newWorksheetName('  S5 Demand quiz ')).toBe('S5 Demand quiz');
  });
});
