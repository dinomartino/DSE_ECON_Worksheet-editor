import { describe, expect, it } from 'vitest';
import {
  addField,
  assessmentTitleBlock,
  bandIsEmpty,
  createBand,
  createFillInField,
  createTextField,
  createTotalMarksField,
  findZone,
  moveField,
  duplicateComputedFields,
  HEADER_FOOTER_PRESETS,
  removeField,
  updateField,
} from './bands';
import { bandsHeight, bandsOverflow, headerFooterOffsets } from './page';
import { bi } from './text';

/**
 * The constrained-layout contract: a field always lives in exactly one of three zones,
 * and moves are pure. Free positioning is deliberately not representable.
 */

describe('bands', () => {
  it('starts empty and reports so', () => {
    expect(bandIsEmpty(createBand())).toBe(true);
  });

  it('adds a field to a named zone', () => {
    const band = addField(createBand(), 'center', createTextField(bi('Title', '標題')));
    expect(bandIsEmpty(band)).toBe(false);
    expect(band.zones.center).toHaveLength(1);
    expect(band.zones.left).toHaveLength(0);
  });

  it('moves a field between zones without duplicating it', () => {
    const field = createTextField(bi('Name:', '姓名：'));
    const band = addField(createBand(), 'left', field);

    const moved = moveField(band, field.id, 'right');
    expect(findZone(moved, field.id)).toBe('right');
    expect(moved.zones.left).toHaveLength(0);
    expect(moved.zones.right).toHaveLength(1);
  });

  it('reorders within one zone, landing before the named field', () => {
    const a = createTextField(bi('A', 'A'));
    const b = createTextField(bi('B', 'B'));
    const c = createTextField(bi('C', 'C'));
    let band = createBand();
    for (const f of [a, b, c]) band = addField(band, 'left', f);

    // Drop C before A.
    const moved = moveField(band, c.id, 'left', a.id);
    expect(moved.zones.left.map((f) => f.id)).toEqual([c.id, a.id, b.id]);
  });

  it('appends when no anchor is given, even within the same zone', () => {
    const a = createTextField(bi('A', 'A'));
    const b = createTextField(bi('B', 'B'));
    let band = addField(createBand(), 'left', a);
    band = addField(band, 'left', b);

    const moved = moveField(band, a.id, 'left');
    expect(moved.zones.left.map((f) => f.id)).toEqual([b.id, a.id]);
  });

  it('is a no-op for a field that no longer exists, rather than throwing', () => {
    const band = addField(createBand(), 'left', createTextField());
    expect(moveField(band, 'gone', 'right')).toEqual(band);
  });

  it('never mutates its input', () => {
    const field = createTextField(bi('X', 'X'));
    const band = addField(createBand(), 'left', field);
    const snapshot = JSON.stringify(band);
    moveField(band, field.id, 'center');
    removeField(band, field.id);
    updateField(band, field.id, { format: { bold: true } });
    expect(JSON.stringify(band)).toBe(snapshot);
  });

  it('removes a field from whichever zone holds it', () => {
    const field = createFillInField(bi('Date:', '日期：'));
    const band = addField(createBand(), 'right', field);
    expect(bandIsEmpty(removeField(band, field.id))).toBe(true);
  });

  it('patches a field in place, leaving its zone position alone', () => {
    const field = createTextField(bi('Title', '標題'));
    const band = addField(createBand(), 'center', field);
    const patched = updateField(band, field.id, { format: { fontSize: 16 } });
    expect(findZone(patched, field.id)).toBe('center');
    expect(patched.zones.center[0].format).toEqual({ fontSize: 16 });
  });

  it('builds an assessment masthead with the title centred beside a name field', () => {
    const bands = assessmentTitleBlock(bi('DBS Economics', '經濟'), bi('Assessment 1', '測驗一'));
    expect(bands).toHaveLength(4);
    // Row 1: title centred, name field on the right.
    expect(bands[0].zones.center).toHaveLength(1);
    expect(bands[0].zones.right[0].kind).toBe('fillIn');
    // The marks total is a computed field, never authored text.
    const marks = bands.flatMap((b) => [...b.zones.left, ...b.zones.center, ...b.zones.right]);
    expect(marks.some((f) => f.kind === 'totalMarks')).toBe(true);
  });

  it('gives a total-marks field no text of its own to go stale', () => {
    const field = createTotalMarksField();
    expect(field.kind).toBe('totalMarks');
    expect('text' in field).toBe(false);
  });
});

