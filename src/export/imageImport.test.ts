import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MAX_STORED_HEIGHT_PX,
  MAX_STORED_WIDTH_PX,
  planImageImport,
} from './imageImport';

/**
 * A worksheet carries its pictures inline, so what is decided at import is what a
 * teacher's document weighs for the rest of its life — and the failures are all
 * silent. Storing the display size would print mush; unifying on JPEG would ring the
 * axis labels of every chart crop; canvasing a GIF would drop the animation without a
 * word; and a format the exporter cannot decode breaks the `.docx` outright.
 *
 * The canvas half cannot run here (node, no DOM), which is exactly why every
 * judgement lives in `planImageImport`, which is pure.
 */

describe('what to store for an inserted picture', () => {
  it('leaves an already-small exportable picture exactly as it arrived', () => {
    // The common case — a screenshot or a chart crop. Not re-encoding is not merely
    // cheaper: it avoids a generation of loss and keeps the colour profile.
    for (const type of ['image/png', 'image/jpeg']) {
      expect(planImageImport(type, 800, 600, false)).toEqual({
        action: 'keep',
        reason: 'within-budget',
      });
    }
  });

  it('never upscales — a small picture is already its own best version', () => {
    const plan = planImageImport('image/png', 120, 90, false);
    expect(plan.action, 'a small PNG was re-encoded for no reason').toBe('keep');
  });

  it('caps an oversized picture at the printable width, keeping its aspect', () => {
    // A phone photo of a textbook figure: 4032×3024.
    const plan = planImageImport('image/jpeg', 4032, 3024, false);
    if (plan.action !== 'reencode') throw new Error('a 4032px photo must be reduced');
    expect(plan.width).toBe(MAX_STORED_WIDTH_PX);
    // Aspect preserved to the rounding.
    expect(plan.height).toBe(Math.round((3024 * MAX_STORED_WIDTH_PX) / 4032));
    expect(plan.oversized).toBe(true);
  });

  it('caps height too, so a rotated scan is not stored at full length', () => {
    // Portrait: within the width cap, far past the height one.
    const plan = planImageImport('image/jpeg', 1200, 6000, false);
    if (plan.action !== 'reencode') throw new Error('a 6000px-tall scan must be reduced');
    expect(plan.height).toBe(MAX_STORED_HEIGHT_PX);
    expect(plan.width).toBeLessThan(1200);
  });

  it('keeps a JPEG a JPEG — it is already lossy, and PNG would only inflate it', () => {
    const jpeg = planImageImport('image/jpeg', 4000, 3000, false);
    expect(jpeg.action === 'reencode' && jpeg.format).toBe('image/jpeg');
  });

  it('races an opaque PNG rather than assuming it is line art', () => {
    /*
     * The regression this rule exists for. Keeping the source's family
     * unconditionally sounded principled and stored a downscaled 2600px photograph as
     * a 6MB PNG — larger than the file that arrived, and alone past the whole 5MB
     * budget, so one insert made the document unsaveable. Measured in a browser.
     *
     * The race is safe without a classifier because the threshold is wide: line art
     * and flat colour compress so well as PNG that JPEG cannot approach it.
     */
    const png = planImageImport('image/png', 4000, 3000, false);
    expect(png.action === 'reencode' && png.format).toBe('race');
  });

  it('never races away a picture with transparency', () => {
    // JPEG has no alpha; flattening a cut-out is destructive and no size saving
    // justifies it. True whatever the source format.
    for (const type of ['image/png', 'image/webp']) {
      const plan = planImageImport(type, 4000, 3000, true);
      expect(plan.action === 'reencode' && plan.format, `${type} lost its alpha`).toBe('image/png');
    }
  });

  it('never sends an animated GIF through a canvas', () => {
    // `drawImage` takes frame one and the animation is gone with no sign of it. GIF
    // exports as-is, so there is nothing to repair at any size.
    expect(planImageImport('image/gif', 9000, 9000, false)).toEqual({
      action: 'keep',
      reason: 'animated',
    });
  });

  describe('a format the exporter cannot decode is repaired, not merely shrunk', () => {
    /*
     * `.docx` export matches PNG/JPEG/GIF only, so a WebP today does not merely take
     * space — it fails to export at all. Transcoding it is a bug fix.
     */
    it('transcodes a small WebP even though it is within the size cap', () => {
      const plan = planImageImport('image/webp', 400, 300, false);
      if (plan.action !== 'reencode') throw new Error('an unexportable format must be transcoded');
      expect(plan.oversized, 'it is being repaired, not shrunk').toBe(false);
      // Unchanged dimensions: there was nothing wrong with its size.
      expect([plan.width, plan.height]).toEqual([400, 300]);
    });

    it('chooses PNG when any pixel carries alpha, so transparency survives', () => {
      const plan = planImageImport('image/webp', 400, 300, true);
      expect(plan.action === 'reencode' && plan.format).toBe('image/png');
    });

    it('races PNG against JPEG when there is no alpha to lose', () => {
      const plan = planImageImport('image/webp', 400, 300, false);
      expect(plan.action === 'reencode' && plan.format).toBe('race');
    });
  });

  it('reduces an oversized picture that is also unexportable, in one pass', () => {
    const plan = planImageImport('image/webp', 5000, 4000, false);
    if (plan.action !== 'reencode') throw new Error('both problems must be fixed at once');
    expect(plan.width).toBe(MAX_STORED_WIDTH_PX);
    expect(plan.oversized).toBe(true);
  });
});

