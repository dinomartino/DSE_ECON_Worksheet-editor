# Status

**Update this at the end of every session. Keep it under 80 lines; oldest log lines fall
off the bottom.** It is the first thing a fresh session reads — then
[`CODEMAP.md`](./CODEMAP.md).

## Current initiatives

- **Desktop app — shipped 2026-09-22.** Tauri 2 wraps the same static `out/`; documents
  become files under `$APPDATA/worksheets/` (`src/storage/fileStore.ts`), saving uses the
  native dialog, updates come from GitHub Releases. `src/platform/index.ts` ·
  `src/desktop/updater.ts`.
- **v0.2.0 in flight.** Tagged and built; the release draft ships macOS arm64 + x64 signed
  and notarised, Windows x64 unsigned. Steps in `RELEASING.md`.
- **Web stays the primary target.** Static export on Vercel, no server runtime. The web
  build must stay green — `npm run build` fails if a `@tauri-apps/*` import reached the bundle.
- **Download widget** — `docs/download-widget.html` is a paste-anywhere block that reads the
  latest release from the GitHub API, so links to installers never go stale.

## Last verified

- `npm test` — 1066 tests in 60 files, ~1.6s. Green.
- `npm run typecheck` — clean.
- `npm run lint` — 45 pre-existing problems (3 errors, 42 warnings) in `Preview.tsx` and
  `InlineEditable.tsx`. Not a regression; do not "fix" by rewriting those files.
- Backends agreeing: `scripts/cover-verify.mjs` and `scripts/lq-verify.mjs` were the last
  three-way checks; both need LibreOffice and a running dev server.

## Open threads and known gaps

- **Windows builds are unsigned.** SmartScreen warns on first run. An OV certificate
  (~US$215/yr) is the option; Azure Trusted Signing is not open to a Hong Kong maintainer.
- **`src/platform/index.ts:revealFile` is defined but never called.** Nothing in the UI
  offers "show in folder" after a desktop save.
- **Import still uses `<input type="file">`** in `src/components/start/StartScreen.tsx`,
  even on desktop, where a native open dialog would match the save path.
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

- **2026-09-22** — Added the quick-reference system: `docs/CODEMAP.md`, `docs/RECIPES.md`,
  `docs/GLOSSARY.md`, this file, and `src/test/codemap.test.ts` to stop them rotting.
  CLAUDE.md gained a "Fresh session? Start here" block. No `src/` behaviour changed.
- **2026-09-22** — Added the paste-anywhere download widget (`docs/download-widget.html`).
- **2026-09-22** — Released v0.2.0; fixed the Developer ID team and the empty-updater-password
  note in `RELEASING.md`.
- **2026-09-22** — Shipped the editor as a desktop app: Tauri 2 shell, file-backed store,
  self-updates.
- **Earlier** — MCQ options with figures lay out two per row; sidebar slimmed into an
  inspector; contextual tools docked over the page; question-too-tall breaking.
