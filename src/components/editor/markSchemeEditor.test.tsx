import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMarkEc, createMarkScheme, withSchemeDisplay } from '@/model/markScheme';
import type { MarkScheme } from '@/model/markSchemeTypes';
import { bi } from '@/model/text';
import { MarkSchemeEditor } from './MarkSchemeEditor';

/** k-0470: Show answer as Points / Paragraph + total, and the standard EC table. */

const render = (scheme: MarkScheme) =>
  renderToStaticMarkup(<MarkSchemeEditor scheme={scheme} printedMarks={undefined} onChange={() => {}} />);

const ruled = (): MarkScheme => {
  const scheme = createMarkScheme();
  return { ...scheme, routes: [{ ...scheme.routes[0], groups: [{ ...scheme.routes[0].groups[0], take: 2, each: 1 }] }] };
};

describe('Show answer as', () => {
  it('offers Points and Paragraph + total, Points chosen for a scheme saved before', () => {
    const markup = render(createMarkScheme());
    expect(markup).toContain('role="radiogroup" aria-label="Show answer as"');
    expect(markup).toMatch(/aria-checked="true"[^>]*>Points/);
    expect(markup).toMatch(/aria-checked="false"[^>]*>Paragraph \+ total/);
  });

  it('a paragraph scheme has Paragraph + total chosen', () => {
    expect(render(withSchemeDisplay(createMarkScheme(), 'paragraph'))).toMatch(/aria-checked="true"[^>]*>Paragraph \+ total/);
  });

  it('says the group rules will not print, only when there are some and it is a paragraph', () => {
    const note = 'still count but do not print';
    expect(render(withSchemeDisplay(ruled(), 'paragraph'))).toContain(note);
    expect(render(ruled())).not.toContain(note);
    expect(render(withSchemeDisplay(createMarkScheme(), 'paragraph'))).not.toContain(note);
  });
});

describe('Use HKEAA standard', () => {
  it('is offered for an EC table in other words, not for the standard one', () => {
    const standard = { ...createMarkScheme(), ec: createMarkEc() };
    expect(render(standard)).not.toContain('Use HKEAA standard');
    const own = {
      ...standard,
      ec: { ...standard.ec, descriptors: [{ id: 'x', marks: 2, text: bi('Clear.', '清晰。') }] },
    };
    expect(render(own)).toContain('Use HKEAA standard');
  });
});
