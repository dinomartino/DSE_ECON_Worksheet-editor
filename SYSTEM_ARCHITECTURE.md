# System Architecture — Bilingual HKDSE Economics Worksheet Generator

The deep reference: data flow, render pipeline, numbering, diagrams, pagination,
header/footer geometry. Setup and first tour: [`README.md`](./README.md).

**Read this before structural changes.** It records the rules a change must keep and,
where a rule is counter-intuitive, the constraint that forced it. Where this document
and the code disagree, the code is right — fix the document in the same PR.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router), fully static export |
| UI | React 19, Tailwind CSS 4 |
| State | Zustand 5, undo/redo, 100-entry history |
| Language | TypeScript strict |
| Export | Raw OOXML via JSZip (hand-built, no `docx` library) |
| Test | Vitest 4 — ~606 tests across 30 files, ~1s |
| Runtime | Browser-only: client-side `.docx`, no API routes |

## Project structure

```
src/
├── app/          Next.js shell; EditorHost gates start screen vs editor, the latter
│                 imported ssr:false (store is browser-only)
├── model/        types · numbering · marks · migrations · text · page · flow ·
│                 bands · bandSegments · edits · factories · newWorksheet · table ·
│                 diagram · diagramTemplates · diagramDraw · cover · coverTypes
├── registry/     Question-type extension point: types · index · mcq · structured
├── render/       ir (RenderNode + EditTarget) · worksheet (the walker) · diagram (SVG)
├── export/       docx/ (index · body · numbering · styles · runs · package · xml) ·
│                 diagramImage (PNG pre-pass) · clipboard
├── store/        worksheetStore — Zustand with undo/redo
├── storage/      WorksheetStore interface + localStorage implementation
├── components/   EditorApp · start/ (StartScreen + NewWorksheetForm) · preview/ (the
│                 paper IS the editor; RichTextEditable + richTextDom are the shared
│                 WYSIWYG surface) · editor/ · ui/
└── test/         shared fixtures
```

Tests sit beside what they test. `scripts/` holds the screenshot harness and
sample-`.docx` emitter.

> **Not in the repository:** the HKDSE past-paper scans and school assessment PDF used
> as reference are copyright and gitignored. "The reference paper" cites what was
> observed in them.

---

## The central principle: one IR, three backends

A question type's `render()` emits neutral IR (`src/render/ir.ts`) once; three consumers
read it, so preview, `.docx` and clipboard cannot disagree about numbering, ordering or
teacher-only filtering.

```
Question ──registry.render()──► RenderNode[] ──┬──► Preview.tsx      (React DOM)
                                               ├──► docx/index.ts    (raw OOXML)
                                               └──► clipboard.ts     (text/html)

edit ──► store.commit() ──► React re-render ──► renderWorksheet()
         (computeNumbering + registry.render) ──► preview live · .docx on Export · clipboard on Copy
```

Editor layout: AddRail | PageRail | Preview (scales-to-fit A4 sheets) | sidebar
([Content][Edit]).

---

## Document model (`src/model/types.ts`)

```
Worksheet
├── schemaVersion              CURRENT_SCHEMA_VERSION = 1
├── id · title · titleFormat? · instructions? · instructionsFormat?
├── fonts: FontPair            { latin, eastAsia }
├── pageSetup?: PageSetup      paper · orientation · margins, all twips
├── bands?: Band[]             masthead / title block
├── header? / footer?: HeaderFooter
│     enabled · bands · rule? · showOnFirstPage? · firstPage?: { bands, rule? }
├── questions: Question[]      every question, in printed order
│     ├── McqQuestion         blocks · statements? · options[ text · blocks? ] · optionLayout? · answerIndex · marks · explanation?
│     └── StructuredQuestion  blocks · showTotalMarks? · parts[ blocks · marks? · answer? · subParts? ]
├── layout: LayoutElement[]    section · heading · text · spacer · divider · pageBreak ·
│                              answerLines · partHeader · labelList
├── flow: FlowItem[]           display order of questions + layout, interleaved
├── createdAt · updatedAt
└── __unknown?                 fields from a newer build, preserved verbatim

ContentBlock = ParagraphBlock | TableBlock | ImageBlock | DiagramBlock
BiText { en: RichText, zh: RichText }        RichText = InlineRun[]

TableBlock   rows · caption? · width? · indent?  (box, fractions of content width)
             columnWidths? (fractions of the *table*) · cellPadding? · columnPadding?[]
             borders? ('all' | 'box' — a boxed stimulus rules its frame only)
  TableRow     cells · cellPadding? · minHeight?     padding resolves cell → column → row → table → default
    TableCell    text · image? · colSpan? · rowSpan? · align? · covered? · padding? · format?

ImageBlock / DiagramBlock also carry `align?` (`w:jc` on the picture's paragraph).
```

**Numbering and marks are never stored.** `computeNumbering()` and
`questionMarks()`/`partMarks()`/`sectionMarks()`/`worksheetMarks()` derive them at
render time — which is what makes reordering and undo/redo trivial.

### A group of sub-parts can share one marks label

`QuestionSubPart.marks` is **optional**, and absent is not zero. Real papers routinely
mark a *group*: DSE 2019 P2 Q13(b) prints nothing on (i) and "(5 marks)" on (ii), and
Q8(a) and Q12(a) do the same — the label belongs to the pair, not to either half.

- **Absent prints nothing; `0` prints "(0 marks)".** All three backends already gated on
  `marks !== undefined`, so making the field optional was enough to reach the shape. Before
  it, the only way to write Q13(b) was `marks: 0` on (i), which printed a literal
  "(0 marks)" — the paper's shape was unreachable and the workaround was visibly wrong.
- **`partMarks` falls back to the part when no sub-part is marked.** Summing regardless
  would report 0 for a part plainly worth 5, silently understating the question, its
  section and the paper total. Any sub-part carrying its own marks flips the rule back to
  summing, so the ordinary case is untouched.
- **The label prints on the last sub-part of the group**, where the reference puts it. On
  the part's own line it would read as marks for the lead-in text, which is not what is
  being marked.
- The panel mirrors the model: an unmarked sub-part's pill reads `shared` rather than
  interpolating an absent number (which rendered a bare `m`), and the part's own marks box
  — hidden whenever sub-parts exist — returns as "Marks for (i)–(ii) together", labelled
  from the real sub-part labels. `NumberField`'s `clearable` is a discriminated union, so
  only a caller that opts in is handed an `undefined` its model has room for.

### Document flow (`src/model/flow.ts`)

Layout elements are deliberately outside the `Question` union: they take no number and
carry no marks, so registering them would force numbering/marks to learn about types
that have neither. `resolveFlow(worksheet)` produces display order under one invariant:

> **`questions` owns question order. `flow` contributes only the position of layout
> elements relative to the questions.**

- Two sources of truth for "which question is third" would silently disagree; a missing
  or stale flow costs an element its *position*, never its existence (unlisted ids
  append).
- **An insert is a move and must write both lists.** `resolveFlow` emits questions in
  array order, so a new question positioned only in `flow` prints last regardless.
  `applyOrder()` is the one rule for splitting an ordered flow back into the two lists;
  `insertIntoFlow` goes through it exactly as every move does — deriving `questions` by
  hand at an insert site is what let them disagree.

### A section is a marker, not a container

One flow for the whole document; a `section` is a layout element carrying
`restartNumbering`, and the questions it names simply follow it. Sections used to own
`questions`/`layout`/`flow` — but a real paper runs Section B on mid-sheet, so a shared
sheet had no single owner; flattening deleted four "which section owns this id?"
implementations and reduced `movePage` to one `moveRunInFlow`.

- Derivations key on the section element's **id**, not an index (a dragged marker keeps
  its identity): `computeNumbering` resets the counter; `renderWorksheet` opens stream
  `question:<elementId>` so the restart is native `w:num`.
- A section heading and a free heading **render identically** (same style, `keepNext`);
  they differ only in meaning to numbering, derived before rendering — which is why the
  v4→v5 flattening left `word/document.xml` byte-identical. A migrated section that
  never had a heading contributes **no element** (an empty heading would print a blank
  line that was never there).

### Constrained layout: bands and zones (`src/model/bands.ts`)

Placement is **slot-based, never free**: a `Band` is one printed row with three drop
zones (left/centre/right) so every arrangement maps onto one Word paragraph with tab
stops. Zone positions are **fixed thirds** (0, 0.5, 1) — a centre field is centred on
the page, not on the content, and doesn't drift as fields are added.

Two field kinds print a **computed** number — `totalMarks` (`worksheetMarks()`) and the
`partHeader` "(19 marks)" suffix (`sectionMarks()`) — because a stored total goes stale
the moment a question is re-marked.

### A field is authored wording around a derived value

Every `BandField` is **authored text · derived value · authored text**;
`bandFieldSegments()` (`model/bandSegments.ts`) is the one place that says so. A plain
`text` field has no middle; "Page 5 of 12" interleaves two values. This is what makes a
computed field *editable*: the number stays derived, only the wording is
`prefix`/`suffix` rich text. (Before this, computed fields were dead spans, and `fillIn`
emitted an `EditTarget` that `patchBandFields` silently discarded.)

- **`bandFieldText` composes segments, never respells them** — string form and editable
  form are the same decomposition, so a retyped prefix reaches `.docx`, clipboard and
  thumbnails for free.
- **The `.docx` walks segments too**: only a genuine placeholder becomes a native
  `PAGE`/`NUMPAGES` field; authored wording stays ordinary runs.
- **A `bandField` target names a `side`** (omitted = `prefix`), or bolding "Full marks: "
  would also bold " marks".
- **Segments are not separate cells** — a cell is a tab stop, so splitting would scatter
  the field across the row. They ride as `parts` in one cell.
- **Wording carries its own spacing**: both band paths set `whitespace-pre-wrap`, or
  HTML collapses the boundary spaces ("Full marks:45marks") while the `.docx`
  (`xml:space="preserve"`) prints them.
- **An empty side renders a `+` affordance, and affordances print** — it takes
  `data-print-hide`, deliberately *not* `data-empty-placeholder` (which reserves a box:
  right for a paragraph, a mid-phrase gap for a fragment).
- v5→v6 writes the old hardcoded spellings into `prefix`/`suffix`. Its defaults are
  inlined, not imported from `DEFAULT_FIELD_WORDING` (import would close a
  bandSegments→page→factories→migrations cycle); a test asserts the spellings agree.

### A cover is a page of regions, not a stack of rows (`src/model/cover.ts`)

A mock-exam cover is **two unequal columns side by side** — identity lines and
instructions on the left, a candidate panel on the right, a rule between them. The
reference's own mechanism, read out of its `word/document.xml`:

```
<w:cols w:num="2" w:equalWidth="0">
  <w:col w:w="5328" w:space="144"/>   left  — identity, title, instructions
  <w:col w:w="3845"/>                 right — the candidate panel
</w:cols>
```

