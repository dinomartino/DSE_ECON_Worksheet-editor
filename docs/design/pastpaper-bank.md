# Past paper bank 歷屆試題庫 (k-0443)

Status: step B built, 2026-11-16, on `develop` (not released). Plan: k-0441 `PLAN.md` § 15
(kp-econ-bank session), approved by the user with the data in a separate public repo,
questions and official answers only (u-58jj). The user then asked for it to be **a bank of
its own, not mixed into the 題庫** (u-xpin).

## What it is

A second question bank beside the teacher's own: HKCEE, HKALE and HKDSE MC questions with
answers, by topic, English and 中文 in one record. Read-only. It is not stored in the
teacher's documents and never counts as one; questions taken from it are ordinary copies.

## Where it sits

- **Start screen → Library**: a row of its own, *Past paper bank 歷屆試題庫*, under *Question
  bank 題庫*. It opens its own screen (view `pastpapers`): topics down the left, the topic's
  questions as they print (Student version, an Answer chip), search, Exam chips (HKCEE /
  HKALE / HKDSE), Years, the paper language (EN / 中文), and a tray of picks: Add to → New
  worksheet / New Paper 1 / one of your papers, or Copy to my question bank.
- **Editor → 題庫 tab**: a switch at its top, *My bank* / *Past papers*. Past papers lists a
  topic's questions with Insert (after the insert anchor; one ⌘Z; the review bar) and
  marks those already in the paper. The switch is not drawn when the bank is off.

The user's "the top part" was read as these two tops: the Library's list of banks, and the
top of the 題庫 tab. A fourth sidebar tab was the alternative (the 400 px sidebar holds three).

## Data, and the switches

Static files from one address (`src/pastpapers/config.ts:BUILT_IN_SOURCE`):
`manifest.json` (the list) and `topics/<id>.json` (one editor `kind: 'bank'` document per
topic). Read on demand: the list when the bank is opened, a topic when it is opened.

- Kept in IndexedDB `econ-pastpaper-bank` (web and desktop), not in the ~5 MB of document
  storage and not in backups. A topic is read from there while its `sha256` matches the
  list's; the list is always asked for fresh, and the kept copy is used offline.
- Off for everyone at their next opening: `"enabled": false` in `manifest.json` (it also
  drops every kept topic of that source). Gone from a build: `BUILT_IN_SOURCE = ''`.
  Per computer: Settings → Past paper bank → Built-in / Off / Another address (https; http
  only on localhost; or a path on the app's origin). Remove downloads is there too.
- The desktop app needs no permission for it: the webview's own fetch, as the AI requests
  (CSP null; no Tauri plugin). The download is a GET with no credentials and no body.
- **The public data repo does not exist yet** (the user's go is pending). Until then the
  built-in source answers "not found" and the screen says the bank can't be reached.

## Copies

Every way out copies (`copyQuestion`): fresh ids, `lineage.rootId` kept (`kp:CE2011/P2/Q8`),
so "Already in this paper" and the teacher's bank see two copies as one question. A shared
stimulus goes in once, in front of its questions, with `span` = how many came along; its
range is derived by the paper, as every stimulus's is. Copy to my question bank copies
questions only (a bank holds questions), and says when a passage stayed behind.

No change to the stored document shape: a copy is an ordinary MCQ (and stimulus).

## What the editor needs from the export

The loader is tolerant (unknown fields ignored, a bad entry drops only itself, a question
of a type this build does not know is left out and counted), so the export may change.
What it reads:

1. `manifest.json`: `topics[]` with `id` and `file` (relative, inside the source). Optional:
   `title {en, zh}`, `syllabusOrder`, `questions`, `bytes`, `sha256` (hex of the file's UTF-8
   bytes), `enabled`, `questions` total, `format: "kp-editor-pack"`.
2. Each topic file opens in the editor's loader (`migrate`) as a document.
3. Per question: a tag `CE2011/P2/Q8` (`(CE|AL|DSE)(year|SP|PP)/P<n>/Q<n>`) for the filters and
   the printed number; `provenance {en, zh}` for the source line; a stable `lineage.rootId`.
4. A shared stimulus: a `stimulus` layout element directly before its questions in `flow`.
   **Requested change:** export its lead sentence as the stimulus's `prefix`/`suffix` without
   the numbers (and `span`), since the editor prints "Questions N and M" itself. Until then the
   loader lifts it (`src/pastpapers/pack.ts:liftStimulusLead`) only when both languages name
   exactly the questions that follow (23 of the trial export's 26 stimuli); the other 3 print
   their sentence as exported, beside the editor's.
5. New question types (the 4-diagram-option MCQ): either an `mcq` the current build reads, or
   a new `type`, which older builds leave out and count ("needs a newer version").

## Not built (step C)

Search across topics not downloaded yet (needs a small index in the list; today "Every
topic" downloads the rest once, about 34 MB, with the teacher's go), size warnings for the
web build's 5 MB per worksheet, a filter by paper, the stimulus for questions copied into a
bank.
