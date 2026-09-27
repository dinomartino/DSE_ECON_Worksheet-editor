// everywhere, 9:16 (FILM-9x16.md): the same beats restaged for a tall frame. The headline
// sits in the upper block, the glass chips spring into two rows under it, the Export dialog
// fills the middle and runs on into the caption zone. The truck becomes a pedestal down: the
// dialog and chips whoosh up out of frame as the browser rises in from below; Mac and
// Windows arrive from the front below, each earlier window stepping back and up, so the
// stack reads browser (top) → Mac → Windows (front, bottom) under the three lines.

// World units at the camera's rest distance (10, fov 30): 1920 px / 5.36 u ≈ 358 px per unit.
export const LAYOUT = {
  card: { h: 3.6, pos: [0, -1.4, 0], yaw: 0.05, pitch: -0.06 },
  // Two rows under the headline: PDF + Answer key, then the three quiz apps.
  rows: [{ y: 1.02, items: [0, 1] }, { y: 0.68, items: [2, 3, 4] }],
  rowX: 0,
  chipZ: 0.35,
  chipGap: 0.1,
  unit: 0.0027, // ≈ one design px at the chips' depth
  chip: { hPx: 100, fontPx: 46, padPx: 40 },
  // The windows live one pedestal below; they ride up from beneath it.
  off: [0, -7.2],
  lagAxis: 1,
  lag: -3.0, // subtracted: the browser starts 3 u above its slot, so it rises into frame early
  slots: [
    { pos: [-0.07, -0.4, 0.5], rot: [0.02, -0.06, 0] }, // top edge at y≈950 px
    { pos: [-0.04, 0, -1.1], rot: [0.02, -0.06, 0] }, // ≈820: its chrome and a band of page show
    { pos: [0, 0.6, -2.8], rot: [0.02, -0.06, 0] }, // ≈670, under the Chinese line
  ],
  from: { pos: [0.5, -3.6, 2.2], rot: [0.35, -0.25, 0] },
  winW: 2.4,
  // Each window's screen cropped to the part that matters (source px of the 2880×1800 still).
  crops: [
    [0, 0, 1300, 900], // start screen: "Start a worksheet…" and the first thumbnails
    [250, 0, 1300, 900], // the diagram canvas with its toolbar
    [400, 0, 1300, 900], // the teacher's copy
  ],
  still: [2880, 1800],
  text: { x: 90, w: 860, y: [292, 396, 500], size: 92 },
  zhDy: 84,
  zhSize: 40,
  export: { x: 540, y: 452, size: 96 },
};

/**
 * The camera, as a pure function of scene time: a tilt up off the dialog after the hit, a slow drift down
 * the dialog, the pedestal down to the browser (close), a pull back as the stack builds,
 * then a push and a turn into the cut.
 * `truck`, `solo`, `end`, `stack`, `d` are the landscape rig's curves, shared.
 */
export function portraitCamera(t, { camera, lib, T, truck, solo, end, stack, d }) {
  const { ease: E, camera: cam } = lib;
  const settle = 1 - E.expoOut(E.seg(t, 0, 1.4));
  const dist = 10 * (1 - 0.15 * settle) * (1 - 0.03 * E.seg(t, 0, 3.4)) * (1 - 0.02 * E.seg(t, T.truck[1], T.push[0])) *
    (1 - 0.07 * solo) * (1 - 0.1 * end);
  const off = LAYOUT.off[1];
  // The hit lands close on the dialog and tilts up to make room for the headline, then drifts
  // down the dialog a touch; after the pedestal the aim rises with the stack.
  const y0 = 0.05 - 0.12 * E.sineInOut(E.seg(t, 0, 3.4)) - 0.95 * settle;
  const y1 = off + E.lerp(-0.2, 0.48, stack / 2) - 0.16 * solo;
  cam.orbit(camera, {
    target: [0.02 * (1 - truck), E.lerp(y0, y1, truck), 0],
    dist: dist * d.dist,
    az: E.lerp(3.2 - 2.2 * E.sineInOut(E.seg(t, 0, 3.4)), 1.6 - 1.2 * E.sineInOut(E.seg(t, T.truck[1] - 0.6, T.push[0] + 0.5)), truck) + 3.5 * end + d.az,
    el: E.lerp(1.2, 2.4, truck) - 2.5 * end + d.el,
    roll: d.roll,
    fov: 30,
  });
}
