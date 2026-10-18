# Status

**Update this at the end of every session. Keep it under 80 lines; oldest log lines fall
off the bottom.** It is the first thing a fresh session reads — then
[`CODEMAP.md`](./CODEMAP.md). The long per-feature notes before 2026-10-03 are in
`git show 672ea2b:docs/STATUS.md`; what shipped is in `CHANGELOG.md`.

## Next session starts here

- **v0.8.3 released 2026-10-18: Tables vs Word phases 1–3** (published, `latest`, 9 assets + sigs;
  develop = main, Unreleased empty). `headerRows` (`w:tblHeader`), `vAlign`, 3-grey `shading`; the
  preview breaks tables between rows (`pageNodes:tablePieces`, `bodyEntries`, `PackItem.leadAt`).
  Not tried in real Word or Tauri. Known gap: a table in a keep chain (classroom MC) stays whole on
  screen but Word can still break its rows. Word packs justified lines tighter than the preview.
- **#2 follow-ups laid out for the user 2026-10-18, awaiting answers:** price-floor DWL template
  (skill 25) + negative externality (skill 09; positive too?); wording — DWL zh 效率損失 vs
  無謂損失, symbol DWL vs DL (monopoly templates mix them), 過剩 vs 超額供應, keep 買方/賣方稅負.
- **Now: UX refinement of existing features** (user, 2026-10-12). C9, E7 and recipes parked. `feature/film-v2` (worktree `.claude/worktrees/film-v2`) on GitHub since 2026-10-11, not merged.
- **Shipped in 0.8.0, none tried in the Tauri window before release:** table Same height/width
  (`distributeRows`/`distributeColumns`); no editor overscroll; import brings header/footer/title
  block (§ 12, unreproducible bits listed with Copy); band rows as Word tab stops, masthead
  numbers as fields, clipboard ColumnsNode as tab stops (within 1pt of LibreOffice).
  **Unverified in Word:** clipboard paste, a tab past the last stop, masthead rule/colour.
- **Found-folder offer, shipped in 0.8.0** (`library_found`, `src/sync/foundFolder.ts`): faked shell
  only; run `desktop:dev` with a synced library (picker location, "done" flag across a restart).
- **0.8.0:** file-only **Import from Word or PDF** → review → Save as (`src/import/`,
  `docs/design/paste-import.md`); UI/Paper language settings; multi-file + "Answers from".
  **OCR** (PP-OCRv6, Rust/ORT, DMG +33 MB) proven in the release `.app` on scans + photos.
  Unverified: Intel Mac, macOS 12–13.2, signed build, native open sheet.

## Where we are

- **v0.8.3 released 2026-10-18**: tables like Word (one-click typing, merge/format/copy/paste a range, exact sizes, heading rows repeat, preview splits tables, vAlign, shading). Release workflow green; not tried in Tauri or real Word; Vercel not checked.
- **Sync (F9), shipped in 0.7.0** (`src/sync/`, `sync-engine.md`), visible before any real run (user's call).
- **v0.8.2 released 2026-10-16** (published, `latest`, 9 assets + sigs; closes #2):
  MC options justify (`optionAlign`), whole-paper Justify text (`justifyText`), long MC options fall
  back inline → 2 col → grid (`printedOptionLayout`, `textWidth.ts`), bilingual justify fix, feedback
  screenshot (Tauri untested), tidier diagram templates (vs DSE graph skill). Green before tagging and
  on all 3 Release builds. Checked in real Word, not in Tauri. Vercel not checked.

## Before release (only the user can do these)

- Sync's first real run (`sync-engine.md` § First real run), then the Stage 0 provider probe on two computers.
- Paste into Word: a copied question (tabbed MC options, label lists, header rows), at the document's text size.
- Windows: 0.6.0 shipped without the rename hook test (`RELEASING.md`), user's call; check one install;
  Keychain prompt in a built app; 標楷體 export in Word.
- A real AI key: Save & test, Fill, Re-translate, `npm run eval:translate` (model ids in
  `src/ai/providers.ts` unverified); one try from an HK network without VPN.
- Desktop shell (`npm run desktop:dev`): bank index migrates to per-document files
  (check 題庫 lists every paper); macOS self-rename on a real `/Applications` update;
  Export → PDF multi-page; folder drag; `.json` drop; terms CSV + backup; launch animation,
  real print dialog, paste-a-graph-into-Word once each.

## Waiting on the user's call

- #2 follow-ups: price floor DWL + externality templates; diagram wording (DWL/DL in zh, 過剩, tax burden terms). Table review vs Word (`docs/Tables vs Word.md`): all phases done.
- Paid service (`docs/research/2026-09-paid-product/`): what first; in-app "use a VPN" Gemini
  wording breaks Google's terms — Gemini privacy line may be dropped.
- Versions: a shared rationale note repeats in each version's block of the key. Bank authoring
  proposal (`docs/design/bank-authoring.md`, 3 questions).

## Open threads and known gaps

- Import: text inside a figure's box stays in the crop. (Tables now split across sheets in the preview.)
- **Old releases:** v0.4/0.5 can still export a schema-2 file (student copy shows answers) and
  "Duplicate as editable copy" it; v0.2–0.3 have no read-only guard; none draws revenue areas
  or model answer diagrams (no leak).
- **Never checked:** a real import of our exports into the four other apps; the desktop feedback
  opener; real Word/PMingLiU (LibreOffice + a Ming face agree); the desktop `pack.json` in Tauri.
- Sync: an older and a newer build resolving one provider copy at once can still make a second;
  opening a paper waits out a run in flight; a library with no document at all pauses sync.
  Windows code passes CI but never ran on a real PC or provider.
- Windows unsigned; updater key only at `~/.tauri/econ-worksheet.key`; film not re-rendered for the rename.

## Last verified (2026-10-18, release commit)

- `npm test` 5632, typecheck green, `release-notes.mjs` exit 0. Release workflow green
  (macOS aarch64 + x64, Windows). Draft had all 9 assets + `latest.json`, then published.

## Log

- **2026-10-18** — Released 0.8.3. `main` merged back; Unreleased empty.
- **2026-10-17** — Tables vs Word phases 1–3 (one-click typing, Enter newline, range merge/format/clipboard, exact sizes, heading repeat + preview table splitting, vAlign, shading).
- **2026-10-16** — Released 0.8.2 (closes #2, notice posted). `main` merged back; Unreleased empty.
