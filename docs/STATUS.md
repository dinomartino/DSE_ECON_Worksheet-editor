# Status

**Update this at the end of every session. Keep it under 80 lines; oldest log lines fall
off the bottom.** It is the first thing a fresh session reads — then
[`CODEMAP.md`](./CODEMAP.md).

## Current initiatives

- **Branching: work is on `develop`** (since 2026-09-24); `main` deploys to teachers.
  Collecting features for the release after v0.4.0 — merge to `main` only when the user says.
- **AI translation E2 (2026-09-28, merged on `develop`, not released)** — Translate (fill the
  missing 中文/English, read-only review, one Undo), Check terms (keyless, EDB glossary) and
  app-wide **Settings** (⌘,; the per-document dialog is now **Setup**). Bring-your-own-key:
  Gemini recommended, DeepSeek/Qwen marked available in HK; web key per tab unless
  "Remember", desktop key in the Keychain (`keyring`). Code: `src/translate/`,
  `src/glossary/` (bundled `src/glossary/data/edb-economics-2020.json`, 進口 the one
  rank exception), `src/ai/`, `src/settings/`, `src/components/translate/`,
  `src/components/settings/`; design in SYSTEM_ARCHITECTURE "AI translation, glossary and
  app Settings". Browser check: `node scripts/ai-verify.mjs` (mock provider, 66/66 Chromium
  + WebKit). Seeded Chinese now follows the glossary (new documents only).
  **Before release (user):** a live Save & test + translation with a real key and
  `npm run eval:translate` (prompt e2.2 never run live; model ids in `src/ai/providers.ts`
  unverified); one try from an HK network without VPN (Gemini region error → Use DeepSeek);
  desktop Keychain prompt in a built app (`npm run desktop:build:debug`), incl. Windows.
- **Home navigation (2026-09-28, merged on `develop`)** — start screen: Settings is a gear
  icon bottom-left (`StartScreen.tsx:SettingsButton`); editor toolbar: `[logo] Worksheets ›
  <title>` crumb goes home (word hides <1280px; ⋯ → Worksheets… kept for the film);
  dashboard shows "‹ Back to <title>". Known, pre-existing: toolbar wraps at 1024px with a
  long title (needs ~150px back).
- **Desktop app — shipped 2026-09-22.** Tauri 2 wraps the same static `out/`; documents
  become files under `$APPDATA/worksheets/` (`src/storage/fileStore.ts`), saving uses the
  native dialog, updates come from GitHub Releases. `src/platform/index.ts` ·
  `src/desktop/updater.ts`.
- **Web stays the primary target.** Static export on Vercel, no server runtime. The web
  build must stay green — static `@tauri-apps/*` imports are caught by ESLint,
  `src/test/tauriImports.test.ts` and the `postbuild` bundle check (`scripts/check-web-bundle.mjs`).
- **2026-09-25 batch on `develop`, merged, green:** marking scheme, MCQ rationale, shaded
  areas + shift curve, graph answer space, one Export button, combined answer key,
  dashboard folders, desktop file drop, CHANGELOG + What's new, newer-schema guard,
  desktop Export → PDF file (`src-tauri/src/pdf/`). Features browser-verified alone;
  **no browser pass of the merged whole, nothing run in the desktop shell.**
- **Syllabus-adaptive diagrams (2026-09-25, merged on `develop`)** from
  `docs/Diagram_Requirements/` (A-level group out of scope): anchored points, derived
  curves (MR, parallel, tangent, level, vertical) and spans (`src/model/diagramAnchors.ts`,
  `diagramSpans.ts`, `render/diagramSpan.ts`); 19 welfare presets + grouped Shade menu
  (`src/model/diagramPresets.ts`); 47 templates grouped by topic
  (`diagramTemplatesMarket.ts` · `Macro` · `Trade`, `scripts/template-gallery.mjs`); model
  answer diagram on LQ leaves. Templates retrofitted onto the relations (69 templates,
  `derive.shift` for shifted copies); `docs/Diagram_Requirements/COVERAGE.md`: 145 covered,
  11 partial, 0 uncovered. Demo: `npm run demo:diagrams` → `demo-media/diagrams/` (1:57,
  17 stills). **Next:** teacher-run browser pass; Word check of a retrofitted `.docx`.
