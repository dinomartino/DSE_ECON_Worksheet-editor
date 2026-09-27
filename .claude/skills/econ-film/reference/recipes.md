# Recipes

All commands from the repo root. `bin/` is `.claude/skills/econ-film/bin/`. Use
`export FILM_OUT=<scratch>/film-out` for every exploratory render.

## R0. Start a session

```sh
git switch -c feature/film-<topic> feature/film   # or the branch the film work is on
# in a worktree: ln -s "<main checkout>/node_modules" node_modules
npm --prefix scripts/film ci
npm run film:doctor                               # know the state before you touch anything
bin/regress.sh <scratch>/base 0 47                # 1 fps baseline, if you will claim "unchanged"
```

## R1. Change on-screen text

1. Edit the string in `COPY` (`scripts/film/timeline.mjs`). English and its `…Zh` partner
   are separate keys; change both or say why not. Traditional Chinese, Hong Kong usage.
   - `"\n"` forces a line break; an array is separate blocks (facts, subs, chips).
   - Keep the count of array items unless the scene is built for more: word's facts pair
     with cues `word.fact1…3`, everywhere's chips with `everywhere.chip1…5`,
     diagrams' `layerNames` with its six layers. More items = new cues + scene work (R3/R4).
2. `npm run film:doctor`. The text check reports, per block: overflow at the 80% floor
   (error), outside title-safe (error), shrunk to N% (listed). A shrink to ≥ 90% is fine;
   below that, shorten the copy or give the block room.
3. If a line refuses to wrap although the layout has room below it, the scene's box is too
   tight: raise `maxLines` (or `maxWidth`) in that scene's `lib.type.*` call — never break
   or rewrite the string inside the scene.
4. Longer copy needs longer reading time (≥ 1.0 s + 0.3 s/word, fully revealed). If the
   block's hold is now short, move its `T` times in the scene or its cue (R4).
5. Look at it: `node scripts/film/render.mjs --final --workers=4 --at=<t1>,<t2>` at the
   moments it is fully revealed, then `bin/sgrid.sh $FILM_OUT/build/stills/final-film g.jpg 3x2`.
   Check wrap, collisions with neighbours and UI, Chinese on one line. Finding the moment:
   the block's `set(t, t0, t1)` call and the scene's `T` map give `t0` (scene seconds; add
   `sceneStart`); it is fully in by `t0 + 0.72 s + 0.06 s × words`, the Chinese a little
   later — e.g. write's headline: `T.head` 2.0 → film 18.0, fully in by 19.4, out at 23.3.
   Render one frame either side too. `--at` always writes `final-film/`: copy the "before"
   frames out before rendering "after".
6. Update everything that quotes it: `grep -rn "<old string>" scripts/film` — the cue
   `note:` in `CUES`, the storyboard row in `FILM.md` §3 (both feed the generated README),
   and scene header comments.
7. Everything else must be unchanged: `bin/regress.sh` the scene's bars before and after
   into two folders, `bin/regdiff.py` them — only the seconds where the block is on screen
   may differ. No `film:score`: `COPY` is not in the score's hash.

Where each string sits: `COPY.window` → every app window's title bar (`lib/window.js`);
`word.window`/`word.styles` → the .docx window (`scenes/word/docWindow.js`), which must
match what the app really names the file and its styles.

## R2. Re-capture after a UI or feature change

Doctor warns `N assets predate the last src/ change <sha>` whenever `src/` has a newer
commit than an asset's `appCommit` stamp (or file time) — the footage may be out of date.

1. Decide which assets show the change: `node scripts/film/capture/capture.mjs --list`
   and `scripts/film/assets.mjs` (the `capture` field says which job makes each id; the
   `scenes` field says who uses it). The marks scene's assets come from
   `capture/extra-marks.mjs`.
2. Build the app you want filmed. `capture.mjs` serves **this checkout's** `out/` and only
   builds when `out/` is missing — delete `out/` (or `npm run build`, in the background)
   when `src/` changed. `extra-marks.mjs` serves the **main checkout's** `out/`.
3. Capture only those jobs, in the background (a full capture is ~9 min):
   `npm run film:capture -- --only=type-mcq,sheets` · `node scripts/film/capture/extra-marks.mjs --only=clip,sheet`.
   Add `--reseed` when the seed documents themselves must change (`capture/seed.mjs`,
   `capture/seed-docs.test.ts`, `scripts/demo/content.mjs`). Captures write straight into
   the shared store in the main checkout — every worktree sees them at once.
