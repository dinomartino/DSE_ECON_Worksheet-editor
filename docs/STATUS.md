# Status

**Update this at the end of every session. Keep it under 80 lines; oldest log lines fall
off the bottom.** It is the first thing a fresh session reads — then
[`CODEMAP.md`](./CODEMAP.md). The long per-feature notes before 2026-10-03 are in
`git show 672ea2b:docs/STATUS.md`; what shipped is in `CHANGELOG.md`.

## Next session starts here

- **v0.8.3 released 2026-10-18** (develop = main before the tabs work). Word packs justified
  lines tighter than the page (Word's own spacing, not fixable here).
- **Known-gap sweep 2026-10-18 (Unreleased, merged on develop):** MC table kept whole in the
  `.docx` (every row `keepNext`, LibreOffice-checked); tabbed "(n marks)" paragraphs wrap as
  LibreOffice (`carriesTab`) and the page text column now sits exactly on the margins (`-mx-1`,
  changes on-page wrapping of every document); import keeps typed tabs (`tabbed` lines, scorecard
  unchanged, stops not imported); vector-PDF captions beside a graph stay text; sync: opening
  interrupts a run between documents, the twin provider copy from an older build is merged, a
  truly emptied library refills (Trash too); picture `pPr` in schema order; `scripts/soffice.mjs`
  falls back to `soffice` on PATH. None tried in real Word, Tauri or a real provider.
- **#2 follow-ups (Unreleased):** floor DWL + negative externality templates, DL → DWL. User kept
  效率損失, 過剩, 買方/賣方稅負. Positive externality not built (not asked).
- **Tabs vs Word, phases 1–3 built 2026-10-18 (Unreleased, `docs/Tabs vs Word.md`):** Tab types a
  tab in text paragraphs, a Word-rule page layout (`tabLayout.ts`), `<w:tab/>`/`<w:tabs>`/clipboard,
  ruler + Tab stops panel + quick layouts (`TabRuler.tsx`). No schema bump. Not tried in real Word
  or Tauri. zh default 480 left as is (the one zh-HK reference file uses 720).
- **Now: UX refinement of existing features** (user, 2026-10-12). C9, E7 and recipes parked. `feature/film-v2` (worktree `.claude/worktrees/film-v2`) on GitHub since 2026-10-11, not merged.
- **0.8.0, untried in Tauri:** table Same height/width, import header/footer, band rows as tab stops;
  found-folder offer (`src/sync/foundFolder.ts`, faked shell only). Unverified in Word: clipboard paste.
- **0.8.0 Import/OCR** unverified: Intel Mac, macOS 12–13.2, signed build, native open sheet.

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

## Last verified (2026-10-18, gap sweep on develop)

- `npm test` 5680, typecheck green, lint at baseline (40); `cover-verify` green; `lq-verify` fails
  only the pitch check, as base does on Linux (no CJK font). On Linux the harnesses need Chrome at
  `/opt/google/chrome/chrome` (Playwright's `channel: 'chrome'`).

## Log

- **2026-10-19** — 題型 UX research + redesign proposal (`docs/design/question-types-ux.md`, screenshots, 4 questions for the user), branch `research/question-types-ux`, no code.
- **2026-10-18** — ⌘Z while typing on the page: document undo, typing grouped per run (`TYPING_PAUSE_MS`), caret follows the change. Chrome-checked; not tried in Tauri/Safari.
