# Question studio — AI that writes new questions (k-0499)

Status, 2026-11-24: **all three packages are on `develop`, a trial: nothing is visible to
teachers** until the app is opened once with `?studio=trial`. The engine, the page, the
AI-made label and the trial kit are built; no real model has run, so the user's trial (30
invented briefs and about 20 requests of their own, on their key) is what is next. The
proposal is `Outbox/k-0495/AI-QUESTION-GEN-PROPOSAL.md` (not in the repo); the older design it
builds on is `docs/design/ai-pattern-questions.md`.

## What it is

A teacher picks a syllabus key point (optionally bank questions to write like), how many
(1, 3 or 5), a level and the languages. The studio writes new **multiple-choice** questions,
checks them, and shows them as **drafts**. Nothing reaches a paper until the teacher presses
Add. Release 1 is MC only (the published bank is MC only: no DRQs, no schemes).

## Decisions (user, 2026-11-23, u-x79v, on the proposal's eight)

| # | Decision | Where it shows |
|---|---|---|
| 1 | **1c:** the AI may be sent a picked bank question's own words; the user carries the licence risk. The near-copy check stays, and the form says what is sent. | `brief.ts` (`examplePayload`, `sentSummary`), `nearCopy.ts` |
| 2 | **2c:** build the Question studio page directly (Library → Question studio: source / drafts / checks / tray). A "✦ Write like this" entry on bank questions opens it with that question as the source. | package 2 |
| 3 | Release 1 is MC only. | `types.ts` (`StudioRequest`), `insert.ts` |
| 4 | Always review before insert: drafts wait; nothing lands until Add. | `insert.ts:studioBuilds` is the only way in |
| 5 | AI-made label, screen only, until the teacher presses Checked. | `Question.aiMade`, `AiMadeNote.tsx`, `AiMadeChip.tsx` (§ The AI-made label) |
| 6 | **6a:** the blind solve is the same provider, a fresh request. | `run.ts:writeDrafts`, `prompt.ts:buildSolveRequest` |
| 7 | **7a:** paused on develop until a trial (about 20 of the user's requests plus 30 invented briefs on their key). | `trial.ts` (the gate), `trialBriefs.ts`, `trialLog.ts`, `trialScore.ts` (§ The trial kit) |
| 8 | Gemini for the trial; it needs a VPN in Hong Kong, so the UI's error says so. | package 2 |

## What is sent

One JSON payload per writing request, built on the computer by `brief.ts:briefPayload`:
the key point and its points (EN + 中文), that key point's **NOT-required** limits, the EDB
term lines for the Chinese side, the **picked examples whole** (stem, statements, options,
key letter; a picture is noted as not shown), the Change line as `teacherNote`, and the
make instructions (count, level, shape, where each key should sit).

It never holds an example's label (year, paper, number), a document title, a name, or
anything from the paper the teacher is writing for: `brief.test.ts` fails if a key outside
`PAYLOAD_KEYS` appears or a label reaches the request. `brief.ts:sentSummary` is what the
form lists under "Sends this to {provider}", from the same brief. With no example picked
nothing from the bank is sent. The blind-solve request carries only the questions' text:
no key, no explanation, no brief.

The HKEAA licence for schools (Licence 1, revised August 2026, § E) restricts use of its
papers with AI tools. The user chose to accept that risk for bank questions they pick
(decision 1; the proposal's brief-only default was the careful alternative). This is not
legal advice. (The coverage check already sends full question text too: the user's call, u-4zuy.)
The text of every example and the Change line are **data** to the model: the system prompt
says so, and only `teacherNote` is the teacher's own request.

## The engine (`src/questionStudio/`)

Pure over injected deps, like `src/generate/run.ts`: no React, no store, no Settings. It
never rejects, honours the signal, and never touches a paper.

One click is at most **five requests**: write; one rewrite of drafts that failed a hard
local check; the blind solve of what is left; one rewrite of drafts the solver disagreed
with; its solve. A rewrite stands only if it passes the hard checks, else the original stays,
flagged. Stop keeps what is done (drafts with the key unchecked); Stop during the first
write keeps nothing.

Checks (all local and free except the solve; each is one `CheckRow` with findings that are
**codes**, whose words live in the page's message catalogue in English and 中文):

| Check | What | Finding ids |
|---|---|---|
| `shape` (hard) | 4 options, key 0–3, no empty or duplicate option, statements 0 or 2–4, combination options really combine them | `shape.*` |
| `key` | a fresh solve, no key shown; disagree → rewritten once → look; skipped if the solve failed | `key.differs`, `key.ambiguous` |
| `numbers` | every number the same in English and 中文, units read out (5 billion = 50億) | `numbers.differ` |
| `terms` | the EDB glossary on the 中文 (deny forms fixed in place) | `terms.note` |
| `syllabus` | NOT-required terms in the draft (`guard.ts:LIMITED_TERMS`) | `syllabus.limited` |
| `lint` | key longest, uneven options, "all of the above", unbolded negative stem, wrong shape asked; batch: one key letter too often | `lint.*` |
| `copy` (hard) | near-copy against the bank, the teacher's own questions, the open paper, the examples and the other drafts | `copy.close` |

A draft is `failed` when a hard check fails (never offered, never built), `look` when a
check has something to read or its key was never solved, `ok` otherwise. The labels
"AI-made, not checked" are the page's, not a status.

### Near-copy (`nearCopy.ts`)

Words are cut into overlapping runs: 6 English words, 8 中文 characters, every number read as
`#` (so "the same question with new numbers" matches). The score is the share of the draft's
**distinctive** runs found in one existing question; runs found in more than
`boilerplateLimit` questions (8 of 1,759) are stock phrasing and do not count. Too close =
score ≥ 30% (`NEAR_COPY_LIMIT`), or a run copied word for word (24 words / 36 characters),
or the whole draft inside one question.

Measured on the published by-topic bank (1,759 questions; each against its closest
neighbour, statistics only, no text kept): median share 7%, 90th percentile 31%, 95th
42%; about 10% of the bank's own questions share more than 30% with a neighbour, because
HKEAA repeats frames across years. So the limit is a starting point: the trial's near-copy rate decides it, and
a rewrite costs one request, not a lost draft.

### Syllabus

`brief.ts:makeBrief` reads the key point from `src/syllabus` (the 2025 data; read only,
the coverage skill's golden tests pin it). A draft is tagged with its key point when built
(`insert.ts:studioBuilds`), so the coverage check counts it. The guard's term list is the
subset of the guide's NOT-required sentences that name a term; `guard.test.ts` keeps each
entry in step with the syllabus data.

## Numbers that are not measured yet

No model ran (no key on the build server). Token and time estimates are the proposal's:
about 6–7k tokens and 15–40 s for five checked MCQs in both languages. `StudioOutcome.usage`
sums the provider's real counts so the first trial logs them. Model ids in
`src/ai/providers.ts` are unverified.

## The page (`src/components/studio/`, package 2)

The start screen's view `studio`, beside the Question bank and the Past paper bank, built
as the Past paper screen is (header, columns, a tray at the foot):

- **Source** (left): a key point (a select grouped by topic, named in the interface
  language), narrow it to some of its points, the syllabus limits that go with it (listed:
  they are sent), up to three bank questions to write like, how many (1, 3, 5), level,
  format (either, plain, combination), language (English, 中文, both), the Change line, and
  **Sends this to {provider}**: the lines come from `brief.ts:sentSummary`, so the list can
  never say less than what goes (a picked question's words and key, with a note that past
  paper questions are HKEAA's; nothing else, no label, year or paper number). Write / Stop
  with the run's stage and progress; the provider line and Settings under it.
- **Drafts** (middle): each draft drawn as it prints (`PastPaperSheet`, the Past paper
  card's own preview), AI-made, "No problems found" or "Read it", its key and why, a chip
  per check (clicking one shows its words), Another / Harder / Easier / Change… / Discard.
  A draft a hard check failed is set apart under **Left out** with its reason and cannot be
  ticked.
- **Checks** (right): the focused draft's seven rows in words (`findings.messages.ts`; the
  key row says how the blind solve worked and shows its working), notes about the batch,
  what the near-copy check compared with (the Past paper bank's search index and the
  teacher's own questions; or "only yours" when the bank was not available), and the
  session's requests and tokens (the trial's cost evidence).
- **Tray:** picked drafts go into a new worksheet, a new Paper 1 or one of the teacher's
  papers (`insertQuestionBatch`: one commit, one ⌘Z, the first question selected and
  revealed, a notice "N AI-made questions added. Read each one before you use it."), or
  into their one question bank (`addToOneBank`, duplicates skipped). Drafts that landed leave
  the sheet.
- **✦ Write like this** on a Past paper card and on the 題庫 review page adds that
  question as an example (three at most; its tags choose the key point if none is chosen)
  and opens the studio. Gone when the trial is off.
- Session state (`session.ts`) is in memory only and survives leaving the page for a
  bank to pick an example; a reload clears it. Errors are notices (the app's rule), with
  exactly the actions the error names; Gemini that cannot be reached says it needs a VPN in
  Hong Kong (`errorNote`: network, "didn't answer", timeout; also for the ✦ doors).

**The trial switch** (`trial.ts`, decision 7a): `econgen.settings.questionStudio`, off by
default. Opening the app once with `?studio=trial` turns it on (and removes the parameter
from the address), `?studio=off` or "Turn the trial off" on the page turns it off. Off: no
Library row, no screen, no ✦ Write like this. Taking the trial out for good means removing
`useStudioTrial` from the start screen and the two buttons' props. It needs an address bar,
so the desktop shell cannot turn it on yet (add a Settings or version-tap route if the
trial must run there).

## The AI-made label (package 3, decision 5)

One optional question field, `Question.aiMade` (`true` or absent, never `false`), on
`QuestionBase`. A question field is nested in the worksheet, so it needs **no `KNOWN_KEYS`
entry and no schema bump** (that set is the worksheet's top-level keys only; `startOnNewPage`
is the precedent). The decisions it needed:

- **Set** by `insert.ts:studioBuilds`, the only way a draft becomes a question, so a question
  added to a paper and one kept in the bank are marked alike.
- **Review state, not content**: `contentKey` ignores it (`library/contentKey.ts:IGNORED`,
  classed `metadata` in `contentKeyFields.test.ts`), so pressing Checked never makes a new
  version and a checked copy still matches its unchecked one.
- **Travels with a copy** (`lineage.ts:copyQuestion`; the page-break ask `startOnNewPage` is
  the one field a copy leaves behind): an unchecked question taken out of the bank into a paper
  is marked again. A duplicate in the same paper keeps it too.
- **Screen only, and no backend reads it**: the IR is unchanged, so the printed page, `.docx`,
  PDF and clipboard are the same with it or without it (`aiMade.test.ts` renders both). On
  screen: a chip at the top corner of the question on the page (`AiMadeChip`: absolute, so it
  moves nothing and re-breaks no page; `data-print-hide`; only on a page being typed on, never
  print preview or a read-only file; it lets clicks through to the question), a note with the
  **Checked** button at the top of the Edit panel (`AiMadeNote`), a ✦ in the outline row, a
  read-only line on the 題庫 review page, and a warning in the export dialog's Paper check
  (`paperHealth.ts`, finding `aiMade`), the last look before printing.
- **Checked** writes absence (`CHECKED_PATCH`): one undo step, and the question is then the
  question it would have been without the label, JSON and key. Not offered in a read-only file.

## The trial kit (package 3, decision 7a)

The proposal's gate: the key is defensible on 90% or more of what is shown, 60% or more is
usable as it stands or after one edit, and a near-copy is never shown; judged on 30 invented
briefs run once on the teacher's key plus about 20 requests of their own. It is the studio's
second tab, so the teacher needs no terminal and no key pasted anywhere: it runs on the key
already in Settings, with the same engine, checks and corpus as Write.

- **The 30 briefs** (`trialBriefs.ts`, invented; three example questions written for it):
  28 key points over the ten compulsory topics, English / 中文 / both, plain and combination,
  easier and harder, ten of them on key points whose items the guide limits, a third on
  arithmetic, four with a Change line, three written like an example. Ordered so any ten in a
  row are a fair mix. About 90 drafts and about 150 provider requests.
- **The run** (`trialRun.ts`): one Write per brief, in order, on `liveEnv`; each is judged on
  its own (no `avoid` list from the brief before) and none touches the studio's sheet. A run
  survives leaving the tab (`createBriefRunner`), stops on Stop or at the first error (the
  same notice as Write, with the VPN note), and **resumes**: a brief that has drafts is skipped.
- **The record** (`trialLog.ts`): every run's drafts with their checks and the teacher's two
  marks, in `localStorage` (`econgen.studioTrial.v1`), so a two-hour reading survives a reload.
  The session's `onRun` hook adds every request the teacher makes themselves (labelled `mine`).
  It keeps counts of the examples, never their words, and no paper. A damaged saved record
  reads as empty, run by run.
- **The marks**: *Key defensible?* (exactly one option the teacher would defend: Yes / No) and
  *Would you use it?* (As it stands / After one edit / Reject), on every draft in the Trial kit
  list and on Write-tab drafts alike. The list shows the next draft to mark first.
- **The bar** (`trialScore.ts:tally`): judged on what is marked, and only once 20 are marked.
  Beside it: how often the blind solve agreed, the lint, syllabus, number and term notes, the
  closest near-copy shown (a basis for tuning the 30% limit), drafts a hard check left out, and
  what it cost (requests, tokens, seconds a click). Near-copy is also marked "means less" in
  any run that had no Past paper bank to compare with. **Copy report** writes it all as English
  text (the bar, the checks, each brief's result, up to 20 drafts that need a look).

## Packages

1. **Engine** (done): `src/questionStudio/`, the mock server's studio replies, tests.
2. **Studio page** (done): the screen, the "Write like this" entries, the form's "what is
   sent" lines, Gemini's VPN note, the near-copy corpus, the trial switch. Browser proof
   `scripts/studio-verify.mjs` (mock AI, an invented bank).
3. **AI-made label and trial kit** (done): the field, chip, Edit-panel note and Checked,
   `contentKey` and copies, the Paper check warning; the 30 briefs, the run, the record, the
   marks and the bar. Browser proof `scripts/studio-verify.mjs` (`label`, `trial`).

Draft CHANGELOG line, to add when the studio is unpaused (a paused feature has none, as
`check.syllabus` on main): "Write new multiple-choice questions from the syllabus — Library
→ Question studio writes drafts on a key point, checks them, and adds the ones you pick."
