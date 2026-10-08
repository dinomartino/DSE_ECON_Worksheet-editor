# Paste-to-structure (D1): design

Status: **proposal** (2026-10-08), written against `develop` @ c886017. Phase 0 and phase 1 are
built (§ 10): the engine (`feature/paste-import-core`) and the review dialog (`feature/paste-import-ui`).
Open questions for the user are in § 9.

## 0. The answer in one paragraph

Every teacher's paper is laid out differently, so the importer must not be a fixed grammar.
It **infers the layout from the paste itself**. A reader turns any source (Word paste, PDF
paste, a `.docx` or `.pdf` file) into one list of lines with features. Many small detectors
each suggest a **role** for each line (question, option, part, marks…). A **sequence solver**
then picks the reading in which the numbering is most consistent: which label style runs
1, 2, 3, which runs (a), (b), and which runs A–D. That consistency, not any one teacher's
style, decides the split. A **review screen** shows the guessed roles beside a live preview.
One click fixes a line, and the fix re-runs the solver so it spreads to every line like it.
The inferred layout plus the fixes are saved as a **layout profile** on this computer, so the
next paste from the same paper series comes out right. AI (✦, own key) is an optional helper
for the lines the rules are unsure of. It returns roles only, never rewritten text.

## 1. Evidence (2026-10-08 survey)

The survey simulated what a clipboard paste carries for the papers in `real_life_reference/`
(gitignored: the repo is public, so real paper text never enters it). The survey's catalogue,
fixtures and raw extractions are kept locally, not in git.

| Source | What arrives | Rules alone |
|---|---|---|
| Word paste (`text/plain`) | `label⇥text` per paragraph (auto and typed numbering look the same), tables as TAB rows, answer lines as TAB-only lines; **text boxes and figures are lost** | ~90% of questions |
| Word paste (`text/html`) | Word: numbers as text in `mso-list` spans, indents, bold/highlight. Google Docs/LibreOffice `<ol>`: numbers only as `start`/`type`, `(1)` decays to `1.` | at least as good as plain; prefer it |
| Text PDF paste (Preview) | one line per visual line; text order right, but **option letters detached and clumped** (`A. B. C. D.` then four texts), tables lose columns, headers/footers inline | ~60–75% |
| Scanned PDF | **no text layer**: nothing, or OCR with lost letters and corrupted labels (`(b)` → `（6）`) | fails; say so |

Three of the seven sample papers (all HKEAA past papers) are scans. Two of the four `.docx`
files are this app's own exports. No sample carries an answer key.

Other importers (MS Forms Quick Import, Akindi, Respondus, Moodle Aiken/GIFT, Formswrite) are
either strict formats or AI-only. All of them review *after* import, in their normal editor.
None lets the teacher fix a wrong split line by line. Akindi's useful idea: read the answer
from formatting (bold, highlight, colour, `*`, "Ans: B", a key at the end).

## 2. Pipeline

```
reader ──► SourceLine[] ──► detectors ──► role candidates ──► sequence solver ──► Outline
                                                    ▲                              │
                                     pins (teacher fixes, profile)          builder ▼
                                                                        QuestionBuild[] ──► insertQuestionBatch
```

All of it is pure and lives in `src/import/`, except the review UI. It runs in the browser
with no server, so the web and desktop builds behave the same. It names `'mcq'`/`'structured'` only in
the builder, the way `src/generate/build.ts` does. It stays out of the no-type-branching
lists (`registry.test.ts`, `src/library/`).

### 2.1 Readers → `SourceLine`

One shape for every source, so detectors never know where a line came from:

```ts
interface SourceLine {
  i: number;               // index; roles, pins and AI answers refer to it
  runs: InlineRun[];       // verbatim text with bold/italic/underline/highlight kept
  label?: string;          // a leading label split off: "1.", "(a)", "a)", "A.", "(1)", "第3題"
  labelSource?: 'text' | 'list';   // typed, or from list numbering (mso-list, <ol>, numPr)
  depth: number;           // indent level from leading TABs, margins, list level or x-position
  cells?: InlineRun[][];   // a table row
  tabOnly?: boolean;       // an answer line in Word
  trailingMarks?: number;  // "(3 marks)", "[3]", "（3分）" split off the end
  page?: number; x?: number; y?: number;  // PDF readers only
  image?: ImageRef;        // .docx/.pdf readers, and pasted HTML images
}
```