The first attempt built covers out of masthead `Band`s plus flow elements and **could not
produce the shape at all**: a band is one printed row across the full text column, so a
stack of them makes a stack of centred lines. No arrangement of full-width rows reaches a
two-column page. So `CoverPage` models what a cover is — *named regions of a page* —
holding `CoverLine[]`. Still slot-based (a teacher fills regions, they do not drag boxes
to coordinates), but the slots are areas of a sheet rather than thirds of a row.

- **The two papers get different *shapes*, not just different wording.** An MCQ candidate
  answers on a separate machine-read sheet, so a Paper 1 cover has nothing to write on:
  no panel, therefore **one full-width column**, with its identity lines centred across
  the page and instructions numbered `1.`. Paper 2 is the booklet the candidate writes in,
  so it carries the panel and the two-column split that makes room for it, numbering
  `(1)`. `coverHasPanel()` is the single switch both backends read; `instructionMarker` is
  stored rather than derived, since it is a house style a school may have a view on.
- **`worksheet.cover` is its own field**, so the paginator never sees it: a cover neither
  flows nor shares a sheet with question 1, and giving it to the packer would mean
  teaching every measurement path about a page that can never split.
- **`CoverRenderNode` is deliberately not a `RenderNode`.** Every member of that union is
  something that flows in the body; adding a whole page to it would force every backend's
  node walk to handle a case that cannot appear inside a question. Its regions *are*
  `RenderNode[]`, so the backends reuse the paragraph and columns emitters — only the
  frame is new.
- **The `.docx` is a real two-column section**: a `w:br w:type="column"` moves into the
  right column (Word columns are a flow; there is no "put this on the right" property),
  and a **continuous** `sectPr` ends the cover so the body returns to one column without
  an extra blank sheet. `nextPage` there would emit one.
- **An empty panel prints one wide column**, not a narrow one beside a blank strip —
  `coverHasPanel()` decides, and both backends read it.
- **Instruction numbers are derived from position**, never stored, as questions are:
  deleting (2) renumbers the rest. They are literal text on a hung `ColumnsNode` rather
  than a `w:num` stream, since a cover's instructions are not part of question numbering.
- **Lines are addressed by id** (`coverLine` / `coverField` `EditTarget`s), so they are
  clicked, typed and formatted on the page like everything else, and an edit survives a
  line being added above it.
- **A framed note pins `w:tblW` to the column width.** A table inside a Word column still
  measures against the section's full text width unless told otherwise, so `auto` drew a
  frame that ran off the page edge.
- **The corner block floats; it is not in the flow.** The reference anchors a `wpg:wgp`
  group at (−0.65in, −0.25in) — outside the text column — holding a textbox of the code
  lines and the diagonal beside it, in a `chExt` child space so the two keep their
  relative positions. Emitted as ordinary paragraphs the lines sit *in* the column: they
  push the identity lines down and can never reach the corner. A `wrapNone` anchor
  reserves no space, so the flow needs `CORNER_CLEARANCE_LINES` blank lines to print
  below it — without them P2's narrow column printed straight through the block.
- **The diagonal's direction is measured, not reasoned.** It runs bottom-left to
  top-right; the reference scan goes y 30→130 while x goes 222→122. Drawing that takes
  `a:xfrm flipV="1"` in the `.docx` and `linear-gradient(to bottom right, …)` in CSS —
  both the opposite of the obvious guess, and each shipped backwards once. The CSS
  keyword names the gradient's axis of travel while its stops lay a band *perpendicular*
  to it. Check by cropping the render and printing dark-pixel x per y.
- **The corner block is the reference's own geometry, and the text size is what makes
  it fit.** The reference sets its corner lines in Arial bold at the body size (11pt);
  at 18pt they wrapped, which forced a wider textbox (`1900` vs the reference's `1520`)
  and shortened the diagonal to the strip beside the text. At the body size the
  reference's numbers hold as-is: textbox `(0,312) 1520×1350`, diagonal spanning the
  full `2725×2710` child space corner-to-corner, as its does. The diagonal's lower tail
  lands in the page margin, left of the text column, so it cannot strike the identity
  lines.
- **The cover's `sectPr` must restate `w:pgSz`/`w:pgMar`.** A section that omits them
  does not inherit from its neighbours — Word falls back to its application default
  (Letter on a US-locale install), so the cover printed on different paper than the
  body it fronts. Invisible on screen; the harness's LibreOffice leg caught it as a
  765×990 raster beside 744×1053 pages.
- **The foot block is the cover section's own footer part** (`footer3.xml`, its own
  relationship id), which is the reference's own mechanism — its authority lines and
  paper code are `footer1.xml`, not flow paragraphs. A footer is what pins the block to
  the page bottom whatever the columns above it do. The preview mirrors it as an
  absolutely positioned strip at the exported `w:footer` offset (0.5in). `footNote` —
  the boxed note the reference's Paper 1 carries bottom-right — prints beside the foot
  lines inside that part, as a one-row borderless table whose note cell alone is framed
  (a `ColumnsNode` cannot hold a multi-line bordered box, and a footer is not a list
  item, so the "never a table" rule for rows does not bind).
- **The vertical rhythm is measured, not chosen.** The reference spends blank
  paragraphs in exact runs — 8 under the corner block, 1 inside the identity pair, 2
  before the title pair, 1 before the timing, 6 before INSTRUCTIONS, 1 between
  instructions — and the generator's `gapAfter` values encode exactly those. The gaps
  live in the IR as blank lines (single source); the exporter and preview add no
  structural spacing of their own between head and instructions, which each once did,
  differently.
- **The panel grid is the reference's numbers, shared through `COVER_PANEL`**
  (`model/cover.ts`, twips): tables indented 340 into the column, label cell 1558,
  write-in cells 290 wide in a 504-exact row, the framed note at least 1584 tall (the
  stature of the reference's barcode box). The preview draws the same constants as
  inches; two copies is how the backends would drift.
- **`scripts/cover-verify.mjs` is the harness** that answers "do the three outputs
  agree, and do they look like the reference?" in one command: per paper style it
  rasterises the exported `.docx` (LibreOffice), the preview sheet (Playwright), and
  Chrome's print PDF, sets them beside the reference scan on a labelled contact sheet,
  and prints pairwise diff scores (`scripts/cover-compare.py`). The reference legs skip
  gracefully where the gitignored scans are absent.
- **The two papers use different font schemes.** Paper 2 is Arial throughout. Paper 1
  mixes: Arial for the corner block, the identity lines and the paper's name — read at a
  glance — and Times New Roman for the timing, "INSTRUCTIONS" and the instruction body,
  read properly. So `CoverPage.fonts` is a **default** that any line overrides through its
  own `format.fonts`; a single cover-wide font could express Paper 2 and not Paper 1.
- **The operative word in an instruction is bolded per run** — "Answer **ALL**
  questions", "mark only **ONE** answer" — since it is a stretch of characters, not a
  property of the line (§ per-run formatting).
- **The column rule is a shape, not a border.** The reference draws no `w:pgBorders`, no
  `w:cols w:sep` and no `w:pBdr` — the divider is an anchored `prstGeom prst="line"`
  connector, zero width by full page height, `a:ln w="19050"` (1.5pt). It is the only one
  of the four mechanisms that puts a line of a *chosen weight* down a column's full
  height. This export drew no rule at all until it was added: the preview showed one and
  Word showed nothing, which only opening the exported file reveals. The preview draws a
  1.5pt `border-left` in the same place — the one piece of cover geometry where the two
  backends use genuinely different mechanisms, so the weight is stated on both sides.
- **Every region must reach the `.docx`.** The regions are separate lists and `coverXml`
  walks them by hand, so one left out is invisible until someone opens the exported file —
  the page looks right and the document is missing a block. A test walks the *model* and
  asserts each line arrives, using a **unique sentinel per line**: the generated defaults
  repeat themselves (the school name is both a head line and the foot line), and searching
  for stock text found the other copy and passed even with a whole region dropped.
  Verified by deleting each of the four regions in turn.
- **Structure is reproduced; wording is not.** No rubric prose, authority or examination
  lines, barcode/candidate-number apparatus, or copyright notice. The panel is
  name/class/number — a school identifies candidates by name. Two tests guard it: a phrase
  blocklist, and a 6-word sliding window over the reference `.docx` (skipped where the
  gitignored file is absent).

### One row, many uses: `ColumnsNode`

The single IR primitive behind every side-by-side layout (band zones, inline MCQ
options, labelList). Exports as **one paragraph with tab stops**, never a borderless
table — a table is still a table in Word and cannot sit inside a numbered list item.
Cell positions are fractions of the row's own width (after `indent`), so they survive
paper/margin changes. Cost: inline MCQ options get literal `A.`–`D.` text (one paragraph
cannot carry four list numbers); stacked options keep native `w:num`.

**A long row needs `hanging`, or its wrapped lines break the column.** The row is one
paragraph, so without a hanging indent a wrapped cell's continuation returns to `indent`
— under the *marker*, not under the text it belongs to. Invisible on the short rows this
primitive was built for (band zones, inline options) and wrong on the long ones: an exam
cover's numbered instructions wrap heavily, and both reference papers hang them.

- **`hanging` and `indent` are one `w:ind`** — Word merges the element as a whole, so
  emitting them separately drops whichever came first (the same trap `formatParagraphProps`
  handles for `w:line`).
- **With a hang, the second cell is placed from `indent`, not from `at`** — it *is* the
  text column, and that is where Word returns each wrapped line. Placing it by fraction
  puts the tab stop somewhere inside the column and the wrap fails to line up. The preview
  matches by giving the marker cell exactly the gutter as a fixed width.
- `labelList.hanging` supersedes `valueAt`: the hang already says where the value column
  starts, and storing both is two answers to one question.

### An enlarged line box follows its font size

Wherever the preview writes `fontSize` it must write `lineHeight` too — in `formatStyle`
(every element) and `bandFieldStyle` (band fields). The page runs on a fixed 12pt line
with no paragraph spacing, so a 28pt title drawn into a 12pt box **overprints the line
above**: three cover title lines landed on top of each other, and so did three masthead
rows. The exporter already restates `w:line` from `exactLineFor()` whenever `fontSize` is
set (`formatParagraphProps`), and `bandsHeight()` already scales its estimate by the
largest field size — so without this the DOM disagreed with both the exporter and the
paginator. One rule, two units: a unitless multiple on the page, twips in the `.docx`.

### An option can be a picture, and then it must stack

`McqOption.blocks` exists for the "which of the following **diagrams**…" question (DSE
2021 P1 Q36), where the four options *are* figures and the question is unanswerable
without them. The blocks render after the option's own numbered paragraph — not inside
it, since a `w:drawing` in a list item takes the marker's hanging indent and needs the
`lineRule="auto"` an option style cannot give it.

- **A blocks-bearing option forces `stacked`**, in `resolveOptionLayout` rather than on
  write, so it stays true for documents authored before options could carry blocks. A
  side-by-side row is one paragraph of tab stops and cannot hold a picture per cell — the
  figures would be dropped *silently*, leaving a question that looks complete and cannot
  be answered.
- **The option letter keeps with its own figure** (`keepNext`), including the last one,
  or Word breaks the page between "D." and the diagram that answers it.
- `questionBlockLists` and `mapAllBlocks` both read `options` **structurally**, like
  `parts` — no branch on a concrete type id (§registry). The two must reach the same
  lists, or a block is findable but unwritable.
- **The blocks indent to the option's own text column** (`OPTION_LIST_INDENT.left`, not
  restated), because they continue the answer the letter introduces. An unset indent puts
  them at the page margin — correct-looking in every unit test, wrong on the page.
