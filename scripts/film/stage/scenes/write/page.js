// The bilingual page as layers (write scene, bars 12–16). Built from the real sheets:
// every text line of sheets/bi.png becomes a strip (English text, Chinese text, and the
// shared "1." / "A." labels), so each language can lift off the paper in depth and
// reflow into the line positions of sheets/en.png or sheets/zh.png. Lines are found
// from the pixels at setup and matched by order; a sheet that no longer matches throws.
import * as THREE from 'three';

const INK = 200; // green-channel threshold for ink
const PAD = 2; // px around a line box (lines are ≥ 4 px apart)
const MARGIN = 26; // px of quad beyond the box, room for blur and shadow

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// Multiplied over whatever is behind: white is a no-op, ink darkens. Samples outside the
// strip's own box count as paper, so a blurred line never picks up its neighbour.
const FRAG = /* glsl */ `
uniform sampler2D tMap; uniform vec4 uRect; uniform vec2 uTexel;
uniform float uAlpha; uniform float uBlur; uniform float uShadow; uniform vec3 uShadowColor;
varying vec2 vUv;
vec3 tap(vec2 uv) {
  vec3 s = texture2D(tMap, uv).rgb;
  vec2 in2 = step(uRect.xy, uv) * step(uv, uRect.zw);
  return mix(vec3(1.0), s, in2.x * in2.y);
}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  vec3 c;
  if (uBlur < 0.35) {
    c = tap(vUv);
  } else {
    c = vec3(0.0);
    float a0 = ign(gl_FragCoord.xy) * 6.2831853;
    for (int i = 0; i < 16; i++) {
      float r = sqrt((float(i) + 0.5) / 16.0) * uBlur;
      float a = a0 + float(i) * 2.3999632;
      c += tap(vUv + vec2(cos(a), sin(a)) * r * uTexel);
    }
    c /= 16.0;
  }
  if (uShadow > 0.5) {
    float ink = 1.0 - dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(1.0), uShadowColor, clamp(ink * 1.8, 0.0, 1.0));
  }
  gl_FragColor = vec4(mix(vec3(1.0), c, clamp(uAlpha, 0.0, 1.0)), 1.0);
}`;

/** Pixel access to a texture loaded by ctx.load.texture (decoded with flipY). */
function pixels(tex) {
  const bmp = tex.userData.bitmap;
  const { width: w, height: h } = bmp;
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  const data = g.getImageData(0, 0, w, h).data;
  const row = (y) => (h - 1 - y) * w * 4 + 1; // green of image row y, pixel 0
  return { w, h, data, row };
}

