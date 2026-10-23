# Status

**Update this at the end of every session. Keep it under 80 lines; oldest log lines fall
off the bottom.** It is the first thing a fresh session reads — then
[`CODEMAP.md`](./CODEMAP.md). The long per-feature notes before 2026-10-03 are in
`git show 672ea2b:docs/STATUS.md`; what shipped is in `CHANGELOG.md`.

## Next session starts here

- **Worktrees, 2026-10-23 (k-0187):** never switch branches in the main checkout; every session (releases too) works in its own `.claude/worktrees/<name>` cut from `origin/develop` (or `origin/main`) and pushes `HEAD:develop` from there (`AGENTS.md` § Branches, `RELEASING.md`, `docs/RECIPES.md` § Cut a release).
- **v0.8.5 released 2026-10-23 (k-0186):** GitHub #4 reorder fix, desktop drags (k-0182), anonymised copy (k-0180), option layout for all MC (k-0178 #1). Release workflow green; all 9 assets and `latest.json` (6 platforms, signed) checked; `releases/latest/download/latest.json` serves 0.8.5. #4 answered in 中文 (it auto-closed when a commit naming it reached `main`). **Web deploy unchecked:** the logged-in Vercel account (`vercel project ls`, team tinos-projects) has no project for this repo, and GitHub has no deployments. Still not tried in the Tauri app or on Windows.
- **Space between questions on every paper shape, 2026-10-23 (k-0178 #2; on `develop`, not released):** Setup → Page → Between questions and a question's Space above (now in the structured panel too) work on a classroom worksheet, an LQ worksheet, a booklet and a Paper 1. A number counts straight under a question of the same type (an MC under a structured question, or anything under a heading or note, keeps one line; the panel and the Setup hint say so); the default stays one line off a Paper 1, so no saved paper moves. `src/render/questionGap.ts`, `BetweenQuestionsField.tsx`, `SpaceAboveField.tsx`; no schema change. **A leftover `gapBefore` / `examGapLines` on a paper that stopped being a Paper 1 (or a question copied from one) now counts.** Proof: the 0.8.4 rule frozen beside the new one in `questionGap.test.ts`; 22 fixtures × 6 modes hashed before and after (no difference); the 32 old samples exported on the old and new build compare equal (6 differ only by the version shuffle's random ids, as old vs old does); `scripts/question-gap-verify.mjs` (Chrome, EN + 中, 62 checks, a real pointer drag); five `question-gap/` samples rendered in LibreOffice. **Not tried in real Word, on iPad or in Tauri:** the user opens `question-gap/gap-3-lines-en.docx` (beside `gap-default-1-line-en.docx`) and `gap-booklet-3-lines-en.docx`. Next, only on the user's word: #3 keep a question together (`docs/design/format-settings.md` § 6, § 9); line spacing waits for the reporter's answer about 12 pt.
- **Anonymised copy in Send feedback, 2026-10-23 (k-0180, merged on develop):** Attach an anonymised copy scrambles the open document on the device (`src/feedback/anonymise.ts`, deny by default: only `KEPT_KEYS` strings survive; pictures → noise PNGs of the same pixel size), previews it page by page (`AnonymisedCopyPreview.tsx`), saves exactly that text as `report-<date>.worksheet.json`; the issue body names the file to drag in. Tests `src/feedback/anonymise.test.ts`; Chrome harness `node scripts/anon-verify.mjs` (9 docs incl. the gitignored 2021 paper and the hand-testing mix × EN/EN+中, all pass: same sheets in editor, preview and saved file, same `.docx`). Not tried in Tauri (Show file → `revealFile`) or on iPad touch. **Found, not fixed:** a text empty in the shown language (EN mode, 中文-only stem) gets an "Add English" prompt line in the editor but no line on the measure-only page, so `.docx` page breaks (and this preview) can differ from the editor (`test-fixtures/manual/mixed-for-anonymiser.json` in EN: Q5 on page 1 vs 2).
- **Desktop drags, 2026-10-23 (k-0182, released in 0.8.5):** in the Tauri app the outline, page-grip and thumbnail drags did nothing (↑/↓ worked) because the window's `dragDropEnabled` was on: `tauri-runtime-wry` answers every native drag, so wry's macOS view and WebView2 never gave the page `dragover`/`drop`. Now off in `src-tauri/tauri.conf.json` (guard: `src/test/desktopDragDrop.test.ts`); a dropped file is the page's own `drop` (start screen, feedback, import review) and `src/platform/fileDropGuard.ts` stops a stray file navigating the webview. Real-mouse checks in Chrome, dev and the production export: `scripts/drag-verify.mjs`. **Not tried in the Tauri app or on Windows** (checklist: `test-fixtures/manual/README.md`). `FeedbackDialog` now takes drops as the page's own `drop` only (k-0180); `listenForFileDrops` · `subscribeToFileDrops` · `readDroppedFile` have no callers left but their tests: remove when convenient. Dragging a thumbnail of a page that no manual break opens merges its questions into the page before (as in Chrome before; untouched).
- **GitHub #4, 2026-10-23 (released in 0.8.5, answered on GitHub):** nothing could follow the last question of a page ended by a break: the outline's ↑/↓ (`moveQuestion`) reordered `questions` only, so the break filed under that question travelled with it; outline rows only took drops *before*. Now `moveQuestion` moves through the flow and rows drop on the pointer's half (`dropEdge`). Test: `store/reorderAcrossPageBreak.test.ts`. Chrome-checked (↑, drags, `.docx`); not tried on iPad touch or Tauri.
- **Option layout for all MC questions, 2026-10-23 (k-0178 #1, released in 0.8.5):** Document setup → Worksheet tab, four buttons (Fit each question · All stacked · All in a row · All 2 columns) set every MC question's own `optionLayout` in one undo step, with a count and an Undo notice (`src/registry/mcqLayouts.ts`, `OptionLayoutField.tsx`, `optionLayoutAction.ts`). No schema change. Proof: unit tests over every surface, `scripts/option-layout-verify.mjs` (Chrome, EN + 中), samples `option-layout/` rendered in LibreOffice; **not tried in real Word, on iPad or in Tauri** (the user opens the `option-layout/` samples).
- **v0.8.4 released 2026-10-22** (GitHub #3 answered): the (1)(2)(3) statements of a combination MC justify like options (`McqQuestion.statementAlign`; test `registry/mcqStatementAlign.test.ts`), and `.paper { overflow-wrap: break-word }` in `globals.css` stops a no-space string running past the page edge (guard `src/test/paperWrap.test.ts`). Chrome-checked (EN+中); not tried in Word or Tauri. Word packs justified lines tighter (not fixable).
- **2026-10-19 (Unreleased, merged on develop):** `.docx` has no keep flags
  (no black ¶ squares, user's call) — hard page breaks where the preview breaks (`pageBreaks.ts`,
  `measurePageStarts.tsx`; samples now run in headless Chrome); B7 examiner marks grid on the
  cover (bilingual 45-question Paper 1 overflows, no cover-height warning); F4 marks on cards (no
  page count; old entries fill on next edit); F5 dashboard searches question text; C11 Diagram
  filter + Sort; 題型 first release (map, links, 題目類型 wording, editor 題庫 tab filter). None
  tried in real Word or Tauri. 題型 next: Fill by 題型 (`docs/design/question-types-ux.md` item 6).
- **Tabs vs Word 1–3, 2026-10-18 (Unreleased, `docs/Tabs vs Word.md`):** tab types, Word-rule layout,
  `<w:tab/>`/`<w:tabs>`, ruler + Tab stops panel. No schema bump. Not tried in Word or Tauri.
- **題型 sort board 2026-10-19 (Unreleased, on develop):** one-layout map, sort board, 中文 topic names.
  Not built: items 5, 7 of `question-types-empty-state.md`. Not tried in Tauri.
- **First 題型 on the map, 2026-10-19 (Unreleased, merged on develop):** the empty 題型 map is three clickable steps (pick a topic, click questions alike, name them) beside a live preview,
  then a status line with Undo (`FirstPattern.tsx`, `question-types-empty-state.md` § 9). Chrome-checked; not tried in Tauri or dark.
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

## Last verified (2026-10-23, `feature/question-gap-all` with 0.8.5 `develop` merged in)

- `npm test` 6112, build + bundle check, typecheck green, lint at baseline (40); `npm run samples` 37/37 (student files: no answers, 0 keep flags); `scripts/question-gap-verify.mjs` 62/62 and `option-layout-verify` in Chrome (EN + 中); `drag-verify` passed on its second run (the first failed one start-screen drop-hint check, not repeated; develop's server passes). `cover-verify` and `lq-verify` print the same numbers as develop's server, `lq-verify` failing only the pitch check on Linux (no CJK font), as before. Linux harnesses need Chrome at `/opt/google/chrome/chrome`.

## Log
- **2026-10-23** — merged on develop: space between questions on every paper shape (k-0178 #2); released in 0.8.5: option layout for all MC (k-0178 #1), the anonymised copy (k-0180), desktop drags (k-0182) and GitHub #4.
