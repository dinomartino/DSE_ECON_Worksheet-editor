import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * WCAG 2.2 AA contrast for every interface theme (Settings → Appearance).
 *
 *   node scripts/theme-contrast.mjs [--theme=<id>] [--all]
 *
 * Loads `src/app/themes/*.css` into headless Chrome and lets the browser resolve each token
 * (oklch, color-mix, a translucent fill over what it sits on), then measures the pairs the
 * chrome actually draws: text 4.5:1 (1.4.3), focus rings, control edges and glyph-like marks
 * 3:1 (1.4.11). Each pair is checked in both zones (`.zone-light` panels, `.zone-dark` frame).
 *
 * Classic and Dark predate this check and are the default look, which must not change, so
 * their failures are reported but do not fail the run; `--all` makes them count too.
 * Exits 1 when a theme that must pass does not.
 */

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--theme='))?.slice(8);
const strictAll = args.includes('--all');
const BASELINE = new Set(['light', 'dark']);

const dir = new URL('../src/app/themes/', import.meta.url);
const appearance = readFileSync(new URL('../src/settings/appearance.ts', import.meta.url), 'utf8');
const ids = [...appearance.matchAll(/\{ id: '([a-z-]+)', scheme: '(light|dark)' \}/g)].map((m) => m[1]);
const css = ['tokens', ...ids].map((id) => readFileSync(new URL(`${id}.css`, dir), 'utf8')).join('\n');
const themes = only ? ids.filter((id) => id === only) : ids;
if (only && themes.length === 0) {
  console.error(`No theme "${only}". Known: ${ids.join(', ')}`);
  process.exit(2);
}

const SURFACES = ['surface', 'surface-raised', 'surface-sunken', 'surface-hover'];
const TEXT = 4.5;
const EDGE = 3;

/**
 * [foreground, background, minimum, zones, opacity token?]; a background list is a stack, bottom
 * first; the opacity token, when given, is applied to the foreground (a dimmed label).
 */
