# Econ Worksheet — product film

A ~94 s, 60 fps Apple-style product film, generated entirely by code: the real app
captured frame-perfect, composed in 3D with Three.js, cut to an original synthesised
score. The design doc is [`FILM.md`](./FILM.md); read it before changing anything here.

## Layout

| Path | What |
|---|---|
| `timeline.mjs` | Tempo, scene windows, music sections, cues, chords, on-screen copy. Browser-safe, no imports. |
| `timeline-json.mjs` | Prints the timeline as JSON (for the Python score). |
| `paths.mjs` | Output locations; the asset store is shared by all worktrees. |
| `capture/` | Playwright drives the built app in virtual time → clips, stills, sheets. |
| `stage/` | The Three.js composition renderer: engine, `lib/`, `scenes/<id>.js`. |
| `score/` | Python score and sound design (`.venv` created on demand). |
| `render.mjs` | Renders frames with parallel Chrome workers → ffmpeg segments. |
| `film.mjs` | The whole pipeline: capture → score → render → master. |
| `tools/doctor.mjs` | `film:doctor`: timeline, assets, clip windows, score, text fit, capture age, GPU. |

Some of these are added by later work; `FILM.md` is the spec for each.

## Run

```sh
npm --prefix scripts/film ci        # the film's own deps (three)
npm run film:doctor                 # health check (~40 s); run it after any change
npm run film                        # full 1920×1080 60 fps film
npm run film:preview                # quick 960×540 30 fps cut
npm run film:stills -- --scene=word # preview PNGs, one per second, of one scene
npm run film:render -- --scene=word # one scene as video (--final for 1080p60)
npm run film:score                  # rebuild the score after timeline or event changes
npm run film:capture -- --only=type-mcq  # recapture from the app (--list)
node scripts/film/timeline-json.mjs # inspect the timeline
```

Every command takes `--help`; an unknown flag is an error.

Everything is written to `demo-media/film/` in the main checkout (gitignored):
`assets/`, `audio/`, `build/`, and `econ-worksheet-film.mp4`.
