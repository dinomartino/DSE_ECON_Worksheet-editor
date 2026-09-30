# Status

**Update this at the end of every session. Keep it under 80 lines; oldest log lines fall
off the bottom.** It is the first thing a fresh session reads — then
[`CODEMAP.md`](./CODEMAP.md).

## Current initiatives

- **Paid service analysis (2026-09-30, research only, no code)**: accounts, hosted AI, cloud sync,
  payments. `docs/research/2026-09-paid-product/`, artifact FywY8LdptidVU4EobqsjQW. Key finding: only
  Vertex AI Gemini / Qwen HK may serve HK users; the in-app "use a VPN" Gemini advice breaks Google's
  terms. v2 same day: convenience at ~HK$0 fixed, no school sales; folder sync + AI
  pages (Cloudflare free, desktop first). Awaiting the user's calls (what first, VPN wording).
- **Never checked** (dropped from IDEAS in its 2026-09-29 cleanup, kept here): a real
  import of our key exports into the four other apps; graph answer space and model answer
  diagrams in Word; print-PDF of shaded areas; HKEAA Chinese labels and EC wording; the
  desktop feedback opener; curves stopping short of the y-axis on a CS/PS strip.

- **Branching: work is on `develop`** (since 2026-09-24); `main` deploys to teachers.
  **v0.5.0 released 2026-09-28** (✦ AI, Check terms, Settings, light/dark, 標楷體, home
  navigation). Collecting features for the next release — merge to `main` only when the user says.
- **2026-09-30 on `develop`, not released:** (1) **Renamed to Econ Studio 經濟備課室**
  (user-facing only). Tauri `productName` stays "Econ Worksheet": renaming it breaks the
  Windows NSIS update (second install, stale shortcut). A clean switch needs an NSIS hook
  that removes the old install; not built, user not yet asked to decide. The film still says
  Econ Worksheet (`scripts/film/timeline.mjs`). (2) **Header & footer tab by page**: Page 1 /
  Pages 2 onward thumbnails as tabs, per-edge Same / Its own / Nothing on page 1
  (`firstPageModeOf`, `pageBandScope` in `src/model/page.ts`), title inside the Page 1 view;
  fixed "Same as page 1" discarding page 1's rows. (3) **Export asks where to save**:
  Save As picker on Chromium (`src/platform/webPicker.ts`), one folder for multi-file exports
  (web + desktop), Safari/Firefox keep downloads plus a hint. Desktop folder path unit-tested
  only, not clicked through in the shell.
  (4) **New worksheet asks for a name** (required, sets `name`, never `title`); Duplicate
  adds " (copy)"; `Dialog` no longer steals a field's autoFocus; toolbar crumb reads Econ
  Studio. Open: 題庫 "New worksheet from these" still sets the printed `title` to the topic and
  no `name`; film capture script clicks a removed ⋯ "Worksheets…" item (broken before this).
  (5) **WebKit PDF shrink fixed** (Mac desktop + Safari): print kept screen breakpoints, the
  hidden toolbar widened the document, WebKit shrank pages to fit (0.72 at 1800 px). Fix:
  `overflow-x: clip` on `#print-root`'s ancestors. Verified with a scratch WKWebView harness
  (same NSPrintInfo as `macos.rs`), not yet in the packaged app.
