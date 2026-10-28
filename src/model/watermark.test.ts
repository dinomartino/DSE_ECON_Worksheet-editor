import { describe, expect, it } from 'vitest';
import v1Corpus from '@/test/corpus/v1-published.json';
import { migrate, serializeWorksheet } from './migrations';
import { parseWorksheet, stringifyWorksheet } from '@/storage/document';
import { renderWorksheet } from '@/render/worksheet';
import { buildPageFlowPaper } from '@/test/pageFlowFixture';
import { DEFAULT_PAGE_SETUP, pageDimensions } from './page';
import type { Watermark, Worksheet } from './types';
import {
  WATERMARK_DEFAULT_OPACITY,
  WATERMARK_DEFAULT_SIZE,
  WATERMARK_FIRST_PAGE,
  coverWatermark,
  docxWatermarkPlan,
  sheetWatermarks,
  watermarkBox,
  watermarkOf,
  watermarkOpacity,
  watermarkSize,
  hasCustomPlacement,
  watermarkCenter,
  withCoverWatermark,
  withDefaultPlacement,
  withWatermarkPlacement,
  withPaperWatermark,
  withSheetWatermark,
  withWatermarkPicture,
} from './watermark';

/** A 1×1 PNG: the smallest picture `watermarkOf` accepts. */
const PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const mark = (patch: Partial<Watermark> = {}): Watermark => ({
  on: true,
  src: PIXEL_PNG,
  widthPx: 400,
  heightPx: 200,
  ...patch,
});

describe('reading a watermark off a document', () => {
  it('is undefined on a document without one, and on one it cannot draw', () => {
    expect(watermarkOf({})).toBeUndefined();
    expect(watermarkOf({ watermark: mark({ src: 'https://example.com/logo.png' }) })).toBeUndefined();
    expect(watermarkOf({ watermark: mark({ src: 'data:image/svg+xml;base64,PHN2Zy8+' }) })).toBeUndefined();
    expect(watermarkOf({ watermark: mark({ widthPx: 0 }) })).toBeUndefined();
    expect(watermarkOf({ watermark: { on: true } as unknown as Watermark })).toBeUndefined();
    expect(watermarkOf({ watermark: 'logo' as unknown as Watermark })).toBeUndefined();
    expect(watermarkOf({ watermark: mark() })).toEqual(mark());
  });

  it('defaults a faint, centred picture and clamps what a hand-edited file says', () => {
    expect(watermarkOpacity(mark())).toBe(WATERMARK_DEFAULT_OPACITY);
    expect(watermarkSize(mark())).toBe(WATERMARK_DEFAULT_SIZE);
    expect(watermarkOpacity(mark({ opacity: 7 }))).toBe(1);
    expect(watermarkOpacity(mark({ opacity: -1 }))).toBe(0.05);
    expect(watermarkSize(mark({ size: 0 }))).toBe(0.2);
  });

  it('centres the picture on the page, at its own shape, never taller than the text', () => {
    const page = pageDimensions(DEFAULT_PAGE_SETUP);
    const wide = watermarkBox(mark(), DEFAULT_PAGE_SETUP);
    expect(wide.left * 2 + wide.width).toBeCloseTo(page.width, -1);
    expect(wide.top * 2 + wide.height).toBeCloseTo(page.height, -1);
    expect(wide.width / wide.height).toBeCloseTo(2, 1);

    const tall = watermarkBox(mark({ widthPx: 10, heightPx: 1000, size: 1 }), DEFAULT_PAGE_SETUP);
    const textHeight = page.height - DEFAULT_PAGE_SETUP.margins.top - DEFAULT_PAGE_SETUP.margins.bottom;
    expect(tall.height).toBeLessThanOrEqual(Math.ceil(textHeight * 0.8));
    expect(tall.width / tall.height).toBeCloseTo(0.01, 3);
  });
});