| Reader | Phase | Notes |
|---|---|---|
| `text/plain` | 1 | normalise first: BOM, NBSP, smart quotes, full-width brackets in labels only, Cyrillic look-alikes in labels |
| `text/html` (Word `mso-list`, `<ol start type>`) | 1 | read it whenever the paste has it; `DOMParser`, never inserted into the page |
| `.docx` file (jszip, `document.xml` + `numbering.xml`) | 2 | the richest source: real list levels, tables, **text-box content and images** that the clipboard drops |
| `.pdf` file (pdf.js text positions) | 3 | columns by x, letters re-attached by y, repeated header/footer lines removed by cross-page repetition |
| scan detection | 1 | a PDF with no text, or a paste that looks like OCR: say "This PDF is a scanned image" instead of guessing |

### 2.2 Detectors → role candidates

Roles: `heading` (section, instructions), `question`, `stem` (continuation), `statement`
(the (1)(2)(3) items), `option`, `part`, `subpart`, `marks`, `answerSpace`, `table`,
`source` (data-response passage), `answerKey`, `noise`, `ignore`.

Each detector is a small pure function that gives `(line, role, weight)`. Examples:
label shape (`1.` / `Q1` / `第1題` → question; `(a)` `a)` `（a）` → part; `(i)` → subpart;
`A.` `(A)` → option; `(1)` → statement); depth relative to neighbours; a TAB-only run →
answerSpace; a line that repeats on several pages, or matches `© … n`, "Go on to the next
page", or a lone page number → noise; `Section A` / `Part B` / `甲部` → heading (numbering may
restart after it); `Source A` / `資料A` → source; bold or highlighted option → answer;
`1. B  2. C …` grid → answerKey. Adding a convention means adding a detector. Nothing else changes.

### 2.3 Sequence solver: why any layout works

The solver does not trust any single label. It groups lines by **label family** (`N.`,
`(x)`, `x)`, `(roman)`, `Letter.`, `(N)`, `第N題`…). It asks which families form clean runs,
and assigns each run a level:

- a run of 1, 2, 3… that restarts only after a heading → questions;
- a run of a, b, c inside a question → parts; i, ii, iii inside a part → sub-parts;
- a run of exactly A–D (or A–E) per question → options; (1)(2)(3) before the options → statements.

An `a)` run and a `(a)` run in the same paper count as one level when they never clash. So a
teacher who mixes `a)` and `(a)` still splits correctly. Ambiguous lines are resolved by the
assignment that leaves the fewest breaks: a skipped number, a repeated letter, a question with
3 options. `(2)` as marks or as a statement, and an instructions list `1. Write your name` that
looks like questions, are both settled this way. The result, the **layout profile**, is
small and explicit: `{ question: 'N.', part: ['(x)','x)'], subpart: '(roman)', option: 'Letter.', marks: '(n marks)', noise: [...] }`.

Repairs for PDF text are done here, from the solved structure rather than from line adjacency:

- detached option letters: pair option texts with A–D **by order**, and join wrapped lines until the count fits;
- drifting marks: re-attach them to the nearest preceding part with none;
- group marks: one marks line after (i)+(ii) sets the part's mark, not the sub-parts';
- hyphenated wraps are joined.

### 2.4 Outline → questions

The builder turns the outline into `QuestionBuild[]` and makes **one** `insertQuestionBatch`
call, so one ⌘Z removes the whole import. A shared stem or source ("Questions 8 and 9") becomes
a `stimulus` lead with its `span`. Labels are dropped, because numbering is derived. Each question's
text goes into `en` or `zh` by its script (the share of CJK characters; the teacher can switch
it in the dialog). The other side stays empty, ready for ✦ translate. Marks go
to `marks` on the part or sub-part. Absent marks stay absent, not zero. An answer key, when one
is found, sets `answerIndex`; otherwise the MC is flagged "no answer". `answerSpace` gets the
counted TAB lines. Images become image blocks in the nearest stem. Unknown lines are never
dropped: they stay in the stem as text, flagged.

### 2.5 Figures

Economics papers are full of graphs, tables drawn as pictures and diagrams. What each source gives:

| Source | Figures |
|---|---|
| Word paste | lost: clip images arrive as `file://` links the browser cannot read, and text boxes vanish. HTML that carries `data:` images keeps them |
| `.docx` file (phase 2) | pictures kept. Word-shape drawings and charts are hard (no single picture to take); EMF/WMF are flagged, since browsers cannot draw them |
| PDF paste or file (phase 3) | never in the text; a region crop of the rendered page |
| Scan | the page is a picture; a region crop |

