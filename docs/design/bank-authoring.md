# Write a question from the bank — design proposal

Status: proposal (not scheduled), 2026-09-30, written against `develop` at `ba349fa`. Not built. Extends
`docs/design/question-library.md` (read it first: a bank is a `Worksheet` with
`kind: 'bank'`, the identity contract, the tag grammar, newest-wins tags).

The ask (the user): "add a panel for users to directly create questions from the question
bank page too." Today a question can only be written inside a paper, then copied to a bank.

## Teacher stories

1. **Fill a gap where I see it.** Reviewing C Market and Price, the rail shows nothing under
   C.pes. I press New question there, write an MCQ, and it lands under C.pes. I never open
   a paper.
2. **Bilingual.** I write the English, press ✦ AI → Fill missing 中文, check the terms, done.
3. **An LQ with parts.** Structured, three parts, marks and a marking scheme per part; each
   part tagged with its own sub-topic (see § Topics per part).
4. **A diagram.** Add a diagram to the stem or as a part's model answer, drawn in the usual
   canvas.
5. **A variant.** Looking at a good question, I press New question from this, change the
   numbers, and keep both.
6. **Then use it.** Back on the review page the new question is focused; Space adds it to my
   list for the next paper.

## Where a new question lives

**In a bank document** — the only kind of document that holds questions without being a
paper. No new storage, no new format.

- **Which bank:** the one the teacher chose last (a per-viewer `localStorage` key, outside
  the `econ-worksheet:` prefix, like the dashboard's grid/list key); else the most recently
  saved bank; else a new one. A stale or trashed id falls back silently.
- **No bank yet:** the entry asks for its name, prefilled from
  `src/library/bankDocs.ts:nextBankName`, required (as a new worksheet and Copy to bank do),
  then `createBank`.
- **Never a hidden bank** (`bankHidden`: not indexed, so the question would vanish) and
  **never a newer-build bank** (opens read-only; say so and offer another).
- **Appended at the end of the bank's flow.** Order in a bank means nothing to the teacher;
  numbering stays derived.
- **Pre-tagged** with what the teacher was browsing: the review page's topic, or the rail
  section (sub-topic) whose "+" was pressed, plus the Filter's 題型 when set. Stamped
  `tagsAt` like every tag write. It is an original: no `lineage`, so `rootIdOf` is its id.
- **Shows in the bank on save.** The editor's autosave goes through the store singleton, so
  the change feed (`src/storage/changes.ts`) re-indexes the bank and every `useBank`
  reader updates. Nothing new to wire.

## Options

All three reuse the real editor. None adds a second editing implementation.

### A · Hand-off to the full editor (S)

New question opens the bank in the editor with the question already in it, selected;
"← Back to Question bank" (`src/components/bank/page/bankReturn.ts`) returns to the same
level and focuses the new row.

- **For:** about a day. Every invariant holds unchanged: it is Open in worksheet with a
  question added first.
- **Against:** it leaves the bank, which is what the user asked not to do. A bank is one
  long paper: a 300-question bank paginates in full, with a masthead, header, footer, page
  rail, add rail and paper summary that mean nothing here.

### B · Focused editor mode (M)

The same `EditorApp`, mounted with one question in view: no page rail, no add rail, no
masthead, header or footer, and the Inspector pinned to that question. The bar is
bank-flavoured: language, Teacher/Student, ✦ AI, undo, Discard, Done.

- **For:** the whole editor comes along (click-to-edit on the page, the panels, the
  canvases, the AI door, undo, autosave). Pagination runs over one question, not the bank.
- **Against:** needs a projection of the document for the page, an author mode in
  `EditorApp`, and an AI scope that stops at the question (below).

**B, placed as a sheet over the bank screen (recommended).** `EditorHost` renders the
start screen (bank view) *and* the author-mode editor over it, rather than swapping
screens. To the teacher it is the panel they asked for: it slides in over the review page,
the rail stays visible behind it (dimmed and inert) at ≥1280px, and Done lands back where
they were with the list already updated. Cost over plain B: one keyboard rule (below).

### C · Inline panel beside the live list (L)

The editing surface embedded in the review page's stage, with the rail still interactive.

- **The store is not the obstacle.** `useWorksheetStore` is a singleton, but the bank screen
  and the editor are never mounted together (`src/app/EditorHost.tsx:EditorHost` swaps
  them), so the bank screen may host the one editing session. A store factory is not
  needed. It would cost about 45 modules, ~210 hook reads, 57 `getState`/`setState`/
  `subscribe` calls and 22 test files, plus the module-level stores that assume "the open
  document" (AI run and menu stores, `bankSession`, `bankDrag`, `topicSync`'s skip,
  `bankDocs`' `openId`).
- **The obstacles are these:**
  - **Wiring.** `src/components/EditorApp.tsx` holds 56 store hooks, the canvases,
    autosave and undo keys. They would move into a mountable surface.
  - **Keyboard.** The bank screen's window handler (Esc goes up a level, arrows step,
    Space picks, O opens, ⌘Z undoes a tag) fires beside the page's. The panel cannot
    claim `src/components/ui/modalLayer.ts:useModalLayer`, because `Preview` stands down
    under it (six checks).
  - **Writers.** The rail's Edit topics and the tray's Set topic write documents through
    storage (`src/library/tagWrites.ts:writeTags`). One aimed at the open bank would be
    overwritten by its next autosave, unless routed through the store.
  - **Stale preview.** The stage preview reads documents from storage
    (`useOwningDocument`), so it would show the open bank as last saved.
  - **Width.** A 300px rail, a page and a 400px Inspector do not fit at 1024px.
