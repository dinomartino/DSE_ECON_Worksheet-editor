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
- **v0.2.0 in flight.** Tagged and built; the release draft ships macOS arm64 + x64 signed
  and notarised, Windows x64 unsigned. Steps in `RELEASING.md`.
- **Web stays the primary target.** Static export on Vercel, no server runtime. The web
  build must stay green — `npm run build` fails if a `@tauri-apps/*` import reached the bundle.
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

- `npm test` — 1234 tests in 74 files, ~2s. Green. `npm run build` green; `npm run samples` exports.
- `npm run typecheck` — clean.
- `npm run lint` — 44 pre-existing problems (3 errors, 41 warnings) in `Preview.tsx` and
  `InlineEditable.tsx`. Not a regression; do not "fix" by rewriting those files.
- Backends agreeing: `scripts/cover-verify.mjs` and `scripts/lq-verify.mjs` were the last
  three-way checks; both need LibreOffice and a running dev server.

## Open threads and known gaps

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

- **2026-09-24** — Three features in parallel worktrees, merged: seeded MCQ versions A–D
  (`src/model/versions.ts`, registry `variant` hook, per-version keys + version map),
  other-apps export (`src/export/csv/`), export toggles (`OutputMode.omitCover` /
  `omitAnswerSpace`). Dropped the year-specific Paper 2 template idea. In-app feedback
  planned (GitHub issue prefill), see IDEAS.
- **2026-09-24** — Start-screen sidebar decluttered; updates download silently with the
  banner only when ready; update check once per launch; version + "Check for updates"
  on the start screen and in the editor ⋯ menu.
- **2026-09-24** — Export dialog (paper / answer key / both), answer-key `.docx` via a
  new registry hook, pre-print paper check, backup-all zip + restore, Trash (30 days).
  Registry grep now covers ten modules. Work moved to the `develop` branch.
