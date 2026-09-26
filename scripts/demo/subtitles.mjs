// Subtitles for both demo films: one style, one timing rule, burned in after the camera
// (§ camera.mjs:renderFrames) and written beside the film as .vtt and .srt.
//
// Style (Apple's product films and apple.com): SF Pro Display (the system font, whose
// optical size switches to Display at this size) in medium weight, apple.com's tracking
// for 28px, #f5f5f7 on one dark glass capsule, bottom-centred, never a box per line. The
// glass is apple.com's material: the frame behind is blurred and saturated
// (`saturate(180%) blur(20px)`) under an 80% #161617 tint. Two lines at most.
// `**x**` in a string is dropped, not rendered.
//
// Timing: a subtitle stays up for its reading time at READING.cps (below Netflix's 17
// for children, because viewers are also following the pointer), never under
// READING.minSeconds; `d.say` holds the film until the previous one has had that long.
// Lines are at most 42 characters (Netflix English); a longer subtitle must carry its
// own '\n' at a natural break (BBC § 3.4), or `d.say` throws. Motion: § MOTION.

export const READING = { cps: 15, minSeconds: 1.5, maxSeconds: 7, maxLines: 2, maxLineChars: 42 };
const FADE = 4 / 30; // `d.say`'s margin over the reading time

/** The text as shown: the `**` markers dropped. */
export const plain = (text) => text.replace(/\*\*/g, '');

/** Seconds a subtitle needs on screen. */
export function readingSeconds(text) {
  return Math.max(READING.minSeconds, [...plain(text).replace(/\n/g, ' ')].length / READING.cps);
}

/** Throw on a subtitle over two lines or 42 characters a line. */
export function checkSubtitle(text) {
  const lines = plain(text).split('\n');
  const long = lines.find((l) => [...l].length > READING.maxLineChars);
  if (lines.length > READING.maxLines || long) {
    throw new Error(
      `subtitle "${text.replace(/\n/g, '⏎')}" breaks the ${READING.maxLines}×${READING.maxLineChars} rule` +
        (long ? ` ("${long}" is ${[...long].length} characters; break it with \\n)` : ''),
    );
  }
}

/** The capsule and its text, in output px (1440×900). */
export const LOOK = {
  weight: 500, size: 28, line: 36, tracking: '0.007em', ink: '#f5f5f7',
  padX: 28, padY: 11, bottom: 36, maxWidth: 0.76, radius: 26, // 1 line: a full capsule
  blur: 20, saturate: 1.8, tint: 'rgb(22, 22, 23)', tintAlpha: 0.8,
  edge: 'rgba(255, 255, 255, .14)', // a 1px inner hairline
  shadows: [{ y: 8, blur: 15, alpha: 0.16 }, { y: 1, blur: 2, alpha: 0.08 }], // CSS 0 8px 30px, 0 1px 4px
};

/**
 * The page the subtitle text is set in, one at a time, at output size and 1×:
 * `__subtitle.layout(text)` returns the capsule the text sits in, and the clip holding
 * the text with room for its blur and rise. The capsule itself is drawn by the post pass.
 */
export function subtitlePage(look = LOOK) {
  return `<!doctype html>
<html><head><style>
  html, body { margin: 0; background: transparent; }
  #pill {
    position: fixed; left: 50%; bottom: ${look.bottom}px; transform: translateX(-50%);
    box-sizing: border-box; width: max-content; max-width: ${look.maxWidth * 100}vw;
    padding: ${look.padY}px ${look.padX}px;
  }
  #text {
    display: block; text-align: center; white-space: pre-line; text-wrap: balance;
    font: ${look.weight} ${look.size}px/${look.line}px system-ui, BlinkMacSystemFont, -apple-system, "Helvetica Neue", Arial, sans-serif;
    letter-spacing: ${look.tracking}; color: ${look.ink};
    -webkit-font-smoothing: antialiased; font-optical-sizing: auto;
  }
</style></head><body><div id="pill"><span id="text"></span></div>
<script>
  const pill = document.getElementById('pill');
  const text = document.getElementById('text');
  window.__subtitle = {
    layout(s) {
      text.textContent = s;
      const r = pill.getBoundingClientRect();
      const m = 20; // the text's blur
      const x = Math.floor(r.left) - m;
      const y = Math.floor(r.top) - m;
      return {
        clip: { x, y, width: Math.ceil(r.right) + m - x, height: Math.min(innerHeight, Math.ceil(r.bottom) + m) - y },
        pill: { x: r.left, y: r.top, w: r.width, h: r.height, r: text.offsetHeight <= ${look.line} ? r.height / 2 : ${look.radius} },
      };
    },
  };
</script></body></html>`;
}

/**
 * Give driver `d` a `say(text)`: holds until the subtitle up now has had its reading
 * time, then puts up `text` ('' clears). Needs the film clock `filmSteps` puts on `d`.
 * Every subtitle is kept in `d.cues`; nothing is drawn in the page.
 */