- **Motion polish (2026-09-26, merged on `develop`)** — shared tokens in `globals.css`
  (`ease-spring`, `ease-in-out-soft`, `animate-fade-in|pop-in|dialog-in|slide-up-in|
  slide-down-in|scrim-in`, fill-mode `backwards`); eased press/hover across editor, page
  chrome, start screen, diagram editor. Rules: Tailwind 4 `scale-*`/`rotate-*`/`translate-*`
  are their own CSS properties — list them in `transition-[…]`; never transition a
  focus-ring box-shadow or anything pointer-following. Browser-verified per area and merged.
- **Diagram demo film rewritten (merged):** draws a tax diagram from blank axes (~83 s),
  templates get one line — Word drawing is the teacher's pain. `npm run demo:diagrams`.
  Both films now have Apple-style glass-capsule subtitles (SF Pro via system-ui) (`scripts/demo/subtitles.mjs`, 42 chars ×
  2 lines, 15 cps, .vtt/.srt sidecars) and a post-rendered camera (`scripts/demo/camera.mjs`,
  2× capture, eased 1.3–2× push-ins). Needs `sharp` (transitive via next, undeclared) and
  Chrome `--force-device-scale-factor=2`. `demo.gif` no longer fits 4 MB, so it is skipped.
- **Product film (2026-09-27, merged on `develop`)** — a 94 s Apple-style 1080p60 film
  made by code in `scripts/film/`: the real app captured frame-perfect in virtual time,
  a Three.js stage, an original synthesised score. `npm run film` builds it into
  `demo-media/film/`; `npm run film:doctor` checks it. **To change it, use the skill
  `.claude/skills/econ-film/`** (versioned; recipes, contracts, craft, orchestration,
  pitfalls). On-screen text is `COPY` in `scripts/film/timeline.mjs`. Final QA: ship, 9/10.
  **9:16 Reels cut** (2026-09-28): same timeline and score, recomposed per scene;
  `npm run film:9x16` → `econ-worksheet-film-9x16.mp4`; spec `scripts/film/FILM-9x16.md`.
  QA: ship, 8.7/10; the 16:9 film stayed pixel-identical.
- **Feature backlog** — `docs/IDEAS.md`, ranked from the 2026-09-24 competitor research in
  `docs/research/2026-09-competitive/`. Pick the next initiative from there.

## Last verified

- `npm test` — 2474 tests, ~7s (2026-09-28). `cargo check --locked` clean. `npm run build`
  green (postbuild: glossary only in a lazy chunk); `npm run samples` exports.
- `npm run typecheck` — clean.
- `npm run lint` — 43 pre-existing problems (3 errors, 40 warnings) in `Preview.tsx` and
  `InlineEditable.tsx`. Not a regression; do not "fix" by rewriting those files.
- Backends agreeing: `scripts/cover-verify.mjs` and `scripts/lq-verify.mjs` passed
  2026-09-28 (LibreOffice at `/opt/homebrew/bin/soffice`, a dev server running).

## Open threads and known gaps

- **E2 loose ends:** the toolbar pill and the Translate dialog count different sets (pill
  counts symbol gaps, dialog counts teacher text), so pill − Insert need not equal the new
  pill; Check terms has no "N match" count; the billing error opens the key page (no
  `billingUrl` in presets); DWL/TR stay symbols, so their 中文 falls back to English;
  Qwen's DashScope domain gets no new features after 2026-09-30 (workspace URL ships);
  `npm version` rewrites `Cargo.toml` but not `Cargo.lock` (`sync-version`) — check the lock
  at release. Root `economics_translation_library.json` is the user's untracked copy of the
  bundled glossary: delete or ignore it at their choice.
- **HKEAA paper furniture wording** (全卷完 → 試卷完, 任答一題 → 選答一題, 結構性問題 …) —
  the user deferred it to a separate task; the AI follows the seeds until then.