- **For:** writing while reading neighbours. **Against:** every item above is a new
  invariant to keep, for a gain the sheet mostly gives.

### Against the invariants

| Invariant | A | B (sheet) | C |
|---|---|---|---|
| One IR, three backends | unchanged | unchanged: page is `Preview` over the IR | unchanged |
| The preview is the editor | yes | yes, on a projection (precedent: the 題庫 drag's `provisionalWorksheet`) | yes |
| Numbering, marks derived | yes | yes (the projection numbers it 1) | yes |
| Autosave on dirty; flush by value before swapping/unmounting | existing paths | Done = `flushBeforeLeaving`; `open` must end the session by value | new unmount path inside the bank screen |
| Window listeners all fire | n/a (screens swap) | bank handler stands down while the sheet is open (one flag) | needs a keyboard-owner concept beside the modal layer |
| Drag gestures commit once | unchanged | unchanged | unchanged |
| One writer per document | holds | holds: the covered bank screen writes nothing | tag writes must route through the store |
| Desktop file store / web quota | same as editing a bank today | same | same |
| No static `@tauri-apps/*` | untouched | untouched | untouched |
| Stored shape | none | none | none |

**No stored-shape change is needed** for any option: `kind`, `tags`, `tagsAt` and `lineage`
exist and are in `KNOWN_KEYS` or on the question. The per-viewer "last bank" key is a
convenience outside document storage. Confirm again if the per-part topics design adds
fields: that is its migration, not this one.

## Recommendation

**Build B as a sheet over the bank (one release). Keep A as the fallback if B slips. Do C
only if, after using the sheet, the teacher asks to click through the list while writing.**
C then reuses the sheet's session, keyboard flag and projection; only the placement and
the writer routing are new.

## The design

### Entry points

| Where | Button | Pre-fills |
|---|---|---|
| Review page header (a topic) | New question | that topic |
| Rail section heading (a sub-topic, incl. an empty one) | + (hover and focus) | that sub-topic, plus the Filter's 題型 |
| Review page empty state | Write the first question on ‹topic› | that topic |
| Topic card (a thin or empty topic) | + New question | that coarse topic |
| 題型 Patterns page, a 題型 row | New question | sub-topic + 題型; the type is fixed (a 題型 has one type) |
| Review stage, beside Open in worksheet | New question from this | the row's shared tags (`src/library/sharedTags.ts:withRowTags`), a copy of its content |

Not offered in tag as you go, whose job is tagging, nor on search results (no topic to
pre-fill; the plain New question in the bar still works there with none).

### The entry popover

```
New question 新題目
  Type     (•) Multiple choice   ( ) Structured      <- listQuestionTypes(), displayName
  Topic    C · Price elasticity of supply 供給價格彈性 <- read-only here; edited in the sheet
  Save in  [ Question bank            v ]            <- banks by name (bankChoices), + New bank…
                                  [Cancel] [Write it]
```

- **Type comes from the registry**, never a literal. Default: the Filter's type, then the
  type chosen last (per viewer), then the first registered. `src/library/noTypeBranching.test.ts`
  guards any pure module placed in `src/library/`.
- **Enter writes it**; Esc cancels (the popover claims the modal layer, like every overlay).

### The sheet

```
┌ Question bank 題庫 › C Market and Price ───────────────────────────────────── ⚙ ┐
│ rail (dimmed,  │ ← Question bank   New question · MCQ · in "Question bank"         │
│  inert, shows  │ EN | 中 | EN+中   Teacher ▾   ✦ AI   ↶ ↷        Discard   [Done]   │
│  the new row   ├───────────────────────────────────────────┬────────────────────────┤
│  once saved)   │         desk                              │ Edit                   │
│                │   ┌──────── paper, one question ────────┐ │ MCQ · 1 mark           │
│ Price elast. … │   │ 1. |                                │ │ key, options, notes    │
│  of supply(new)│   │    A ……   B ……   C ……   D ……         │ │ Topics 課題  C.pes ×   │
│                │   └─────────────────────────────────────┘ │ 題型  —                │
└────────────────┴───────────────────────────────────────────┴────────────────────────┘
```

Below 1280px the sheet covers the full width. The rail is chrome, never on the paper.

- **The page is the editor, on a projection.** `Preview` receives
  `focusProjection(worksheet, questionId)` (new, beside
  `src/components/bank/page/questionPreview.ts:oneQuestionWorksheet`). It drops layout, bands,
  header, footer, cover, versions and title; the store keeps the whole bank. Edits address
  ids, so they land in the real document, the same contract as `PreviewWithBankDrop`.
- **No measurement write-backs.** Omit `onSplitRows`, `onTrimQuestionAnswerSpace` and
  `onResolveFills`. Fill counts measured on a one-question page would dirty the bank with
  wrong numbers. Also omit the flow verbs (`onReorder*`, `onDeleteQuestion`, bulk
  delete/duplicate, `onAddQuestion`, band editing): there is one question and it stays.
- **The Inspector is pinned** to the question (a prop, not the selection), so clicking the
  desk never empties the panel. Its header reads "New question · MCQ · 1 mark", not
  "Question 37": the page numbers it 1 and the bank's number means nothing.
- **Blocks and diagrams** come from the type's panel, as in a paper (`BlockEditor`); a
  double-click on a diagram opens the canvas `EditorApp` already hosts. A shared stimulus is
  a layout element and cannot belong to one question: use a Source panel instead.
- **Language:** the sheet opens in the bank screen's language, and the bar switches it
  (`setMode`, view only). **✦ AI** is the editor's door (`AiHost`), so Fill missing
  中文/English and Check terms work unchanged. **Its scope stops at the question:**
  `src/assist/scope.ts:scopeChoices` always offers `{ kind: 'paper' }`, which here would
  translate the whole bank. Author mode caps it at the question.
- **Undo is this session's.** The bank reaches the store with the question already in it
  (built before `replaceWorksheet`), so history starts after creation and ⌘Z cannot undo
  the question from under the view. It steps back through this sheet's edits only.

### Topics per part (in flight, design around it)

The per-part topics work (a separate design in progress) moves topics and 題型 onto parts at
any level on a long question. The parent's are derived. Free tags stay on the whole
question; MCQ and partless questions are unchanged.

- **Pre-tagging calls that design's slot API only**, never `question.tags` directly. MCQ: the
  question. Structured: part (a), the one part `createStructuredQuestion` makes; a free tag,
  if any, on the question.
- **The sheet's topic UI is the Inspector's**, whatever that design puts there (per-part rows
  in the mark scheme grid, say). The sheet adds no topic UI of its own.
- **New question from this** copies per-part tags with the content, then applies the shared
  set the way that design's `withRowTags` successor does.
- **Sequencing:** land the per-part WP-0 contracts first, or build against question-level
  tags and swap the one pre-tag call when it lands.

### Save, discard, leave

- **Saving is autosave.** The bank is dirty after the first edit and written 1.2s later, as
  in any paper. The entry saves the bank once with the new question in it, the way
  `EditorHost.open` saves every opened document. So the question is on disk before the
  first keystroke.
- **Done** (and ← Question bank) = `src/app/EditorHost.tsx:flushBeforeLeaving`, then close.
  A failed write keeps the sheet open with the error, as leaving the editor does now.
- **An empty question is not kept.** On Done, a question the registry calls empty
  (`healthFacts?.(q).empty`; a type without the hook counts as not empty) is removed and
  the bank saved: "Nothing was written, so no question was added." Pre-filled tags do not
  count as writing.
- **Discard** removes the question and saves. It asks first once anything was written
  ("Delete this new question?"). New question from this discards the same way; its source
  is never touched.
- **Esc never closes the sheet.** It already leaves print preview, clears a selection and
  blurs a field (window listeners all fire), and closing on a stray Esc teaches distrust.
  Done is one click.
- **Every other way out ends the session by value.** A file dropped on the start screen,
  or any `EditorHost.open`, first saves the sheet's document by value (as `open` saves an
  outgoing paper), then clears the session. Desktop restart-to-update is already covered
  by `setBeforeRestart`. Closing the tab has the editor's 1.2s exposure, no worse.