describe('moving and resizing it on the page', () => {
  const page = pageDimensions(DEFAULT_PAGE_SETUP);

  it('sits where its centre was dragged, as a share of the page', () => {
    const box = watermarkBox(mark({ centerX: 0.3, centerY: 0.25 }), DEFAULT_PAGE_SETUP);
    expect(box.left + box.width / 2).toBeCloseTo(page.width * 0.3, -1);
    expect(box.top + box.height / 2).toBeCloseTo(page.height * 0.25, -1);
    expect(watermarkCenter(mark())).toEqual({ x: 0.5, y: 0.5 });
  });

  it('is kept whole on the page, however far it was dragged', () => {
    const corner = watermarkBox(mark({ centerX: 0, centerY: 1 }), DEFAULT_PAGE_SETUP);
    expect(corner.left).toBe(0);
    expect(corner.top + corner.height).toBe(page.height);
    const wild = watermarkBox(mark({ centerX: 9, centerY: -3, size: 99 }), DEFAULT_PAGE_SETUP);
    expect(wild.left + wild.width).toBeLessThanOrEqual(page.width);
    expect(wild.top).toBe(0);
  });

  it('stores a dragged box as centre and size, and draws it back where it was let go', () => {
    const start = watermarkBox(mark(), DEFAULT_PAGE_SETUP);
    const dropped = { left: start.left - 1200, top: start.top + 2000, width: start.width * 1.2 };
    const placed = withWatermarkPlacement(mark(), DEFAULT_PAGE_SETUP, dropped);
    expect(hasCustomPlacement(placed)).toBe(true);
    const again = watermarkBox(placed, DEFAULT_PAGE_SETUP);
    expect(Math.abs(again.left - dropped.left)).toBeLessThanOrEqual(2);
    expect(Math.abs(again.top - dropped.top)).toBeLessThanOrEqual(2);
    expect(Math.abs(again.width - dropped.width)).toBeLessThanOrEqual(2);
    expect(again.width / again.height).toBeCloseTo(2, 2);
  });

  it('Reset to default puts it back in the middle at the default size, keeping the rest', () => {
    const moved = mark({ centerX: 0.2, centerY: 0.8, size: 1.1, opacity: 0.3, pages: { q: false } });
    const reset = withDefaultPlacement(moved);
    expect(reset).toEqual(mark({ opacity: 0.3, pages: { q: false } }));
    expect(hasCustomPlacement(reset)).toBe(false);
    expect(watermarkBox(reset, DEFAULT_PAGE_SETUP)).toEqual(watermarkBox(mark(), DEFAULT_PAGE_SETUP));
  });
});

describe('which sheets carry it', () => {
  const sheets = [{ flowIds: ['h1', 'q1', 'q2'] }, { flowIds: ['q3'] }, { flowIds: [] }, { flowIds: ['br', 'q4'] }];

  it('follows the paper switch on every sheet when no page said otherwise', () => {
    expect(sheetWatermarks(mark(), sheets)).toEqual([true, true, true, true]);
    expect(sheetWatermarks(mark({ on: false }), sheets)).toEqual([false, false, false, false]);
    expect(sheetWatermarks(undefined, sheets)).toEqual([false, false, false, false]);
  });

  it('lets a page choice ride on its content, the first item on the sheet winning', () => {
    expect(sheetWatermarks(mark({ pages: { q3: false } }), sheets)).toEqual([true, false, false, true]);
    // q2 is on sheet 1 but not first: its choice still counts there.
    expect(sheetWatermarks(mark({ pages: { q2: false } }), sheets)).toEqual([false, true, true, true]);
    // Two choices on one sheet: the first in order wins.
    expect(sheetWatermarks(mark({ pages: { q1: true, q2: false } }), sheets)).toEqual([true, true, true, true]);
    // A page turned on while the paper is off.
    expect(sheetWatermarks(mark({ on: false, pages: { br: true } }), sheets)).toEqual([false, false, false, true]);
    // The content moved to another sheet: the choice moved with it.
    const moved = [{ flowIds: ['h1', 'q1', 'q2', 'q3'] }, { flowIds: ['br', 'q4'] }];
    expect(sheetWatermarks(mark({ pages: { q3: false } }), moved)).toEqual([false, true]);
  });

  it('gives a tail-only sheet the choice of the sheet before it', () => {
    expect(sheetWatermarks(mark({ pages: { q3: false } }), sheets)[2]).toBe(false);
    expect(sheetWatermarks(mark(), sheets)[2]).toBe(true);
  });

  it('stores a first page with no flow item of its own under its own key', () => {
    const titleOnly = [{ flowIds: [] }, { flowIds: ['q1'] }];
    expect(sheetWatermarks(mark({ pages: { [WATERMARK_FIRST_PAGE]: false } }), titleOnly)).toEqual([false, true]);
    expect(sheetWatermarks(mark(), titleOnly)).toEqual([true, true]);
  });
});

