# Status

**Update this at the end of every session. Keep it under 80 lines; oldest log lines fall
off the bottom.** It is the first thing a fresh session reads — then
[`CODEMAP.md`](./CODEMAP.md). The long per-feature notes before 2026-10-03 are in
`git show 672ea2b:docs/STATUS.md`; what shipped is in `CHANGELOG.md`.

## Next session starts here

- **Merged, unreleased (2026-10-08/09), none tried in the Tauri window yet:** table "Same height/width" over a
  swept range (`distributeRows`/`distributeColumns`); editor shell no longer overscrolls (probes `h-0`); import
  brings header/footer/title block (`src/import/chromePlan.ts`, `paste-import.md` § 12; unreproducible bits listed
  with Copy); band rows emulate Word tab stops (`bandTabPlan` pinned to the exporter), masthead page numbers are
  fields, clipboard pastes every ColumnsNode as tab stops. Within 1pt of LibreOffice. **Unverified in Word:**
  clipboard paste, a tab past the last stop. Left: masthead rule 1.5pt vs 1pt, #999 vs 808080.
- **Found-folder offer merged, unreleased** (`library_found`, `src/sync/foundFolder.ts`): faked shell
  only; run `desktop:dev` with a synced library (picker location, "done" flag across a restart).
- **Merged, unreleased (2026-10-08):** **Import from Word or PDF** (home screen; file-only by the user's
  decision) → review → Save as; engine `src/import/`, design `docs/design/paste-import.md`. Also UI language /
  Paper language settings; several files at once + "Answers from" linking (§ 11).
- **OCR merged, unreleased (2026-10-09):** PP-OCRv6 small in Rust on static ORT 1.22 (`src-tauri/src/ocr/`,
  models fetched by `build.rs`, SHA-pinned), scans + pictures read page by page (`src/import/ocrLayout.ts`,
  `paste-import.md` § 13). DMG +33 MB. Proven end to end in the release `.app` on real scans + photos.
  Windows CI green (links, real-model tests). Unverified: Intel Mac, macOS 12–13.2, signed build, native open sheet.
- **Import leftovers merged (2026-10-10):** bare "B" option + labelled table rows (S6 P1 Q42, P2 Q10), word-space options
  (Q11), 題庫-only lands on the first added, answer lines break like Word (2019 P2 24/24/24; Paper 2 body ends at the
  frame), scan diagrams come in as pictures. Picture options pair by place (DSE2021 Q36,
  .docx tables too); scheme rows round a figure follow it (S6 Q5). Crop edges trimmed; boxed flow charts become one
  picture. Left: tables don't split across sheets in the preview (Word does); text inside a figure's box stays in the crop.
- `feature/film-v2` (144 commits, worktree `.claude/worktrees/film-v2`) is **only on this Mac**, not on GitHub.

## Where we are

- **Cross-device sync (F9), shipped in 0.7.0** (`src/sync/`, `sync-engine.md`, `library-folder.md`), visible
  before any real run (user's call).
- **v0.7.0 released 2026-10-08** (published, `latest`; Vercel deploy not checked). Ships Storage location sync
  (desktop), floating notices, the pre-release fixes. v0.6.0 (2026-10-04) shipped 題庫, Marking
  scheme, Translation terms, 中文 interface, Graphs 圖表庫, the Econ Studio rename.

## Before release (only the user can do these)

- Sync's first real run (`sync-engine.md` § First real run), then the Stage 0 provider probe on two computers.
- Paste into Word: a copied worksheet (tabbed MC options, label lists, header rows, page-number field).
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
- Windows unsigned; updater key only at `~/.tauri/econ-worksheet.key`; film not re-rendered for the rename.

## Last verified (2026-10-09, `develop` after the OCR merges)

- `npm test` 5465, `cargo test` 68, typecheck + build (bundle check) green, lint 40, samples 6.

## Log

- **2026-10-08/09** — Found-folder offer; import + paper language (15 branches); Table distribute; overscroll; import header/footer/title; band rows match Word; table bar; cell align; OCR; import leftovers. 19 branches.