- **Never SendMessage a running workflow agent** — it forks a second writer; and a usage
  limit only pauses a workflow (TaskStop it before relaunching over its worktrees).

- **Verify diagrams in WebKit too.** Safari and the desktop webview ignore SVG
  `dominant-baseline` on `<text>` with `<tspan>`s; labels rose through the axis while
  Chrome shots looked right (fixed 2026-09-26: `textAt` writes explicit baselines).
  Playwright WebKit is installed; screenshot both engines for text placement work.
- **Empty table cell shows no caret until you type** (seen 2026-09-26, Chrome; editing
  path untouched by the motion work — confirm on an older build before fixing).
- **`scripts/shot.mjs --seed` no longer reaches the editor** — `/` opens the start screen
  now; drive "Classroom worksheet" → Create first.
- **Diagram relations, loose ends:** the canvas "Shift" button still makes a plain copy
  (templates use a following `shift` derive); a dragged PPF point is not held on the
  frontier; `gap-narrows` is crowded in bilingual mode; presets cannot use a flat D; the
  import-quota step does not follow Pw. Partial rows are listed in `COVERAGE.md`.
- **Pie hatch/dot patterns print greyish** — Chrome rasterises `<pattern>` tiles in the
  PDF. Shaded axis areas avoid this by drawing hatch as clipped lines; the pie could too.
- **Desktop checks owed to the user** (their `tauri dev` was running, agents did not start
  a second): Export → PDF → Save PDF… on a multi-page document (page count = sheets,
  size = paper; cancel keeps the dialog open); drag a card onto a folder; drop a `.json`
  from `~/Downloads` onto the start screen; the newer-version notice's "Check for updates".
- **Older builds do not draw revenue gain/loss areas or model answer diagrams** (they keep
  them in the file). The
  newer-version notice covers a file saved by this build and opened in ≤0.3.0 only once
  the schema version is bumped — it is not, so the areas silently do not show there.
- **Model answer diagram** (`feature/answer-diagram`): no alt text / title field for it;
  Duplicate question keeps block ids (pre-existing, stem diagrams too), so a copy's figure
  shares the original's id. A question taller than the rest of sheet 1 starts on sheet 2
  in the preview while Word starts it on page 1 (pre-existing; seen with stem diagrams).
- **Combined answer key uses the current document's page setup and font size** for every
  part; a 10pt Paper 2 key inside an 11pt Paper 1 prints at 11pt.
- **Windows builds are unsigned.** SmartScreen warns on first run. An OV certificate
  (~US$215/yr) is the option; Azure Trusted Signing is not open to a Hong Kong maintainer.
- **The updater signing key** lives only at `~/.tauri/econ-worksheet.key`. Lose it and no
  installed app can ever accept another update.
- **A bare `npx vitest run` rewrites the frozen corpus**: `scripts/emit-v1-corpus.test.ts`
  runs and regenerates `src/test/corpus/v1-published.json`. Always use `npm test`; if the
  corpus shows as modified, `git checkout` it. Consider excluding that script from the
  default vitest include.
- **`scripts/*.test.ts` are not in `npm test`** (which is `vitest run src`), though
  `vitest.config.ts` includes them. They are hand-run harnesses; nothing in CI catches a
  break in them.

## Log

- **2026-09-28** — E2 AI translation + app Settings on `develop`: research → judge-panel
  design → WP-0 contracts + seed fixes → 7 parallel worktree packages (build → adversarial
  review → fix) → sequential integration → 4-lens final review (33 confirmed, all code ones
  fixed on `feature/e2-polish`). ESLint now ignores `.claude/**` (agent worktrees).
- **2026-09-27 (later)** — Product film merged (`scripts/film/`, skill `econ-film`), built
  by parallel agents: capture ∥ stage ∥ score → scene groups → critic → fixer → whole-film
  lens panel. Workflow agents die after 180 s silent: chunk renders, small edits.
- **2026-09-27** — **Released v0.4.0** (published, `latest` updater live; macOS arm64/x64 +
  Windows assets and signatures checked). `develop` = `main` after the release.