- **Question bank 題庫 (merged on `develop` 2026-09-29, not released)** — C1–C4 from
  `docs/IDEAS.md`; plan, decisions, taxonomy: `docs/design/question-library.md`; UI design:
  artifact FyR7Xdd6BpgvFL42tdzz2T. Phase 0 (`src/model/lineage.ts`, `dedupeIds`) + WP-0
  core (`src/library/`, `src/model/topics.ts`) + A topic tags (`TopicRow.tsx`, Setup Class /
  Hide from bank) + B persistent index (`src/storage/changes.ts`, `src/library/bankIndex.ts`,
  IndexedDB / `worksheets/library/index.json`) + C editor 題庫 tab (`src/components/bank/`)
  + D start-screen bank page (`src/components/bank/page/`) + E lineage actions
  (`src/library/bankDocs.ts`). **Redesigned the same day:** the bank is its own screen
  (`src/components/bank/page/QuestionBankScreen.tsx`: topic cards → review page → tag as you
  go), opened from the start screen's aside. The review page's only action is Open in
  worksheet (its "Add to …" confused the user, removed 2026-09-29); adding goes via the tray.
  **Deep analysis 2026-09-29** (`docs/research/2026-09-question-bank.md`, backlog in
  `docs/IDEAS.md` § C). **C5 + C6 merged 2026-09-29**: a use = `classes` + `satOn`
  (`src/model/classes.ts`), cohort derived (`src/library/cohort.ts`), legacy develop-only
  `classTag` folded on load (no schema bump; it never shipped); bank topic edits write every
  copy and display the union (`src/library/sharedTags.ts`); editor topic edits sync other
  copies too (`src/components/editor/topicSync.ts`), bank copies take the union. Known:
  ⌘Z undoes the open copy only; a second tab holding a copy can overwrite synced tags;
  Filter button label truncates. **C24 題型 merged**: tag form `C.ped::<name>` (`src/model/patterns.ts`), registry
  `src/storage/patterns.ts` (in backup). Gaps fixed 2026-09-29 (Enter picks a match, bulk
  clear, kept on cancel, success notices clear on level change); Chromium + WebKit verified;
  desktop registry covered by unit tests only, Tauri shell not clicked through.
  **Drag from the 題庫 tab merged 2026-09-30** (`src/components/bank/bankDrag.tsx`,
  `dropSlot.ts`): live provisional layout, one commit on drop; measurement write-backs now
  skip stale renders (`usePagination` `isFresh`), lq-verify + cover-verify re-run and pass.
  Open: ⌘Z during a drag still undoes the store; page-rail thumbnails don't show the ghost;
  no touch drag; not tried in the Tauri shell. Insert button removed (drag only; Enter on a focused row
  inserts after the selected question). Next: C7–C11. Teacher screen text has no em dashes (user rule).
  **Integration QA + polish merged** (`feature/bank-polish`):
  end-to-end in Chromium + WebKit, `.docx` leak-free; fixed a real "Maximum update depth"
  crash in `usePagination`/band measuring (a no-op `setState` per render queued a second
  full render per keystroke — compare before calling the setter). lq-verify and
  cover-verify pass after it. **Unverified:** desktop index file in the real shell.
  Follow-ups: "Update bank copy" menu item appears a beat late (rows shift); new banks all
  titled "Question bank"; From filter shows same-titled docs alike; native `<select>`
  filters wrap at 1280px; no list keyboard nav; Set topic only adds; ↻ per Fill pick; hover
  ghost preview; ✦ Suggest topics. Pre-existing, not bank: a new Classroom worksheet's first
  question lands after the Section B heading.
- **✦ AI demo film (merged on `develop`)** — `npm run demo:ai` → `demo-media/ai/` (38 s,
  subtitles, no audio). Translations are canned in the browser (`scripts/demo/ai-provider.mjs`,
  text in `scripts/demo/content.mjs:AI`); Check terms is real. App nit seen while filming:
  after a finding card's Replace, the bar still reads "1 to fix · Replace 1" until Done.
- **UI polish (merged on `develop` 2026-09-29, not released)**: hover is colour only (no
  accent bar/nudge/lift; rule in SYSTEM_ARCHITECTURE § Layout rules); start-screen aside
  shows scroll edge hints (`src/components/ui/scrollEdges.ts`, `ScrollEdgeHints.tsx`),
  reusable for other panes. Settings gear top-right on start + bank
  (stacked layout: brand row). Editor ⋯ lost Worksheets… (crumb is the route home).
  Right-click inside a question box opens its menu (`kind: 'question'`, AI only); layout
  elements still have no box menu. Left alone: swatches grow on hover, dark-mode row tint is faint.
- **AI Settings keys (merged on `develop` 2026-09-29, not released)**: "Your keys" list
  (count, masked last 4, In use, per-key Test/Forget, in-memory status), "Key saved" chip on
  provider rows, card's button reads Test for a saved key, About folded into one Collapsible.
  One key per provider (multi-key per provider not built). Unverified in the desktop shell
  (Keychain rows show no last 4 until read).
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
  unverified); one try from an HK network without VPN (Gemini region error → Try again / Use DeepSeek);
  desktop Keychain prompt in a built app (`npm run desktop:build:debug`), incl. Windows.
