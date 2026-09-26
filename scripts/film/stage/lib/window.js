// A generic app window (drawn, not a real OS screenshot): rounded corners, hairline
// border, a title bar in mac / windows / browser style, the screen from a still or clip
// frame, and a soft shadow. The screen is unlit so the app's white stays white.
import * as THREE from 'three';
import { contactShadow } from './floor.js';

// Title bar heights in window px at a 1440 px wide window.
const BAR = { mac: 40, windows: 34, browser: 84, none: 0 };
const RADIUS = { mac: 12, windows: 8, browser: 12, none: 12 };

function chromeCanvas(variant, widthPx, title, scale = 2) {
  const h = BAR[variant];
  const c = document.createElement('canvas');
  c.width = Math.round(widthPx * scale);
  c.height = Math.max(1, Math.round(h * scale));
  const g = c.getContext('2d');
  g.scale(scale, scale);
  const font = (w, s) => `${w} ${s}px -apple-system, "SF Pro Text", system-ui, sans-serif`;
  if (variant === 'mac') {
    g.fillStyle = '#EEEBE6';
    g.fillRect(0, 0, widthPx, h);
    ['#FF5F57', '#FEBC2E', '#28C840'].forEach((col, i) => {
      g.beginPath();
      g.arc(22 + i * 20, h / 2, 6.2, 0, Math.PI * 2);
      g.fillStyle = col;
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.12)';
      g.lineWidth = 0.6;
      g.stroke();
    });
    g.fillStyle = '#4B4743';
    g.font = font(600, 13);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(title, widthPx / 2, h / 2 + 0.5);
    g.fillStyle = 'rgba(0,0,0,0.10)';
    g.fillRect(0, h - 1, widthPx, 1);
  } else if (variant === 'windows') {
    g.fillStyle = '#F3F3F3';
    g.fillRect(0, 0, widthPx, h);
    g.fillStyle = '#1F1F1F';
    g.font = font(400, 12);
    g.textBaseline = 'middle';
    g.fillText(title, 16, h / 2 + 0.5);
    g.strokeStyle = '#1F1F1F';
    g.lineWidth = 1;
    const cx = (i) => widthPx - 23 - i * 46;
    g.beginPath(); // close
    g.moveTo(cx(0) - 5, h / 2 - 5); g.lineTo(cx(0) + 5, h / 2 + 5);
    g.moveTo(cx(0) + 5, h / 2 - 5); g.lineTo(cx(0) - 5, h / 2 + 5);
    g.stroke();
    g.strokeRect(cx(1) - 5, h / 2 - 5, 10, 10); // maximise
    g.beginPath(); // minimise
    g.moveTo(cx(2) - 5, h / 2 + 0.5); g.lineTo(cx(2) + 5, h / 2 + 0.5);
    g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fillRect(0, h - 1, widthPx, 1);
  } else if (variant === 'browser') {
    g.fillStyle = '#E4E1DC';
    g.fillRect(0, 0, widthPx, h);
    ['#FF5F57', '#FEBC2E', '#28C840'].forEach((col, i) => {
      g.beginPath();
      g.arc(22 + i * 20, 20, 6.2, 0, Math.PI * 2);
      g.fillStyle = col;
      g.fill();
    });
    // One tab.
    g.fillStyle = '#FBFAF8';
    g.beginPath();
    g.roundRect(84, 7, 250, 33, [9, 9, 0, 0]);
    g.fill();
    g.fillStyle = '#3A342E';
    g.beginPath();
    g.roundRect(98, 16, 15, 15, 3.5);
    g.fill();
    g.fillStyle = '#2D2A27';
    g.font = font(500, 12.5);
    g.textBaseline = 'middle';
    g.fillText(title, 122, 24);
    // Toolbar with an address field.
    g.fillStyle = '#FBFAF8';
    g.fillRect(0, 40, widthPx, h - 40);
    g.fillStyle = '#EFECE7';
    g.beginPath();
    g.roundRect(118, 48, widthPx - 236, 28, 14);
    g.fill();
    g.strokeStyle = '#8A857F';
    g.lineWidth = 1.6;
    g.lineCap = 'round';
    for (const [x, d] of [[30, -1], [58, 1]]) {
      g.beginPath();
      g.moveTo(x - 3 * d, 56); g.lineTo(x + 3 * d, 62); g.lineTo(x - 3 * d, 68);
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fillRect(0, h - 1, widthPx, 1);
  }
  return c;
}

