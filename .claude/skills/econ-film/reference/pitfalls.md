# Pitfalls

Each of these cost real time once.

## Environment

- **"[Request interrupted by user]" in an agent log is the stall watchdog** (no output for
  180 s), not the user. See orchestration.md for the pacing rules.
- macOS has no `timeout`: use `bin/timeout SECS cmd` (kills the process group).
- **GPU only.** Headless Chrome may fall back to SwiftShader (doctor check 3 fails;
  render refuses). `--headed` renders in an off-screen window. Several agents rendering at
  once share one GPU: `--workers=3–4` each, ≤ 2 bars per command.
- Worktrees have no root `node_modules`: symlink the main checkout's. The film's own deps
  (`three`) install with `npm --prefix scripts/film ci`.
- `FILM_OUT` unset = your render and `film:score` write into the main checkout's
  `demo-media/film/` (build, audio, the film). Set it for anything exploratory.
- `render.mjs` clears `build/stills/<mode>-<label>/` each run unless `--keep`: copy stills
  out before the next render with the same label (`--at` always writes `final-film`).

## Capture

- The asset store is the **main checkout's** `demo-media/film/assets/`, shared by every
  worktree. A capture overwrites the shared asset at once; nothing is versioned.
- `capture.mjs` serves this checkout's `out/` and builds only when it is missing — a stale
  `out/` films the old UI. `extra-marks.mjs` serves the main checkout's `out/`.
- Frames are a pure function of the script because `capture/vtime.mjs` virtualises time
  (timers, rAF, `Date`, CSS animations via WAAPI, `Math.random`), hides the native caret
  and draws its own. A new kind of UI animation that looks jerky or missing in a capture
  probably escapes the shim; fix the shim, not the clip. Scroll with `scrollTop`, never
  wheel smooth-scroll.
- `appCommit` is stamped only on assets a run rewrites; older assets fall back to file
  times in doctor's capture-age check.
- LibreOffice lacks PMingLiU on this Mac, so bilingual `.docx` renders overlap; film the
  EN / diagram `.docx` renders.
- Clip event times are baked into scenes (`T` maps, `placeClip` windows). A re-capture that
  shifts an event by a few frames moves a click off its beat without any error — compare
  the new `events` with the old.

## Stage

- `update(t)` is called several times per frame (motion blur) and out of order: any state
  carried between calls breaks determinism and blur. Derive everything from `t`.
- `setup` also runs in a **dry** pass (events, placements, doctor): no pixels, stub
  textures (`if (!tex.image) …`). Don't make setup depend on image data.
- `placeClip` feeds sound and the doctor; `frameAt` feeds the picture. They are separate —
  a placement that disagrees with the frames makes the clicks land off the picture, and a
  placement past the clip's end (write placed 8.40 s of an 8.00 s clip) is a doctor error.
- Scenes import their neighbours' constants (`diagrams.js` → `scenes/marks/kit.js`, which
  reads `sceneStart('marks')`): removing or renaming a scene breaks the other one.
- `maxLines` defaults to the lines as written, so a headline written on one line can never
  wrap unless the scene sets `maxLines` — set it wherever the layout has room.
- Doctor judges a text block mid-way through its fully revealed span; a block never fully
  revealed (the curve label "D") gets the fit check only.
- `film:stills` is preview resolution (960×540); regression baselines and fine type checks
  use `--final` stills. 1 fps stills fall on whole seconds, which miss most text reveal
  peaks — for text, render `--at=` the fully revealed moments.

## Timeline and score

- The score's freshness hash covers the whole `CUES` array, **notes included**: editing a
  cue's `note` makes the score stale (render rebuilds it; ~40 s).
- `note:` strings and the FILM.md storyboard quote on-screen copy; they go stale silently
  when `COPY` changes.
- Cues of one kind within 50 ms merge in the sfx (strongest wins); a cue and a clip event
  on the same moment can double a sound.
- A cue retime moves the picture only where the scene reads it with `cueAt`; times typed
  into a `T` map as numbers do not follow.

## Picture

- A dissolve between two registered frames only blurs the downbeat; a crossfade between
  UI states is a double exposure. Cut.
- Near-black gradients band and go green in yuv420 without the engine's dither grain; the
  final x264 settings keep it (FILM.md §8). Don't strip the grain or re-encode with
  default settings.

## Repo

- `.gitignore` ignores `.claude/*` except `.claude/skills/econ-film/`: this skill is
  versioned; worktrees, local settings and other installed skills are not.
- `src/` is never changed for the film. `npm test`, `npm run typecheck` stay green;
  `npm run lint` keeps its baseline (44).
- Paths cited in `docs/` are checked by `src/test/codemap.test.ts`; when you move a film
  file, fix `docs/CODEMAP.md` and `docs/RECIPES.md` in the same change.
