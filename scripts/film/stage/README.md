# Stage

The Three.js composition renderer (FILM.md §5). `index.html` + `engine.js` expose
`window.film = { ready, seek(t), events(), fps, duration, gpu() }`; `render.mjs` drives it.

## Look at your work

```sh
node scripts/film/tools/serve.mjs                      # then open …/film/stage/index.html?ui&t=12
node scripts/film/render.mjs --final --scene=write --stills=0.25   # PNGs in build/stills/
node scripts/film/render.mjs --preview --from=8 --to=16            # a range → build/renders/
node scripts/film/tools/motion-check.mjs <video>        # stalls and jumps
node scripts/film/tools/determinism.mjs                 # frames identical out of order
```

`--assets=fake` serves only the synthetic stand-ins (`tools/fake-assets.mjs`). A clip in
the real store is never mixed with stand-in frames. `--transition=<scene>:<type>:<beats>`
and `--dof=<focus>,<aperture>,<maxBlur>` override the timeline for testing.

## A scene (`scenes/<id>.js`)

```js
const scene = {
  id: 'write', world: 'day',
  async setup(ctx) { /* build into ctx.scene / ctx.el; load via ctx.load; ctx.placeClip(...) */ },
  update(t, ctx) { /* pose everything from t (scene seconds; may be < 0 or > ctx.dur) */ },
  events: [{ t: 0, kind: 'hit', strength: 1 }],
};
export default scene;
```

`ctx`: `THREE, scene, camera, el, dur, beat, bar, W/H` (1920×1080 overlay px), `renderW/H`,
`world, copy` (this scene's COPY), `lib`, `post`, `rig`, `backdrop`, `load.{texture,clip,json}`,
`placeClip(name, {at, from, rate, dur})`, `onPrepass(fn)`, `onDispose(fn)`.

## Rules

- `update` is a pure function of `t`: no clocks, no `Math.random` (use `lib.noise`), no state
  carried between calls. The engine calls it several times per frame (motion blur).
- Every parameter is continuous in `t`. A value that steps between two frames is a pop;
  only a cut may change the picture at once. Start fast moves from rest (`cubicBezier`).
- Bloom takes only what exceeds 1.0: paper and screens (unlit, ≤ 1.0) never glow; the dot
  (`logo`) does. Lit 3D materials opt into tone mapping with `lib.tonemap.filmic`.
- Fast camera moves: set `ctx.post.samples` (e.g. 12–24) for more motion-blur sub-frames.
- Text comes from `COPY` only; give each block the box it may fill (`maxWidth`, `maxLines`).
- Every clip use gets a `placeClip`, so its clicks and keys reach the score.
- Objects, textures from `ctx.load`, and anything with `userData.dispose` are freed when
  the scene leaves; register other resources with `ctx.onDispose`.

## Library (`lib/`)

| Module | For |
|---|---|
| `ease` | eases, `spring`, `seg`, `kf` keyframes, `cubicBezier` |
| `noise` | seeded `hash`, `noise1/2`, `wander` drifts, `rng` for setup layout |
| `type` | `headline/sub/small/eyebrow(el, {en, zh, x, y, maxWidth, maxLines, …})` → `.set(t, t0, t1)`, `.place()`, `.lines`, `.scale` |
| `logo` | the mark in 3D: draw-on strokes and axis, tile extrude, dot glow, light sweep |
| `paper` | an A4 sheet with bend, curl, edge and contact shadow |
| `win` | a generic window (`mac`, `windows`, `browser`, `none`) showing a still or clip frame |
| `floor` | glossy night floor with blurred reflection; day contact shadows |
| `particles` | bokeh dust |
| `rigs` | night / day lighting and environments (the engine applies one per world) |
| `camera` | `orbit` (with lens `shift`), `drift`, `distFor`, `dolly` |
| `clip` | image-sequence clips (`frameAt(t)`), `placedEvents` |
| `backdrop` | the world backgrounds |
