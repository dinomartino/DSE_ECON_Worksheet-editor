# Status

**Update this at the end of every session. Keep it under 80 lines; oldest log lines fall
off the bottom.** It is the first thing a fresh session reads — then
[`CODEMAP.md`](./CODEMAP.md). The long per-feature notes before 2026-10-03 are in
`git show 672ea2b:docs/STATUS.md`; what shipped is in `CHANGELOG.md`.

## Where we are

- **2026-10-05: cross-device sync (F9).** One source-agnostic engine, local primary + mirror for
  every source (`src/sync/`, `docs/design/sync-engine.md`), merged with no entry point. 2026-10-06:
  base persistence (per source), hash cache and the folder source (Rust `library_*` commands,
  `src/platform/library.ts`, `src/sync/folderSource.ts`) and the scheduler (`src/sync/librarySync.ts`,
  starts in `EditorHost` only when a folder is chosen; `isBusy` holds unsaved open documents)
  merged; next the UI: Storage location, Needs attention, notices (`docs/design/library-folder.md`,
  survey `docs/research/2026-10-sync-survey.md`; Drive API design shelved).
- **2026-10-05: notices float** bottom-right via `notify()` (`src/store/notices.ts`), follow-ups merged.
- **v0.6.0 released 2026-10-04** (`main` = `develop` + version bump; web deployed). Ships the 題庫
  question bank, Marking scheme view and layouts, Translation terms, 中文 interface, Graphs
  圖表庫, diagram answer layer, the Econ Studio rename. Next work goes on `develop` as usual.
  Website shots: `node scripts/demo.mjs --shots` → 14 WebP at 1920 in `demo-media/screenshots/`.
- **2026-10-03: every known gap fixed** (two sweeps, `fix/gaps-*` / `fix/gaps2-*`, merged; detail in
  `git show 3818f89:docs/STATUS.md`). Schema rule "bump only when used" (`writtenSchemaVersion`);
  frozen `v2-*.json` corpora; index rows carry `indexRev`. Preview pages break where Word does.
- `cover-verify` / `lq-verify` take `--language` (`scripts/soffice.mjs` gives LibreOffice CJK fonts).

## Before release (only the user can do these)

- Sync's first real run: `desktop:dev` with a scratch folder, devtools steps in
  `docs/design/sync-engine.md` § First real run; then Stage 0
  provider probe (`library-folder.md` § 7) on two computers.

- Windows: 0.6.0 shipped without the rename hook test (`RELEASING.md`), user's call; check one install;
  Keychain prompt in a built app; 標楷體 export in Word.
- A real AI key: Save & test, Fill, Re-translate, `npm run eval:translate` (model ids in
  `src/ai/providers.ts` unverified); one try from an HK network without VPN.
- Desktop shell (`npm run desktop:dev`): first launch migrates the bank index to per-document
  files (`worksheets/library/docs/`; check 題庫 lists every paper); macOS self-rename on a real
  `/Applications` update; Export → PDF multi-page; folder drag; `.json` drop; Translation terms
  CSV + backup; launch animation once per cold start; real print dialog; paste a graph into Word.

## Waiting on the user's call

- Sync: "Clear saved documents" with a folder chosen forgets the base, so the folder refills the
  library on the next run (as designed). Keep that, or make Clear also detach the folder? Its
  confirm text must say which (UI stage).

- Paid service (`docs/research/2026-09-paid-product/`): what first; the in-app "use a VPN" Gemini
  wording breaks Google's terms. Gemini privacy line may be dropped.
- Versions: a shared rationale note repeats in each version's block of the key.
- Bank authoring proposal (`docs/design/bank-authoring.md`, 3 questions).

## Open threads and known gaps

- **Old releases:** v0.4/0.5 can still export a schema-2 file (student copy shows answers) and
  "Duplicate as editable copy" it; v0.2–0.3 have no read-only guard. They also don't draw revenue
  areas or model answer diagrams (no leak).
- **Never checked:** a real import of our exports into the four other apps; the desktop feedback
  opener; real Word/PMingLiU (LibreOffice + a Ming face agree); the desktop `pack.json` in Tauri.
- Diagrams: template arrows stay fixed; `curvePath` assumes 3:4. Bank: ✦ Fill from another tab can lose to autosave.
- Pagination now follows Word, so existing worksheets break differently on screen and in PDF.
- Film still says Econ Worksheet (`scripts/film/timeline.mjs`). Windows builds unsigned. The
  updater key lives only at `~/.tauri/econ-worksheet.key`. `scripts/*.test.ts` are hand-run.

## Last verified (2026-10-06, `develop` after the scheduler merge)

- `npm test` 4745 passed; `npm run build` green; typecheck clean; lint 40 (one under the 41 baseline).

## Log

- **2026-10-06** — Sync base persists (web IndexedDB `econ-worksheet-sync`, desktop
  `$APPDATA/sync/`), hash cache (`forgetOnWrite`), folder source (`cargo test` 31 passed; run and
  property tests run through both sources), scheduler + open-editor guard; autosave no longer marks
  an edit typed mid-save as saved (CHANGELOG): 4 Opus worktree branches, merged. None run in a real
  Tauri shell, browser, Windows or cloud provider yet.
- **2026-10-05** — Housekeeping (3 Opus worktree branches, merged): frozen 題庫 fixtures emitted
  at tag v0.6.0 (`src/test/corpus/bank-v0.6.0-*.json`, guards in backwardCompat/legacyIndex/
  `bankCorpus.test.ts`); min-wage template label lifted (demo workaround removed); flaky
  rationale test pinned to a fixed id. IDEAS reordered: classes findability, then D1.
  Then sync: Drive API design (shelved), library-folder plan, survey, sync engine core; notice overlay.