- **One writer per document.** While the sheet is open, the bank screen writes nothing and
  its key handler stands down (a flag read beside `isModalLayerOpen()`). This covers the
  in-flight review-page ✦ translation and Check terms too. They can write again only after
  Done has flushed.

### Afterwards in the bank

- **Done lands on the review page of the question's topic**, focused on it (its `rowKey`).
  The row appears once the index has re-read the bank (an idle slot). Focus is held as
  pending until then, as `tagRestore` holds tag-as-you-go's place.
- **A filter that hides it is named, not cleared:** "Saved in Question bank. Your filter
  (MCQ only) hides it." with Clear filter.
- **Add to list:** the focused row's Add to list (Space) works as for any row. Optional:
  Done's menu "Done, add to my list" sets a pending pick, applied when the row is indexed
  (the cart needs a `BankRow`, `src/components/bank/page/bankCart.ts:useBankCart`).
- **The Add-to target must survive.** `src/components/bank/page/bankPage.ts:addTarget`
  takes "the last open paper" from the store's document. After the sheet, that is a bank
  (excluded), so "Add to ‹paper›" would vanish on the next visit. `EditorHost` keeps the
  last paper it opened as session memory, and `addTarget` reads that.

### ✦ AI later

The question the sheet opens with is a **seed**: `blank(typeId)`, `from(row)` or
`generated(question)`. E3 "questions from a source" (`src/generate/`, paused in
`src/assist/paused.ts:PAUSED_VERBS`) can later offer "✦ Draft from a source" in the entry
popover. The seed is the generator's one item of the chosen type, validated by
`src/generate/validate.ts`, and the teacher edits it in the sheet. Nothing here builds it.