So the review step lets a teacher put a picture into any question at any point: select a line or
a slot and paste a screenshot (⌘⇧4 / Win+Shift+S, then ⌘V), or drop or choose an image file. Where
a picture is missing (a lost image, or a caption or reference with none after it: `Figure 1`,
`圖一`, `資料A`, "the diagram below", 下圖) the preview shows a **figure slot**, counted to check
until filled or dismissed. Pictures stay pictures (image blocks). They never become editable
diagrams; a teacher who wants one rebuilds it from Graphs 圖表庫.

## 3. The review screen

A dialog (`Dialog`, wide). The left pane shows the pasted lines with a coloured **role chip**
in the gutter. The right pane shows the questions as they will print, using the real
renderer, and is scroll-linked to the left. The header says "38 questions · 3 to check".

- **Fix a line:** click a chip → role menu (keys: Q question, P part, S sub-part, O option, T
  statement, M marks, H heading, N noise). Also "start a new question here" and "join with the
  line above".
- **A fix spreads:** a fix becomes a *pin*, and the solver re-runs with it. Telling it that
  one `a)` is a part relabels every `a)`. Pins are what the profile remembers.
- **Set answers:** click an option in the preview to mark it correct.
- **Flags:** a sequence break, an MC without 4 options or without an answer, marks not
  attached, a line with no role, an image left behind. "Next to check" jumps to each one.
- **Insert into:** the open paper at the cursor, or 題庫. The bank path goes through
  `copyToBank`, so duplicates are skipped as they are now.

Imported questions get no extra stored flag. The flags live only in the dialog, and once
inserted they are ordinary questions.

## 4. Remembering a layout

When an import succeeds, its profile (families, marks style, noise lines, pins that are
general rather than line-specific) is saved on this device under a name: the paper's title, or
the first heading. On the next paste the solver tries the saved profiles first and says
"Same layout as *DBS Assessment 1*". The teacher can switch to automatic. Profiles are local
settings, not documents, so there is no schema change and they do not sync. They could later
join Translation terms in the synced settings.

## 5. AI helper (optional, ✦, own key)

Off unless a key is set. For lines whose role confidence is low, the dialog offers "Ask AI
about the 6 unclear lines". The request sends line indices and text and asks, through the
existing structured-output client (`src/ai/client.ts`), for **roles and boundaries only**.
Answers are validated: every index is known, the result keeps the sequence consistent, and
no text is changed. They then become ordinary pins that the teacher sees and can undo. AI never rewrites
wording, which avoids the paraphrase and dropped-option failures reported for LLM extraction.
Scans (phase 4): a vision-capable model could read page images, but only as text that goes
back through the same pipeline and review.

## 6. Entry points

- **Paste questions… / 貼上題目…** in the add-question menu and in 題庫: opens the dialog
  with a paste box. A `.docx`/`.pdf` can be dropped on the box from phase 2 on.
- **Large paste into a stem:** a paste that has 2 or more question labels shows a notice,
  "Looks like 12 questions. Turn them into questions?", which opens the dialog with that
  paste. The plain-text paste already done stays as it is unless the teacher accepts.
- The start screen's file drop also accepts `.docx` (phase 2), and the import creates a new paper.

## 7. Tests

The public repo gets **synthetic fixtures only**. They are invented text that reproduces each
surveyed layout trait: Word auto numbers, typed `⇥1.⇥`, detached PDF letters, column blocks,
marks on their own line, group marks, `a)` mixed with `(a)`, instruction lists, sources and
tables, TAB answer lines, OCR noise, `<ol>` HTML. Each fixture has an expected outline. A
scorecard test prints the share of questions split correctly per fixture and fails if
accuracy drops. The real-paper fixtures stay local and run only on demand.

## 8. Phases

| Phase | Ships | Size |
|---|---|---|
| 0 | synthetic fixtures + expected outlines + scorecard; `SourceLine` and `Outline` types | S |
| 1 | plain + HTML readers, detectors, solver, builder (with sub-parts), review dialog, insert into paper/題庫, scan detection, the "Paste questions…" entry | M |
| 2 | `.docx` file reader (text boxes, images, real list levels), layout profiles, the large-paste notice | M |
| 3 | `.pdf` file reader with pdf.js positions | M |
| 4 | ✦ AI helper for unclear lines; scans via vision | S–M |