const PAIRS = [
  ...['ink', 'ink-muted', 'ink-subtle'].flatMap((fg) => SURFACES.map((bg) => [fg, bg, TEXT, 'both'])),
  ['accent-ink', 'accent-soft', TEXT, 'both'],
  ['accent-ink', 'surface', TEXT, 'both'],
  ['danger-ink', 'danger-soft', TEXT, 'both'],
  ['danger-ink', 'surface', TEXT, 'both'],
  ['warn-ink', 'warn-soft', TEXT, 'both'],
  ['ok', 'ok-soft', TEXT, 'both'],
  ['ok', 'surface', TEXT, 'both'],
  ['line-strong', 'surface', EDGE, 'both'],
  ['accent', 'surface', EDGE, 'both'],
  ['accent', 'surface-sunken', EDGE, 'both'],
  ['on-accent', 'accent', TEXT, 'panel'],
  ['on-accent', 'accent-hover', TEXT, 'panel'],
  ['on-cta', 'cta', TEXT, 'panel'],
  ['on-cta', 'cta-hover', TEXT, 'panel'],
  ['on-danger', 'danger', TEXT, 'panel'],
  // Text straight on the desk: page numbers under each sheet, the start screen's hints.
  ['ink-muted', 'desk', TEXT, 'chrome'],
  // The Sidebar's Edit tab with nothing picked: muted ink, dimmed.
  ['ink-muted', 'surface', TEXT, 'panel', 'dim-opacity'],
  ['ink-subtle', 'desk', TEXT, 'chrome'],
  ['accent', 'desk', EDGE, 'chrome'],
  // The HUD floats over the white sheet.
  ...['hud-ink', 'hud-ink-strong', 'hud-ink-soft', 'hud-ink-muted', 'hud-ink-subtle'].map((fg) => [fg, ['paper', 'hud'], TEXT, 'panel']),
  ['hud-ink-strong', ['paper', 'hud', 'hud-raised'], TEXT, 'panel'],
  ['hud-ink', ['paper', 'hud', 'hud-hover'], TEXT, 'panel'],
  ['on-hud-active', ['paper', 'hud', 'hud-active'], TEXT, 'panel'],
  ['on-hud-active', ['paper', 'hud', 'hud-active-hover'], TEXT, 'panel'],
  ['on-hud-danger', ['paper', 'hud', 'hud-danger'], TEXT, 'panel'],
  ['hud-focus', ['paper', 'hud'], EDGE, 'panel'],
  ['ruler-ink', 'ruler', TEXT, 'panel'],
  ['ruler-mark', 'ruler', EDGE, 'panel'],
  ['ruler-tick', 'ruler', EDGE, 'panel'],
];

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body></body></html>`);

const results = await page.evaluate(
  ({ themes, pairs }) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    /** Paints a stack of CSS colours, bottom first, on an opaque white base; returns sRGB. */
    const paint = (stack, lastAlpha = 1) => {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 1, 1);
      stack.forEach((colour, i) => {
        ctx.globalAlpha = i === stack.length - 1 ? lastAlpha : 1;
        ctx.fillStyle = colour;
        ctx.fillRect(0, 0, 1, 1);
      });
      ctx.globalAlpha = 1;
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b];
    };
    const luminance = ([r, g, b]) => {
      const lin = (c) => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const ratio = (a, b) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const hex = (rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;

    const out = {};
    for (const id of themes) {
      const host = document.createElement('div');
      host.dataset.theme = id;
      document.body.append(host);
      const zones = {};
      for (const zone of ['panel', 'chrome']) {
        const el = document.createElement('div');
        el.className = zone === 'panel' ? 'zone-light' : 'zone-dark';
        host.append(el);
        zones[zone] = (token, number = false) => {
          if (number) return Number(getComputedStyle(el).getPropertyValue(`--${token}`)) || 1;
          if (token === 'paper') return '#ffffff';
          const probe = document.createElement('span');
          probe.style.backgroundColor = `var(--${token})`;
          el.append(probe);
          const colour = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return colour;
        };
      }
      const rows = [];
      for (const [fg, bg, min, where, alphaToken] of pairs) {
        for (const zone of where === 'both' ? ['panel', 'chrome'] : [where]) {
          const read = zones[zone];
          // A translucent fill sits on the zone's own surface, which sits on the desk.
          const under = bg === 'desk' ? [] : bg === 'surface' ? ['desk'] : ['desk', 'surface'];
          const stack = (Array.isArray(bg) ? bg : [...under, bg]).map((token) => read(token));
          const back = paint(stack);
          const front = paint([...stack, read(fg)], alphaToken ? read(alphaToken, true) : 1);
          const value = ratio(front, back);
          rows.push({ zone, fg: alphaToken ? `${fg} × ${alphaToken}` : fg, bg: Array.isArray(bg) ? bg.at(-1) : bg, min, ratio: value, pass: value >= min, colours: `${hex(front)} on ${hex(back)}` });
        }
      }
      out[id] = rows;
      host.remove();
    }
    return out;
  },
  { themes, pairs: PAIRS },
);
await browser.close();

let failed = false;
for (const id of themes) {
  const rows = results[id];
  const bad = rows.filter((r) => !r.pass);
  const counts = !strictAll && BASELINE.has(id);
  const worst = rows.reduce((a, b) => (b.ratio / b.min < a.ratio / a.min ? b : a));
  const mark = bad.length === 0 ? '✓' : counts ? '·' : '✗';
  console.log(
    `${mark} ${id}: ${rows.length - bad.length}/${rows.length} pairs pass` +
      (bad.length === 0 ? ` (tightest: ${worst.fg} on ${worst.bg} ${worst.ratio.toFixed(2)}:1, needs ${worst.min})` : '') +
      (bad.length && counts ? ' — existing default look, reported only' : ''),
  );
  for (const r of bad) {
    console.log(`    ${r.zone.padEnd(6)} ${r.fg} on ${r.bg}: ${r.ratio.toFixed(2)}:1, needs ${r.min}:1 (${r.colours})`);
  }
  if (bad.length && !counts) failed = true;
}
process.exit(failed ? 1 : 0);