## Architecture changes

**Existing files**

- `src/app/EditorHost.tsx`: renders the author sheet over `StartScreen` when a session is
  open. `startAuthoring(request)` loads or creates the bank, builds the doc with the seed,
  `replaceWorksheet`, saves, selects, and records the last paper first. `endAuthoring()`
  runs the empty check, `flushBeforeLeaving`, then clears. `open()` ends a session by value.
- `src/components/EditorApp.tsx`: an `author` prop (question id, Done, Discard). It swaps
  `Toolbar` for the author bar, drops AddRail, PageRail, `BankReviewBar` and
  `BankDragLayer`, feeds `Preview` the projection without write-back or flow props, and
  pins the Inspector.
- `src/components/editor/Inspector.tsx`: optional pinned question id and header text.
- `src/assist/scope.ts`: a scope ceiling (the question) in author mode.
- `src/components/preview/PageContextMenu.tsx`, `ContextBar.tsx`: hide verbs that add or
  remove flow items when the host gives no handler. Audit first: most are already gated
  on optional props.
- `src/components/bank/page/QuestionBankScreen.tsx`: entry buttons, the popover, the key
  handler's stand-down, pending focus and pick after Done, filter notice.
- `src/components/bank/page/ReviewPage.tsx`, `TopicCards.tsx`, `PatternsPage.tsx`: the
  buttons in the entry table.