- Authored through the **same `BlockEditor` the stem uses**, so a diagram in an option is
  inserted and templated identically. It takes a `figureWidth`: four figures stack in one
  question, and the stem's full-column default would put each a third of a page down.
  Offered behind an affordance rather than a permanent insert row — the common option is a
  line of text, and four insert rows would bury it.

### Per-element formatting (`TextFormat`)

Named styles supply defaults; `TextFormat` records **only deltas**, applied as direct
formatting on top. An untouched document exports byte-identically to the style-only
baseline. Formatting attaches to whole elements, never one language side — a bilingual
heading is a single Word paragraph, so per-side sizes could not export.

### Per-run formatting (`InlineRun`)

A run overrides a stretch of characters (`fontSize`, `color`, `fonts`,
bold/italic/underline), mirroring `w:r`/`w:rPr`. Three layers compose: named style →
element `TextFormat` → run. Flags **or** with the element; size/colour/fonts
**replace** it. `applyRunFormat(runs, start, end, patch)` (`model/text.ts`) splits at
both offsets, patches, and `normalizeRuns` re-merges identical neighbours (without the
merge, runs only ever fragment). `null` in a patch **clears**; `undefined` cannot
(indistinguishable from "not mentioned" once spread).

### Sub- and superscript are run-only, and reachable by button

"S₁", "P₁+t", "Q₂" are the naming convention of the subject, so `vertAlign` is offered in
both editing surfaces: the page toolbar (on a character selection) and the diagram canvas's
in-place editor (which wraps the selection in the storage marker `_{1}`). The model, the
markers and all three renderers already understood it — but `toRunPatch` silently dropped
the field, so a subscript could be written down and printed yet never *applied* from a
control, which is the only way anyone would think to reach it.

**It stays off `TextFormat`.** That type is what an *element* overrides, and a paragraph
set wholly in subscript is meaningless; it rides as an explicit extra field on the
`onFormatRuns` patch instead, so the element path cannot reach it by accident.

### A field cleared to nothing stores nothing

"Empty" has two spellings, and only one of them is `[]`. A contenteditable emptied with
⌘A-Backspace hands back a run holding `"\n"` — whitespace, so `isBiTextEmpty` reports
true and every renderer draws nothing. The husk is therefore **invisible in the app while
still being in the document**: it saves, reloads, reaches the exporter and prints a
phantom blank line. Two of the reference worksheets carried exactly
`{"en":[{"text":"\n"}]}` in a diagram caption.

So every optional-text write path drops the field when `isBiTextEmpty` is true, rather
than storing what the surface returned (`DiagramEditor`'s title, `CaptionField`'s
caption). **Its placement goes with it** — `titlePlacement`/`captionPlacement` answer
"which side does this print on", and with nothing to print the question has no subject;
leaving it behind makes a later re-titling silently inherit a side nobody chose. Dropping
the keys also restores the measured size, since an absent title reserves no room.

### The editing surface renders runs, not markers

`**bold**`, `__underline__`, `^{sup}` are a **storage** form (`serializeRuns`), not a
thing to type at. Every editing surface (`RichTextEditable`, shared by the page, the
sidebar's `BiTextField` and table cells) renders runs as themselves. The string form is
lossy — `serializeRuns` spells five flags and nothing else, so round-tripping dropped
size/colour/fonts; the DOM surface reads attributes back (`data-run-attrs`) and its
offsets are already the model's plain-text offsets (no `sourceOffsetToText`
translation, which survives only for non-editing uses). One representation = no
draft/flush staleness.

Rules the surface must keep (each failed silently before):

- **A contenteditable is uncontrolled.** Runs are painted imperatively (`runToNode`);
  rendering them as JSX children makes React reconcile nodes the browser mutates
  (typing "Based" produced `BasedBaseBasBaB`).
- **The field's own echo must not repaint it.** `paintedRef` + `sameRuns` recognise the
  store round-trip; only a genuine outside change repaints, then restores the caret.
- **Typing is left to the browser** (keeps IME, autocorrect, undo). `onBeforeInput`
  intercepts only a *pending* format ("bold on, then type"); paste is forced to plain
  text.
- **The toolbar reports the selection, not the element** (element-merged format
  inverted clicks: Title is bold → bar sent "clear bold"). The blur handler ignores
  focus moving into `[role="toolbar"]`.

- **A collapsed caret is published, and only when it changes.** The surface used to drop
  it, since the sole consumer was the format toolbar and formatting an empty range is
  meaningless — but *inserting* at a caret is the ordinary case, so a control needing one
  simply never appeared. Publishing it exposed the second half: `selectionOffsets` builds
  a fresh object per call, so an unconditional publish sets state to a value that is
  equal but never identical, and the render that follows republishes it until React bails
  out ("Maximum update depth exceeded"). `sameSelection` compares by value; consumers
  wanting a genuine range check `start < end` themselves (`runRange` vs `runCaret` in
  `Preview.tsx`). Both directions are invisible to a unit test of the feature — the
  button's absence and the loop both only show in a browser.

`replaceRichTextRange(runs, start, end, insert, fallback)` is the edit primitive:
inserted characters inherit from the run left of the caret (then right, then fallback) —
Word's rule. **`insertBlank` is the deliberate exception**: a fill-in blank ("…using
______ to solve…", a third of DSE P1's questions) forces `underline` instead of
inheriting, or a blank typed after ordinary prose is twelve invisible spaces. It stays
underlined spaces rather than a new run kind or marker — that already exports, pastes and
prints through all three backends, so what was missing was only a way to reach it.

---

## Render IR (`src/render/ir.ts`)

```
RenderNode = TextNode | ColumnsNode | TableNode | ImageNode | DiagramNode
           | PageBreakNode | SpacerNode | DividerNode | AnswerLinesNode

TextNode: style (one of 14) · text: BiText · listRef? {stream, definition, level, marker}
          marks? · keepNext? · teacherOnly? · indent? · format? · edit?: EditTarget
```

`EditTarget` is a discriminated union keyed by **id**: `worksheetTitle`,
`worksheetInstructions`, `blockText`, `blockCaption`, `tableCell`, `mcqOption`,
`mcqStatement`, `mcqExplanation`, `partAnswer`, `subPartAnswer`, `layoutText`,
`bandField`, `labelListCell`. (A section heading is reached via `layoutText`.)

- **`edit` is inert in export** — docx/clipboard never read it.
- **Derived text carries no target** (marks totals, "Answer: C", the number in a band
  field) — typing over it would have nowhere to go. The authored wording *around* a
  number does carry one.

`listRef.stream` connects IR to `.docx`: each distinct stream becomes one `w:num`.

---

## Numbering (`src/model/numbering.ts` + `src/export/docx/numbering.ts`)

**Derived, app-level:** `computeNumbering()` walks the resolved flow; numbers are
1-based, continuous until a `section` sets `restartNumbering`. Walking the flow is what
makes a restart happen where the heading actually sits.

**Native, in OOXML:** three abstract multilevel definitions —

| Abstract | Used for | Levels |
|---|---|---|
| 0 | questions | `1.` decimal → `(a)` lowerLetter → `(i)` lowerRoman |
| 1 | MCQ options | `A.` upperLetter |
| 2 | statements | `(1)` decimal |

Each IR stream gets a concrete `w:num`. Options/statements get one per question with
`w:startOverride` (restart at A); a section restart is a new `w:num` on the question
stream.

---

## Export pipeline

### `.docx` (`src/export/docx/`)

| File | Responsibility |
|------|---------------|
| `index.ts` | Orchestration: IR → decode images → build parts → zip |
| `body.ts` | Body XML: paragraphs, `w:tbl`, `w:drawing` |
| `numbering.ts` | Abstract defs + per-stream `w:num` with overrides |
| `styles.ts` | The 14 `NodeStyle` styles + `AnswerLine` |
| `runs.ts` | `w:rFonts` (Latin + East-Asia), `w:r`, bilingual `w:br` |
| `package.ts` | OPC: content types, rels, header/footer parts, `sectPr`, JSZip |
| `xml.ts` | Escaping, illegal-char sanitization, attribute builder |

### One fixed line, no paragraph spacing

Every paragraph: `w:line="240" w:lineRule="exact"`, `w:before`/`w:after` zero — the
reference paper's model (275/296 paragraphs carry exactly that; 102 are empty). All
vertical rhythm comes from the line box. Consequences (each fails silently):

- **Separation costs a line.** `blankLine()` in `render/ir.ts` is that line; every gap
  goes through it (`ITEM_GAP` in the walker for boundaries between items; question
  types use the same helper inside a question). The gap is an IR node, not a style
  property, so all three backends space identically. Reference rhythm: stem → blank →
  statements → blank → options; stem → blank → (a) → blank → (b). An MCQ with no
  statements gets only the stem's blank. The between-item gap lives in the walker
  because it belongs to the *boundary* — a type appending its own would double up and
  leave a stray blank at document end.
- **A gap counts what is already there.** Text ending in a trailing hard break already
  spent a line; `pushGap()`/`endsInBlankLine()` (`render/ir.ts`) push a blank *unless*
  the stream already ends in one. Every gap site uses it. `endsInBlankLine` is
  **language-neutral** (tests both sides): one IR feeds all backends, and the paginator
  measures these boxes.
- **The gap is suppressed only at the true top of the page**, not flow index 0 — the
  masthead/title/instructions print above the flow (`somethingAboveFlow` in
  `render/worksheet.ts`). Keying on index made "Section A" and an identical "Section B"
  space differently.
- **`exact` does not grow** (unlike `atLeast` it clips) — that keeps a bilingual page on
  one rhythm through CJK glyphs and inline images. Larger sizes need a larger box:
  `exactLineFor()` scales from the 11pt/12pt base.