const VERT = /* glsl */ `
varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `
uniform sampler2D tScreen; uniform sampler2D tChrome; uniform vec2 uSize; uniform float uRadius;
uniform float uBar; uniform vec3 uBorder; uniform float uOpacity; uniform float uHasChrome;
uniform vec4 uCrop; uniform float uDim;
varying vec2 vUv;
float rbox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float d = rbox(p, uSize * 0.5, uRadius);
  float aa = fwidth(d);
  float a = 1.0 - smoothstep(-aa, aa * 0.5, d);
  if (a <= 0.0) discard;
  float barY = 1.0 - uBar;
  vec3 c;
  if (vUv.y > barY && uHasChrome > 0.5) {
    c = texture2D(tChrome, vec2(vUv.x, (vUv.y - barY) / uBar)).rgb;
  } else {
    vec2 st = vec2(vUv.x, vUv.y / barY);
    st = uCrop.xy + st * uCrop.zw;
    c = texture2D(tScreen, st).rgb;
  }
  c *= uDim;
  float border = 1.0 - smoothstep(0.0, aa * 1.5, abs(d + aa * 0.75));
  c = mix(c, uBorder, border * 0.55);
  gl_FragColor = vec4(c * a * uOpacity, a * uOpacity);
}`;

/**
 * `width` world units; the screen aspect is `aspect` (w/h, default 16:10 like the
 * 1440×900 captures). `screen` is a texture (still or clip frame) set per frame with
 * set({ screen }). `crop` = [u0, v0, du, dv] of the screen texture to show.
 */
export function appWindow({ variant = 'mac', width = 3, aspect = 1440 / 900, screen = null, title = 'Econ Worksheet', shadow = true, shadowOpacity = 0.28, shadowBlur = 0.16, shadowColor = '#2A241E', border = '#000000' } = {}) {
  const pxW = 1440;
  const barPx = BAR[variant] ?? 0;
  const screenH = width / aspect;
  const barH = (barPx / pxW) * width;
  const h = screenH + barH;
  let chromeTex = null;
  if (barPx) {
    chromeTex = new THREE.CanvasTexture(chromeCanvas(variant, pxW, title));
    chromeTex.colorSpace = THREE.SRGBColorSpace;
    chromeTex.anisotropy = 8;
    chromeTex.generateMipmaps = true;
    chromeTex.minFilter = THREE.LinearMipmapLinearFilter;
  }
  const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  white.colorSpace = THREE.SRGBColorSpace;
  white.needsUpdate = true;
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      tScreen: { value: screen ?? white },
      tChrome: { value: chromeTex ?? white },
      uSize: { value: new THREE.Vector2(width, h) },
      uRadius: { value: ((RADIUS[variant] ?? 12) / pxW) * width },
      uBar: { value: barH / h },
      uBorder: { value: new THREE.Color(border) },
      uOpacity: { value: 1 },
      uHasChrome: { value: barPx ? 1 : 0 },
      uCrop: { value: new THREE.Vector4(0, 0, 1, 1) },
      uDim: { value: 1 },
    },
    transparent: true,
    premultipliedAlpha: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    toneMapped: false,
  });
  const group = new THREE.Group();
  group.name = `window-${variant}`;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, h), material);
  mesh.renderOrder = 2;
  group.add(mesh);
  let shadowMesh = null;
  if (shadow) {
    shadowMesh = contactShadow({ w: width * 0.96, h: h * 0.96, radius: 0.05, blur: shadowBlur * width / 3, color: shadowColor, opacity: shadowOpacity });
    shadowMesh.position.set(0, -h * 0.035, -0.05);
    group.add(shadowMesh);
  }
  const u = material.uniforms;
  const api = {
    group, mesh, material, width, height: h, screenHeight: screenH, barHeight: barH,
    /** Screen-space centre of the content area relative to the group, in world units. */
    contentCenter: new THREE.Vector3(0, -barH / 2, 0),
    set({ screen: s, opacity, crop, dim, shadowOpacity: so } = {}) {
      if (s !== undefined) u.tScreen.value = s ?? white;
      if (opacity != null) u.uOpacity.value = opacity;
      if (crop) u.uCrop.value.set(...crop);
      if (dim != null) u.uDim.value = dim;
      if (so != null && shadowMesh) shadowMesh.material.opacity = so;
    },
    dispose() {
      chromeTex?.dispose();
      white.dispose();
      material.dispose();
      mesh.geometry.dispose();
      shadowMesh?.userData.dispose();
    },
  };
  group.userData.dispose = api.dispose;
  return api;
}
