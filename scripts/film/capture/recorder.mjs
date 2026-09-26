// Frame-perfect recording in virtual time (FILM.md §6.1). Every output frame: apply the
// scripted input for that frame, advance the page's clock by 1/fps, let it settle,
// screenshot. Frame N is a pure function of the script. Coordinates are CSS px; events
// carry frame px (×dpr).
import fs from 'node:fs';
import path from 'node:path';

export const FPS = 60;

// Eases (t in 0..1).
export const quintInOut = (t) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2);
export const cubicInOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
export const quintOut = (t) => 1 - (1 - t) ** 5;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Sorted frame numbers → [[from, to], …]. */
function ranges(frames) {
  const out = [];
  for (const f of [...new Set(frames)].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && f === last[1] + 1) last[1] = f;
    else out.push([f, f]);
  }
  return out;
}

/** Track in-flight requests, so a lazily loaded chunk lands inside one frame. */
export function trackNetwork(page) {
  let inflight = 0;
  page.on('request', () => { inflight++; });
  const done = () => { inflight = Math.max(0, inflight - 1); };
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  return {
    async idle(timeout = 15000) {
      const until = Date.now() + timeout;
      while (inflight > 0 && Date.now() < until) await new Promise((r) => setTimeout(r, 10));
      return inflight === 0;
    },
    get inflight() { return inflight; },
  };
}

/** Resolve a target to a CSS-px point: {x,y}, a locator (its box, at `fx`,`fy`), or a function. */
export async function pointOf(target, { fx = 0.5, fy = 0.5, dx = 0, dy = 0 } = {}) {
  if (typeof target === 'function') return pointOf(await target(), { fx, fy, dx, dy });
  if (target && typeof target.boundingBox === 'function') {
    const loc = typeof target.first === 'function' ? target.first() : target;
    const b = await loc.boundingBox();
    if (!b) throw new Error('capture: target has no box (hidden or detached)');
    return { x: b.x + b.width * fx + dx, y: b.y + b.height * fy + dy };
  }
  return { x: target.x + dx, y: target.y + dy };
}

export class Recorder {
  constructor({ page, cdp, net, dir, name, dpr = 2, log = () => {}, dryRun = false }) {
    Object.assign(this, { page, cdp, net, dir, name, dpr, log, dryRun });
    this.frames = 0;
    this.events = [];
    this.motion = []; // [fromFrame, toFrame, what]
    this.expect = []; // frames where scripted input moves something by ≥ 1 frame px
    this.mouse = { x: 0, y: 0 };
    this.writes = [];
    this.caret = null;
    fs.mkdirSync(dir, { recursive: true });
  }

  get t() { return this.frames / FPS; }

  /** Show or hide the drawn pointer; macOS hides it while typing, until the mouse moves. */
  async pointerVisible(on) {
    if (this.pointerHidden === !on) return;
    this.pointerHidden = !on;
    await this.page.evaluate((show) => {
      const node = document.getElementById('__demo_cursor');
      if (node) node.style.visibility = show ? '' : 'hidden';
    }, on);
  }

  /** Place the pointer (off camera: before frame 0). */
  async place(x, y) {
    await this.page.mouse.move(x, y);
    this.mouse = { x, y };
  }

  /** Record one frame; `input` runs first (the frame's scripted events). */
  async frame(input) {
    if (input) await input();
    const ms = this.frames === 0 ? 0 : 1000 / FPS;
    let info = await this.page.evaluate((m) => window.__vt.frame(m), ms);
    // A lazily loaded chunk (and any it imports) lands within this frame: no virtual
    // time passes while the network works.
    for (let i = 0; this.net && this.net.inflight > 0 && i < 30; i++) {
      await this.net.idle();
      info = await this.page.evaluate(() => window.__vt.frame(0));
    }
    this.caret = info.caret ?? null;
    if (!this.dryRun) {
      const shot = await this.cdp.send('Page.captureScreenshot', {
        format: 'jpeg', quality: 93, captureBeyondViewport: false, fromSurface: true,
      });
      const file = path.join(this.dir, `${String(this.frames).padStart(5, '0')}.jpg`);
      this.writes.push(fs.promises.writeFile(file, Buffer.from(shot.data, 'base64')));
      if (this.writes.length > 64) await Promise.all(this.writes.splice(0));
    }
    this.frames++;
  }

  /** Record frames until film time `t` (seconds). */
  async until(t, input) {
    while (this.frames < Math.round(t * FPS)) await this.frame(input);
  }

  async hold(seconds) { await this.until(this.t + seconds); }

  /** Mark the next frame as one that must differ, when `cssPx` of motion is ≥ 1 frame px. */
  expectIf(cssPx) {
    if (cssPx * this.dpr >= 1) this.expect.push(this.frames);
  }

  event(kind, label, at = this.mouse) {
    this.events.push({
      t: +this.t.toFixed(4), kind,
      x: Math.round(at.x * this.dpr), y: Math.round(at.y * this.dpr), label,
    });
  }

  /** A stretch of scripted motion, for the frame-diff check. */
  async moving(what, fn) {
    const from = this.frames;
    const out = await fn();
    this.motion.push([from, this.frames - 1, what]);
    return out;
  }

