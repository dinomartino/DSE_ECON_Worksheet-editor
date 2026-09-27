// GPU passes: accumulation (motion blur), gaussian blur, selective bloom, DOF, per-scene
// finish, transition compositor, output (hue-preserving clip, sRGB, dither grain).
// All intermediate targets are linear half-float; only the output pass writes sRGB.
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const shader = (fragmentShader, uniforms, extra = {}) =>
  new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    ...extra,
  });

export function makeTarget(w, h, opts = {}) {
  return new THREE.WebGLRenderTarget(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    ...opts,
  });
}

const ACCUM = /* glsl */ `
uniform sampler2D tSrc; uniform float uWeight; varying vec2 vUv;
void main() { gl_FragColor = texture2D(tSrc, vUv) * uWeight; }`;

const COPY = /* glsl */ `
uniform sampler2D tSrc; uniform float uGain; varying vec2 vUv;
void main() { gl_FragColor = texture2D(tSrc, vUv) * uGain; }`;

// Separable gaussian; sigma in texels of the source. Taps spread out past 48 per side.
const BLUR = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uStep; uniform float uSigma; varying vec2 vUv;
void main() {
  if (uSigma < 0.35) { gl_FragColor = texture2D(tSrc, vUv); return; }
  float radius = ceil(3.0 * uSigma);
  float spacing = max(1.0, radius / 48.0);
  vec4 acc = vec4(0.0); float wsum = 0.0;
  for (int i = -48; i <= 48; i++) {
    float x = float(i) * spacing;
    if (abs(x) > radius) continue;
    float w = exp(-0.5 * x * x / (uSigma * uSigma));
    acc += w * texture2D(tSrc, vUv + uStep * x);
    wsum += w;
  }
  gl_FragColor = acc / wsum;
}`;

// Bloom prefilter: only what exceeds the threshold (max channel) glows, so paper and UI
// at <= 1.0 never bloom; the emissive dot does.
const BLOOM_PRE = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; uniform float uKnee; varying vec2 vUv;
vec3 pre(vec3 c) {
  float b = max(c.r, max(c.g, c.b));
  float soft = clamp(b - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float w = max(soft, b - uThreshold) / max(b, 1e-4);
  return c * w;
}
void main() {
  vec2 o = uTexel * 0.5;
  vec3 c = pre(texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb) + pre(texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb)
         + pre(texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb) + pre(texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb);
  gl_FragColor = vec4(min(c * 0.25, vec3(64.0)), 1.0);
}`;

