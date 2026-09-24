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

- `npm test` — 1187 tests in 69 files, ~2s. Green. `npm run build` green; `npm run samples` exports.
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
- **`scripts/*.test.ts` are not in `npm test`** (which is `vitest run src`), though
  `vitest.config.ts` includes them. They are hand-run harnesses; nothing in CI catches a
  break in them.

## Log

- **2026-09-24** — Updates download silently, banner only when ready (saves first). Update check once per launch with one shared state; version + "Check for
  updates" at the start screen's bottom-left and in the editor ⋯ menu. Banner no longer
  overflows the window; start screen renders after hydration (fixed a desktop mismatch).
- **2026-09-24** — Export dialog (paper / answer key / both), answer-key `.docx` via a
  new registry hook, pre-print paper check, backup-all zip + restore, Trash (30 days).
  Registry grep now covers ten modules. Work moved to the `develop` branch.
- **2026-09-24** — File dashboard on the start screen (thumbnails, search, filter, sort,
  grid/list); desktop default export folder, native import, reveal in Finder/Explorer.
  Clipboard's `escapeHtml`/`richHtml`/`formatCss` now exported for the thumbnail.
  Competitor research (5 slices) → `docs/IDEAS.md`.
- **2026-09-22** — Docs orientation layer + rot test; download widget; released v0.2.0;
  shipped the desktop app (Tauri 2, file-backed store, self-updates).
