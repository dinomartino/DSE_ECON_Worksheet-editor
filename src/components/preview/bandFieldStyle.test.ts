import { describe, expect, it } from 'vitest';
import { createTextField } from '@/model/bands';
import { bi } from '@/model/text';
import type { TextFormat } from '@/model/types';
import { bandFieldStyle } from './BandEditor';

/**
 * One style function, two render paths.
 *
 * `BandEditor` (the active region) and `ReadOnlyBandRow` (an idle region, and the print /
 * PDF path) draw the same rows and must agree on formatting. `ReadOnlyBandRow` used to
 * ignore `field.format` entirely, so a 14pt bold school name previewed *and printed* at
 * the container's 12pt regular — and entering the header looked like it enlarged the
 * text, when in truth the idle state had been dropping the override all along.
 */
describe('bandFieldStyle', () => {
  const field = (format?: TextFormat) => ({
    ...createTextField(bi('SCHOOL NAME', '')),
    ...(format ? { format } : {}),
  });

  it('is empty for an unformatted field, so the named style shows through', () => {
    expect(bandFieldStyle(field())).toEqual({});
  });

  it('renders fontSize in points, the unit the model stores', () => {
    expect(bandFieldStyle(field({ fontSize: 14 }))).toEqual({
      fontSize: '14pt',
      lineHeight: 12 / 11,
    });
  });

  it('grows the line box with the size, or a tall row overprints the one above', () => {
    // A band row inherits the page's fixed 12pt line, so `fontSize` alone drew outside
    // it: two enlarged rows in one masthead landed on top of each other. `bandsHeight()`
    // already scales its estimate by the largest field size, so the DOM has to agree or
    // the preview disagrees with both the exporter and the paginator.
    expect(bandFieldStyle(field({ fontSize: 28 })).lineHeight).toBe(12 / 11);
    // Unset size keeps the row on the page's own rhythm — no override at all.
    expect(bandFieldStyle(field({ bold: true })).lineHeight).toBeUndefined();
  });

  it('carries every property the format toolbar can set', () => {
    // Not just size and weight: an underline or a colour that reached the export but not
    // the page would break the rule that the preview is the document.
    const style = bandFieldStyle(
      field({
        fontSize: 14,
        bold: true,
        italic: true,
        underline: true,
        color: 'ff0000',
        // Only the Latin face reaches CSS: the CJK face is a `w:rFonts` concern that
        // Word resolves per run, and naming it here would override the paper's own stack.
        fonts: { latin: 'Times New Roman', eastAsia: 'PMingLiU' },
      }),
    );
    expect(style).toEqual({
      fontSize: '14pt',
      lineHeight: 12 / 11,
      fontWeight: 700,
      fontStyle: 'italic',
      textDecoration: 'underline',
      color: '#ff0000',
      fontFamily: 'Times New Roman',
    });
  });

  it('omits a property rather than writing a falsy value for it', () => {
    // An explicit `fontWeight: 400` would override a named style that sets bold, which is
    // the whole reason `TextFormat` stores only deltas.
    const style = bandFieldStyle(field({ bold: false, italic: false }));
    expect(style).toEqual({});
  });
});
