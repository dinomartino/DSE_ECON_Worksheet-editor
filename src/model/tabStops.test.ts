import { describe, expect, it } from 'vitest';
import {
  cleanTabStops,
  DEFAULT_TAB_STOP_TWIPS,
  movedTabStop,
  nextTabStop,
  snapTabPos,
  tabGap,
  tabPresetStops,
  withTabStop,
  withoutTabStop,
} from './tabStops';
import { applyInsertTab, applyTabPreset, formatOfTarget, textOfTarget } from './edits';
import { createParagraphBlock, createWorksheet } from './factories';
import { bi, plain } from './text';
import type { TabStop, Worksheet } from './types';

/**
 * Word's tab rule (docs/Tabs vs Word.md). The numbers are LibreOffice's for the same
 * `.docx`: a stem indented 18 pt whose "Name:" ends at 47.3 pt sends "Class:" to 72 pt,
 * the second default stop from the margin, not from the indent.
 */
describe('nextTabStop', () => {
  const grid = DEFAULT_TAB_STOP_TWIPS;

  it('takes the next default stop, counted from the margin', () => {
    expect(nextTabStop(47.3 * 20, [], grid, 9026)?.pos).toBe(1440);
    expect(nextTabStop(98.9 * 20, [], grid, 9026)?.pos).toBe(2160);
  });

  it('moves on from a tab sitting exactly on a stop', () => {
    expect(nextTabStop(720, [], grid, 9026)?.pos).toBe(1440);
  });

  it('takes the first custom stop past the tab, then the grid after the last one', () => {
    const stops: TabStop[] = [{ pos: 3000, align: 'right' }];
    expect(nextTabStop(100, stops, grid, 9026)).toEqual({ pos: 3000, align: 'right' });
    expect(nextTabStop(3100, stops, grid, 9026)?.pos).toBe(3600);
  });

  it('honours a custom stop past the right indent, up to the column edge', () => {
    // A right-indented stem (the Marks column) still sets "(3 marks)" at the margin.
    expect(nextTabStop(100, [{ pos: 9026, align: 'right' }], grid, 8000, 9026)?.pos).toBe(9026);
    expect(nextTabStop(8100, [], grid, 8000, 9026)).toBeUndefined();
  });

  it('has nothing past the line end, so the tab wraps', () => {
    expect(nextTabStop(8900, [], grid, 9026)).toBeUndefined();
    expect(nextTabStop(100, [{ pos: 9500, align: 'left' }], grid, 9026)).toBeUndefined();
  });
});

describe('tabGap', () => {
  it('aligns the text after the tab on the stop', () => {
    expect(tabGap(100, { pos: 500, align: 'left' }, 80)).toBe(400);
    expect(tabGap(100, { pos: 500, align: 'right' }, 80)).toBe(320);
    expect(tabGap(100, { pos: 500, align: 'center' }, 80)).toBe(360);
    expect(tabGap(100, { pos: 500, align: 'decimal' }, 80, 30)).toBe(370);
  });

  it('never draws the text back over what precedes the tab', () => {
    expect(tabGap(100, { pos: 150, align: 'right' }, 80)).toBe(0);
  });
});

describe('stop editing', () => {
  it('drops malformed stops and keeps one per position, sorted', () => {
    expect(
      cleanTabStops([
        { pos: 2000, align: 'right' },
        { pos: 'x', align: 'left' },
        { pos: -5, align: 'left' },
        null,
        { pos: 1000.4, align: 'sideways', leader: 'stars' },
        { pos: 2000, align: 'center', leader: 'dot' },
      ]),
    ).toEqual([
      { pos: 1000, align: 'left' },
      { pos: 2000, align: 'center', leader: 'dot' },
    ]);
    expect(cleanTabStops(undefined)).toEqual([]);
  });

  it('adds, moves and removes', () => {
    const one = withTabStop(undefined, { pos: 2000, align: 'right', leader: 'dot' });
    const two = withTabStop(one, { pos: 1000, align: 'left' });
    expect(two.map((s) => s.pos)).toEqual([1000, 2000]);
    expect(movedTabStop(two, 2000, 500)).toEqual([
      { pos: 500, align: 'right', leader: 'dot' },
      { pos: 1000, align: 'left' },
    ]);
    expect(withoutTabStop(two, 1000)).toEqual([{ pos: 2000, align: 'right', leader: 'dot' }]);
  });

  it('snaps to a quarter centimetre inside the column', () => {
    expect(snapTabPos(1430, 9026)).toBe(1417);
    expect(snapTabPos(20000, 9026)).toBe(9026);
    expect(snapTabPos(-50, 9026)).toBe(142);
  });
});

describe('presets', () => {
  const withParagraph = (text = bi('', '')): { worksheet: Worksheet; blockId: string } => {
    const worksheet = createWorksheet();
    const block = createParagraphBlock(text);
    worksheet.layout = [];
    worksheet.questions = [
      { id: 'q', type: 'structured', blocks: [block], parts: [], marks: 4 } as Worksheet['questions'][number],
    ];
    return { worksheet, blockId: block.id };
  };

  it('a name line fills an empty field and sets three underlined stops', () => {
    const { worksheet, blockId } = withParagraph();
    const target = { kind: 'blockText', blockId } as const;
    const next = applyTabPreset(worksheet, target, 'nameLine', 9026);
    expect(formatOfTarget(next, target)?.tabStops).toEqual(tabPresetStops('nameLine', 9026));
    expect(plain(textOfTarget(next, target)!.en)).toBe('Name:\tClass:\tNo.:\t');
    expect(plain(textOfTarget(next, target)!.zh)).toBe('姓名：\t班別：\t學號：\t');
  });

  it('an answer line closes typed text with a tab, and leaves an empty side empty', () => {
    const { worksheet, blockId } = withParagraph(bi('Reason:', ''));
    const target = { kind: 'blockText', blockId } as const;
    const next = applyTabPreset(worksheet, target, 'answerLine', 9026);
    expect(plain(textOfTarget(next, target)!.en)).toBe('Reason:\t');
    expect(plain(textOfTarget(next, target)!.zh)).toBe('');
    expect(plain(textOfTarget(applyTabPreset(next, target, 'answerLine', 9026), target)!.en)).toBe('Reason:\t');
  });

  it('right-aligned text changes only the stops', () => {
    const { worksheet, blockId } = withParagraph(bi('Source\tHKEJ', ''));
    const target = { kind: 'blockText', blockId } as const;
    const next = applyTabPreset(worksheet, target, 'rightText', 9026);
    expect(formatOfTarget(next, target)?.tabStops).toEqual([{ pos: 9026, align: 'right' }]);
    expect(textOfTarget(next, target)).toEqual(textOfTarget(worksheet, target));
  });

  it('Insert tab types a tab at the caret', () => {
    const { worksheet, blockId } = withParagraph(bi('Name:Class:', ''));
    const target = { kind: 'blockText', blockId } as const;
    const next = applyInsertTab(worksheet, target, 'en', 5, 5);
    expect(plain(textOfTarget(next, target)!.en)).toBe('Name:\tClass:');
  });
});
