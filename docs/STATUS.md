# Status

**Update this at the end of every session. Keep it under 80 lines; oldest log lines fall
off the bottom.** It is the first thing a fresh session reads — then
[`CODEMAP.md`](./CODEMAP.md). The long per-feature notes before 2026-10-03 are in
`git show 672ea2b:docs/STATUS.md`; what shipped is in `CHANGELOG.md`.

## Next session starts here

- **Formatting settings like Justify, 2026-10-23 (proposal only; branch docs/format-settings-proposal, pushed, not merged):** `docs/design/format-settings.md` ranks nine candidates against the Justify template and the real papers. Recommends 1) option layout for all MC in one click (S–M), 2) between-question space on every paper shape (M), 3) keep a question together / start it on a new page (S–M); not line spacing (every reference is ≈ single; only Text size 12 is tighter). Seven decisions for the user in its § 6. Nothing built. GitHub #4 (MC reorder, open) is a bug, being fixed on `fix/issue-4-mc-reorder`.
- **v0.8.4 released 2026-10-22** (GitHub #3 answered): the (1)(2)(3) statements of a combination MC justify like options (`McqQuestion.statementAlign`; test `registry/mcqStatementAlign.test.ts`), and `.paper { overflow-wrap: break-word }` in `globals.css` stops a no-space string running past the page edge (guard `src/test/paperWrap.test.ts`). Chrome-checked (EN+中); not tried in Word or Tauri. Word packs justified lines tighter (not fixable).
- **2026-10-19 (Unreleased, merged on develop):** `.docx` has no keep flags
  (no black ¶ squares, user's call) — hard page breaks where the preview breaks (`pageBreaks.ts`,
  `measurePageStarts.tsx`; samples now run in headless Chrome); B7 examiner marks grid on the
  cover (bilingual 45-question Paper 1 overflows, no cover-height warning); F4 marks on cards (no
  page count; old entries fill on next edit); F5 dashboard searches question text; C11 Diagram
  filter + Sort; 題型 first release (map, links, 題目類型 wording, editor 題庫 tab filter). None
  tried in real Word or Tauri. 題型 next: Fill by 題型 (`docs/design/question-types-ux.md` item 6).
- **Known-gap sweep 2026-10-18 (Unreleased):** tab wrap, import keeps tabs, sync fixes. Untried in Word/Tauri.
- **Tabs vs Word 1–3, 2026-10-18 (Unreleased, `docs/Tabs vs Word.md`):** tab types, Word-rule layout,
  `<w:tab/>`/`<w:tabs>`, ruler + Tab stops panel. No schema bump. Not tried in Word or Tauri.
- **題型 sort board 2026-10-19 (Unreleased, on develop):** one-layout map, sort board, 中文 topic names.
  Not built: items 5, 7 of `question-types-empty-state.md`. Not tried in Tauri.
- **First 題型 on the map, 2026-10-19 (Unreleased, merged on develop):** the empty 題型 map is
  three clickable steps (pick a topic, click questions alike, name them) beside a live preview,
  then a status line with Undo (`FirstPattern.tsx`, `question-types-empty-state.md` § 9).
  Chrome-checked; not tried in Tauri or dark.
- **Now: new features** (user, 2026-10-19). C9, C10, E7 parked. `feature/film-v2` on GitHub since 2026-10-04, not merged.
- **0.8.0, untried in Tauri:** table Same height/width, import header/footer, band rows as tab stops;
  found-folder offer (`src/sync/foundFolder.ts`, faked shell). Import/OCR untried: Intel Mac, macOS 12–13.2.

## Where we are

- **v0.8.3 released 2026-10-18**: tables like Word (one-click typing, merge/format/copy/paste a range, exact sizes, heading rows repeat, preview splits tables, vAlign, shading). Release workflow green; not tried in Tauri or real Word; Vercel not checked.
- **Sync (F9), shipped in 0.7.0** (`src/sync/`, `sync-engine.md`), visible before any real run (user's call).

## Before release (only the user can do these)

- Sync's first real run (`sync-engine.md` § First real run), then the Stage 0 provider probe on two computers.
- Paste into Word: a copied question (tabbed MC options, label lists, header rows), at the document's text size;
  typed tabs and tab stops (leaders as `dotted`/`dashed`/`lined`), and a `.docx` with `<w:tabs>` opened in Word.
- Windows: 0.6.0 shipped without the rename hook test (`RELEASING.md`), user's call; check one install;
  Keychain prompt in a built app; 標楷體 export in Word.
- A real AI key: Save & test, Fill, Re-translate, `npm run eval:translate` (model ids in
  `src/ai/providers.ts` unverified); one try from an HK network without VPN.
- Desktop shell (`npm run desktop:dev`): bank index migrates to per-document files
  (check 題庫 lists every paper); macOS self-rename on a real `/Applications` update;
  Export → PDF multi-page; folder drag; `.json` drop; terms CSV + backup; launch animation,
  real print dialog, paste-a-graph-into-Word once each.

## Waiting on the user's call

- Table review vs Word (`docs/Tables vs Word.md`): all phases done.
- Paid service (`docs/research/2026-09-paid-product/`): what first; in-app "use a VPN" Gemini
  wording breaks Google's terms — Gemini privacy line may be dropped.
- Versions: a shared rationale note repeats in each version's block of the key. Bank authoring
  proposal (`docs/design/bank-authoring.md`, 3 questions).

## Open threads and known gaps

- Import: a legend written as a sentence beside a PDF graph now comes in as text; tab stops are not
  imported. A left/centre stop exactly at the margin differs from LibreOffice (Word unknown).
- **Old releases:** v0.4/0.5 can still export a schema-2 file (student copy shows answers) and
  "Duplicate as editable copy" it; v0.2–0.3 have no read-only guard; none draws revenue areas
  or model answer diagrams (no leak).
- **Never checked:** a real import of our exports into the four other apps; the desktop feedback
  opener; real Word/PMingLiU (LibreOffice + a Ming face agree); the desktop `pack.json` in Tauri.
- Sync: an older build that receives this build's copy first can still make its own extra copy.
  Windows code passes CI but never ran on a real PC or provider.
- Windows unsigned; updater key only at `~/.tauri/econ-worksheet.key`; film not re-rendered for the rename.

## Last verified (2026-10-19, develop after the five merges)

- `npm test` 5770, build + bundle check green, samples 27/27 with 0 keep flags, typecheck green, lint at baseline (40); `cover-verify` green; `lq-verify` fails
  only the pitch check, as base does on Linux (no CJK font). On Linux the harnesses need Chrome at
  `/opt/google/chrome/chrome` (Playwright's `channel: 'chrome'`).

## Log
- **2026-10-23** — formatting-settings proposal (k-0178, the user's ask "settings similar to justify"): research only.
- **2026-10-19** — the first 題型 is made on the 題型 map itself (user's ask).
- **2026-10-19** — 題型 empty state: research (no suggestion boxes), then the sort board and the map without the cliff.
