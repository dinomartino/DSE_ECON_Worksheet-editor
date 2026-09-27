// The papers fan: every sheet turns about one pivot on the table (the XY plane; the camera
// looks up it from below, so it reads as a desk seen from a chair). The student copy is
// the hinge and the top of the pack: at 56.0 it stands where marks left it, the teacher's
// copy beside it, the rest hidden under it. The pack opens to the right, quiz to mock paper.
import * as THREE from 'three';
import { S_POS, S_ROT, PAIR } from './deck.js';

const DEG = Math.PI / 180;

/**
 * The pack: each sheet's asset, its angle in the open fan from the hinge (negative turns it
 * right), its depth under the hinge in layers, and `rad`, how far it sits out along its
 * radius. The left half lies top-left over the next sheet; Versions C, B and A stand in a
 * stair like a hand of cards, each header out above the one in front. The right half lies
 * the other way, so the Paper 1 cover is whole and the Paper 2 cover shows its left side;
 * the LQ worksheet at the bottom of the V shows its dotted lines. `beat`: its tap in the
 * held fan (scene s).
 */
export const PACK = [
  { path: PAIR.student, off: 0, depth: 0, beat: 2.0 },
  { path: PAIR.teacher, off: -12, depth: 1, beat: 2.0 },
  { path: 'sheets/version-a.png', off: -26, depth: 4, rad: 0.34, beat: 2.5 },
  { path: 'sheets/version-b.png', off: -25, depth: 3, rad: 0.17, beat: 2.58 },
  { path: 'sheets/version-c.png', off: -24, depth: 2, beat: 2.66 },
  { path: 'sheets/lq-1.png', off: -37, depth: 7, beat: 3.0 },
  { path: 'sheets/p2-cover.png', off: -49, depth: 6, beat: 3.5 },
  { path: 'sheets/p1-cover.png', off: -61, depth: 5, beat: 4.0 },
].map((s) => ({ rad: 0, ...s, off: s.off * DEG }));
export const S_K = 0; // the student copy
export const T_K = 1; // the teacher's copy
const OFF_END = PACK[PACK.length - 1].off;

export const R = 2.6; // pivot → sheet centre
export const TH_S = S_ROT[2]; // the hinge angle
export const PIVOT = [S_POS[0] + R * Math.sin(TH_S), S_POS[1] - R * Math.cos(TH_S)];
export const SP_OPEN = 0.02; // layer gap in the open fan (shadows fall between layers)
export const SP_SHUT = 0.001; // hidden under the hinge
export const SP_STACK = 0.0045; // the neat stack
/** Turntable angle that centres the open fan, and the one that stands the stack upright. */
export const PHI_OPEN = -(TH_S + OFF_END / 2);
export const PHI_STACK = -TH_S;

/** Centre (x, y) of a sheet at fan angle g, `rad` out along its radius (turntable included). */
export const at = (g, rad = 0) => [PIVOT[0] - (R + rad) * Math.sin(g), PIVOT[1] + (R + rad) * Math.cos(g)];

/** Display-space brightness (0..1) → the linear multiplier that shows it. */
export const lin = (b) => (b <= 0.04045 ? b / 12.92 : ((b + 0.055) / 1.055) ** 2.4);

/**
 * A sheet texture at `width` px (the pack is seen small; full-size maps would cost ~45 MB
 * of GPU memory each). Same decode path as lib/clip.js loadImageTexture.
 */
export async function sheetTexture(ctx, path, width) {
  if (ctx.dry) return new THREE.Texture();
  const base = new URLSearchParams(location.search).get('assets') ?? '/assets/';
  const url = `${base}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const bitmap = await createImageBitmap(await res.blob(), {
    imageOrientation: 'flipY',
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
    resizeWidth: width,
    resizeHeight: Math.round((width * 3366) / 2379),
    resizeQuality: 'high',
  });
  const tex = new THREE.Texture(bitmap);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  ctx.renderer.initTexture(tex);
  ctx.onDispose(() => {
    tex.dispose();
    bitmap.close();
  });
  return tex;
}