- `src/components/bank/page/bankPage.ts`: `addTarget` takes the remembered last paper.
- `src/components/start/StartScreen.tsx`: passes `onAuthor` through to the bank screen.

**New files**

- src/library/authoring.ts (new, pure): `seedQuestion` (blank via the registry's
  `create()`; from a row via `freshIds` without `lineage`), `withNewQuestion(bank, q)`
  (append to `questions` and `flow`), `pretag(q, context)` (through the tag API),
  `isBlankQuestion(q)`, `chooseBank(summaries, remembered)`. Tests beside it; the
  directory's no-type-branching test covers it.
- src/components/bank/page/focusProjection.ts (new, pure) with tests: a question alone,
  nothing printing around it; the same object back while the question object is unchanged,
  so the render cache holds.
- src/components/bank/page/bankAuthor.ts (new): the session store
  (`{ session, start, end }`), the pending focus and pick, and the last-paper memory.
- src/components/bank/page/AuthorBar.tsx (new) and NewQuestionPopover.tsx (new).

**Not changed:** the store (`addQuestion` and `insertQuestionCopies` are not used: the seed
is built before load), the registry, the IR, the exporters, storage, migrations.

## Verification

- **Unit:** the projection (drops, identity, unknown id); the seed (fresh ids at every
  level, no lineage, tags pre-applied and stamped); `chooseBank` (remembered, stale, hidden,
  newer-build, none); `isBlankQuestion` per registered type; `addTarget` with a bank as the
  last document; `open` during a session saves the session's document by value;
  `endAuthoring` removes an empty question and saves once.
- **Browser, Chromium and WebKit** (`scripts/shot.mjs` or a scratch Playwright probe; the
  seed path must go through the start screen now):
  - write an MCQ from the C.pes "+", fill 中文 with the mock provider, Done: it is focused
    under C.pes;
  - write a structured question with two parts and a diagram;
  - New question from this: the source is unchanged, and the bank shows two questions, not
    two versions;
  - Discard; Done with nothing written; the filter notice; Add to list, then Add to a paper.
- **Export:** add an authored question to a paper and export the `.docx` (and PDF). It opens
  clean, with no tag, lineage or author chrome leaking (`data-print-hide` on the sheet's
  chrome). `npm run samples` still exports.
- **Backends:** `Preview` is reused, not changed. If a package touches it anyway, re-run
  `scripts/lq-verify.mjs` and `scripts/cover-verify.mjs`.
- **Baseline:** `npm test` (not bare vitest), `npm run typecheck`, `npm run lint` at the 43
  known problems, `npm run build` (postbuild bundle check), `src/test/codemap.test.ts` if
  docs cite new paths.

## Risks and open questions

**For the user (phrased for a teacher):**

1. **New question from this:** a separate question, or another version of the same one? A
   separate question gets its own topics and history. A version shares topics, and a class
   that sat one counts as having seen the other. Recommended: **separate** (a variant is for
   reuse). Improving a question in place stays Open in worksheet.
