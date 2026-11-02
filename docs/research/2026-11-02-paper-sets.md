# Paper sets: linking Paper 1, Paper 2 and their answers (research, 2026-11-02)

Task k-0299, from the user (u-76b6): *"I want better cross-worksheet control. When we have a mock,
I remember we implemented something for cross Paper 1 / Paper 2 / answer linkage, but I feel the
UI is not enough. We have a simple folder creation or grouping now, but the in-app linkage is
still a bit loose. It is hard for me to tell if two papers are actually linked together for the
same test, the same quiz, or even the same exam."*

Research and design only. **Nothing is built until the user picks an option (§ 7).**

## 1. Short answer

- **No link between documents is stored anywhere.** A mock is two unrelated documents. Three
  things only *look* like links:
  - a **folder** (filing on this computer only);
  - the **combined answer key**, ticked by hand at every export and saved nowhere;
  - the same exam name typed by hand on each cover.
- Within one paper, the paper ↔ answers link is already tight: the answers and marking scheme live
  *inside* the paper (Teacher view, Marking scheme view). What is loose is **paper ↔ paper**.
- Comparable tools agree on two points. Exam builders make **the paper the unit, with the mark
  scheme derived from it**, as here. Exam boards tie a set together with **shared identity printed
  on every paper** (exam, year, subject, paper number), not with a container (§ 4).
- **Recommendation: Option 2, the "Paper set", built in three steps (§ 6).** Each paper stores
  which set it belongs to and its role (`paperSet: { id, name, role }`). The link then travels
  with the paper through sync, `.json`, backups and older builds. The app shows it as a badge, a
  set group on the dashboard, a "Papers in this set" strip in the editor, and an export of the
  whole set. Step A alone (≈ 2 sessions) already answers "are these two linked?".

## 2. What exists today (audit, verified in code and in Chrome, EN + 中)

Walked as a teacher on `develop` (205a182e): built *S6 Mock Paper 1 2026-27* (Paper 1 mock · MCQ),
*S6 Mock Paper 2 2026-27* (Paper 2 mock · booklet) and an unrelated *S5 Final Exam Paper 1*. Then
made a folder, filed the two mock papers, duplicated Paper 1 and exported the answer key. All of it
was done again with the 中文 interface.

### 2.1 Every "link" there is

| Mechanism | Where | What it stores | Seen by the teacher |
|---|---|---|---|
| Folder | `src/storage/folders.ts:FolderState` (`econ-worksheet-folders` / `worksheets/folders.json`) | doc id → folder id, outside the documents | Dashboard rail only, and only when that folder is selected |
| Combined answer key | `src/render/answerKey.ts:renderCombinedAnswerKey`, `src/components/editor/KeyDocumentsField.tsx` | **nothing**: "Export-time only: nothing here is stored on either document" | Export → Answer key / Both → **.docx** → "Also include" |
| Cover identity | `src/model/coverTypes.ts:CoverPage` (free-text `CoverLine`s), defaults from `src/model/cover.ts:createCoverPage` | each paper's own text: school, "S.6 MOCK EXAMINATION 2026-27", corner "2026-27 / ECON / PAPER 1", page code "2026-27-ECON 1–n" | On the printed page, and in the card thumbnails if you squint |
| Classes and date sat | `Worksheet.classes`, `Worksheet.satOn` | per paper, for the question bank's "used with" | Setup, 題庫 |
| Document shape | `src/model/documentShape.ts` (derived) | nothing (derived) | Card label "Mock exam paper", the same for Paper 1 and Paper 2 |

The answer key, Teacher version and marking scheme are **views of each paper**, not separate
documents (`answerKeyView`, glossary "Marking scheme view"). So "answer linkage" between two
documents only ever happens in the combined key at export.

### 2.2 How a teacher makes, sees and breaks a link today

