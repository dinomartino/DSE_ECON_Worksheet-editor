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
  build must stay green — `npm run build` fails if a `@tauri-apps/*` import reached the bundle.
- **B1–B4 built 2026-09-25 on `develop`** by four parallel Opus agents in worktrees,
  merged by hand (conflicts: import lines only). Marking scheme in HKEAA notation
  (`src/model/markScheme.ts`), MCQ rationale + provenance, diagram shaded areas + shift
  curve (`src/model/diagramAreas.ts`, `diagramShift.ts`), graph answer space
  (`src/render/answerGraph.ts`). Each browser-verified and `.docx`-checked alone; the
  merged result has tests/typecheck/build/samples green but no browser pass yet.
- **Seeded MCQ versions, other-apps export (ZipGrade / key CSV / Kahoot / Blooket), and
  cover / answer-space export toggles — built 2026-09-24 on `develop`** by three parallel
  agents, merged by hand in `ExportDialog.tsx`. Browser-verified together; desktop save
  paths and real imports into the four apps not tried.
- **Export dialog, answer key, paper check, backup zip, Trash — built 2026-09-24 on
  `develop`.** Browser-verified on the web; desktop paths (two save sheets, zip pick,
  trash folder moves) not yet run in `npm run desktop:dev`.
- **File dashboard — built 2026-09-24 on `develop`.** Start screen shows saved documents
  as first-page thumbnails (grid) or a list, with search, kind filter and order.
  Desktop: dialogs start in `~/Documents/Econ Worksheets` (or the last folder), import uses
  the native open dialog, and exports/stored files can be revealed in Finder/Explorer.
  `src/components/start/FileDashboard.tsx` · `src/platform/index.ts:exportsFolder`.
- **Feature backlog** — `docs/IDEAS.md`, ranked from the 2026-09-24 competitor research in
  `docs/research/2026-09-competitive/`. Pick the next initiative from there.
- **Download widget** — `docs/download-widget.html` is a paste-anywhere block that reads the
  latest release from the GitHub API, so links to installers never go stale.

## Last verified

- `npm test` — 1356 tests in 82 files, ~2.5s. Green. `npm run build` green; `npm run samples` exports.
- `npm run typecheck` — clean.
- `npm run lint` — 44 pre-existing problems (3 errors, 41 warnings) in `Preview.tsx` and
  `InlineEditable.tsx`. Not a regression; do not "fix" by rewriting those files.
- Backends agreeing: `scripts/cover-verify.mjs` and `scripts/lq-verify.mjs` were the last
  three-way checks; both need LibreOffice and a running dev server.

## Open threads and known gaps

- **Print PDF doubles a part's "(N marks)"** — seen by two agents in `page.pdf()` output
  (`(a) … (2 marks) … (2 marks)`); the preview shows one. Predates 2026-09-25. Unverified
  in a real `window.print()` PDF.
- **Pie hatch/dot patterns print greyish** — Chrome rasterises `<pattern>` tiles in the
  PDF. Shaded axis areas avoid this by drawing hatch as clipped lines; the pie could too.
- `src/render/answerGraph.ts` (~line 208) still blames the pagination probe for hidden
  markers; the real cause is any copy outside `#print-root`. Comment only.
- **Diagram thumbnails and print not re-run** after B3; `scripts/cover-verify.mjs` /
  `scripts/lq-verify.mjs` last run by the B4 agent (lq-verify passed, needs `LQ_DIR`).
- **Windows builds are unsigned.** SmartScreen warns on first run. An OV certificate
  (~US$215/yr) is the option; Azure Trusted Signing is not open to a Hong Kong maintainer.
- **Desktop file features are untested in the real app** (`npm run desktop:dev` not run):
  default folder creation, dialogs opening there, reveal, open folder, native import.
- **macOS will ask for Documents access** the first time a dialog creates the default
  folder; there is no `NSDocumentsFolderUsageDescription`, so the prompt is generic.
- **Thumbnails are approximate** — no header/footer/page furniture, one language, rough
  page end. See SYSTEM_ARCHITECTURE §The file dashboard.
- **No newer-schema-version guard.** `src/model/migrations.ts:migrate` accepts a document
  whose `schemaVersion` is *above* `CURRENT_SCHEMA_VERSION`, keeping its extra fields in
  `__unknown` but rendering it with this build's rules. Deliberate for now (a newer file
  opens rather than refusing), but it means a future v2 document opens silently degraded.
- **The updater signing key** lives only at `~/.tauri/econ-worksheet.key`. Lose it and no
  installed app can ever accept another update.
- **`app.security.csp` is `null`** in `src-tauri/tauri.conf.json` — Next's static export
  inlines its bootstrap scripts. Tightening it means nonced scripts first.
- **A bare `npx vitest run` rewrites the frozen corpus**: `scripts/emit-v1-corpus.test.ts`
  runs and regenerates `src/test/corpus/v1-published.json`. Always use `npm test`; if the
  corpus shows as modified, `git checkout` it. Consider excluding that script from the
  default vitest include.
- **`scripts/*.test.ts` are not in `npm test`** (which is `vitest run src`), though
  `vitest.config.ts` includes them. They are hand-run harnesses; nothing in CI catches a
  break in them.

## Log

- **2026-09-25** — B1–B4 from the backlog built in parallel by Opus sub-agents on
  `feature/b1..b4` branches, merged into `develop`. Rule saved: all code edits go to
  Opus sub-agents; the coordinator merges and writes the docs. Follow-up: SVG `<marker>`
  and `<pattern>` refs resolved to hidden copies outside `#print-root`, so arrowheads and
  pie hatching vanished in the print PDF — arrowheads are now plain triangles
  (`diagram.ts:arrowheadPath`), patterns forced visible in print CSS.
- **2026-09-24** — Three features in parallel worktrees, merged: seeded MCQ versions A–D
  (`src/model/versions.ts`, registry `variant` hook, per-version keys + version map),
  other-apps export (`src/export/csv/`), export toggles (`OutputMode.omitCover` /
  `omitAnswerSpace`). In-app feedback dialog (prefilled GitHub issue / mailto / clipboard;
  `src/feedback/`). Dropped the year-specific Paper 2 template idea.
