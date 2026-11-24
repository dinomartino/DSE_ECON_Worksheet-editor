# Question studio — AI that writes new questions (k-0499)

Status, 2026-11-23: **all three packages are on `develop`, and every develop build shows the
studio** with nothing to turn on (u-z4n3: "shown on the dev, no need turn on"). **A release
build hides it**, so nothing is visible to teachers until the user ships it (§ The trial
switch). The engine, the page, the AI-made label and the trial kit are built; no real model
has run, so the user's trial (30 invented briefs and about 20 requests of their own, on their
key) is what is next. The proposal is `Outbox/k-0495/AI-QUESTION-GEN-PROPOSAL.md` (not in the repo); the older design it
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
| 7 | **7a:** not shipped until a trial (about 20 of the user's requests plus 30 invented briefs on their key); shown in every develop build, hidden in a release build (u-z4n3). | `trial.ts` (the switch), `platform/buildChannel.ts`, `trialBriefs.ts`, `trialLog.ts`, `trialScore.ts` (§ The trial kit) |
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
form lists under "Sends this to {provider}", from the same brief. With no example picked the
studio adds 3 to 5 real HKDSE questions of the key point from the Past paper bank as style
references (§ Quality), and the form says so ("N real HKDSE questions … word for word");
turned off (the option on the Write tab) nothing from the bank is sent. The blind-solve request carries only the questions' text:
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

**Replaced by the chat screen (k-0516, § The chat screen below).** This section records the first
page (form | drafts | checks), whose source, drafts and checks columns are gone; its tray, error
notice, check rows and "✦ Write like this" entries live on in the new screen.

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
  A draft a hard check failed (near-copy, format) is a normal card with a red chip and its
  reason in words above the question; the teacher reads it and decides (k-0531, u-p8bn: it was
  set apart under **Left out** before, and a chat saved then shows it this way now,
  `validate.ts:shownDraft`). A table the model writes in the stem as "|" rows is drawn as a
  table (`stemTable.ts:stemBlocks`).
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

**The trial switch** (`trial.ts`, decision 7a; u-z4n3): the studio is shown by a develop
build from the first launch and hidden by a release build. What decides is a build-time
constant, `RELEASE_BUILD` (`platform/buildChannel.ts`): `NEXT_PUBLIC_RELEASE_BUILD=1`, which
only `.github/workflows/release.yml` sets (the workflow a `v*` tag runs, so nobody has to
remember anything at release time). A setting on the computer, `econgen.settings.questionStudio`,
overrides the build's default once it has been given:

| Build | Before any setting | `?studio=trial` | `?studio=off` | "Turn the trial off" on the page |
|---|---|---|---|---|
| `npm run dev`, `npm run desktop:dev` | shown | shown | hidden | not offered |
| `npm run build` on develop or in CI, a local `.dmg` (`DESKTOP-PREVIEW.md` way B), a CI desktop preview (way C) | shown | shown | hidden | not offered |
| a release: the Release workflow's build for a `v*` tag | **hidden** | shown | hidden | offered (only after `?studio=trial`) |

"Hidden" is no Library row, no screen, no ✦ Write like this, nothing about it for a teacher.
The off button is left out of a develop build because the desktop app has no address bar to
bring the studio back once hidden. Nothing is written to the settings by looking: only a
`?studio=` request (or the button in a release build) stores a value, and resetting the
setting goes back to the build's default (`trial.test.ts` covers both builds by loading the
module with the flag set).
**Shipping it**: make `studioDefaultOn` return `true` (drop its `RELEASE_BUILD` check) and
add the CHANGELOG line below; the page's off button then goes away by itself, and the flag in
`release.yml` stays, since it is the general "release build" fact. **Captures**: a film or site screenshot taken from a develop build shows the Library row;
build with `NEXT_PUBLIC_RELEASE_BUILD=1 npm run build` to capture what teachers see.

## The chat screen (k-0516, the k-0513 redesign; user u-6060, u-2ouc, u-lm1c, u-fwvn)

The mockups and research are `Outbox/k-0513/` (README there). The user took all five
recommendations (u-2ouc): A's layout (chat left, the paper writing itself right) with D's
one-click start from the bank and C's side-by-side compare in A's look (u-fwvn: C's own
visuals were ugly); word-by-word streaming; ask before rewriting on a changed key point; chats
kept on this computer; the Trial kit in Settings → AI. **No topic picker anywhere (u-lm1c).**

