# Status

**Update this at the end of every session. Keep it under 80 lines; oldest log lines fall
off the bottom.** It is the first thing a fresh session reads — then
[`CODEMAP.md`](./CODEMAP.md). The long per-feature notes before 2026-10-03 are in
`git show 672ea2b:docs/STATUS.md`; what shipped is in `CHANGELOG.md`.

## Next session starts here

- **Merged, unreleased (2026-10-08):** table bar "Same height" / "Same width" (Word's Distribute rows/columns)
  over a swept range only (`distributeRows`/`distributeColumns` in `src/model/table.ts`). Not yet tried in the Tauri window.
  Also: the editor shell no longer scrolls into empty space (paginator probes are `h-0 overflow-hidden`).
- `npm run typecheck` trips on `src-tauri/target/**/tauri-codegen-assets/*.ts` after a local `desktop:build`
  (tsconfig excludes only `node_modules`); source itself is clean.
- **Found-folder offer merged, unreleased** (`library_found`, `src/sync/foundFolder.ts`): faked shell
  only; run `desktop:dev` with a synced library (picker location, "done" flag across a restart).
- **Merged, unreleased (2026-10-08):** **Import from Word or PDF** on the home screen (file chooser or
  drop) → review (`src/components/import/ImportDialog.tsx`) → Save as Classroom / LQ / Paper 1 mock /
  Paper 2 mock / 題庫 only. Engine `src/import/` (`readDocx`, `readPdf` with pdfjs-dist legacy, lazy).
  **File-only by the user's decision**: the paste-text importer was removed. Also merged: UI language /
  Paper language settings; topic names, 題庫 and panel excerpts follow the paper language. Several files
  at once + "Answers from" linking (answer keys, marking schemes from another file; § 11).
  Design + as built: `docs/design/paste-import.md`.
- **Next (waiting on the user's go: installer +~45 MB):** in-app OCR for scans/photos: PP-OCRv6 small
  in Rust via `ort`/`oar-ocr`, adapter → `layoutPdf`, `source: 'ocr'`, key rows cell by cell
  (`docs/research/2026-10-ocr-survey.md`). Users are desktop-only: design for the Tauri app.
- **Check next:** the Tauri window (native open sheet and drop, pdf.js main-thread fallback on macOS);
  the editor showed 31 pages for the imported 2019 Paper 2 vs 24 in LibreOffice (uninvestigated);
  題庫 only lands on an arbitrary untagged question, not the first added; S6 Paper I Q42 ("B" without a dot)
  and a source table's (a)–(d) rows read as parts.
- `feature/film-v2` (144 commits, worktree `.claude/worktrees/film-v2`) is **only on this Mac**, not on GitHub.

## Where we are

- **Cross-device sync (F9), shipped in 0.7.0.** Local primary + folder mirror (`src/sync/`,
  `docs/design/sync-engine.md`, `docs/design/library-folder.md`); Settings → Storage location, Needs
  attention, Clear detaches, no missing-folder screen. Shipped visible before any real run (user's call).
- **v0.7.0 released 2026-10-08** (published, `latest`; Vercel deploy not checked). Ships Storage location sync
  (desktop), floating notices, the pre-release fixes. v0.6.0 (2026-10-04) shipped 題庫, Marking
  scheme, Translation terms, 中文 interface, Graphs 圖表庫, the Econ Studio rename.

## Before release (only the user can do these)

- Sync's first real run: `desktop:dev` with a scratch folder, steps in
  `docs/design/sync-engine.md` § First real run (now through Settings → Storage location); then Stage 0
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
- Sync: an older and a newer build resolving one provider copy at once can still make a second;
  opening a paper waits out a run in flight; a library with no document at all (none live or in
  Trash) pauses sync. Windows code passes CI but never ran on a real PC or provider.
- Windows builds unsigned. The updater key lives only at `~/.tauri/econ-worksheet.key`. Film copy
  says Econ Studio but is not re-rendered; `film:doctor` timed out once (unchecked).

## Last verified (2026-10-08, `develop` after Paste questions merge)

- `npm test` 5234, lint 40, typecheck, build (bundle check) green after the import merge. Earlier: `npm test` 5079, `cargo test` 51; found-folder branch: build, samples 6, lint 40. Before it: samples 6 passed; build, typecheck, cover/lq-verify (en + zh) green;
  lint 40; CI green incl. `rust (windows-latest)`.

## Log

- **2026-10-08** — Found-folder offer; import (design, engine, docx/pdf readers, home-screen file import,
  answers from another file); paper language; OCR survey + trial; table distribute rows/columns; editor overscroll fix. 17 Opus branches merged.
