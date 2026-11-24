/**
 * One picture for a set of a reference's pictures that are printed together (k-0544): a grid
 * of diagrams in a stem table, "(1)"–"(4)" (HKDSE 2023 Paper 1 Q36), or a diagram under every
 * option, "A"–"D". Laid out as printed, each under its label, on white, its long side at most
 * `COMPOSITE_MAX_SIDE`: the model reads one picture instead of four (about a quarter of the
 * picture tokens) and sees the set as the student does.
 *
 * Browser only (a canvas); `drawComposite` gives undefined anywhere else or on any failure, and
 * the pictures then go one by one. No imports: `scripts/studio-composite-sheet.mjs` loads this
 * file as it is into a real browser to draw the contact sheet.
 */

export interface CompositeCell {
  dataUrl: string;
  /** "(1)", "A": printed above the picture. */
  label: string;
  row: number;
  col: number;
}

export interface CompositeBox {
  dataUrl: string;
  label: string;
  /** The picture's box, in output pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The label's baseline. */
  labelX: number;
  labelY: number;
}

export interface CompositeLayout {
  width: number;
  height: number;
  fontPx: number;
  boxes: CompositeBox[];
}

/** The long side of a composite, in pixels: enough for axis labels to stay readable. */
export const COMPOSITE_MAX_SIDE = 1600;
const PAD = 24;

/**
 * Where each picture goes: columns as wide as the widest picture in the set (never wider than
 * the long side allows), each picture scaled to the column, rows as tall as their tallest
 * picture plus a label line. Every picture is drawn the column's width. Pure: sizes are the pictures' natural sizes.
 */
export function compositeLayout(cells: readonly CompositeCell[], sizes: ReadonlyArray<{ w: number; h: number }>, maxSide = COMPOSITE_MAX_SIDE): CompositeLayout {
  const rows = Math.max(...cells.map((c) => c.row)) + 1;
  const cols = Math.max(...cells.map((c) => c.col)) + 1;
  const widest = Math.max(...sizes.map((s) => s.w));
  let colW = Math.min(widest, (maxSide - PAD * (cols + 1)) / cols);
  const layoutAt = (cw: number) => {
    const fontPx = Math.round(Math.max(18, Math.min(40, cw / 14)));
    const labelH = Math.round(fontPx * 1.5);
    const scaled = sizes.map((s) => ({ w: cw, h: s.h * (cw / Math.max(1, s.w)) }));
    const rowH = Array.from({ length: rows }, (_, r) => Math.max(0, ...cells.map((c, i) => (c.row === r ? scaled[i].h : 0))) + labelH);
    const rowY = rowH.map((_, r) => PAD + rowH.slice(0, r).reduce((a, b) => a + b + PAD, 0));
    const boxes = cells.map((c, i) => {
      const x = PAD + c.col * (cw + PAD);
      const y = rowY[c.row] + labelH;
      return { dataUrl: c.dataUrl, label: c.label, x: Math.round(x + (cw - scaled[i].w) / 2), y: Math.round(y), w: Math.round(scaled[i].w), h: Math.round(scaled[i].h), labelX: Math.round(x), labelY: Math.round(y - labelH * 0.3) };
    });
    const width = Math.round(PAD + cols * (cw + PAD));
    const height = Math.round(rowY[rows - 1] + rowH[rows - 1] + PAD);
    return { width, height, fontPx, boxes };
  };
  let layout = layoutAt(colW);
  // A tall set (four options stacked) is shrunk until its long side fits too.
  for (let tries = 0; layout.height > maxSide && tries < 12; tries += 1) {
    colW *= (maxSide / layout.height) * 0.97;
    layout = layoutAt(colW);
  }
  return layout;
}

function load(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('picture'));
    image.src = dataUrl;
  });
}

/** The set as one PNG (JPEG when the PNG would be too large to send), or undefined (no canvas, a picture that will not load). */
export async function drawComposite(cells: readonly CompositeCell[], maxBytes = 2_000_000): Promise<string | undefined> {
  if (typeof document === 'undefined' || cells.length < 2) return undefined;
  try {
    const images = await Promise.all(cells.map((c) => load(c.dataUrl)));
    const layout = compositeLayout(cells, images.map((im) => ({ w: im.naturalWidth || im.width, h: im.naturalHeight || im.height })));
    const canvas = document.createElement('canvas');
    canvas.width = layout.width;
    canvas.height = layout.height;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, layout.width, layout.height);
    context.imageSmoothingQuality = 'high';
    context.fillStyle = '#000000';
    context.font = `bold ${layout.fontPx}px Arial, Helvetica, sans-serif`;
    context.textBaseline = 'alphabetic';
    layout.boxes.forEach((box, i) => {
      context.fillText(box.label, box.labelX, box.labelY);
      context.drawImage(images[i], box.x, box.y, box.w, box.h);
    });
    const png = canvas.toDataURL('image/png');
    return png.length <= maxBytes ? png : canvas.toDataURL('image/jpeg', 0.9);
  } catch {
    return undefined;
  }
}
