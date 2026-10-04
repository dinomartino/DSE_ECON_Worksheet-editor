# Film v2

A 2D motion-design showcase for Econ Studio 經濟備課室: DOM/SVG stage, real-app footage as
clean cards, cut to the stock track "Dreaming Big" on a verified beat grid. About 108 s,
1920×1080, 60 fps. The bible is [FILM.md](./FILM.md); how to change it safely is the project
skill `.claude/skills/econ-film/` (`SKILL.md`, `reference/v2.md`). Film v1 is `scripts/film/`.

## Render

```sh
npm --prefix scripts/film ci        # once; worktrees also symlink the root node_modules
npm run film2:doctor                # health check
npm run film2:audio                 # sfx + master mix (-16 LUFS)
npm run film2                       # the final mp4 (long)
npm run film2:stills -- --scene=draw
node scripts/film2/render.mjs --final --from=34 --to=36 --workers=4
```

Outputs go to `demo-media/film-v2/` in the main checkout (gitignored): the film
`econ-studio-film.mp4`, `build/`, `audio/`, `stills/`. Set `FILM_OUT=<dir>` to move them for
scratch renders. Footage and stock audio are read from `demo-media/film-v2/assets` and
`demo-media/film-v2/audio-stock`. Re-capture footage as described in `capture/MANIFEST.md`.

## Licences

- **Music**: "Dreaming Big" by Ahjay Stelino, Mixkit Stock Music Free License. Commercial use in
  web, YouTube and social video, no attribution required; not for broadcast TV or radio, games or
  physical media; the files may not be resold as-is.
- **Sound effects**: Mixkit Sound Effects Free License, same terms, no attribution required. Every
  asset is listed in `demo-media/film-v2/audio-stock/SOURCES.md`.
- **Fonts**: Newsreader and Inter, SIL Open Font License 1.1 (`stage/fonts/OFL-Newsreader.txt`,
  `stage/fonts/OFL-Inter.txt`).
- The film shows features that are unreleased until v0.6.0: do not publish it before then.
