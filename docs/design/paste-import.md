# Paste-to-structure (D1): design

Status: **proposal** (2026-10-08), written against `develop` @ c886017. Phase 0 and phase 1 are
built (§ 10): the engine (`feature/paste-import-core`) and the review dialog (`feature/paste-import-ui`).
Phase 2's `.docx` reader and phase 3's `.pdf` reader are built (§ 10). Answers kept in
another file are built, engine and UI (§ 11).
**The way in is file-only** (user decision, 2026-10-08: "if a teacher can copy the text, they
can paste it into a worksheet themselves"): Import from Word or PDF… on the home screen, or a
file dropped there (§ 6, § 10). The clipboard readers stay in the engine, tested, unused by the app.
Open questions for the user are in § 9.

## 0. The answer in one paragraph

Every teacher's paper is laid out differently, so the importer must not be a fixed grammar.
It **infers the layout from the file itself**. A reader turns a `.docx` or `.pdf` file (the
engine also reads a Word or PDF paste, which the app no longer offers) into one list of lines
with features. Many small detectors
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

File-only (2026-10-08). The home screen is the one way in:

- **Import from Word or PDF… / 從 Word 或 PDF 匯入…**, a secondary button under New worksheet
  (empty desk or not). It opens the system file chooser (`.docx`, `.pdf`, and `.doc` so an old
  file can be explained), several files at once; the native open sheet on desktop (`pickFiles`).
- **Dropped `.docx` or `.pdf` files** on the home screen (web drop or the desktop shell's native
  drop) open the same dialog, one or several (`planDrop` → `papers`). A paper dropped together
  with worksheets or backups is left out.
- There is no import from inside a paper and no text paste box: the add rail's Paste
  questions… and 題庫's header button were removed before release.

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

**Scorecard** (`src/import/scorecard.test.ts`, 19 synthetic fixtures in `src/import/fixtures/`):
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
  A Mac Word copy writes VML bare (not in a comment): `v:imagedata` is read as a lost picture, a
  `v:group` that draws (lines, connectors, pictures) as one lost picture with its text-box labels as
  `alt`, and a text box's `<![if !mso]><table>` as paragraphs. A drawing inside a table cell comes after the table.
- Confidence is the detector weight lowered by walk decisions, not calibrated.

**Known weak cases:** `pdftotext` column blocks that interleave two questions; OCR that loses
option letters (the question becomes written text, flagged); an instructions list numbered
like the questions with no heading after it; a structured question whose part letters were
lost by OCR.

### The dialog, as built (2026-10-08)

`src/components/import/ImportDialog.tsx`, lazy (`ImportHost.tsx`): the readers and pdf.js never
load with the home screen. Steps: **reading** (the file name; a big PDF takes seconds), a
**problem** (`.doc` → save as .docx; a password; not a Word or PDF file; damaged; a **scan**
with its page count) with Choose another file… and Close, the **review**, then **Save as**.
A PDF whose text was read from a scan (OCR) is reviewed with a warning notice. The review's
language starts on the Paper language setting (`paperSide() ?? 'auto'`), or on detection when
every question is in the other language (`startLanguage`).

- **Left:** every line of the file with a chip whose letter is its shortcut (Q P S O T M H N; `·` text,
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
- **Save as** (`SaveAsStep.tsx`): the four kinds of paper drawn as the New worksheet gallery
  draws them, and 題庫 only. A paper takes a name (the file's title, else its name without the
  extension) and is made by `createWorksheetFrom` (cover, sections, furniture; no sample; a
  classroom worksheet without sections so the file's order holds), opened, then filled by one
  `insertQuestionBatch` and saved by value (`createImportedDocument`). Its language: 中文
  questions give a 中文 paper, both give EN+中, else the Paper language setting (English
  questions never land on a 中文-only paper). **Suggested type** (`defaultDocumentType`): 20 or
  more questions, all MC → Paper 1 mock; 4 or more, all written, under a section heading
  (`Section A`, `Part B`, 甲部) → Paper 2 mock; else Classroom worksheet. A type that does not
  fit (written questions on Paper 1, MC on an LQ paper) says so and still saves. **題庫 only**:
  `addToBank` into a chosen or new bank, questions as originals; any the bank already says
  the same (`contentKey`) is skipped and counted; a shared stimulus lead stays out. Then 題庫
  opens on its Untagged questions (tag as you go). Nothing is written before Save.
- Not built: layout profiles.

### Figures, as built (2026-10-08)

- **Pin:** `{ kind: 'image'; id; line; image: ImageRef }` (`src`, display `widthPx`/`heightPx`,
  `naturalWidthPx`/`naturalHeightPx`, as `imageBlockFromFile` made them) and
  `{ kind: 'noPicture'; line }` (a slot dismissed). Pins are keyed by line, so a picture follows
  its line through every re-solve and other fix.
- **Placement** (`placeFigures`, after the walk): right after the content of the line's block in
  the question that owns it: the stem, a part's or sub-part's blocks, inside a source panel when
  the line is in one. An option line puts it under that option (`McqOption.blocks`, capped at
  `OPTION_DIAGRAM_WIDTH_PX`); a statement line after the stem. Several per question, in line
  order; two on one line in the order added. A line outside every question (a heading) opens the
  next question, or the shared stimulus printed before it (`pictureHome` says which; the line's badge
  reads "Picture → question N" and selecting it outlines that question). After the last question
  there is no home: the dialog refuses the picture with a notice and the engine never places it.
- **Slots:** a lost picture keeps its place; a caption with no picture beside it, or a "below"
  reference with none before the next part, gets one right after the line (`figureMissing`). A
  table or source caption counts any rows or text after it. "Above" references are not read.
- **MC that ask about pictures** (`askedFigures`, flag `figureAsked`): options that only name
  pictures (圖甲, 圖一, "Figure 2", "Diagram B", "(3)", or nothing) get a slot under each option,
  and so do bare letters when the stem asks which diagram/graph/figure (哪一個圖, 哪幅圖, 哪一幅).
  Asking with text options, or bare letters with no ask (points P Q R S), gives one slot after the
  stem. Nothing when the question already has a picture or a caption/reference slot (letters
  only), or when its letters are named in its text or table ("firm W"). "Which of the following
  is…", 以下哪一項, 哪一項表示, "which curve" with text options and numeric options stay quiet.
  "A.⇥[picture]" puts the picture under that option; an MC whose options are all bare labels has
  options without text, not detached letters.
  Filled or dismissed lines are `settled`: no flag, no slot.
- **Build:** a real `buildImport` drops slots and gives pictures fresh ids. `{ preview: true }`
  shows each slot as a stand-in image whose id `previewFigure` reads back (`pi-slot:<line>`,
  `pi-pin:<id>`), so the pane draws the slot and the remove control exactly where the block prints.
- **Dialog:** ⌘V with an image on the clipboard (a window `paste` listener, review step only)
  adds it after the selected line or slot; a text paste passes by. Drops land on a row, a slot, or
  a question (its first line). "Add a picture here…" in the role menu and "Choose a picture…" on a
  slot open a file chooser. Every picture goes through `imageBlockFromFile`. A placed picture has
  a × on the paper and a "Picture ×" badge on its line; ⌘Z takes back the last one like any fix.
  A file that is not a picture (a PDF) is refused with a notice; one the browser cannot decode
  (HEIC or TIFF in Chromium; WebKit decodes both and stores PNG/JPEG) is refused with a hint to
  export or screenshot it (`imageBlockFromFile(…, { decodedOnly: true })`), never stored unseen.

### Checked for real (2026-10-08, this Mac)

- **Word clipboard** (Word for Mac, `copy object` on ranges of the reference papers, read-only;
  dumps stay local): 17 flavours, of which the engine reads `public.html` and
  `public.utf8-plain-text`. Lists arrive as `mso-list` spans in `<![if !supportLists]>`; a partial
  copy's HTML renumbers its list from 1 (the plain text keeps 16, 17…), which only shifts numbers.
  Inline pictures carry `data:` PNGs (`<![if !vml]><img>`); floating pictures and drawn graphs are
  bare VML with `file://` only. Split, HTML and plain alike: DBS Part A Q1–6 6/6, a table run 4/4,
  Part B 6/6, whole paper 25/25; 2019 Paper 2 Q1–2 2/2, Q6–7 2/2, Q9 1/1, Q12 1/1, whole 14/14,
  with every question's options, statements and parts matching between the two flavours. A PDFKit
  copy of the DBS PDF (Preview is PDFKit) splits 25/25.
- **Browsers:** the whole dialog (paste, a role fix, an answer, a slot filled by ⌘V and by drop,
  Insert, Add to 題庫) runs in Playwright Chromium and WebKit, en and zh; the preview's zoom and
  the scroll link measure the same in both. A real `screencapture -c` picture (`public.png` only)
  pasted with ⌘V in headed Chrome and headed WebKit lands in the selected slot.
- **Not checked:** a real Finder drag (driven with a file-backed `DataTransfer`, the same code
  path), and the desktop shell's WKWebView.

### The `.docx` reader, as built (2026-10-08)

```ts
readDocx(bytes: ArrayBuffer, options?: { prepareImage?: (blob: Blob) => Promise<ImageRef | null> })
  : Promise<ReadPaste & { title?: string }>          // source: 'docx'; then analyseLines as usual
```

`ReadPaste.source` is `'plain' | 'html' | 'docx' | 'pdf'`; a `.docx` reads as paragraphs and is
never OCR. A file that cannot be read rejects with `DocxReadError`, `kind` `unreadable` (corrupt
zip or XML), `encrypted` (password-protected) or `notDocx` (`.doc`, a PDF, a spreadsheet). The
detectors, solver and builder are unchanged: the reader only gives them better lines.

- **Order:** `document.xml` body only (headers, footers, footnotes and comments are other parts).
  Tracked insertions kept, deletions dropped; fields read as their shown result; hidden text,
  placeholder text and the VML `mc:Fallback` copy skipped (one branch only).
- **Numbering:** real counters per abstract list (two `w:num`s on one list share them, as in
  Word), `startOverride` restarts, `lvlRestart`, style-linked numbering, Word's formats
  (Chinese counting → `一、`; circled → `(1)`). The label is a `list` label at depth `ilvl`.
- **Tables:** rows with cells, numbered cells as `A.⇥…` so an option table splits into options;
  a one-column table is a frame and reads as body text.
- **Text boxes** go where their anchor paragraph is: before it when set above it, else after.
- **Pictures** become data URLs on their own line, at the display size Word gives
  (`wp:extent`), natural size from the header; `prepareImage` lets the UI downsize. Grouped
  shapes holding pictures give the pictures and any long text-box text.
- **Slots** (`imageLost`): EMF/WMF and other formats a browser cannot draw, charts, SmartArt,
  ink, linked pictures, and drawings made of Word shapes. A drawing is a diagram when it mixes
  lines with two or more short labels, has a freeform, or has four or more shapes; floating
  pieces from neighbouring empty paragraphs are pooled, so a graph drawn shape by shape is one
  slot. Its labels and legend stay with the slot; a `Figure 3` caption stays as text.
- **Answer lines:** tab-only, underlined-blank and dotted-leader paragraphs read as `tabOnly`.
- **Title:** `dc:title`, else a Title or Heading-styled paragraph, else the running header's
  title-like pieces, else a bold or centred line (exam words first).

Local run on the real files (never committed), against the paste numbers above:

| File | Paste | `.docx` reader |
|---|---|---|
| DBS Assessment 1 | 25/25 | 25/25: 19 MC with 4 options each and 4 statement sets (one with its options in a table), 6 written with parts and marks; title from the header |
| 2019 HKEAA Paper 2 | 14/14 | 14/14 with every part, sub-part and mark; 8 pictures and the text of a source graphic recovered (the paste lost both); the 4 hand-drawn graphs are 4 slots; 1 `duplicateMarks` from a stray marks value in the file |
| Econ Studio export (MC, 5 questions) | — | 5/5: options, statements and the table question as exported |
| Econ Studio export (1 question) | — | 1/1 |

Reading takes 3–70 ms and solving under 15 ms on these files. Still slots, not pictures: charts,
SmartArt, EMF/WMF, and diagrams drawn with Word shapes (a teacher pastes a screenshot into the slot).

### PDF reader, as built (2026-10-08)

```ts
readPdf(bytes: ArrayBuffer, options?: { prepareImage?: (blob: Blob) => Promise<ImageRef | null> })
  : Promise<(ReadPaste & { title?: string; pages: number }) | { kind: 'unreadable' | 'encrypted' | 'notPdf' }>
```

`isPdfReadError` tells the two apart. The result goes to `analyseLines` like a paste (`source: 'pdf'`).

- **pdf.js** (`pdfjs-dist` 6.4, the legacy build: the modern one calls `getOrInsertComputed` and
  `Math.sumPrecise` unpolyfilled) loads only on the first `readPdf` call. Its worker is bundled by
  Turbopack from `src/import/pdf.worker.ts` and served beside the page, same origin, no CDN. If the
  worker cannot start, pdf.js parses on the main thread (`useMainThread`). The desktop CSP is `null`.
  WebKit gives a `tauri://` URL the origin `null`, which Turbopack's worker bootstrap refuses, so the
  macOS shell probably takes the fallback (unproven: no desktop build was run).
- **Layout** (`layoutPdf`, pure, tested on plain item arrays): rows by baseline; rows repeated in
  the same place on most pages, lone page numbers and rotated text dropped; two-column bands read
  column by column; a lone label item takes the text to its right (detached letters, hanging numbers);
  right-aligned marks stay on their line or join the line above; rows aligned in columns become
  cells, with empty cells kept; a line that wraps (close below, at the body's indent, after a line
  that reached the margin) joins the one above. So a PDF is read in `paragraph` mode and the walk
  never joins twice. Bold and italic come from font names. A drawn rule in a gap is `______`.
- **Figures** (`findFigures`): images, and path clusters with a curve, a slant or an untexted fill.
  Table borders, shaded cells and frames are not figures. A figure takes its axes and short labels.
  Each becomes an image line with `src: ''`: a slot, flagged `imageLost`. With `prepareImage` in a
  browser, the page is rendered at 2× and the region cropped to PNG. A file with no text at all is
  one picture per page, which reads as `scan`.
- **Title**: the metadata title (with "Microsoft Word - " and the extension removed), else the first
  large-type line.
- **Real files** (local): DBS Assessment 1 splits 25/25 (19 MC with 4 options each, the 4 statement
  sets, parts `a)`/`b)` and `(a)`/`(b)` and every mark right, 7 tables as cells), as good as the
  Preview paste. The three HKEAA scans read as `scan` with 18, 23 and 28 pages. Proven in
  `next dev` and the static `out/` in Chromium and Playwright WebKit, with the worker and with it
  blocked.
- **Bundle**: the first load is unchanged. pdf.js is a lazy chunk (480 KB, 145 KB gzip) with a
  22 KB Buffer shim. The worker code (1.2 MB, 372 KB gzip) loads in the worker, or on the main
  thread only for the fallback.
- **Weak cases**: two columns need at least 5 rows and 3 prose rows a side; a table needs 2 aligned
  rows; vector figures are a heuristic; text drawn as outlines or Type 3 glyphs is not read; an
  OCR'd scan reads as its text layer.

### Real files through the dialog (2026-10-08, this Mac, local only)

Imported in `next dev`, Chromium, with the app's downsizer as `prepareImage`, saved with the
suggested type, exported to `.docx` (student and teacher), and opened in LibreOffice:

| File | Read | Suggested | Saved | Export |
|---|---|---|---|---|
| DBS Assessment 1 `.docx` | 25 questions (19 MC, 6 written), nothing to check, 2.4 s | Classroom worksheet | 25 questions, 6 pages | opens; student copy no answer labels, teacher 19 |
| DBS Assessment 1 `.pdf` | the same 25, 6 pages, 2.4 s | Classroom worksheet | 25 questions | the same |
| 2019 HKEAA Paper 2 `.docx` | 14 written, 3 to check, 8 pictures, 4 slots | Paper 2 mock | 14 questions, 8 pictures | opens (24 pages in LibreOffice), no answer labels |
| 2019 HKEAA Paper 2 `.pdf` (scan) | "a scanned image, 23 pages" | n/a | n/a | n/a |

Not checked: the desktop shell's open sheet and native drop (the same code path as the web
chooser and drop once the bytes arrive).

## 11. Answers from another file (engine, 2026-10-08)

The request: "sometimes the answers are in another file". Several files are chosen at once,
the engine guesses which hold questions and which answers, and which belong together; the
teacher relinks. Pure, in `src/import/`. The UI (multi-file choose, linking, per-paper
review) builds on these calls:

```ts
classifyImport(read: ReadPaste, fileName: string): FileClass
  // { role: 'questions' | 'answers' | 'both'; confidence: 0.5–0.99; reasons: ClassifyReason[] }
suggestPairs(files: { id: string; name: string; role: FileRole }[]): { questions: string; answers?: string }[]
splitAnswers(read: ReadPaste): { questions: ReadPaste; answers?: ReadPaste & { offset: number } }
readAnswerSheet(read: ReadPaste & { pages?: number }): AnswerSheet
matchAnswers(analysis: Analysis, sheet: AnswerSource): { pins: Pin[]; report: AnswerMatch[]; sections: number[]; unused: number[] }
  // then analyseLines(read, { pins: [...sheetPins, ...teacherPins] }) → buildImport
```

Types: `src/import/answerSheet.ts` (`AnswerSheet`, `AnswerEntry`, `AnswerPoint`, `AnswerNote`,
`AnswerSection`), `src/import/matchAnswers.ts` (`AnswerMatch`, `MatchStatus`, `MatchDetail`),
`src/import/answerFiles.ts` (`FileClass`, `ClassifyReason`).

- **Classify:** the name (ans, answer(s), key, MS, marking, scheme, soln, solution, suggested,
  答案, 參考答案, 評卷, 評分, 題解, 解答) and the content: key entries and schemes with a mark
  per point, against MC with options and stems that ask. `both`: most MC already answered (a
  key at the end, bold, "Ans:"), or `splitAnswers` finds answers after the paper. A scan or
  an empty file has only its name (`noText`).
- **Pair:** names without answer words, separators and case (`nameTokens`: "2021-22" and
  "2021-2022" are one token; "P1", "Paper I" and 卷一 are all `paper 1`). Number tokens must
  agree, or the answer name leaves one out (a series file: "S6 Mock marking scheme" for
  Paper I and II). Each answer file goes to its best paper first; a paper left over then
  shares the best answer file that fits (the `.docx` and `.pdf` of one paper). A `both`
  file pairs with itself; ties go to the file nearest after in the list; a file named only
  "Answers" pairs with a lone paper.
- **Read:** key grids ("1. B 2. C", "1C⇥6B", tables, "1–5 BCDAA", a number row over a letter
  row, 「１．Ｂ」; "A/C" kept as `letters`), sections (Part/Section A, 甲部; Paper 1 and 卷一 as
  `paper`; or numbering going back), scheme labels ("1(a)", "3a)", "1a.", "6.(a)", "9a(i)",
  "Q3 (b)(ii)", "(b)", "b.", "(i)", "c.ii"), marks per point ("(1)", "[1]", "(1 mark)", "1M",
  "1A", "(1分)", "(0.5)", a marks cell, "(1)" alone under a table or diagram). Inline marks
  cut a line into points ("Yes (1) the tax falls (1)"; "(1) and (2) only" stays text). Rules:
  "Max: 4", "1@", "(1@, max 2)". A marker's notes: a repeated label ("1a. no → 0") and the
  lines after it, or the right column of an answer | notes table. A line that wraps (lower
  case after an unfinished, unmarked point) joins it. Every line gets a `use`; `unknown`
  lists the lines no entry took. A scan is `kind: 'scan'` with `pages`.
- **Match:** each sheet section goes to one of the paper's numbering runs (a run ends where
  numbering goes back): by section name first, then by numbers of the right kind (a letter
  for an MC, points for a written question). A section that fits nowhere is `unused`, so one
  file answering Paper 1 and Paper 2 gives each paper its own part. Within a run: question
  number, then part and sub-part by label (by position when the paper's parts have none).
  One row per paper question (`matched` / `missing` / `conflict` / `mismatch`), then `extra`
  rows (`noSuchQuestion`, `noSuchPart`, `duplicate`). `conflict`: the paper's own answer
  differs; the sheet's pin wins, and a teacher's later click wins over it. A letter past the
  options is `mismatch` (`letterOutOfRange`) and pins nothing. `marks` lists leaves whose
  sheet total differs from the printed marks; `missingParts` the parts that got nothing.
  `matchAnswers` reads only entries and sections (`AnswerSource`), so OCR or AI can supply them.
- **Pins:** an MC gets `{ kind: 'answer', line, index, from: 'sheet' }`. Text goes in
  `{ kind: 'scheme', line, part?, subPart?, points, notes?, each?, max? }`: `line` is the
  question's first line (keyed by line like every pin), `part`/`subPart` 0-based. A pin
  whose target is gone does nothing; removing the pin takes the text back out.
- **Where it lands** (existing fields only: no schema or `KNOWN_KEYS` change). A written leaf
  (a sub-part; a part without sub-parts; a part with sub-parts, for a scheme of the whole
  group; a question with no parts) gets `scheme: MarkScheme` when anything carries marks or
  `each`/`max`: one route, one group, a point per line with its mark, `each`/`max` on the
  group. The marker's notes follow as a second group of unmarked points (the model has no
  notes field). With no marks at all it gets `answer`: the lines joined by line breaks,
  notes after a blank line. An MC's text after the letter goes to `explanation`. Text is
  verbatim apart from the label and the marks tokens it was read from.

**Local check (real files, never committed):** DBS Assessment 1's answer file (a key table
with "A/C", Part B restarting at 1, "3a)" labels, "(1)" in a marks column, "@2", "Max: 4", a
table inside an answer) against the paper's `.docx` and `.pdf`: 19/19 MC and 8/8 schemes
matched, and the answer file pairs with both. An S6 mock from another school (Word-made
PDFs): Paper I carries its key on its last page (`both`; 45 questions, 44 MC); Paper II
carries its scheme after "-- End of Paper --" (`both`; `splitAnswers` gives 10 questions and
27 schemes placed, with notes from the flattened notes column; 4 `extra`, from Q10's source
table read as parts (a)–(d) on the paper side). Its separate marking scheme is a phone scan:
`scan`, 6 pages, no entries.

