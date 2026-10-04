---
name: econ-film
description: Build, edit, re-render and verify the Econ Studio product films, v2 (scripts/film2, current: 2D motion design to stock music, about 108 s) and v1 (scripts/film, 3D, kept, 94 s), and make new cuts from their engines. Use for any request touching the product film, demo video, showcase or promo video — changing its on-screen text or Chinese copy, re-capturing footage after a UI or feature change, adding or replacing a scene, retiming cuts or cues, swapping or re-scoring the music, rendering previews, stills or the final mp4, checking it with film2:doctor or film:doctor — and for making a new film (a 30 s feature spotlight, a 9:16 social cut) or orchestrating several agents on film work.
---

# The Econ Studio product films

**Two films.** **v2** (`scripts/film2/`, current, 2D) is the one to change by default.
**v1** (`scripts/film/`, 3D Three.js, synthesised score) is kept and renderable; v2 reuses
its capture CLI, Chrome helper and clip store format. Everything below the v2 sections
describes v1 and applies only when the request names v1.

## Film v2 (scripts/film2, current)

~108 s, 1920×1080, 60 fps, 2D DOM/SVG stage (no GPU), real-app footage as clean cards,
cut to the stock track "Dreaming Big" (Mixkit) on a verified beat grid. Output:
`demo-media/film-v2/econ-studio-film.mp4` in the main checkout (gitignored). The bible is
`scripts/film2/FILM.md` (read the section you touch); the contracts, review method and
pitfalls are [reference/v2.md](reference/v2.md); licences are in `scripts/film2/README.md`.

| Path (under `scripts/film2/`) | Owns |
|---|---|
| `timeline.mjs` | Grid helpers `pulse/beat/bar(n)`, `SCENES` (acts by bar; `in`, `cuts`, `ui`, `holds`, `alive`), `CUES`, `COPY`, `AXIS_CHAPTER`. Pure data |
| `music.mjs`, `beatgrid.<slug>.json` | The one entry that picks the track; its verified grid (versioned copy) |
| `assets.mjs` | Registry: id → clip/image in the v2 store, capture command, scenes allowed |
| `capture/` | `clips.mjs` (jobs), `content.mjs` + `seed*.mjs` (seed documents), `sheets.mjs`, `manifest.mjs` → `MANIFEST.md` |
| `stage/engine.js`, `stage/lib/`, `stage/scenes/<act>.js` | Renderer, shared library, one module per act |
| `audio/` | `sfx.mjs` (events → sfx.wav), `mix.mjs` (master −16 LUFS), `verify.mjs`, `sfxmap.mjs` |
| `render.mjs`, `paths.mjs` | Frames → mp4; outputs to `$FILM_OUT` or `<main>/demo-media/film-v2/`, store `…/film-v2/assets` |
| `tools/` | `doctor`, `motion-check`, `seam`, `contact`, `lab`, `beatgrid`, `serve` |

### v2 golden commands (repo root; agents wrap in `.claude/skills/econ-film/bin/timeout 100`)

```sh
npm run film2:doctor                          # health check; run after EVERY change (--skip-stage = no Chrome)
npm run film2:stills -- --scene=draw          # 960×540 stills, 1 per second
node scripts/film2/render.mjs --final --at=19.4,70.9 --workers=4      # exact 1080p frames → $FILM_OUT/stills/
node scripts/film2/render.mjs --final --from=34 --to=36 --workers=4   # ≤ 6 s of real video
npm run film2:audio                           # sfx + mix + verify (after cue/cut/copy-free timing changes)
npm run film2                                 # the final mp4 (long: run in the background)
# re-capture one clip into the v2 store, then regenerate the manifest
FILM_STORE="$PWD/demo-media/film-v2/assets" FILM_OUT="$PWD/demo-media/film-v2" \
  npm run film:capture -- --clips=scripts/film2/capture/clips.mjs --only=<clip> --no-build
FILM_STORE="$PWD/demo-media/film-v2/assets" node scripts/film2/capture/manifest.mjs
node scripts/film2/tools/lab.mjs --at=0.5,2,3.5          # try lib pieces on real clips (scenes/_lab.js)
node scripts/film2/tools/motion-check.mjs <mp4> --from=<s>   # stalls / jumps / flashes / weak cuts
node scripts/film2/tools/seam.mjs <mp4> --scene=<id>     # frames either side of each cut
node scripts/film2/tools/contact.mjs <mp4|dir> --cell=320   # contact sheet, cells ≤ 480 px
```

