// The typed page as layers (write scene, bars 12–16), built from the real sheets. The sheets
// are the quiz page (Q1–Q3, then Section B); the page typed on camera has only Q1 before
// Section B. So every layout keeps Q1 and lifts Section B by the two question blocks it
// drops: where the app puts it (checked against the capture to 1 sheet px). Four layers,
// each a real layout (the app switches instantly, never in between): biEn / biZh, the
// English and Chinese lines of sheets/bi.png, which can separate in depth, and en / zh
// (sheets/en.png, sheets/zh.png). Lines are found from the pixels at setup; sheets that no
// longer have this structure throw.
import * as THREE from 'three';

const INK = 200; // green-channel threshold for ink
const PAD = 2; // px around a line box (lines are ≥ 4 px apart)
const MARGIN = 26; // px of quad beyond the box, room for blur and shadow

// bi.png pairs (EN line, 中 line), and en.png / zh.png lines, in order: 0 instructions,
// 1 Section A, 2–6 Q1 (stem, four options), 7–11 Q2, 12–16 Q3, 17 Section B.
const PAIRS = 18, Q1 = 2, Q2 = 7, Q3 = 12, SEC_B = 17;
const KEEP = [0, 1, 2, 3, 4, 5, 6, SEC_B];

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

/** The box around every line of a sheet. */
const around = (L) => ({ x0: Math.min(...L.map((l) => l.x0)), x1: Math.max(...L.map((l) => l.x1)), y0: L[0].y0, y1: L.at(-1).y1 });

function fail(msg) {
  throw new Error(`write/page: ${msg} — the sheets changed; re-check scenes/write/page.js`);
}

/** One layout of the typed page: its kept lines [{ r, shift }] (shift: px up), its footer. */
function typed(L, foot) {
  const top = (i) => L[i].y0;
  if (Math.abs(top(Q3) - top(Q2) - (top(Q2) - top(Q1))) > 2) fail('the question blocks differ in height');
  const shift = top(Q3) - top(Q1);
  return { lines: KEEP.map((i) => ({ r: L[i], shift: i === SEC_B ? shift : 0 })), foot };
}

/** The typed page in each layout, from bi.png's EN / 中 pairs and en.png / zh.png. */
function analyse(bi, en, zh) {
  const split = (px) => {
    const all = lines(px);
    const foot = all.filter((l) => l.y0 >= px.h * 0.88);
    return { body: all.filter((l) => l.y0 < px.h * 0.88), foot: foot.length ? around(foot) : null };
  };
  const B = split(bi), E = split(en), Z = split(zh);
  if (B.body.length !== 2 * PAIRS) fail(`bi.png has ${B.body.length} body lines, expected ${PAIRS} EN/中 pairs`);
  if (E.body.length < PAIRS || Z.body.length < PAIRS) fail('en.png / zh.png have fewer lines than bi.png pairs');
  const bEn = B.body.filter((_, j) => j % 2 === 0), bZh = B.body.filter((_, j) => j % 2 === 1);
  for (let i = 0; i < PAIRS; i++) {
    if (Math.abs(E.body[i].x0 - bEn[i].x0) > 4 || Math.abs(E.body[i].x1 - bEn[i].x1) > 4) fail(`English line ${i} does not match en.png`);
    if (Math.abs(Z.body[i].x1 - bZh[i].x1) > 6) fail(`Chinese line ${i} does not match zh.png`);
  }
  for (const i of [Q1, Q2, Q3]) if (bEn[i].x0 > 330 || bEn[i + 1].x0 < 400) fail(`pair ${i} is not a question stem`);
  return {
    biEn: typed(bEn, B.foot),
    biZh: typed(bZh, null),
    en: typed(E.body, E.foot),
    zh: typed(Z.body, Z.foot),
  };
}

const LAYERS = ['biEn', 'biZh', 'en', 'zh'];

/**
 * A layered page `width` world units wide, centred on its group. set(state) poses it;
 * everything is a pure function of the state.
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
  /** A strip of `tex` showing the px box r, `shift` px above its place on the sheet. */
  function strip(tex, r, { shadow = false, shift = 0 } = {}) {
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
    const cy = height / 2 - ((gy0 + gy1) / 2 - shift) * s;
    return {
      u: material.uniforms,
      /** z above the paper; dx, dy extra page-local shift; scaled k about page-local point a. */
      place(z = 0, dx = 0, dy = 0, k = 1, a = [0, 0]) {
        mesh.visible = material.uniforms.uAlpha.value > 0.001;
        mesh.position.set(a[0] + (cx - a[0]) * k + dx, a[1] + (cy - a[1]) * k + dy, z);
        mesh.scale.setScalar(k);
      },
    };
  }

  // Each line has a sharp strip and a soft shadow strip on the paper.
  const pair = (tex, { r, shift }) => ({ ink: strip(tex, r, { shift }), shadow: strip(tex, r, { shadow: true, shift }) });
  const tex = { biEn: tBi, biZh: tBi, en: tEn, zh: tZh };
  const layers = {};
  const feet = {};
  for (const k of LAYERS) {
    layers[k] = S[k].lines.map((l) => pair(tex[k], l));
    if (S[k].foot) feet[k] = strip(tex[k], S[k].foot);
  }

  const smooth = (u) => u * u * (3 - 2 * u);
  function pose({ ink, shadow }, L, light, strength, a, anchor) {
    ink.u.uAlpha.value = a * L.alpha;
    ink.u.uBlur.value = L.blur;
    ink.place(L.z, 0, 0, L.k ?? 1, anchor);
    // The shadow grows in softly: faint and already blurred while the layer is near the
    // paper, so a small lift never reads as a printed double.
    const lift = smooth(Math.min(1, L.z / 0.12));
    shadow.u.uAlpha.value = a * L.alpha * strength * lift;
    shadow.u.uBlur.value = 10 + (0.22 * L.z) / s;
    shadow.place(0.0005, light[0] * L.z, light[1] * L.z);
  }

  return {
    group, paper, width, height,
    /** Page-local point (world units) of an image pixel of the sheets. */
    local: (x, y) => [x * s - width / 2, height / 2 - y * s],
    /**
     * alpha: the whole page. biEn / biZh / en / zh: { z (height above the paper), alpha,
     * blur (px), k (scale about `anchor`, page-local) }; an omitted layer is hidden. light:
     * shadow offset per unit height; shadow: its strength. The bilingual footer shows with
     * either bilingual layer.
     */
    set({ alpha = 1, light = [0.18, -0.3], shadow = 0.34, anchor = [0, 0], ...st } = {}) {
      group.visible = alpha > 0.001;
      paper.set({ opacity: alpha, shadowOpacity: paperShadow * alpha });
      paper.material.transparent = alpha < 1;
      paper.edge.material.opacity = alpha;
      for (const k of LAYERS) {
        const L = { z: 0, alpha: 0, blur: 0, ...st[k] };
        for (const p of layers[k]) pose(p, L, light, shadow, alpha, anchor);
      }
      const footAlpha = {
        biEn: Math.max(st.biEn?.alpha ?? 0, st.biZh?.alpha ?? 0),
        en: st.en?.alpha ?? 0,
        zh: st.zh?.alpha ?? 0,
      };
      for (const [k, f] of Object.entries(feet)) {
        f.u.uAlpha.value = alpha * footAlpha[k];
        f.u.uBlur.value = st[k]?.blur ?? 0;
        f.place(0);
      }
    },
  };
}