| Step | What happens | Loose because |
|---|---|---|
| **Make** Paper 2 after Paper 1 | The New worksheet form asks School and Examination again, empty (placeholders `SCHOOL NAME`, `S.6 MOCK EXAM 2026-27`) | Nothing carries over. Our P2 cover kept `SCHOOL NAME` while P1 said *St Mary College* |
| **Make** a group | Folder → New folder → name → Move to folder… on each card (2 dialogs per paper) | A folder means "filed together", not "same exam". Typical folders hold a class's whole term |
| **See** it on the dashboard | Three identical "Mock exam paper" cards, newest first (`today-dashboard.png`) | Nothing says P1 and P2 are a pair. The S5 paper looks just as related. In 中 the folder name is cut to "中六 Mock 202…" in the rail (`today-dashboard-zh.png`) |
| **See** it inside a paper | Nothing: no mention of the other paper anywhere in the editor | The teacher has to go home to find Paper 2 |
| **Export** the marking scheme | Export → Answer key → Also include lists **every** saved document, newest first, by name and date (`today-export-also-include.png`) | Unrelated papers, banks and copies are all listed. The ticks are forgotten after each export. `.docx` only (no PDF, no print). Question papers can't be included: "export the mock" is 3 separate exports |
| **Duplicate** a paper | Copy saved beside the original, **in the same folder**, title + " (copy)" (`today-folder-after-duplicate.png`) | The folder now holds two "Paper 1"s with identical covers. Also include then lists two "S6 Mock Paper 1 2026-27"-like names. The suffix stays English, "(copy)", in the 中 interface (`appendCopy`) |
| **Rename** | Name and title per paper | Fine on its own, but nothing keeps the pair's names in step |
| **Sync** to the other Mac | Documents and Trash sync; **`folders.json` does not** (`docs/design/sync-engine.md` § source interface: "v1 syncs documents and Trash only") | On the second computer every paper is at root: the grouping is gone |
| **Download .json / open it elsewhere** | The file holds the document only | No folder, no partner: it lands at root |
| **Back up / restore** | Folders ride in `manifest.json` (`src/storage/backup.ts`) | The one path that keeps grouping |
| **Trash / delete forever** | Folder assignment kept while in Trash, dropped when purged | No warning that "this is half of a mock" |
| **Cover consistency** | Each cover is free text | Change the exam date or name on one cover and the other silently disagrees. Nothing checks it |

### 2.3 What already works, and should be kept

- The combined key (`renderCombinedAnswerKey`) is correct and well tested: each part keeps its own
  numbering, layout and page setup, and one document stays byte-identical. A set only needs to
  **feed it the right documents automatically**.
- Unknown top-level fields have survived round-trips in every released build since v0.2.0
  (`__unknown`, `src/model/migrations.ts`). **A new field on the document survives an older build
  editing it.** This is what makes "store the link in the paper" safe.
- The index has a repair path for rows an older build rewrote (`INDEX_ROW_REV`,
  `src/storage/summaries.ts`, `kindRepairs`). It can carry a set the same way it carries `kind`.

## 3. Where it is loose, in one list

1. **No identity**: nothing says "these papers are one exam". Folder, cover text and name are each
   a guess.
2. **Invisible**: the dashboard and the editor never show a partner. Paper 1 and Paper 2 cards look
   identical ("Mock exam paper").
3. **Fragile**: grouping is lost on sync, on `.json` hand-off and on a fresh computer.
4. **Duplicates muddle it**: a copy joins the folder and prints the same "PAPER 1" cover.
5. **Retyped details drift**: school, exam name, year, date and classes are typed once per paper.
6. **Export is per paper**: the combined key is picked from all documents every time, `.docx`
   only, and the question papers need separate exports.

## 4. How comparable tools model "one assessment, several papers" (research)

Fuller notes and links are in the agent report summarised here. All checked 2026-11-02; anything
not confirmed is marked.