Scripts take `--help` and reject unknown flags. Use `FILM_OUT=<scratch>` for every
exploratory render. Never re-capture without `--only`.

### What kind of change is it? (v2)

- **Words** → edit `COPY` in `timeline.mjs` only. No line ends in `, . ， 。` (doctor reads
  the wrapped lines). **The user signs off copy**: never change it unprompted. Then
  `film2:doctor` and stills at the moment it is fully shown.
- **The app's UI changed** → re-capture the affected clip jobs into the v2 store, run the
  manifest, then retime the act: the clip's event times move, so fix the scene's `placeClip`
  and the act's `cuts`/`ui` in `timeline.mjs`; stills of every cut.
- **Retime** → `ACTS` bars, or a scene's pulse table; then update that act's `cuts`, `ui`,
  `holds`, `alive` declarations, cue times, run `film2:audio`; `motion-check` must report 0.
- **New feature scene** → bible row (§3) first, then capture job in `clips.mjs`, `assets.mjs`
  entry, scene module built from the lib presets and `camera.shots`, cues, declarations.
- **Swap the music** → `music.mjs` + a verified `beatgrid.<slug>.json` (`tools/beatgrid.mjs`),
  then re-bar every act (`SCENES`), cues and declarations; doctor checks cuts sit on the grid.
- **9:16 or a 30 s spotlight** → not built in v2 (no portrait format); see reference/v2.md.

### v2 rules that are never negotiable

1. **No fake UI**: product pixels from the real app or its real export; illustrations are
   plainly illustration; no third-party logo; no "AI"/Gemini on screen around Check terms.
2. **Re-ink lifts carry the app's real values** (7 marks, the coverage numbers, the term).
3. **`update(t)` is pure**: no clocks, no `Math.random`, no state; seek order never matters.
4. **Type and layout from presets only** (`HEADLINE`, `STATEMENT`, `LABEL`, `DISPLAY`, `C1`…`C3`);
   never a literal size. Every cut changes shot size. No word is cut by a frame or card edge.
5. **Print is legible**: a printed page ≥ 1190 px wide or on screen ≤ 1 s. Headlines fully
   visible ≥ 2 s and present whenever footage is on screen.
6. **One owner per shared file** (`timeline.mjs`, `engine.js`, `lib/`, `audio/`, `assets.mjs`);
   scene agents own only their own `scenes/<act>*`.
7. Outputs to `demo-media/film-v2`, scratch via `FILM_OUT`. The v2 store
   `demo-media/film-v2/assets` is never v1's store; v2 never writes v1's.
8. `src/` is never edited for the film; branch `feature/film-v2*`; never push, never commit
   to `main`/`develop`.

Verify a v2 change: `film2:doctor` exit 0; stills at every touched moment as a downscaled
grid; `motion-check` and `seam` on a short `--final` range; `film2:audio` when timing moved;
`npm test`.

---

# Film v1 (scripts/film, 3D)

A 94 s, 1920×1080, 60 fps film generated entirely by code in `scripts/film/`: the real app
captured frame-perfect in virtual time (Playwright), composed in 3D (Three.js stage,
rendered by parallel Chrome workers), cut to a synthesised score (Python). Deliverable:
`demo-media/film/econ-worksheet-film.mp4` in the main checkout (gitignored).

`scripts/film/FILM.md` is the bible (storyboard, look, motion, contracts). This skill is
how to *change* the film safely; read the bible section you touch.

## The map