- **AI door (2026-09-28, merged on `develop`, not released)** — one **✦ AI** button (replaces
  the untranslated pill; count is its badge) and ⌘J open one menu of verbs scoped by the
  selection; right-click "✦ AI…" and the multi-select bar open the same menu. A click runs:
  **results insert directly** (one commit, one ⌘Z — the user's call), then highlight on the
  page with a review bar (‹ ›, item card, Undo all). The Translate dialog is gone. Verbs:
  Fill missing 中文/English, Re-translate, Check terms (keyless). **E1** answers & mark scheme
  (`src/answers/`), **E3** questions from a source (`src/generate/`) and **E4** quality check
  (`src/quality/`) are built but **paused** — hidden from teachers by
  `src/assist/paused.ts:PAUSED_VERBS` (the user: the AI isn't good enough yet); remove an id
  to bring one back. No key → SetupCard in the menu (Gemini stays Recommended; in HK the copy
  says turn on a VPN before the key page and while using it). Code: `src/assist/`, `src/components/ai/`. `node scripts/ai-verify.mjs`:
  29/29 Chromium + WebKit (mock; paused groups skipped). Design: artifact RNXkAnKMXcvJM6PWECe74S.
  **Before release (user):** Fill and Re-translate against a real key;
  the badge (edition's untranslated) and "Fill missing" count (adds teacher text + symbol
  copies) differ on the same paper — decide if that confuses. Gemini's privacy line now reads
  "Google's terms only cover use from places where it offers Gemini" (softened from "VPN use
  is against Google's terms") — the user may drop it.
- **Home navigation (2026-09-28, merged on `develop`)** — start screen: Settings gear moved
  top-right 2026-09-29 (`src/components/settings/SettingsButton.tsx`; editor keeps ⋯ only), version line above it (desktop).
  Editor: `[logo] Worksheets › <title>` crumb goes home (word hides <1280px; ⋯ →
  Worksheets… kept for the film). The start screen is always home — no Back to the last
  document; leaving flushes then unmounts the editor (`EditorHost.tsx:flushBeforeLeaving`).
  Fixed after: Clear saved documents discards the open document (`EditorHost.tsx:clearSavedDocuments`);
  toolbar one row from 1024px (name truncates; Setup icon-only and Saved a dot below xl);
  desktop file-drop unlisten never rejects (`src/platform/index.ts:unlistenSafely`) — not
  yet run in the real desktop shell.
- **標楷體 font preset (2026-09-28, merged on `develop`)** — teacher request: "Times New
  Roman / 標楷體" in `FONT_PRESETS` (`.docx` writes `w:eastAsia="DFKai-SB"`); default stays
  新細明體. Browser backends take `src/model/fonts.ts:cssFontFamilies`, which appends Mac Kai
  stand-ins (renders as BiauKaiTC here); other presets produce unchanged CSS.
  **Unchecked:** Word on Windows opening the export (LibreOffice/Mac substitutes a non-Kai face).
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

- `npm test` — 2565 tests, ~7s (2026-09-28, at the v0.5.0 release). `cargo check --locked` clean. `npm run build`
  green (postbuild: glossary only in a lazy chunk); `npm run samples` exports.
- `npm run typecheck` — clean.
- `npm run lint` — 43 pre-existing problems (3 errors, 40 warnings) in `Preview.tsx` and
  `InlineEditable.tsx`. Not a regression; do not "fix" by rewriting those files.
- Backends agreeing: `scripts/cover-verify.mjs` and `scripts/lq-verify.mjs` passed
  2026-09-28 (LibreOffice at `/opt/homebrew/bin/soffice`, a dev server running).

## Open threads and known gaps

- **E2 loose ends:** Check terms has no "N match" count; the billing error opens the key page (no
  `billingUrl` in presets); DWL/TR stay symbols, so their 中文 falls back to English;
  Qwen's DashScope domain gets no new features after 2026-09-30 (workspace URL ships);
  `npm version` rewrites `Cargo.toml` but not `Cargo.lock` (`sync-version`) — bump the lock on
  `develop` after a release (done for 0.5.0; CI does not build `--locked`). Root `economics_translation_library.json` is the user's untracked copy of the
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
  duplicating a question keeps block ids (Phase 0 of the question bank fixes it). A question taller than the rest of sheet 1 starts on sheet 2
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

- **2026-09-30** — Rename to Econ Studio, header/footer page tabs (+ blank page-1 row
  fix), export save location: four Opus worktree agents, merged to `develop`, 2929 tests,
  build green; nothing pushed.
- **2026-09-29** — Question bank 題庫: audit → design page → Phase 0 dup-id fix → WP-0 core →
  A–E in parallel worktrees (Sonnet for A/E, Opus for B–D) → integration QA/polish. All on
  `develop`, 2725 tests; nothing pushed.
- **2026-09-28 (later)** — Settings → Appearance (System / Light / Dark, default System):
  `src/settings/appearance.ts`; dark tokens and `dark:` now key on `<html data-theme>`, set
  before paint by `THEME_BOOT_SCRIPT` in `layout.tsx`, kept live by `AppearanceEffect`.
  Verified in Chromium (live switch, reload with no flash, System follows an OS change).
- **2026-09-28** — E2 AI translation + app Settings on `develop`: research → judge-panel
  design → WP-0 contracts + seed fixes → 7 parallel worktree packages (build → adversarial
  review → fix) → sequential integration → 4-lens final review (33 confirmed, all code ones
  fixed on `feature/e2-polish`). ESLint now ignores `.claude/**` (agent worktrees).
- **2026-09-27 (later)** — Product film merged (`scripts/film/`, skill `econ-film`), built
  by parallel agents: capture ∥ stage ∥ score → scene groups → critic → fixer → whole-film
  lens panel. Workflow agents die after 180 s silent: chunk renders, small edits.
- **2026-09-27** — **Released v0.4.0** (published, `latest` updater live; macOS arm64/x64 +
  Windows assets and signatures checked). `develop` = `main` after the release.
