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

  it('keeps the placeholder title when the box is left empty', () => {
    // An empty box means "not decided", and "" would name the document "Untitled" in the
    // file list and download as `worksheet.docx`.
    expect(plain(createWorksheetFrom({ title: '   ' }).title.en)).toBe('Economics Worksheet');
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
});