| Path (under `scripts/film/`) | Owns |
|---|---|
| `timeline.mjs` | Tempo, `SCENES` (bars, world, transition), `SECTIONS`, `CUES` (stable ids), `CHORDS`, `COPY` (every on-screen string). Pure data, browser-safe |
| `assets.mjs` | The asset registry: id → file in the store, capture command, scenes allowed to load it |
| `capture/` | Real app → clips (60 fps JPEG + events JSON), stills, sheets, diagram layers, .docx render. `capture.mjs` + `extra-<scene>.mjs` |
| `stage/engine.js`, `stage/lib/`, `stage/scenes/<id>.js` | The renderer: `window.film.seek(t)`, shared library, one module per scene (+ `scenes/<id>/` helpers) |
| `score/` | Music + SFX + master, from the timeline and `build/events.json` |
| `render.mjs`, `film.mjs` | Frames → video; the whole pipeline (capture → score → render → master) |
| `tools/doctor.mjs` | `film:doctor`: timeline, assets, clip windows, score freshness, text fit, capture age, GPU |
| `paths.mjs` | Outputs go to `$FILM_OUT` or `<main checkout>/demo-media/film/`; the asset store is the main checkout's `demo-media/film/assets/` unless `$FILM_STORE` names another (film v2: `demo-media/film-v2/assets`) |

## Golden commands (repo root)

```sh
npm --prefix scripts/film ci                  # once per checkout (three.js); worktrees also symlink root node_modules
npm run film:doctor                           # ~40 s health check; run after EVERY change (exit 1 = broken)
npm run film:stills -- --scene=word           # 960×540 PNG per second of one scene → build/stills/
node scripts/film/render.mjs --final --at=19.4,70.9 --workers=4   # exact 1080p frames → build/stills/final-film/
node scripts/film/render.mjs --final --from=34 --to=36 --workers=4  # ≤2 bars of real video
npm run film:capture -- --only=type-mcq       # re-capture one clip/asset job (--list shows them)
# film v2: FILM_STORE=…/film-v2/assets FILM_OUT=…/film-v2 npm run film:capture -- --clips=scripts/film2/capture/clips.mjs --only=<clip>
npm run film:score                            # music + sfx + master (~40 s); needed after cue/timeline changes
npm run film                                  # everything, final; long (capture ~9 min if missing, render ~4 min + encode)
npm run film:9x16                             # the 9:16 cut: render + mux the existing score (outputs *-9x16)
node scripts/film/render.mjs --format=portrait --final --at=19.4 --workers=3   # portrait 1080×1920 stills
```

The entry scripts (`render.mjs`, `film.mjs`, `capture/capture.mjs`, `capture/extra-marks.mjs`,
`tools/doctor.mjs`, `score/score.mjs`) take `--help` and reject unknown flags (exit 2); a
helper without a parser ignores them and just runs, so read the usage comment at the top of
any other script before running it — a capture script writes the shared store at once.
Set `FILM_OUT=<scratch dir>`
for any exploratory render so the shipped outputs are never overwritten. In an agent,
cap foreground commands: `.claude/skills/econ-film/bin/timeout 100 <cmd>` (macOS has no
`timeout`), and run anything longer (full renders, `npm run film`, capture) in the background.

## What kind of change is it?

Recipes for each: [reference/recipes.md](reference/recipes.md).

- **Words on screen** (a headline, a fact, Chinese, the window title) → edit `COPY` in
  `timeline.mjs` only. `"\n"` forces a break, arrays are separate blocks. Doctor's text
  check tells you if it overflows its box; if it wraps where the layout has room, raise the
  scene's `maxLines`, never rewrite the copy in the scene. Then fix everything that quotes
  it (`grep -rn` the old string in `scripts/film/`: cue `note:`s, FILM.md, scene header
  comments). Stills at the moment it is fully revealed. `COPY` is not in the score's hash:
  a text-only change never needs `film:score`. → R1
- **The app's UI changed** (doctor warns "assets predate the last src/ change") → find the
  assets that show it (`assets.mjs`, `capture --list`), re-capture those jobs, then check
  every scene that registers them — clip event times and page geometry may have moved. → R2
- **A clip is too long/short, or a moment should land elsewhere** → change the scene's
  `placeClip` / `T` map; doctor's clip-window check catches reads past a clip's end. → R2, R4