/** Text lines: maximal runs of rows holding ink, with their x extent. */
function lines(px) {
  const out = [];
  let cur = null;
  for (let y = 0; y < px.h; y++) {
    const b = px.row(y);
    let x0 = -1, x1 = -1;
    for (let x = 0; x < px.w; x++) {
      if (px.data[b + x * 4] < INK) {
        if (x0 < 0) x0 = x;
        x1 = x + 1;
      }
    }
    if (x0 >= 0) {
      if (!cur) cur = { y0: y, y1: y + 1, x0, x1 };
      else {
        cur.y1 = y + 1;
        cur.x0 = Math.min(cur.x0, x0);
        cur.x1 = Math.max(cur.x1, x1);
      }
    } else if (cur) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out.filter((l) => l.y1 - l.y0 >= 12);
}

/** Tight ink box inside a region, or null. */
function box(px, x0, x1, y0, y1) {
  let b = null;
  for (let y = y0; y < y1; y++) {
    const r = px.row(y);
    for (let x = x0; x < x1; x++) {
      if (px.data[r + x * 4] < INK) {
        if (!b) b = { x0: x, x1: x + 1, y0: y, y1: y + 1 };
        b.x0 = Math.min(b.x0, x);
        b.x1 = Math.max(b.x1, x + 1);
        b.y1 = y + 1;
      }
    }
  }
  return b;
}

function fail(msg) {
  throw new Error(`write/page: ${msg} — the sheets changed; re-check scenes/write/page.js`);
}

/** The sheet structure: matched strips for the three layouts. */
function analyse(bi, en, zh) {
  const B = lines(bi).filter((l) => l.y0 < bi.h * 0.88);
  const E = lines(en), Z = lines(zh);
  const footer = (L, h) => L.filter((l) => l.y0 >= h * 0.9);
  if (B.length < 4 || B.length % 2) fail(`bi.png has ${B.length} body lines, expected EN/中 pairs`);
  const P = B.length / 2;
  if (E.length < P || Z.length < P) fail('en.png / zh.png have fewer lines than bi.png pairs');
  const rows = [];
  for (let i = 0; i < P; i++) {
    const be = B[2 * i], bz = B[2 * i + 1], e = E[i], z = Z[i];
    if (Math.abs(e.x0 - be.x0) > 4 || Math.abs(e.x1 - be.x1) > 4) fail(`English line ${i} does not match en.png`);
    if (Math.abs(z.x1 - bz.x1) > 6) fail(`Chinese line ${i} does not match zh.png`);
    const row = { en: { ...be, to: e.y0 }, zh: { ...bz, to: z.y0 }, label: null };
    if (bz.x0 - be.x0 > 30) {
      const end = bz.x0 - 6;
      const lb = box(bi, be.x0, end, be.y0, be.y1);
      const lz = box(zh, z.x0, end, z.y0, z.y1);
      if (!lb || !lz) fail(`label of line ${i} not found`);
      row.label = { ...lb, en: e.y0 + (lb.y0 - be.y0), zhOff: lz.y0 - z.y0 };
      row.en.x0 = end;
    }
    rows.push(row);
  }
  const rest = (L, h) => {
    const f = footer(L, h);
    return { y0: L[P].y0 - 30, y1: h - 30, footer: f };
  };
  return { rows, rem: { en: E.length > P ? rest(E, en.h) : null, zh: Z.length > P ? rest(Z, zh.h) : null }, biFooter: footer(lines(bi), bi.h) };
}

/**
 * A layered page `width` world units wide, centred on its group. set(state) poses it
 * (see the scene for the fields); everything is a pure function of the state.
 */
export async function layeredPage(ctx, { width = 2, shadowColor = '#3A342E', paperShadow = 0.16 } = {}) {
  const { lib } = ctx;
  const [tBi, tEn, tZh] = await Promise.all(['bi', 'en', 'zh'].map((n) => ctx.load.texture(`sheets/${n}.png`)));
  const bi = pixels(tBi), en = pixels(tEn), zh = pixels(tZh);
  const S = analyse(bi, en, zh);
  const W = bi.w, H = bi.h;
  const s = width / W;
  const height = H * s;

  const group = new THREE.Group();
  group.name = 'layered-page';
  const paper = lib.paper.sheet({ width, shadowOpacity: paperShadow, shadowBlur: 0.07, shadowOffset: [0.03, -0.05] });
  paper.face.renderOrder = 10;
  paper.edge.material.transparent = true;
  paper.edge.material.depthWrite = false; // never hide the window behind a fading page
  group.add(paper.group);

  const shadowCol = new THREE.Color(shadowColor);
  const strips = [];
  /** A strip of `tex` showing the px box r; place(y) moves its box top to image row y. */
  function strip(tex, r, { shadow = false } = {}) {
    const x0 = r.x0 - PAD, x1 = r.x1 + PAD, y0 = r.y0 - PAD, y1 = r.y1 + PAD;
    const gx0 = x0 - MARGIN, gx1 = x1 + MARGIN, gy0 = y0 - MARGIN, gy1 = y1 + MARGIN;
    const geo = new THREE.PlaneGeometry((gx1 - gx0) * s, (gy1 - gy0) * s);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (uv.getX(i) ? gx1 : gx0) / W, 1 - (uv.getY(i) ? gy0 : gy1) / H);
    }
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        tMap: { value: tex },
        uRect: { value: new THREE.Vector4(x0 / W, 1 - y1 / H, x1 / W, 1 - y0 / H) },
        uTexel: { value: new THREE.Vector2(1 / W, 1 / H) },
        uAlpha: { value: 1 },
        uBlur: { value: 0 },
        uShadow: { value: shadow ? 1 : 0 },
        uShadowColor: { value: shadowCol },
      },
      transparent: true,
      premultipliedAlpha: true,
      blending: THREE.MultiplyBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.renderOrder = shadow ? 11 : 12;
    mesh.frustumCulled = false;
    group.add(mesh);
    const cx = ((gx0 + gx1) / 2) * s - width / 2;
    const off = (gy0 + gy1) / 2 - r.y0; // box top → quad centre, px
    const api = {
      mesh,
      u: material.uniforms,
      /** Box top at image row y, height z above the paper; dx, dy extra page-local shift. */
      place(y, z = 0, dx = 0, dy = 0) {
        mesh.position.set(cx + dx, height / 2 - (y + off) * s + dy, z);
      },
    };
    strips.push(api);
    return api;
  }

  // Each text piece has a sharp strip and a shadow strip on the paper.
  const pair = (tex, r) => ({ ink: strip(tex, r), shadow: strip(tex, r, { shadow: true }) });
  // A label ("1.", "A.") belongs to each layer: the English copy rides the English line
  // (bilingual and English layouts), the Chinese copy the Chinese line (Chinese layout).
  const rows = S.rows.map((row) => ({
    row,
    en: pair(tBi, row.en),
    zh: pair(tBi, row.zh),
    label: row.label ? { en: pair(tBi, row.label), zh: pair(tBi, row.label) } : null,
  }));
  const rem = {
    en: S.rem.en ? pair(tEn, { x0: 0, x1: W, y0: S.rem.en.y0, y1: S.rem.en.y1 }) : null,
    zh: S.rem.zh ? pair(tZh, { x0: 0, x1: W, y0: S.rem.zh.y0, y1: S.rem.zh.y1 }) : null,
  };
  const foot = S.biFooter.length
    ? strip(tBi, { x0: Math.min(...S.biFooter.map((f) => f.x0)), x1: Math.max(...S.biFooter.map((f) => f.x1)), y0: S.biFooter[0].y0, y1: S.biFooter.at(-1).y1 })
    : null;
  const N = rows.length;

  const smooth = (u) => u * u * u * (u * (u * 6 - 15) + 10);
  /** Line i's own progress through a layer move (a gentle top-to-bottom ripple). */
  const lineP = (p, i, spread = 0.3) => smooth(Math.min(1, Math.max(0, p * (1 + spread) - (spread * i) / Math.max(1, N - 1))));

  function pose(p, layer, zLayer, light, strength, a) {
    const { ink, shadow } = p;
    const z = zLayer;
    ink.place(layer.y, z);
    ink.u.uAlpha.value = a * layer.alpha;
    ink.u.uBlur.value = layer.blur;
    const lift = Math.min(1, z / 0.05);
    shadow.place(layer.y, 0.0005, light[0] * z, light[1] * z);
    shadow.u.uAlpha.value = a * layer.alpha * strength * lift;
    shadow.u.uBlur.value = 4 + (0.2 * z) / s;
  }

  return {
    group, paper, width, height, rows: N,
    /** Page-local point (world units) of an image pixel of the sheets. */
    local: (x, y) => [x * s - width / 2, height / 2 - y * s],
    /**
     * alpha: whole page. en / zh: { z (height above the paper), reflow (0 bilingual → 1
     * own layout), alpha, blur (px) }. Each layer's labels and the rest of its own page
     * follow its reflow. light: shadow offset per unit height; shadow: its strength.
     */
    set({ alpha = 1, en = {}, zh = {}, light = [0.18, -0.3], shadow = 0.34 } = {}) {
      const E = { z: 0, reflow: 0, alpha: 1, blur: 0, ...en };
      const Z = { z: 0, reflow: 0, alpha: 1, blur: 0, ...zh };
      group.visible = alpha > 0.001;
      paper.set({ opacity: alpha, shadowOpacity: paperShadow * alpha });
      paper.material.transparent = alpha < 1;
      paper.edge.material.opacity = alpha;
      rows.forEach((r, i) => {
        const pe = lineP(E.reflow, i), pz = lineP(Z.reflow, i);
        const ye = r.row.en.y0 + (r.row.en.to - r.row.en.y0) * pe;
        const yz = r.row.zh.y0 + (r.row.zh.to - r.row.zh.y0) * pz;
        pose(r.en, { y: ye, alpha: E.alpha, blur: E.blur }, E.z, light, shadow, alpha);
        pose(r.zh, { y: yz, alpha: Z.alpha, blur: Z.blur }, Z.z, light, shadow, alpha);
        if (r.label) {
          const L = r.row.label;
          pose(r.label.en, { y: ye + (L.y0 - r.row.en.y0), alpha: E.alpha, blur: E.blur }, E.z, light, shadow, alpha);
          const za = smooth(Math.min(1, Math.max(0, (pz - 0.55) / 0.45)));
          pose(r.label.zh, { y: yz + L.zhOff, alpha: Z.alpha * za, blur: Z.blur }, Z.z, light, shadow, alpha);
        }
      });
      const remA = {};
      for (const k of ['en', 'zh']) {
        const L = k === 'en' ? E : Z;
        remA[k] = smooth(Math.min(1, Math.max(0, (L.reflow - 0.7) / 0.3)));
        if (!rem[k]) continue;
        pose(rem[k], { y: S.rem[k].y0, alpha: remA[k] * L.alpha, blur: L.blur }, L.z, light, shadow, alpha);
      }
      if (foot) {
        foot.place(S.biFooter[0].y0, 0);
        foot.u.uAlpha.value = alpha * (1 - Math.max(remA.en, remA.zh));
      }
    },
  };
}
