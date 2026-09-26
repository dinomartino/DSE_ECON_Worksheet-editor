// The virtual clock (FILM.md §6.1), installed before any app script. The page only
// moves when Node calls `__vt.frame(ms)`: positive-delay timers, rAF, performance.now
// and Date follow the virtual clock; CSS transitions/animations are paused and seeked
// to it; randomness is seeded; the native caret is replaced by a deterministic overlay.
// Until `__vt.auto(false)`, the clock follows real time (off-camera preparation, reloads).

function installVirtualTime(cfg) {
  if (window.__vt) return;
  const R = {
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    setInterval: window.setInterval.bind(window),
    clearInterval: window.clearInterval.bind(window),
    raf: window.requestAnimationFrame.bind(window),
    caf: window.cancelAnimationFrame.bind(window),
    perfNow: performance.now.bind(performance),
    Date: window.Date,
    scrollIntoView: Element.prototype.scrollIntoView,
    getRandomValues: crypto.getRandomValues.bind(crypto),
  };

  let now = 0; // virtual ms since install
  let seq = 1 << 30; // virtual ids, clear of the browser's own
  const timers = new Map(); // id -> { at, fn, args, every }
  let rafs = new Map();
  const anims = new WeakMap(); // Animation -> { start, done }
  const scrolls = []; // eased programmatic scrolls: { el, x0, y0, x1, y1, start, dur }
  let lastActivity = 0;
  let auto = false;
  let busy = false;

  // ---- seeded randomness ----
  let seed = cfg.seed >>> 0;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = rand;
  crypto.getRandomValues = (arr) => {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(rand() * 256);
    return arr;
  };
  if (crypto.randomUUID) {
    crypto.randomUUID = () => {
      const b = crypto.getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    };
  }

  // ---- clocks ----
  performance.now = () => now;
  const RealDate = R.Date;
  function VDate(...args) {
    if (!new.target) return new RealDate(cfg.epoch + now).toString();
    return args.length ? new RealDate(...args) : new RealDate(cfg.epoch + now);
  }
  VDate.prototype = RealDate.prototype;
  VDate.now = () => cfg.epoch + Math.floor(now);
  VDate.parse = RealDate.parse;
  VDate.UTC = RealDate.UTC;
  window.Date = VDate;

  // ---- timers: positive delays are virtual, zero delays stay real ----
  window.setTimeout = function (fn, delay, ...args) {
    const ms = Number(delay) || 0;
    if (!(ms > 0) || typeof fn !== 'function') return R.setTimeout(fn, delay, ...args);
    const id = seq++;
    timers.set(id, { at: now + ms, fn, args, every: 0 });
    return id;
  };
  window.setInterval = function (fn, delay, ...args) {
    const ms = Number(delay) || 0;
    if (!(ms > 0) || typeof fn !== 'function') return R.setInterval(fn, delay, ...args);
    const id = seq++;
    timers.set(id, { at: now + ms, fn, args, every: ms });
    return id;
  };
  window.clearTimeout = (id) => (timers.has(id) ? timers.delete(id) : R.clearTimeout(id));
  window.clearInterval = (id) => (timers.has(id) ? timers.delete(id) : R.clearInterval(id));
  window.requestAnimationFrame = (cb) => {
    const id = seq++;
    rafs.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => (rafs.has(id) ? rafs.delete(id) : R.caf(id));
  window.requestIdleCallback = (cb) =>
    window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 10 }), 1);
  window.cancelIdleCallback = (id) => window.clearTimeout(id);

  // ---- smooth scrolling becomes an eased virtual-time scroll ----
  const scrollers = (el) => {
    const out = [];
    for (let n = el.parentElement; n; n = n.parentElement) {
      if (n.scrollHeight > n.clientHeight || n.scrollWidth > n.clientWidth) out.push(n);
    }
    out.push(document.scrollingElement);
    return out;
  };
  Element.prototype.scrollIntoView = function (arg) {
    if (!arg || typeof arg !== 'object' || arg.behavior !== 'smooth') return R.scrollIntoView.call(this, arg);
    const list = scrollers(this);
    const before = list.map((s) => [s.scrollLeft, s.scrollTop]);
    R.scrollIntoView.call(this, { ...arg, behavior: 'instant' });
    list.forEach((s, i) => {
      const [x1, y1] = [s.scrollLeft, s.scrollTop];
      const [x0, y0] = before[i];
      if (x0 === x1 && y0 === y1) return;
      s.scrollLeft = x0;
      s.scrollTop = y0;
      const dist = Math.hypot(x1 - x0, y1 - y0);
      scrolls.push({ el: s, x0, y0, x1, y1, start: now, dur: Math.min(700, Math.max(300, dist * 0.9)) });
    });
  };

  // ---- the frame ----
  const mc = () =>
    new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => resolve();
      ch.port2.postMessage(0);
    });
  const realFrame = () => new Promise((resolve) => R.raf(() => resolve()));
  const realTick = () => new Promise((resolve) => R.setTimeout(resolve, 0));
  async function drain(rounds = 3) {
    for (let i = 0; i < rounds; i++) {
      await mc();
      await realTick();
    }
  }
  const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);

  async function runTimersUntil(target) {
    for (;;) {
      let next = null;
      for (const [id, t] of timers) {
        if (t.at <= target && (!next || t.at < next[1].at || (t.at === next[1].at && id < next[0]))) next = [id, t];
      }
      if (!next) break;
      const [id, t] = next;
      now = Math.max(now, t.at);
      if (t.every) t.at += t.every;
      else timers.delete(id);
      try {
        t.fn(...t.args);
      } catch (e) {
        setTimeout(() => { throw e; }, 0);
      }
      await mc();
    }
    now = target;
  }

  function stepScrolls() {
    for (let i = scrolls.length - 1; i >= 0; i--) {
      const s = scrolls[i];
      const u = Math.min(1, (now - s.start) / s.dur);
      const k = ease(u);
      s.el.scrollLeft = s.x0 + (s.x1 - s.x0) * k;
      s.el.scrollTop = s.y0 + (s.y1 - s.y0) * k;
      if (u >= 1) scrolls.splice(i, 1);
    }
  }

  async function runRafs() {
    const due = rafs;
    rafs = new Map();
    for (const cb of due.values()) {
      try {
        cb(now);
      } catch (e) {
        setTimeout(() => { throw e; }, 0);
      }
    }
    await mc();
  }

  function syncAnimations() {
    for (const a of document.getAnimations()) {
      let rec = anims.get(a);
      if (!rec) {
        rec = { start: now, done: false };
        anims.set(a, rec);
      }
      if (rec.done) continue;
      const end = a.effect?.getComputedTiming?.().endTime ?? Infinity;
      const t = (now - rec.start) * (a.playbackRate || 1);
      if (a.playState !== 'paused') a.pause();
      if (Number.isFinite(end) && t >= end) {
        rec.done = true;
        a.finish();
      } else {
        a.currentTime = Math.max(0, t);
      }
    }
  }

  // ---- the caret overlay ----
  const style = document.createElement('style');
  style.textContent =
    '*, *::before, *::after { caret-color: transparent !important; scroll-behavior: auto !important; }';
  const caret = document.createElement('div');
  caret.id = '__vt_caret';
  caret.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483645;display:none;';
  const mount = () => {
    document.documentElement.appendChild(style);
    document.documentElement.appendChild(caret);
  };
  if (document.documentElement) mount();
  else document.addEventListener('DOMContentLoaded', mount);
  for (const type of ['keydown', 'input', 'selectionchange', 'focusin', 'mousedown']) {
    document.addEventListener(type, () => { lastActivity = now; }, true);
  }
  const measure = document.createElement('canvas').getContext('2d');

  function caretRect() {
    const el = document.activeElement;
    if (!el || !document.hasFocus()) return null;
    const textInput =
      el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLInputElement && /^(text|search|number|email|url|tel|password|)$/.test(el.type));
    if (textInput && el.selectionStart === el.selectionEnd && el.selectionStart !== null && !(el instanceof HTMLTextAreaElement)) {
      const cs = getComputedStyle(el);
      measure.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const full = measure.measureText(el.value).width;
      const upto = measure.measureText(el.value.slice(0, el.selectionStart)).width;
      const b = el.getBoundingClientRect();
      const padL = parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
      const padR = parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth);
      const inner = b.width - padL - padR;
      const align = cs.textAlign;
      const lead = align === 'center' ? Math.max(0, (inner - full) / 2) : align === 'right' || align === 'end' ? Math.max(0, inner - full) : 0;
      const size = parseFloat(cs.fontSize);
      const h = size * 1.2;
      return { x: b.left + padL + lead + upto - el.scrollLeft, y: b.top + (b.height - h) / 2, h, color: cs.color, size };
    }
    if (!el.isContentEditable) return null;
    const sel = getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return null;
    const range = sel.getRangeAt(0).cloneRange();
    const node = range.startContainer;
    const off = range.startOffset;
    const host = node.nodeType === 1 ? node : node.parentElement;
    const cs = getComputedStyle(host);
    const size = parseFloat(cs.fontSize);
    const color = cs.color;
    if (node.nodeType === 3 && node.length) {
      if (off > 0) {
        range.setStart(node, off - 1);
        const rects = range.getClientRects();
        const r = rects[rects.length - 1];
        if (r) return { x: r.right, y: r.top, h: r.height, color, size };
      } else {
        range.setEnd(node, off + 1);
        const r = range.getClientRects()[0];
        if (r) return { x: r.left, y: r.top, h: r.height, color, size };
      }
    }
    const r0 = sel.getRangeAt(0).getClientRects()[0];
    if (r0 && r0.height) return { x: r0.left, y: r0.top, h: r0.height, color, size };
    const target = node.nodeType === 1 ? node.childNodes[off] ?? node.childNodes[off - 1] ?? node : node;
    const box = (target.nodeType === 1 ? target : target.parentElement ?? host).getBoundingClientRect();
    const hcs = getComputedStyle(host);
    const lh = parseFloat(hcs.lineHeight) || size * 1.2;
    const h = Math.min(lh, size * 1.25);
    const left = target === host ? box.left + parseFloat(hcs.paddingLeft) : box.left;
    const top = (target === host ? box.top + parseFloat(hcs.paddingTop) : box.top) + (lh - h) / 2;
    return { x: left, y: top, h, color, size };
  }

  function drawCaret() {
    const r = caretRect();
    const on = r && (now - lastActivity) % 1060 < 530;
    if (!on) {
      caret.style.display = 'none';
      return r;
    }
    const w = Math.max(1.5, r.size / 11);
    caret.style.cssText =
      `position:fixed;pointer-events:none;z-index:2147483645;display:block;` +
      `left:${r.x - w / 2}px;top:${r.y}px;width:${w}px;height:${r.h}px;background:${r.color};border-radius:${w / 2}px;`;
    return r;
  }

  async function advance(ms) {
    await runTimersUntil(now + ms);
    stepScrolls();
    await runRafs();
  }

  async function frame(ms) {
    if (busy) throw new Error('vt: frame re-entered');
    busy = true;
    try {
      await realFrame(); // flush rAF-aligned input
      await drain();
      await advance(ms);
      await drain();
      await realFrame(); // resize/intersection observers see the new layout
      await drain();
      syncAnimations();
      const r = drawCaret();
      return {
        now, timers: timers.size, rafs: rafs.size, scrolls: scrolls.length,
        caret: r ? { x: r.x, y: r.y + r.h / 2 } : null,
      };
    } finally {
      busy = false;
    }
  }

  // Off-camera: follow real time, a real frame at a time.
  let lastReal = 0;
  async function autoTick() {
    if (!auto) return;
    const t = R.perfNow();
    const dt = Math.min(100, t - lastReal);
    lastReal = t;
    if (!busy) {
      busy = true;
      try {
        await advance(dt);
        syncAnimations();
        drawCaret();
      } finally {
        busy = false;
      }
    }
    R.raf(autoTick);
  }

  window.__vt = {
    frame,
    now: () => now,
    auto(on) {
      if (on === auto) return;
      auto = on;
      if (on) {
        lastReal = R.perfNow();
        R.raf(autoTick);
      }
    },
    /** Programmatic eased scroll of `el` to (x, y) over `dur` virtual ms. */
    scrollTo(el, x, y, dur) {
      scrolls.push({ el, x0: el.scrollLeft, y0: el.scrollTop, x1: x, y1: y, start: now, dur });
    },
    pending: () => ({ timers: timers.size, rafs: rafs.size, scrolls: scrolls.length }),
  };
  // Every page load starts following real time; a recording freezes it.
  window.__vt.auto(true);
}

/** The init script: the clock starts at `epoch` (ms) with `seed` for Math.random. */
export function virtualTimeScript({ epoch, seed = 20260929 }) {
  return `(${installVirtualTime.toString()})(${JSON.stringify({ epoch, seed })});`;
}