- **Timing of a cut, beat or accent** → move the cue in `CUES` (by id; scenes follow via
  `cueAt`), or bars in `SCENES`; then `npm run film:score`. → R4
- **A new feature to show / a scene replaced** → bible first (storyboard row, handoffs to
  both neighbours), then capture job → registry entry → scene module → cues → score.
  Inserting bars shifts every later cue, chord and hard-coded second: R3's insertion
  checklist. → R3
- **The 9:16 Reels cut** → a format of the same timeline (`--format=portrait`,
  `FILM-9x16.md`); scenes branch with `ctx.pick`. → R6
- **A new film** (spotlight, another language) → the engine is single-timeline; read R6
  before starting. → R6
- **Several agents** → [reference/orchestration.md](reference/orchestration.md) first.

## Rules that are never negotiable

1. **No fake UI.** Product pixels come from the real app, the real export, or generic
   chrome we draw. Only claim what the app really does (bible §2), and show each claim
   happening on screen. Never a third-party logo.
2. **`update(t)` is a pure function of t.** No clocks, no `Math.random`, no state between
   calls; every parameter continuous in t. Seeking out of order gives identical pixels.
3. **Scenes load assets by registry id only**, declare every clip use with `placeClip`,
   and read copy from `COPY` and times from cue ids. Scenes own only their own files;
   `timeline.mjs`, `engine.js`, `lib/`, `score/` have one owner at a time.
4. **Never crossfade two different UI states** and never dissolve two frames that already
   match — cut, or hide the change behind a move or occlusion on a beat.
5. **Never overwrite the shipped outputs or the asset store by accident**: `FILM_OUT` for
   scratch renders; re-capture only the jobs you mean to.
6. `src/` is never changed for the film. Work on a `feature/film-*` branch; never push,
   never commit to `main`/`develop`.

Deeper: [contracts](reference/contracts.md) (every interface) · [craft](reference/craft.md)
(the look and motion the critics enforce) · [pitfalls](reference/pitfalls.md).

## Verify before you call it done

- [ ] `npm run film:doctor` exits 0; any warning is explained (a stale score after a cue
      change is expected until `npm run film:score`).
- [ ] Stills of every moment you touched, at 1080p (`--final --at=…`), looked at as a
      downscaled grid (cells ≤ 480 px; `bin/sgrid.sh`), never a folder of full frames.
- [ ] Untouched parts are pixel-identical: render the same times before/after (or against a
      saved 1 fps baseline) and diff with `bin/regdiff.py` — mean 0.0000 is the bar for a
      refactor; a changed scene explains every frame above noise.
- [ ] Seams you touched: frames either side of each cut (`bin/seam.py`), and
      `tools/motion-check.mjs` on a short `--final` range (0 stalls/jumps outside cuts).
- [ ] Cues moved or events changed → `npm run film:score`; the score report passes.
- [ ] `npm test` green, `npm run lint` no new problems (baseline 44).
- [ ] A final full render (background) before delivery; watch it once end to end.

## Helpers (`.claude/skills/econ-film/bin/`)

| Script | Does |
|---|---|
| `timeout SECS cmd…` | Kills the whole process group after SECS (perl; macOS has no `timeout`) |
| `regress.sh DEST FROM_BAR TO_BAR` | 1 fps `--final` stills in 2-bar chunks into DEST (baseline or candidate) |
| `regdiff.py A B [thr]` | Per-frame mean abs diff of same-named PNGs; lists frames over thr |
| `sgrid.sh DIR OUT.jpg COLSxROWS [w]` | Tiles a stills folder into one small JPEG to look at |
| `grid.sh VIDEO OUT.jpg START DUR EVERY_N COLSxROWS [w]` | The same from a video range |
| `seam.py DIR [grid.png]` | Frame-to-frame diff and luma: pops and dead stops at a seam |

Take a baseline **before** you change anything: `bin/regress.sh <scratch>/base 0 47`
(24 two-bar chunks, each well under 100 s; run it in the background).