- **A picture's paragraph is the one exception, and must say so** (`w:lineRule="auto"` in
  `pictureXml`). A figure is taller than a line by design — a 300px diagram is ~225pt
  asking to sit in a 12pt box — and `exact` clipped it to a 12pt slice, painting the rest
  *behind* the text above. The symptom is the worst kind: the image selects at full size
  in Word, the PNG bytes, `wp:extent` and the relationship are all correct, and the page
  simply looks empty. `auto` is what Word writes for an inline picture, so an edited file
  round-trips. Separation around the figure stays a blank line, never spacing on this
  paragraph.
- **A picture is placed by `w:jc` on that same paragraph** — there is no alignment
  property on the drawing itself. `align` on `ImageBlock`/`DiagramBlock` is resolved in
  the IR (like the table box) and defaults to **`center`**, not `left`: both backends
  hardcoded centring before this existed, every figure in the reference papers is
  centred, and only a teacher who chose otherwise stores anything. The preview expresses
  it as `text-align` — the property `w:jc` actually maps to — so neither figure may carry
  `mx-auto`, which reads as "centre" whatever `align` says.
- **Every style states its own metrics.** Word merges `w:spacing` as a whole element, so
  a style setting only `w:before`/`w:after` silently drops `w:line`;
  `formatParagraphProps()` restates the line whenever a teacher overrides spacing or
  size.

### A numbered paragraph indents as a block, not by its first line

Word list geometry is `w:ind` `left` + `hanging`: text column at `left`, **marker
alone** pulled back by `hanging`. Every wrapped line starts at `left`. CSS `text-indent`
moves the first line only — a different shape that disagreed with Word — so the preview
uses `padding-left` and draws the marker **absolutely positioned** at `left - hanging`.

- **Each level's marker starts where its parent's text starts**: `(a)` begins at the
  stem's text column (360), `(i)` at part text (720) — `left - hanging` at each level
  equals `left` above. (Levels 1–2 were once a full step too deep.)
- `QUESTION_LIST_INDENTS` in **`model/numbering.ts`** is the one definition; three
  consumers (`export/docx/numbering.ts` → `w:ind`, `Preview.tsx` layout,
  `registry/structured.ts` continuation indents) may not import each other, so the
  constant sits below all three. One stale copy = page breaks in different places on
  screen vs paper.
- **MCQ lists follow the same rule with the stem as parent**: statements
  `{left: 720, hanging: 360}` (marker at stem text, like `(a)`); options one step deeper
  at 1080 — the statements are part of the question, the options are answers to it.
- **Style classes must add no margin of their own** — `ml-*` under list geometry
  double-indents and defeats the statement indent outright. `listIndent.test.ts` greps
  `Preview.tsx` for the four offenders.
- **The preview pins the same numbers**: `.paper` sets 11pt / fixed 12pt line, zero
  paragraph margins — inheriting the shell's 16px/1.5 packed ~⅓ less per sheet than
  Word and every break landed early.

### "(4 marks)" sits on the last line with text

The `.docx` uses a right-aligned tab stop at the content edge, `w:tab` run *after* the
text: marks land on the final line, dropping only when it has no room, and reserve
nothing on other lines. **No CSS property expresses that** (`float:right` is placed on
the first line with room and overprints when it drops; `text-align-last: justify`
stretches word spacing). So reserving and placing are separate (`MarksTrail` in
`Preview.tsx`):

- An **invisible twin** of the label rides inline at the end of the text — in flow, so
  it shortens only the actual last line, and being the label it reserves exactly the
  right width at any font size (a fixed shim overprints when the label is wider).
- The **visible copy is pinned `bottom: 0; right: 0`** in the (already `relative`)
  paragraph.
- **A trailing hard break is a blank line the marks must not hang on.**
  `trailingBlankLines()` (`model/text.ts`) counts them for both backends — the page and
  the `.docx` must choose the same line. The preview lifts the label by that many `lh`;
  the exporter **moves trailing breaks after the marks**. `marksAnchorRuns()` picks the
  side to count in bilingual mode (Chinese renders last; falls back to English).
- Limits, deliberate: the reserve rides only at the **end of the inline flow** (a
  sibling inside the contenteditable would put React in charge of browser-mutated
  nodes), so a hard-broken final line reaching the right edge can still be overlapped —
  as in Word, where a tab stop cannot push a line a `w:br` already ended. Both copies
  `whitespace-nowrap`.

A one-line part looks correct under every wrong scheme — the bug only shows on a part
that wraps or ends in a break.

`BAND_ROW_TWIPS` (`model/page.ts`) duplicates the 240tw (a band row is one such
paragraph); duplicated because `model/` may not depend on `export/`; a test asserts
agreement.

### Tables have no header row (`src/model/table.ts`)

`headerRowCount` was removed — wrong twice for real papers. Output: it drove
`w:tblHeader`, grey `EFEFEF` fill and bold (no HKDSE table has any; the clipboard's
`<th>` re-applied browser bold-centred on paste). Structure: a distribution table's
headings run across the top *and* down the left — not a count of rows. Emphasis is
ordinary per-cell formatting. Removed without migration (existing header rows become
plain, which is what the papers look like); regression tests assert
`not.toContain('<w:tblHeader/>')` and `not.toContain('EFEFEF')` — the only symptom is on
paper.

### A boxed stimulus is a frame with nothing ruled inside it

`TableBorders` is `'all' | 'box'` — two named modes, deliberately not per-edge control
(which was removed once already for being wrong about real papers). The papers draw only
these two: DSE 2021 P1 boxes a stimulus four times, and Q21 is one frame around three
proposals with **no rule between them**, which a uniform grid cannot express at any
padding.

- **`box` writes `w:val="none"` on `insideH`/`insideV`, it does not omit them** — Word
  inherits an unstated border from the table style, so omitting draws the very grid the
  box exists to suppress. The frame's four sides are unchanged, which keeps an ordinary
  table byte-identical (pinned by a test comparing stored `'all'` against unstored).
- **The frame sits on the table, the cells go borderless** in both HTML backends, so it
  stays one unbroken rectangle however the rows are merged.
- **`TableCell.image` is the other half** (Q30: an extract and a photograph inside one
  frame). An image, not a `ContentBlock[]`: a cell is one `w:p`, and a picture is the one
  thing that can join those runs without making a cell recursive for every backend. It
  must be added to `collectImages`' walk — emitted but uncollected is a dangling
  `r:embed`, which Word reports as a repair error on the **whole file** rather than as
  one missing picture.

### Padding resolves in one direction; Word only understands the answer

Teachers size padding on cell, row, column or table; OOXML has only table `w:tblCellMar`
and cell `w:tcMar`. The four levels live in the model as editable intent;
`resolveCellPadding()` flattens the winner onto every `w:tc`. Load-bearing:

- **Each edge resolves on its own** ("roomy on top" + "tight on the left" compose).
- **Zero is a value, not absence** (truthiness would fall through to a roomier level).
- **The default is the old hardcoded pair** (60/108 twips), so untouched tables export
  byte-identically; `styles.ts` spells `w:tblCellMar` *from* the constant.
- Precedence cell → **column → row** → table: a row is what a teacher points at, a
  column is the distribution table's axis; the narrower statement wins.

### Columns are fractions, and the preview must lay them out fixed

`columnWidths` stores fractions of content width (undefined = equal), so proportions
survive paper/margin changes. **The preview must be `table-layout: fixed` with a
`colgroup`** — browser auto-layout sizes from content, Word from `w:gridCol`, and the
paginator measures these boxes. `tableGeometry.test.ts` also pins: the **last column
takes the rounding remainder** (grid sums exactly to `CONTENT_WIDTH_TWIPS`); a merged
cell's `w:tcW` is the **sum of spanned columns**. Text wraps and the row grows (no
`overflow-x-auto` — a scrollbar on paper hid overflow from pagination); cells set
`overflow-wrap: break-word`.

Widths drag on the page (`TableColumnResizer`) under the standard gesture rules
(in-flight value local, committed once on pointer-up; delta ÷ preview scale; Escape
abandons). Boundaries are not selectable (nothing to delete/format) — hover-revealed
`data-print-hide` chrome reserving no space. `resizeColumn` moves **only the two
neighbouring columns** (pointer stays on the grabbed edge), floored at
`MIN_COLUMN_FRACTION`. `insertColumn`/`removeColumn` carry widths and per-column padding
with them (index-addressed; dropping the arrays would discard every other set width).

### The table's own box, and row heights

`width` and `indent` (fractions of content width) store the table's box → `w:tblW` +
`w:tblInd`. `columnWidths` are fractions **of the table**, keeping box-resize and
column-resize independent. `resizeTableEdge`: right edge moves width alone; left edge
moves width *and* indent (the right edge stays put, or the drag slides instead of
resizing).

- **A new table starts at the stem's text column**: `DEFAULT_TABLE_INDENT_TWIPS` =
  `QUESTION_LIST_INDENTS[0].left` (derived, not typed). Flush at 0 hung it in the
  question number's gutter; all six indented reference tables carry `w:tblInd`.
- **The width resolves *from* the indent, and that order is load-bearing.** No stored
  width means `1 - indent`, not 1; the pair clamps `min(indent, 1 - width)`. Resolving
  width first at 1 annihilated every untouched table's indent — nothing stored looked
  wrong; only the resolved box dropped it. Guarded twice (box + emitted
  `w:tblInd`/`w:tblW`). An explicit width is honoured as stored.

### Alignment and indent are alternatives, not a pair

`align` (`w:jc`) is genuinely not `indent`: a centred table stays centred when paper or
margins change (reference Q19 centres with `w:jc` and no `w:tblInd`; six siblings do the
opposite). Exclusive **by construction** — two stored answers to "where is the left
edge" is two things to disagree about:

- `setTableAlign` drops `indent` when centring and stores **nothing** for `left`
  (Word's default → untouched tables byte-identical).
- `resolveTableBox` reports `indent: 0` for anything but `left`, so neither backend has
  to know they are alternatives.
- Dragging the **left edge returns `align` to `left`** — placing that edge by hand *is*
  choosing an indent (without it the drag silently did nothing on a centred table).
- The preview expresses alignment as **`auto` margins** (what `w:jc` means); an
  in-flight edge drag renders as `left`, or a centred table jumps on release.

`TableRow.minHeight` is a **floor** (`w:trHeight hRule="atLeast"`) — a dragged height
can never clip later typing; the one place content decides height. Everything meaning
"unchanged" is dropped from the model (full-width table stores no `width`/`indent`,
emits no `w:tblInd`).

### Everything structural is reachable on the page

The page carries three drags (column boundaries, outer edges, row heights) plus
insert/delete for rows and columns — a table is illegible in a 380px panel; the position
a teacher means is one they point at. The panel keeps exact values (as the diagram
panel keeps coordinates). Both routes end at the same pure verbs in `model/table.ts`.
Rules that failed in the browser before holding:

- **Only the pointed-at row and column get controls** (all-at-once = twelve colliding
  chips landing on the heading above).
- **A grip may not be gated on hover** — `pointer-events: none` swallows the
  pointer-down that would begin the drag, and the left-edge grip is approached from
  outside the table. Grips are always live; the fix for accidental grabs was **size**
  (7px on the border), not liveness.
- **Horizontal and vertical grips must not cross** — a full-width row grip won the
  z-order tie and swallowed edge drags. Row grips are inset by a grip's width.
- **The control layer sits flush (`inset-0`)** — controls position from the table's own
  edges. Reaching past the table is a transparent hover pad's job — hover chrome needs
  a hit path: `:hover` follows an element box, so the box must be the bigger one — at
  `-z-10` so clicks reach cells.

### A cell formats like any other text

`tableCell` is in `isFormattable` — per-cell formatting is the only emphasis mechanism a
header-row-less HKDSE table has. Per-run formatting came free from teaching
`textOfTarget` the kind. The cell's own `CellAlign` still wins over `TextFormat.align`.
`model/table.ts` holds the structure verbs as pure functions (two surfaces perform the
same edits). Rules: **ragged rows are real** (colSpan merges leave different cell
counts; `insertColumn` pads short rows first, or it zig-zags); **a covered cell is
neither merge target nor source** (growing its span consumes cells into something
invisible); **one row and one column are the floor**, for the reason
`MIN_ANSWER_LINES` exists (an empty table renders as absence and accumulates).

### Editing a table: structure in the panel, content on the page

The panel used to render a second full grid of text inputs (a 13-row table = 26 fields
in a 380px column) duplicating cells already editable on the page. Word's division
holds: **structure from a panel, content in the document** — insert/delete, align,
merge, padding; it points at the page for typing.

- **Table alignment sits outside the per-cell branch** (needs no subject) and is
  labelled `Table` — it reads like the cell's align control but means an unrelated
  thing.
- Padding is offered in both places (panel types exact values, page drags). **Scope is
  chosen before the numbers** (Cell/Row/Col/All — the same four fields mean four edits);
  no cell selected falls back to the whole table. **Every field shows what is in effect
  and whether it is inherited** (blank boxes read as "no padding"; an override must be
  distinguishable and resettable).
- Each edge holds a **local draft while focused**, committing on blur/Enter — the
  displayed number is derived, so re-reading per keystroke fought the typing ("10" over
  "3" landed on 36).
- The page reports the clicked cell as `activeCell` in the store (the sidebar is a
  sibling). Details: reported on **`onClickCapture`** (the cell's editable text rightly
  stops propagation, which starved the panel of a subject); the active cell takes a
  **ring, not a tint** (invisible inside a selected question's fill; a ring can't shift
  geometry); a stale anchor falls back to whole-table actions (`locateCell`
  undefined); missing per-cell controls are **explained, not greyed out**.
- **Tab walks the table** as in Word. `InlineEditable` takes an `onTab` only tables
  supply. The field commits and closes *before* the next opens (or the outgoing blur
  commits over the incoming field); order comes from the **IR, not the DOM**; covered
  cells are skipped; returning false at the end lets Tab fall through.
- **Inserting a table picks its size first** (`ui/TableSizePicker.tsx`, Word's hover
  grid with live caption; grows toward the pointer to 16×8; opens **downward** —
  upward went through the sidebar tab bar).

### Answer lines are a style, not direct formatting

A ruled line is an empty paragraph with a bottom border. Two print-only facts: **Word
collapses consecutive paragraphs sharing one border set** and draws the rule once —
`AnswerLine` declares both `w:between` and `w:bottom`, ruling N lines at any N (the
regression guard asserts the *border*, since counting `w:p` passed while the page showed
one rule); an empty paragraph is only line-height tall, so the style sets an exact 24pt
(trailing `w:after` falls *outside* the border). A named style because Word flags
directly-formatted paragraphs in the margin, and it stays restylable in one edit.
Deliberately **not** a `NodeStyle` (all three backends must understand every member;
`AnswerLinesNode` carries no `style`).

### A caption prints above or below its block

`captionPlacement` on a table, image or diagram block; `below` is the default and stays
**unstored**, so an untouched document exports byte-identically. Both conventions are real
in the reference material — a table's heading sits above it, a figure's caption below —
and one paper legitimately uses both, so it is per block rather than per document.

- **Resolved once, in the IR**, like `columnWidths` and the table box: three backends each
  deciding what "unstored" means is three chances to disagree about where the words go.
- **A caption above must `keepNext`**, or Word breaks the page between a heading and the
  figure it names — the orphan the placement was chosen to avoid. Below, the *picture*
  keeps with the caption instead; the flag moves with the group.
- A caption remains **optional and absent by default**: no caption means no paragraph and
  no reserved space, and the placement control is not offered until there is one to place.
- The table's trailing spacer paragraph stays after the table whichever side the caption
  takes — Word requires it, and it is not part of the caption group.

### Clipboard (`src/export/clipboard.ts`)

Same IR; writes `text/html` + `text/plain` via `ClipboardItem`. Numbering becomes
literal text (clipboard HTML cannot carry Word numbering). Carries **no page setup,
headers, or cover** — pasting must not impose this document's page furniture on the
destination. The cover exclusion is a decision, not an omission: clipboard HTML cannot
express any of its mechanisms (unequal section columns, the anchored corner group, the
column-rule shape), so it could only paste as bare paragraphs that read as lost
content; the `.docx` is the fidelity path and carries it. A test pins the exclusion.

---

## Diagrams

### Geometry in, one image out (`model/diagram.ts`, `render/diagram.ts`)

A `DiagramBlock` models the DSE vocabulary in **unit space** (0..1, origin bottom-left),
not a free drawing surface — one stored diagram renders crisply at any size and stays
re-labellable.

```
Diagram ──diagramSvg()──┬──► preview: live inline SVG
                        └──► rasterize @3x ──► one PNG ──► .docx w:drawing · clipboard <img>
```

Word gets a raster (SVG support varies; one image = one object a stray click cannot
pull apart). Rasterizing needs a canvas, so it is the one browser-only async part:
`export/diagramImage.ts` is a pre-pass returning `Map<blockId, pngDataUrl>`, keeping
`buildParts`/clipboard synchronous and unit-testable. No map → a diagram emits **no
drawing at all** (a dangling relationship is a Word repair error) — so `exportDocx`
**refuses to export** instead, naming the diagram by its alt text. Emitting nothing is
correct but silent, and a missing figure is indistinguishable from one nobody added;
that ambiguity turned a correct export into a session-long misdiagnosis once already.
`exportDocxBuffer` skips the check and takes its map as an argument, which is what lets
tests and scripts drive the synchronous path.

`collectImages` walks only `rendered.items` while the pre-pass also walks bands, title
and instructions. **Not a bug**: a band renders as `columns` and title/instructions as
`text`, so none can hold a picture — pinned by a test, since two walks that disagree
would otherwise be exactly how a rasterized image goes unembedded.

Renderer rules that only show on a real page:

- **Axis titles lay out outside the plot**: right padding sized from the title's
  estimated width, capped at `MAX_X_TITLE_SHARE`; `axisTitleAnchor` clamps inside the
  canvas but never left of the arrow tip. The clamp lives there (not `diagramSvg`)
  because `DiagramCanvas` builds the drag handle from the same call.
- **Bilingual labels with identical sides print once** ("AD", "E₀" are symbols).
- **Every side is then cut at its own hard breaks** (`richLines`, fed by `pickSides` —
  the one funnel from `BiText` to drawn lines, so all seven text kinds get it). A newline
  is ordinary run text, so a renderer that does not split prints a *space*: the reference
  paper sets a y-axis title as "Nominal / interest rate" and a curve label as "average /
  growth rate". Run-aware, not `runLines` on the flattened string — a diagram label is
  exactly where `vertAlign` must survive a break ("M" + subscript "d1"). The measurements
  follow for free: `titleRoom` counts lines, and `estimateWidth` takes the *widest*, so
  breaking a long axis title correctly **narrows** the reserved margin.
- **A point's label defaults to `right`** — a marked point is nearly always an
  intersection, and up-right is where the other curve runs.

### A diagram's words live inside its own image, and the picture is measured

A `title` is the diagram's **only** label — centred on the plot, underlined, drawn into
the geometry so it rasterizes into the same single PNG. `titlePlacement` (`above` |
`below`, reusing the block-level `CaptionPlacement`; `above` default and unstored) picks
the side. A `DiagramBlock` therefore has **no `caption`**, alone among captionable
blocks, and `DiagramNode` carries none for a backend to print: a caption paragraph is
what let the words break onto their own line and drift away from the figure.

**Edited in the sidebar and nowhere else.** The canvas *draws* the title — it must show
the printed picture — but it is inert there: no hit target, no element-list row, no
inspector, and `applyDrag`/`deleteHandle` both return the diagram unchanged for a
`diagramTitle` handle. Writing belongs in a field; one address for a diagram's words
means no second surface to disagree with. There is deliberately **no `titleOffset`**
(unlike `DiagramAxis`, whose title shares a crowded margin): the box is sized around the
title, so it always has its own room and a nudge would only make two diagrams in one
paper sit differently.

**`diagramSize()` measures the box from what is drawn.** `heightPx` used to be a flat
`width * 3/4`, which made the *canvas* 4:3 and left the plot to absorb everything around
it — adding a title visibly squashed the curves, and an untitled diagram still exported
the strip a title would have used. Now the plot keeps `PLOT_ASPECT` and each side grows
by exactly the room its text needs.

- **Width stays the teacher's number** (it decides how much of the text column the figure
  takes); only the height is derived.
- **The printed size follows the labels.** Renaming an axis or adding a title changes the
  exported picture and the page reflows — the accepted cost of never clipping and never
  padding.
- **Every writer re-measures**: the factory, the panel's width field, the panel's title
  field, and `applyResizeBlock` (a drag must re-measure, not scale the old ratio, or a
  titled diagram carries its extra room forward at every new width).
- `model/edits.ts` and `model/factories.ts` take a **value** import from `render/diagram`.
  Safe because `render/diagram.ts` imports only *types* from `model/`, so the edge stays
  one-way — and a second copy of the measurement is exactly what the shared-projection
  rule exists to prevent.
- `titleRoom()` is shared by the projection (which reserves the space) and
  `diagramTitleAnchor()` (which places the text in it), reserved **on the title's own
  side only**. A title below is measured back from the canvas edge, minus its extra
  lines: measuring forward from the plot overshot the reserved room and printed the
  underline and a bilingual second line outside the picture.

`DIAGRAM_TEMPLATES` ships nine starting shapes (blank, supply-demand, demand-shift,
AD-AS, money market, tariff, import quota, proportional tax, PPC). A template is only an
initial value — plain geometry, fresh ids, never looked up again.

