# Status

**Update this at the end of every session. Keep it under 80 lines; oldest log lines fall
off the bottom.** It is the first thing a fresh session reads — then
[`CODEMAP.md`](./CODEMAP.md). The long per-feature notes before 2026-10-03 are in
`git show 672ea2b:docs/STATUS.md`; what shipped is in `CHANGELOG.md`.

## Next session starts here

- **Found-folder offer merged (2026-10-08, unreleased):** a desktop launch with no folder set looks for
  an existing `Econ Studio` library in the cloud folders (`library_found`, `src/sync/foundFolder.ts`)
  and offers it once; the picker opens at the library's parent. The empty start screen points to
  Settings → Storage location. Only checked with a faked shell: run `desktop:dev` on a machine with a
  synced library (picker location, the "done" flag surviving a restart).
- `feature/film-v2` (144 commits, worktree `.claude/worktrees/film-v2`) is **only on this Mac**, not on GitHub.

## Where we are

- **Cross-device sync (F9), shipped in 0.7.0.** Local primary + folder mirror (`src/sync/`,
  `docs/design/sync-engine.md`, `docs/design/library-folder.md`); Settings → Storage location, Needs
  attention, Clear detaches, no missing-folder screen. Shipped visible before any real run (user's call).
- **2026-10-05: notices float** bottom-right via `notify()` (`src/store/notices.ts`), follow-ups merged.
- **v0.7.0 released 2026-10-08** (published, `latest`; Vercel deploy not checked). Ships Storage location sync
  (desktop), floating notices, the pre-release fixes. v0.6.0 (2026-10-04) shipped 題庫, Marking
  scheme, Translation terms, 中文 interface, Graphs 圖表庫, the Econ Studio rename.
  Website shots: `node scripts/demo.mjs --shots` → 14 WebP at 1920 in `demo-media/screenshots/`.

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

## Last verified (2026-10-08, `develop` after found-folder merge)

- `npm test` 5079, `cargo test` 51; found-folder branch: build, samples 6, lint 40. Before it: samples 6 passed; build, typecheck, cover/lq-verify (en + zh) green;
  lint 40; CI green incl. `rust (windows-latest)`.

## Log

- **2026-10-08** — Found-folder offer on a new computer (`feature/found-folder`, 1 Opus agent), merged.
- **2026-10-08** — Pre-release check: 4 Opus reviewers, 6 fix branches merged (`fix/sync-safety`,
  `fix/library-rust`, `fix/notices-ui`, `fix/diagram-gaps`, `fix/answer-gaps`, `fix/release-tooling`).
  Cloud folder detection in setup. Demo: `demo-media/storage-location/` (zh, subtitled, simulated shell).
- **2026-10-07** — Sync interface (`feature/sync-ui`): controller (`librarySync.ts`: choose/stop/sync
  now in one queue, runs while the folder is away), `syncView.ts`, `syncNotices.ts`, Settings → Storage
  location (screenshots via a faked shell + dev-only `__econSyncView`), Clear detaches. Not run in Tauri.
- **2026-10-06** — Sync base persists, hash cache, folder source, scheduler + open-editor guard;
  autosave keeps an edit typed mid-save. 4 Opus worktree branches, merged.