| Tool | Model | Notes |
|---|---|---|
| OCR ExamBuilder (closest analogue) | One test per object. Export ticks **question paper / mark scheme / both**. Cover filled from the test's marks, time and date | No folders, no grouping into a mock. Clone adds "clone" to the name. [FAQ](https://www.ocr.org.uk/qualifications/past-paper-finder/exambuilder/exambuilder-faqs/) |
| Pearson examWizard, CCEA Paper Builder, exam-mate | One paper per object. The mark scheme is generated from it ("Download Mark Scheme") | No multi-paper object found. [CCEA](https://ccea.org.uk/learning-resources/paper-builder), [exam-mate](https://www.exam-mate.com/faq/Build%20Exam) |
| ExamView | One source test, up to 26 versions, a **version ID** matching each version to its key, plus a version map | The "set" is derived outputs, as our versions are |
| HKEdCity Online Question Bank (HKEAA items) | "Create Paper" → Test / Exercise / Revision, published to groups. Economics is MC only | Still one paper per object. [edcity](https://www.edcity.hk/questionbank/en) |
| HKEAA papers | Identity is **printed on every paper**: "ECONOMICS PAPER 1", page code "HKDSE-ECON 1–1", "2–1". Marking scheme published per year | Our covers already copy this (corner block, page code) |
| Cambridge (CAIE) | Files named `9708_s24_qp_12` / `_ms_12`: syllabus, series, document type, component | Two levels: series (examiner report, thresholds) and paper |
| Edexcel / AQA | "Paper Reference 9EC0/01", session date on the cover. AQA lists Question Paper / Mark Scheme / Insert per paper | Identity = shared metadata |
| Google Classroom / Teams | One **assignment** holds several attachments. "Make a copy for each student" | Container = the assignment |
| Canvas modules | An ordered container **linking** existing items | The container doesn't own the files |
| Google Drive | Since 2020, **one home folder per file plus shortcuts**. Multiple parents were dropped as confusing | Folders can't be copied |
| Notion relations | Two-way relations; **duplicating turns them one-way** | Duplication is where links break |
| Word master documents | A master holds links to separate files | Known for dangling links when files move |
| Scrivener collections, Finder tags | One home, many lateral collections or tags. Finder tags live **in the file** and survive copy and iCloud | The tag-in-the-file pattern |
| Figma | "Send a copy of a folder" duplicates the whole group | Duplicate-the-set pattern |

**Patterns that recur, and what fits us (local-first, separate files, optional folder sync):**

1. **The paper is the unit; the key is derived from it.** That's us already. Don't make the
   marking scheme a separate member document.
2. **Identity through shared metadata printed on each paper**, not a container. It fits well: a
   set id plus role stored *inside* each paper, like a Finder tag.
3. **One home, lateral membership.** Keep folders for filing (class, term); a set is a separate
   lateral grouping, never a second folder.
4. **Duplication breaks links unless the whole group is copied.** So: "Duplicate set" (new id,
   every member) and "Duplicate paper" (leaves the set).
5. **Export picks what goes out** (paper / key / both, versions): extend it to "the whole set".
6. **Set-level checks** (Schoology-style running totals): same exam, year and school on every
   cover; time and marks per paper.
7. **A container file as the source of truth** (Word master doc, Canvas): weak fit here. It needs
   a new synced file type, and every missing member becomes a dangling link.

## 5. Options

All three keep: the per-paper Marking scheme view; `renderCombinedAnswerKey`; folders as they are;
and every saved document opening unchanged (none of them bumps `CURRENT_SCHEMA_VERSION`).

### Option 1 — Linked papers (light)

**What the teacher sees**

```
Dashboard card                       Editor top bar
┌────────────────────┐               ┌─────────────────────────────────────────┐
│   [ cover thumb ]  │               │ S6 Mock Paper 1 2026-27  🔗 Paper 2 ▸   │
├────────────────────┤               └─────────────────────────────────────────┘
│ S6 Mock Paper 1    │                 ▸ opens the partner; the menu has
│ Mock exam paper    │                   "Link to another paper…" / "Unlink"
│ 🔗 with Paper 2    │
└────────────────────┘
Card menu: Open · Rename… · Duplicate · Link to another paper… · Move to folder…
Export → Answer key: "Also include" lists linked papers first, already ticked.
```

- **Data**: `Worksheet.linkGroup?: string`, a random id shared by linked papers (in `KNOWN_KEYS`).
  The partner list is derived by grouping on it. No name, no role: "Paper 1/2" comes from the
  document shape.
- **Migration**: none. Absent = unlinked. Old builds keep the field (`__unknown`).
- **Sync / .json / backup**: free (it lives in the document).
- **.docx**: no change. Export pre-ticks partners.
- **Gaps**: no name for the group, so "same quiz / same exam" is still only a 🔗. Nothing shared, no
  whole-set export. Duplicating needs a rule (copy leaves the group).
- **Size**: S–M, about 2 sessions.

### Option 2 — Paper set (recommended)

A **set** is a named group of papers sitting one exam (a mock, a test, a quiz). Every member
stores the set's id, name and its own role. No set file exists: the set is "the papers that carry
this id".

**What the teacher sees**

```
Dashboard (grid)                                       Set selected / expanded
┌──────────────────────────────────────────────┐
│ ▣ S6 Mock 2026-27 · Exam set · 2 papers   ⋯  │  ⋯ = Open Paper 1 · Open Paper 2 ·
│ ┌────────────┐ ┌────────────┐                │      Export set… · Duplicate set… ·
│ │ [P1 cover] │ │ [P2 cover] │                │      Rename set… · Ungroup
│ │ Paper 1    │ │ Paper 2    │                │
│ │ 45 MC · 1h │ │ 3 sec · 2½h│                │  The two cards stay normal cards
│ └────────────┘ └────────────┘                │  (open, rename, move to folder…);
│ St Mary College · 10 Feb 2027 · 6A 6B        │  the frame shows they belong together.
└──────────────────────────────────────────────┘
List view: one row per paper, with a set chip "S6 Mock 2026-27 · P1".
Search and the Kind filter treat the group as one unit.
```

```
Editor: a thin strip under the top bar (print-hidden, chrome only)
┌───────────────────────────────────────────────────────────────────────┐
│ S6 Mock 2026-27  ·  [Paper 1 ●]  [Paper 2]  ·  Set details…           │
└───────────────────────────────────────────────────────────────────────┘
  Paper 2 opens the partner in place (saves first). The Marking scheme view
  gets "This paper / Whole set" (whole set = the combined key on screen).

Set details… (one dialog, edits every member)
┌───────────────────────────────────────────┐
│ Set name     S6 Mock 2026-27              │
│ Kind         ( Exam ) ( Test ) ( Quiz )   │
│ School       St Mary College              │  ← written to each cover
│ Examination  S.6 MOCK EXAMINATION 2026-27 │     line tagged with it
│ Date sat     10 Feb 2027                  │  ← satOn on each paper
│ Classes      6A  6B                       │  ← classes on each paper
│ Papers       1  Paper 1  S6 Mock P1  ⠿    │
│              2  Paper 2  S6 Mock P2  ⠿    │
│              + Add a paper…               │
│ ⚠ Paper 2's cover says "SCHOOL NAME".     │
│   [ Use St Mary College on every paper ]  │
└───────────────────────────────────────────┘
```

```
Start: "New mock exam (Paper 1 + Paper 2)" beside the four kinds. One form:
set name, school, examination, date → creates both papers and the set.

Export → What:  Question paper · Answer key · Both · Whole set
Whole set → one .zip (web) or one folder (desktop):
   S6 Mock 2026-27 – Paper 1.docx
   S6 Mock 2026-27 – Paper 2.docx
   S6 Mock 2026-27 – Marking scheme.docx   (the combined key, set order)
```

- **Duplicate**: *Duplicate paper* → the copy **leaves** the set and says so ("Not in S6 Mock
  2026-27"). *Duplicate set…* asks for a new name ("S6 Mock 2027-28"), copies every member under a
  new id and offers to bump the year on the covers. **Trash** a member: the set shows "Paper 2 is
  in Trash · Restore".
- **Checks** (in the set dialog and the paper check): two papers with the same role; a member's
  tagged cover line that differs from the set's; members' sets with different names (after a sync
  conflict); Paper 1 not 45 MC; time on cover vs. Target.
- **Data model** (all optional, so no schema bump):

  ```ts
  // Worksheet, in KNOWN_KEYS
  paperSet?: {
    id: string;                 // shared by every member
    name: string;               // copy per member; newest updatedAt wins on display
    kind?: 'exam' | 'test' | 'quiz';
    role?: string;              // 'paper1' | 'paper2' | free label; absent = from the shape
    order?: number;             // position in the set (export and key order)
  };
  // CoverLine, optional: this line holds a set detail
  sharedAs?: 'school' | 'exam';
  ```

  Shared values are **copied into each member** (cover text, `satOn`, `classes`), never looked up
  at print time. An older build therefore prints exactly what the newer build last wrote, and
  every backend (preview, `.docx`, PDF) keeps reading the paper alone. The set dialog's edit
  becomes one save per member.
- **Index**: `summarize` adds `set: { id, name, role, order }`, and `INDEX_ROW_REV` goes 2 → 3. A
  row below 3 (an older build rewrote it) is repaired by reading the document, as `kindRepairs`
  does for `kind`.
- **Migration of existing files and folders**: none forced; no field means not in a set. A gentle
  offer: when a folder (or the whole list) holds a Paper 1 and a Paper 2 whose cover corner codes
  match ("2026-27 / ECON / PAPER 1" and "… PAPER 2") and whose exam lines match, the dashboard
  shows "These look like one exam · Make a set". It is never automatic. The frozen corpus is
  untouched. New tests: a member saved, edited by the v1 corpus path, reopened; an index row
  without `set` repaired.
- **Older builds**: open, edit and print members normally; the field survives (`__unknown`). An
  older build's Duplicate copies the field, so the set gains a second "Paper 1". The new build
  flags it as a duplicate role ("Keep both / Remove the copy from the set").
- **Sync**: the link lives in the document, so it syncs for free, and works through `.json` and
  backups. Conflicts are per document (last write wins). A set whose members disagree on the name
  shows the newest one and offers to fix the rest. Folders still don't sync; unchanged.
- **.docx**: an untouched paper exports byte-identically (the set is chrome only). The shared
  details change the cover only when the teacher applies them, as an ordinary edit would. New
  output: the whole-set export (`renderCombinedAnswerKey` already does the key). PDF of the set:
  one PDF per paper first. A single joined PDF is later (the print path is one document at a time).
- **Mac / iPad**: everything is buttons and menus, no drag-only step (reordering in the set
  dialog also has ↑/↓). The strip is one line, so it fits a 1180-wide iPad; on narrow widths it
  collapses to "S6 Mock 2026-27 ▾". The editor strip carries `data-print-hide`.
- **Size**: M–L, in three shippable steps:
  - **A. The link** (≈ 2 sessions): `paperSet` + index rev 3, "Make a set… / Add to set…" on a
    card, set frame on the dashboard, editor strip with partner switch, Export pre-ticks the set
    in Also include, duplicate-leaves rule. *This alone answers the user's question.*
  - **B. Shared details** (≈ 2 sessions): Set details dialog, `sharedAs` cover lines, drift checks,
    "New mock exam" start that creates both papers.
  - **C. The whole set** (≈ 2 sessions): Export → Whole set (.zip or folder), Duplicate set,
    Marking scheme view "Whole set", "These look like one exam" suggestion.

### Option 3 — Exam set object (full)

A set is **its own saved item**: `sets/<id>.set.json` holds the name, kind, shared details, the
ordered member ids and set-level settings. Opening it shows a **binder** with tabs.

```
┌ S6 Mock 2026-27 ─────────────────────────────── Export set ▾ ┐
│ [Overview] [Paper 1] [Paper 2] [Marking scheme]               │
│ Overview: school, exam, date, classes · per paper: questions, │
│ marks, time vs. cover · checks · history                      │
└───────────────────────────────────────────────────────────────┘
```

- **Data**: a new stored kind (set file + its own index), with members back-referencing it
  (`Worksheet.setId`). Cover lines could hold tokens resolved from the set at render. But an older
  build would print a token literally, so the text still has to be baked into each paper. That is
  double bookkeeping.
- **Migration**: as Option 2, plus a new storage kind for the legacy-index and backup guards.
- **Sync**: a third key type in the sync engine and in the Rust `library_*` commands (today only
  `<id>.worksheet.json` and Trash are synced). Sets and members can arrive out of order, so you get
  dangling members and empty sets (the Word master-document problem). Older builds don't see sets.
- **.docx**: as Option 2.
- **Size**: L, about 8–12 sessions, touching storage, sync (TS + Rust), backup, dashboard and a new
  screen.

### Side by side

| | 1 Linked papers | 2 Paper set | 3 Exam set object |
|---|---|---|---|
| "Are these linked?" at a glance | 🔗 badge | named frame + strip | binder |
| Same quiz vs. same exam | no | name + kind | name + kind |
| Shared school / exam / date | no | copied to each paper, checked | held by the set |
| Survives sync, `.json`, old builds | yes | yes | sync needs new work; old builds blind |
| Duplicate whole mock | no | yes | yes |
| One-click export of the set | pre-ticked key only | yes | yes |
| New storage kind | no | no | yes |
| Size | S–M | M–L (3 × ≈ 2 sessions) | L |

## 6. Recommendation

**Option 2, step A first, then B and C as the user confirms.**

- **Option 2 over 3:** it is what exam boards and Finder tags do: identity *in* each paper. It
  needs no new storage kind, no sync change and no dangling links, and older builds keep it. Option
  3 adds a binder screen, but its cost goes into sync and storage rather than into anything the
  teacher sees.
- **Option 2 over 1:** a name and kind on the group is exactly the user's question ("same test,
  quiz or exam"). Step A is about the same size as Option 1, so Option 1 is just a less useful
  step A.
- **Folders stay.** They file by class or term; a set says "sat together". A set's members can
  sit in one folder or in different ones.

Unrelated small gaps found on the walk, which can be fixed anytime:

- the " (copy)" suffix is English-only in the 中 interface (`src/storage/document.ts:appendCopy`);
- folder names are cut to "中六 Mock 202…" in the 中 rail at 1440 wide;
- the New worksheet form never remembers the school name.

## 7. Decisions for the user

1. **Which option**: 2 in steps (recommended), 1 only, or 3.
2. **What a set can hold**: papers only (Paper 1, Paper 2, recommended), or also classroom and LQ
   worksheets (a "unit test" of two worksheets)? The marking scheme stays part of each paper either
   way.
3. **Kind label**: one word for all ("Set" / 套卷), or Exam / Test / Quiz (考試 / 測驗 / 小測)
   shown on the badge?
4. **Duplicate a single paper**: leaves the set (recommended), or stays in and gets flagged?
5. **Shared details**: which fields stay in step across papers. Proposed: school, examination
   line, date sat, classes. Times and the paper's own name stay per paper.
6. **One set per paper** (recommended; reuse = Duplicate set), or may a paper sit in several sets?
7. **Whole-set export**: a `.zip` of `.docx` (web) / a folder (desktop) first, with one PDF per
   paper. Is a single joined PDF needed?

## 8. Evidence

- Walk scripts (Playwright, Chrome, 1440×900, EN + zh-HK): kept out of the repo. Screenshots are
  in `docs/research/2026-11-02-paper-sets/`:
  - `today-dashboard.png`: three mock cards, no pairing;
  - `today-dashboard-zh.png`: the same in 中, folder name cut;
  - `today-folder-after-duplicate.png`: the copy filed beside its original;
  - `today-export-also-include.png`: every document listed, nothing pre-ticked.
- Code: `src/storage/folders.ts`, `src/storage/document.ts` (`summarize`, `duplicateWorksheet`,
  `appendCopy`), `src/storage/summaries.ts` (`INDEX_ROW_REV`), `src/storage/backup.ts`,
  `src/components/editor/ExportDialog.tsx` (`combinable`: `.docx` only),
  `src/components/editor/KeyDocumentsField.tsx`, `src/render/answerKey.ts`,
  `src/model/cover.ts`, `src/model/coverTypes.ts`, `docs/design/sync-engine.md`.