### Drawing (`model/diagramDraw.ts`, `components/editor/DiagramCanvas.tsx`)

**The canvas owns the geometry; the panel owns everything else.** `DiagramEditor` was once
a second complete editor — five tabs, every element re-listed, every coordinate typed as a
percentage — and it failed the way the table panel's grid of text inputs failed: you
cannot see what you are editing, and a diagram is illegible in a 400px column. It now
keeps only what the canvas has no opinion about (Template, Width, Alt text, Caption) plus
the live thumbnail that opens the canvas. A cut like this must lose no capability:
`showOrigin` and a free label's align/italic existed *only* in the deleted tabs and moved
to the canvas, and an axis title deleted to nothing gets a "Name the x-axis" affordance —
empty text draws nothing, so there would otherwise be no way back.

The canvas draws handles in a separate `pointer-events-none` SVG **over** the real one, so
the geometry underneath stays byte-identical to what exports.

- **The projection is shared, not re-derived**: `diagramPlot()` returns the projection
  `diagramSvg()` uses (with inverses `ux`/`uy`); label anchors (`curveLabelAnchor` etc.)
  are exported from the render module and fed to `hitTest`.
- **Gestures replay from geometry captured at pointer-down** — one idempotent
  transform, never accumulating.
- **A near-flat line straightens itself** (`snapToAxis`, ±5°), because a world price or a
  quota must be *exactly* level and freehand cannot hit exact. The angle is judged in
  **screen space, not unit space**: the plot is drawn wider than tall, so the two disagree
  — a line the teacher sees at 4° measures 5.7° stored, and a unit-space test refuses to
  straighten what plainly looks flat. **Shift turns the assist off** (the inverse of its
  old meaning) — auto-straightening covers what Shift was for, so the modifier is worth
  more as the escape hatch for a deliberately shallow slope. Point-snapping wins over it:
  landing on an intersection is the more specific intent, and straightening afterwards
  would drag the end back off the point it caught. An orange guide reports it, or the
  assist is invisible until you let go.
- **Any text is edited where it is drawn** — double-click opens a caret on the words
  (single click still selects, so drag-to-move survives). `handleText`/`setHandleText` are
  the one address for a handle's writing, so the editor cannot open on one field and save
  to another; a `curve` handle deliberately carries no text, which is what lets
  double-clicking a line still add a kink while double-clicking its *name* retypes it.
- **A label's hit target is its drawn box, not its anchor.** An anchor is a *baseline*
  positioned at the start, middle or end of the text depending on how it is anchored — so
  it is not where the words are, and distance-to-anchor left a long caption clickable only
  near one edge. `LabelAnchor.box` carries the browser's own `getBBox()` measurement
  (exact where an estimate is not: CJK widths, superscripts, the font that really loaded).
- **A drag lets go of what it moved**: press arms, ~4px begins, release **deselects** a
  single dragged element (else the next reach moves the previous shape). Multi-element
  selections survive their drag; shift-click toggles membership.
- **Cursors are bucketed in screen space** (`cursorFor`); unit y grows up, screen y
  down — the wrong negation silently swaps the two diagonals.
- Hit-testing prefers **handles over bodies**, topmost among bodies; text competes with
  vertices and both beat bodies (a curve's name is drawn beside its line). Snapping
  catches intersections and existing points, stores nothing; `pointAt()` selects an
  existing point rather than stacking an invisible twin on it.
- **Selection is a set.** Marquee catches only elements **fully** inside (curves span
  the plot — partial overlap would catch everything). Clicking a selected element keeps
  the selection; multi-drags never snap (snapping the anchor teleports the group).
- `⌘C/V/X/D` use a **canvas-local clipboard** (no sensible text/plain form; the system
  clipboard prompts mid-drawing). `pasteInto` re-ids and offsets (repeatable), and
  paste selects what it created — copy → paste → drag builds "S₁ → S₂".
- The stage renders at a **zoom multiple** (default 2×) of stored size; zoom scales
  display only (`toUnit` divides back; handle radii divide too), asserted by comparing
  path data across zoom.

### Every label moves, and stays attached

All seven text kinds drag. Only free `DiagramLabel`s store absolute positions;
everything else stores an **offset from its own anchor** (`labelOffset`, tick `offset`,
`titleOffset`), so re-dragging a curve carries its name. Constraints: a drag
**accumulates the pointer delta onto the offset** (never snapping to the pointer);
**tick labels slide along their own axis only** (one scalar; `ew`/`ns` cursor advertises
it); axis titles nudge inside their reserved room. A point label has two systems: the
eight compass slots (`labelSide`, what templates ship) and a free-drag `labelOffset`
that **supersedes** them; picking a side clears the offset, `ResetLabelPosition` does
the same elsewhere. Deleting anchored text deletes the **text**, never its anchor;
copying takes the whole anchor.

---

## Pagination and pages

### A page is derived, and owns the break that made it

No `Page` in the model — a page is whatever the paginator measured onto one sheet, so
page actions must be expressed in ids. Measuring lives in the component; the *deciding*
half is pure in `components/preview/pagination.ts` (testable without a DOM).

- **A manual break belongs to the page it opened.** It consumes no space but *leads*
  that page's `flowIds` (in flow position) — leaving it out made moving a page collapse
  it, deleting one leave a stray blank page, and an empty page unaddressable. Only the
  delete dialog's item count subtracts it.
- **A trailing empty page survives only if a break opened it.** Incidental slack is
  dropped (Word emits no sheet for it); a deliberate page renders `BlankPage` — says it
  is empty on purpose, accepts drops (landing *after* the break), offers add buttons.
- **Consecutive breaks each open their own page** — reusing an already-empty page
  collapses a deliberate blank and leaves the second break's sheet unnamed and
  unmovable.

`movePage` is one `moveRunInFlow` — a page is just a run of ids.

### A drop target receives the run, not the grabbed id

Dragging a member of a multi-selection carries the whole selection; that rule lives in
the *drag*, and a target cannot re-derive it — so `onDragItemChange` publishes
`string[]`, resolved once at the source (the grabbed id alone let the rail move one item
out of a swept five). All drops route through `movePage`: one commit, one undo entry.
`dropRunAnchor()` lands a run after the target page's last non-moving member (a rail
card has no meaningful "between"); it returns nothing when the run already is the tail,
so an accidental release costs no undo entry.

**The first sheet is the destination no anchor can name** — nothing precedes it, so it
never carries a break, and emptied of content it reads `structuralOnly` with no
`breakId`. Receiving is therefore weaker than acting (`canReceive`);
`moveToDocumentStart` orders the run before the first non-moving item, needing no id.

### The outline groups by page (`editor/Outline.tsx`)

`groupByPage()` cuts the resolved flow into the paginator's sheets and promotes each
break to the **tab heading** of the run it opened (its menu deletes the page). Because a
page is measured, not modelled: **a group is a result, not a promise** (nothing pins
one; they re-cut per measurement), and **a section can begin mid-sheet** — groups are
the top level, a section heading is a row inside one (nesting drew a shared sheet
twice). Tabs open by default (a new grouping must not start by hiding its contents);
unplaced items fall into a trailing unnumbered group; an added-but-empty page is
inserted at its break's position; dropping on a tab lands at the **head** of that page —
the one position rows cannot express.

---

## Page setup, headers and footers (`src/model/page.ts`)

Paper, orientation, margins stored in **twips**: the exporter writes them straight into
`w:pgSz`/`w:pgMar`; the preview converts the same numbers to mm. `MARGIN_PRESETS`
labels are asserted against stored values. **Custom…** shows per-edge cm fields clamped
0–5, committing on blur/Enter with a local draft while focused (re-deriving text from
twips deletes the decimal as it is typed).

Headers and footers are **lists of `Band` rows** (same model as the masthead — a real
school header stacks five). One model = one editing surface (`BandEditor` serves all
three), one drag interaction, one exporter path.

### A header lives in the margin, not in the text column

Word grows a header **downward from `w:header`**; body text moves only past `w:top`.
Room = `top - header`. `headerFooterOffsets()` derives the offset from the bands — but
**only when they do not already fit** under Word's 1.27 cm default, then only as far as
needed, clamped at `MIN_EDGE_TWIPS` (0.5 cm printer dead zone). Unconditional
`margin - height` flattens a one-row header against the paper edge.

- **Offsets are sized from the running rows**, not the taller list: one `w:header`
  serves the section, and letting a five-row page-1 cover dictate would squash every
  other sheet. The cover takes its overflow as extra padding **on page 1 only**
  (`pageStyleFor`) — preview padding is per-sheet.
- **Word gets an estimate; the preview measures.** `bandsHeight()` estimates (~264tw per
  11pt row, scaled by field font size) — correct for Word, which lays rows out itself.
  The preview measures real boxes via `ResizeObserver` (`measuredFirst` for page 1),
  falling back to the estimate only before first layout.
- **Overflow moves the text column, not merely its budget**: header overflow moves the
  top down, footer overflow the bottom up — separately (subtracting a total shortened
  the column without moving its top, printing headers over question 1). Page 1's
  overflow is computed against `edgeOffsets` (the offset it is drawn at), not re-derived
  from its own height, which comes out *smaller* for a taller cover.
- Rows taller than the whole margin are genuinely unsolvable — reported
  (`BandOverflowNotice`), not fixed; the symptom (content missing from the *bottom*)
  gives no clue a header caused it.

Each row exports as **one paragraph with tab stops**, centre/right stops derived from
live content width. A rule draws only on the edge-most row (frames the block).

### Page 1 can differ

| State | Stored as | Page 1 prints |
|-------|-----------|---------------|
| Same on every page | neither field | `bands` |
| Blank on page 1 | `showOnFirstPage: false` | nothing |
| Its own rows | `firstPage: { bands }` | `firstPage.bands` |

Word models this as `w:titlePg` + a `w:type="first"` part.
`firstPageHeaderFooter()` resolves the three states in one place, shared by exporter
and preview. Consequences: `w:titlePg` switches page 1 *wholesale*, so once either edge
differs **both** need a first-page part (or the unchanged edge vanishes from page 1);
a part is emitted when *either* the running rows or page 1's would print (a cover-only
header has empty running bands).

**A write aimed at page 1 creates the separation**: `addHeaderFooterBand`/
`setHeaderFooterBands` with `scope: 'firstPage'` create `firstPage` on first write (and
set `showOnFirstPage: true`) — requiring it to exist first meant the surface a teacher
looked at was silently not the one they edited. The panel renders **two labelled
surfaces — "Page 1" first, then "Pages 2 onward"** (one `BandSurface` component used
twice), because a cover is decided first and the running line is the afterthought; the
link survives as two quiet actions ("Same as page 1" / "Give page 1 its own header"),
not a mode.

### Editing bands on the page

