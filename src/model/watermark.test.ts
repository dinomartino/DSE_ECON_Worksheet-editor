import { describe, expect, it } from 'vitest';
import v1Corpus from '@/test/corpus/v1-published.json';
import { migrate, serializeWorksheet } from './migrations';
import { parseWorksheet, stringifyWorksheet } from '@/storage/document';
import { renderWorksheet } from '@/render/worksheet';
import { buildPageFlowPaper } from '@/test/pageFlowFixture';
import { DEFAULT_PAGE_SETUP, contentWidth, pageDimensions } from './page';
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
  isFitted,
  keySheetWatermarks,
  questionWatermarks,
  watermarkCenter,
  withCoverWatermark,
  withFittedPlacement,
  withCenteredPlacement,
  isOffCenter,
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
    expect(placed.size).toBeDefined();
    expect(placed.centerX).toBeDefined();
    const again = watermarkBox(placed, DEFAULT_PAGE_SETUP);
    expect(Math.abs(again.left - dropped.left)).toBeLessThanOrEqual(2);
    expect(Math.abs(again.top - dropped.top)).toBeLessThanOrEqual(2);
    expect(Math.abs(again.width - dropped.width)).toBeLessThanOrEqual(2);
    expect(again.width / again.height).toBeCloseTo(2, 2);
  });

  it('Fit to margins drops size and place and fits it, keeping the rest', () => {
    const moved = mark({ centerX: 0.2, centerY: 0.8, size: 1.1, opacity: 0.3, pages: { q: false } });
    expect(isFitted(moved)).toBe(false);
    const fitted = withFittedPlacement(moved);
    expect(fitted).toEqual(mark({ fit: 'margins', opacity: 0.3, pages: { q: false } }));
    expect(isFitted(fitted)).toBe(true);
    expect(isFitted(mark({ fit: 'margins', size: 0.5 }))).toBe(false);
    // An old one, never moved, is not fitted: Fit to margins has something to do.
    expect(isFitted(mark())).toBe(false);
  });
});

/** The page inside its margins, in twips, as the tests compute it independently. */
const marginsOf = (setup: typeof DEFAULT_PAGE_SETUP) => {
  const page = pageDimensions(setup);
  return {
    left: setup.margins.left,
    top: setup.margins.top,
    width: page.width - setup.margins.left - setup.margins.right,
    height: page.height - setup.margins.top - setup.margins.bottom,
  };
};