describe('turning one page, the cover or the paper on and off', () => {
  const sheets = [{ flowIds: ['q1', 'q2'] }, { flowIds: ['q3'] }];

  it('stores a page choice only where it differs, and clears the sheet’s old ones', () => {
    const off = withSheetWatermark(mark(), sheets[1], 1, false)!;
    expect(off.pages).toEqual({ q3: false });
    expect(sheetWatermarks(off, sheets)).toEqual([true, false]);
    const back = withSheetWatermark(off, sheets[1], 1, true)!;
    expect(back.pages).toBeUndefined();
    expect(back).toEqual(mark());

    // A moved-in item's old choice does not outvote the click.
    const stale = mark({ pages: { q2: false } });
    const on = withSheetWatermark(stale, sheets[0], 0, true)!;
    expect(sheetWatermarks(on, sheets)).toEqual([true, true]);
    expect(on.pages).toBeUndefined();
  });

  it('has nothing to store on a sheet that holds only a tail', () => {
    expect(withSheetWatermark(mark(), { flowIds: [] }, 3, false)).toBeUndefined();
  });

  it('first page: its own key goes first', () => {
    const off = withSheetWatermark(mark(), sheets[0], 0, false)!;
    expect(off.pages).toEqual({ [WATERMARK_FIRST_PAGE]: false });
  });

  it('keeps page choices across the paper switch, dropping only those it now agrees with', () => {
    const one = mark({ pages: { q3: false } });
    const paperOff = withPaperWatermark(one, false);
    expect(paperOff.on).toBe(false);
    expect(paperOff.pages).toBeUndefined();
    const tuned = mark({ on: false, pages: { q3: true } });
    expect(withPaperWatermark(tuned, true).pages).toBeUndefined();
    expect(withPaperWatermark(mark({ pages: { q3: false } }), true).pages).toEqual({ q3: false });
  });

  it('turns the cover on and off on its own', () => {
    expect(coverWatermark(mark())).toBe(true);
    const off = withCoverWatermark(mark(), false);
    expect(off.cover).toBe(false);
    expect(coverWatermark(off)).toBe(false);
    expect(withCoverWatermark(off, true)).toEqual(mark());
    expect(coverWatermark(undefined)).toBe(false);
    expect(coverWatermark(mark({ on: false }))).toBe(false);
  });

  it('takes a library picture, keeping the paper’s own strength, size and page choices', () => {
    const before = mark({ opacity: 0.3, size: 0.5, pages: { q3: false }, on: false, libraryId: 'old' });
    const after = withWatermarkPicture(before, {
      id: 'new',
      name: 'St Mary’s',
      src: PIXEL_PNG,
      widthPx: 10,
      heightPx: 20,
    });
    expect(after).toMatchObject({ on: true, opacity: 0.3, size: 0.5, pages: { q3: false }, libraryId: 'new', name: 'St Mary’s', widthPx: 10, heightPx: 20 });
    expect(withWatermarkPicture(undefined, { id: 'a', name: 'A', src: PIXEL_PNG, widthPx: 1, heightPx: 1 })).toEqual({
      on: true,
      src: PIXEL_PNG,
      widthPx: 1,
      heightPx: 1,
      name: 'A',
      libraryId: 'a',
    });
  });
});

describe('how the .docx carries it', () => {
  const paper = buildPageFlowPaper();
  const first = paper.questions[0].id;

  it('in the header when every page has it, at the sheets when they differ, else nowhere', () => {
    expect(docxWatermarkPlan(paper)).toBe('none');
    expect(docxWatermarkPlan({ ...paper, watermark: mark() })).toBe('every');
    expect(docxWatermarkPlan({ ...paper, watermark: mark({ on: false }) })).toBe('none');
    expect(docxWatermarkPlan({ ...paper, watermark: mark({ pages: { [first]: false } }) })).toBe('some');
    expect(docxWatermarkPlan({ ...paper, watermark: mark({ on: false, pages: { [first]: true } }) })).toBe('some');
    expect(docxWatermarkPlan({ ...paper, watermark: mark({ pages: { [WATERMARK_FIRST_PAGE]: false } }) })).toBe('some');
  });

  it('ignores a choice left under content since deleted', () => {
    expect(docxWatermarkPlan({ ...paper, watermark: mark({ pages: { 'gone-question': false } }) })).toBe('every');
  });
});

describe('old papers, and saving a watermark', () => {
  it('the frozen v1 corpus opens with no watermark', () => {
    const worksheet = migrate(structuredClone(v1Corpus));
    expect(worksheet.watermark).toBeUndefined();
    expect(watermarkOf(worksheet)).toBeUndefined();
    expect(docxWatermarkPlan(worksheet)).toBe('none');
  });

  it('a watermark survives save and reload (it is in KNOWN_KEYS)', () => {
    const saved: Worksheet = {
      ...buildPageFlowPaper(),
      watermark: mark({
        opacity: 0.2,
        size: 0.7,
        centerX: 0.3,
        centerY: 0.6,
        pages: { x: false },
        cover: false,
        name: 'Logo',
        libraryId: 'wm-1',
      }),
    };
    const reloaded = parseWorksheet(stringifyWorksheet(saved));
    expect(reloaded.watermark).toEqual(saved.watermark);
    expect((reloaded as unknown as { __unknown?: Record<string, unknown> }).__unknown?.watermark).toBeUndefined();
    expect(serializeWorksheet(saved).watermark).toEqual(saved.watermark);
  });

  it('a broken watermark in a file still opens and renders, with no watermark', () => {
    const broken = { ...buildPageFlowPaper(), watermark: { on: true, src: 42 } } as unknown as Worksheet;
    const reloaded = parseWorksheet(JSON.stringify(broken));
    expect(watermarkOf(reloaded)).toBeUndefined();
    expect(() => renderWorksheet(reloaded, { language: 'en', version: 'student' })).not.toThrow();
  });
});
