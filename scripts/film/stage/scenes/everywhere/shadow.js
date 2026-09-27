// A smooth soft shadow for a floating window on the day backdrop: the gaussian-blurred
// edge of a rounded box, computed per texel (erfc of the signed distance), so it has no
// visible plane edge and no stepped rings.
import * as THREE from 'three';

// Abramowitz–Stegun erfc approximation (|error| < 1.5e-7).
function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const y = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-z * z);
  return x >= 0 ? y : 2 - y;
}

/** w×h box (world units), corner radius r, gaussian sigma s; returns a Mesh in the XY plane. */
export function softShadow({ w, h, r = 0.06, s = 0.2, color = '#3A342E', opacity = 0.12, res = 96 }) {
  const pad = 3 * s;
  const W = Math.ceil((w + 2 * pad) * res), H = Math.ceil((h + 2 * pad) * res);
  const data = new Uint8Array(W * H * 4);
  const hx = w / 2, hy = h / 2;
  for (let j = 0; j < H; j++) {
    const y = (j + 0.5) / res - (h / 2 + pad);
    for (let i = 0; i < W; i++) {
      const x = (i + 0.5) / res - (w / 2 + pad);
      const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r;
      const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
      const a = 0.5 * erfc(d / (s * Math.SQRT2));
      const o = (j * W + i) * 4;
      data[o] = data[o + 1] = data[o + 2] = Math.round(255 * a); // alphaMap reads green
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, W, H);
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({ color, alphaMap: tex, transparent: true, opacity, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w + 2 * pad, h + 2 * pad), material);
  mesh.name = 'softShadow';
  mesh.userData.dispose = () => {
    tex.dispose();
    material.dispose();
    mesh.geometry.dispose();
  };
  return mesh;
}