export function withSubtitles(d) {
  d.cues = [];
  d.say = async (text) => {
    const prev = d.cues[d.cues.length - 1];
    if (prev?.text) {
      const left = readingSeconds(prev.text) + FADE - (d.clock() - prev.out);
      if (left > 0) await d.wait(Math.ceil(left * 1000 * d.speedNow()));
    }
    if ((prev?.text ?? '') === text) return;
    if (text) checkSubtitle(text);
    d.cues.push({ text: plain(text), wall: Date.now() / 1000, out: d.clock(), step: d.step() });
  };
  return d;
}

/** CSS `cubic-bezier(x1, y1, x2, y2)` as a function of progress 0-1. */
export function cubicBezier(x1, y1, x2, y2) {
  const at = (a, b, s) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  return (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < p) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}

// Motion (seconds, px). In: the capsule fades up `capsuleRise`; a frame later the text
// rises `textRise` and sharpens from a `textBlur` blur. Out: the text fades in place,
// quicker than it came. One subtitle replacing another keeps the capsule, which reshapes
// to the new text over `morph` while the text comes in; after the last, it fades with it.
export const MOTION = {
  capsuleIn: 0.35, textIn: 0.5, textDelay: 1 / 30, out: 0.25, morph: 0.4, morphDelay: 0.1,
  capsuleRise: 8, textRise: 12, textBlur: 6,
  fade: cubicBezier(0.25, 0.1, 0.25, 1), // CSS `ease`
  settle: cubicBezier(0.16, 1, 0.3, 1), // a strong ease-out: quick, then a long soft landing
  leave: cubicBezier(0.42, 0, 1, 1), // CSS `ease-in`
};

/**
 * The subtitle at output time `t`, or null: `capsule` (reshaping `from` one subtitle's
 * shape `to` another's by `morph` 0-1, its opacity and rise) and `words` (the text, its
 * opacity, rise and blur).
 */
export function captionState(cues, t, end, fps) {
  let i = -1;
  while (i + 1 < cues.length && cues[i + 1].at <= t) i++;
  const cue = cues[i];
  if (!cue?.text) return null;
  const next = cues[i + 1];
  const until = next ? next.at : end;
  const clamp = (x) => Math.min(1, Math.max(0, x));
  const r = (x, n = 100) => Math.round(x * n) / n;
  const since = t - cue.at + 1 / fps;
  const joined = !!cues[i - 1]?.text;
  const out = 1 - MOTION.leave(clamp(1 - (until - t) / MOTION.out));
  const p = clamp(since / MOTION.capsuleIn);
  const q = clamp((since - (joined ? MOTION.morphDelay : MOTION.textDelay)) / MOTION.textIn);
  const capsule = joined
    ? { from: cues[i - 1].text, to: cue.text, morph: r(MOTION.settle(clamp(since / MOTION.morph)), 1000), alpha: 1, rise: 0 }
    : { from: cue.text, to: cue.text, morph: 1, alpha: r(MOTION.fade(p)), rise: Math.round(MOTION.capsuleRise * (1 - MOTION.settle(p))) };
  if (!next?.text) capsule.alpha = r(capsule.alpha * out);
  if (capsule.alpha <= 0) return null;
  return {
    capsule,
    words: {
      text: cue.text,
      alpha: r(MOTION.fade(q) * out),
      rise: Math.round(MOTION.textRise * (1 - MOTION.settle(q))),
      blur: r(MOTION.textBlur * (1 - MOTION.settle(q)), 10),
    },
  };
}

/** Warnings for cues outside the reading rules, given their output start times. */
export function auditCues(cues, end) {
  const out = [];
  cues.forEach((c, i) => {
    if (!c.text) return;
    const dur = (i + 1 < cues.length ? cues[i + 1].at : end) - c.at;
    const chars = [...c.text.replace(/\n/g, ' ')].length;
    c.duration = dur;
    if (dur + 0.05 < readingSeconds(c.text)) out.push(`"${c.text}" is up ${dur.toFixed(2)} s, needs ${readingSeconds(c.text).toFixed(2)} s`);
    if (dur > READING.maxSeconds) out.push(`"${c.text}" is up ${dur.toFixed(1)} s, over ${READING.maxSeconds} s`);
    if (chars / dur > 17) out.push(`"${c.text}" reads at ${(chars / dur).toFixed(1)} cps`);
  });
  return out;
}

/** The cues as WebVTT and SubRip text: each subtitle from its start to the next cue. */
export function sidecars(cues, end) {
  const stamp = (s, sep) => {
    const ms = Math.round(s * 1000);
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}${sep}${p(ms % 1000, 3)}`;
  };
  const shown = cues
    .map((c, i) => ({ text: c.text, from: c.at, to: i + 1 < cues.length ? cues[i + 1].at : end }))
    .filter((c) => c.text);
  const vtt = ['WEBVTT', '', ...shown.flatMap((c) => [`${stamp(c.from, '.')} --> ${stamp(c.to, '.')}`, c.text, ''])];
  const srt = shown.flatMap((c, i) => [String(i + 1), `${stamp(c.from, ',')} --> ${stamp(c.to, ',')}`, c.text, '']);
  return { vtt: vtt.join('\n'), srt: srt.join('\n') };
}
