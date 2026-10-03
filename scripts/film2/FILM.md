# Econ Studio — product film v2 bible

Status: APPROVED 2026-10-04 (story + track). Lives at
`scripts/film2/FILM.md` once committed. Where code must disagree, the code wins and this
file is fixed in the same change.

## 1. What we are making

A ~110 s (never over 2:00) 2D motion-design showcase film for **Econ Studio 經濟備課室**,
the HKDSE Economics teacher app in this repo. A calm, premium, cinematic piece: flat vector
graphics in the app's own "warm studio" language, intercut with real app footage presented
as clean 2D cards, every cut on the music. It replaces film v1 (`scripts/film/`, 3D, 94 s),
which stays untouched and renderable.

The user's brief (2026-10-04): more features, including the new ones; professional and
cinematic; **2D motion design, easy to render**; stock music and SFX allowed; take the
look from the app's launch animation "Draw the market". **Rejected in v1, never bring
back:** the 3D app-icon opening, and the gloss/"shine" sweep over the worksheet. No 3D,
no bloom, no lens flares, no light sweeps, no glass.

Deliverable: `demo-media/film-v2/econ-studio-film.mp4`, 1920×1080, 60 fps CFR, H.264
High yuv420p BT.709, AAC 256k 48 kHz, `+faststart`; poster, contact sheet. A 9:16 cut is a
later, optional format.

## 2. Product truths (only claim what is true)

Source: the feature inventory (2026-10-04). Everything after v0.5.0 is on `develop`,
unreleased: **the film must not be published before v0.6.0 ships.**

- Name **Econ Studio**, 中文 **經濟備課室**. Tagline: "Worksheets and papers for HKDSE
  Economics teachers" (the app says "…and notes"; notes are NOT built, so leave it out).
- Runs in the browser and as a desktop app for macOS and Windows; no account, no server;
  documents stay on the teacher's computer. Free today (no paid tier); never "always free".
- The page you see is the page you edit (double-click and type).
- Bilingual paper: English, Traditional Chinese (HK usage), or both. Interface in English
  or 中文 (new).
- Diagram canvas: draw from blank axes, shift a copy, one-click shading of welfare areas,
  templates by topic. **Draw the model answer on the question's own diagram**: students
  see blank axes, the teacher copy shows the answer in red (new). Edit | Preview (new).
  Graphs 圖表庫 library (new). Diagrams export as one picture: never claim "editable in Word".
- Marks add themselves up; numbering is automatic. Student / Teacher versions; red answers.
- **Marking scheme view** beside Student and Teacher (new), with layouts Classic,
  HKEAA style, Suggested answers, Detailed table (new). Always "HKEAA-style", never
  official, never an HKEAA logo or past-paper item.
- Mock papers: Paper 1 MC booklet with cover, Paper 2 question-answer booklet, LQ
  worksheets with dotted answer space, MC versions A–D with per-version keys.
- **題庫 question bank** (new): every question from every worksheet, by topic, coverage
  bar; drag a question from the editor's 題庫 tab onto the page, which re-flows before you
  let go; one Undo.