describe('the cap is the page, not a guess', () => {
  const source = readFileSync('src/export/imageImport.ts', 'utf8');

  it('stores enough pixels for 300 DPI across the widest column the app offers', () => {
    /*
     * A figure prints at `widthPx / 96` inches (the exporter's `EMU_PER_PX = 9525` is
     * 96dpi), resize is width-only, and the text column is a hard wall — so the
     * widest any picture can print is the widest content column. A4 portrait at the
     * narrowest preset margins (1.27cm) is 11906 − 1440 = 10466 twips.
     */
    const columnInches = (11906 - 2 * 720) / 1440;
    expect(MAX_STORED_WIDTH_PX / columnInches).toBeGreaterThanOrEqual(300);
  });

  it('does not store pixels no backend can emit', () => {
    // The other half of the same claim: a cap far above the print ceiling would be
    // spending a teacher's quota on resolution nothing can reach.
    const columnInches = (11906 - 2 * 720) / 1440;
    expect(MAX_STORED_WIDTH_PX / columnInches).toBeLessThan(320);
  });

  it('names every format the exporter can decode, and no others', () => {
    // The set here decides what gets transcoded; the exporter's regex decides what
    // survives. A format in one and not the other is either a needless re-encode or
    // a `.docx` that will not build.
    const exporter = readFileSync('src/export/docx/index.ts', 'utf8');
    const pattern = exporter.match(/const DATA_URL = .+/)?.[0] ?? '';
    expect(pattern, 'the exporter\'s accepted formats moved').toContain('png');

    for (const type of ['png', 'jpeg', 'gif']) {
      expect(source, `${type} is decodable by the exporter but not listed here`).toContain(
        `'image/${type}'`,
      );
      expect(pattern).toContain(type);
    }
    // webp is deliberately absent from the exporter, which is why it is transcoded.
    expect(pattern).not.toContain('webp');
  });
});

describe('the browser half guards what it cannot test here', () => {
  const source = readFileSync('src/export/imageImport.ts', 'utf8');

  it('asks the decoder to apply EXIF orientation', () => {
    /*
     * The single most likely silent corruption. A phone photo carries its rotation as
     * an EXIF tag; re-encoding strips the tag, so a decode that did not *apply* it
     * leaves the stored picture permanently sideways with no way back.
     */
    expect(source).toContain("imageOrientation: 'from-image'");
  });

  it('paints a white ground before anything becomes JPEG', () => {
    // JPEG has no alpha, and compositing transparency onto an unpainted canvas gives
    // black — a cut-out chart would arrive in a black box.
    expect(source).toContain('#ffffff');
    expect(source).toContain('destination-over');
  });

  it('decodes its own output before storing it', () => {
    // iOS canvas ceilings fail by returning blank pixels or `"data:,"` rather than by
    // throwing, so a 40Mpx scan can silently become a white rectangle.
    expect(source).toContain('did not decode at the expected size');
  });

  it('falls back to the original bytes rather than storing something broken', () => {
    // Quota is a problem a teacher can see and act on; a corrupted figure is not.
    const tail = source.slice(source.lastIndexOf('} catch {'));
    expect(tail).toContain('src: original');
  });
});
