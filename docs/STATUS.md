# Status

**Update this at the end of every session. Keep it under 80 lines; oldest log lines fall
off the bottom.** It is the first thing a fresh session reads — then
[`CODEMAP.md`](./CODEMAP.md).

## Current initiatives

- **Branching: work is on `develop`** (since 2026-09-24); `main` deploys to teachers.
  Collecting features for the next release — merge to `main` only when the user says.
- **Desktop app — shipped 2026-09-22.** Tauri 2 wraps the same static `out/`; documents
  become files under `$APPDATA/worksheets/` (`src/storage/fileStore.ts`), saving uses the
  native dialog, updates come from GitHub Releases. `src/platform/index.ts` ·
  `src/desktop/updater.ts`.
- **Web stays the primary target.** Static export on Vercel, no server runtime. The web
  build must stay green — static `@tauri-apps/*` imports are caught by ESLint,
  `src/test/tauriImports.test.ts` and the `postbuild` bundle check (`scripts/check-web-bundle.mjs`).
- **2026-09-25 batch on `develop`, all merged, tests/typecheck/build/lint green:** B1–B4
  (marking scheme `src/model/markScheme.ts`, MCQ rationale, shaded areas + shift curve +
  colours + leader labels `src/model/diagramAreas.ts` · `src/render/diagramLeader.ts`,
  graph answer space `src/render/answerGraph.ts`); one Export button (.docx / PDF / .json,
  `src/components/editor/printPdf.ts`); combined answer key across documents
  (`src/render/answerKey.ts:renderCombinedAnswerKey`); dashboard folders
  (`src/storage/folders.ts`) with pointer-event drag (`dashboardDrag.ts`); desktop
  file-drop import (`src/platform/index.ts:listenForFileDrops`); `CHANGELOG.md` + in-app
  What's new (`src/whatsNew/`); newer-schema read-only guard
  (`src/components/editor/NewerVersionNotice.tsx`); leader labels fixed (tip ≥10px inside,
  tail on the label edge); hatch patterns + TR / gain / loss areas
  (`src/model/diagramAreas.ts`, `revenue` field); desktop Export → PDF writes a file via
  `src-tauri/src/pdf/` (macOS WebKit save-job, Windows WebView2 PrintToPdf — never run
  on Windows). Each feature browser-verified alone;
  **no browser pass of the merged whole, and nothing run in the desktop shell.**
- **Syllabus-adaptive diagrams (2026-09-25, merged on `develop`)** from
  `docs/Diagram_Requirements/` (A-level group out of scope): anchored points, derived
  curves (MR, parallel, tangent, level, vertical) and spans (`src/model/diagramAnchors.ts`,
  `diagramSpans.ts`, `render/diagramSpan.ts`); 19 welfare presets + grouped Shade menu
  (`src/model/diagramPresets.ts`); 47 templates grouped by topic
  (`diagramTemplatesMarket.ts` · `Macro` · `Trade`, `scripts/template-gallery.mjs`); model
  answer diagram on LQ leaves. **Next:** retrofit templates onto anchors/derived/spans/
  presets, coverage matrix vs §8 checklist, demo storyboard; browser pass of the merged whole.
- **Feature backlog** — `docs/IDEAS.md`, ranked from the 2026-09-24 competitor research in
  `docs/research/2026-09-competitive/`. Pick the next initiative from there.

## Last verified

- `npm test` — 1671 tests, ~3s. `cargo check` in `src-tauri` clean. Green. `npm run build` green; `npm run samples` exports.
- `npm run typecheck` — clean.
- `npm run lint` — 44 pre-existing problems (3 errors, 41 warnings) in `Preview.tsx` and
  `InlineEditable.tsx`. Not a regression; do not "fix" by rewriting those files.
- Backends agreeing: `scripts/cover-verify.mjs` and `scripts/lq-verify.mjs` were the last
  three-way checks; both need LibreOffice and a running dev server.

## Open threads and known gaps

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
- **`scripts/cover-verify.mjs` / `lq-verify.mjs` not re-run** since B3/B4 (lq-verify passed
  for the B4 agent; needs `LQ_DIR`).
- **Windows builds are unsigned.** SmartScreen warns on first run. An OV certificate
  (~US$215/yr) is the option; Azure Trusted Signing is not open to a Hong Kong maintainer.
- **Desktop file features are untested in the real app** (`npm run desktop:dev` not run):
  default folder creation, dialogs opening there, reveal, open folder, native import.
- **macOS will ask for Documents access** the first time a dialog creates the default
  folder; there is no `NSDocumentsFolderUsageDescription`, so the prompt is generic.
- **Thumbnails are approximate** — no header/footer/page furniture, one language, rough