Phase 1 alone covers Word pastes, which is where most teachers' papers live.

## 9. Open questions for the user

1. **Answer keys:** where do teachers keep MC answers? Bold or highlighted in the paper, a key
   at the end, or a separate file? Today's samples have none.
2. **Marking schemes:** import them too (phase 2+), or questions only?
3. **Figures:** decided: pictures, added in the review by screenshot or file (§ 2.5).
4. **Where it lands first:** the open paper, 題庫, or both from day one?

## 10. As built (engine, 2026-10-08)

Pure TypeScript in `src/import/`: no React, no store, no DOM. The UI calls three functions:

```ts
readPaste(input: { plain?: string; html?: string }): ReadPaste                 // once per paste
analyseLines(read: ReadPaste, options?: { pins?: Pin[]; profile?: LayoutProfile;
  language?: 'en' | 'zh' | 'auto' }): Analysis                                  // on every pin
buildImport(analysis: Analysis, options?: { preview?: boolean }): ImportBatch   // → insertQuestionBatch(batch.builds, { worksheetId, lead: batch.lead })
analysePaste(input, options) = analyseLines(readPaste(input), options)
```

`Analysis` is `{ kind: 'ok' | 'empty' | 'scan', source, lines, roles, outline, flags, profile }`;
`roles[i]` is `{ role, confidence, pinned?, question? }` for `lines[i]`. A `Pin` is
`role` · `newQuestion` · `join` · `language` · `answer` · `image` · `noPicture`. Flags are codes (`FlagKind`) with a
line and a question index; the dialog words them. Types: `src/import/types.ts`.

| File | Does |
|---|---|
| `src/import/readPlain.ts` · `src/import/readHtml.ts` | clipboard → raw lines. HTML: Word `mso-list` labels, `mso-tab-count`, `<ol start type>`, tables, bold/italic/underline/highlight/colour |
| `src/import/lines.ts` | label, trailing marks, cells split off; option rows and detached-letter clumps split; `*C.` stars |
| `src/import/labels.ts` · `src/import/normalize.ts` | label families and marks shapes; label-zone normalising (full-width, Cyrillic) |
| `src/import/detectors.ts` | `DETECTORS`: one small function per convention |
| `src/import/levels.ts` | family → level by run quality; question runs (restart, nested, skip, instructions) |
| `src/import/walk.ts` | the outline: parts, sub-parts, contexts, sources, marks re-attachment, order pairing |
| `src/import/solve.ts` | orchestration, pins, answers, language, the returned profile |
| `src/import/scan.ts` · `src/import/build.ts` | empty/OCR verdict; outline → `QuestionBuild[]` + `lead` |
| `src/import/figures.ts` | figure slots (lost pictures; captions and references with none) and image pins, placed after the walk |

**Scorecard** (`src/import/scorecard.test.ts`, 17 synthetic fixtures in `src/import/fixtures/`):
every Word plain/HTML and PDF-style fixture 100% split and detail; the two OCR fixtures are
read as `scan` and score 89–95%. Floors: Word 95%, PDF 85%, OCR 50% (per fixture). The fixtures
were written alongside the engine, so the local run on the real survey pastes is the honest
check: Word plain/HTML 5/5 at 100%; text-PDF copies (Preview, `pdftotext -layout`) 100%; the
whole DBS paper splits 25/25 from Word, Preview and `-layout`, the 2019 HKEAA Word file 14/14;
`pdftotext` column blocks 40% (2/5 on the excerpt, 24/25 on the whole paper with 6 option-count
flags); OCR excerpts 86% and 100% split. Re-solving a 60-question paste takes about 4 ms.

**Deviations from the proposal**

- The HTML reader is a small tokenizer, not `DOMParser`, so the engine runs in tests and
  workers. Nothing is ever inserted into a page.
- `InlineRun` has no highlight, so highlight is line emphasis only. Formatting that marked an
  answer (bold, colour, `*`) is removed from that option so the student copy does not show it.
- One `lead` per batch: a shared stem later in the paste is kept as the first text of the
  question it introduces (`sharedStemFolded`). Several leads need a store change.