- **Screen** `src/components/studio/QuestionStudioScreen.tsx:QuestionStudioScreen`: header (Home,
  title, Trial, Chats ▾, New chat, Settings); the chat column (380 px) with the welcome (Pick a
  past-paper question / Describe what you need), the log and the composer; the paper
  (`chat/PaperCanvas.tsx`) with Paper | Side by side, and the tray (`Tray.tsx`, now fed the
  accepted drafts by props).
- **Store** `src/components/studio/chat/chatStore.ts:createChatStore` (app instance
  `chat/live.ts:useChat`, over the studio's `liveEnv`). A request is steps, stored as codes on the
  AI's reply (`chatTypes.ts:Step`): read the reference → **pick** (step 1, the AI's
  `pick.ts:pickKeyPoints`; if it names none, the computer's `chat/localPick.ts`, marked "matched on this
  computer") → real references when none was picked (`withReferences`) → write (streamed: the
  engine's `onEvent` folded by `stream.ts:applyEvent` into the run's `live`, never saved) →
  checks → diagrams. A message after drafts exist changes one draft when it names one ("draft 2
  …", or the draft chip from "Ask about this"), else it is a new request; a follow-up with no key
  point of its own keeps the chat's. The pick shows as a step with **Change** (`chat/PickLine.tsx`:
  the AI's other pick, the same topic's key points, a search); changing it with drafts on the paper
  asks **Rewrite them / Keep them** (Rewrite replaces the open drafts; accepted ones stay). A
  change to one draft stays on that draft's key point. Every run reaches the Trial kit's record
  as the teacher's own (`onRun`).
- **Drafts** `chat/ChatDraftCard.tsx`: drawn as they print (`PastPaperSheet`, so the AI-made
  diagram prints with the question), AI-made, status, key; **Accept / Reject** on the head;
  check chips that open the rows (`CheckLine.tsx`); Another / Harder / Easier / Ask about this;
  `v2 · v1` with Back to v1 (`restoreVersion`). Drafts are numbered once and never renumbered.
  While a write runs, each slot shows the words as they arrive, then the checked draft with
  "drawing the diagram…" until its figure comes; a figure the checks flag shows "Read the diagram"
  with its issues.
- **Side by side**: the reference as it prints (with its picture when it was picked from the
  bank this session; a saved chat keeps only its words) beside each draft, and **What changed
  from the reference** (`chat/whatChanged.ts`: the AI's own "varies" words, format, numbers, key
  letter).
- **Saved chats** `chat/chatStorage.ts`: `localStorage` `econgen.studioChats.v1`, newest first, at
  most 30; each chat checked on its own when read (a damaged one is skipped, a damaged draft
  dropped); reference pictures never saved. Chats ▾ lists, opens and deletes them.
- **Entries**: "✦ Write like this" (`openStudio.ts:writeLikeThis`) opens a fresh chat with the
  question and starts at once (no form); ＋ Reference and the welcome open
  `ReferencePicker.tsx` (the bank by topic or year, search, drawn as printed with diagrams, "only
  with a diagram or table").
- **Trial kit**: Settings → AI → Question studio trial (`settings/sections/aiSection/TrialKitBlock.tsx`,
  shown only while the studio is on), opens `TrialView` in its own dialog; "Turn the trial off" is
  there in a release build.
- **Seam** `chat/engine.ts:StudioEngine` (`pick`, `write`, `refine`): the only calls the screen makes.
- **Browser proof** `scripts/studio-chat-verify.mjs` (mock AI with pick and diagram replies, an
  invented bank with a pictured question): the whole flow, saved chats across a reload, the bank's
  one-click start, Settings → AI, 中文, and (u-na4k) the ＋ Reference picker's topic and year lists
  scrolling inside the dialog in a short window; screenshots in `Outbox/k-0516/`. Shared fixtures
  (the invented bank, a long `/big/` bank, the blocked providers) are `scripts/studio-verify-kit.mjs`.
  The old studio-verify script (the form's screen, the 30-brief run in the browser) went with that
  screen; the trial kit's logic keeps its unit tests.
- **My questions** (k-0529, u-ov6l): the picker's second side (`src/components/studio/MyQuestionsPane.tsx:MyQuestionsPane`,
  pure half `src/components/studio/myQuestions.ts:myQuestionList`) lists the teacher's own saved questions from the 題庫
  index (`useBank`: every saved paper and bank, one entry per `rootId`, the newest copy shown). MC only for now: other
  types are left out and counted ("Only MC for now: N other questions are not listed"), not greyed, so the list holds only
  what can be picked. Search (as the 題庫's: every copy and its paper's title), a topic rail (coarse topics with counts) and
  "Last used or made" (`:inWhen`); questions used as a reference before come first (`:noteRecent`, `econgen.recentRefs.v1`,
  this computer only); the list draws 40 at a time ("Show more"), the preview only the selected one. A pick reads the
  owning document and builds the same source as a past paper (`:mineReference`: stem, statements, options, key, its shared
  passage, pictures, and now its explanation, `SourceQuestion.explanation` → `brief.ts:examplePayload`), id
  `mine:<docId>/<questionId>` as the 題庫's ✦ Write like this; the question is copied, its document never written. The
  bank switched off opens the picker on this side, so the start buttons no longer wait for the bank. Each draft names
  the picked references ("Based on Mock 2026 · Q4", `src/components/studio/BasedOn.tsx:BasedOn`). Preview card
  `src/components/studio/ReferenceSheet.tsx:ReferenceSheet`. Browser proof
  `scripts/studio-mine-verify.mjs` (screenshots `Outbox/k-0529/`; a 2400-question bank opens in under half a second).
- **Reference picker rail** (u-na4k): the rail around the shared topic/year navs is a *row*, so the
  nav (a column sized to its list) is stretched to the dialog's height and its list scrolls; in a
  column it grew past the footer and the topics below could not be reached.
- Not built yet: editing the AI's diagram inside the studio (once added, it is an ordinary editor
  diagram).