4. Review the capture: `build/capture-review/` has contact sheets and quick mp4s per clip;
   `capture/check-clip.mjs` reports duplicate frames and jumps.
5. Fix the scenes that use the asset. A clip's event times, the page's position in the
   frame and a sheet's layout are baked into scene constants (`T` maps, crop boxes,
   registered handoff poses). Compare the new clip JSON `events` with the old times;
   doctor's clip-window check fails any `placeClip` that now reads past the clip's end.
6. Events changed → `npm run film:score` (UI sounds come from clip events).
7. Stills of every scene in the asset's `scenes` list, and the seams next to them.

A new clip: add it to `capture/clips.mjs` (`name, dur, about, prepare, record`) or to the
scene's `capture/extra-<scene>.mjs`, add its id to `assets.mjs` with the scenes allowed to
load it, capture, then `placeClip` it. Clips are 60 fps, 2880×1800; keep the action where
the camera will look, and hold still frames at both ends so a scene can hold.

## R3. Add or replace a feature scene

A scene is bars in `SCENES`, a module `stage/scenes/<id>.js` (+ helpers in
`stage/scenes/<id>/`), its `COPY.<id>`, its cues `<id>.*`, and assets registered for it.

1. **Bible first.** Write the storyboard row in `FILM.md` §3: bars, world, what the viewer
   sees beat by beat, copy (≤ ~7 words a headline), the music section. Name the product
   truth it shows (§2) — the claim must visibly happen on screen.
2. **Agree both handoffs** with the neighbours (see contracts.md, Handoffs): the exact
   frame at each boundary (framing, object pose, brightness/world), and whether it is a
   cut on a registered frame or a hard cut between worlds. Write them in the scene's
   header comment and in the neighbour's.
3. **Footage**: a capture job for the product moment (R2), registered in `assets.mjs`.
4. **Timeline**: bars in `SCENES` (total must still tile 0..`DURATION`; change `bar(47)` if
   the film's length changes), `SECTIONS` for the music energy, `CHORDS` one per bar, cues
   with `<id>.<name>` ids for every accent the picture and the music share.
5. **Scene module**: start from a sibling scene of the same world. Shape:
   `COPY.<id>` for text, `const at = (id) => cueAt(id) - sceneStart('<id>')` for times, one
   `T` map of scene seconds (derived from cues where they are shared), `setup` builds
   (and `placeClip`s), `update(t)` poses everything from `t` alone. Use `lib/` (type, win,
   paper, camera, ease, noise, floor, particles) — do not re-invent them.
6. **Iterate cheap**: `npm run film:stills -- --scene=<id>` (preview PNGs), `--final --at=`
   for exact frames, `--preview --scene=<id>` video for motion. Keep each render < 100 s.
7. **Critic pass** (craft.md): an independent reviewer with the scene's stills grid and a
   short final render, structured findings, then fix. Budget two rounds.
8. `npm run film:score`, doctor, seams both sides, motion-check on the range.

Replacing a scene keeps its bars and handoffs unless you also rework the neighbours.
Removing one: delete its row, re-tile the bars, drop its cues and `COPY`, and remove its id
from each asset's `scenes` (doctor flags missing assets, not unused ones — prune by hand).

## R4. Retime a moment, a cut or the score

- A picture accent the music also hits → move the cue's `t` in `CUES` (keep the id).
  Scenes read it with `cueAt`, so the picture follows; then `npm run film:score`.
- A moment only the picture has → the scene's `T` map.
- A scene boundary → `SCENES` bars (cuts land on bars or half-bars), then every cue and
  `T` time near it, `SECTIONS`/`CHORDS` if bars were added, and both handoffs.
- Keep cues sorted by `t` and unique by id; doctor checks. A whoosh's `peak` goes on the
  picture's fastest frame, not its start. Big hits need an 8th-note of air before them.
- The score is stale whenever the timeline hash or `build/events.json` changed:
  `render.mjs` rebuilds a stale score before muxing and refuses one it cannot rebuild;
  `npm run film:score` rebuilds it explicitly (~40 s), and `score.mjs report` re-verifies.
- Music changes (arrangement, melody, instruments) live in `score/scorelib/`; read
  `score/README.md` first. Listen to `audio/score-excerpt.mp3`, look at `spectrogram.png`,
  and make `report.txt` pass (loudness, peaks, hit contrast, cue onsets within 5 ms).

## R5. Render and verify

| Want | Command |
|---|---|
| Look at a scene fast | `npm run film:stills -- --scene=<id>` |
| Exact 1080p frames | `node scripts/film/render.mjs --final --workers=4 --at=12.5,19.4` |
| Motion of a short range | `node scripts/film/render.mjs --final --workers=4 --from=<bar> --to=<bar+2>` |
| A whole-film preview | `npm run film:preview` (background) |
| The deliverable | `npm run film` (background; capture skipped when the store is complete) |

Outputs (under `$FILM_OUT` or `demo-media/film/`): `build/stills/<mode>-<label>/`,
`build/renders/<mode>-<label>.mp4`, the film, `poster.jpg`, `contact-sheet.jpg`,
`README.md`. Gate a range with `node scripts/film/tools/motion-check.mjs <video>`; check
determinism with `node scripts/film/tools/determinism.mjs`. Before delivery: doctor exit
0, score report passes, the full final watched once with sound.

## R6. Make a new film from the engine (spotlight, social cut)

What carries over unchanged: capture (virtual time, the asset store, the registry), the
engine's contract (`seek(t)` pure, transitions, motion blur, post), `lib/`, the renderer,
the doctor, the score's instruments and master. What is specific to the 94 s film:
`timeline.mjs` (one module, imported by the engine, every scene, render, doctor, score and
tools), the scene modules (layout in 1920×1080 design px, times from their own cues, and
handoffs that name their neighbours — `diagrams` imports `marks/kit.js`, which reads
`sceneStart('marks')`, so dropping `marks` from `SCENES` throws), and the arrangement
(`score/scorelib/arrangement.py` keys its parts off the section ids `intro-a`, `intro-b`,
`groove-a`, `hero`, `groove-b`, `breakdown`, `final`, `outro`).

**Step 0 — make the timeline selectable (not built yet; do it once, as its own change):**
1. Move the film's data to `scripts/film/films/<name>/timeline.mjs` (the 94 s one becomes
   `films/launch/`), keeping `timeline.mjs` as a re-export of the default so nothing breaks.