- Headings, noise and answer keys are not imported (`ImportBatch.skipped`); no section elements.
- An MC with no marks keeps the factory's 1 mark; parts and sub-parts with none stay absent.
- Body text keeps smart quotes and full-width punctuation; only matching keys are normalised.
- Images: only `data:` URLs become image blocks; Word's `file://` clip images are `imageLost` and show as slots.
- Confidence is the detector weight lowered by walk decisions, not calibrated.

**Known weak cases:** `pdftotext` column blocks that interleave two questions; OCR that loses
option letters (the question becomes written text, flagged); an instructions list numbered
like the questions with no heading after it; a structured question whose part letters were
lost by OCR.

### The review dialog, as built (2026-10-08)

`src/components/import/`. **Paste questions… / 貼上題目…** in the add rail's Question flyout and
in 題庫's header. The paste box reads `text/html` and `text/plain` from the paste event; the HTML
goes to the engine as a string and never into the page. Empty, image-only (`scan`) and OCR text
are explained in a notice; OCR text can still be reviewed.

- **Left:** every pasted line with a chip whose letter is its shortcut (Q P S O T M H N; `·` text,
  `▦` table row, `_` answer space). A chip opens the role menu (letters pick, arrows move), with
  "Start a new question here" and "Join with the line above". A fixed chip has a ring; new-question
  and join fixes show as badges that take the fix back. ⌘Z takes back the last fix (captured, so it
  never reaches the document behind).
- **Right:** each question rendered by the editor's own `NodeView` (student version, no answer
  space) at the open paper's column width, zoomed to fit. Questions are cached by their outline
  (`previewItems`), so a fix re-renders only the questions it changed (a fix that changes all 60
  paints in about 50 ms in a dev build). A click on an option is an `answer` pin; the answer is a
  green wash, screen only. Each question has an EN / 中文 switch (`language` pin); "Language"
  sets all and clears the per-question ones.
- **Header:** "N questions · M to check" counts structural flags by question; MC without an
  answer are counted apart ("4 MC without an answer →" steps through them), since a paste with no
  key flags every MC. The left pane scrolls the right and back, led by the pane under the pointer.
- **Insert into this paper:** one `insertQuestionBatch` at the add menu's anchor, then a notice
  with Undo (and how many MC still show A). **Add to 題庫:** `addToBank` into a chosen or new bank;
  questions are originals (no lineage), and any the bank already says the same (`contentKey`) is
  skipped and counted. A shared stimulus lead is not added to a bank (the notice says so).
- Not built: layout profiles, the large-paste notice in a stem, file drops (phase 2+).

### Figures, as built (2026-10-08)

- **Pin:** `{ kind: 'image'; id; line; image: ImageRef }` (`src`, display `widthPx`/`heightPx`,
  `naturalWidthPx`/`naturalHeightPx`, as `imageBlockFromFile` made them) and
  `{ kind: 'noPicture'; line }` (a slot dismissed). Pins are keyed by line, so a picture follows
  its line through every re-solve and other fix.
- **Placement** (`placeFigures`, after the walk): right after the content of the line's block in
  the question that owns it: the stem, a part's or sub-part's blocks, inside a source panel when
  the line is in one. An option line puts it under that option (`McqOption.blocks`, capped at
  `OPTION_DIAGRAM_WIDTH_PX`); a statement line after the stem. Several per question, in line
  order; two on one line in the order added. A line outside every question goes to the next one.
- **Slots:** a lost picture keeps its place; a caption with no picture beside it, or a "below"
  reference with none before the next part, gets one right after the line (`figureMissing`). A
  table or source caption counts any rows or text after it. "Above" references are not read.
  Filled or dismissed lines are `settled`: no flag, no slot.
- **Build:** a real `buildImport` drops slots and gives pictures fresh ids. `{ preview: true }`
  shows each slot as a stand-in image whose id `previewFigure` reads back (`pi-slot:<line>`,
  `pi-pin:<id>`), so the pane draws the slot and the remove control exactly where the block prints.
- **Dialog:** ⌘V with an image on the clipboard (a window `paste` listener, review step only)
  adds it after the selected line or slot; a text paste passes by. Drops land on a row, a slot, or
  a question (its first line). "Add a picture here…" in the role menu and "Choose a picture…" on a
  slot open a file chooser. Every picture goes through `imageBlockFromFile`. A placed picture has
  a × on the paper and a "Picture ×" badge on its line; ⌘Z takes back the last one like any fix.