- **Check terms**: compares Chinese with the EDB glossary on the computer, no AI key.
  (AI translation exists but needs the teacher's own key: not shown.)
- Export: a real Word `.docx` (live numbering, real styles), PDF, Copy for Word, answer
  key, Suggested answers handout, Kahoot, Blooket, ZipGrade, key CSV. Show the real
  exported file rendered (LibreOffice render of `npm run samples` output); say "a real
  Word document", never "tested in Word".

Never a third-party logo (Microsoft, Apple, Google, Kahoot…). Naming a format in text is
fine. **No fake UI**: product pixels come from the real app or its real export. Motion
graphics may *illustrate* (abstract pages, lines, the mark), clearly as illustration.

## 3. Story and storyboard

Spine: **"Everything an Economics teacher prepares, drawn in one studio."** The film is
drawn like an economics diagram: lines draw themselves, the blue equilibrium dot is the
through-line that carries us from scene to scene.

Music (approved): **"Dreaming Big", Ahjay Stelino, Mixkit**, muxed from the normalised
master `demo-media/film-v2/audio/music/mixkit-31.norm.wav` (−16 LUFS), 110.4 s, audible to
107.65. Verified grid `audio/grid/mixkit-31.grid.json`: 135 BPM eighths (pulse 0.4445 s,
the unit for cuts and accents), quarter 0.889 s, bar 3.556 s, first downbeat 1.795 s.
Piano + strings. Sections: intro 0–12.46, build 12.46–30.25, body 30.25–72.92, full lift
72.92–94.26, pull-back 94.26–104.93, tail. Times in the table are approximate; `SCENES`
in `timeline.mjs` holds the real bar lines (`music.mjs` is the one line that picks the
track).

| # | Act | ≈ time | Music | Picture (2D) | Copy en / zh (no line-end punctuation) |
|---|---|---|---|---|---|
| 0 | Cold open | 0.0–6.5 | piano alone | An abstract page (illustration, no logos). A cursor tries to draw a supply curve with generic line tools: the line snaps crooked, a text box jumps, the page reflows. The crooked line straightens on a beat and slides into place as the vertical axis of… | "A supply curve in Word" / "在 Word 畫一條供應曲線" → "should not take all evening" / "不應花上一整晚" |
| 1 | The mark | 6.5–12.6 | intro swell | "Draw the market" at hero scale, faithful to `src/launch/` (axes, demand, supply, knock, dot, ripple; same easings, slower ×3). Wordmark lands at the build entrance (12.6). | "Econ Studio" / "經濟備課室", then "Worksheets and papers for HKDSE Economics teachers" / "為 HKDSE 經濟科老師而設" |
| 2 | Write | 12.6–30.8 | build | The dot drops onto the welcome desk: the four paper kinds (PaperSketch style) slide in as flat cards → one opens → real footage: double-click the page and type an MC question → EN → 中文 → EN+中 → the interface flips to 中文. | "Type right on the page" / "直接在頁面上輸入"; "English, 中文, or both" / "英文、中文，或兩者並列"; "An interface in 中文 too" / "介面也有中文版" |
| 3 | Draw (hero) | 30.8–52 | body | Footage, from scratch: blank axes → drag demand, supply → shift a copy → Shade ▾ welfare area. Motion graphics pull the diagram's lines out of the window and re-ink them at scale between shots. Template grid flashes on a beat. **The answer layer**: Student shows blank axes; Teacher snaps the red answer curve onto the same diagram. | "Draw it in seconds" / "幾秒畫好一幅圖"; "Shade any area in one click" / "一按塗上任何面積"; "The answer, on the same axes" / "答案直接畫在同一幅圖上" |
| 4 | Mark and papers | 52–73 | body, rising | Marks roll up into the total; Student → Teacher, answers in red; the Marking scheme view; its four layouts cut on four beats (Classic, HKEAA style, Suggested answers, Detailed table); covers of Paper 1 and Paper 2 deal in flat, one per beat; versions A B C D. | "Marks add themselves up" / "分數自動加總"; "A marking scheme, HKEAA-style" / "評卷參考，HKEAA 格式"; "Mock papers, cover to key" / "模擬試卷，由封面到答案" |
| 5 | Bank (climax) | 73–92 | **full lift** | The lift hits as the 題庫 opens: topic cards fill, coverage bars draw on. Open a topic → in the editor, drag a question from the 題庫 tab onto the page; the page makes room and renumbers. Check terms: dotted underlines draw under Chinese terms, one replace. | "Every question you have written, by topic" / "你寫過的每一題，按課題排好"; "Drag one in, the page makes room" / "拖進頁面，自動排好"; "Chinese checked against the EDB glossary" / "中文用詞，按教育局詞彙表檢查" |
| 6 | Everywhere | 92–99.6 | lift, end | Fast beat cuts: Export → the real `.docx` page → format chips (PDF, Answer key, Kahoot, Blooket, ZipGrade) → three flat windows: browser, Mac, Windows (generic chrome). | "A real Word document" / "真正的 Word 文件"; "On the web, Mac and Windows" / "網頁版、Mac、Windows 都用得" |
| 7 | End | 99.6–110.4 | pull-back, tail | Everything collapses back into lines → the lines re-form the mark (small) → end card. Hold to silence. | "Less formatting" / "少排版" · "More teaching" / "多教學"; "Free · No account needed" / "免費使用 · 無需註冊"; "Econ Studio 經濟備課室" |

The copy above is a draft; the user signs it off. `COPY` in `timeline.mjs` is the only
place it lives. Line breaks are deliberate; a line never ends in `, . ， 。`
(user rule, 2026-10-04). Doctor enforces it.

## 4. Look

**Warm studio, flat.** Values from the app (`src/app/globals.css`, `src/launch/`):

| Token | Hex | Use |
|---|---|---|
| desk | #D2CDC2 | deep backgrounds, the mark lockup ground |
| cream | #F1ECE3 | main ground |
| panel | #FDFBF7 | cards, window bodies |
| paper | #FFFFFF | sheets, with the app's `.paper-shadow` |
| ink | #2A2620 | headlines |
| ink-muted | #5A544D | subheads, zh lines |
| ink-subtle | #7F7973 | captions |
| line | #D8D4CB / #BBB7AE | hairlines, axes |
| mark tile / mark cream | #3A342E / #FCFAF6 | the mark; dark "night" grounds |
| accent | #1E7FD4 (mark) · #0076CC (UI) | the dot; ≤ 5 % of any frame |
| accent-soft | #CDE9FF | highlight fills |
| answer red | #DC2626 | teacher answers only |
| sketch greys | #948D80 #DCD7CD #C9C3B7 | illustrated pages (PaperSketch) |

- **Type**: Newsreader 400 (self-hosted woff2, OFL) for headlines, tracking −0.01em;
  Inter or SF for labels; PingFang HK for Chinese (local) or Noto Sans/Serif HK
  self-hosted. Scale at 1080p: hero 140, headline 96, subhead 40, eyebrow 22 caps +0.08em,
  caption 26. Chinese sits under English at ~0.5× size, ink-muted. Safe area 96 px sides,
  72 px top/bottom.
- **Footage** sits in a flat window card: radius 16, 1 px line border, the paper shadow,
  optional generic title bar. No tilt, no perspective, no reflection.
- **Graphic grammar**: strokes draw on (dash offset); the dot is the motif and the
  transition device (it travels, grows into an iris, or lands as a click); axes and
  hairlines divide the frame; illustrated pages use PaperSketch's flat bars.
- Grain-free. Gradients only as the faintest vignette, if at all.

## 5. Motion

- Curves from the app: ease-out-soft `cubic-bezier(.22,1,.36,1)` for entrances,
  in-out-soft `(.65,0,.35,1)` for travel, spring `(.34,1.36,.64,1)` for pops; the splash's
  ease-out cubic and easeOutBack c1 = 1.9 for the mark. Screen durations ×3–4 of the UI's:
  entrances 500–800 ms, travel 700–1000 ms, stagger 60–90 ms.
- Every cut and every major accent lands on a beat of the verified grid; act changes on a
  downbeat (bar line). Big moves on the music's section changes (12.6, 30.8, 73.0, 99.6).
- Cuts or motivated moves only. **Never crossfade two different UI states**; never dissolve
  two frames that already match. Camera moves on footage are 2D (scale + translate), with
  a focus mask (dim the rest, rounded spotlight) and callout lines that draw on.
- `update(t)` is a pure function of t. No clocks, no randomness, no state between calls.
- 60 fps, no motion blur needed; nothing may stall or jump outside a cut.

## 6. Sound

- Music: the stock track, edited only at bar lines; loudness-normalised; the ending made to
  resolve (cut on a downbeat into the tail, or a soft impact + reverb tail).
- SFX from `demo-media/film-v2/audio-stock/sfx/` (Mixkit Free License): soft clicks on real
  clicks in footage, typing under typing, pencil under line-draws, paper under page moves,
  whoosh under travels, a pop on the dot, one soft impact on the title, a chime on the end
  card. Sparse: music first. Mixed under the music, master −16 LUFS, ≤ −1 dBTP.
- `demo-media/film-v2/audio-stock/SOURCES.md` records every asset's license.

## 7. Architecture (`scripts/film2/`)

A sibling of `scripts/film/`, reusing its capture and tools by import; v1 keeps working.

- `timeline.mjs` (browser-safe data): the music file, its verified beat grid
  (`BEATS`, `BARS` in seconds), `beat(n)`/`bar(n)`, `SCENES` (id, from, to, in-transition),
  `CUES` (id, t, kind: sfx/accent), `COPY` (every string, en + zh), `DURATION`.
- `stage/` 2D engine: `index.html` + `engine.js` exposing `window.film =
  {ready, fps, duration, frames, size, seek(t), events(), text(), placements(), errors()}`;
  a 1920×1080 design-space DOM/SVG root; scenes `stage/scenes/<id>.js` =
  `{setup(ctx), update(ctx, t), events?}`; `lib/` = ease, tween/keyframes helpers, stroke
  draw, type (fit + reveal), window card, focus mask, callout, dot/iris transitions, clip
  player (JPEG frames → `<img>`/canvas with LRU, awaits decode before the screenshot),
  PaperSketch-style page illustrations, the mark (exact `src/launch/` geometry).
- `render.mjs`: v1's worker loop (serve, Chrome, seek, CDP screenshot, lossless segments,
  concat, encode) without the GPU gate or score hash; `--from/--to` in seconds; `--at`
  stills; mux music + sfx mix.
- `audio/`: music edit + loudness, SFX placement from `events()` into `sfx.wav`, mix.
- `tools/doctor.mjs`: timeline tiles 0..DURATION, cuts on beats, assets present, clip
  windows inside clips, text fit + title-safe, **no line-end punctuation in COPY**, audio
  present and long enough, capture age vs `src/`.
- Asset store: `demo-media/film-v2/assets/` (its own; never writes v1's store). Capture
  reuses `scripts/film/capture/` with a store override.
- `npm run film2`, `film2:doctor`, `film2:stills`, `film2:capture`.

## 8. Rules

`src/` is never changed for the film. Work on `feature/film-v2*` branches cut from
`feature/film-v2`; never push; never commit to `main`/`develop`. Scratch renders go to
`FILM_OUT`. Every agent command finishes < 100 s; a tool call at least every 60 s;
commit after every step.