2. **No bank yet:** ask for a name the first time (recommended, like a new worksheet), or
   quietly make "Question bank"?
3. **Edit an existing bank question in the same sheet**, instead of Open in worksheet? The
   machinery allows it; left out of the first version to keep "the bank's copy" and "a
   paper's copy" distinct.

**Engineering risks:**

- **Big banks.** Each autosave rewrites the whole bank document (web quota; desktop file
  plus its own bank index file; the single ~14 MB `index.json` became a file per document
  on 2026-10-03). The sheet does not add to it, but it makes banks grow faster.
- **Two trees mounted** (bank screen and editor). The dimmed rail re-renders per autosave
  publish (~10 ms at 9k rows). Accept, and measure in the browser pass.
- **Preview internals that read the store** (`buildPageMenu`, the AI multi-select button)
  see the whole bank, not the projection. By-id lookups are safe; anything positional must
  be checked in WP-B.
- **Second tab** holding the same bank (known, unchanged).

## What not to do

- **No second editor.** No form-based question editor on the bank page: printed text is
  typed on the page, and only there.
- **No free-form canvas and no new layout primitive.** The sheet is the ordinary page,
  projected.
- **No store factory or second store instance** for this feature (see C).
- **No new stored field and no draft storage key.** The bank document is the draft.
- **No server.** AI stays bring-your-own-key through the existing door.
- **Nothing on the paper.** Chrome is `data-print-hide`; no tag or lineage reaches the IR.

## Work breakdown

Branch from `develop`; each package in its own Opus worktree, briefed with the base SHA.
WP-0 lands first; A, B and C then run in parallel against its contracts and own the files
listed.

- **WP-0 · Contracts (S).** src/library/authoring.ts, focusProjection.ts, bankAuthor.ts
  (session API, pending focus and pick, last paper) with unit tests; the `onAuthor` prop
  threaded through `StartScreen.tsx` → `QuestionBankScreen.tsx` as a stub; `addTarget`
  reading the last paper. Needs the per-part tag API name, or builds on question-level tags
  with one call to swap. Verify: `npm test`, typecheck, lint 43.
- **WP-A · Host (S–M).** `EditorHost.tsx`: start and end the session, the sheet over the
  start screen, `open()` ending a session by value, last-paper memory. Verify: unit tests
  for every leave path; browser: start, Done, a file dropped mid-session, desktop
  restart-to-update reasoning.
- **WP-B · Author mode (M).** `EditorApp.tsx`, `Inspector.tsx`, AuthorBar, `assist/scope.ts`,
  the `PageContextMenu`/`ContextBar` audit. Verify: Chromium and WebKit screenshots of the
  sheet at 1024, 1280 and 1600px; a diagram drawn; ⌘Z inside the sheet; ✦ AI (mock) scoped
  to the question; `.docx` of a paper holding the question is leak-free; lq-verify and
  cover-verify if `Preview` changed.
- **WP-C · Bank surfaces (S–M).** `QuestionBankScreen.tsx` (popover, stand-down, pending
  focus and pick, filter notice), `ReviewPage.tsx`, `TopicCards.tsx`, `PatternsPage.tsx`.
  Verify: every entry point in both engines; the Add-to target survives a sheet; keyboard
  (Space, O and arrows do nothing while the sheet is open).
- **WP-D · Integration (S).** Merge, the full browser pass above, `npm run samples`, docs:
  STATUS, CODEMAP (new paths), SYSTEM_ARCHITECTURE (§ The start screen: the sheet;
  § Store: one editing session at a time), this document's status.

**CHANGELOG** (Unreleased, Added; no em dash; then `npm run changelog`):

- **Write a new question straight from the question bank.** Press New question on a topic,
  a sub-topic or a 題型 and write it in a panel over the bank, already tagged with where you
  were. It saves into your question bank as you type, and Done brings you back with it
  selected. "New question from this" starts a new question from the one you are reading.