// 13-tap downsample (Jimenez 2014).
const DOWN = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
vec3 s(vec2 d) { return texture2D(tSrc, vUv + d * uTexel).rgb; }
void main() {
  vec3 a = s(vec2(-2., 2.)), b = s(vec2(0., 2.)), c = s(vec2(2., 2.));
  vec3 d = s(vec2(-2., 0.)), e = s(vec2(0., 0.)), f = s(vec2(2., 0.));
  vec3 g = s(vec2(-2., -2.)), h = s(vec2(0., -2.)), i = s(vec2(2., -2.));
  vec3 j = s(vec2(-1., 1.)), k = s(vec2(1., 1.)), l = s(vec2(-1., -1.)), m = s(vec2(1., -1.));
  vec3 r = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  gl_FragColor = vec4(r, 1.0);
}`;

// Sum of gaussian-blurred levels: a round glow whose reach is the level weights.
const COMBINE = /* glsl */ `
uniform sampler2D t0; uniform sampler2D t1; uniform sampler2D t2; uniform sampler2D t3;
uniform sampler2D t4; uniform sampler2D t5; uniform float uW[6]; varying vec2 vUv;
void main() {
  vec3 c = texture2D(t0, vUv).rgb * uW[0] + texture2D(t1, vUv).rgb * uW[1] + texture2D(t2, vUv).rgb * uW[2]
         + texture2D(t3, vUv).rgb * uW[3] + texture2D(t4, vUv).rgb * uW[4] + texture2D(t5, vUv).rgb * uW[5];
  gl_FragColor = vec4(c, 1.0);
}`;

// Gather DOF (single pass, golden-angle spiral). Circle of confusion in output px.
const DOF = /* glsl */ `
#include <packing>
uniform sampler2D tSrc; uniform sampler2D tDepth; uniform vec2 uTexel;
uniform float uNear; uniform float uFar; uniform float uFocus; uniform float uAperture; uniform float uMaxBlur;
varying vec2 vUv;
float viewZ(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
float coc(float z) { return clamp(uAperture * abs(1.0 / uFocus - 1.0 / z), 0.0, uMaxBlur); }
void main() {
  vec3 color = texture2D(tSrc, vUv).rgb;
  float cz = viewZ(vUv);
  float cs = coc(cz);
  float tot = 1.0;
  float radius = 0.75;
  for (int n = 0; n < 320; n++) {
    if (radius >= uMaxBlur) break;
    float ang = float(n) * 2.39996323;
    vec2 tc = vUv + vec2(cos(ang), sin(ang)) * uTexel * radius;
    vec3 sc = texture2D(tSrc, tc).rgb;
    float sz = viewZ(tc);
    float ss = coc(sz);
    if (sz > cz) ss = clamp(ss, 0.0, cs * 2.0);
    float m = smoothstep(radius - 0.5, radius + 0.5, ss);
    color += mix(color / tot, sc, m);
    tot += 1.0;
    radius += 0.75 / radius;
  }
  gl_FragColor = vec4(color / tot, 1.0);
}`;

// Per scene: add bloom, apply the subtle vignette and the scene's exposure.
const FINISH = /* glsl */ `
uniform sampler2D tSrc; uniform sampler2D tBloom; uniform float uBloom; uniform float uVignette;
uniform float uExposure; uniform float uAspect; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb + texture2D(tBloom, vUv).rgb * uBloom;
  vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0);
  float v = 1.0 - uVignette * smoothstep(0.35, 1.05, length(d));
  gl_FragColor = vec4(c * v * uExposure, 1.0);
}`;

// Transitions. Mode: 0 single, 1 dissolve, 2 dipToBlack, 3 pushThrough, 4 whip.
const TRANSITION = /* glsl */ `
uniform sampler2D tA; uniform sampler2D tB; uniform int uMode; uniform float uP;
uniform float uFadeA; uniform float uFadeB; uniform vec2 uTexel; varying vec2 vUv;
vec3 zoomed(sampler2D t, float s) { return texture2D(t, (vUv - 0.5) / s + 0.5).rgb; }
vec3 whipped(sampler2D t, float shift, float spread) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    float o = (float(i) / 23.0 - 0.5) * spread;
    vec2 uv = vUv + vec2(shift + o, 0.0);
    acc += (uv.x < 0.0 || uv.x > 1.0) ? vec3(0.0) : texture2D(t, uv).rgb;
  }
  return acc / 24.0;
}
void main() {
  vec3 a = vec3(0.0), b = vec3(0.0), c;
  float p = uP;
  if (uMode == 0) {
    c = texture2D(tA, vUv).rgb * uFadeA;
  } else if (uMode == 1) {
    c = mix(texture2D(tA, vUv).rgb * uFadeA, texture2D(tB, vUv).rgb * uFadeB, p);
  } else if (uMode == 2) {
    c = p < 0.5 ? texture2D(tA, vUv).rgb * uFadeA * (1.0 - 2.0 * p) : texture2D(tB, vUv).rgb * uFadeB * (2.0 * p - 1.0);
  } else if (uMode == 3) {
    a = zoomed(tA, 1.0 + 0.35 * p) * uFadeA;
    b = zoomed(tB, 0.82 + 0.18 * p) * uFadeB;
    c = mix(a, b, smoothstep(0.2, 0.8, p));
  } else {
    float e = p;
    float spread = 0.22 * sin(3.14159265 * e);
    a = whipped(tA, e, spread) * uFadeA;
    b = whipped(tB, e - 1.0, spread) * uFadeB;
    c = a + b;
  }
  gl_FragColor = vec4(c, 1.0);
}`;

// Output: hue-preserving clip (white stays white, the glowing dot stays blue), sRGB
// encode, then triangular dither grain (±amp, seeded by frame) against H.264 banding;
// stronger in the shadows (luma < ~40/255), where the encoder smooths a light one away.
const OUTPUT = /* glsl */ `
uniform sampler2D tSrc; uniform float uFrame; uniform float uGrain; uniform float uGrainShadow; varying vec2 vUv;
float h(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 srgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
void main() {
  vec3 c = max(texture2D(tSrc, vUv).rgb, vec3(0.0));
  float m = max(c.r, max(c.g, c.b));
  if (m > 1.0) {
    // Roll the overflow toward white a little, like film, but keep the hue.
    vec3 hue = c / m;
    float over = 1.0 - 1.0 / (1.0 + 0.05 * (m - 1.0));
    c = mix(hue, vec3(1.0), over);
  }
  c = srgb(clamp(c, 0.0, 1.0));
  vec2 px = gl_FragCoord.xy + vec2(mod(uFrame, 97.0) * 17.0, mod(uFrame, 89.0) * 31.0);
  float n = h(px) + h(px + 71.3) - 1.0;
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c += n * mix(uGrainShadow, uGrain, smoothstep(0.12, 0.22, luma));
  gl_FragColor = vec4(c, 1.0);
}`;

export class Post {
  constructor(renderer, w, h) {
    this.renderer = renderer;
    this.w = w;
    this.h = h;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);

    this.m = {
      accum: shader(ACCUM, { tSrc: { value: null }, uWeight: { value: 1 } }, {
        transparent: true,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.OneFactor,
        blendDstAlpha: THREE.OneFactor,
      }),
      copy: shader(COPY, { tSrc: { value: null }, uGain: { value: 1 } }),
      blur: shader(BLUR, { tSrc: { value: null }, uStep: { value: new THREE.Vector2() }, uSigma: { value: 0 } }),
      pre: shader(BLOOM_PRE, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1 }, uKnee: { value: 0.5 } }),
      down: shader(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } }),
      combine: shader(COMBINE, {
        t0: { value: null }, t1: { value: null }, t2: { value: null }, t3: { value: null }, t4: { value: null }, t5: { value: null },
        uW: { value: [0, 0, 0, 0, 0, 0] },
      }),
      dof: shader(DOF, {
        tSrc: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2(1 / w, 1 / h) },
        uNear: { value: 0.1 }, uFar: { value: 100 }, uFocus: { value: 10 }, uAperture: { value: 10 }, uMaxBlur: { value: 12 },
      }),
      finish: shader(FINISH, {
        tSrc: { value: null }, tBloom: { value: null }, uBloom: { value: 0 }, uVignette: { value: 0 },
        uExposure: { value: 1 }, uAspect: { value: w / h },
      }),
      transition: shader(TRANSITION, {
        tA: { value: null }, tB: { value: null }, uMode: { value: 0 }, uP: { value: 0 },
        uFadeA: { value: 1 }, uFadeB: { value: 1 }, uTexel: { value: new THREE.Vector2(1 / w, 1 / h) },
      }),
      output: shader(OUTPUT, { tSrc: { value: null }, uFrame: { value: 0 }, uGrain: { value: 1.5 / 255 }, uGrainShadow: { value: 2.5 / 255 } }),
    };

    this.tmpA = makeTarget(w, h);
    this.tmpB = makeTarget(w, h);
    this.blurA = makeTarget(w, h);
    this.blurB = makeTarget(w, h);
    this.comp = makeTarget(w, h);
    this.glow = makeTarget(w / 2, h / 2);
    this.levels = [];
    let lw = w / 2, lh = h / 2;
    for (let i = 0; i < 6; i++) {
      this.levels.push({ down: makeTarget(lw, lh), up: makeTarget(lw, lh), tmp: makeTarget(lw, lh) });
      lw /= 2;
      lh /= 2;
    }
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.black.needsUpdate = true;
  }

  run(material, target, clear = false) {
    const r = this.renderer;
    this.quad.material = material;
    r.setRenderTarget(target);
    if (clear) r.clear(true, false, false);
    r.render(this.scene, this.camera);
  }

  clear(target) {
    const r = this.renderer;
    r.setRenderTarget(target);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
  }

  accumulate(tex, target, weight) {
    this.m.accum.uniforms.tSrc.value = tex;
    this.m.accum.uniforms.uWeight.value = weight;
    this.run(this.m.accum, target, false);
  }

  copy(tex, target, gain = 1) {
    this.m.copy.uniforms.tSrc.value = tex;
    this.m.copy.uniforms.uGain.value = gain;
    this.run(this.m.copy, target);
  }

  /** Gaussian blur of `tex` (size w×h) by sigma px into `out`, via `tmp`. */
  blur(tex, sigma, out, tmp, w = this.w, h = this.h) {
    const u = this.m.blur.uniforms;
    u.uSigma.value = sigma;
    u.tSrc.value = tex;
    u.uStep.value.set(1 / w, 0);
    this.run(this.m.blur, tmp);
    u.tSrc.value = tmp.texture;
    u.uStep.value.set(0, 1 / h);
    this.run(this.m.blur, out);
    return out.texture;
  }

  /**
   * Bloom over `tex`; returns a half-res glow texture. `radius` 0..1 moves the weight from
   * the tight levels to the wide ones.
   */
  bloom(tex, { threshold = 1, knee = 0.5, radius = 0.6 } = {}) {
    const pre = this.m.pre.uniforms;
    pre.tSrc.value = tex;
    pre.uTexel.value.set(1 / this.w, 1 / this.h);
    pre.uThreshold.value = threshold;
    pre.uKnee.value = knee;
    this.run(this.m.pre, this.levels[0].down);
    for (let i = 1; i < this.levels.length; i++) {
      const src = this.levels[i - 1].down;
      this.m.down.uniforms.tSrc.value = src.texture;
      this.m.down.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this.run(this.m.down, this.levels[i].down);
    }
    const c = this.m.combine.uniforms;
    let sum = 0;
    const w = this.levels.map((_, i) => {
      const x = i / (this.levels.length - 1);
      const v = Math.exp(-((x - radius) ** 2) / 0.18) + 0.25;
      sum += v;
      return v;
    });
    this.levels.forEach((l, i) => {
      this.blur(l.down.texture, 2.2, l.up, l.tmp, l.down.width, l.down.height);
      c[`t${i}`].value = l.up.texture;
      c.uW.value[i] = w[i] / sum;
    });
    this.run(this.m.combine, this.glow);
    return this.glow.texture;
  }

  dof(tex, depthTex, camera, { focus, aperture = 12, maxBlur = 14 }, out) {
    const u = this.m.dof.uniforms;
    u.tSrc.value = tex;
    u.tDepth.value = depthTex;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uFocus.value = focus;
    u.uAperture.value = aperture * (this.h / 1080);
    u.uMaxBlur.value = maxBlur * (this.h / 1080);
    this.run(this.m.dof, out);
    return out.texture;
  }

  /** Scene finish: bloom + vignette + exposure into `out`. */
  finish(tex, post, out) {
    const u = this.m.finish.uniforms;
    const b = post.bloom;
    u.tSrc.value = tex;
    if (b && b.strength > 0) {
      u.tBloom.value = this.bloom(tex, b);
      u.uBloom.value = b.strength;
    } else {
      u.tBloom.value = this.black;
      u.uBloom.value = 0;
    }
    u.uVignette.value = post.vignette ?? 0;
    u.uExposure.value = post.exposure ?? 1;
    this.run(this.m.finish, out);
  }

  transition(mode, a, b, p, fadeA, fadeB, out) {
    const u = this.m.transition.uniforms;
    u.tA.value = a ?? this.black;
    u.tB.value = b ?? this.black;
    u.uMode.value = mode;
    u.uP.value = p;
    u.uFadeA.value = fadeA;
    u.uFadeB.value = fadeB;
    this.run(this.m.transition, out);
  }

  output(tex, frame, grain, grainShadow = grain) {
    const u = this.m.output.uniforms;
    u.tSrc.value = tex;
    u.uFrame.value = frame;
    u.uGrain.value = grain;
    u.uGrainShadow.value = grainShadow;
    this.run(this.m.output, null);
  }

  dispose() {
    for (const m of Object.values(this.m)) m.dispose();
    for (const t of [this.tmpA, this.tmpB, this.blurA, this.blurB, this.comp]) t.dispose();
    this.glow.dispose();
    for (const l of this.levels) {
      l.down.dispose();
      l.up.dispose();
      l.tmp.dispose();
    }
  }
}
