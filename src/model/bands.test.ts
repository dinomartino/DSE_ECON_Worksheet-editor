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
  removeField,
  updateField,
} from './bands';
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
