// A paragraph-style name as a small accent pill beside the page (Word's style area, drawn
// generic): a canvas texture on a plane, `h` world units tall.
import * as THREE from 'three';

const FONT = (px) => `600 ${px}px -apple-system, "SF Pro Text", system-ui, sans-serif`;
const PX = 4; // canvas px per design px
const H_PX = 30;
const FONT_PX = 16;
const PAD_PX = 12;

export function styleTag(text, { h = 0.09 } = {}) {
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = FONT(FONT_PX);
  const wPx = Math.ceil(probe.measureText(text).width + 2 * PAD_PX);
  const c = document.createElement('canvas');
  c.width = wPx * PX;
  c.height = H_PX * PX;
  const g = c.getContext('2d');
  g.scale(PX, PX);
  g.beginPath();
  g.roundRect(0.5, 0.5, wPx - 1, H_PX - 1, (H_PX - 1) / 2);
  g.fillStyle = 'rgba(74, 163, 255, 0.18)';
  g.fill();
  g.strokeStyle = 'rgba(74, 163, 255, 0.7)';
  g.lineWidth = 1;
  g.stroke();
  g.font = FONT(FONT_PX);
  g.fillStyle = '#DCEDFF';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, wPx / 2, H_PX / 2 + 0.6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const w = (wPx / H_PX) * h;
  const material = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.renderOrder = 4;
  mesh.visible = false;
  mesh.userData.dispose = () => {
    tex.dispose();
    material.dispose();
    mesh.geometry.dispose();
  };
  return {
    mesh, w, h,
    set(opacity) {
      material.opacity = opacity;
      mesh.visible = opacity > 0.001;
    },
  };
}