## The ✦ Write panel in the editor (k-0516 package B, mockup B)

The same chat docked in the worksheet editor's right sidebar as a fourth tab, **✦ Write 擬題**
(`editor/Sidebar.tsx`; only where the studio is shown, `trial.ts`, and not in the Marking scheme
view). Sticky like 題庫: a click on the page moves the insert anchor and stays on the tab.

- **Panel** `src/components/studio/panel/WritePanel.tsx:WritePanel`: "Writing for <paper> · after
  Q14" (the insert anchor, or the section/end an unanchored insert takes); an empty chat opens on
  the paper's topics from its tags (`panel/coverage.ts:paperCoverage`, compulsory A–J, no AI) with
  the first topic that has no question offered as one click ("Write 3" sends "Write 3 MC questions
  on C · …"; the AI still picks the key point) or a reference; then the chat (`ChatTurns`,
  `Composer`), a row per draft (would-be number, state, → to it on the page, checks and
  Another / Harder / Easier / Ask on demand) and "Accept all without problems".
- **Store** `panel/paperChat.ts:usePaperChat`: a second `createChatStore`, its own saved list
  (`chatStorage.ts:PAPER_CHATS_KEY`), each chat naming its paper (`Chat.paper`, `openPaper`), so the
  studio's Chats ▾ and the panel never trade places; drafts default to the paper's language.
- **Drafts on the page** `panel/ghosts.ts`: open drafts (and words still arriving) as questions
  placed by `worksheetStore.ts:placeQuestions`, the same placement `insertQuestionBatch` commits, so a
  draft is drawn exactly where Accept puts it, numbered "would be Q16". `EditorApp.tsx` gives the
  page that derived copy (`panel/PageDrafts.tsx:usePageDrafts`, as the 題庫 drag's provisional
  question) with a `Preview.tsx:GhostLayer` that frames them (dashed, faded, a head in the gap above
  with Key, Ask, Reject, Accept; `data-print-hide`; one line more room above each). Autosave, undo
  and export never see them; while any is shown nothing measured is written back (split, trim,
  fill), as during a 題庫 drag. Off while the tab is closed, in print preview, read-only, during a
  題庫 drag, and while a PDF prints (`panel/writePanelState.ts:hideGhostsForPrint`, from the toolbar).
- **Accept** `paperChat.ts:acceptDrafts`: `insertIntoOpenPaper` at the anchor, one commit, one ⌘Z;
  the cursor moves after what went in. An accepted draft whose question leaves the paper (⌘Z,
  delete) comes back on the page (`reopenUndone`), and the cursor returns to where it was written.