/**
 * A marks total is derived, so printing two of them shows the same number twice. It is
 * easy to reach without noticing — the "Exam paper" header preset carries one and so
 * does the title block — which is exactly why it is worth detecting rather than leaving
 * to be spotted on the printed page.
 */
describe('duplicate computed fields', () => {
  it('says nothing when a marks total appears once', () => {
    const title = assessmentTitleBlock(bi('Paper', '卷'), bi('Assessment 1', '測驗一'));
    expect(duplicateComputedFields([title])).toEqual([]);
  });

  it('reports a marks total carried by both the title block and the header', () => {
    const title = assessmentTitleBlock(bi('Paper', '卷'), bi('Assessment 1', '測驗一'));
    const header = HEADER_FOOTER_PRESETS.find((p) => p.id === 'exam')!.build();
    expect(duplicateComputedFields([title, header])).toEqual(['totalMarks']);
  });

  it('ignores an edge the document is not printing', () => {
    const title = assessmentTitleBlock(bi('Paper', '卷'), bi('Assessment 1', '測驗一'));
    // The header is disabled, so the caller passes undefined for it.
    expect(duplicateComputedFields([title, undefined])).toEqual([]);
  });

  it('does not treat repeated authored text as a duplicate', () => {
    const rows = [
      createBand({ left: [createTextField(bi('S.6 Economics', ''))] }),
      createBand({ left: [createTextField(bi('S.6 Economics', ''))] }),
    ];
    expect(duplicateComputedFields([rows])).toEqual([]);
  });
});

/**
 * Header geometry: a header lives in the margin, not in the text column.
 *
 * Word grows a header downward from `w:header` and only displaces body text once it
 * passes `w:top`. Both offsets used to be a hardcoded 720 twips against a 1440 top
 * margin, so a five-row exam header had 720 twips to fit into, overflowed, and pushed
 * the questions down the page — adding a header silently cost content space.
 */
describe('header/footer offsets (§ page furniture)', () => {
  const margins = { top: 1440, right: 1440, bottom: 1440, left: 1440 };

  it('leaves Word’s default when there is nothing to fit', () => {
    expect(headerFooterOffsets(margins, 0, 0)).toEqual({ header: 720, footer: 720 });
  });

  it('keeps a short header at the default rather than flattening it to the edge', () => {
    // One row (~280tw) fits inside 1440 - 720 with room to spare.
    const { header } = headerFooterOffsets(margins, bandsHeight([createBand()]), 0);
    expect(header).toBe(720);
  });

  it('pulls a tall header toward the page edge so it stays out of the text column', () => {
    // Three rows (~840tw) do not fit under the default 720 offset but do fit inside the
    // 1440 margin once the header is moved up — which is the case this exists for.
    const rows = Array.from({ length: 3 }, () =>
      createBand({ center: [createTextField(bi('SCHOOL NAME', ''))] }),
    );
    const height = bandsHeight(rows, true);
    const { header } = headerFooterOffsets(margins, height, 0);

    expect(header).toBeLessThan(720);
    // The whole point: the rows now end at or before where the body text starts, so no
    // question is pushed down the page.
    expect(header + height).toBeLessThanOrEqual(margins.top);
  });

  it('still displaces the body when the rows exceed the whole margin', () => {
    // Honest about the one case it cannot solve: a header taller than the margin has
    // nowhere to go. It is clamped at the printable edge and the overflow — and only the
    // overflow — pushes content down, rather than the whole header height doing so.
    const rows = Array.from({ length: 6 }, () =>
      createBand({ center: [createTextField(bi('SCHOOL NAME', ''))] }),
    );
    const height = bandsHeight(rows, true);
    const { header } = headerFooterOffsets(margins, height, 0);

    expect(header).toBe(284);
    expect(header + height).toBeGreaterThan(margins.top);
  });

  it('never places a band inside the printer’s dead zone', () => {
    // A header taller than the entire margin has nowhere to go but into the body; it
    // must still not be pushed off the top of the sheet.
    const { header } = headerFooterOffsets(margins, 5000, 0);
    expect(header).toBeGreaterThanOrEqual(284);
  });

  it('sizes a row by its own font size, since the title rows are what overflow', () => {
    const plainRow = createBand({ center: [createTextField(bi('S.6', ''))] });
    const bigRow = createBand({
      center: [{ ...createTextField(bi('S.6', '')), format: { fontSize: 22 } }],
    });
    expect(bandsHeight([bigRow])).toBeGreaterThan(bandsHeight([plainRow]));
  });

  it('reserves room for a rule line, which prints below the last row', () => {
    const rows = [createBand({ center: [createTextField(bi('S.6', ''))] })];
    expect(bandsHeight(rows, true)).toBeGreaterThan(bandsHeight(rows, false));
  });
});