describe('fitted to the margins (k-0557)', () => {
  const LANDSCAPE = { ...DEFAULT_PAGE_SETUP, orientation: 'landscape' as const };
  const LOPSIDED = { ...DEFAULT_PAGE_SETUP, margins: { ...DEFAULT_PAGE_SETUP.margins, top: 2880, left: 1800 } };

  it('a wide picture fills the text column, centred in the margin box', () => {
    for (const setup of [DEFAULT_PAGE_SETUP, LANDSCAPE, LOPSIDED]) {
      const box = watermarkBox(mark({ fit: 'margins' }), setup);
      const margins = marginsOf(setup);
      const shape = 400 / 200;
      // Width-limited unless the box is too short for it (A4 landscape is not, for 2:1).
      const width = Math.min(margins.width, margins.height * shape);
      expect(Math.abs(box.width - width)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.left + box.width / 2 - (margins.left + margins.width / 2))).toBeLessThanOrEqual(1);
      expect(Math.abs(box.top + box.height / 2 - (margins.top + margins.height / 2))).toBeLessThanOrEqual(1);
      expect(box.left).toBeGreaterThanOrEqual(margins.left - 1);
      expect(box.top).toBeGreaterThanOrEqual(margins.top - 1);
      expect(box.left + box.width).toBeLessThanOrEqual(margins.left + margins.width + 1);
      expect(box.top + box.height).toBeLessThanOrEqual(margins.top + margins.height + 1);
    }
  });

  it('a tall picture fills the margin box’s height, taller than an old one may be', () => {
    for (const setup of [DEFAULT_PAGE_SETUP, LANDSCAPE]) {
      const margins = marginsOf(setup);
      const box = watermarkBox(mark({ fit: 'margins', widthPx: 200, heightPx: 400 }), setup);
      expect(Math.abs(box.height - Math.min(margins.height, margins.width * 2))).toBeLessThanOrEqual(1);
      expect(box.width / box.height).toBeCloseTo(0.5, 2);
      expect(Math.abs(box.top + box.height / 2 - (margins.top + margins.height / 2))).toBeLessThanOrEqual(1);
    }
    const crest = watermarkBox(mark({ fit: 'margins', widthPx: 10, heightPx: 1000 }), DEFAULT_PAGE_SETUP);
    expect(Math.abs(crest.height - marginsOf(DEFAULT_PAGE_SETUP).height)).toBeLessThanOrEqual(1);
  });

  it('the Size slider reads the fitted width, and a resize from there does not jump', () => {
    const tall = mark({ fit: 'margins', widthPx: 300, heightPx: 400 });
    const box = watermarkBox(tall, DEFAULT_PAGE_SETUP);
    expect(watermarkSize(tall, DEFAULT_PAGE_SETUP)).toBeCloseTo(box.width / contentWidth(DEFAULT_PAGE_SETUP), 3);
    // A drag that lets go of the box where it is stores it where it is, at its full height.
    const same = withWatermarkPlacement(tall, DEFAULT_PAGE_SETUP, box);
    expect(same.fit).toBe('margins');
    const again = watermarkBox(same, DEFAULT_PAGE_SETUP);
    for (const key of ['left', 'top', 'width', 'height'] as const) {
      expect(Math.abs(again[key] - box[key])).toBeLessThanOrEqual(2);
    }
    // A little smaller from the bottom-right corner: smaller, not snapped to 80%.
    const smaller = watermarkBox(
      withWatermarkPlacement(tall, DEFAULT_PAGE_SETUP, { left: box.left, top: box.top, width: box.width * 0.95 }),
      DEFAULT_PAGE_SETUP,
    );
    expect(Math.abs(smaller.width - box.width * 0.95)).toBeLessThanOrEqual(2);
    expect(Math.abs(smaller.left - box.left)).toBeLessThanOrEqual(2);
    expect(Math.abs(smaller.top - box.top)).toBeLessThanOrEqual(2);
    // The slider's own commit keeps it centred in the margin box.
    const slid = watermarkBox({ ...tall, size: 0.5 }, DEFAULT_PAGE_SETUP);
    const margins = marginsOf(DEFAULT_PAGE_SETUP);
    expect(Math.abs(slid.width - margins.width * 0.5)).toBeLessThanOrEqual(1);
    expect(Math.abs(slid.top + slid.height / 2 - (margins.top + margins.height / 2))).toBeLessThanOrEqual(1);
  });

  it('a saved size and place are kept, not refitted', () => {
    const resized = mark({ fit: 'margins', size: 0.4, centerX: 0.3, centerY: 0.3 });
    const box = watermarkBox(resized, DEFAULT_PAGE_SETUP);
    expect(Math.abs(box.width - contentWidth(DEFAULT_PAGE_SETUP) * 0.4)).toBeLessThanOrEqual(1);
    expect(box.left + box.width / 2).toBeCloseTo(pageDimensions(DEFAULT_PAGE_SETUP).width * 0.3, -1);
    const reread = parseWorksheet(stringifyWorksheet({ ...buildPageFlowPaper(), watermark: resized } as Worksheet));
    expect(reread.watermark).toEqual(resized);
  });

  it('an old watermark keeps its size and place exactly', () => {
    for (const old of [mark(), mark({ size: 1.2 }), mark({ widthPx: 10, heightPx: 1000, size: 1 }), mark({ centerX: 0.3 })]) {
      const setup = LOPSIDED;
      const page = pageDimensions(setup);
      const box = watermarkBox(old, setup);
      const textHeight = page.height - setup.margins.top - setup.margins.bottom;
      let width = contentWidth(setup) * (old.size ?? WATERMARK_DEFAULT_SIZE);
      let height = (width * old.heightPx) / old.widthPx;
      if (height > textHeight * 0.8) {
        width *= (textHeight * 0.8) / height;
        height = textHeight * 0.8;
      }
      expect(Math.abs(box.width - width)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.left + box.width / 2 - page.width * (old.centerX ?? 0.5))).toBeLessThanOrEqual(1);
      expect(Math.abs(box.top + box.height / 2 - page.height * 0.5)).toBeLessThanOrEqual(1);
    }
  });

  it('Center goes to the margin box’s centre; an old one to the page’s', () => {
    const page = pageDimensions(LOPSIDED);
    const margins = marginsOf(LOPSIDED);
    const moved = mark({ fit: 'margins', size: 0.5, centerX: 0.2, centerY: 0.2 });
    expect(isOffCenter(moved, LOPSIDED)).toBe(true);
    const centred = withCenteredPlacement(moved);
    expect(isOffCenter(centred, LOPSIDED)).toBe(false);
    const box = watermarkBox(centred, LOPSIDED);
    expect(Math.abs(box.left + box.width / 2 - (margins.left + margins.width / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(box.top + box.height / 2 - (margins.top + margins.height / 2))).toBeLessThanOrEqual(1);
    expect(watermarkCenter(centred, LOPSIDED).x).toBeCloseTo((margins.left + margins.width / 2) / page.width, 6);
    expect(isOffCenter(mark(), LOPSIDED)).toBe(false);
    expect(watermarkCenter(mark(), LOPSIDED)).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe('Center', () => {
  it('puts a moved and resized watermark in the middle, keeping its size and the rest', () => {
    const moved = mark({ centerX: 0.2, centerY: 0.8, size: 1.1, opacity: 0.3, pages: { q: false } });
    expect(isOffCenter(moved)).toBe(true);
    const centred = withCenteredPlacement(moved);
    expect(centred).toEqual(mark({ size: 1.1, opacity: 0.3, pages: { q: false } }));
    expect(isOffCenter(centred)).toBe(false);
    const box = watermarkBox(centred, DEFAULT_PAGE_SETUP);
    const page = pageDimensions(DEFAULT_PAGE_SETUP);
    expect(Math.abs(box.left + box.width / 2 - page.width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.top + box.height / 2 - page.height / 2)).toBeLessThanOrEqual(1);
    expect(box.width).toBe(watermarkBox(moved, DEFAULT_PAGE_SETUP).width);
  });

  it('centres one that was only moved sideways, and offers nothing for one already central', () => {
    expect(isOffCenter(mark({ centerX: 0.3 }))).toBe(true);
    expect(isOffCenter(mark({ centerY: 0.9 }))).toBe(true);
    expect(isOffCenter(mark({ centerX: 0.5, centerY: 0.5, size: 0.9 }))).toBe(false);
    expect(isOffCenter(mark())).toBe(false);
    expect(withCenteredPlacement(mark({ centerX: 0.3 }))).toEqual(mark());
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

  it('takes a library picture fitted to the margins, keeping the paper’s own strength and page choices', () => {
    const before = mark({ opacity: 0.3, size: 0.5, pages: { q3: false }, on: false, libraryId: 'old' });
    const after = withWatermarkPicture(before, {
      id: 'new',
      name: 'St Mary’s',
      src: PIXEL_PNG,
      widthPx: 10,
      heightPx: 20,
    });
    expect(after).toMatchObject({ on: true, opacity: 0.3, fit: 'margins', pages: { q3: false }, libraryId: 'new', name: 'St Mary’s', widthPx: 10, heightPx: 20 });
    // A picture placed starts fitted (k-0557): the old one's size and place are dropped.
    expect(isFitted(after)).toBe(true);
    expect(withWatermarkPicture(undefined, { id: 'a', name: 'A', src: PIXEL_PNG, widthPx: 1, heightPx: 1 })).toEqual({
      on: true,
      fit: 'margins',
      src: PIXEL_PNG,
      widthPx: 1,
      heightPx: 1,
      name: 'A',
      libraryId: 'a',
    });
  });
});

describe('the marking scheme follows the paper', () => {
  const paperSheets = [{ flowIds: ['h1', 'q1', 'q2'] }, { flowIds: ['h2', 'q3'] }, { flowIds: ['q4'] }];

  it('gives each question the state of the paper sheet it starts on', () => {
    const state = questionWatermarks(mark({ pages: { h2: false } }), paperSheets);
    expect(['q1', 'q2', 'q3', 'q4'].map(state)).toEqual([true, true, false, true]);
    // Unmeasured: a question's own choice, else the switch.
    const loose = questionWatermarks(mark({ pages: { q3: false, h2: false } }));
    expect(['q1', 'q3'].map(loose)).toEqual([true, false]);
    expect(questionWatermarks(undefined)('q1')).toBe(false);
  });

  it('a key sheet takes its first question’s state; one with none, the sheet before’s', () => {
    const owners = [[undefined, 'q1', 'q2'], ['q2', 'q3'], [undefined], ['q4']];
    expect(keySheetWatermarks(mark({ pages: { h2: false } }), owners, paperSheets)).toEqual([true, true, true, true]);
    expect(keySheetWatermarks(mark({ pages: { h1: false } }), owners, paperSheets)).toEqual([false, false, false, true]);
    // The key's title page follows the paper's first page.
    expect(keySheetWatermarks(mark({ pages: { [WATERMARK_FIRST_PAGE]: false } }), [[undefined], ['q3']], paperSheets)).toEqual([false, true]);
    expect(keySheetWatermarks(mark({ on: false }), owners, paperSheets)).toEqual([false, false, false, false]);
    expect(keySheetWatermarks(undefined, owners)).toEqual([false, false, false, false]);
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
