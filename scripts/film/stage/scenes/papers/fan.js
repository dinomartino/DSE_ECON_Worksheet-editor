// The papers fan: every sheet turns about one pivot on the table (the XY plane; the camera
// looks up it from below, so it reads as a desk seen from a chair). The student copy is
// the hinge: at 56.0 it stands where marks left it, the rest of the pack hidden under it.
import * as THREE from 'three';
import { S_POS, S_ROT } from './deck.js';

const DEG = Math.PI / 180;

/** Fan order, bottom of the pack to top; the pair from marks is on top. */
export const ORDER = [
  'p1-cover', 'p2-cover', 'p2-page', 'lq-1', 'lq-2', 'diagram-question',
  'version-c', 'version-b', 'version-a', 'quiz-1', 'quiz-teacher-1',
];
export const S_K = 9; // the student copy
export const T_K = 10; // the teacher's copy

export const R = 2.6; // pivot → sheet centre
export const STEP = 8 * DEG; // between neighbours in the open fan
export const TH_S = S_ROT[2]; // the hinge angle
export const PIVOT = [S_POS[0] + R * Math.sin(TH_S), S_POS[1] - R * Math.cos(TH_S)];
export const SP_OPEN = 0.02; // layer gap in the open fan (shadows fall between layers)
export const SP_SHUT = 0.001; // hidden under the hinge
export const SP_STACK = 0.0045; // the neat stack
/** Turntable angle that centres the open fan, and the one that stands the stack upright. */
export const PHI_OPEN = -(TH_S + 4 * STEP);
export const PHI_STACK = STEP - TH_S;

/** Centre (x, y) of a sheet at fan angle g (pivot frame, turntable included). */
export const at = (g) => [PIVOT[0] - R * Math.sin(g), PIVOT[1] + R * Math.cos(g)];

/** Display-space brightness (0..1) → the linear multiplier that shows it. */
export const lin = (b) => (b <= 0.04045 ? b / 12.92 : ((b + 0.055) / 1.055) ** 2.4);

/**
 * A sheet texture at `width` px (the pack is seen small; full-size maps would cost ~45 MB
 * of GPU memory each). Same decode path as lib/clip.js loadImageTexture.
 */
export async function sheetTexture(ctx, name, width) {
  if (ctx.dry) return new THREE.Texture();
  const base = new URLSearchParams(location.search).get('assets') ?? '/assets/';
  const url = `${base}sheets/${name}.png`;
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
