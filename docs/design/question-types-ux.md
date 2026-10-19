# 題型 (question patterns): UX research and redesign proposal

Status: proposal, 2026-10-19, written against `develop` at `45851ffd`. **First release
(items 1, 2, 3, 5) built the same day on `feature/question-types-v1`; see § 8.** The rest is
not built. The user asked: "I want to improve the 題型 page, or even the whole
functionality. If I start from scratch, I don't really know how to use it." Screenshots
are in `docs/design/question-types-ux/`. They were taken from the dev build at 1440×900 in
three states: an empty library, the website demo library (37 questions, no 題型), and that
library plus an invented elasticity set with six 題型.

Read first: `docs/design/question-library.md` § 題型 / Pattern (C24), which records the
decisions this proposal keeps or questions, and `docs/design/ai-pattern-questions.md` (E7).

## 1. What exists today

### The model the code assumes

- **A 題型 is (sub-topic, question type, name).** For example: C.ped, MCQ, "Calculate PED
  from a change in TR". Coarse topics (C) hold none. The question's own registry type
  decides which list it is on, so MCQ and LQ keep separate lists.
- **It is stored on the question as a tag**, `C.ped::<name>` (`src/model/patterns.ts:parsePatternTag`).
  It rides on `Question.tags` (or a part's `tags`), so every copy carries it, every topic
  write reaches every copy, and it is never printed, never in the IR, and never in
  `contentKey`. One 題型 per sub-topic per part. Note that **the tag does not record the
  type**: the type only decides which list the name is shown on.
- **The name is the identity.** Names match ignoring case, spacing and punctuation. Rename,
  merge and delete rewrite every copy of every question that uses the 題型
  (`src/library/patterns.ts:patternWrites`).
- **An app-level registry** (`src/storage/patterns.ts`, key `econ-worksheet-patterns`)
  keeps names a teacher defined before any question uses them. It is validated per row,
  rides in backups, and is read-only when a newer build wrote it. The list shown is the
  registry joined with names found on questions (`src/library/patterns.ts:listPatterns`).
- **No default list ships.** Each teacher defines their own (user decision, 2026-09-29).
- **What a 題型 is used for today: grouping and filtering only.**
  - The review rail splits a sub-topic by 題型, with "No 題型" last.
  - The Filter has a 題型 field.
  - Topic cards count the 題型 in use.
  - Fill, coverage, the editor's 題庫 tab and ✦ AI ignore 題型 entirely
    (`src/library/fill.ts:pickFill` filters on topic and type only).

### Where 題型 appears in the UI

| Surface | File | What it does |
|---|---|---|
| 題庫 header button "題型 Patterns" | `src/components/bank/page/QuestionBankScreen.tsx` | The only way into the manage page |
| Manage page | `src/components/bank/page/PatternsPage.tsx` | New, rename, merge, delete; "N questions →" opens the review page filtered to that 題型 |
| Picker under a ticked sub-topic | `src/components/bank/PatternPicker.tsx`, `src/components/bank/patternOptions.ts` | Pick or type a 題型. A typed name is registered at once and survives Cancel |
| Topics dialog, bulk Set topic, tag as you go | `src/components/bank/page/TopicPickerDialog.tsx` | The same picker. Bulk can only *set* a 題型 when every pick is one type |
| Editor Topic row | `src/components/editor/TopicRow.tsx` | The same picker under each sub-topic chip |
| Review rail and facts | `src/components/bank/page/ReviewPage.tsx` | 題型 sub-headings in the rail; a "題型" fact row (plain text, not a link) |
| Filter | `src/components/bank/page/FilterPopover.tsx` | A "題型" select, scoped to the topic on screen |
| Topic cards | `src/components/bank/page/TopicCards.tsx` | "· 4 題型", with the names in a native `title` tooltip |
| Editor 題庫 tab | `src/components/bank/BankTab.tsx` | **Nothing.** No filter, no row meta, and Fill does not use 題型 |

## 2. Walking it as a first-time teacher

### Empty library

![Start screen](question-types-ux/a1-start-en.png)
![Empty bank](question-types-ux/a2-bank-empty-en.png)
![Empty 題型 page, en](question-types-ux/a3-patterns-empty-en.png)
![Empty 題型 page, 中文, a name typed and Add still grey](question-types-ux/a4-patterns-typed-no-subtopic-zh.png)

- **Nothing on the start screen mentions 題型.** The path is Home → Question bank 題庫 →
  "題型 Patterns". That is two clicks, and only for someone who already knows the word.
- **The bank with no questions still offers the 題型 button.** It leads to a page for
  defining names for questions that do not exist yet.
- **The intro says what a 題型 is, not why I would want one.** "The kinds of question you
  set within a sub-topic… Renaming, merging or deleting one changes every question…" Half
  of it is a warning about an action I have not taken. Nothing says what I get: find a
  kind of question fast, see which kinds a paper is missing, refill a worksheet with "two
  more like this".
- **The first control I see is "New 題型 [Choose a sub-topic ▾] [MCQ ▾] [name] [Add]".**
  I have to pick from about 40 sub-topics before I have any reason to.
  - In a4 the name is typed and Add stays grey. Nothing says why: the reason is that no
    sub-topic is chosen.
- **Empty state: "No 題型 yet. Add one above, or while you set a question's topic."** This
  has no example, no picture of the result, and no starter list.

### A library with questions but no 題型

![Bank with 37 questions](question-types-ux/b1-bank-cards-en.png)
![題型 page: identical to the empty library](question-types-ux/b2-patterns-en.png)
![Review page with no trace of 題型](question-types-ux/b3-review-C-en.png)
![Filter: 題型 greyed, "No 題型 yet"](question-types-ux/b5-filter-en.png)
![Picker: "No MCQ 題型 here yet. Type a name to create one."](question-types-ux/b8-pattern-picker-en.png)
![Typing "calc" offers New 題型 "calc"; Enter would register it](question-types-ux/b9-pattern-picker-typed-en.png)

- **The 題型 page ignores what it knows.** With 37 questions over 12 topics it shows
  exactly the empty-library page (b2). It could say "C Market and Price has 6 questions.
  Start there."
- **On the review page 題型 is invisible until it exists.** There is no "group these by
  題型" invitation. The only clue is the greyed Filter field.
- **Giving a question a 題型 is four levels deep:** review → Edit (Topics) → find the
  sub-topic among 40 rows → "+ Add 題型" → type. And it is one question at a time.
  - Bulk Set topic can do it, but only through a dialog named "Set topic", and only when
    every selected question is the same type.
  - There is no "sort these into 題型" mode, although tag as you go already does exactly
    this for topics.
- **Typing a fragment creates junk.** In b9, "calc" plus Enter registers a 題型 named
  "calc", and it survives Cancel. This was a deliberate decision ("creating is an explicit
  act"), but to a first-time user it is a side effect. Nothing lists unused names for
  cleanup apart from the "Not used yet" label on the manage page.

### A library with 題型

![Topic cards: "13 questions · 4 題型"](question-types-ux/c1-bank-cards-en.png)
![Manage page](question-types-ux/c2-patterns-en.png)
![Manage page, 中文: sub-topic names stay English](question-types-ux/c2-patterns-zh.png)
![Scoped to one sub-topic: no sign of its 3 questions without a 題型](question-types-ux/c2b-patterns-ped-en.png)
![Review rail grouped by 題型, 中文](question-types-ux/c3-review-C-zh.png)
![Filter with 題型](question-types-ux/c5-filter-en.png)
![The 題型 fact is plain text](question-types-ux/c6-review-ped-question-en.png)
![Topics dialog with the 題型 chip](question-types-ux/c7-edit-topics-en.png)
![Editor Topic row: the 題型 chip under the sub-topic](question-types-ux/d1-editor-question-en.png)
![Editor 題庫 tab: no 題型 anywhere](question-types-ux/d3-editor-bank-tab-en.png)

Once 題型 exist, the rail grouping (c3) is the best part of the feature. It reads like a
tutor's revision book. Everything around it works against it:

- **The manage page is a list of names with counts.**
  - There is no sample question, so I cannot tell what "PED and total revenue" looks like.
  - There is no "N without a 題型" line per sub-topic, so I cannot see what is left to sort (c2b).
  - The only route to the questions is the "N questions →" link.
- **MCQ and LQ are side by side as two columns** that are often half-empty ("None yet").
  This split hides that "PED and total revenue" can be tested in both. The tag cannot tell
  them apart anyway: the type only decides which list shows the name.
- **Dead ends.**
  - The 題型 fact (c6) is not a link.
  - The card's "4 題型" names live only in a hover tooltip.
  - "No 題型 · 3" in the rail has no action.
  - The back button says "← Topics", so it is not clear whether the 題型 page is inside a
    topic or above them.
- **Count drift.** The card says 4 題型 while the page lists 5 under C, because the card
  counts only the ones in use.
- **The editor knows nothing.** The Topic row shows and sets 題型 (d1), but the 題庫 tab
  (d3) cannot filter by it, does not show it, and Fill ignores it. Yet the editor is where
  a teacher thinks "I need one more PED-and-TR question".
- **In 中文 UI the sub-topic headings stay in English** (c2-zh), because they follow the
  paper view language. This is consistent with the rest of the bank, but jarring on a page
  that is only chrome.

### The biggest confusion: the word itself

- In Hong Kong, **題型 first means the paper format**:
  - MC 多項選擇題, 短答題, 結構題, 資料回應題 and 論述題.
  - Tutor sites introduce the two papers as "題型各有不同" and list MC and 結構題
    ([HKTutorLink](https://hktutorlink.hk/blog/dse-economics-complete-guide)).
  - DSE apps label practice "MC 題型練習／結構題／資料回應／論述題"
    ([DSE神器](https://www.dseapp.com/dse-econ/)).
  - The richest public HKDSE Econ database gives the name 題型標籤 to *format* tags, and
    keeps a separate axis, 題幹模式 (stem templates), for what Econ Studio calls 題型
    ([OutliersEcon econ-database2](https://github.com/OutliersEcon/econ-database2)).
- The second sense, **常考題型 within a topic**, is real but loose:
  - "每個 topic 常見題型" ([Econ Excelsior](https://www.econexcelsior.com/post/【dse-備戰終極迷思】past-paper-應該操-by-topic-定-by-year？)).
  - MC answer blogs group items as 圖表移動題 or 計算題.
  - Nobody publishes the list.
- **The app uses both senses.** Its own 中文 strings use 題型 for MCQ/LQ:
  - `src/components/editor/AddRail.messages.ts` `eachOwnSection`: "每種題型會放入各自的部分".
  - Several 中文 changelog lines: "放到其題型所屬的部分", "適合其題型的部分".
  - The manage page puts an `[MCQ ▾]` select right beside "新增題型". A teacher reasonably
    reads that select as *the* 題型.
- **There is a third meaning in the code.** E7's "pattern" (`ai-pattern-questions.md`) is
  a derived structural shape: marks, command words, stimulus. The English "Patterns" label
  collides with it too.

## 3. Outside research (summary)

Full notes came from a web research pass on 2026-10-19. Claims marked *inferred* are ours.

- **DSE structure** ([HKEAA 2028 framework](https://www.hkeaa.edu.hk/DocLibrary/HKDSE/Subject_Information/econ/2028hkdse-e-econ-39q.pdf)):
  - Paper 1 is MC (30%).
  - Paper 2 has Section A short questions (26%), Section B structured, essay and data
    response (35%, 33% from 2028), and Section C electives (9% → 11%).
  - The 2025 sample paper's command phrases are Explain, Explain whether, Calculate,
    State, List TWO, Illustrate with a diagram, With the aid of the same diagram, and
    Discuss with reference to sources
    ([sample paper](https://www.hkeaa.edu.hk/DocLibrary/HKDSE/Subject_Information/econ/SamplePaper-2025-ECON-E.pdf)).
  - *Inferred:* a realistic LQ 題型 is "command phrase + concept + stimulus", e.g.
    "Explain the TR change with a diagram".
- **HK publishers organise by chapter, then format, then year.** This holds for Aristo
  ([Economics in Life](https://www.aristo.com.hk/EconomicsInLife3ed/promotion2026/)),
  Pearson ([Exploring Economics](https://econ-ss.pearson.com.hk/)) and HKEP's question bank
  with its "DSE Exam Trend" topic frequency
  ([HKEP](https://www.hkep.com/_v3/index.php?target=publish_detail&mode=b&param0=246&lang=en)).
  None we found exposes a sub-topic pattern filter, so a teacher-built 題型 map is new in HK.
- **International builders filter by fixed taxonomies.**
  - These are topic, question type, assessment objective, command word and marks:
    AQA Exampro ([economics](https://www.exampro.co.uk/economics/)), OCR ExamBuilder
    ([FAQ](https://www.ocr.org.uk/qualifications/past-paper-finder/exambuilder/exambuilder-faqs/)),
    Cambridge Test Maker
    ([page](https://www.cambridgeinternational.org/support-and-training-for-schools/support-for-teachers/teaching-and-assessment/test-maker/))
    and Save My Exams ([test builder](https://www.savemyexams.com/teacher-tools/test-builder/)).
  - OCR's "tick the specific level and its parents" is a known pain. Our sub-topic-scoped
    picker avoids it.
- **Teacher-defined tags exist, but as an add-on to a shipped taxonomy.** Wayground's Custom
  Tags exist because "your school's skill codes don't always match framework standards"
  ([Wayground updates](https://updates.wayground.com/labels/new)). Its onboarding is
  vetted starter content, the "Official Library" per standard.
  - Khan Academy's skills are fixed and teachers cannot add their own
    ([community](https://support.khanacademy.org/hc/en-us/community/posts/360024939712-Using-Assignments-to-Make-a-Custom-Course-)).
  - *Inferred:* no tool asks a new user to invent a taxonomy on an empty page. Each
    shows one first, as content or examples.
- **A 題型 is a hand-made "item model".** An item model is "a template that specifies the
  features in an item that can be manipulated" (Bejar et al. 2003, in
  [Gierl & Lai](https://onlinelibrary.wiley.com/doi/abs/10.1002/9781118956588.ch6)).
  Gierl, Lai & Turner generated 1,248 MC items from one
  ([2012](https://mcc.ca/wp-content/uploads/AIG-Gierl-Lai-Turner-Medical-Education-Journal.pdf)).
  - This is why "write one like this from a 題型" (E7) is the natural payoff of a 題型.
- **雙向細目表:** we found no HK source, only Taiwanese guidance in which rows are units,
  columns are cognitive levels or question types, and cells hold marks
  ([教育百科](https://pedia.cloud.edu.tw/Entry/Detail/?title=雙向細目表)). HK teachers see
  topic frequency instead (HKEP, answer books with 歷年試題分佈).
  - *Inferred:* a topic × 題型 coverage grid is readable to HK teachers, but would be new.
- Existing repo research: `docs/research/2026-09-question-bank.md` § 3–4 (the HK workflow,
  and the Know / Apply / Evaluate bands from command words, C12), and
  `docs/research/2026-09-competitive/intl.md`.

## 4. The redesign

### The job

> **"Show me the kinds of question I set for each sub-topic, let me pull out the kind I
> need, and tell me when a paper is missing one."**

A 題型 earns its tagging cost only when it pays back in three places: **finding**
(browse and filter), **building** (Fill and coverage in the editor) and **writing** (a new
question from a 題型). Today it pays back only in finding, and only on the bank screen.
So the redesign is less about the page and more about wiring 題型 into the places where a
paper is built.

### Principles

1. **Show before asking.** Every empty state shows what a filled one looks like, with this
   teacher's own sub-topics where possible.
2. **Sort questions, don't define names.** Most 題型 are born from a question in front of
   you ("this is a PED-and-TR one"). Defining an unused name is the rare case.
3. **One word, one meaning.** 題型 means the teacher's pattern inside a sub-topic. MCQ and
   LQ are "question type" (題目類型) everywhere, in both languages.
4. **Every 題型 mention is a link** to its questions.
5. **No schema change for documents.** Everything below lives in tags (already shipped),
   derived index data, or the app-level registry.

### Information architecture

```
Home
└─ 題庫 Question bank
   ├─ Topic cards ─────────── card: "13 questions · 4 題型 · 3 to sort"
   ├─ Review (a topic)
   │   ├─ rail: sub-topic → 題型 groups → "No 題型 · 3  [Sort these]"
   │   ├─ 題型 strip above the rail when a sub-topic is in view (chips, counts, + New)
   │   └─ facts: 題型 = link
   ├─ 題型 map  (today's 題型 Patterns page, rebuilt)
   │   ├─ by topic → sub-topic → one list of 題型 (MCQ / LQ badges)
   │   └─ 題型 drawer: example, counts, uses, actions
   └─ Sort 題型  (tag-as-you-go mode for one sub-topic)
Editor
├─ Topic row (unchanged picker)
├─ 題庫 tab: 題型 filter + row meta; Fill "spread across 題型"
└─ Paper summary: coverage by sub-topic and 題型 (missing ones named)
```

### Screen 1: the 題型 map, first run

When the library has questions but no 題型:

```
← 題庫   題型 map 題型                                                    [⚙]
──────────────────────────────────────────────────────────────────────────────
  Group each sub-topic's questions into the kinds you set, like a revision
  book: "Calculate PED", "PED and total revenue", "Explain TR with a diagram".
  Then filter by them, and let Fill pick one of each.          Never printed.

  ┌ What it looks like ───────────────────────────────────────────────────┐
  │ C · Price elasticity of demand                                         │
  │   Calculate PED from price and quantity      MCQ   4 questions         │
  │   PED and total revenue                      MCQ   3 · LQ 1            │
  │   Explain the change in TR with a diagram    LQ    2 questions         │
  │   No 題型 yet                                      5                   │
  └────────────────────────────────────────────── (example, greyed) ──────┘

  Start where you have the most questions:
   [ C · Price elasticity of demand · 6 questions   Sort them → ]
   [ D · Market structure · 3 questions             Sort them → ]
   [ J · Trade · 3 questions                        Sort them → ]

  Or name one before writing questions:  [+ New 題型]
```

- **The example card is chrome**, greyed and not data. Its text comes from the catalogue, so
  "No default list ships" still holds.
- **"Sort them" opens Screen 3 for that sub-topic.** The suggestions are the three
  sub-topics with the most questions without a 題型 (derived from the index rows).
- **Empty library:** the same intro and example, then "Your 題型 map fills as you write
  questions. [Start a classroom worksheet]". There is no New form, so nothing is defined
  for questions that do not exist.

### Screen 2: the 題型 map, in use

```
← 題庫   題型 map    [Search 題型…]   Show [All topics ▾]   [Unused · 2] [⚙]
──────────────────────────────────────────────────────────────────────────────
  31 of 44 questions have a 題型 · 13 to sort

  C  Market and Price
  ┌ Price elasticity of demand ─────────────────── 9 questions · 3 to sort ┐
  │ Calculate PED from price and quantity     MCQ  2 →   ⋯                 │
  │ Factors affecting PED                     MCQ  1 →   ⋯                 │
  │ PED and total revenue                     MCQ  2 →   ⋯                 │
  │ Explain the change in TR with a diagram   LQ   1 →   ⋯                 │
  │ Discuss a pricing decision using PED      LQ   not used yet  ⋯         │
  │ No 題型                                         3   [Sort these]       │
  │ [+ New 題型 here]                                                      │
  └─────────────────────────────────────────────────────────────────────────┘
  ┌ Market intervention ────────────────────────── 2 questions · 2 to sort ┐
  │ No 題型 yet                                      2   [Sort these]       │
  └─────────────────────────────────────────────────────────────────────────┘
```

- **One list per sub-topic, with a type badge.** It replaces the two half-empty columns.
  The identity is still (sub-topic, type, name), so nothing in storage changes (open
  question 3).
- **Sub-topics with questions but no 題型 are listed too.** That is the to-do list. Empty
  sub-topics are hidden behind "Show all sub-topics".
- **"+ New 題型 here" lives in the sub-topic's own box.** The sub-topic is never chosen from
  a list of 40, and the type is chosen in the form after the name:
  `Name [……] Type (•) MCQ ( ) LQ  [Add]`.
  - A disabled Add says why, in a line under the form: "Choose a sub-topic first" or "Type a name".
- **⋯ holds Rename, Merge into…, Delete.** These are the rare actions and should stay out
  of the line.
- **"Unused · 2" is a filter chip** that lists registered names no question carries.
  Accidental "calc" entries get cleaned up here.
- **Count words match the cards:** "4 題型 in use · 1 unused".

### The 題型 drawer (click a name)

```
┌ PED and total revenue ── MCQ · C Price elasticity of demand ──────── ✕ ┐
│ ┌ example ─────────────────────────────────────────────┐  ‹ 1 of 2 ›    │
│ │ A firm raises its price and its total revenue rises…  │              │
│ └───────────────────────────────────────────────────────┘              │
│ 2 questions · 1 mark each · used with 5A (Oct 2026) · 1 never used     │
│ Note (optional): Direction of TR change from elastic / inelastic       │
│                                                                         │
│ [Review these 2]  [Add to list]  [+ New question like this]  [✦ Write  │
│                                                           one like this]│
│ Rename · Merge into… · Delete                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

- **The example is the question preview** already used on the review page
  (`src/components/bank/page/PaperPreview.tsx`). By default it shows the most recently
  used question; a teacher can pin one (open question 4).
- **"Used with" and "never used"** come from the index's use history (C5). "Add to list"
  puts every question into the cart.
- **"+ New question like this" is C25** (`docs/design/bank-authoring.md` already lists a
  題型-row entry point). **"✦ Write one like this" is E7 stage 4**, which takes the 題型
  as its pattern. Both stay hidden until those features ship.

### Screen 3: Sort 題型 (one sub-topic at a time)

This is tag as you go (`src/components/bank/page/TagAsYouGo.tsx`) with 題型 as the keys:

```
← 題型 map   Sort 題型 · C Price elasticity of demand · 3 left
──────────────────────────────────────────────────────────────────────────────
  ┌──────────── question preview (print size) ───────────────┐
  │ 6. Demand for salt is price inelastic mainly because…     │
  └───────────────────────────────────────────────────────────┘
   MCQ 題型:
   [1] Calculate PED from price and quantity
   [2] Factors affecting PED
   [3] PED and total revenue
   [N] New 題型…           [S] Skip      ⌫ Undo last
```

- **Only this type's 題型 are offered**, because the question's type decides its list.
- **A question with parts gets the existing part strip**, and the keys set the 題型 of
  the chosen part.
- **Writes go through the same path as tag as you go**: one `everywhere` edit per copy, and
  ⌫ undoes the last.
- **When nothing is left:** "All 9 PED questions have a 題型. [Next: Market intervention
  · 2 →] [Back to the map]".

### Review page and editor additions

- **A 題型 strip on the review page.** When the rail's sub-topic is in view, a row of
  chips sits above the questions: `Calculate PED 2 · PED & TR 2 · Factors 1 · No 題型 3`.
  Clicking a chip sets the Filter, and clicking it again clears it.
- **The "題型" fact is a link** that applies the filter. The rail's "No 題型" heading gets
  a "Sort these" text button.
- **Tray action "Set 題型…".** A one-type selection gets the picker directly. For a mixed
  selection the button says "Select MCQ or LQ only to set a 題型" instead of a hidden rule.
- **Editor 題庫 tab.** Add a 題型 select under the topic select when a sub-topic is chosen,
  and show the 題型 name in each row's meta (`MCQ · 1 mark · PED and total revenue`).
- **Fill gets one option:** "One of each 題型 first". It picks round-robin across the
  topic's 題型 before repeating, and keeps the existing order rule (best match, least
  recently used) inside each 題型. This is deterministic, so it stays inside the "Fill is
  deterministic" decision.
- **Paper summary / coverage** (C13, IDEAS "題型 in Fill and coverage"): "C Price
  elasticity of demand: 3 of 5 題型 · missing: Factors affecting PED, Discuss a pricing
  decision [Fill these]".

### Wording (catalogue drafts, `docs/design/ui-language.md` rules)

| Key | English | 中文 |
|---|---|---|
| Page title | 題型 map | 題型一覽 |
| Header button | 題型 | 題型 |
| Intro | Group each sub-topic's questions into the kinds you set, like a revision book. Then filter by them, and let Fill pick one of each. Never printed. | 按你設定的題目種類，把每個子課題的題目分組，就像溫習書一樣。之後可按題型篩選，並讓「填入」每種揀一題。題型不會被列印。 |
| To sort | 13 to sort | 13 條待分類 |
| Sort these | Sort these | 分類這些題目 |
| Sort mode title | Sort 題型 · {sub-topic} · {n} left | 分類題型 · {sub-topic} · 尚餘 {n} 條 |
| Unused chip | Unused · {n} | 未使用 · {n} |
| New here | + New 題型 here | + 在此新增題型 |
| Why Add is grey | Choose a sub-topic first. / Type a name. | 請先選擇子課題。／請輸入名稱。 |
| Fill option | One of each 題型 first | 每種題型先揀一題 |
| Coverage | {k} of {n} 題型 · missing: {names} | {n} 個題型中有 {k} 個 · 未有：{names} |
| Type (everywhere) | Question type: MCQ / LQ | 題目類型：MCQ／LQ |

- "Fill" is 填入 in the 題庫 tab's catalogue (`src/components/bank/messages.ts`); the
  strings above follow it.
- **The collision fix (S):** `AddRail.messages.ts:eachOwnSection` changes to
  "每種題目類型會放入各自的部分". From now on, 中文 changelog lines say 題目類型 for MCQ/LQ.
  Published changelog entries stay as they are. Add `題型` and `題目類型` to the
  standard-translations table in `docs/design/ui-language.md`, with this meaning.
- **English stays "題型"** (as today, a kept term) with the gloss "question pattern", not
  "Patterns". This avoids E7's "pattern" (derived shape). E7 should rename its internal
  type to `QuestionShape` before it is built.

## 5. New functions, ranked

Value is to a teacher building papers; effort uses the repo's S/M/L.

| # | Function | Value | Effort | Storage |
|---|---|---|---|---|
| 1 | Word fix: 題目類型 for MCQ/LQ in 中文 strings; "question pattern" gloss | High: removes the main misreading | S | None |
| 2 | Every 題型 a link (fact row, card names, rail heading) | Med | S | None |
| 3 | First-run map: intro, greyed example, "start where you have most questions"; Add says why it is grey | High | S | None |
| 4 | Sort 題型 mode (tag as you go for 題型) and "Sort these" entry points | High: the fastest path from 0 to useful | M | None (tags) |
| 5 | Editor 題庫 tab: 題型 filter and row meta | High | S | None |
| 6 | Fill "One of each 題型 first" | High | S–M | None |
| 7 | Map rebuilt: one list per sub-topic with badges, to-sort counts, ⋯ actions, Unused chip | Med | S–M | None |
| 8 | Review-page 題型 strip; tray "Set 題型…" | Med | S | None |
| 9 | Coverage by 題型 in the paper summary (with C13) | High for uniform tests | M | None (derived) |
| 10 | 題型 drawer: example question, stats (count, marks, classes, last used, never used) | Med | M | None (derived) |
| 11 | Optional note per 題型, pinned example | Low–Med | S | Registry: optional fields on a row (see below) |
| 12 | "+ New question like this" from a 題型 (C25 entry point) | Med | (C25) M–L | None beyond C25 |
| 13 | ✦ Write one like this from a 題型 (E7 stage 4) | High, later | L | None beyond E7 |
| 14 | Opt-in starter 題型 for common sub-topics | Med for new users | M (content) | Registry rows only |

Build order: 1–3 and 5 together as one small release ("題型 that pay off"), then 4 and 6,
then 7–10. Items 12–13 wait for C25 and E7, which are parked.

### Backward compatibility

- **No document schema change.** Nothing touches `src/model/types.ts` or `KNOWN_KEYS`.
  Every function reads the existing `C.ped::name` tags, so every saved document opens and
  prints as before.
- **Item 11 adds optional fields to registry rows** (`note`, `exampleRootId`). The registry
  already passes extra fields through (`usablePatternEntry` spreads the row). Before
  building, verify that an older build's rename and delete keep the new fields, by
  extending `src/storage/patterns.ts`'s tests. If they do not, bump `PATTERNS_FORMAT` so
  older builds treat the registry as read-only.
- **Merging the MCQ and LQ lists in the UI** (item 7) keeps the identity (sub-topic, type,
  name). If the user instead wants one 題型 shared across types (open question 3), the
  tags still need no change, because they never held the type. Only `listPatterns`'s
  grouping and the registry's `typeId` meaning change, and a registry `format` bump
  protects older builds.

## 6. Open questions for the user

**Answered 2026-10-19:** (1) keep 題型, say 題目類型 for MCQ/LQ, gloss "question pattern";
(2) no starter set; (3) one list per sub-topic with MCQ/LQ badges, identity unchanged; (4)
the example is derived (most recently used question), no new stored field.

1. **The word.** Keep 「題型」 for the teacher's pattern, and say 題目類型 for MCQ/LQ
   everywhere? Or rename it (e.g. 考法, 出題模式) to give up the format sense?
   **Recommended: keep 題型** (it is your word, and the tutor sense is real), fix the
   collisions, and always show it under its sub-topic.
2. **A starter list.** The decision so far is "no default list ships". Should the map offer
   an *opt-in* starter set for about 10 high-frequency sub-topics (PED, market
   intervention, AD–AS, money creation…), which teachers can rename or delete?
   **Recommended: not in the first release.** Ship the greyed example and Sort mode first,
   and see whether teachers still stall. If they do, you write the starter set (both
   languages) and it lands as registry rows on one click.
3. **MCQ and LQ: one 題型 or two?** "PED and total revenue" is tested both ways.
   **Recommended: one list per sub-topic with type badges, identity unchanged** (two
   entries with the same name). Revisit sharing only if teachers ask to filter "this
   題型, any type".
4. **The pinned example and note** (item 11). Worth a registry field, or is "the most
   recently used question" enough? **Recommended: derived example first, no new fields.**

## 7. How this was checked

- **Source read:** `src/model/patterns.ts`, `src/library/patterns.ts`, `src/storage/patterns.ts`,
  `src/components/bank/page/PatternsPage.tsx`, `src/components/bank/page/QuestionBankScreen.tsx`,
  `src/library/fill.ts`, the bank catalogues.
- **Screenshots:** the dev server (`next dev`) driven by Playwright with the system
  Chrome. Storage was seeded in two ways:
  - the website demo library (`scripts/demo/site-seed.test.ts`);
  - a throwaway seed adding one elasticity worksheet (6 MCQ, 1 LQ) and six registry rows.
    It was not committed.
- **Not checked:** the desktop shell, dark mode, narrow windows, and the bulk Set topic
  dialog's 題型 branch.

## 8. What shipped (first release, 2026-10-19)

No storage change: no document field, no registry field, no `format` bump.

- **Item 1, the word.** 中文 strings that meant MCQ/LQ now say 題目類型
  (`AddRail.messages.ts:eachOwnSection`, the 題庫 tab's Type select and Fill type, the
  Filter's Any type, the tray's sort, the bulk Set topic note). The page is **題型 map /
  題型一覽**, the header button **題型**; English glosses it "question pattern" (intro,
  the 題庫 tab's 題型 select, the header button's tooltip). `題型` and `題目類型` are in
  `docs/design/ui-language.md` and `src/i18n/terms.ts`.
- **Item 2, links.** The review page's 題型 fact and the rail's 題型 headings filter the
  review to that 題型; a topic card's "N 題型 →" opens the map scoped to the topic (a
  button beside the card's, never inside it); map names and counts open their questions;
  a 題庫 tab row's 題型 sets the tab's 題型 filter.
- **Item 3, the map.** First run: intro, greyed example (catalogue text, `EXAMPLE_TOPIC`),
  "Start where you have the most questions" (`src/library/patterns.ts:startingSubTopics`,
  top 3 by questions without a 題型), each with Review these (the review of that
  sub-topic, landing on a question without one) and + New 題型 here; "Or name one for any
  sub-topic: New 題型" opens the old form, whose grey Add now says why. An empty library
  gets the intro, the example and Start a classroom worksheet, no form. In use: a summary
  ("4 題型 in use · 1 not used yet"), per topic a box per sub-topic that has 題型 (one list,
  type badges, count link, ⋯ for Rename / Merge / Delete, "No 題型 · n  Review these →",
  + New 題型 here with Name then Question type), and one compact list of the sub-topics
  still to sort; "Show sub-topics with no questions" adds the empty ones.
- **Item 5, the editor 題庫 tab.** A 題型 select appears under a chosen sub-topic when
  questions outside the paper carry 題型 there (`src/library/tabFilters.ts:tabPatternChoices`;
  a name matches any type unless Type narrows it); rows name their 題型 apart from the
  topics ("題型 PED and total revenue"). Fill still ignores 題型 (item 6).
- **Fixes.** The picker no longer registers a typed name (`PatternPicker.tsx:commitPatternOption`):
  a dialog keeps it only by saving, the editor's Topic row (which applies at once)
  registers it then. Cards count every 題型 the map lists under the topic, used or not.
- **Not built:** Sort mode (4), Fill by 題型 (6), the Unused chip and "to sort" counts on
  cards (part of 7), the review-page strip and tray "Set 題型…" (8), coverage (9), the
  drawer and its derived example (10); 11–14. The proposal's "Sort them →" became
  "Review these →" until Sort mode exists.