2. The engine loads the timeline named by `?film=<name>` (dynamic `import()`), and scenes
   read it only through `ctx.timeline`, `ctx.cue(id)`, `ctx.copy`, `ctx.start` (they exist
   today) instead of importing `timeline.mjs` — scene helpers take `ctx` as a parameter.
3. `render.mjs`, `film.mjs`, `tools/doctor.mjs`, `timeline-json.mjs` (and so the score)
   take `--film=<name>` / `FILM_NAME`, and write outputs under `demo-media/film/<name>/`.
4. Prove it: the 94 s film renders pixel-identical (R0 baseline, `bin/regdiff.py`).

**A 30 s feature spotlight (16:9):** a new `films/<name>/timeline.mjs` (e.g. 15 bars at
120 BPM: a 2-bar cold open, 10 bars of the feature, a 3-bar end card), new scene modules
for anything whose handoffs or pacing differ (copy an existing scene as a start; keep
`opening`/`end` only if their bars and cues exist in the new timeline), `COPY` for the new
film, sections that reuse the arrangement's ids (or a new arrangement), then R3–R5.

**A 9:16 social cut:** the overlay design space is fixed at 1920×1080 today (`DW, DH` in
`stage/engine.js`, `W`/`SAFE` in `stage/lib/type.js`, `orbit`'s `W, H` defaults in
`stage/lib/camera.js`, `minPx` scaling in `stage/lib/particles.js`, title-safe in
`tools/doctor.mjs`). Make those come from the timeline's `W`/`H` first (a pixel-identical
change for 16:9), then compose portrait scenes: text stacks above/below a centred product,
windows crop to the page, the camera frames vertically. Rendering with `--w=1080 --h=1920`
alone gives a portrait camera on landscape poses and shrinks the type overlay (scaled by
`W / 1920`) into a band at the top — not a usable cut. Cells in grids stay ≤ 480 px on the long side.

Either way: a bible for the new film first (its own `FILM.md`-style storyboard, 1–2 pages),
then the orchestration in orchestration.md scaled down.
