/**
 * Label fitting for the axes diagrams: pure geometry, no text knowledge.
 *
 * The renderer lays labels out from fixed offsets, which is right at full width and wrong
 * when four figures share a page row (MC options in two columns, a figure grid): the plot
 * shrinks, the 10pt text does not, and the names of two parallel curves or two close ticks
 * (Y₂Y₁, AD₂AD₁) end up on each other. These helpers nudge only the labels that really
 * collide, so a diagram whose labels already clear each other renders as it always did.
 */

export interface LabelBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const boxesTouch = (a: LabelBox, b: LabelBox, gap = 0): boolean =>
  a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;

export const shiftBox = (box: LabelBox, dx: number, dy: number): LabelBox => ({
  x0: box.x0 + dx,
  x1: box.x1 + dx,
  y0: box.y0 + dy,
  y1: box.y1 + dy,
});

export interface Spread {
  /** Centre along the axis, px. */
  pos: number;
  /** Extent along the axis, px. */
  size: number;
}

/**
 * Pushes labels apart along one axis until neighbours keep `gap` between them, each moving
 * half the overlap (so a label stays near its own mark). Returns each label's shift, in
 * input order; a label that already clears its neighbours gets exactly 0.
 */
export function spreadAlong(items: Spread[], gap: number): number[] {
  const order = items.map((_, i) => i).sort((a, b) => items[a].pos - items[b].pos);
  const pos = items.map((item) => item.pos);
  for (let pass = 0; pass < 40; pass += 1) {
    let moved = false;
    for (let k = 0; k + 1 < order.length; k += 1) {
      const i = order[k];
      const j = order[k + 1];
      const need = (items[i].size + items[j].size) / 2 + gap;
      const have = pos[j] - pos[i];
      if (have < need - 1e-6) {
        const push = (need - have) / 2;
        pos[i] -= push;
        pos[j] += push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return pos.map((p, i) => p - items[i].pos);
}

/** Whether the polyline `pts` passes through `box` (sampled, 1.5px steps). */
function crosses(pts: Array<{ x: number; y: number }>, box: LabelBox): boolean {
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 1.5));
    for (let s = 0; s <= steps; s += 1) {
      const x = a.x + ((b.x - a.x) * s) / steps;
      const y = a.y + ((b.y - a.y) * s) / steps;
      if (x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1) return true;
    }
  }
  return false;
}

/**
 * A curve name's spot: where it sits if that clears every obstacle, otherwise the nearest
 * small move (down or up a line, or sideways) that does and stays on the canvas, preferring
 * one that also keeps off every curve. Returns the shift in px; `{0,0}` when nothing helps.
 */
export function freeSpot(
  box: LabelBox,
  obstacles: LabelBox[],
  curves: Array<Array<{ x: number; y: number }>>,
  canvas: { width: number; height: number },
  gap: number,
  /** Things to avoid only when the name has to move anyway (the axis lines): a name already
   *  resting on one stays, so a saved diagram without a label clash prints as it always did. */
  soft: LabelBox[] = [],
): { x: number; y: number } {
  const h = box.y1 - box.y0 + gap;
  const w = box.x1 - box.x0 + gap;
  const clear = (b: LabelBox) => !obstacles.some((o) => boxesTouch(b, o, gap));
  if (clear(box)) return { x: 0, y: 0 };
  const inside = (b: LabelBox) => b.x0 >= 0 && b.y0 >= 0 && b.x1 <= canvas.width && b.y1 <= canvas.height;
  const moves: Array<{ x: number; y: number }> = [];
  for (const ky of [0, 1, -1, 2, -2, 3, -3]) {
    for (const kx of [0, 0.5, -0.5, 1, -1]) {
      if (kx !== 0 || ky !== 0) moves.push({ x: kx * w, y: ky * h });
    }
  }
  moves.sort((a, b) => Math.hypot(a.x * 1.5, a.y) - Math.hypot(b.x * 1.5, b.y));
  const fits = moves.filter((m) => {
    const moved = shiftBox(box, m.x, m.y);
    return inside(moved) && clear(moved);
  });
  const offCurves = (list: typeof fits) =>
    list.find((m) => {
      const moved = shiftBox(box, m.x, m.y);
      return !curves.some((c) => crosses(c, moved));
    });
  const offSoft = fits.filter((m) => !soft.some((o) => boxesTouch(shiftBox(box, m.x, m.y), o, gap)));
  return offCurves(offSoft) ?? offSoft[0] ?? offCurves(fits) ?? fits[0] ?? { x: 0, y: 0 };
}
