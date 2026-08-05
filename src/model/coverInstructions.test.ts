/**
 * A paper's instruction list is the teacher's to lengthen and shorten.
 *
 * `addCoverLine` and `removeCoverLine` have existed since the cover shipped, and the
 * store has exposed them for as long — but nothing in the UI called them, so an
 * instruction could be reworded and never added or deleted. A school whose rules differ
 * from the reference's six had no way to say so.
 *
 * What these pin is the part that makes the feature safe rather than the part that makes
 * it work: the numbers are **derived from position** (§ instruction numbers are derived),
 * so a deletion must renumber the rest instead of leaving a hole, and every other region
 * of the cover must be untouched by an edit aimed at this one.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  addCoverLine,
  coverLines,
  findCoverLine,
  removeCoverLine,
  setCoverLineText,
} from '@/model/cover';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { renderWorksheet } from '@/render/worksheet';
import { bi, plain } from '@/model/text';
import type { OutputMode, Worksheet } from '@/model/types';
import type { CoverPage } from '@/model/coverTypes';

const MODE: OutputMode = { language: 'en', version: 'student' };

const coverOf = (type: 'paper1' | 'lqMock'): CoverPage =>
  createWorksheetFrom({ documentType: type }).cover!;

/** The printed "1." / "(1)" marker of each instruction, in order. */
function markers(worksheet: Worksheet): string[] {
  const rendered = renderWorksheet(worksheet, MODE);
  return (rendered.cover?.instructions ?? [])
    .filter((node) => node.kind === 'columns')
    .map((node) => (node.kind === 'columns' ? plain(node.cells[0].text.en) : ''));
}

describe.each(['paper1', 'lqMock'] as const)('%s cover instructions', (type) => {
  it('adds a line to the end of the list', () => {
    const before = coverOf(type);
    const after = addCoverLine(before, 'instructions');

    expect(coverLines(after, 'instructions')).toHaveLength(
      coverLines(before, 'instructions').length + 1,
    );
    // Empty, so the teacher types into it — not seeded with wording nobody chose.
    expect(plain(coverLines(after, 'instructions').at(-1)!.text.en)).toBe('');
  });

  it('adds after a named line, so a rule can go where it belongs', () => {
    const before = coverOf(type);
    const first = coverLines(before, 'instructions')[0];
    const after = addCoverLine(before, 'instructions', first.id);

    expect(coverLines(after, 'instructions')[1].id).not.toBe(
      coverLines(before, 'instructions')[1].id,
    );
    expect(coverLines(after, 'instructions')[0].id).toBe(first.id);
  });

  it('removes a line by id', () => {
    const before = coverOf(type);
    const second = coverLines(before, 'instructions')[1];
    const after = removeCoverLine(before, second.id);

    expect(findCoverLine(after, second.id)).toBeUndefined();
    expect(coverLines(after, 'instructions')).toHaveLength(
      coverLines(before, 'instructions').length - 1,
    );
  });

  it('renumbers after a deletion instead of leaving a hole', () => {
    // The whole reason the numbers are derived. Deleting the second instruction must
    // make the third become "2.", not leave 1, 3, 4 on a printed exam paper.
    const worksheet = createWorksheetFrom({ documentType: type });
    const second = coverLines(worksheet.cover!, 'instructions')[1];
    const edited: Worksheet = {
      ...worksheet,
      cover: removeCoverLine(worksheet.cover!, second.id),
    };

    const printed = markers(edited);
    const expected = printed.map((_, index) =>
      worksheet.cover!.instructionMarker === 'dot' ? `${index + 1}.` : `(${index + 1})`,
    );
    expect(printed).toEqual(expected);
  });

  it('leaves every other region alone', () => {
    // The regions are separate lists and the verbs walk all four by id, so an edit
    // aimed at the instructions could silently reach the head or foot lines.
    const before = coverOf(type);
    const added = addCoverLine(before, 'instructions');
    const removed = removeCoverLine(added, coverLines(added, 'instructions')[0].id);

    for (const region of ['corner', 'head', 'foot'] as const) {
      expect(coverLines(removed, region)).toEqual(coverLines(before, region));
    }
    expect(removed.panelBoxes).toBe(before.panelBoxes);
    expect(removed.instructionsHeading).toEqual(before.instructionsHeading);
  });

  it('carries an added instruction all the way to the render', () => {
    const worksheet = createWorksheetFrom({ documentType: type });
    let cover = addCoverLine(worksheet.cover!, 'instructions');
    const added = coverLines(cover, 'instructions').at(-1)!;
    cover = setCoverLineText(cover, added.id, bi('Hand this paper in before leaving.', '離場前請交回試卷。'));

    const rendered = renderWorksheet({ ...worksheet, cover }, MODE);
    const text = (rendered.cover?.instructions ?? [])
      .filter((node) => node.kind === 'columns')
      .map((node) => (node.kind === 'columns' ? plain(node.cells[1].text.en) : ''));

    expect(text).toContain('Hand this paper in before leaving.');
  });

  it('gives a fresh line an edit target, so it can be typed into', () => {
    // An added line that rendered without a `coverLine` target would be a line nobody
    // could click — added and permanently blank.
    const worksheet = createWorksheetFrom({ documentType: type });
    const cover = addCoverLine(worksheet.cover!, 'instructions');
    const added = coverLines(cover, 'instructions').at(-1)!;

    const rendered = renderWorksheet({ ...worksheet, cover }, MODE);
    const targets = (rendered.cover?.instructions ?? [])
      .filter((node) => node.kind === 'columns')
      .flatMap((node) => (node.kind === 'columns' ? node.cells : []))
      .map((cell) => (cell.edit?.kind === 'coverLine' ? cell.edit.lineId : undefined));

    expect(targets).toContain(added.id);
  });
});

/**
 * The add/delete controls are chrome, and chrome on the sheet reaches the PDF.
 *
 * `window.print()` runs over the real sheets, so anything not marked `data-print-hide`
 * prints — a "+ Instruction" button on a handed-out exam paper. Asserted by grepping the
 * component, as `bandChrome.test.ts` does for the band affordance: the failure is
 * invisible in every unit test of the feature and only shows on paper.
 */
describe('the instruction controls never print', () => {
  const source = readFileSync('src/components/preview/Preview.tsx', 'utf8');
  const region = source.slice(
    source.indexOf('const instructionsRegion'),
    source.indexOf('return (\n    <div data-cover'),
  );

  it('marks both controls print-hidden', () => {
    expect(region).toContain('+ Instruction');
    expect(region).toContain('Remove this instruction');
    // One `data-print-hide` per control — the ✕ strip and the add strip.
    expect(region.match(/data-print-hide/g) ?? []).toHaveLength(2);
  });

  it('reserves no space for them', () => {
    // Absolutely positioned, so the printed page breaks where Word breaks it: chrome
    // that occupied a line would push the instruction list down on the sheet only.
    expect(region).toContain('absolute');
    // And the pointer must be able to reach a control that sits outside its own row
    // without the hover collapsing on the way (§ hover chrome needs a hit path).
    expect(region).toContain('pointer-events-none');
    expect(region).toContain('pointer-events-auto');
  });
});
