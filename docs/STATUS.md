# Status

**Update this at the end of every session. Keep it under 80 lines; oldest log lines fall
off the bottom.** It is the first thing a fresh session reads — then
[`CODEMAP.md`](./CODEMAP.md). The long per-feature notes before 2026-10-03 are in
`git show 672ea2b:docs/STATUS.md`; what shipped is in `CHANGELOG.md`.

## Where we are

- **v0.5.0 released 2026-09-28.** `develop` holds everything since (unreleased, ~350 commits):
  題庫 question bank (+ ✦ AI, topics per part, 題型), Marking scheme view and layouts (Classic,
  HKEAA, Suggested answers, Detailed table), Translation terms, 中文 interface, Graphs 圖表庫,
  diagram answer layer, Econ Studio rename, launch animation, UI polish rounds. Merge to `main`
  only on the user's word (`RELEASING.md`).
- **2026-10-03: every known gap fixed** (user's ask) on `fix/gaps-*` branches, all merged. Schema
  rule now "bump only when used": `writtenSchemaVersion` writes 2 for diagram `answer`,
  `answerKeyLayout`, section `answerCount`, essay answer/scheme, `importQuota` derive; else 1.
  Frozen `v2-published.json`, `graph-v2.json`, `v2-optional-sections.json`. Index rows carry
  `indexRev`; rows v0.5.0 wrote get their `kind` repaired from the document.
  The bilingual empty-side prompt floats (no page space; `InlineEditable` `floating`).
- `scripts/soffice.mjs` gives LibreOffice the CJK fonts (zh/bilingual Word legs used to drop
  Chinese); `cover-verify` / `lq-verify` take `--language`; `shot.mjs --seed [--port=]` works.

## Before release (only the user can do these)

- Windows: the rename hook (`src-tauri/windows/hooks.nsh`) test in `RELEASING.md` gates v0.6.0;
  Keychain prompt in a built app; 標楷體 export in Word.
- A real AI key: Save & test, Fill, Re-translate, `npm run eval:translate` (model ids in
  `src/ai/providers.ts` unverified); one try from an HK network without VPN.
- Desktop shell (`npm run desktop:dev`): first launch migrates the bank index to per-document
  files (`worksheets/library/docs/`; check 題庫 lists every paper); macOS self-rename on a real
  `/Applications` update; Export → PDF multi-page; folder drag; `.json` drop; Translation terms
  CSV + backup; launch animation once per cold start; real print dialog; paste a graph into Word.
- **At release:** emit frozen bank fixtures from the release commit (list in
  `docs/design/question-library.md`); bump `Cargo.lock` on `develop` after.

## Waiting on the user's call

- Paid service (`docs/research/2026-09-paid-product/`): what first; the in-app "use a VPN" Gemini
  wording breaks Google's terms. Gemini privacy line may be dropped.
- "Include teacher text" also lets Fill missing translate image alt text (`roleAllowed`); the badge
  never counts it. Intended?
- Word's teacher header says "Teacher Version" every page, preview/PDF only under the title.
  Versions: page 1 shows the version twice; a shared rationale repeats per version in the key.
- Bank authoring proposal (`docs/design/bank-authoring.md`, 3 questions).

## Open threads and known gaps

- **Old releases:** v0.4/0.5 can still export a schema-2 file (student copy shows answers) and
  "Duplicate as editable copy" it; v0.2–0.3 have no read-only guard. They also don't draw revenue
  areas or model answer diagrams (no leak).
- **Never checked:** a real import of our exports into the four other apps; graph answer space and
  model answer diagrams in Word; print-PDF of shaded areas; HKEAA Chinese labels and EC wording;
  the desktop feedback opener; curves stopping short of the y-axis on a CS/PS strip; bilingual
  `.docx` page breaks with real PMingLiU.
- Diagrams: canvas toolbar still wraps at 1440px; import-quota Q_A label is free text; a "Shift a
  copy" arrow stays put when its curve moves; dragging B on the concave PPF can push the CPF label
  onto the y-axis; 9 partial rows in `docs/Diagram_Requirements/COVERAGE.md`.
- Bank: ⌘Z after a synced tag/part edit undoes the open copy only; second-tab tag sync (S4),
  publish coalescing (S8), virtualised rail, C8 target picker, ✦ Suggest topics; desktop index
  load reads one file per document (unmeasured at scale).
- A question taller than the rest of sheet 1 starts on sheet 2 (Word: page 1).
- Film still says Econ Worksheet (`scripts/film/timeline.mjs`). Windows builds unsigned. The
  updater key lives only at `~/.tauri/econ-worksheet.key`. `scripts/*.test.ts` are hand-run.

## Last verified (2026-10-03, `develop` a452911)

- `npm test` 3850 passed; typecheck clean; lint 41 (baseline); `npm run build` green (postbuild
  bundle check); `npm run samples` exports.
- `lq-verify` and `cover-verify` pass in en, bilingual and zh with Chinese rendering in Word;
  bilingual Paper 2 cover one page in all three backends (looked at the contact sheet).

## Log

- **2026-10-03** — Gap sweep: 8 Opus worktree branches (paused once, resumed) + 5 follow-ups
  (cover fit + CJK harness, schema audit vs real v0.5.0 code, section target stays 1, index
  `kind` repair, prompt space). All merged; nothing pushed.
- **2026-10-02** — Marking scheme view + layouts, Translation terms, 中文 interface, Graphs,
  diagram answer layer, home polish.
