# Contracts

The interfaces between the film's parts. The bible (`scripts/film/FILM.md` §5–§8) has the
original spec; where this and the code disagree, the code wins — fix this file.

## Time

120 BPM, 4/4: beat 0.5 s, bar 2 s = 120 frames at 60 fps. `timeline.mjs` exports `BPM,
BEAT, BAR, FPS, W, H, bar(n), DURATION` (= `bar(47)`). Film seconds are absolute; scene
seconds `t` are relative to the scene's start bar (`sceneStart(id)`) and may be < 0 or
> `dur` inside a transition.

## SCENES

`{ id, from, to, world: 'night'|'day'|'mixed', in: { type, beats? }, out? }`, bars, tiling
0..47 with no gap or overlap (doctor checks). `in.type`: `cut` (no length),
`fadeFromBlack`/`fadeToBlack` (inside the scene from its edge), or a centred transition
`dissolve | blurDissolve | pushThrough | whip | dipToBlack` lasting `beats`, during which
both scenes render (`sceneWindow(id)` gives the padded window). Every boundary in the
current film is a `cut`: neighbours hand over on a registered frame instead.

## CUES

`{ id: '<scene>.<name>', t, kind, strength, to?, peak?, note }`, sorted by `t`, ids unique,
`0 ≤ t ≤ DURATION`. Kinds: `hit, whoosh, riser (to), swell, tick, breath (strength < 1 =
the band opens up rather than stopping), drop, end`. Read with `cue(id)` / `cueAt(id)`
(throws on an unknown id); in a scene `ctx.cue(id)` gives scene seconds. **The id is the
contract**: retime by changing `t`, never by renaming. `note` is commentary only (it feeds
the generated README) — it goes stale when copy changes; update it.
`MONTAGE_CUTS` generates `montage.cut1…8`; `SECTIONS` (`{id, from, to, energy}` in bars)
and `CHORDS` (one per bar) drive the music.

## COPY and text fit

Every on-screen string is in `COPY` (`COPY.window` + one object per scene; `ctx.copy` is
this scene's). `"\n"` = forced break, array = separate blocks. Scenes never split, join or
rewrite copy. Build text with `lib.type.headline|sub|small|eyebrow|text(ctx.el, spec)`:

| spec | Meaning |
|---|---|
| `en`, `zh` | The strings. zh sits under en (0.42× a headline's size, 0.9× a sub's) |
| `x, y, align, valign` | Design px (1920×1080); `left|center|right`, `top|middle|bottom` of the block |
| `size, zhSize, zhGap, world, gradient` | Overrides; `gradient` = index of one EN word (twice per film max) |
| `maxWidth` | Default: the room inside the 96 px title-safe margins at x, for that align |
| `maxLines` | Default: the `"\n"` lines as written. Raise it where the layout has room |
| `zhMaxLines` | Default 1 |
| `halt`, `kernStop` | Half-width CJK punctuation; pull a trailing 。 in |

Fit: as written if it fits → else wrap (spaces; CJK between characters; never start a line
with 。，、？！）」』：；.,?!)) → else shrink the whole block (zh too) in 2% steps to
`FIT_FLOOR` 0.8 → else `console.warn('type: "…" overflows …')`. The block returns
`.set(t, t0, t1)` (reveal at t0, exit at t1 — pure in t), `.place()`, `.lines`, `.scale`,
and `root.fit` (read by the doctor). Stacked blocks position from `.lines`/`.scale`.
Reading time: `lib.type.readTime(words)` = 1.0 + 0.3 s/word, counted from full reveal.

## Asset registry (`assets.mjs`)

`ASSETS[id] = { kind: 'clip'|'still'|'sheet'|'layer'|'export', path, capture, scenes }`.
`path` is relative to the store (`<main checkout>/demo-media/film/assets/`); a clip's path
is its frames folder, with `<path>.json` beside it. `capture` is the command that remakes
it; `scenes` are the only scenes allowed to load it (the engine refuses others and any
raw path). Add an asset = capture job + registry entry, in the same commit.
`manifest.json` in the store lists every file with size, description and `appCommit`
(the last `src/` commit when it was captured; stamped by `capture/manifest.mjs`).

## Scene module (`stage/scenes/<id>.js`)

```js
const scene = {
  id: 'word', world: 'night',                 // world defaults to the SCENES row
  async setup(ctx) {},                        // build into ctx.scene / ctx.el, load, placeClip
  update(t, ctx) {},                          // pose everything from t alone
  events: [{ t: 0.2, kind: 'tick', strength: 0.4 }], // optional extra scene-relative sounds
};
export default scene;
```

The engine imports `./scenes/${id}.js` for each `SCENES` id; a missing module fails the
render. `update` runs several times per frame (motion-blur sub-frames) and for any `t` in
any order: it must be a pure function of `t` (no clocks, `Math.random`, or state carried
between calls; seeded `lib.noise` for variation). Every value continuous in `t` except at a
cut. House style: `const START = sceneStart(id); const at = (c) => cueAt(c) - START;` and
one `T` map of scene seconds at the top, derived from cues where picture and music share
the moment; constants in design px with a comment on what they register to.