**Known weak cases:** a scheme whose numbering restarts with no heading and no change of
kind reads the second "1." as a numbered point; the unlabelled line after a lone "1. B" is
read as its explanation; "OR" between alternative answers stays a point, not a second route;
in a PDF, flattened answer | notes columns are told apart only by repeated labels; scans
need text recognition first.

### The UI, as built (2026-10-08)

`src/components/import/ImportDialog.tsx` orchestrates; the logic is pure in
`src/components/import/importBatch.ts` (tested without a DOM in `importAnswers.test.tsx`).

1. **Choose several:** the chooser takes several files (`multiple`; desktop `pickFiles`, the
   open sheet with `multiple: true`, each file read when its turn comes) and so does a drop.
2. **Read all:** one after another, a row each (read, waiting, cannot be read). Each read file
   is `examineFile`d: `classifyImport` (a scan or a file that would not open: by name alone) and
   `splitAnswers`.
3. **Link** (`LinkStep.tsx`), only with several files or one that holds only answers. Each file
   row: its pages, question count and the guess's reasons in plain words ("name says answers",
   "has an answer key"…, `REASON_TEXT`), a Questions / Answers / Both control, problems (a scan, a
   damaged file), and × to leave it out. A scanned answers file says answers cannot be read from
   a scan yet and is never a choice. Then each paper (a readable file that is not Answers) with
   an **Answers from** picker: No answers, Its own answers (a cut was found, or the teacher said
   Both), or any answers file; one file may serve several papers. `linkedAnswers`: the
   teacher's pick while it is still a choice, else `suggestPairs`. One file that is a paper goes
   straight to its review, its own answers applied when `splitAnswers` cut any.
