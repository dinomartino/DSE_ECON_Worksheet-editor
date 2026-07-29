import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BLANK_CLICK_EXEMPT } from './Preview';

/**
 * `isBlankAreaClick` decides whether a click landed on bare paper, and "bare paper"
 * means `clearPageSelection` — which drops every selection *and returns focus to the
 * body*. So an element the selector fails to name is not merely unselectable: clicking
 * it silently leaves whichever region the teacher was working in.
 *
 * That is exactly what happened. The list named `data-band-field`, an attribute no
 * component has ever rendered, while the real header/footer fields carry
 * `data-field-id`. Every click inside an active header therefore counted as blank paper
 * and deactivated the header on the way — the region could be entered by double-click
 * but never actually worked in.
 *
 * A selector naming a non-existent attribute is invisible from either side: the CSS is
 * valid, the components are correct, and only the two together are wrong. These tests
 * tie them to each other.
 */

const dataAttrs = (selector: string) =>
  [...selector.matchAll(/\[data-([a-z-]+)/g)].map((match) => `data-${match[1]}`);

describe('blank-area click exemptions', () => {
  it('names only attributes some component actually renders', () => {
    // The files that draw anything clickable on the sheet.
    const sources = [
      'src/components/preview/Preview.tsx',
      'src/components/preview/BandEditor.tsx',
      'src/components/preview/InlineEditable.tsx',
      'src/components/preview/RichTextEditable.tsx',
      'src/components/preview/ResizableBlock.tsx',
    ]
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');

    for (const attribute of dataAttrs(BLANK_CLICK_EXEMPT)) {
      /*
       * Rendered, not merely mentioned: the attribute has to appear somewhere other
       * than inside the selector string itself. `data-band-field` passed a naive
       * "is it in the file" check precisely because the broken selector contained it.
       */
      const withoutSelector = sources.split(BLANK_CLICK_EXEMPT).join('');
      expect(
        withoutSelector.includes(attribute),
        `${attribute} is exempted from blank-area clicks but no component renders it — ` +
          `a click on that element would clear the selection and leave the active region`,
      ).toBe(true);
    }
  });

  it('exempts the header and footer fields, so clicking one keeps the region active', () => {
    // The specific regression: band fields are marked with `data-field-id`.
    expect(BLANK_CLICK_EXEMPT).toContain('[data-field-id]');
    // And the row itself, so the gaps between fields are not "blank paper" either.
    expect(BLANK_CLICK_EXEMPT).toContain('[data-band-rows]');
  });
});
