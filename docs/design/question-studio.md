# Question studio — AI that writes new questions (k-0499)

Status, 2026-11-23: **package 1 (the engine) is on `develop`, paused; nothing is visible
to teachers.** Package 2 (the studio page and its entries) and package 3 (the AI-made
label and the trial kit) are next. The proposal is `Outbox/k-0495/AI-QUESTION-GEN-PROPOSAL.md`
(not in the repo); the older design it builds on is `docs/design/ai-pattern-questions.md`.

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
| 5 | AI-made label, screen only, until the teacher presses Checked. | package 3 (needs one question field) |
| 6 | **6a:** the blind solve is the same provider, a fresh request. | `run.ts:writeDrafts`, `prompt.ts:buildSolveRequest` |
| 7 | **7a:** paused on develop until a trial (about 20 of the user's requests plus 30 invented briefs on their key). | package 3 |
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

## Packages

1. **Engine** (done): `src/questionStudio/`, the mock server's studio replies, tests.
2. **Studio page** (done): the screen, the "Write like this" entries, the form's "what is
   sent" lines, Gemini's VPN note, the near-copy corpus, the trial switch. Browser proof
   `scripts/studio-verify.mjs` (mock AI, an invented bank).
3. **AI-made label and trial kit:** one optional question field (print-hidden chip,
   Checked), which joins `contentKey`'s ignored list in `src/library/`; Keep in my 題庫 then
   keeps the label; 30 invented briefs and a script that scores them (key defensible, usable
   as is, near-copy, syllabus, terms); the user's ~20 requests marked use as is / after one
   edit / reject.

Draft CHANGELOG line, to add when the studio is unpaused (a paused feature has none, as
`check.syllabus` on main): "Write new multiple-choice questions from the syllabus — Library
→ Question studio writes drafts on a key point, checks them, and adds the ones you pick."
