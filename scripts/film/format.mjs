// The film's frame formats: one timeline, two frames (FILM.md §8, FILM-9x16.md).
// Pure data, browser-safe: no imports. `W`/`H` are the design px every scene lays out in
// (the DOM overlay, title-safe, the camera's frame); a render scales them to its own size.
// `safe` is the text safe area in design px (doctor's title-safe check, type.js's room).

export const FORMATS = {
  landscape: {
    id: 'landscape', W: 1920, H: 1080, preview: [960, 540], suffix: '',
    safe: { x0: 96, x1: 1824, y0: 72, y1: 1008 },
  },
  // Reels: the top ~220 px, the bottom ~420 px and a right-hand column are app UI.
  portrait: {
    id: 'portrait', W: 1080, H: 1920, preview: [540, 960], suffix: '-9x16',
    safe: { x0: 90, x1: 950, y0: 240, y1: 1480 },
  },
};

/** The format named `name` (default landscape); an unknown name throws. */
export function formatOf(name) {
  const f = FORMATS[name || 'landscape'];
  if (!f) throw new Error(`unknown format "${name}" (${Object.keys(FORMATS).join('|')})`);
  return f;
}

/** `table[format]`, e.g. pick('portrait', { landscape: 116, portrait: 96 }) → 96. */
export function pick(format, table) {
  if (!(format in table)) throw new Error(`pick: no value for format "${format}"`);
  return table[format];
}