  /**
   * Glide the pointer to `target` on an eased path with a slight arc, landing exactly
   * `dur` seconds later (default: from the distance).
   */
  async moveTo(target, { dur, arc = 0.07, ease = quintInOut, ...at } = {}) {
    const to = await pointOf(target, at);
    const from = { ...this.mouse };
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    if (dist < 0.5) return to;
    const seconds = dur ?? clamp(0.28 + dist / 1700, 0.32, 0.8);
    const n = Math.max(1, Math.round(seconds * FPS));
    // Perpendicular bow, always to the same side of travel: a hand's natural arc.
    const nx = -(to.y - from.y) / dist;
    const ny = (to.x - from.x) / dist;
    await this.moving('pointer', async () => {
      for (let i = 1; i <= n; i++) {
        const k = ease(i / n);
        const bow = arc * dist * 4 * k * (1 - k);
        const x = from.x + (to.x - from.x) * k + nx * bow;
        const y = from.y + (to.y - from.y) * k + ny * bow;
        this.expectIf(Math.max(Math.abs(x - this.mouse.x), Math.abs(y - this.mouse.y)));
        await this.frame(async () => {
          await this.pointerVisible(true);
          await this.page.mouse.move(x, y);
        });
        this.mouse = { x, y };
      }
    });
    return to;
  }

  /** Move to `target` and click; the click lands on the frame after arrival. */
  async click(target, { label = 'click', kind = 'click', count = 1, dwell = 0.12, gap = 5, ...opts } = {}) {
    const to = await this.moveTo(target, opts);
    if (dwell) await this.hold(dwell);
    const press = (clickCount) => async () => {
      await this.page.mouse.move(to.x, to.y);
      this.mouse = to;
      this.event(kind, label, to);
      await this.page.mouse.down({ clickCount });
      await this.page.mouse.up({ clickCount });
    };
    await this.frame(press(1));
    // A double-click's second press comes `gap` frames later, as a hand's would.
    if (count === 2) {
      for (let i = 1; i < gap; i++) await this.frame();
      await this.frame(press(2));
    }
    return to;
  }

  dblclick(target, opts = {}) { return this.click(target, { count: 2, label: 'double-click', ...opts }); }

  /** Click so the press lands exactly at film time `t` (the glide starts before it). */
  async clickAt(t, target, { dur = 0.45, dwell = 0.1, ...opts } = {}) {
    const start = Math.round(t * FPS) - Math.round(dur * FPS) - Math.round(dwell * FPS);
    await this.until(Math.max(this.frames, start) / FPS);
    return this.click(target, { dur, dwell, ...opts });
  }

  /** Press at `from`, travel to `to` in `dur` seconds (eased), release. */
  async drag(from, to, { dur = 0.8, label = 'drag', ease = cubicInOut, settle = 0.08, approach } = {}) {
    const a = await this.moveTo(from, { dur: approach });
    if (settle) await this.hold(settle);
    const b = await pointOf(to);
    await this.frame(async () => {
      this.event('drag-start', label, a);
      await this.page.mouse.down();
    });
    const n = Math.max(2, Math.round(dur * FPS));
    await this.moving('drag', async () => {
      for (let i = 1; i <= n; i++) {
        const k = ease(i / n);
        const x = a.x + (b.x - a.x) * k;
        const y = a.y + (b.y - a.y) * k;
        this.expectIf(Math.max(Math.abs(x - this.mouse.x), Math.abs(y - this.mouse.y)));
        await this.frame(() => this.page.mouse.move(x, y));
        this.mouse = { x, y };
      }
    });
    await this.frame(async () => {
      this.event('drag-end', label, b);
      await this.page.mouse.up();
    });
  }

  /** Type `text` at `cps` characters a second (0 = insert it at once, like a paste). */
  async type(text, { cps = 20, label } = {}) {
    const chars = [...text];
    if (!cps) {
      await this.frame(async () => {
        this.event('key', label ?? 'paste', this.caret ?? this.mouse);
        await this.pointerVisible(false);
        await this.page.keyboard.insertText(text);
      });
      return;
    }
    const start = this.frames;
    let i = 0;
    await this.moving('typing', async () => {
      while (i < chars.length) {
        const due = Math.floor(((this.frames - start) / FPS) * cps) + 1;
        if (due > i) this.expect.push(this.frames);
        await this.frame(async () => {
          while (i < Math.min(due, chars.length)) {
            await this.pointerVisible(false);
            this.event('key', chars[i], this.caret ?? this.mouse);
            await this.page.keyboard.type(chars[i]);
            i++;
          }
        });
      }
    });
  }

  async press(key, { label } = {}) {
    await this.frame(async () => {
      this.event('key', label ?? key, this.caret ?? this.mouse);
      await this.page.keyboard.press(key);
    });
  }

  /** Eased programmatic scroll of the element matched by `selector` to `y` (scrollTop). */
  async scrollTo(selector, y, { dur = 1.2, ease = quintInOut } = {}) {
    const y0 = await this.page.evaluate((s) => document.querySelector(s).scrollTop, selector);
    const n = Math.max(1, Math.round(dur * FPS));
    let last = y0;
    await this.moving('scroll', async () => {
      for (let i = 1; i <= n; i++) {
        const v = y0 + (y - y0) * ease(i / n);
        this.expectIf(Math.abs(v - last));
        last = v;
        await this.frame(() => this.page.evaluate(([s, top]) => { document.querySelector(s).scrollTop = top; }, [selector, v]));
      }
    });
  }

  /** Flush writes and describe the clip. */
  async finish(extra = {}) {
    await Promise.all(this.writes.splice(0));
    const meta = {
      name: this.name, fps: FPS, frames: this.frames,
      width: 1440 * this.dpr, height: 900 * this.dpr,
      duration: +(this.frames / FPS).toFixed(4),
      events: this.events,
      motion: this.motion.map(([from, to, what]) => ({ from, to, what })),
      expectChange: ranges(this.expect),
      ...extra,
    };
    return meta;
  }
}