/**
 * The overflow is what moves the text column, so it has to be reported per edge.
 *
 * A header that runs past `w:top` pushes the body down by exactly that much; a footer
 * pushes the bottom up. Summing the two and subtracting from the pagination budget —
 * which is all the preview did at first — shrinks the column without moving it, so a
 * tall header printed *on top of* the first question instead of clearing it.
 */
describe('bands overflow', () => {
  const margins = { top: 1440, right: 1440, bottom: 1440, left: 1440 };

  it('reports nothing while the rows fit their margin', () => {
    const rows = [createBand({ center: [createTextField(bi('S.6', ''))] })];
    expect(bandsOverflow(margins, bandsHeight(rows), 0)).toEqual({ header: 0, footer: 0 });
  });

  it('reports each edge separately, since they move opposite ends of the column', () => {
    const tall = Array.from({ length: 6 }, () =>
      createBand({ center: [createTextField(bi('SCHOOL NAME', ''))] }),
    );
    const height = bandsHeight(tall, true);
    const over = bandsOverflow(margins, height, 0);

    expect(over.header).toBeGreaterThan(0);
    expect(over.footer).toBe(0);
    // Exactly the amount by which the placed rows pass the margin.
    expect(over.header).toBe(284 + height - margins.top);
  });
});

/**
 * The default is left alone unless the rows genuinely do not fit.
 *
 * The first version computed `margin - height` unconditionally, so *every* header was
 * pushed up to fill the margin — a one-row header on a 2.54 cm page ended up flattened
 * against the paper edge at the 284tw floor for no reason. A header that fits should
 * simply render with normal page margins.
 */
describe('an offset moves only when it has to', () => {
  const margins = { top: 1440, right: 1440, bottom: 1440, left: 1440 };

  it('leaves a one-row ruled header at the Word default', () => {
    const rows = [createBand({ left: [createTextField(bi('S.6 Economics', ''))] })];
    const { header } = headerFooterOffsets(margins, bandsHeight(rows, true), 0);
    expect(header).toBe(720);
  });

  it('leaves a one-row ruled footer at the Word default', () => {
    const rows = [createBand({ center: [createTextField(bi('P.1', ''))] })];
    const { footer } = headerFooterOffsets(margins, 0, bandsHeight(rows, true));
    expect(footer).toBe(720);
  });

  it('moves only as far as the rows need, not all the way to the floor', () => {
    // Four rows: too tall for the 720 default, but far from needing the 284 floor.
    const rows = Array.from({ length: 4 }, () =>
      createBand({ center: [createTextField(bi('SCHOOL NAME', ''))] }),
    );
    const height = bandsHeight(rows);
    const { header } = headerFooterOffsets(margins, height, 0);

    expect(header).toBeGreaterThan(284);
    expect(header).toBeLessThan(720);
    expect(header).toBe(margins.top - height);
  });
});
