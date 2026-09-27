# Econ Worksheet — product film

A ~94 s, 60 fps Apple-style product film, generated entirely by code: the real app
captured frame-perfect, composed in 3D with Three.js, cut to an original synthesised
score.

- **How to change it** (text, re-capture, scenes, timing, score, a new cut, several
  agents): the `econ-film` skill, [`.claude/skills/econ-film/SKILL.md`](../../.claude/skills/econ-film/SKILL.md).
- **What it is** (storyboard, look, motion, contracts): [`FILM.md`](./FILM.md).

## Run

```sh
npm --prefix scripts/film ci        # the film's own deps (three)
npm run film:doctor                 # health check (~40 s); run it after any change
npm run film:stills -- --scene=word # preview PNGs, one per second, of one scene
npm run film:render -- --scene=word # one scene as video (--final for 1080p60)
npm run film:capture -- --only=type-mcq  # recapture from the app (--list)
npm run film:score                  # rebuild the score after timeline or event changes
npm run film:preview                # quick 960×540 30 fps cut
npm run film                        # the full 1920×1080 60 fps film
```

Every command takes `--help`; an unknown flag is an error. Outputs go to
`demo-media/film/` in the main checkout (gitignored), or to `$FILM_OUT`; the asset store
(`demo-media/film/assets/`) is always the main checkout's, shared by every worktree.
