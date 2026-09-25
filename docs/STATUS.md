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

- **2026-09-25 (night)** — Diagram initiative: core geometry, presets, templates merged
  (one conflict; trade role guess now prefers drawn price lines). Model answer diagram
  on LQ leaves (answer-key `.docx` now embeds pictures). Browser-verified alone.
- **2026-09-25 (evening)** — Leader arrow geometry; hatch patterns + revenue areas; desktop
  PDF file export (native, per platform); print doubled-marks fix.
- **2026-09-25 (later)** — Export button unified + desktop print permission; combined
  answer key; folders + pointer drag; desktop file drop; CHANGELOG.md, release-notes
  script and What's new; schema-evolution policy, newer-file read-only guard, real Tauri
  import guard (the documented build failure never fired). Area colours + leader labels.
