# Status

**Update this at the end of every session. Keep it under 80 lines; oldest log lines fall
off the bottom.** It is the first thing a fresh session reads — then
[`CODEMAP.md`](./CODEMAP.md). The long per-feature notes before 2026-10-03 are in
`git show 672ea2b:docs/STATUS.md`; what shipped is in `CHANGELOG.md`.

## Where we are

- **2026-10-05: cross-device sync initiative (F9), planned, not built.** Teachers run the desktop
  app on a work and a home computer. Chosen: the library lives in a folder the teacher picks in
  their own cloud drive (OneDrive default). Plan `docs/design/library-folder.md` (stages 0–6,
  ~4–6 weeks); survey `docs/research/2026-10-sync-survey.md`; Drive API design shelved
  (`docs/design/drive-sync.md`, cannot mix with folder mode).
- **v0.6.0 released 2026-10-04** (`main` = `develop` + version bump; web deployed). Ships the 題庫
  question bank, Marking scheme view and layouts, Translation terms, 中文 interface, Graphs
  圖表庫, diagram answer layer, the Econ Studio rename. Next work goes on `develop` as usual.
  Website shots: `node scripts/demo.mjs --shots` → 14 WebP at 1920 in `demo-media/screenshots/`.
- **2026-10-03: every known gap fixed** (user's ask) on `fix/gaps-*` branches, all merged. Schema
  rule now "bump only when used": `writtenSchemaVersion` writes 2 for diagram `answer`,
  `answerKeyLayout`, section `answerCount`, essay answer/scheme, `importQuota` derive; else 1.
  Frozen `v2-published.json`, `graph-v2.json`, `v2-optional-sections.json`. Index rows carry
  `indexRev`; rows v0.5.0 wrote get their `kind` repaired from the document.
  The bilingual empty-side prompt floats (no page space; `InlineEditable` `floating`).
- **2026-10-03 (second sweep):** the rest of the open gaps, on `fix/gaps2-*`, all merged: preview
  pages break where Word does (keep runs, glued tails); a covered paper's page-1 header is the first
  body sheet; no blank header rows in `.docx`; canvas toolbar one row (⋯ clipboard menu); Q_A a
  span (`last` anchor, schema 2); Shift-a-copy arrows follow; CPF label clears the axis; COVERAGE
  0 partial (7 templates, `curvePath` reads curves as drawn); CS/PS reach the price axis; 題庫
  "Adding to" picker + "Already in this paper", text→topic suggestions (`termTopics.ts`), synced
  undo, second-tab tag guard, coalesced publish, virtualised rail, desktop `pack.json`+journal.
  題庫 "New Paper 2" makes the full booklet; the tray has no separate "New worksheet" button;
  text-derived topic keys are underlined with dots (user's calls).
- `cover-verify` / `lq-verify` take `--language` (`scripts/soffice.mjs` gives LibreOffice CJK fonts).

## Before release (only the user can do these)

- Windows: 0.6.0 shipped without the rename hook test (`RELEASING.md`), user's call; check one install;
  Keychain prompt in a built app; 標楷體 export in Word.
- A real AI key: Save & test, Fill, Re-translate, `npm run eval:translate` (model ids in
  `src/ai/providers.ts` unverified); one try from an HK network without VPN.
- Desktop shell (`npm run desktop:dev`): first launch migrates the bank index to per-document
  files (`worksheets/library/docs/`; check 題庫 lists every paper); macOS self-rename on a real
  `/Applications` update; Export → PDF multi-page; folder drag; `.json` drop; Translation terms
  CSV + backup; launch animation once per cold start; real print dialog; paste a graph into Word.

## Waiting on the user's call

- Sync plan's open questions (`docs/design/library-folder.md` § 8) and Stage 0 (provider
  conflict-copy names, by hand on real machines).
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

## Last verified (2026-10-05, `develop` 15f0ad4)

- `npm test` 3976 passed; typecheck clean; lint 40 (one under the 41 baseline).

## Log

- **2026-10-05** — Housekeeping (3 Opus worktree branches, merged): frozen 題庫 fixtures emitted
  at tag v0.6.0 (`src/test/corpus/bank-v0.6.0-*.json`, guards in backwardCompat/legacyIndex/
  `bankCorpus.test.ts`); min-wage template label lifted (demo workaround removed); flaky
  rationale test pinned to a fixed id. IDEAS reordered: classes findability, then D1.
  Then sync: Drive API design (shelved), library-folder plan, sync survey (Opus agents, merged).
- **2026-10-04** — Released v0.6.0 (Windows rename test skipped, user's call). Site screenshot
  harness fixed + 6 new shots (Opus worktree, merged) for the DSE_Mentor page.
