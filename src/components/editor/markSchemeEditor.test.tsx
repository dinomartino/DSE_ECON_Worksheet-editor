import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMarkEc, createMarkScheme, withSchemeDisplay } from '@/model/markScheme';
import type { MarkScheme } from '@/model/markSchemeTypes';
import { bi } from '@/model/text';
import { createSchemeFromPattern } from '@/model/markSchemePatterns';
import { MarkSchemeEditor } from './MarkSchemeEditor';
import { SchemeStatusChip } from './SchemeStatusChip';

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

/** k-0475: a DRQ part's scheme from the right panel. */
describe('Start from a pattern', () => {
  const renderFor = (scheme: MarkScheme | undefined, printedMarks: number | undefined) =>
    renderToStaticMarkup(<MarkSchemeEditor scheme={scheme} printedMarks={printedMarks} onChange={() => {}} />);

  it('a part with no scheme offers the five patterns, each saying what it builds for the part’s marks', () => {
    const markup = renderFor(undefined, 4);
    expect(markup).toContain('role="group" aria-label="Marking scheme patterns"');
    for (const label of ['Points', 'Any N reasons', 'Paragraph + total', 'Explain + diagram', 'Essay + EC']) {
      expect(markup).toContain(`>${label}</button>`);
    }
    expect(markup).toContain('mark the first 2 only, max 4');
    expect(renderFor(undefined, 14)).toContain('EC table (max 2), content max 12');
  });

  it('a scheme still without words keeps them; one with words does not', () => {
    expect(renderFor(createMarkScheme(), 4)).toContain('aria-label="Marking scheme patterns"');
    const worded = createSchemeFromPattern('reasons', 4);
    expect(renderFor(worded, 4)).not.toContain('aria-label="Marking scheme patterns"');
  });
});

describe('a DRQ part’s scheme in the panel', () => {
  const renderFor = (scheme: MarkScheme, printedMarks?: number) =>
    renderToStaticMarkup(<MarkSchemeEditor scheme={scheme} printedMarks={printedMarks} onChange={() => {}} />);

  it('a group without rules shows Rules and + Heading, not three empty boxes', () => {
    const markup = renderFor(createMarkScheme());
    expect(markup).toContain('>Rules</button>');
    expect(markup).toContain('>+ Heading</button>');
    expect(markup).not.toContain('aria-label="Group 1: credit any N points"');
  });

  it('a group with rules shows its boxes and its heading field', () => {
    const markup = renderFor(createSchemeFromPattern('reasons', 4), 4);
    expect(markup).toContain('aria-label="Group 1: credit any N points"');
    expect(markup).toContain('Group 1 heading');
  });

  it('an essay shows its content max and says the points are indicative; no 0m pills', () => {
    const markup = renderFor(createSchemeFromPattern('essay', 14), 14);
    expect(markup).toContain('aria-label="Content max"');
    expect(markup).toContain('Indicative content');
    expect(markup).not.toContain('>0m<');
    expect(markup).toContain('14 / 14m');
  });

  it('EC, levels, content max and OR are buttons in sight, offered only while absent', () => {
    const plain = renderFor(createMarkScheme());
    for (const label of ['+ OR answer', '+ EC table', '+ Content max', '+ Levels']) expect(plain).toContain(`>${label}</button>`);
    const essay = renderFor(createSchemeFromPattern('essay', 14), 14);
    expect(essay).not.toContain('>+ EC table</button>');
    expect(essay).not.toContain('>+ Content max</button>');
  });
});

describe('the part row’s scheme chip', () => {
  const chip = (scheme: MarkScheme | undefined, printedMarks: number | undefined) =>
    renderToStaticMarkup(<SchemeStatusChip ownerId="p" scheme={scheme} printedMarks={printedMarks} onOpen={() => {}} />);

  it('waits for a scheme, ticks when it matches the marks, warns when it does not', () => {
    expect(chip(undefined, 4)).toContain('>Scheme</button>');
    expect(chip(createSchemeFromPattern('reasons', 4), 4)).toContain('>✓ 4</button>');
    expect(chip(createSchemeFromPattern('reasons', 4), 6)).toContain('>4/6</button>');
    expect(chip(undefined, 4)).toContain('data-print-hide');
  });
});

describe('the standard EC table, folded', () => {
  it('shows one line and Edit wording until its statements are wanted', () => {
    const markup = renderToStaticMarkup(
      <MarkSchemeEditor scheme={{ ...createMarkScheme(), ec: createMarkEc() }} printedMarks={undefined} onChange={() => {}} />,
    );
    expect(markup).toContain('>Edit wording</button>');
    expect(markup).not.toContain('aria-label="EC row 1 marks"');
  });
});