`ctx`: `id, THREE, scene, camera` (PerspectiveCamera, fov 30, the scene drives it), `el`
(this scene's overlay root), `dur, start, beat, bar, fps, W, H` (design px: 1920×1080, or 1080×1920 in portrait),
`format` ('landscape' | 'portrait'), `portrait`, `safe` ({x0, x1, y0, y1}, the text safe area),
`pick({ landscape, portrait })` (the value for this format; `format.mjs`, FILM-9x16.md),
`renderW, renderH` (actual), `world, timeline, copy, cue(id)` (scene seconds), `lib`,
`rig`, `backdrop`, `post` (`{ bloom, samples, dof, vignette, exposure }` — raise `samples`
for fast moves, `dof: {focus, aperture, maxBlur}`), `load.texture(id) | clip(id) | url(id)`
(registry ids only), `placeClip(id, {at, from, rate, dur})`, `onPrepass(fn, {once})`,
`onDispose(fn)`, `dry` (true while the engine only collects events/placements: build
nothing heavy, textures are stubs). Everything loaded or added is freed when the scene
leaves; register anything else with `onDispose`.

## Clips

Capture writes `clips/<name>/00000.jpg…` (60 fps, 2880×1800, JPEG) and `clips/<name>.json`:
`{ name, fps, frames, width, height, duration, events: [{ t, kind, x, y, label }] }`, kinds
`click | key | drag-start | drag-end | toggle`, `t` in clip seconds, x/y in frame px.
`await ctx.load.clip(id)` → `{ duration, fps, frames, events, frameAt(clipSeconds) }`
(texture of frame `round(t·fps)`, clamped; cached and prefetched).

`ctx.placeClip(id, { at, from = 0, rate = 1, dur })` declares that clip time `from` plays at
scene time `at`, at `rate`, for `dur` scene seconds (default: to the window's end). It is
what moves the clip's events into film time for the score (`from + (t − at)·rate`), and
what doctor checks against the clip's length. **It does not drive the picture**: the scene
calls `frameAt` with its own clip time — compute both from one mapping so sound and picture
agree, and add a placement for every stretch you show (including montage shots).

## Handoffs

Where two scenes meet on a `cut`, the outgoing scene's last frame and the incoming scene's
first frame must register: same object, same screen position and size, same light. The
pair agrees on constants and both sides cite them — e.g. `scenes/marks/kit.js` exports
`HANDOFF` (a dolly that runs from `diagrams.touch` through the cut) and `handoff(lib, f)`,
which both `diagrams.js` and `marks.js` use; `word.js` opens on papers' last frame
(`AZ0, DIST0, SHIFT0, SHEET0, ROOM0`, and the asset `question-done` papers ends on).
A cut between worlds (night ↔ day) is a hard cut on a downbeat, motion matched (a push
continues through it rather than reversing). Verify a seam with stills either side of the
cut (`bin/seam.py`): no luma pop, no jump of the subject, no stop.

## The engine's page API (`stage/index.html` + `stage/engine.js`)

`window.film = { ready(), fps, duration, seek(t), events(), placements(), text(), gpu() }`.
`seek(t)` resolves once every texture for `t` is uploaded and the DOM laid out; the
same `t` always gives the same pixels. `events()` = timeline cues + scene `events` + clip
events through their placements (film seconds, `source: cue|scene|clip`). `placements()`
and `text()` are the doctor's probes. Query string: `?w=&h=&fps=&shutter=&assets=&ui&t=`
(and the dev overrides `transition=`, `dof=`). `node scripts/film/tools/serve.mjs` serves
it for a look in a browser (`…/film/stage/index.html?ui&t=12`).

## Render, events, score

1. `render.mjs` starts N Chrome workers (GPU required; SwiftShader is refused unless
   `--allow-software`), writes `build/events.json` from `film.events()`, renders frame
   ranges → near-lossless segments → one H.264 encode muxed with `audio/score.wav`.
2. The score: `score.mjs music` (timeline → `music.wav`, stems), `sfx` (`build/events.json`
   or, before one exists, the cues → `sfx.wav`), `mix` (master → `score.wav`, then verify →
   `report.txt/json`), `all` = the three. Python ≥ 3.10; `.venv` built on first run.
3. **Freshness**: `music-levels.json` records `timeline_sha256` (a canonical-JSON hash of
   `BPM, DURATION, SECTIONS, CUES, CHORDS`); `sfx-events.json` records it plus
   `source_sha256` of the `events.json` text. `render.mjs` (`scoreState`) recomputes both:
   stale music or sfx → it rebuilds before muxing, and refuses to mux one it cannot
   rebuild (`--stale-audio` overrides, not for delivery). So any cue edit — even a `note`
   or a new id — makes the score stale; any change to a clip's events or a placement makes
   the sfx stale.
4. `film.mjs` = capture (skipped when the store is complete) → events → `score.mjs all`
   → render → poster, contact sheet, `README.md` (`tools/readme.mjs`, from `FILM.md`'s
   storyboard and the cue notes).

## Doctor (`tools/doctor.mjs`)

Seven checks; errors exit 1, warnings don't. 1 timeline (tiling, cues sorted/in range/
unique) · 2 assets (every registry file present, clip frame counts) · 3 GPU · 4 clip
windows (every `placeClip` inside its clip) · 5 score freshness (warn) · 6 text fit (the
stage at 640×360 every 0.2 s; each block judged mid-way through its fully revealed span:
not over its box, not past the 80% floor, inside title-safe 96 px sides / 72 px top and
bottom; lists every shrunk block) · 7 capture age (warn when an asset's `appCommit`, or
its file time, predates the last `src/` commit). `--skip-stage` runs 1, 2, 7 without a
browser; `--step=<s>` changes the text sampling.