- **Browser proof** `scripts/studio-panel-verify.mjs`: opener and gap, the anchor, drafts after Q4,
  never saved or printed, Accept / ⌘Z / Reject / Accept all, a change from the page, reload, 中文.

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
  row are a fair mix. About 90 drafts and 60 to 150 provider requests (two a brief when every
  draft passes, up to five when drafts are written again).
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
  closest near-copy among drafts without a warning (a basis for tuning the 30% limit), drafts shown with a hard-check warning, and
  what it cost (requests, tokens, seconds a click). Near-copy is also marked "means less" in
  any run that had no Past paper bank to compare with. **Copy report** writes it all as English
  text (the bar, the checks, each brief's result, up to 20 drafts that need a look).

## Quality: DSE style and DSE concepts (u-bd41, u-uugw, u-7jvk; proposal `Outbox/k-0499/QUALITY-PROPOSAL.md`)

The user found the drafts "not DSE style" and on concepts DSE rarely tests. Cause: the prompt
named the syllabus (what is allowed, not what is asked), described style in a few generic
phrases, sent no example unless one was picked, and told the model not to resemble the ones it
had. Three changes, none of which touches the checks or the cost per click (still at most five
requests; input grows by about 250 tokens per reference). The model stays Gemini Flash (no Pro,
u-uugw).

- **Real references by default** (`references.ts`, option `options.ts:STUDIO_OPTIONS`, on). With
  no example picked, `session.ts:withReferences` asks the environment for `referencesWanted`
  (3, 4 or 5 by how many questions are written) real questions of the key point: weighted
  sampling over the bank's search index (recent HKDSE years above older papers and HKCEE/HKALE,
  a picture the model cannot see counts less, the shape asked, a plain/combination mix for
  "either"), then only the topics holding the picks are downloaded. A topic that names a whole
  syllabus topic ("G") serves each key point of it. The request keeps them (`auto: true` on each
  `SourceQuestion`), so Another, Harder and Easier ask the same thing, the trial's record counts
  them, and the checks column says which questions a draft was "Written like" (labels stay on
  the computer). They are a style: `make.reference = "style"`, rule 6 of the prompt keeps "new
  context, figures, wording and options", and the near-copy limit (30%) holds against them and
  the rest of the bank.
