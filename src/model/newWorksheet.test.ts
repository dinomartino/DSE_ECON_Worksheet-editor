import { describe, expect, it } from 'vitest';
import { createWorksheetFrom } from './newWorksheet';
import { createWorksheet } from './factories';
import { coverHasPanel } from './cover';
import { resolveFlow } from './flow';
import { plain } from './text';

/**
 * The start screen's answers become a document.
 *
 * The risks here are all about *silence*: a wizard that drops an answer produces a
 * document that looks fine and is set up wrong, and the teacher finds out at the point
 * where changing it means re-paginating everything they have written.
 */

/**
 * A document with every generated id and timestamp removed.
 *
 * Ids come from `nanoid()` and differ per call by design, so comparing two documents
 * for *shape* means comparing everything else. Recursive because they are not only at
 * the top level: the footer's page-number band and its field carry their own, as does
 * every layout element.
 */
function shapeOf(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shapeOf);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'id' && key !== 'createdAt' && key !== 'updatedAt')
        .map(([key, entry]) => [key, shapeOf(entry)]),
    );
  }
  return value;
}

describe('defaults', () => {
  it('with no answers matches a plain new worksheet', () => {
    // The wizard is a way to answer sooner, never a different kind of document — so
    // "skip every question" and "New worksheet" have to reach the same place. Ids and
    // timestamps are the only legitimate differences.
    expect(shapeOf(createWorksheetFrom())).toEqual(shapeOf(createWorksheet()));
  });

  it('gives each new document its own id', () => {
    // Or "New" beside an open worksheet would save over the one it was started from.
    expect(createWorksheetFrom().id).not.toBe(createWorksheetFrom().id);
  });

  it('leaves the title empty when the box is left empty', () => {
    // No default heading is stamped into a new document: an untitled paper must not
    // open with words nobody wrote printed at the top. Empty renders no title node,
    // lists as "Untitled", and downloads under the generic name until renamed.
    const worksheet = createWorksheetFrom({ title: '   ' });
    expect(plain(worksheet.title.en)).toBe('');
    expect(plain(worksheet.title.zh)).toBe('');
  });
});

describe('answers reach the document', () => {
  it('stores the title on both sides', () => {
    const worksheet = createWorksheetFrom({ title: 'S6 Mock', titleZh: '模擬試卷' });
    expect(plain(worksheet.title.en)).toBe('S6 Mock');
    expect(plain(worksheet.title.zh)).toBe('模擬試卷');
  });

  it('stores paper, margins and fonts', () => {
    const worksheet = createWorksheetFrom({
      paper: 'Letter',
      margins: { top: 720, right: 720, bottom: 720, left: 720 },
      fonts: { latin: 'Arial', eastAsia: 'Microsoft JhengHei' },
    });
    expect(worksheet.pageSetup).toMatchObject({
      paper: 'Letter',
      margins: { top: 720, left: 720 },
    });
    expect(worksheet.fonts).toEqual({ latin: 'Arial', eastAsia: 'Microsoft JhengHei' });
  });

  it('builds the cover the chosen paper style actually has', () => {
    // The two papers differ in *shape*, not wording: only a write-in booklet gets the
    // candidate panel and the two-column split that makes room for it.
    expect(coverHasPanel(createWorksheetFrom({ cover: 'writeIn' }).cover!)).toBe(true);
    expect(coverHasPanel(createWorksheetFrom({ cover: 'mcq' }).cover!)).toBe(false);
  });

  it('builds no cover unless one is asked for', () => {
    // The common case is a classroom worksheet, which must not have to opt out of exam
    // furniture it never wanted.
    expect(createWorksheetFrom().cover).toBeUndefined();
  });
});

describe('sections', () => {
  it('ships the two section headings by default', () => {
    const worksheet = createWorksheetFrom();
    expect(worksheet.layout.filter((element) => element.kind === 'section')).toHaveLength(2);
  });

  it('omits them on request, and leaves no flow entry behind', () => {
    /*
     * The flow names elements by id, so dropping `layout` alone would leave entries
     * pointing at elements that no longer exist — the invariant `emptyFlow` exists to
     * keep. `resolveFlow` is what would silently disagree.
     */
    const worksheet = createWorksheetFrom({ sections: false });
    expect(worksheet.layout).toEqual([]);
    expect(worksheet.flow).toEqual([]);
    expect(resolveFlow(worksheet)).toEqual([]);
  });

  it('keeps flow and layout in step when sections are kept', () => {
    const worksheet = createWorksheetFrom({ sections: true });
    expect(worksheet.flow.map((entry) => entry.id)).toEqual(
      worksheet.layout.map((element) => element.id),
    );
    expect(resolveFlow(worksheet)).toHaveLength(2);
  });

  it('gives the booklet the reference’s running footer, always on', () => {
    /*
     * The QAB's footer is part of its shape (§ `qabFooter`): the paper code with a live
     * page number at the left, small, and the bare number again at the centre, large —
     * the reference's own `footer2.xml` layout. The code stem is the cover's code, so
     * the corner block and the footer ship agreeing.
     */
    const worksheet = createWorksheetFrom({
      documentType: 'lqMock',
      coverDetails: { code: '2024-25' },
    });
    const footer = worksheet.footer!;
    expect(footer.enabled).toBe(true);

    const [band] = footer.bands;
    const left = band.zones.left[0];
    expect(left.kind).toBe('pageNumber');
    if (left.kind !== 'pageNumber') throw new Error('unreachable');
    expect(left.prefix?.en[0]?.text).toBe('2024-25-ECON 2–');
    expect(left.format?.fontSize).toBe(9);

    const centre = band.zones.center[0];
    expect(centre.kind).toBe('pageNumber');
    if (centre.kind !== 'pageNumber') throw new Error('unreachable');
    // The bare number, larger — the number a candidate flips to.
    expect(centre.prefix).toBeUndefined();
    expect(centre.format?.fontSize).toBe(14);

    // Every other document type keeps the factory's own footer untouched (ids are
    // fresh per document, so compare the shape, not the instances).
    const stripIds = (value: unknown) =>
      JSON.parse(JSON.stringify(value, (key, v) => (key === 'id' ? undefined : v)));
    const classroom = createWorksheetFrom({ documentType: 'classroom' });
    expect(stripIds(classroom.footer)).toEqual(stripIds(createWorksheet().footer));
  });

  it('sets the booklet’s body at 10pt, and no other type’s', () => {
    /*
     * The reference booklet's whole body — stems, parts, marks, table cells — is 10pt
     * on the unchanged 12pt line (§ `QAB_BASE_FONT_SIZE`). A document-level size, not
     * per-element formatting, so the first question the teacher types is 10pt too.
     */
    expect(createWorksheetFrom({ documentType: 'lqMock' }).baseFontSize).toBe(10);
    for (const documentType of ['classroom', 'paper1', 'lqWorksheet'] as const) {
      expect(createWorksheetFrom({ documentType }).baseFontSize).toBeUndefined();
    }
  });

  it('sets the booklet’s section headings at its own body size, bold', () => {
    // "Section A (22 marks)" prints at the same 10pt as the questions under it —
    // bold is the only emphasis the booklet's headings carry.
    const worksheet = createWorksheetFrom({ documentType: 'lqMock' });
    const headings = worksheet.layout.filter((element) => element.kind === 'section');
    expect(headings).toHaveLength(3);
    for (const heading of headings) {
      expect(heading.format).toEqual({ fontSize: 10, bold: true });
    }
  });
});
