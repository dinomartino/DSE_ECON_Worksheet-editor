// A generic document-app window (lib.win, no product branding) holding the real exported
// .docx page. Dark appearance for the night world: lib.win's frameless variant with a
// drawn title bar (traffic lights, file name) over a dark canvas and the page's shadow.
// The page itself is a lit sheet at the slot, so it can arrive on its own and be clipped
// at the window's bottom edge. Used by `word` and by the montage's .docx shot.
import * as THREE from 'three';
import { litSheet } from './sheet.js';

export const DOC = {
  texture: 'docx-page', // asset id: the two-part document marks edits
  // As the app names it: fileTitle() turns ':' into '-', docxFileName() adds (Student) (EN).
  title: 'S5 Market Intervention- Diagrams (Student) (EN).docx',
  aspect: 2573 / 1819, // page h / w
  // Ink boxes on the render, [u0, top0, u1, top1] in page fractions from the top-left.
  regions: {
    num1: [0.1237, 0.1364, 0.133, 0.1485], // "1." (Word list numbering, level 1)
    numA: [0.1523, 0.464, 0.1704, 0.4757], // "(a)" (level 2)
    title: [0.3058, 0.089, 0.6942, 0.1061], // ink 0.3018–0.6982, inset to clear the line below
    stem: [0.1237, 0.1364, 0.7279, 0.1485],
    part: [0.1523, 0.464, 0.878, 0.4897],
  },
  caret: [0.1216, 0.4958, 0.5118], // [u, top0, top1]: the start of the first answer line
  // Paragraph styles of those regions, as named in the export's word/styles.xml.
  styles: [['title', 'Worksheet Title'], ['stem', 'Question Stem'], ['part', 'Sub-question']],
};

/** Geometry in the window group's units (window centred at its origin). */
export function docLayout({ width = 3.2, aspect = 1.36, pageFrac = 0.68, top = 0.1 } = {}) {
  const h = width / aspect;
  const barH = (40 / 1440) * width;
  const contentTop = h / 2 - barH;
  const pageW = width * pageFrac;
  const pageH = pageW * DOC.aspect;
  const pageTop = contentTop - top;
  return {
    width, aspect, h, barH, contentTop, bottom: -h / 2,
    pageW, pageH, pageTop, slot: [0, pageTop - pageH / 2, 0.006],
  };
}

function canvasScreen(L) {
  const W = 2880;
  const H = Math.round(W / L.aspect);
  const k = W / L.width; // px per unit
  const s = W / 1440; // chrome px per 1440-wide window px
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const bar = Math.round(L.barH * k);
  const grad = g.createLinearGradient(0, bar, 0, H);
  grad.addColorStop(0, '#242221');
  grad.addColorStop(1, '#1B1A19');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // Page shadow.
  const pw = L.pageW * k;
  const px = (W - pw) / 2;
  const py = (L.contentTop - L.pageTop) * k + bar;
  g.save();
  g.filter = `blur(${Math.round(14 * s)}px)`;
  g.fillStyle = 'rgba(0, 0, 0, 0.55)';
  g.fillRect(px - 2 * s, py + 6 * s, pw + 4 * s, H);
  g.restore();
  // Title bar.
  g.fillStyle = '#302E2C';
  g.fillRect(0, 0, W, bar);
  g.fillStyle = 'rgba(0, 0, 0, 0.55)';
  g.fillRect(0, bar - s, W, s);
  g.fillStyle = 'rgba(255, 255, 255, 0.06)';
  g.fillRect(0, 0, W, s);
  ['#FF5F57', '#FEBC2E', '#28C840'].forEach((col, i) => {
    g.beginPath();
    g.arc((22 + i * 20) * s, bar / 2, 6.2 * s, 0, Math.PI * 2);
    g.fillStyle = col;
    g.fill();
  });
  g.fillStyle = '#D2CEC8';
  g.font = `600 ${13 * s}px -apple-system, "SF Pro Text", system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(DOC.title, W / 2, bar / 2 + 0.5 * s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

/** Builds the window + page. `map` is the .docx page texture; `alt` an optional second page image. */
export function docWindow(lib, map, { alt = null, ...opts } = {}) {
  const L = docLayout(opts);
  const group = new THREE.Group();
  group.name = 'docWindow';
  const screen = canvasScreen(L);
  const win = lib.win.appWindow({ variant: 'none', width: L.width, aspect: L.aspect, screen, shadow: false, border: '#8A847D' });
  group.add(win.group);
  const sheet = litSheet({ map, alt, width: L.pageW, aspect: DOC.aspect });
  sheet.mesh.position.set(...L.slot);
  group.add(sheet.mesh);
  win.group.userData.dispose = () => {
    win.dispose();
    screen.dispose();
  };
  return { group, win, sheet, L };
}
