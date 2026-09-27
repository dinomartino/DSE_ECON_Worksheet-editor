# The 9:16 Reels cut — bible addendum

The same film (timeline, cues, copy, score, 94 s, 60 fps) recomposed for a phone held upright:
1080×1920, for Instagram Reels (also fine for Shorts/TikTok). Everything in `FILM.md` still
holds — story, look, motion rules, truth rules, the craft the critics enforced. This page only
says what changes when the frame is tall.

## Format, not a new film
- One timeline. The format is a render option: `render.mjs --format=portrait` (final 1080×1920
  60 fps; `--preview` 540×960 30 fps), `stage/index.html?format=portrait`. Default stays
  landscape and must stay **pixel-identical** (the 94-frame 1 fps baseline).
- Scenes read `ctx.format` (`'landscape' | 'portrait'`), `ctx.W`/`ctx.H` (design px: 1920×1080
  or 1080×1920) and pick a layout per format. Landscape code paths are not edited except to
  route through a layout table.
- Output: `demo-media/film/econ-worksheet-film-9x16.mp4` (+ `poster-9x16.jpg`,
  `contact-sheet-9x16.jpg`), same audio (`audio/score.wav`) muxed unchanged.

## The Reels frame (design px, 1080×1920)
- **Reels UI covers**: the top ~220 px (header), the bottom ~420 px (caption, audio row) and a
  ~130 px column on the right (like/comment/share) from y≈900 down. Nothing that must be
  read goes there; backgrounds and motion may.
- **Text safe area**: x 90–950, y 240–1480. Headlines live in the upper block (y 260–700);
  the product sits in the middle (y 620–1480); the bottom 440 px is atmosphere only
  (floor, shadow, dust, the continuation of a sheet).
- **Type**: headline 92–104 px (SF Pro Display 600, −0.035em), at most 3 lines, left-aligned
  at x=90 or centred; zh line 40–44 px under it; sub 34–36 px; facts/lists 64–76 px. Same
  reveal/exit motion. Everything via `COPY` + the fit API (`maxWidth` ≤ 860).
- **Product**: phones are small — UI must be *bigger* than in 16:9. Prefer the page: A4
  is portrait, so sheets and the page area of clips can fill 80–95% of the width. App
  windows are 16:10: never show a whole window small; crop to the page or the panel that
  matters (`lib.win` with a screen crop, or a clip frame region on a plane), push in.
  Any UI text that must be read ≥ 16 px tall on the 1080-wide frame.
- **Camera**: vertical language — pedestal/tilt moves, push-ins, orbits of a few degrees;
  depth stacks read as layers above/below each other rather than side by side.
- **3D objects** (logo tile, papers fan, exploded diagram layers, glass chips, platform
  windows) re-staged to fill a tall frame: stack vertically, fan upward, cascade down.

## Handoffs (portrait), design px
- **48.0 diagrams → marks (cut):** `diagram-question-start` sheet flat, facing camera, day
  world, horizontally centred, sheet width 960 px, the diagram region's centre at y = 900,
  slow continuing drift (camera still moving through the cut).
- **64.0 papers → word (cut):** one sheet (`question-done`) alone, centred at x = 540,
  y = 880, width 600 px, tipped back ~14°, in the same dark warm room as landscape
  (`ROOM0`/`DIM` values), nothing else in motion but drift.
- Other boundaries are hard cuts on the beat: each side just needs a strong, settled frame.

## Per-scene intent
- **opening**: the mark builds centred at y≈820, words under it at y≈1250; the tile + title
  stack (tile y≈760, title y≈1180, sub under); the push into the dot unchanged in spirit.
- **write**: the page of the typing clip fills the width (crop the clip to the page), headline
  above; bilingual layers stack/separate in depth on the page; EN/中文/Both words above.
- **diagrams**: strokes build centred; the canvas clip cropped to the drawing card, big;
  headline above; exploded layers stack vertically/fan in depth; diagram flies down onto the
  page (handoff above).
- **marks**: page (live clip cropped to the page + the inspector's marks rows shown as a
  second crop *below or above* it, never two different states blended); teacher copy slides
  out from behind vertically.
- **papers**: the fan opens upward like a hand of cards or cascades down; covers legible.
- **word**: sheet alone in the dark; the document window cropped tall to the page with the
  style tags; facts below the page (y≈1320–1480) or above.
- **everywhere**: export chips stacked in two/three rows above the dialog crop; the three
  platform windows cascade vertically (browser top, Mac middle, Windows bottom) with the
  lines above.
- **montage**: each shot re-framed to a tall crop of one clear subject.
- **end**: tile, title, tagline, zh, small line stacked centrally within the text safe area.