- **Strict reference mode** (`StudioRequest.strict`, form default on whenever a question is
  picked with ✦ Write like this; off = a style only). `make.reference = "pattern"`: question n
  follows example n (cycling), keeping its concept, stem and option pattern and the slip behind
  each wrong option, changing scenario and figures. **No similarity limit against the picked
  reference** (u-uugw: unlimited): `nearCopy.ts:checkNearCopy` takes `exempt` docs, left out of
  the comparison by id (`mine:doc/question` also as `doc/question`) and by their words, wherever the
  corpus holds them; a draft that is close is told so (`copy.reference`, "Close to your reference
  on purpose", the row stays pass). Everything else keeps the 30% limit; an automatic reference
  never gets the exemption (`brief.ts:referenceMode`).
- **DSE counts** (`frequency.ts:keyPointCounts`): HKDSE multiple-choice questions per key point
  from the same index (sittings with a year; a topic naming two key points shares each question,
  a whole topic code spreads over its key points). The key point list shows the count, sorts
  key points and topics by it, and folds the key points never asked (the link under it shows them;
  the chosen one never folds): `studioView.ts:rankKeyPoints`. Without the bank's index the list
  is the syllabus's own.
- **The trial kit compares ways of writing** (cheap part of the test plan): two more marks on
  each draft, "Reads like DSE?" and "Concept often tested?" (no bar; the bar stays 90% key
  defensible, 60% usable), and the brief run takes a way: `today` the key point alone (the
  studio before), `refs` the studio's own real questions (the default), `strict` close to one
  real question (the brief's invented example, else the first real question picked). Each runs
  and resumes on its own (`trialLog.ts:Arm`, `trialRun.ts:requestForArm`); the report's "Style
  and concepts" lines give each way's key-defensible, usable, DSE-like and often-tested shares.
  The 20 DSE-weighted briefs of the proposal's plan are not added; the user runs the test later.
- **Not built** (backlog): a style card the teacher writes for the AI to follow (d3 of the
  proposal), Mentor's notes as context (not now), Gemini Pro.

## Packages

1. **Engine** (done): `src/questionStudio/`, the mock server's studio replies, tests.
2. **Studio page** (done): the screen, the "Write like this" entries, the form's "what is
   sent" lines, Gemini's VPN note, the near-copy corpus, the trial switch. Browser proof
   the first page's the studio-verify script (retired with that page by k-0516).
3. **AI-made label and trial kit** (done): the field, chip, Edit-panel note and Checked,
   `contentKey` and copies, the Paper check warning; the 30 briefs, the run, the record, the
   marks and the bar. Browser proof: the retired the studio-verify script (`label`, `trial`).

4. **Shown on develop** (done, u-z4n3): the default is on in a develop build and off in a
   release build; `platform/buildChannel.ts`, the flag in `release.yml`, `trial.ts`, the
   gate section of the retired the studio-verify script (`--release` for a release build's).

5. **Quality** (done, u-bd41): real references by default, strict reference mode, DSE counts
   in the key point list, the two extra marks and the arms in the trial kit (§ Quality).

Draft CHANGELOG line, to add when the studio ships. It stays out of `CHANGELOG.md` while a
release hides the studio, because the release body is copied from Unreleased (a feature a
release hides has none, as `check.syllabus` on main): "Write new multiple-choice questions with AI — Library
→ Question studio: pick any past-paper question or one of your own, or say what you need; the AI picks the syllabus key point, writes
drafts (with diagrams) as you watch, and adds the ones you accept. Or open ✦ Write beside a paper:
the drafts appear on the page where they would go, and Accept puts each one in."

## Engine v2 (k-0514, user u-6060, u-lm1c): the AI picks the key point, pictures go with the reference

The first studio made the teacher choose a key point and sent only words. Three changes, all engine-side:

- **Step 1, `src/questionStudio/pick.ts`.** Every write with no key point of its own first asks the same provider
  which EDB key point(s) the request is about: the typed request (`note`), the picked questions' words and pictures,
  and the 52 key points with their points. Structured reply, one or two `{ code, reason }`; each code is checked
  against `src/syllabus` (a point code maps to its key point, a made-up code is dropped). One repeat on an unreadable
  reply, then `badOutput`. A key point set by hand (the form's select, now "AI picks" by default) skips the call, so
  does a refine. The first pick is the main key point every check reads; the second (`alsoKeyPoints`) is only named in
  the write payload. `session.ts:withKeyPoints`, state `picks` (shown, tap one to set it by hand). A request is
  writable with a typed request, a picked question or a key point (`canWrite`). "Write like this" no longer sets the
  key point from the question's tag.
- **Pictures with the reference.** `figures.ts` reads a question's image blocks (data URLs) and draws its diagrams to a PNG
  (`export/diagramImage.ts:rasterizeDiagram`, browser only), at most 3 per example, 6 per request, 2 MB each.
  `CompletionRequest.images` goes on the last user turn: Gemini `inlineData`, Claude image blocks, OpenAI-style
  `image_url` (`ai/adapters`); `ai/providers.ts:supportsImages` (Gemini, Claude, OpenAI, OpenRouter) — the client drops images
  for any other provider, and the payload then says `figureNotShown` as before. The pick and the write both get them.
  Not built: a rendered picture of the whole question (tables and stems are words already).
- **Pick one yourself.** `references.ts:searchRows` / `:loadReference` over the bank's search index (words in either
  language, source line, tag; newest HKDSE first); `components/studio/ReferencePicker.tsx` in the source panel.

Step 1's accuracy: `pickEval.test.ts` (`PICK_EVAL=dump|score|live`, bank copy in `PICK_EVAL_DIR`). First run, stand-in
model Claude Haiku, not Gemini: 22/33 (67%) from a real HKDSE question alone, 27/28 from a specific typed request,
50/63 overall; the misses are mostly neighbouring key points. A Gemini run needs a key (`PICK_EVAL=live`).


## Engine API for the screen (k-0514 part 2; the screen is k-0516's)

The screen builds on these; nothing in `src/questionStudio/` knows about React. Two ways in: the session store
(`live.ts:useStudio`, state `live`, actions `write`/`refine`/`stop`) or the engine call
(`run.ts:writeDrafts(request, deps, { signal, progress, onEvent })`).

- **Pick step result.** `session.ts:withKeyPoints` → event `{ type: 'pick', picks: KeyPick[] }` and state `picks`. `KeyPick = { code, reason, reasonZh }`
  (`pick.ts`; `reason` English, `reasonZh` the same sentence in Traditional Chinese, `''` if the model sent none: show the one for the screen's language, fall back to the other), first = main key point, at most two; `[]` when the teacher set a key point by hand (no call, no event).
  `form.keyPoint = ''` means "AI picks"; set it to override (tap a pick). The write request that follows has `keyPoint` and
  `alsoKeyPoints` filled, and every `SheetDraft.request` keeps them, so a refine does not pick again.
- **Follow-ups keep the key point (k-0520).** `pick.ts:PickInput.current?: string[]` (key point codes, main first, unknown ones ignored, at most two):
  sent as `currentKeyPoints` with their names, and the picker is told that a follow-up changing only format, language, number, level or
  wording ("the same in Chinese", "another one") answers with those codes. The screen passes its chat's current picks to
  `pickKeyPoints({ text, examples, current })`; through the session store set `form.current` (read by `write`, not part of the request).
  No `current` = as before. The picker may still move on when the request or the examples clearly ask for another key point.
- **What each draft changed (k-0520).** `StudioDraft.changes?: DraftChange[]`, `DraftChange = { aspect: 'varies' | 'format' | 'numbers' | 'key', note: BiDraft }`
  (`types.ts`; `''` for a side the paper does not print). The write request asks for it per question (`prompt.ts` rule 12, schema field
  `changes`, `validate.ts:parseChanges`): at most one entry per aspect, in the order varies, format, numbers, key, only for aspects that changed
  against the example the question follows; `[]` when the request had no reference (so a request with an auto reference list may still have
  entries: the screen decides whether to show them). Unknown aspects and empty notes are dropped, a bare-string note counts as English. `angle`
  stays, as the AI's one-line note. Always set by the engine; absent only on a draft saved before k-0520, which the screen handles as before.
  Not streamed (no `text` event field): it arrives with the `draft` event. Replaced drafts (rewrite after a failed check) carry their own.
  Cost: ~150 more output tokens per question per run (`writeTokens` room raised to match).
- **Streaming events.** `types.ts:StudioEvent`, in order of a run: `stage` (`pick`, `references`, `write`, `rewrite`, `solve`,
  `diagram`), `pick`, `references {count}`, `write {mode, attempt}`, `text {index, draft: PartialDraft, attempt}` (many; a draft's
  words so far: `stem`, `statements`, `options`, `answer` once written, `explanation`, `complete`), `draft {index, draft: StudioDraft}`
  (the latest state of that draft: after the local checks, after the solve, with its figure), `diagram {index, state: working|done}`.
  `index` is the draft's place in the batch (a rewritten draft's text events carry the slot it replaces; `attempt: 2` tells the
  screen to show the rewrite over the first try). Strings in a `PartialDraft` may end mid-word until `complete`. A listener that
  throws is ignored. `stream.ts:applyEvent(live, event)` folds events into `LiveState` (`drafts[i] = { partial?, draft?, diagram?, attempt }`),
  which the session keeps as `live` (reset at each run, kept after it, cleared by `clearDrafts`). `SessionHooks.onEvent` sees every event too.
  The final `StudioOutcome.drafts` is what the sheet keeps, as before.
- **Which providers stream.** `ai/providers.ts:supportsStreaming`: Gemini, Claude, OpenAI, OpenRouter, DeepSeek, Qwen stream the
  structured reply (`AiClient.stream`, server-sent events through each adapter's `buildStream`/`streamPiece`; same rungs and errors as
  `complete`) and `write {mode: 'streamed'}` events arrive token by token. A custom server and Ollama are asked for the whole reply
  (`mode: 'whole'`: each draft's `text` event arrives once, complete). A stream that fails for a non-fatal reason (before or after
  the first text) is redone as a whole reply; a fatal one (key, quota, region) ends the run as before. No `onEvent` = no stream.
- **Diagram result.** `StudioDeps.diagrams` (the live env sets it; default off, so the trial kit and tests are unchanged): after the
  words are settled, each draft that stands gets one `generateDiagram` call (its stem/statements/options, the key and explanation,
  and the figure of the example it follows: an editor diagram as words, else a picture when the provider reads pictures;
  `completeWithImages` is `client.complete({ …req, images })`). `StudioDraft.diagram?: DraftDiagram = { status: ok|look|failed|none,
  block, placement: question|answer|null, issues, imageSkipped?, error? }`. Show `look` with its `issues` for the teacher; `failed`
  and `none` have no block. Cost: one extra request per draft, counted in `Usage`. `insert.ts:studioBuilds` appends an `ok`/`look` figure
  placed `question` to the question's blocks; a figure placed `answer` is not inserted (an MC question has no model-answer slot).
- **Not changed:** `src/diagramGen/` (used as documented). Not built: the diagram does not stream (it arrives with `diagram: done`).