**Header text is edited on the page**; the panel keeps only what has no visual
representation there (show/hide, rule, page-1 state) plus **presets** (a teacher who
never built a header doesn't know the shape). Page-1 rows are edited on sheet 1 by the
same `BandEditor`.

- **A page number is one field with a pattern** (`plain`, `pDot` → "P.5", `longForm` →
  "Page 5 of 12"). The pattern lives in `pageNumberPlaceholder`, shared: the preview
  substitutes a chip via `withPageNumber`; the exporter splits on the same placeholders
  so only numbers become `PAGE`/`NUMPAGES`. `bandFieldText` returns the *placeholder*
  (the model has no page to report; baking one in freezes exported footers). Fill-in
  rules ("Name:______") export as real ruled runs.
- `patchHeaderFooterBand` searches both band lists (a click reports only a field id);
  the lists never share ids (`setFirstPageMode` re-ids on copy) or one keystroke would
  edit both.
- **A structural edit must name its list (`BandScope`)**: a row being created has no id
  yet, so `addHeaderFooterBand`/`setHeaderFooterBands` take `'running' | 'firstPage'`,
  resolved from the sheet the click landed on. Without it "+ Row" and presets wrote to
  `bands` unconditionally. Deletion needs no scope (carries an id; filters both).
- `BandEditor` offers hover-revealed `+ Row`, per-row `✕`, and a label naming the
  surface (`PAGE 1 HEADER`, `Header · pages 2+`, `Title block`) — three look-alike band
  lists can print on one sheet. All `data-print-hide`, positioned outside the flow.
- **An empty band list still renders while editing** (`bandsShouldRender(bands,
  editable)`, testable without a DOM) — returning early on empty leaves nowhere to put
  the first row back. Keys on *whether editing is possible*, not current focus (hence
  separate `editing`/`editable` props).
- **A hover-revealed control must be reachable**: the `✕` sits outside the row's box and
  `:hover` follows the element box — it is wrapped in a `pointer-events-none` strip
  spanning back to the row, revealed with `opacity`, never `display` (a zero-size box
  cannot be hovered).

### One sheet, three regions to edit

Body, header and footer are separate documents to edit (Word's rule). Inactive regions:
`opacity: 0.42`, slight blur, `pointer-events: none`. **Double-click** enters a dimmed
header/footer; **single click** on the dimmed body returns (leaving is the commoner
move, and with the body inert there is no other one-click way back). Not decoration: it
keeps a click meant for question 1 out of the header above it, and the header's chrome
off every hover across the page top.

- **The wake overlay needs a region with a height**: band boxes are placed by
  `top`/`left`/`right`, so `inset: 0` resolves to zero height. `.paper-region { height:
  fit-content }`; `.paper-region-body` opts out (a `flex: 1` child must fill).
- **Not a grid** — one-cell grid stacks the body's children into an overprinted line.
- **Chrome must not be measured**: the paginator reads `[data-band-rows]`, the one
  printed child, not the overlay.

Print CSS neutralizes dimming and hides the overlay.

### Print preview is the print rules, run on screen

**Edit | Preview** (`store.printPreview`) shows the sheets exactly as they print. A
`Segmented` beside Language and Version (two equal permanent states; a button would
label the state you are *not* in). "Exactly" is structural: the strip-down rules are
written once, shared by `@media print` and `body.print-preview` — new chrome needs
`data-print-hide` exactly once and is correct in both. CSS alone cannot deliver two
things:

- **Gestures are disabled in JavaScript**: the marquee tracks on `window`, so
  `pointer-events: none` on sheets left drag-select working over an inert page.
  `Preview` returns early from the sweep and the bulk-shortcut handler ("is anything
  selected" can't gate ⌘A — ⌘A *creates* the selection; it swallows ⌘A or the browser
  selects the whole app).
- **`#print-root` keeps its own pointer events** while descendants lose theirs, or a
  double-click passes through the transparent sheet into the sidebar.

`printPreview` lives beside `mode`, deliberately **not inside** it — `OutputMode` is
what the exporter reads; a view toggle reaching `.docx` generation is a bug waiting.
Entering clears the question selection (as `handlePdf` does); `HintPill` hides (it
teaches an interaction the mode removed).

### Both band paths must agree

`BandEditor` (active) and `ReadOnlyBandRow` (idle + print/PDF) draw the same rows; any
disagreement is a preview that lies. **Formatting is one shared function**
(`bandFieldStyle` — `ReadOnlyBandRow` once ignored `field.format`, so a 14pt school
name printed 12pt: an idle-state bug presenting as region focus). **Geometry must be
identical**: chrome reserves no space (drop-zone outlines use `ring`; spacing belongs to
`HeaderFooterBand`, applied in both paths). Verify by measuring the *same text node* in
both states — the active state inserts a label chip that shifts any span-list
comparison.

---

## Question-type registry (`src/registry/`)

`QuestionTypeDefinition`: `id` · `displayName` (bilingual) · `create()` ·
`render(question, context) → RenderNode[]` (feeds all three backends) · `EditorPanel` ·
`countMissingTranslations?`. Registered: `mcq`, `structured`. A new type needs only a
definition — no changes to numbering, marks, persistence or export.

- **The hand-built numbered paragraph must copy the block's `format` itself.**
  `renderContentBlocks` passes it for free; the four hand-assembled sites (MCQ stem;
  structured stem, part, sub-part) each omitted it once — silently and asymmetrically
  (first paragraph ignored alignment/size/colour; and only the preview applies
  alignment as CSS, so a right-aligned stem previewed right and exported with no
  `w:jc`). `registry.test.ts` sets a format on each type's first block and asserts it
  reaches the IR.
- **No shared module may branch on a concrete type.** `registry.test.ts` greps eight
  modules (`model/numbering`, `render/worksheet`, `export/docx/{index,body,numbering}`,
  `export/clipboard`, `model/migrations`, `storage/index`) for `'mcq'`/`'structured'`.

---

## The start screen (`src/components/start/`)

The app opens on a list of documents, not on a document. Storage has held many
worksheets since it shipped, but the only reachable one was the most recently saved —
the editor restored that one on mount and offered no list — so every other document was
effectively lost the moment a second was started, and "New worksheet" was in practice an
archive button. `StartScreen` is the list plus the way in; `NewWorksheetForm` asks the
once-per-document decisions before the first question exists.

- **The gate lives in `EditorHost`, outside the editor**, and is session state (`chosen`)
  rather than a stored preference: it answers "has a document been picked in this tab",
  which resets on reload, so the app always opens at the list. An overlay *inside* the
  editor would mount the whole preview behind it and run the paginator over a blank
  worksheet on every visit to the file list.
- **Leaving the editor must flush the autosave.** The 1.2s debounce lives in an effect
  inside `EditorApp`, so unmounting it cancels a pending save — up to a second of typing
  dropped by the act of going to look at the file list, and a stale "updated" time on the
  very document just edited. Both departure paths save **by value**: `store.save()` reads
  `getState().worksheet`, which `replaceWorksheet` has already swapped by the time the
  awaited write runs, so the outgoing document would be skipped and the incoming one
  written twice.
- **A new document is saved before it is edited.** `replaceWorksheet` marks the store
  clean — correctly, nothing has changed yet — and autosave only fires on `dirty`, so a
  worksheet created and then left alone was never written anywhere: answer the form, go
  back to the list, and it is gone. Found in a browser, not in a test; the model layer
  was right and the lifecycle was not.
- **`createWorksheetFrom` layers over `createWorksheet()`** rather than assembling a
  document: that factory is the one definition of what a new document *is*, and a second
  full constructor beside it is a second thing to update whenever the model grows a
  field. A test pins the two to the same shape, so "skip every question" and "New
  worksheet" cannot drift.
- **Turning sections off rewrites `flow` and `layout` together.** The flow names elements
  by id, so dropping the layout entries alone leaves the flow pointing at elements that
  no longer exist (§ the flow invariant).
- **The wizard is a form, not steps**, and every field has a working default — it is a
  way to answer sooner, never a gate. The cover cards preselect a style and nothing else;
  all three open the same form.
- **The row opens the document; the menu holds the filing actions** (rename, duplicate,
  download, delete). Burying "open" among four rarer siblings would make resuming work
  the slowest thing on the screen. Duplicating **saves without opening** — the teacher is
  looking at a list and making a copy for later.
- **A summary can outlive the document it names** (a half-finished `clear`, storage
  evicted under quota): opening one says so and drops the row, rather than leaving a
  button that silently does nothing.

## Editor layout (`src/components/`)

The preview is the centrepiece; the right sidebar shows **one thing at a time** behind
two tabs; two left rails: insert (AddRail) and navigation (PageRail, multi-sheet only).

### One panel, one job

**Content** is the outline; **Edit** is the selection; each gets the full column height.
The tab **follows the selection** — selecting a question *is* the request to edit it.
(This replaced four stacked regions whose draggable divider only refereed a fight
between panels that shouldn't share the space.)

### Settings live in a dialog

Title, instructions, fonts, paper, margins, header, footer, title block are decided
about once per document → `DocumentSettings`, a tabbed dialog from the toolbar's
**Setup** and the outline's **Settings** (both places users look). It claims the
keyboard via `useModalLayer()`. Split rule: header *text* is typed on the page; whether
the header *exists* has no visual representation there.

- **Tabs group by where a thing prints, not which field stores it** — the `furniture`
  tab reads down the page: title, header, footer. (Title block was its own tab while
  printing on page 1 and replacing the title from another tab.)
- **A choice between two layouts is shown, not named**: `BandPreview` draws actual zones
  at actual weights; deliberately not `BandEditor` (a picture must not become a second
  editing surface).
- **Deriving the same number twice is reported** (`duplicateComputedFields()`): the
  "Exam paper" preset and `assessmentTitleBlock` both carry `totalMarks` — reported,
  not prevented, since which copy is unwanted depends on the paper.

`GroupHeader` (not `Eyebrow`) names regions a user works in — five 10px-uppercase
headings scan as one grey column.

### Where a new item lands: the insertion anchor

`insertAnchorId` in the store is **a position, not a selection**: the flow id a new item
lands behind (undefined = append). `addQuestion`/`addLayoutElement` default to it; an
explicit `afterId` wins (drop targets need that). It exists because the add rail could
see only `selectedQuestionId`, while two of the page's three selections are
preview-local — selecting a heading sent new items silently to document end.

- **The anchor advances onto what was just added** — else three inserts enter
  backwards.
- **A dead anchor is cleared, not left dangling**: `livingAnchor()` runs in `commit` —
  the single write path — so undo/redo and future removals are covered without knowing
  they exist.
- **The flyout states its destination** (`flowItemLabel()`: derived question number —
  an array index disagrees once a section restarts — or the element's own text;
  "after section" is ambiguous on every real paper).
- **Hovering previews the position; it does not take it** — moving the anchor on
  `mouseenter` made the destination depend on where the mouse came to rest.

The gap affordance is chrome in the item's trailing edge, absolutely positioned so it
**reserves no space** (the page must break where Word breaks). It draws the drop
indicator's own dot–line–dot in the same violet — a drag and an insert put an item in
the identical position, so two visual languages would invent a distinction the document
lacks. The `+` sits centred on the line (the margin is the drag grip's column; a gap
button there overlaps both grips). `data-print-hide`; absent in print preview.

### Direct manipulation on the page

```
click once                 → select · Delete works · format toolbar appears
click again / double-click → edit in place · Enter commits · Esc cancels
hover in a gap             → insert caret + "+" → adds there
hover                      → margin drag grip → reorder
```

- **The format toolbar docks along the top of the page column**, `fixed` in viewport
  coordinates (inside the preview's `scale()` it would shrink with zoom), `left`/`width`
  from the sheet, `top` from the scroll container; the scroller reserves the band
  (`pt-14`). Controls report current state; toggling an active one clears back to the
  named style.
- **Dragging grabs a margin grip, not the text** (already a click target). The drop
  indicator marks the hovered edge by pointer half; layout elements drag in the same
  list as questions. Dragging a multi-selection member carries the whole selection —
  the *drag's* rule; every target must honour it (§a drop target receives the run).
- **Pictures resize where they are** (`ResizableBlock`): width is the only output
  (height follows aspect via `applyResizeBlock` — hence corner handles, not edges);
  delta ÷ preview scale; in-flight size local, committed once; clamped to the text
  column (wider is clipped on screen and rescaled by Word).
- **A table is sized and reshaped entirely on the page** — same three gesture rules;
  no selection step (§everything structural is reachable on the page).
- **A picture's click target stays mounted while selected** (unmounting let the next
  click fall through and clear `selectedBlockId`, so Delete appeared dead); while
  selected it insets 6px clear of the corner handles.
- **Double-clicking a diagram opens the drawing canvas.** The preview reports only the
  double-click; `EditorApp` hosts the canvas (the sidebar's `DiagramEditor` only exists
  while its question is open; the preview stays read-only-capable). Edits commit via
  `replaceBlock` by id.
- **Clicking blank paper clears every page selection.** "Blank" is decided by what the
  click *landed on* (`isBlankAreaClick` walks up), shared with the marquee sweep.
  **The exemption list must name attributes something renders**: it once named
  `data-band-field` (never rendered) while fields carry `data-field-id` — every click
  in an active header counted as blank and deactivated it (clearing includes returning
  focus to the body). `blankClick.test.ts` greps the components for each exempted
  attribute.
- **Arrow keys nudge a diagram selection** through the same `dragHandles` a drag uses;
  the step is deliberately not zoom-scaled (a nudge is a fixed geometry edit).
- **No layout shift while editing**: the in-place editor is a plain **`inline`** field
  inheriting font/size/leading. `inline` specifically — an `inline-block` establishes
  its own context and cannot inherit the paragraph's hanging indent, so entering a
  numbered stem shifted every line ~29px. The field must not reset `text-indent` (the
  paragraph's negative indent applies to the marker's line).
- **One language at a time** — bilingual halves are separate editable spans.
- **Two-step engagement makes keyboard delete safe**: Delete acts on a deliberate
  selection, ignored while focus is in a field; `⌘Z` scoped the same way.
- **Only one layer owns the keyboard** (`ui/modalLayer.ts`). Every keydown listener is
  on `window`, so `stopPropagation` cannot separate them — all fire (Delete in the
  canvas once also deleted the whole block). Overlays call `useModalLayer()`;
  page-level handlers ask `isModalLayerOpen()`. A module-level **counter** (synchronous
  inside the event; two stacked overlays release on the last close). Both failure
  directions are silent → unit-tested.
- **Delete picks the right unit per target** (`describeDelete`, `model/edits.ts`): a
  stem paragraph removes the block; a statement leaves the list (rest renumber); a
  table cell is emptied (removal breaks the grid); an MCQ option cannot be deleted
  (count fixed at four).
- **Everything routes through `commit()`** — undo/redo and autosave with no special
  handling.

**The page rail shows real pages** (`editor/PageThumb.tsx`): each card is a scaled
**clone of the rendered sheet** from `#print-root` (no third render pass), inert
(`cloneNode`, `aria-hidden`) so the card keeps click/drag/delete. Editing chrome is
stripped; selection is found by `aria-current` (classes are literal hex per the token
rule). Refresh ~200ms after the DOM settles via `MutationObserver` — not keyed on
composition, since a retyped title rewrites a sheet without moving pages. 152px wide,
sized by what a thumbnail must show (at 104px a band's zones read as one clump).

### Layout rules

- **Weight matches consequence**: one `Button`/`IconButton`; `primary` reserved for
  Export, `danger` destructive, `subtle` recedes until hovered.
- **Row actions are progressive**: width goes to the stem excerpt;
  duplicate/copy/move/delete behind `⋯`. Glyph-only buttons take a required `label`
  (tooltip + accessible name).
- **Selection is bidirectional**: either pane selects, the other scrolls into view; the
  preview suppresses its own scroll when the click originated there.
- **Depth is carried by rule and label, not more boxes**: parts use a left rule and a
  marks pill.

---

## The per-keystroke render path

Typing commits per input, so the pipeline — `renderWorksheet`, the sheets *and* the
pagination probe (same blocks rendered again to measure) — used to run twice per
keystroke over the whole document, and once per pointer frame during a sweep. The pure
walk is not the cost (≈0.5 ms at 70 questions); reconciling two full React trees is.
Four rules bound it:

- **`renderWorksheet` caches per question, keyed on the question object** (`WeakMap`).
  Commits replace only the touched object (`mapQuestion`), so identity *is*
  "unchanged" — no invalidation, no leak. A hit also requires mode, derived number,
  list stream and leading-gap flag to match, so a dragged section still renumbers
  everything behind it (`renderCache.test.ts`). Identity only, never content: a cold
  cache is byte-identical. Contract: questions are immutable — in-place mutation would
  show stale nodes.
- **`ItemBody` is the memo boundary** (`Preview.tsx`): skipped when its nodes array,
  selection, language and `ctxStamp` are unchanged. The comparator ignores
  `ctx`/handler identity, safe under two contracts: everything ctx closures **read at
  render time** is flattened into `ctxStamp` (selection, active cell, scale, content
  width — a missing value is a silent staleness bug), and host handlers close over
  stable things (`EditorApp` binds `useCallback` over store actions, reads fresh state
  via `getState()`). Event handlers held across skipped renders are safe by
  construction.
- **Per-frame chrome is imperative, not state**: the marquee rectangle is an
  always-mounted hidden div the sweep positions directly; the catch-sets bail to the
  previous `Set` when membership is unchanged; the toolbar dock rect lives in
  `ToolbarDock`, its own component, so scroll/resize re-measures don't re-render the
  page.
- **Pagination re-measures on content and geometry, not selection or drag** —
  selection chrome reserves no space (its own invariant), and the probe's
  `ResizeObserver` catches anything that genuinely changes size.

---

## State, persistence and text

### Store (`src/store/worksheetStore.ts`)

Zustand, 100-entry undo. Every mutation goes through `commit(recipe)`: apply, push
`past`, clear `future`. Loading resets history. Undo/redo are plain stack moves —
numbering and marks are derived. **Drag gestures commit once**: in-flight values stay
local; the store is called on pointer-up, or one drag floods the undo stack.

### Persistence (`src/storage/index.ts`, `src/model/migrations.ts`)

- `WorksheetStore` interface (`list`/`load`/`save`/`rename`/`remove`/`clear`);
  localStorage implementation today.
- **Autosave** debounced 1.2s. **File download/upload** as `.worksheet.json`, images
  base64.
- **The index is what the file list reads**, never the documents: a `WorksheetSummary`
  carries `questionCount`/`hasCover` so the start screen shows every saved worksheet
  without parsing and migrating each one on the app's first paint. Both are optional —
  an index written by an earlier build has neither, and a list that refused to show
  those rows would look like the work had been lost.
- **A rename writes `worksheet.title`**, the document's own name — which the masthead
  prints and the `.docx` downloads as — rather than a label kept beside it in the index.
  A separate display name is a second answer to "what is this called", and the two part
  company the moment the title is edited on the page. So `rename` loads and re-saves;
  patching the index alone would be undone by the next autosave (§`summarize`).
- **A worksheet copy re-ids the document and nothing inside it.** Every id *within* a
  worksheet addresses something in that one document, so they stay unique after the
  copy — the opposite of duplicating a question, where the clone lands in the same id
  space as its original and `withFreshIds` must walk it.
- **Migration chain** `migrate()`: ordered pure functions, currently **empty**. The model
  changed seven times before the app shipped, but a migration exists to carry *real* data
  across a change and no document had ever been saved by a released build — so the seven
  steps upgraded documents that do not exist, and the version was reset to 1 rather than
  carrying them forever. The machinery around them is kept and still runs on every load:
  validation, `__unknown` stashing, and `normalize`'s defaulting. Adding a real migration
  means appending to `MIGRATIONS` and bumping the constant; the loop needs no edit.
- **Forward compatibility**: unknown top-level fields preserved in `__unknown`.
- **`KNOWN_KEYS` must list every top-level field.** An unlisted key is treated as from
  a newer build: stripped into `__unknown`, persisted but never reaching the model —
  presenting as a control that "works" then vanishes on reload (`titleFormat`,
  `instructionsFormat`, `bands` were each missing once). A test fails when a populated
  worksheet carries a key the set lacks.

### Bilingual text (`src/model/text.ts`)

- Every user-visible string is `BiText { en, zh }` of `InlineRun[]`.
- Storage markers: `**bold**`, `*italic*`, `__underline__`, `^{sup}`, `_{sub}`.
- Bilingual mode: both languages share **one paragraph**, separated by soft `w:br` /
  `<br>` — one list number per bilingual unit.
- **Newline is run text**: Shift+Enter is a plain `\n` inside run text (no new run
  kind; no migration).
  `runLines()` splits at the one point it must become markup — a raw newline renders as
  a **space** in `<w:t>` and HTML alike. A break is deliberately not a paragraph.
- Per-script fonts: every run carries `w:rFonts` with `w:ascii`/`w:hAnsi` +
  `w:eastAsia`.

---

## Deployment

```
Vercel (or any static host): Next.js build → fully prerendered. No API routes, DB, or server runtime.
Browser: .docx via JSZip client-side · localStorage autosave · file up/download · PDF via window.print()
```

Nothing in `src/` reads `process.env` or the filesystem at runtime — client-side export
is a design constraint. New on-page chrome needs `data-print-hide`, or it appears in
the PDF.
