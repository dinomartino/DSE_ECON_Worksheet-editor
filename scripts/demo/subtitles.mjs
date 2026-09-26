// Subtitles for both demo films: one style, one timing rule, burned in after the camera
// (§ camera.mjs:renderFrames) and written beside the film as .vtt and .srt.
//
// Style (BBC Subtitle Guidelines, Netflix Timed Text Style Guide, DCMP Captioning Key):
// white, medium-weight system sans, on a translucent black box drawn per line with
// half an em either side; two lines at most; bottom-centred inside the BBC's active area
// (5% from the bottom, 76% of the width). 32px on a 900px frame is a 40px line, 4.4% of
// the height: the BBC's presentation size (0.6-0.8 of a 7-8% authoring line).
// No bold: subtitles keep one weight. `**x**` in a string is dropped, not rendered.
//
// Timing: a subtitle stays up for its reading time at READING.cps (below Netflix's 17
// for children, because viewers are also following the pointer), never under
// READING.minSeconds; `d.say` holds the film until the previous one has had that long.
// Lines are at most 42 characters (Netflix English); a longer subtitle must carry its
// own '\n' at a natural break (BBC § 3.4), or `d.say` throws. Fades are 4 frames; one
// subtitle replacing another leaves a 2-frame blank between them.

export const READING = { cps: 15, minSeconds: 1.5, maxSeconds: 7, maxLines: 2, maxLineChars: 42 };
const FADE = 4 / 30;

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

/**
 * The page the subtitles are drawn in, one at a time, at output size (1440×900, 1×):
 * `__subtitle.layout(text)` sets the text and returns the box to screenshot.
 */
export const SUBTITLE_PAGE = `<!doctype html>
<html><head><style>
  html, body { margin: 0; background: transparent; }
  #box { position: fixed; left: 12%; right: 12%; bottom: 5%; text-align: center; text-wrap: balance; white-space: pre-line; }
  #line {
    font: 500 32px/40px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #fff; letter-spacing: .005em; background: rgba(8, 8, 8, .78); padding: 0 .5em; border-radius: 3px;
    -webkit-box-decoration-break: clone; box-decoration-break: clone; -webkit-font-smoothing: antialiased;
  }
</style></head><body><div id="box"><span id="line"></span></div>
<script>
  const line = document.getElementById('line');
  window.__subtitle = {
    layout(text) {
      line.textContent = text;
      // Pad each line's box to exactly the 40px line, so stacked lines meet without a gap or overlap.
      line.style.paddingTop = line.style.paddingBottom = '0px';
      const pad = Math.max(0, (40 - line.getClientRects()[0].height) / 2);
      line.style.paddingTop = line.style.paddingBottom = pad + 'px';
      const rects = [...line.getClientRects()];
      const x = Math.floor(Math.min(...rects.map((r) => r.left))) - 1;
      const y = Math.floor(Math.min(...rects.map((r) => r.top))) - 1;
      const right = Math.ceil(Math.max(...rects.map((r) => r.right))) + 1;
      const bottom = Math.ceil(Math.max(...rects.map((r) => r.bottom))) + 1;
      return { x, y, width: right - x, height: bottom - y };
    },
  };
</script></body></html>`;

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

/** The subtitle at output time `t` and its opacity (quarter steps), or null. */
export function captionAlpha(cues, t, end, fps) {
  let i = -1;
  while (i + 1 < cues.length && cues[i + 1].at <= t) i++;
  const cue = cues[i];
  if (!cue?.text) return null;
  const next = cues[i + 1];
  const until = next ? next.at : end;
  let a = (t - cue.at + 1 / fps) / FADE;
  if (next?.text) {
    if (t >= until - 2 / fps) return null;
  } else a = Math.min(a, (until - t) / FADE);
  a = Math.min(1, Math.ceil(a * 4) / 4);
  return a > 0 ? { text: cue.text, alpha: a } : null;
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