4. **Review per paper** ("2 of 3 papers · file"; Previous paper / Next paper). `paperReview`:
   `matchAnswers` on the paper solved with the teacher's fixes but not their answer clicks (so a
   conflict is still reported), then `analyseLines` with `[...sheetPins, ...teacherPins]`: a
   click on an option wins. The answers bar (`answerSummary`): "19 of 19 MC answers set from
   file · 8 marking schemes · 2 to check", Next to check stepping through the rows (`AnswerRow`,
   worded by `answerRowText`: missing, a part missing, conflict, a letter past the options, no
   letter, a letter for a written question, no part label, no such question or part, a second
   answer, several letters, marks that differ), in paper order and part order; a question the
   teacher answered by clicking is settled. Each row also heads its question's card. The
   preview renders the **teacher version** (`previewDoc.ts`, the MC "Answer: X" line left out:
   the wash says it), and the teacher-only nodes are framed and labelled "Teacher copy only". Each
   `scheme` pin is a badge on its question's first line ("Scheme (a)", "Answer" when it has no
   marks or is an MC's explanation); its × leaves it out (`PaperState.dropped`), ⌘Z brings it back.
5. **Save as:** one paper keeps the gallery (`SaveAsStep`). Several (`SaveManyStep.tsx`): a row
   per paper with its name (from the file) and type (`defaultDocumentType` marked suggested,
   `misfit` warned), or 題庫 only for all (one `addToBank` over every paper's questions).
   `createImportedDocuments`: each paper as `createImportedDocument` makes one, the later ones
   through the store alone and written one at a time (the documents index is read-modify-write),
   the first last and opened. The notice lists every paper with an Open button for the others
   (up to three); `EditorHost`'s `open` reads the editor's state from a ref, so an Open from the
   editor flushes the open paper first. Nothing is written before Save; answers and schemes are
   in the questions (existing fields only).

**Real files through the dialog (local only, Chromium `next dev`):** DBS Assessment 1 `.docx`
with its answers `.docx`: paired by name; 19 of 19 MC answers and 8 schemes set, 1 row ("accepts
A or C. Using A."). The S6 mock trio: the marking scheme is a scan (6 pages, links nothing);
Paper I and Paper II each take their own answers (Paper I's key on its last page: 44 of 45
answered; Paper II cut after "End of Paper": 27 schemes and 19 rows: 8 marks that differ from
the printed marks, 7 parts with no answer (6 from Q10's source table read as parts) and 4
sub-parts the paper does not have). Exported to `.docx`
(LibreOffice text): student copies carry no "Answer:" line and no scheme text beyond wording the
questions themselves print; teacher copies carry every MC answer and every scheme point.
**Not checked:** the desktop shell's open sheet with several files and its native multi-file
drop were not driven (unit-tested through `pickFiles` and `planDrop`).

## 12. Header, footer and title block (as built, 2026-10-08)

A file's page chrome comes in with its questions. `readDocx`/`readPdf` return `chrome?:
PageChrome` (`src/import/pageChrome.ts`): `header`, `footer`, `firstPageHeader`,
`firstPageFooter` (`DetectedChrome`: rows of left/centre/right `ChromePiece`s, `rows: []` =
blank on page 1), `masthead` (rows) and `unsupported` (`ChromeLeftover`: where, text, reason).
`planChrome(chrome, { documentType, language, totalMarks, keepPreset })`
(`src/import/chromePlan.ts`) maps it onto the model; no schema change.

- **Pieces** (`classifyText`): a page number mark (Word `PAGE`/`NUMPAGES`, or a PDF number that
  counts up page by page) is `pageNumber`: "P.n" `pDot`, "Page n of N" `longForm`, else `plain`
  with the words around it as prefix/suffix; a count elsewhere ("1 / 6") is kept as `plain` and
  listed (`pageCount`). Blanks (`___`, `＿＿`, dot leaders, an underlined gap) with their label are
  `fillIn` ("( )" after one rides as its suffix); a bare Name/Class/學號 label is a 14-wide
  `fillIn`. "Full marks: 45 marks" / 總分 is `totalMarks`. The rest is `text`, bold/italic and a
  size that differs from the body kept as `format`.
- **.docx** (`src/import/docxChrome.ts`): the running parts are the largest section's (by text),
  page 1's are the first section's `w:titlePg` parts (none = blank page 1); `w:tab` follows the
  paragraph's tab stops (style ones folded in; centre/right by kind, left by position in
  thirds; none: centre then right), `w:ptab` its alignment, else `w:jc`. A framed paragraph
  (Word's page number box) joins the next line's row. A bottom border under a header (top over
  a footer) is the rule. Pictures, text boxes, tables, a fourth piece, even-page parts (with
  `w:evenAndOddHeaders`) and another section's parts (a cover) are leftovers.
- **PDF** (`src/import/pdfChrome.ts`): the running rows `layoutPdf` drops become the header and
  footer, zoned against the text column (centred within 8%, else an edge, else thirds). When
  page 1 lacks the running header, its rows down to 1.6 lines under the running one are page 1's
  header (the footer likewise); the rest stay for the masthead.
- **Masthead** (`mastheadVerdict`, shared): page 1's leading lines that are a blank to fill, a
  marks/time/date line, or a short heading (centred, bold, large, or title words), up to 8; it
  stops at a numbered question, a section heading, instructions, a sentence, a picture. Its
  lines leave the review (never questions or headings). More than three pieces on a line split
  into rows of three; a table row of up to three short cells is one row.
- **Mapping:** the file's header/footer replace the preset's unless kept; an edge the file lacks
  keeps the preset's; a Paper 2 booklet's header is its furniture, so the file's is a leftover
  (`noHeader`). The masthead is `Worksheet.bands` on a classroom or LQ worksheet; on a mock it
  fills the cover's school, exam, paper and time lines (`coverDetails` takes `{ en, zh }`) and
  the rest is listed (`noCoverPlace`). A full marks the questions do not add up to stays text
  (`marksDiffer`). Text goes on the side its script reads as, or on both when the paper does
  not print that side.
- **Dialog** (`src/components/import/ChromeReview.tsx`): the review's right pane opens with
  "Header, footer and title block" (header and footer drawn by `HeaderFooterBand`, the title
  block by `renderBand`), the keep-preset switch (per paper), and leftovers with Copy. Save as
  lists a mock's cover leftovers; Save applies everything in the one `createImportedDocument`
  save.

**Real files (local):** DBS Assessment 1 `.docx` and `.pdf` read the same: running header
"DBS Economics G11 Enhancement Class (2025-26) Assessment 1" (left), page 1's own header (the
14pt bold title centred; "Assessment 1" centre, "Name:____" right), footer "© 2026-27 Tino Ho"
left and the page number centre, masthead "Full marks: 45 marks" (live: the questions add up
to 45) and "Time allowed: 60 minutes". The exported header and footer parts match the file.
The S6 mock Paper I/II PDFs: header "…Economics I" left, page number right; masthead school,
exam and paper lines (a Paper 1 mock's cover takes them) and "Full marks … Date: ____". The
2019 HKEAA `.docx`: footer "2019-DSE-ECON 2–#" left and "#" centre; its margin text boxes and
the cover section's footer are listed.

**Known weak cases:** a header row whose text is wider than a third wraps inside its zone on
screen and in the PDF, while Word keeps it on one line (band zones are fixed thirds); a PDF's
page-1 header far below the running one reads as masthead; an even-page header is never applied.

