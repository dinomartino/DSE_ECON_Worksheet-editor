# System Architecture — Bilingual HKDSE Economics Worksheet Generator

Data flow, render pipeline, numbering, diagrams, pagination, header/footer geometry.
Setup and first tour: [`README.md`](./README.md).

**For the short map — areas, key files, invariants — read
[`docs/CODEMAP.md`](./docs/CODEMAP.md) and open a section here only for the *why*.**

**Read this before structural changes.** It records the rules a change must keep.
Where this document and the code disagree, the code is right — fix the document in the
same PR.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router), fully static export |
| UI | React 19, Tailwind CSS 4 |
| State | Zustand 5, undo/redo, 100-entry history |
| Language | TypeScript strict |
| Export | Raw OOXML via JSZip (hand-built, no `docx` library) |
| Test | Vitest |
| Runtime | Browser-only: client-side `.docx`, no API routes |

## Project structure

```
src/
├── app/          Next.js shell; EditorHost gates start screen vs editor (ssr:false)
├── model/        types · numbering · marks · migrations · text · page · flow ·
│                 bands · bandSegments · pageFurniture · edits · factories ·
│                 newWorksheet · table · tableTemplates · diagram ·
│                 diagramTemplates · diagramDraw · cover · coverTypes
├── registry/     Question-type extension point: types · index · mcq · structured
├── render/       ir (RenderNode + EditTarget) · worksheet (the walker) · diagram (SVG)
├── export/       docx/ · diagramImage (PNG pre-pass) · imageImport · clipboard
├── store/        worksheetStore — Zustand with undo/redo
├── storage/      WorksheetStore interface + localStorage implementation
├── components/   EditorApp · start/ · preview/ (the paper IS the editor) · editor/ · ui/
└── test/         shared fixtures
```

Tests sit beside what they test. `scripts/` holds the screenshot harness, the
sample-`.docx` emitter, and the cover/LQ verify harnesses.

> **Not in the repository:** the HKDSE past-paper scans and school assessment PDF used
> as reference are copyright and gitignored. "The reference paper" cites them.

---

## The central principle: one IR, three backends

A question type's `render()` emits neutral IR (`src/render/ir.ts`) once; preview,
`.docx` and clipboard all consume it, so they cannot disagree about numbering, ordering
or teacher-only filtering.

```
Question ──registry.render()──► RenderNode[] ──┬──► Preview.tsx      (React DOM)
                                               ├──► docx/index.ts    (raw OOXML)
                                               └──► clipboard.ts     (text/html)
```

Editor layout: AddRail | PageRail | Preview (scales-to-fit A4 sheets) | sidebar
([Content][Edit]).

---

## Document model (`src/model/types.ts`)

```
Worksheet
├── schemaVersion              CURRENT_SCHEMA_VERSION = 1
├── id · name?                 what it is *called*; `title` is what it *prints*
├── title · titleFormat? · instructions? · instructionsFormat?
├── fonts: FontPair            { latin, eastAsia }
├── baseFontSize?: number      body size in points; absent = 11, a QAB seeds 10
├── pageSetup?: PageSetup      paper · orientation · margins, all twips
├── bands?: Band[]             masthead / title block
├── cover?: CoverPage          a page of regions; never seen by the paginator
├── pageFurniture?             frame + margin notes, one running header of shapes
├── header? / footer?: HeaderFooter
├── questions: Question[]      every question, in printed order (McqQuestion | StructuredQuestion)
├── layout: LayoutElement[]    section · heading · text · spacer · divider · pageBreak ·
│                              answerLines · answerSpace · partHeader · labelList · questionCount
├── flow: FlowItem[]           display order of questions + layout, interleaved
├── createdAt · updatedAt
└── __unknown?                 fields from a newer build, preserved verbatim

ContentBlock = ParagraphBlock | TableBlock | ImageBlock | DiagramBlock
             | FigureRowBlock | SourceBlock
BiText { en: RichText, zh: RichText }        RichText = InlineRun[]
```

**Numbering and marks are never stored.** `computeNumbering()` and the marks helpers
derive them at render time, which is what makes reordering and undo/redo trivial.

### Marks

- `QuestionSubPart.marks` is optional; **absent prints nothing, `0` prints "(0 marks)"**
  — real papers mark a *group* of sub-parts with one label.
- `partMarks` falls back to the part's own marks when no sub-part is marked; any marked
  sub-part flips the rule back to summing.
- A shared label prints on the **last** sub-part of the group. The panel shows `shared`
  pills and a "Marks for (i)–(ii) together" field on the part.

### Document flow (`src/model/flow.ts`)

> **`questions` owns question order. `flow` contributes only the position of layout
> elements relative to the questions.**

- A missing or stale flow costs an element its *position*, never its existence
  (unlisted ids append).
- **An insert is a move and must write both lists.** `applyOrder()` is the one rule for
  splitting an ordered flow back into the two lists; `insertIntoFlow` goes through it.

### A section is a marker, not a container

One flow for the whole document; a `section` is a layout element carrying
`restartNumbering`, and the questions it names simply follow it. Derivations key on the
section element's **id**, not an index: `computeNumbering` resets the counter;
`renderWorksheet` opens stream `question:<elementId>` so the restart is native `w:num`.
A section heading and a free heading render identically (same style, `keepNext`); they
differ only in meaning to numbering.

### A stimulus is shared by the questions that follow it

Two MCQs over one pie chart ("Study the following diagram and answer Questions 8 and
9.") is the `stimulus` layout element: a lead-in of **authored `prefix`/`suffix`
around a derived question range** (the `questionCount` decomposition) plus a full
`ContentBlock[]`.

- **The range is derived, never stored**: the walker reads the next `span` questions'
  numbers (default 2) from the numbering plan, so inserting or reordering questions
  renumbers the sentence. The look-ahead stops at the next stimulus, whose questions
  are its own. No following questions prints "the questions below", not a dash.
- **Block edits reach layout-owned blocks.** `documentBlockLists`/`mapAllBlocks`
  (`model/edits.ts`) walk questions *and* block-bearing layout elements — read and
  write must reach the same lists or a block is findable but unwritable. Page
  editing, table grids, resize, diagram double-click and Delete all work unchanged.
- **On Paper 1 it opens a question group**: the wide question boundary above
  (`stimulusGapLines`, same override chain), the lead-in gap (2 lines) to the
  question below, and the `keepQuestionWhole` chain through its nodes.
- **An unanchored stimulus lands ahead of the closing lines** — `appendIndexFor`
  treats it as question content (the anchor advances onto it, so the questions added
  next would otherwise follow it past "END OF PAPER").
- **Selection is mirrored, not lifted**: the preview's local layout selection is
  reported to `store.selectedElementId` (`onLayoutSelectionChange`); the store's only
  write back is clearing (the panel's ✕). The sidebar panels a stimulus
  (`StimulusEditorPanel`: wording, span, the stem's own `BlockEditor`); other layout
  kinds keep having nothing to inspect.

### Bands and zones (`src/model/bands.ts`)

Placement is **slot-based, never free**: a `Band` is one printed row with three drop
zones (left/centre/right), one Word paragraph with tab stops. Zone positions are fixed
thirds (0, 0.5, 1). `totalMarks` and the `partHeader` suffix print **computed** numbers
— a stored total goes stale.

### A field is authored wording around a derived value

Every `BandField` is **authored text · derived value · authored text**;
`bandFieldSegments()` (`model/bandSegments.ts`) is the one decomposition. The number
stays derived; only the wording is `prefix`/`suffix` rich text.

- `bandFieldText` composes segments, never respells them.
- The `.docx` walks segments too: only a genuine placeholder becomes a native
  `PAGE`/`NUMPAGES` field.
- A `bandField` edit target names a `side` (omitted = `prefix`).
- Segments ride as `parts` in **one** cell (a cell is a tab stop; splitting scatters
  the field).
- Both band paths set `whitespace-pre-wrap`, or HTML collapses boundary spaces the
  `.docx` (`xml:space="preserve"`) prints.
- An empty side renders a `+` affordance with `data-print-hide` (not
  `data-empty-placeholder`, which reserves a box).
- v5→v6 inlines its default wordings (importing `DEFAULT_FIELD_WORDING` would create an
  import cycle); a test asserts the spellings agree.

### A cover is a page of regions (`src/model/cover.ts`)

A mock-exam cover is **two unequal columns** (identity/instructions left, candidate
panel right, a rule between) — a shape no stack of full-width bands can make, so
`CoverPage` models named regions of a page holding `CoverLine[]`. Still slot-based.

- **Paper 1 (MCQ) has no panel** → one full-width column, instructions numbered `1.`;
  Paper 2 carries the panel and the two-column split, numbering `(1)`. Both centre
  their head lines within their own column. `coverHasPanel()` is the single switch both
  backends read; `instructionMarker` is stored (house style).
- **`worksheet.cover` is its own field** — the paginator never sees it; a cover neither
  flows nor shares a sheet with question 1.
- **`CoverRenderNode` is deliberately not a `RenderNode`** — its regions *are*
  `RenderNode[]`, so backends reuse the paragraph/columns emitters; only the frame is new.
- **The `.docx` is a real two-column section**: `w:br w:type="column"` moves to the
  right column; a **`nextPage`** `sectPr` ends the cover. **The section break IS the
  page break — emitting both leaves a blank sheet.** `cover-verify.mjs` counts sheets.
- **The cover's `sectPr` must restate `w:pgSz`/`w:pgMar`** — an omitting section falls
  back to Word's application default paper, not its neighbour's.
- **Instruction numbers are derived from position**, literal text on a hung
  `ColumnsNode` (not a `w:num` stream).
- **Lines are addressed by id** (`coverLine`/`coverField` edit targets).
- **The instruction list is the one region a teacher may lengthen/shorten**, on the
  page: a ✕ per line, "+ Instruction" below. Controls are `data-print-hide`, absolutely
  positioned, each in a `pointer-events-none` strip spanning back to its line. Reached
  through `EditContext.coverLines`, optional like `tableGrid`.
- **A framed note pins `w:tblW` to the column width** (auto measures against the
  section's full text width and overflows).
- **The corner block floats** — an anchored `wpg:wgp` group at (−0.65in, −0.25in), a
  textbox + diagonal in a `chExt` child space. `wrapNone` reserves no space, so the flow
  needs `CORNER_CLEARANCE_LINES` blank lines. Code lines are Arial bold **11pt stored
  per line** (must not follow a QAB's 10pt body); textbox `(0,312) 1520×1350`, diagonal
  full `2725×2710` corner-to-corner.
- **The diagonal runs bottom-left → top-right**: `a:xfrm flipV="1"` in `.docx`,
  `linear-gradient(to bottom right, …)` in CSS — both the opposite of the obvious guess.
- The "PAPER 2" line is regular weight 10.5pt with `spaceBefore` (the reference's
  `w:before="115"`); the title pair is 14pt bold; timing/language lines follow the body
  size.
- **The foot block is the cover section's own footer part** (`footer3.xml`) — a footer
  pins it to the page bottom whatever the columns do. `footNote` (Paper 1's boxed note)
  prints inside that part as a one-row borderless table whose note cell alone is framed.
- **Vertical rhythm is measured off the reference** and encoded as `gapAfter` blank
  lines in the IR — neither backend adds structural spacing of its own.
- **The panel grid is shared constants** (`COVER_PANEL`, twips): tables indented 340,
  label cell 1558, write-in cells 290 in a 504 row, framed note ≥1584 tall.
- **The column rule is an anchored `prstGeom prst="line"` connector** (1.5pt), not
  `w:pgBorders`/`w:cols w:sep`/`w:pBdr` — the only mechanism with a chosen weight down
  the full column height. The preview draws a 1.5pt `border-left`; the weight is stated
  on both sides.
- **Every region must reach the `.docx`** — `coverXml` walks the region lists by hand;
  a test walks the model with a **unique sentinel per line** (defaults repeat, so stock
  text finds the other copy).
- **Structure is reproduced; wording is not** — no rubric prose, authority lines,
  barcode apparatus, or copyright notice. Guards: a phrase blocklist (the only guard
  covering Chinese — the 6-word sliding window splits on whitespace and is blind to it)
  plus that window over the reference `.docx`.
- **Both language sides carry defaults**; a test walks every region and fails on any
  line with one side filled and the other empty. The Chinese timing line carries its own
  `\n` (it overruns the column otherwise).
- **The academic year is derived** (`academicYear`, turning over in September) and feeds
  all three places it prints (corner code, examination line, QAB footer code) plus the
  settings/wizard placeholders.
- **Two font schemes**: Paper 2 is Arial throughout; Paper 1 mixes Arial (corner,
  identity, paper name) and Times (timing, instructions). So `CoverPage.fonts` is a
  default any line's own `format.fonts` overrides.
- Operative words in instructions are bolded **per run** ("Answer **ALL** questions").
- **A booklet's cover states what to answer and the margin rule** in its instruction
  list (a candidate must not have to page to the back for them); an MCQ cover carries
  neither.

### One row, many uses: `ColumnsNode`

The single IR primitive behind every side-by-side layout (band zones, inline MCQ
options, labelList). Exports as **one paragraph with tab stops, never a table** — a
table cannot sit inside a numbered list item. Cell positions are fractions of the row's
own width (after `indent`). Cost: inline MCQ options get literal `A.`–`D.` text;
stacked options keep native `w:num`.

- **A long row needs `hanging`**, or wrapped lines return to `indent` — under the
  marker, not the text. Both reference papers hang their cover instructions.
- **`hanging` and `indent` are one `w:ind`** — emitting them separately drops one.
- **With a hang, the second cell is placed from `indent`, not from `at`** — that is
  where Word returns each wrapped line. The preview gives the marker cell exactly the
  gutter as a fixed width.
- `labelList.hanging` supersedes `valueAt`.

### An enlarged line box follows its font size

Wherever the preview writes `fontSize` it must write `lineHeight` too (`formatStyle`,
`bandFieldStyle`) — the page runs on a fixed 12pt line, so a 28pt title in a 12pt box
overprints the line above. The exporter (`formatParagraphProps` → `exactLineFor()`) and
`bandsHeight()` already scale; the DOM must agree. One rule, two units: unitless
multiple on the page, twips in the `.docx`.

### An option can be a picture, and then it stacks or grids

`McqOption.blocks` exists for figure-option questions. Stacked, the blocks render after
the option's numbered paragraph (a `w:drawing` in a list item takes the marker's hanging
indent and needs `lineRule="auto"`).

- **A blocks-bearing option can only `stacked` or `columns2`** (`resolveOptionLayout`
  coerces `inline` to `stacked`): a tab-stop row cannot hold a picture per cell —
  figures would drop silently. The panel withholds Inline rather than greying it.
- **`columns2` with blocks is the reference's 2×2 grid** (each letter above its own
  graph, two per row) via `OptionRowNode`: a row of cells each holding ordinary nodes —
  the option's lettered line (a single-cell `ColumnsNode`, so the letter is a literal
  marker like every side-by-side layout), then its blocks. Word gets a borderless
  equal-cell layout table (the `figureRowXml` construction, `cantSplit`, top-aligned so
  the letters sit level); the preview a flex row plus the table's trailing 12pt blank;
  an odd last row squares off with an empty cell so a lone option keeps its
  half-column. Rows chain with `keepNext`; `keepQuestionWhole`, `collectImages` and the
  diagram pre-pass all walk the cells (an unwalked picture is a dangling `r:embed`).
  A nested table respells its width as the cell's fraction, like `figureRow`.
- **The option letter keeps with its own figure** (`keepNext`), including the last one.
- `questionBlockLists`, `mapAllBlocks` and `removeBlock` read `options` structurally,
  like `parts` — a block Delete cannot reach is a phantom line a teacher cannot see
  past. Emptied by a delete, `option.blocks` drops rather than storing `[]` (the
  panel's own rule), so the layout stops being pinned by a figure no longer there.
- **The panel's "+ Figure" seeds an actual figure** (blank axes at option width), never
  an empty paragraph to prop the region open — that paragraph printed as a phantom
  placeholder line under the letter.
- **Stacked blocks indent to `OPTION_LIST_INDENT.left`** (they continue the answer the
  letter introduces); grid cells are cell-relative from zero.
- Authored through the same `BlockEditor` the stem uses, with `figureWidth`; offered
  behind an affordance.

### A figure can carry a table beside it (`FigureRowBlock`)

The reference pie prints a bordered glossary vertically centred beside the chart
(`real_life_reference/Pie_chart.png`). No existing primitive can make that shape — a
`ColumnsNode` tab cell holds no table, a `TableCell.image` holds no nested table — so
`figureRow` is a `ContentBlock` of **exactly one figure (image/diagram) and one
table**, bounded so every backend's recursion stays one level deep.

- **The children are whole blocks with their own ids.** `patchBlocks` descends into
  the row; the read walks search `flattenBlocks` — a block `patchBlocks` can write
  must be findable, or it is a field a teacher can click and silently lose. Cell
  typing, table structure, resize and the drawing canvas all reach in unchanged.
- **Deleting a child unwraps the row to the survivor** (`removeBlock`); "+ Table
  beside" on a figure block and "Remove table" in the row editor are the same
  inverse pair. The figure keeps its id through both.
- **`FigureRowNode` nests ordinary nodes** (`ImageNode`/`DiagramNode` + `TableNode`
  from the shared per-block builders in `renderContentBlocks`), so backends reuse
  their emitters. The preview is a flex row (`items-center`) rendering children
  through the same `NodeView` — handles and grid controls come free; the `.docx` is a
  **borderless two-cell layout table** (all six borders spelled `none`, zero cell
  margins, `w:vAlign` centre) with the real table **nested** in one cell. A nested
  table's cell must still end in a paragraph — `tableNodeXml`'s trailing spacer is
  that paragraph, not an accident.
- **The nested table's width is respelled** as the fraction of full content width
  equal to its cell (`tableNodeXml` resolves every table against one base); indent
  and alignment are dropped as cell-relative. The figure column takes the figure's
  printed width plus a gutter, capped at 72% of the column.
- The row takes a table's separating blank line, joins `keepQuestionWhole`, and its
  children are walked by `collectImages` and the diagram pre-pass (a dangling
  `r:embed` is a repair error on the whole file).
- An empty-celled nested table renders the row as the bare figure — the same
  "nothing renders an unmeasurable box" rule a standalone empty table follows.

### A source is a labelled panel around a mix of blocks (`SourceBlock`)

The data-response question's unit — "Source A: Basic information about housing in Hong
Kong" (DSE 2025 Q11, 2019 Q12). Both papers build every source the same way: a **label
line, a body, sometimes a footnote**. What no existing block could make is the body,
because a real source is regularly a *mix* — 2025 Source A frames a paragraph, a table
and another paragraph together, and a `box` table cannot hold it (a cell is one `w:p`,
which is why `TableCell.image` exists instead of nested blocks).

- **A `ContentBlock`, not a layout element.** A source belongs to *one* question and
  moves, duplicates and deletes with it. `stimulus` is the opposite case: content two
  questions *share*, positioned by the flow, whose point is a derived question range.
- **The label is authored, never derived from position.** Every other derived number
  prints inside a slot the app controls, so re-deriving updates every occurrence. A
  source letter is referenced from *free prose* in the parts ("Refer to Sources B and
  C."), which nothing can renumber — deriving one end of a two-ended reference would
  silently relabel the panel while the question kept naming the old letter. The insert
  seeds the next free letter (`nextSourceLetter`) and stores no index.
- **One level deep.** A source may contain neither another source nor a `figureRow`
  (itself a layout table): a third level of `w:tbl` is past what `figureRowXml` proved.
  The sidebar withholds "+ Source" inside a body.
- **The `.docx` is a one-cell layout table**, the same construction `figureRowXml` uses
  — a cell is the one OOXML container that holds a nested table beside prose. Framed
  draws four sides; bare draws `none` on all six, **never omitted** (an unstated border
  inherits from the table style).
- **The row is `cantSplit`, so a panel is atomic.** A frame that broke across a page
  would print half a box. The accepted cost: a source taller than a page cannot be
  placed, which is reported rather than silently overflowed.
- **The frame lines up with its own label, never the page margin.** The reference puts
  the stem sentence, every "Source X:" line, every frame edge and the footnote on **one
  column**, with only the question number hanging out in the gutter. So `SourceNode`
  carries the caller's `indent`: the `.docx` spells it `w:tblInd` and narrows `w:tblW`
  by the same amount (width + indent = the content column, or the frame runs off the
  page), and the preview uses `margin-left`. The **body does not inherit it** — the
  frame has already moved right, and re-applying it would indent the content twice
  inside a box that had moved by the same amount. A nested table's respelled width
  divides by the frame's width, not the column's, or it overhangs its own right rule.
- **The frame follows the body, and is derived** (`defaultFramed`, `model/edits.ts`):
  **a body that is one table draws its own box already**, so framing it puts a box
  around a box with the panel's cell margins showing as a gutter — a shape neither
  reference prints (2025 Source B is label · ruled table · footnote, no outer rule).
  Everything else frames: loose blocks have no edge of their own. Never stored, so
  adding prose to a one-table body reframes it by itself; the panel offers
  Auto/Framed/None and states which it is. The rule lives in `model/` because both the
  renderer and the sidebar read it, and a component may not import `render/` for it.
- **The label and footnote fill their line** (`fillWidth`). They sit alone above and
  below the frame, so the selection rectangle — a sibling at the paragraph's `inset-0` —
  spanned the whole column while the field hugged its words: **589px of painted box over
  53px of click target**, a control that ignores most of its own clicks. Filling makes
  the painted box and the target the same element, so they cannot disagree. Safe for the
  reason a table cell is safe and a numbered stem is not: no list marker, so
  `inline-block` has no hanging indent to break. `fillWidth` is now independent of
  `compactPlaceholder` — a cell wants both, a source line only the fill.
- **The preview is a bordered `div`, deliberately not a `<table>`** — the cell-selection
  and marquee queries are scoped to `#print-root` and find every table in it, so a frame
  that was itself a table would join a sweep started in the real table inside it.
- **The body recurses through `renderContentBlocks`**, into a fresh stream: the
  head-of-stream skip in the table gap rule applies again inside the frame, and there is
  one gap rule rather than two spellings to drift.
- **Air on both sides, spelled as blank lines.** The label `keepNext`s to the frame and
  the frame to the footnote (else one strands and the other widows); the footnote clears
  the rule — flush against it, it reads as a row of the panel — and a gap follows the
  panel, because a source is followed by the question's parts every time.
- **Nothing renders an unmeasurable box**: a source with no body, label or footnote emits
  nothing at all, the same rule an empty table follows.
- Its two lines carry `sourceLabel`/`sourceFootnote` edit targets, are formattable, and
  clear-on-empty like every optional text field.

### A cell can be ruled out diagonally

`TableCell.diagonal` marks "this figure does not apply" — 2025 Source A slashes the
private-housing eligibility cell. The papers' other spelling, omitting the cell, is
already expressible as a ragged row; this is the bordered variant a uniform grid cannot
reach.

- **The slash runs bottom-left → top-right**: `w:tr2bl`, and `to bottom right` in the
  preview's gradient — both the opposite of the obvious guess, as the cover's corner
  diagonal already records.
- **It composes with `headerRule`'s resolved edges rather than replacing them**, and
  comes **last** inside `w:tcBorders` (`CT_TcBorders` is itself a sequence), which still
  precedes `w:tcMar`/`w:vAlign`.
- Unstored when absent, so an untouched table stays byte-identical.

### Per-element formatting (`TextFormat`)

Named styles supply defaults; `TextFormat` records **only deltas**. An untouched
document exports byte-identically to the style-only baseline. Formatting attaches to
whole elements, never one language side (a bilingual heading is one Word paragraph).

### Per-run formatting (`InlineRun`)

A run overrides a stretch of characters (`fontSize`, `color`, `fonts`,
bold/italic/underline), mirroring `w:r`/`w:rPr`. Three layers compose: named style →
element `TextFormat` → run. Flags **or** with the element; size/colour/fonts
**replace**. `applyRunFormat` splits at both offsets, patches, and `normalizeRuns`
re-merges identical neighbours. `null` in a patch **clears**; `undefined` cannot.

### Sub/superscript are run-only, reachable by button

`vertAlign` is offered in the page toolbar and the diagram canvas's in-place editor
(storage marker `_{1}`). It stays **off `TextFormat`** (a paragraph wholly in subscript
is meaningless); it rides as an explicit extra field on the `onFormatRuns` patch.

### A field cleared to nothing stores nothing

A contenteditable emptied with ⌘A-Backspace hands back a run holding `"\n"` —
invisible in the app but still in the document, printing a phantom blank line. Every
optional-text write path drops the field when `isBiTextEmpty` is true, **and its
placement with it** (`titlePlacement`/`captionPlacement`), restoring the measured size.

### The editing surface renders runs, not markers

`**bold**`, `^{sup}` are a **storage** form (`serializeRuns`, lossy — flags only).
Every editing surface (`RichTextEditable`, shared by page, sidebar `BiTextField` and
table cells) renders runs as themselves and reads attributes back (`data-run-attrs`);
its offsets are the model's plain-text offsets. Rules (each failed silently before):

- **A contenteditable is uncontrolled** — runs are painted imperatively (`runToNode`);
  JSX children make React reconcile nodes the browser mutates.
- **The field's own echo must not repaint it** — `paintedRef` + `sameRuns` recognise
  the store round-trip; only outside changes repaint, then restore the caret.
- **Typing is left to the browser** (IME, autocorrect, undo). `onBeforeInput`
  intercepts only a pending format; paste is forced to plain text.
- **The toolbar reports the selection, not the element**; blur ignores focus moving
  into `[role="toolbar"]`.
- **A collapsed caret is published, and only when it changes** — `sameSelection`
  compares by value (a fresh object per call would republish until React bails out);
  consumers wanting a genuine range check `start < end`.

`replaceRichTextRange(runs, start, end, insert, fallback)` is the edit primitive:
inserted characters inherit from the run left of the caret (then right, then fallback).
**`insertBlank` is the deliberate exception**: a fill-in blank forces `underline` —
otherwise it is twelve invisible spaces. It stays underlined spaces, not a new run kind.

---

## Render IR (`src/render/ir.ts`)

```
RenderNode = TextNode | ColumnsNode | TableNode | ImageNode | DiagramNode
           | FigureRowNode | SourceNode | PageBreakNode | SpacerNode | DividerNode
           | AnswerLinesNode | AnswerSpaceNode

TextNode: style (one of 14) · text: BiText · listRef? {stream, definition, level, marker}
          marks? · keepNext? · teacherOnly? · indent? · format? · edit?: EditTarget
          boundaryGap?
```

`EditTarget` is a discriminated union keyed by **id**: `worksheetTitle`,
`worksheetInstructions`, `blockText`, `blockCaption`, `tableCell`, `mcqOption`,
`mcqStatement`, `mcqExplanation`, `partAnswer`, `subPartAnswer`, `layoutText`,
`sourceLabel`, `sourceFootnote`, `bandField`, `labelListCell`, `coverLine`,
`coverField`.

- **`edit` is inert in export** — docx/clipboard never read it.
- **Derived text carries no target** (marks totals, "Answer: C", numbers in band
  fields); the authored wording around a number does.

`listRef.stream` connects IR to `.docx`: each distinct stream becomes one `w:num`.

---

## Numbering (`src/model/numbering.ts` + `src/export/docx/numbering.ts`)

**Derived, app-level:** `computeNumbering()` walks the resolved flow; numbers are
1-based, continuous until a `section` sets `restartNumbering`.

**Native, in OOXML:** three abstract multilevel definitions —

| Abstract | Used for | Levels |
|---|---|---|
| 0 | questions | `1.` decimal → `(a)` lowerLetter → `(i)` lowerRoman |
| 1 | MCQ options | `A.` upperLetter |
| 2 | statements | `(1)` decimal |

Each IR stream gets a concrete `w:num`. Options/statements get one per question with
`w:startOverride`; a section restart is a new `w:num` on the question stream.

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
| `furniture.ts` | The QAB's page frame and margin notes as anchored header shapes |
| `xml.ts` | Escaping, illegal-char sanitization, attribute builder |

### One fixed line, no paragraph spacing

Every paragraph: `w:line="240" w:lineRule="exact"`, `w:before`/`w:after` zero — the
reference paper's model. All vertical rhythm comes from the line box. Consequences
(each fails silently):

- **Separation costs a line.** `blankLine()` is that line; every gap *inside* a question
  goes through it. The gap is an IR node, not a style property, so all three backends
  space identically.
- **A gap counts what is already there.** `pushGap()`/`endsInBlankLine()` push a blank
  *unless* the stream already ends in one. `endsInBlankLine` is language-neutral.
- **A boundary gap is the one exception, and it dies at a page top.** Air *between* two
  top-level items belongs to the boundary, so when that boundary falls on a page break
  there is nothing left to separate and the gap is only a shifted top margin — on Paper
  1's three-line boundary it reads as a missing question. `withLeadingGap()`
  (`render/ir.ts`) therefore puts it on the item's own first paragraph as `spaceBefore`
  (`ITEM_GAP_LINES` in the walker), **not** as leading spacers.
  - **`w:before` is the only spelling that delivers it**: Word discards it at the top of
    a page and honours it everywhere else, so the rule is applied by the one party that
    knows where the `.docx`'s pages break. Spacer paragraphs cannot — an empty paragraph
    occupies its line wherever it lands, and Word breaking *between* loose spacers
    stranded a different number on every boundary.
  - **The preview owns the same rule on its side**: it knows which item leads each
    sheet, so the leading block takes `.leads-sheet` and the CSS zeroes the margin.
  - **`TextNode.boundaryGap`/`ColumnsNode.boundaryGap` mark it as a boundary**, so
    spacing a teacher authored is never dropped with it. The preview keys on that flag
    (`data-gap-carrier`), never on the presence of `spaceBefore`.
  - **The gap is still measured into the item's height** — the probe paginates with it,
    which is what an item's fit depends on when it does *not* lead a sheet.
  - A gap-bearing paragraph is the one place an untouched document emits `w:spacing`
    with nothing overridden; `exactLineFor()` is restated with it, or direct formatting
    drops that paragraph off the 12pt rhythm.
- **The gap is suppressed only at the true top of the page**, not flow index 0 — the
  masthead/title/instructions print above the flow (`somethingAboveFlow`).
- **A table takes one blank line before it.** The gap lives in `renderContentBlocks`,
  which **appends into the caller's stream** (so the boundary rule can see what
  precedes). The gap spacer carries the caller's `keepNext`. The preview renders the
  trailing structural empty paragraph as a real `BLANK_LINE_PT` block — CSS margins are
  invisible to the paginator. `tableGeometry.test.ts` greps both directions.
- **`exact` does not grow** (it clips) — that keeps a bilingual page on one rhythm.
  Larger sizes need a larger box: `exactLineFor()` scales from the 11pt/12pt base.
- **A picture's paragraph is the one exception** (`w:lineRule="auto"` in `pictureXml`) —
  `exact` clips a 225pt figure to a 12pt slice painted behind the text above, while the
  image still selects at full size in Word. Separation around the figure stays a blank
  line.
- **A picture is placed by `w:jc` on that paragraph**; `align` on
  `ImageBlock`/`DiagramBlock` resolves in the IR, defaulting to **`center`** (every
  reference figure is centred). The preview expresses it as `text-align` — no `mx-auto`.
- **Every style states its own metrics.** Word merges `w:spacing` as a whole element;
  `formatParagraphProps()` restates the line whenever spacing or size is overridden.

### A numbered paragraph indents as a block

Word list geometry is `w:ind` `left` + `hanging`: text column at `left`, marker pulled
back by `hanging`, every wrapped line at `left`. CSS `text-indent` moves the first line
only, so the preview uses `padding-left` and draws the marker **absolutely positioned**
at `left - hanging`.

- **Each level's marker starts where its parent's text starts**: `(a)` at 360, `(i)` at
  720. Level 2 widens the hang rather than moving the marker: `{left: 1170, hanging:
  450}` — room for "(viii)" while `left - hanging` stays 720.
- `QUESTION_LIST_INDENTS` in **`model/numbering.ts`** is the one definition; its three
  consumers (docx numbering, `Preview.tsx`, `registry/structured.ts`) may not import
  each other. One stale copy = page breaks in different places on screen vs paper.
- **A document renders on one `ListIndentScheme`** (`listIndentScheme(shape)`, derived,
  never stored). The default scheme is the constants above; **Paper 1 carries its own,
  measured off `real_life_reference/hkdse_paper1_layout_1.docx` **as Word lays it out,
  not as its XML spells it** (its "(1)"+tab overshoots the stored 660 stop to the
  default-tab grid): question `1.` {480, 480}, statement `(1)` {960, 480}, option `A.`
  {1423, 459}, stem continuations at 480. A marker must fit inside its hang or native
  numbering's tab overshoots `left`. The scheme rides on `RenderContext.indents` (the
  registry may not read the constants directly), on `EditContext.listIndents` for the
  preview (shape joins `ctxStamp`), and as a parameter to `buildNumberingXml`.
- **A stem's continuation blocks indent to `STEM_TEXT_INDENT`** (level 0's `left`), as
  a part's do to `PART_TEXT_INDENT`. A registry test walks every type.
- **MCQ lists follow the same rule with the stem as parent**: statements
  `{left: 720, hanging: 360}`, options one step deeper at 1080.
- **Style classes must add no margin of their own** — `listIndent.test.ts` greps
  `Preview.tsx`.
- **The preview pins the same numbers**: `.paper` sets 11pt / fixed 12pt line, zero
  paragraph margins.

### "(4 marks)" sits on the last line with text

The `.docx` uses a right-aligned tab stop at the content edge, `w:tab` after the text.
No CSS property expresses that, so the preview separates reserving and placing
(`MarksTrail` in `Preview.tsx`):

- An **invisible twin** of the label rides inline at the end of the text (reserves
  exactly the right width on the actual last line); the **visible copy is pinned
  `bottom: 0; right: 0`** in the relative paragraph.
- **A trailing hard break is a blank line the marks must not hang on.**
  `trailingBlankLines()` counts them for both backends; the preview lifts the label by
  that many `lh`, the exporter moves trailing breaks after the marks.
  `marksAnchorRuns()` picks the side to count in bilingual mode.
- **A full anchor line pushes the whole label to the next line in both backends.** The
  docx label's interior space is a **no-break space** (`marksText`) so Word wraps it
  whole; the preview **measures** the last text character against the label's own width
  (deliberately without the twin's em gap) and renders an explicit extra line when
  needed. Both copies `whitespace-nowrap`.

A one-line part looks correct under every wrong scheme — the bug only shows on a part
that wraps or ends in a break.

`BAND_ROW_TWIPS` (`model/page.ts`) duplicates the 240tw (`model/` may not depend on
`export/`); a test asserts agreement.

### Tables have no header row (`src/model/table.ts`)

`headerRowCount` was removed — no HKDSE table has grey/bold header treatment, and a
distribution table's headings run across the top *and* down the left. Emphasis is
per-cell formatting. Regression tests assert `not.toContain('<w:tblHeader/>')` and
`not.toContain('EFEFEF')`.

### A part can carry unnumbered text above it

`QuestionPart.blocksBefore` is the mid-question interlude (a revised scenario between
(a) and (b)). It takes no letter and no marks, prints at `STEM_TEXT_INDENT`.

- **It belongs to the part below** — deleting or moving (b) carries its lead-in.
- **A full `ContentBlock[]`** (interludes are regularly tables/figures);
  `questionBlockLists` and `mapAllBlocks` must both know it.
- Separated by a blank line each side via `pushGap`; `keepNext` holds it to the part it
  introduces. Offered behind an affordance in the panel.

### A boxed stimulus is a frame with nothing ruled inside it

`TableBorders` is `'all' | 'box' | 'headerRule'` — named modes, deliberately not
per-edge control. `headerRule` is the **T-account**: frame, one rule under the top row,
one down the middle.

- **Resolved per cell in the IR** (`resolveCellEdges` → `TableNodeCell.edges`); only
  `headerRule` populates it.
- **Resolved from grid position, not cell index** — spans occupy multiple grid columns
  and a `covered` cell occupies **none**.
- **The table itself then draws nothing** — all six `w:val="none"`, never omitted (the
  table style puts the grid back). `w:tcBorders` must precede `w:tcMar`/`w:vAlign`
  (`CT_TcPr` is a sequence; out of order = repair error on the whole file).
- **An odd column count has no midpoint** — the divider is omitted.
- **`box` writes `w:val="none"` on `insideH`/`insideV`, never omits** (Word inherits
  unstated borders from the table style). The frame's four sides are untouched, keeping
  ordinary tables byte-identical (pinned).
- **The frame sits on the table, the cells go borderless** in both HTML backends.
- **`TableCell.image`**: an image, not `ContentBlock[]` (a cell is one `w:p`; a picture
  is the one thing that joins those runs without recursion). Must be in
  `collectImages`' walk — emitted but uncollected is a dangling `r:embed` = repair
  error on the whole file.

### A table can start from a named shape (`src/model/tableTemplates.ts`)

`TABLE_TEMPLATES` ships the shapes the syllabus draws every year (balance sheet,
two-period comparison, boxed extract), offered above the size grid in the `+ Table`
popover.

- **A template is only an initial value** — fresh ids, no stored `templateId`.
- **What is constant ships; the figures stay empty** (a seeded number is one a teacher
  can miss).
- **Both language sides are filled** (a test walks every template).
- The balance sheet is **four columns** (label + figure per side, no rule between);
  header cells span 2+2 with `covered` placeholders.

### A cell's field is the whole cell

`richNodes` takes `compactPlaceholder`; table cells pass it — the long prompt wrapped
to four lines and changed the measured row height (the paginator measures these boxes;
`data-empty-placeholder` hides by `visibility`, keeping the box). The field takes the
cell's width (`InlineEditable.fillWidth`) so the whole cell is the click target, with
the dashed underline as the affordance and a faint resting tint.

- **Width only, never height** — `inline-block w-full`, no padding or `min-h`.
  `emptyCellField.test.ts` greps for both directions.
- **`text-left` on the empty prompt only, regardless of the cell's own alignment** — a
  `·` hugging a figure column's right edge reads as content. A cell that *has* text
  keeps the alignment it prints with: ranging the selected state left too made a
  centred cell jump left on the first click and jump back on the second, when the
  editing branch (which never carried the class) took over, so the alignment appeared
  to come and go with the engagement.
- **Empty, selected and open all take the cell's width.** Painting the locked box
  around the *words* drew a ragged rectangle floating inside a much larger cell (92px
  of highlight in a 190px cell): it read as a selected phrase, not a selected cell, and
  left most of what was clicked unpainted. A cell is the unit the sidebar names and
  that align and merge act on. The open editor takes the same width, so entering the
  field shifts nothing.
- **The `inline-block` warning is the paragraph path's, not the cell's** — an own
  formatting context breaks a numbered stem's hanging indent, and a cell has none.
  `inline-block` is also what lets a wrapped cell paint as **one** rectangle where the
  paragraph path needs a positioned sibling.

### Padding resolves in one direction

Teachers size padding on cell, row, column or table; OOXML has only `w:tblCellMar` and
`w:tcMar`. `resolveCellPadding()` flattens the winner onto every `w:tc`.

- **Each edge resolves on its own.**
- **Zero is a value, not absence.**
- **The default is the old hardcoded pair** (60/108 twips) so untouched tables export
  byte-identically.
- Precedence cell → **column → row** → table (the narrower statement wins).

### Columns are fractions, and the preview must lay them out fixed

`columnWidths` stores fractions of content width (undefined = equal). **The preview
must be `table-layout: fixed` with a `colgroup`** — browser auto-layout sizes from
content, Word from `w:gridCol`, and the paginator measures these boxes.
`tableGeometry.test.ts` pins: last column takes the rounding remainder; a merged cell's
`w:tcW` is the sum of spanned columns. Text wraps and the row grows (no
`overflow-x-auto`); cells set `overflow-wrap: break-word`.

Widths drag on the page (`TableColumnResizer`): in-flight value local, committed on
pointer-up, delta ÷ preview scale, Escape abandons. `resizeColumn` moves **only the two
neighbouring columns**, floored at `MIN_COLUMN_FRACTION`. `insertColumn`/`removeColumn`
carry widths and per-column padding with them.

### The table's own box, and row heights

`width`/`indent` (fractions of content width) → `w:tblW` + `w:tblInd`. `columnWidths`
are fractions **of the table**. `resizeTableEdge`: right edge moves width alone; left
edge moves width *and* indent.

- **A new table starts at `DEFAULT_TABLE_INDENT_TWIPS` = `QUESTION_LIST_INDENTS[0].left`**
  (flush at 0 hangs in the question number's gutter).
- **Width resolves *from* the indent**: no stored width means `1 - indent`, not 1; the
  pair clamps `min(indent, 1 - width)`. Guarded twice.

### Alignment and indent are alternatives

`align` (`w:jc`) is not `indent`: a centred table stays centred when margins change.
Exclusive by construction:

- `setTableAlign` drops `indent` when centring and stores nothing for `left`.
- `resolveTableBox` reports `indent: 0` for anything but `left`.
- Dragging the **left edge returns `align` to `left`**.
- The preview expresses alignment as `auto` margins; an in-flight edge drag renders as
  `left`.

`TableRow.minHeight` is a floor (`w:trHeight hRule="atLeast"`). Everything meaning
"unchanged" is dropped from the model.

### Everything structural is reachable on the page

Three drags (column boundaries, outer edges, row heights) plus insert/delete for rows
and columns; the panel keeps exact values. Both routes end at the same pure verbs in
`model/table.ts`. Browser-proven rules:

- **Only the pointed-at row and column get controls.**
- **A grip may not be gated on hover** (`pointer-events: none` swallows the
  pointer-down); grips are always live, sized 7px.
- **Horizontal and vertical grips must not cross** — row grips are inset by a grip's
  width.
- **The control layer sits flush (`inset-0`)**; reaching past the table is a
  transparent hover pad's job, at `-z-10` so clicks reach cells.
- **No chip may sit inside the table box.** Deletes take a second lane beyond their
  inserts — rows at `left: -33` past `-16`, columns at `top: -25` past `-9`. The column
  delete once sat *inside* row 1 (`top: 9`), centred on its column: the second click of
  the double-click that opens a first-row cell landed on "Delete this column", and the
  stored table really lost a column. Chrome may never occupy a spot a content gesture
  has to reach. `preview/tableChipPlacement.test.tsx` pins the offsets.

### A rectangle of cells can be swept

`cellSelection` (two corner ids, beside `activeCell`) — ids, not positions, so a
structural edit cannot leave it naming moved cells. A sweep aims `activeCell` at the
anchor; a click collapses the range.

- **`cellRects` uses the browser's own grid placement** (also Word's): a `rowSpan`
  occupies its columns in spanned rows, a covered placeholder occupies nothing.
- **`cellsInRange` expands to a fixed point over merged cells** (Excel's rule). A stale
  id yields the empty range; the panel falls back to the active cell.
- **The page and the panel share the one helper**; align applies through `patchCells`
  in one commit; a button reads pressed only when the whole range agrees.
- **A range paints as one selection**: light fill per cell + one continuous outline as
  inset box-shadow segments; the anchor's single-cell ring is withheld while a range is
  active.
- **In-flight sweep is local state; store written on pointer-up.** Focus cell from
  `elementFromPoint`, clamped to the starting table.
- **The page marquee exempts `[data-table-cell]`**; the "inside an open editor" guard
  tests **`isContentEditable`, not `role="textbox"`** (idle spans carry the role too).
- **Merge and the cell image step aside over a range** rather than acting on the anchor.
- **A press off any cell drops the selection**, in the same preview-wide `onMouseDown`,
  *after* the `button` exemption — the resize grips and insert chips are buttons acting
  on the active cell. The selection lives in the store, so no local reset reaches it:
  without this the ring and the table panel stayed locked on wherever the teacher
  clicked next. `clearPageSelection` clears it too.
- **Delete clears the range's contents, in one commit** (`clearCells` → `applyClearCells`),
  never one `deleteTarget` per cell — that would cost one undo per cell.

### A cell formats like any other text

`tableCell` is in `isFormattable`; per-run formatting via `textOfTarget`. `CellAlign`
wins over `TextFormat.align`. `model/table.ts` rules: **ragged rows are real**
(`insertColumn` pads short rows first); **a covered cell is neither merge target nor
source**; **one row and one column are the floor**.

### Editing a table: structure in the panel, content on the page

Word's division: insert/delete, align, merge, padding in the panel; typing on the page.

- Table alignment sits outside the per-cell branch, labelled `Table`.
- Padding scope is chosen before the numbers (Cell/Row/Col/All); every field shows the
  effective value and whether inherited; each edge holds a local draft while focused,
  committing on blur/Enter.
- The page reports the clicked cell as `activeCell` on **`onClickCapture`** (cell text
  stops propagation); the active cell takes a ring, not a tint; a stale anchor falls
  back to whole-table actions; missing per-cell controls are explained, not greyed out.
- **Tab walks the table** (`InlineEditable.onTab`): commit and close before the next
  opens; order from the **IR, not the DOM**; covered cells skipped; false at the end
  lets Tab fall through.
- **Inserting a table picks its size first** (`ui/TableSizePicker.tsx`, opens downward).

### Answer lines are a style, not direct formatting

A ruled line is an empty paragraph with a bottom border. `AnswerLine` declares both
`w:between` and `w:bottom` (Word collapses consecutive same-border paragraphs — the
guard asserts the *border*, not `w:p` count) and an exact 24pt line. A named style so
Word doesn't flag direct formatting; deliberately **not** a `NodeStyle`.

### A caption prints above or below its block

`captionPlacement` on table/image/diagram blocks; `below` default and unstored.

- **Resolved once, in the IR.**
- **A caption above must `keepNext`**; below, the picture keeps with the caption.
- Optional and absent by default; the placement control appears only with a caption.
- The table's trailing spacer paragraph stays after the table either way.

### Clipboard (`src/export/clipboard.ts`)

Same IR; writes `text/html` + `text/plain` via `ClipboardItem`. Numbering becomes
literal text. Carries **no page setup, headers, or cover** — pasting must not impose
this document's furniture; the cover cannot be expressed in clipboard HTML at all (the
`.docx` is the fidelity path). A test pins the exclusion.

### An inserted picture is reduced to what the paper can print (`src/export/imageImport.ts`)

`ImageBlock.src`/`CellImage.src` are `data:` URLs, base64 in the document's own JSON —
what makes a downloaded `.worksheet.json` self-contained, and the whole cost: base64
adds a third again and localStorage is ~5MB **across every document**. So a file is
reduced once, at import, by `prepareImageForStorage()` — browser-only and async (it
decodes and re-encodes through a canvas), hence beside `diagramImage.ts`.

- **The cap is the page, not the insert size.** A figure prints at `widthPx / 96`
  inches, resize is width-only and the column is a hard wall, so the widest any picture
  can print is the widest content column the app offers — A4 at the narrowest preset,
  ~7.27in. `MAX_STORED_WIDTH_PX` = 2200 is that at 300 DPI; `MAX_STORED_HEIGHT_PX` =
  3500 catches a rotated scan. **Never upscales.** Storing the *display* size (420px)
  would print mush, because a teacher may drag a figure larger afterwards.
- **Every judgement is in `planImageImport()`, which is pure** — the canvas work is
  mechanical, and the policy is the part that can be wrong. Unit-testable with no DOM.
- **Within the cap and exportable ⇒ the original bytes, untouched.** The common case
  (screenshots, chart crops). Not re-encoding avoids a generation of loss and keeps the
  ICC profile.
- **Alpha forces PNG; a JPEG stays JPEG; everything else races** PNG against JPEG,
  keeping JPEG only when it wins by a wide margin. The margin is what makes the race
  safe without a content classifier: line art compresses so well as PNG that JPEG
  cannot approach it. **Keeping the source's family unconditionally is the tempting
  wrong answer** — it stored a downscaled 2600px photograph as a 6MB PNG, *larger than
  the file that arrived* and alone past the whole budget, so one insert made the
  document unsaveable. Measured in a browser, not reasoned about.
- **A format the exporter cannot decode is repaired, not merely shrunk**: `DATA_URL` in
  `export/docx/index.ts` matches PNG/JPEG/GIF only, so a WebP does not just take space —
  it fails to export. A test pins the two lists together.
- **An animated GIF never meets a canvas** (`drawImage` takes frame one, silently), and
  GIF exports as-is, so there is nothing to repair at any size.
- **`naturalWidthPx`/`naturalHeightPx` describe the *stored* bytes**, not the file that
  arrived, or the aspect lock and the exporter's EMU maths disagree.
- Browser traps, each silent: **EXIF orientation is applied at decode**
  (`imageOrientation: 'from-image'`) because re-encoding strips the tag and a
  mis-decoded photo is permanently sideways; a white ground goes **behind** the picture
  (`destination-over`) before anything becomes JPEG, or alpha composites to *black*;
  the canvas is drawn at target size, never full size (iOS ceilings fail by returning
  blank pixels, not by throwing); and the output is **decoded again before it is
  stored**, since a quiet failure yields a white rectangle or `"data:,"`.
- **It never throws.** Anything unexpected stores the original bytes: quota is a
  problem a teacher can see, a corrupted figure is not.
- **No schema change and no migration** — this changes the *values* written to `src`,
  not the field's meaning, so v1 documents are untouched. Existing documents carrying
  full-resolution originals are **deliberately not rewritten on load**: that would
  silently mutate a teacher's file and collide with autosave firing only on dirty.

---

## Diagrams

### Geometry in, one image out (`model/diagram.ts`, `render/diagram.ts`)

A `DiagramBlock` models the DSE vocabulary in **unit space** (0..1, origin
bottom-left).

```
Diagram ──diagramSvg()──┬──► preview: live inline SVG
                        └──► rasterize @3x ──► one PNG ──► .docx w:drawing · clipboard <img>
```

Word gets a raster (one image = one object). Rasterizing needs a canvas, so
`export/diagramImage.ts` is a browser-only async pre-pass returning
`Map<blockId, pngDataUrl>`, keeping `buildParts`/clipboard synchronous. No map →
`exportDocx` **refuses to export**, naming the diagram (silently emitting nothing made
a missing figure indistinguishable from one nobody added). `exportDocxBuffer` takes its
map as an argument for tests/scripts.

`collectImages` walks only `rendered.items`; the pre-pass also walks bands, title and
instructions. Not a bug (none of those can hold a picture) — pinned by a test.

Renderer rules:

- **Axis titles lay out outside the plot**: right padding from estimated width, capped
  at `MAX_X_TITLE_SHARE`; `axisTitleAnchor` clamps inside the canvas, never left of the
  arrow tip (lives there because `DiagramCanvas` builds the drag handle from it).
- **Bilingual labels with identical sides print once** (symbols like "AD", "E₀").
- **Every side is cut at its own hard breaks** (`richLines`, fed by `pickSides` — the
  one funnel from `BiText` to drawn lines). Run-aware, so `vertAlign` survives a break.
  `titleRoom` counts lines and `estimateWidth` takes the widest.
- **A point's label defaults to `right`** (intersections).
- **Every piece of diagram text is 10pt** (13⅓px — SVG lays out in CSS px, exports at
  96dpi). The title keeps its underline.

### A diagram's words live inside its own image

`title` is the diagram's **only** label — drawn into the geometry, rasterized into the
same PNG. `titlePlacement` (`above` default, unstored) picks the side. A `DiagramBlock`
has **no `caption`** and `DiagramNode` carries none — a caption paragraph is what let
the words drift from the figure.

**Edited in the sidebar and nowhere else.** The canvas draws the title but it is inert
there (`applyDrag`/`deleteHandle` return unchanged for a `diagramTitle` handle). No
`titleOffset` — the box is sized around the title.

**`diagramSize()` measures the box from what is drawn.** The plot keeps `PLOT_ASPECT`;
each side grows by exactly the room its text needs.

- **Width stays the teacher's number, floored by what the title needs**
  (`titleWidthFloor`). A teacher's crop bypasses the floor.
- **The printed size follows the labels** — renaming an axis reflows the page; the
  accepted cost of never clipping and never padding.
- **Every writer re-measures**: factory, panel width field, panel title field,
  `applyResizeBlock` (a drag re-measures, never scales the old ratio).
- `model/edits.ts` and `model/factories.ts` take a value import from `render/diagram`
  (safe: `render/diagram` imports only types from `model/`).
- `titleRoom()` is shared by the projection and `diagramTitleAnchor()`, reserved on the
  title's own side only; a title below is measured back from the canvas edge.

`DIAGRAM_TEMPLATES` ships ten starting shapes. A template is only an initial value.

### A teacher can crop the frame, and the frame is the printed size

`Diagram.crop` is four pads from the plot's edges to the canvas edges (px at nominal
size), replacing **every** derived pad when present. Absent means measured — untouched
documents render byte-identically (pinned by a freeze test).

- **Photo-crop semantics**: the plot keeps its printed size and 4:3; committing writes
  `crop` *and* `widthPx`/`heightPx` in one change.
- **A crop must not move the content**: title and axis titles anchor to
  `Projection.frame` (where measured edges would sit). Under auto sizing `frame` equals
  the real edges. A too-tight frame visibly clips — deliberately not prevented.
- **Cropped, the size ignores language** (a chosen frame must not resize on language
  switch).
- **The crop workspace is the same renderer**: Crop mode redraws with pads inflated by
  `CROP_MARGIN` (a step size, not a ceiling); workspace height comes from `diagramSize`
  on the inflated crop, **not** stored height plus margins.
- **Frame gestures follow canvas rules**: in-flight rect in state, one commit on
  pointer-up, release recomputes from the gesture, no-travel commits nothing. Grips
  clamp against the plot.
- **Crop is a mode**: entering clears selection and caret; every shortcut but Escape is
  inert; "Auto frame" drops the crop.

### A pie chart is a diagram variant, and its slices are data

`Diagram.pie` (optional) makes the diagram a pie chart: `diagramSvg`/`diagramSize`
branch, the axes fields are ignored, and the whole block pipeline — one PNG, resize by
re-measure, title mechanism — serves it unchanged. Modelled on
`real_life_reference/Pie_chart.png`.

- **The printed percent is derived** from `slice.value / total`, never stored — values
  may be raw figures or percentages and the labels come out right either way. One
  decimal at most, trailing `.0` trimmed.
- **Slices draw clockwise from 12 o'clock in array order**, filled with cycling
  monochrome patterns (white → hatch → grey → dots); labels sit on the slice centroid
  with a white halo (`paint-order: stroke`) so hatching cannot run through the letters.
- **The axes canvas never opens for a pie** (guarded where `drawingBlockId` resolves in
  `EditorApp`) — slices are edited in the sidebar panel (`PieSliceFields`), name + share
  per row. Slice edits never re-measure: labels draw inside the circle.
- **The pie's title is bold and not underlined** (the reference pie's own setting);
  a lone slice draws as a `<circle>` (its wedge path would collapse), zero-value slices
  are skipped, and an empty pie stays visible as a bare circle.
- **A long pie title wraps at the chosen width instead of flooring it**
  (`pieTitleLayout` → `wrapRichLines`): the reference headline cost 490px on one line,
  which was the smallest pie a teacher could make. The title keeps its size and takes
  more lines; the only remaining floor is the widest unbreakable word (Latin breaks at
  spaces, CJK per glyph — the same `estimateWidth` metric, or size and drawing would
  wrap differently). Size and SVG wrap through the one function, at the **nominal**
  width, so the 3× raster cannot re-wrap. Axes diagrams keep `titleWidthFloor`.
- Inserted as the `pie` template; **picking a template now re-measures the block** (the
  shapes disagree about their box — a pie is square-ish, the axes plots 4:3).

### A flow chart is a diagram variant, and its layout is measured

`Diagram.flow` (optional, like `pie`) makes the diagram a production-chain flow chart
(`real_life_reference/flow1–4.png`): boxed stages joined by labelled arrows, riding the
whole block pipeline — one PNG, re-measure sizing, the title mechanism — unchanged.

- **Placement is slot-based, never free**: a `FlowNode` names a column and a row; boxes
  are measured from their own text, column gaps grow to fit the widest adjacent-column
  label, and stored col/row values need not be contiguous (layout compacts them).
- **A column's boxes share one width** (its widest boxed stage), and the column
  **centres on its boxed stages** — a bare-text annotation ("increase in inventory
  $50") hangs off the stack without fattening the boxes above it or pulling them off
  the chart's midline. Both rules are the reference's own.
- **Arrows name node ids**; an absent endpoint is an open end drawing an entering or
  leaving stub, whose length grows to carry its own labels. **Two label slots**
  (`label` above, `labelBelow`) because the reference stubs use both at once ("$200"
  over "raw materials"); on a mostly-vertical shaft they read as right/left. A
  diagonal shaft widens the clearance by its own rise across the label.
- **Arrows aim at box centres and stop at the wall** (`flowEdgePoint`): each end sits
  where the centre-to-centre line crosses that box's boundary, which is what staggers
  two arrows entering one stage along its edge instead of stacking both arrowheads on
  the midpoint.
- **The natural layout scales uniformly to the stored width**, photo-style, fitted and
  centred against both stored dimensions — a flow chart's natural width is set by boxed
  prose, and the reference figures are wider than the text column often enough that
  shrinking the whole picture is the only honest way to honour the teacher's width.
  Every flow edit re-measures (a longer stage name changes the aspect).
- **A flow chart opens its own editor, never the axes canvas** —
  `components/editor/FlowCanvas.tsx`, reached like the axes one (thumbnail, panel
  button, double-click on the page; `EditorApp` picks the surface). Direct
  manipulation over the real SVG: a drag commits a **column + insertion index**
  (`model/flowEdits.ts`, pure and tested), never a pixel position; past the outermost
  column means a new one. Arrows are drawn box-to-box (release on empty paper = open
  stub); text is retyped where it prints. Canvas house rules apply: commit on release,
  a dragged box deselects itself, hit-testing reads `flowChartLayout()` — the exact
  rectangles `flowSvg` drew. The sidebar keeps only the way in plus a summary.
- **An arrow gesture touching the empty-chart placeholder creates the first stage**
  and connects the stub to it — the reference's entering "$200 raw materials →"
  exists before its chain does. A gesture wholly inside the placeholder draws nothing.
- **"Clear chart" empties boxes and arrows in one commit**, behind a two-click armed
  confirm — undo lives in the page's keyboard scope, unreachable while the canvas
  modal owns it.
- The `flow` template ships invented wording — the reference charts are past-paper
  questions and must not ship. An empty chart stays visible as one empty stage box.

### A forum figure is a diagram variant, and its bubbles are data

`Diagram.forum` (optional, like `pie` and `flow`) draws the "views expressed in a
forum" stimulus both reference DRQs print (`real_life_reference/2023_essay.png`
Source B, `2025_essay.png` Source C): speech bubbles with pointed tails around a
central illustration, riding the whole block pipeline — one PNG, re-measure sizing,
the title mechanism — unchanged.

- **Placement is slot-based, never free**: a bubble names one of four corners
  (`ForumSlot`), boxes are measured from their own wrapped text, and the tails are
  derived from where the picture actually is — so re-wording a view reflows the
  figure instead of stranding a tail.
- **The layout is computed at the stored width — deliberately not the flow chart's
  photo-scale.** Bubble prose has no natural width of its own (it wraps at whatever
  the box gives it), and scaling shrank the words with the figure: a 400px forum
  printed ~6pt bubbles beside 10pt diagram text everywhere else. At the stored width
  every glyph stays the diagram's one 10pt size, and a narrower figure honestly costs
  more wrapped lines, never smaller type.
- **A bubble's width is the teacher's, its height is measured**: `ForumBubble.width`
  is an optional fraction of the figure's width (absent = the reference share),
  dragged by the bubble's **inner** edge on `ForumCanvas` — the outer edge is the
  slot's anchor and never moves, and the drag clamps against the row-mate so two
  bubbles cannot cross. The text re-wraps live during the drag; the store is written
  once on release, re-measured (canvas house rules).
- **The stored width is the wrap target; the drawn box hugs the widest wrapped
  line.** Drawing the full target framed the wrap's leftover as a blank right margin
  — a shape no reference bubble prints. Because the box hugs, the forum wraps and
  measures with its own per-character metric (`forumTextWidth`, Times advances
  bucketed by class) rather than the shared flat-rate `estimateWidth`: there a
  coarse estimate costs whitespace, here it is a visibly wrong box. The hug keeps a
  small cushion for the metric's residual error.
- **Speaker and body are separate fields**, because the papers format them
  differently (the speaker line is underlined, the body is not) and a derived split
  would break on a speaker whose name holds a colon. Each bubble's outline is **one
  closed path** — box border and tail share a stroke, so the join cannot seam.
- **The central picture is part of the diagram**, a `data:` URL with its natural
  size (`ForumImage`, reduced by `prepareImageForStorage` like every stored
  picture). It rides *inline* in the SVG — not an external reference, so the
  rasterizing canvas stays untainted — and lands in Word inside the same single PNG,
  painted first so a tail tip overlapping its edge draws over it. A forum with no
  picture still draws its bubbles, tails pointing at the middle.
- **The forum opens its own canvas, never the axes one** (`ForumCanvas`, reached
  like `FlowCanvas`): the one geometric decision — bubble width — is dragged there,
  hit-testing `forumChartLayout()`, the exact rectangles `forumSvg` drew. Everything
  else is data in the sidebar panel (`ForumFields` — speaker, view, corner,
  add/remove, picture import). Every forum edit **re-measures**, unlike a pie's
  slices: bubble text sets the boxes' heights and the picture the middle row.
- The `forum` template ships two bubbles with invented wording and no picture — the
  reference figures are past-paper questions and the illustration is the teacher's
  own clipart. An empty forum stays visible as one empty bubble.

### Drawing (`model/diagramDraw.ts`, `components/editor/DiagramCanvas.tsx`)

**The canvas owns the geometry; the panel owns everything else** (Template, Width, Alt
text, Caption + the thumbnail that opens the canvas). `showOrigin` and free-label
align/italic live on the canvas; an axis title deleted to nothing gets a "Name the
x-axis" affordance.

Handles draw in a separate `pointer-events-none` SVG **over** the real one, so the
geometry underneath stays byte-identical to what exports.

- **The projection is shared, not re-derived**: `diagramPlot()` returns the projection
  `diagramSvg()` uses (with inverses `ux`/`uy`); label anchors are exported from the
  render module and fed to `hitTest`.
- **Gestures replay from geometry captured at pointer-down** — idempotent, never
  accumulating.
- **A near-flat line straightens itself** (`snapToAxis`, ±5°, judged in **screen
  space** — the plot is wider than tall, so unit space disagrees). **Shift turns the
  assist off.** Point-snapping wins over it. An orange guide reports it.
- **Any text is edited where it is drawn** — double-click opens a caret
  (`handleText`/`setHandleText` are the one address); a `curve` handle carries no text,
  so double-clicking a line adds a kink while double-clicking its name retypes it.
- **A label's hit target is its drawn box, not its anchor** (`LabelAnchor.box` carries
  `getBBox()`).
- **A drag lets go of what it moved**: press arms, ~4px begins, release deselects a
  single dragged element. Multi-element selections survive their drag.
- **Cursors are bucketed in screen space** (`cursorFor`); the wrong y negation swaps
  the two diagonals.
- Hit-testing prefers handles over bodies, topmost among bodies; text competes with
  vertices. Snapping catches intersections and points, stores nothing; `pointAt()`
  selects an existing point rather than stacking a twin.
- `⌘C/V/X/D` use a **canvas-local clipboard**; `pasteInto` re-ids and offsets, and
  paste selects what it created.
- The stage renders at a zoom multiple (default 2×); zoom scales display only,
  asserted by comparing path data across zoom.

### Every label moves, and stays attached

All seven text kinds drag. Only free `DiagramLabel`s store absolute positions;
everything else stores an **offset from its own anchor**, so re-dragging a curve
carries its name. A drag accumulates the pointer delta onto the offset; tick labels
slide along their own axis only; axis titles nudge inside their reserved room. A point
label: eight compass slots (`labelSide`) or a free-drag `labelOffset` that supersedes
them; picking a side clears the offset. Deleting anchored text deletes the text, never
its anchor.

---

## The LQ mode (Question-Answer Book)

Everything here is opt-in data, so a document using none of it exports byte-identically
(asserted: no `LqAnswerLine` in styles.xml, no anchors in the header).

### The booklet is a 10pt document

`Worksheet.baseFontSize` (points, absent = 11, in `KNOWN_KEYS`); `lqMock` and `paper1`
both seed 10 — the two papers of one mock read at one size. A
**document** property, not per-element formatting (seeding `TextFormat` per element
would revert on the first typed question). Three consumers: `buildStylesXml` scales
docDefaults/`Normal`/body-sized styles (display styles keep their sizes); the preview
sets the same size on `.paper` sheets *and the pagination probe*; `renderCover` prints
"INSTRUCTIONS" at it. **The fixed 12pt line does not shrink** — `exactLineFor` clamps
everything ≤11pt to 240, and the preview's `formatStyle` mirrors the clamp. Cover lines
that must not follow the body size store their own 11pt.

### The dotted answer line is a different primitive

`answerSpace` is **not** `answerLines` with a flag: the mechanism (dotted underline
over a right-aligned tab vs a paragraph bottom border), the pitch (22.1pt vs 24pt) and
the Word style all differ.

- **The pitch is measured**: `LQ_LINE_PITCH_TWIPS` = 442, spelled as **one exact line
  box** (an auto line is whatever the renderer's metrics say — the disagreement the
  fixed-line model exists to prevent).
- **The tab stop is the live content width.**
- **The tab run restates `w:u w:val="dotted"`** — Word underlines a tab only when the
  run wearing it is underlined.
- **The style is emitted only when the rendered IR uses an answer space** (an answer
  space also comes from a question part; keying on layout alone shipped a dangling
  style reference).
- The preview draws `border-bottom: 1px dotted` rows at the same twips;
  `scripts/lq-pitch.py` measures the rendered pitch.

### Answer space lives on the part, and also in the flow

`QuestionPart.answerSpace` / `QuestionSubPart.answerSpace` (optional line counts) print
dotted lines directly after the part/sub-part; the flow-level `answerSpace` element
remains the shape for whole-sheet runs. Absent prints nothing.

**A QAB question starts at a page top, by explicit break** — the preview keeps items
whole while Word splits a too-tall question, so the reference's own convention (every
question opens a fresh page) is what keeps the backends agreeing
(`scripts/lq-fixtures.test.ts`).

### A section can carry its derived total

`section.showMarks` appends the derived "(44 marks)" suffix as `partHeader` does — the
QAB numbers 1..14 across three sections, so the marks cannot ride on a restart-bearing
element. The QAB's sections set `restartNumbering: false`.

### Fill-to-page: the count is the paginator's output

`answerSpace.fill` inverts the sizing: `lines` becomes the **resolved** value the
paginator last wrote.

- **Resolution is a single pass over the packed layout** (`resolveFillCounts`): a fill
  absorbs its sheet's slack and *ends* the sheet — no fixed-point iteration. First fill
  takes the slack; a second gets the floor.
- **The packer places a fill by intent, not measured height** (`PackItem.fillsPage`) —
  its height is only the last-resolved count, and packing by it gave two stable states.
- **The resolved count is written into the model** by `resolveAnswerSpaceFills` — the
  one deliberate bypass of `commit()` (derived, must not spend undo entries).
  Double-gated by value comparison in the effect and the store, which stops the
  measure → write → measure loop. Written into the model so exporter/clipboard/
  thumbnails read the number the preview resolved.
- **Nothing may follow a fill**, or the backends disagree about the booklet's length:
  the preview ends the sheet at the fill and opens a new one for the next item, while
  Word — which knows only the resolved line count — fits that item onto the same sheet.
  A closing line belongs *above* the space, which is the reference's own shape.
- The page withholds the resize handle on a fill element; the outline shows a "fills
  page" pill.

### Per-page furniture is one running header of anchored shapes

`worksheet.pageFurniture` (`frame` + `marginNote`, in `KNOWN_KEYS`) reproduces the
reference's page frame and rotated margin sentences as anchored shapes in **one running
header** (the reference's 21 headers exist only to vary incidental apparatus).

- **Geometry is measured out of the reference's `header2.xml`** and shared through
  `model/pageFurniture.ts` (`furnitureBoxes`), positioned `relativeFrom="page"`,
  resolved from live page setup.
- **The furniture forces a header part** even when no band would print, rides on the
  page-1 part whatever the band state, and the cover stays frame-free (its section
  carries no header reference).
- The preview mirrors it as an absolutely positioned per-sheet layer — deliberately
  **not** `data-print-hide` (the one on-page layer that must print).
- **The margin note's direction is per script**: Latin is *rotated* (`vert270` /
  `rotate(-90deg)`); Chinese stacks upright glyphs (`vert="eaVert"` /
  `writing-mode: vertical-rl`, no rotation). `upright="1"` belongs to the rotated case
  only. An upright strip must be wider than a rotated one (`noteWidthVertical`, via
  `furnitureBoxes` so both backends resolve the same box), growing away from the text
  column. LibreOffice mis-renders `eaVert` — the preview is the surface to check
  Chinese notes on.
- The same sentence prints a third time, horizontal, below the frame's bottom edge, in
  the same running header.
- **Wording is authorable with a neutral default** ("Do not write in this margin.") —
  the reference's own sentence is rubric. The phrase blocklist pins it.

### The booklet's running footer is part of its shape

`qabFooter()` seeds `lqMock` with the reference's footer: paper code + live page number
left (9pt), bare number centred (14pt). Both are the existing `pageNumber` band field —
authored prefix around the derived number, live `PAGE` fields.

- **A QAB always prints its footer and never offers a header.** `isQabDocument()`
  (furniture present) is the switch; `DocumentSettings` **withholds** the header
  section and the footer toggle, with a sentence saying why.
- **The cover is page 1, and the preview must count it** — Word's `PAGE` field counts
  the cover's sheet but the paginator never sees it, so the preview's band numbers add
  the offset back.

### The document type leads the wizard

`NewWorksheetOptions.documentType` — `classroom`, `paper1`, `lqWorksheet`, `lqMock` —
is asked **first**, as cards, deriving cover, sections, furniture and seeding. The
older `cover` option maps onto the type.

- **`paper1`**: Paper 1 cover, running footer, derived lead-in, "END OF PAPER", **no
  sections** (the reference runs unbroken). Prints on the booklet's fixed margins
  (`QAB_MARGINS` — the P1 reference layout uses the identical numbers; withheld in
  Setup → Page and the wizard) and its own indent scheme (§ `listIndentScheme`).
- **`lqWorksheet`**: dotted answer space, no exam apparatus.
- **`lqMock`**: Paper 2 cover, Sections A/B/C with derived totals and continuous
  numbering, the "Answer any ONE question." note, page furniture. Closing lines are
  seeded as ordinary text elements (bold centred "END OF SECTION A/B" / "END OF PAPER";
  Section C has none; Chinese 甲部完／乙部完／全卷完), and the sample question lands
  inside Section A before its END line.
- **Both LQ types seed one sample question** (`seedSample`, on by default, invented
  wording) — an empty LQ document hides its whole point. The harness fixture opts out.

### `scripts/lq-verify.mjs` is the booklet's harness

Asserts the **page count** in all three backends, rasterises a pure answer page against
the reference's page 10, measures the dotted pitch (`lq-pitch.py`), and asserts the
browser's resolved fill count equals the stored count (= the preview and the paper
agreeing about the last sheet). Copyright guards mirror the cover's.

- **The fixture names seeded elements by their text, never by position.** It once
  destructured the first four flow entries as `[secA, secB, secC, note]`; when `lqMock`
  gained its closing lines every position shifted by one, three landmarks fell out of
  the flow and appended as a phantom trailing sheet, and the harness reported a stale
  page count for weeks. A lookup throws instead of quietly building the wrong booklet.
- **`EXPECTED_PAGES` is restated, not derived** — a booklet is a length claim, and a
  count computed from the model under test would agree with any regression.

---

## The MCQ paper (Paper 1)

Seeded by `paper1Layout()` / `examFooter()`, all editable afterwards.

### The lead-in counts the questions, and the count is derived

The `questionCount` layout element: **authored `prefix` · derived number · authored
`suffix`** (the `BandField` decomposition). The count comes from the numbering plan,
not `questions.length`. Both sides stay unstored until retyped; "BEST" is bold per run.

### One footer shape, two papers

`examFooter(code, paperNumber)` serves both; the papers' one real disagreement is the
centre number's size (14pt booklet, 9pt Paper 1 — measured off the references).

- **A `PAGE` field must carry the field's whole formatting, not just fonts** — the
  field is five runs and Word takes the displayed number's size from them.
  `bandWording.test.ts` asserts every field run carries the size.

### A paper with a cover states its rubric once

Both cover-bearing types clear the seeded "Answer ALL questions." body instruction (the
cover already says it); the settings hint points at the cover.

### The exam paper's boundaries are wider than a worksheet's

Measured off DSE 2021 P1, spelled as blank lines on the same fixed 12pt grid:

| Boundary | Blank lines |
|---|---|
| question → question (two MCQs) | **3** |
| the `questionCount` lead-in → question 1 | **2** |
| everything else | 1 |

- **The number lives on the question type** (`examGapLines` on
  `QuestionTypeDefinition`); `boundaryGapLines` (`render/worksheet.ts`) only decides
  when to honour it — the walker may not name a concrete type (`registry.test.ts`
  greps).
- **The number can be overridden, nearest statement first**: a question's own
  `gapBefore` beats the document's `Worksheet.examGapLines` (optional, in `KNOWN_KEYS`;
  Setup → Page) beats the type's default. All read only where the wide gap applies,
  floored at 1; absent keeps tracking the layer beneath.
- **The gap drags where it is**: `RenderedQuestion.adjustableGap` marks the adjustable
  boundary (present exactly where `boundaryGapLines` reads a stored number); the
  preview mounts `GapAdjuster` on it — a pill in the *right* margin (centre belongs to
  the insert `+`, left margin to the reorder grips), one commit on release writing
  `gapBefore`. The exact value lives in the question panel's "Space above".
- **A Paper 1 question is kept whole in Word too** (`keepQuestionWhole`): every node
  but the last takes `keepNext`, text/columns rows take `keepLines` — the preview's
  paginator never splits an item, so without the chain the .docx broke pages inside a
  question the screen had pushed whole. The last node stays free (the chain must not
  run through the boundary gap), and `keepWhole` is part of the render cache key.
- **Only on a Paper 1**, decided by `documentShape()` — a classroom worksheet keeps
  the one-line rhythm; widening would silently re-paginate existing documents. Derived,
  never stored.
- **A wide gap still counts what is already there** (`endsInBlankLine` reports one
  spent line).
- **The first item of the page is never widened** — neither the true top of page 1
  (`somethingAboveFlow`) nor a question that a page break pushed onto a fresh sheet. The
  second is not decided here: the gap is carried in a form that dies at a page top in
  both backends (§ *A boundary gap … dies at a page top*), because neither the walker
  nor Word can be told where the other's pages fall.
- **The gap count is part of the render cache key** (`gap`), or a dragged question
  hands back its previously-spaced nodes.

### A closing line needs the air a heading gets

A `text` layout element takes the same leading `ITEM_GAP` a heading does (otherwise
"END OF PAPER" prints flush under the last option). Suppressed at the true top and
after anything that already spent a line.

### A document offers only what its own paper can contain

`model/documentShape.ts` derives which of the four documents this is (furniture = the
booklet, a panel-less cover = Paper 1). **Derived, never stored.**

| Shape | Withheld | Why |
|---|---|---|
| `paper1` | `answerLines`, `answerSpace`, `section`, `partHeader` | Answered on a separate sheet; runs unbroken |
| `lqMock` | `answerLines`, `questionCount` | Its answer space is the dotted primitive; ruled lines are a second rhythm |
| others | `questionCount` | The lead-in is the MCQ paper's |

- **Withheld, not greyed out**, with a sentence saying why. The booklet's Page tab
  states its paper size/margins as fixed and what would break.
- **The cut must not overreach**: heading, note, divider, page break and blank space
  stay on every shape. `documentShape.test.ts` pins both directions.

---

## Pagination and pages

### A page is derived, and owns the break that made it

No `Page` in the model — a page is whatever the paginator measured onto one sheet.
Measuring lives in the component; the deciding half is pure in
`components/preview/pagination.ts`.

- **A manual break belongs to the page it opened**: it consumes no space but *leads*
  that page's `flowIds` — otherwise moving a page collapses it, deleting one leaves a
  stray blank, and an empty page is unaddressable.
- **A trailing empty page survives only if a break opened it** (incidental slack is
  dropped — Word emits no sheet for it); a deliberate page renders `BlankPage`.
- **Consecutive breaks each open their own page.**

`movePage` is one `moveRunInFlow` — a page is just a run of ids.

### An item taller than a page breaks at a node boundary

An item that merely overflows moves to the next sheet **whole** — Word does the same, and
breaking a question that would have fitted costs a page turn for nothing. One taller than a
whole page is **split**, because the alternative was worse: it used to get its own sheet and
overflow off the paper, printing over the footer and then simply not being there. The
reference booklet's Q11 (two framed sources, four parts, a table) lost its final table and
essay instruction that way, and the preview reported one sheet fewer than the `.docx`.

- **The break candidates come from `keepNext`**, not from the measured boxes:
  `breakAfterNodes` (`Preview.tsx`) offers any node whose `keepNext` is falsy. That is the
  chain Word reads, so both backends break in the same place — on Q11, before part (d).
  A source panel's nodes keep to each other, so a break is never offered inside a frame.
- **Moved first, split second.** An item is only ever broken while it has a sheet to
  itself; filling the outgoing sheet's slack with the head is what Word does *not* do, and
  a preview that did it ended the document a sheet short.
- **The last boundary that fits wins** — filling the sheet is what keeps the preview's page
  count equal to the export's.
- **Heights are per node**: the probe records each block's cumulative node bottoms
  (`nodeHeights`) beside the block height; `breakPoints` joins the two. Measured in the
  probe only — a block already split has just a piece of itself on each sheet.
- **A fragment is a rendering, never a model thing.** `ItemBody` takes a `range` and slices
  its own node array; `composePages` gives a split item to the page it *starts* on and to
  that one only, so the rail, drag/drop and `moveRunInFlow` keep seeing one item.
- **An oversized atom is cut anyway** (a source frame taller than a page): a frame in two
  halves is visible and fixable, content off the paper is not. An item with no declared
  boundary keeps the old behaviour exactly.
- **A fill answer space is never split** — its height is the paginator's own output.
- Documents with nothing too tall pack byte-identically to before (`pagination.test.ts`
  pins both directions).

### A drop target receives the run, not the grabbed id

Dragging a multi-selection member carries the whole selection; that rule lives in the
*drag*, so `onDragItemChange` publishes `string[]` resolved once at the source. All
drops route through `movePage`: one commit. `dropRunAnchor()` lands a run after the
target page's last non-moving member; it returns nothing when the run already is the
tail.

**The first sheet is the destination no anchor can name** (never carries a break) —
receiving is weaker than acting (`canReceive`); `moveToDocumentStart` orders the run
before the first non-moving item.

### The outline groups by page (`editor/Outline.tsx`)

`groupByPage()` cuts the resolved flow into the paginator's sheets and promotes each
break to the tab heading of the run it opened. **A group is a result, not a promise**
(they re-cut per measurement) and **a section can begin mid-sheet** — groups are the
top level, a section heading is a row inside one. Tabs open by default; unplaced items
fall into a trailing unnumbered group; dropping on a tab lands at the head of that
page.

---

## Page setup, headers and footers (`src/model/page.ts`)

Paper, orientation, margins stored in **twips**: the exporter writes them straight into
`w:pgSz`/`w:pgMar`; the preview converts to mm. `MARGIN_PRESETS` labels are asserted
against stored values. **Custom…** shows per-edge cm fields clamped 0–5, committing on
blur/Enter with a local draft while focused.

Headers and footers are **lists of `Band` rows** (same model as the masthead) — one
model, one editing surface (`BandEditor`), one exporter path.

### A header lives in the margin, not in the text column

Word grows a header **downward from `w:header`**; body text moves only past `w:top`.
Room = `top - header`. `headerFooterOffsets()` derives the offset from the bands —
**only when they do not already fit** under Word's 1.27cm default, then only as far as
needed, clamped at `MIN_EDGE_TWIPS`.

- **Offsets are sized from the running rows**, not the taller page-1 list; the cover
  takes its overflow as extra padding on page 1 only (`pageStyleFor`).
- **Word gets an estimate; the preview measures.** `bandsHeight()` estimates (~264tw
  per 11pt row, scaled by field font size); the preview measures real boxes via
  `ResizeObserver` (`measuredFirst` for page 1).
- **Overflow moves the text column, not merely its budget** — header overflow moves the
  top down, footer overflow the bottom up, separately. Page 1's overflow is computed
  against `edgeOffsets`.
- Rows taller than the whole margin are reported (`BandOverflowNotice`), not fixed.

Each row exports as one paragraph with tab stops from live content width. A rule draws
only on the edge-most row.

### Page 1 can differ

| State | Stored as | Page 1 prints |
|-------|-----------|---------------|
| Same on every page | neither field | `bands` |
| Blank on page 1 | `showOnFirstPage: false` | nothing |
| Its own rows | `firstPage: { bands }` | `firstPage.bands` |

Word models this as `w:titlePg` + a `w:type="first"` part. `firstPageHeaderFooter()`
resolves the three states in one place, shared by exporter and preview. `w:titlePg`
switches page 1 *wholesale*, so once either edge differs **both** need a first-page
part; a part is emitted when either the running rows or page 1's would print.

**A write aimed at page 1 creates the separation**: `scope: 'firstPage'` creates
`firstPage` on first write (and sets `showOnFirstPage: true`). The panel renders two
labelled surfaces — "Page 1" first, then "Pages 2 onward" — with two quiet link actions
("Same as page 1" / "Give page 1 its own header").

### Editing bands on the page

Header text is edited on the page; the panel keeps show/hide, rule, page-1 state and
presets.

- **A page number is one field with a pattern** (`plain`, `pDot`, `longForm`), shared
  via `pageNumberPlaceholder`: the preview substitutes a chip (`withPageNumber`); the
  exporter splits on the same placeholders so only numbers become `PAGE`/`NUMPAGES`.
  `bandFieldText` returns the placeholder. Fill-in rules export as real ruled runs.
- `patchHeaderFooterBand` searches both band lists; the lists never share ids
  (`setFirstPageMode` re-ids on copy).
- **A structural edit must name its list (`BandScope`)**: a row being created has no id
  yet, so add/set take `'running' | 'firstPage'`, resolved from the sheet the click
  landed on. Deletion needs no scope.
- `BandEditor` offers hover-revealed `+ Row`, per-row `✕`, and a label naming the
  surface. All `data-print-hide`, positioned outside the flow.
- **An empty band list still renders while editing** (`bandsShouldRender(bands,
  editable)`) — returning early on empty leaves nowhere to put the first row back.
- **A hover-revealed control must be reachable**: the `✕` sits outside the row's box,
  wrapped in a `pointer-events-none` strip spanning back to the row, revealed with
  `opacity`, never `display`.

### One sheet, three regions to edit

Body, header and footer are separate documents (Word's rule). Inactive regions:
`opacity: 0.42`, blur, `pointer-events: none`. **Double-click** enters a dimmed
header/footer; **single click** on the dimmed body returns.

- **The wake overlay needs a region with a height**: `.paper-region { height:
  fit-content }`; `.paper-region-body` opts out.
- **Not a grid** — a one-cell grid stacks the body's children.
- **Chrome must not be measured**: the paginator reads `[data-band-rows]`.

Print CSS neutralizes dimming and hides the overlay.

### Print preview is the print rules, run on screen

**Edit | Preview** (`store.printPreview`). The strip-down rules are written once,
shared by `@media print` and `body.print-preview` — new chrome needs `data-print-hide`
exactly once. CSS alone cannot deliver two things:

- **Gestures are disabled in JavaScript** (the marquee tracks on `window`); the
  bulk-shortcut handler swallows ⌘A.
- **`#print-root` keeps its own pointer events** while descendants lose theirs.

`printPreview` lives beside `mode`, deliberately **not inside** it — `OutputMode` is
what the exporter reads. Entering clears the question selection; `HintPill` hides.

### Both band paths must agree

`BandEditor` (active) and `ReadOnlyBandRow` (idle + print/PDF) draw the same rows.
Formatting is one shared function (`bandFieldStyle`); chrome reserves no space
(drop-zone outlines use `ring`; spacing belongs to `HeaderFooterBand`, applied in both
paths). Verify by measuring the same text node in both states.

---

## Question-type registry (`src/registry/`)

`QuestionTypeDefinition`: `id` · `displayName` (bilingual) · `create()` ·
`render(question, context) → RenderNode[]` · `EditorPanel` ·
`countMissingTranslations?` · `examGapLines?`. Registered: `mcq`, `structured`. A new
type needs only a definition.

- **The hand-built numbered paragraph must copy the block's `format` itself** — the
  four hand-assembled sites (MCQ stem; structured stem, part, sub-part) each omitted it
  once. `registry.test.ts` asserts it reaches the IR for every type.
- **No shared module may branch on a concrete type.** `registry.test.ts` greps eight
  modules for `'mcq'`/`'structured'` literals.

---

## The start screen (`src/components/start/`)

The app opens on a list of documents, not on a document. `StartScreen` is the list plus
the way in; `NewWorksheetForm` asks the once-per-document decisions.

- **The gate lives in `EditorHost`, outside the editor**, as session state (`chosen`) —
  it resets on reload, and an overlay inside the editor would run the paginator over a
  blank worksheet on every visit to the list.
- **Leaving the editor must flush the autosave** (the 1.2s debounce dies with
  `EditorApp`'s unmount). Both departure paths save **by value** — `store.save()` reads
  `getState().worksheet`, which `replaceWorksheet` has already swapped.
- **A new document is saved before it is edited** — `replaceWorksheet` marks the store
  clean and autosave only fires on dirty, so an untouched new worksheet was never
  written.
- **`createWorksheetFrom` layers over `createWorksheet()`** — one definition of a new
  document; a test pins the two to the same shape.
- **Turning sections off rewrites `flow` and `layout` together** (the flow names
  elements by id).
- **The wizard is a form, not steps**; every field has a working default. The start
  cards preselect a document type and nothing else.
- **The row opens the document; the menu holds the filing actions.** Duplicating saves
  without opening.
- **A summary can outlive the document it names** — opening one says so and drops the
  row.

## Editor layout (`src/components/`)

The preview is the centrepiece; the right sidebar shows **one thing at a time** behind
two tabs (Content = outline, Edit = selection); the tab follows the selection. Two left
rails: AddRail (insert) and PageRail (navigation, multi-sheet only).

### The sidebar is an inspector, not a second editor

**Printed text is typed on the page, and only there.** The panels carry what does not
print or has no page handle: marks, the MCQ answer key, option layout, structure verbs,
teacher-only answers. Where a panel once mirrored a paragraph or an option as its own
field, it now shows a compact excerpt row (`panelRows.tsx`) — an *address* for
reordering, deleting and scroll-into-view, never for retyping. The rule Word teachers
arrive knowing, and the one the table panel already followed.

- **The structured panel is a mark scheme grid**: one row per part/sub-part — letter,
  excerpt, marks, answer lines — with the row's verbs behind a `⋮` menu. A part whose
  sub-parts are individually marked shows its derived total as a pill, never an input.
- **A cleared source label/footnote emits nothing on the page** (§ renderSource), so
  the source panel keeps seed buttons ("+ Label", "+ Footnote") — absence needs a
  restore path that empty page-text cannot provide.
- **The hidden language is reached by switching the language mode** (toolbar
  EN／中文／EN+中) and typing on the page — the panels offer no second surface for it.
- **`textOfTarget` covers every target `applyEditTarget` can write** (the question-owned
  strings included), so per-run formatting works on options, statements and answers.
- **The panel never dead-ends**: every layout kind gets a panel (`LayoutElementPanel`
  in `Inspector.tsx` — section numbering/marks, spacer height, label-list rows, a
  sentence for divider/page break) and any selected element pulls the Edit tab over.
- **The link runs both ways**: the page marks its text with `data-page-target`
  (§ TextNodeView) and a panel row click scrolls there (`scrollPageTo`), the reverse
  of the page's scroll-into-panel.
- **One editing place per number**: the Outline's rows report sizes as pills; answer
  lines and spacers are edited by dragging on the page or in the element's panel.

### The contextual toolbar row (`preview/ContextBar.tsx`)

Word's "Table Layout appears when you're in a table": a second docked row under the
format bar (in its place when no text is selected) carrying the selection's structural
verbs — cell align, merge/split, table align and rules for the active cell; alignment
and the way into the drawing canvas for a selected figure.

- **One verb, one place**: rows/columns stay on the page's grid chips, padding, the
  cell picture and captions in the sidebar, and the panel's own copies of the bar's
  verbs were removed with it.
- **Verbs act through `replaceBlock` by id** — the canvases' route — so the bar needs
  no owner and works on nested tables (a figure row's, a source body's) unchanged.
- Range rules carry over: align acts on the whole sweep and reads pressed only when it
  agrees; merge steps aside over a range. A pie gets no Draw button (no canvas opens).

### The page's right-click menu (`preview/PageContextMenu.tsx`)

The Word reflex gesture. The render site that owns the click resolves the payload — a
paragraph knows its edit target, a cell its address, a picture its block id — never a
DOM walk. Groups are **built at open time in the event**, not during render (closures
stored in state that capture refs read as render-time ref access to the compiler), and
a menu with nothing to offer never opens.

- **It is the page's block-insert surface**: any payload naming a block offers "Insert
  below" — paragraph, a quick 3×3 table at the stem's indent, image (via a hidden
  file input reached by id), blank-axes diagram, source panel. The sidebar strip keeps
  the size grid and named templates. `insertBlockAfter` (`model/edits.ts`) does the
  splice: it descends into source bodies, treats a figure row's children as the row's
  own position, and **preserves the identity of untouched questions** (the render
  cache is keyed on the question object). `insideSourceBody` withholds the Source item
  one level down; `sourceCountAround` seeds the next letter.
- A cell's menu carries the grid verbs (`tableGrid` handlers) and merge (store
  `replaceBlock`); a figure's carries Edit drawing and Delete; a text target's Delete
  comes from `describeDelete`. Right-click on a cell/picture selects it first — the
  menu always describes what is now selected.
- Claims the modal layer while open, so the page's window-level keys stand down.

### What a document is called is not what it prints

`Worksheet.name` (optional, plain string, in `KNOWN_KEYS`) is what the document is
**called**: the toolbar, the outline header, the file list, the `.docx` filename.
`title` is the bilingual heading **printed** on page 1. They coincide on a plain
worksheet, which is why one field served both — and why renaming used to stamp a filing
decision ("DSE Mock 2026 (final)") across the top of the paper.

- **A rename writes `name` and never touches `title`.** Both routes — the toolbar and
  the start screen's dialog — go through `worksheetStore.rename`.
- **`documentName()` (`model/text.ts`) is the one fallback chain**: `name` → `title.en`
  → `title.zh` → undefined. It lives in `model/` because `export/` and `storage/` both
  need it and neither may depend on the other. Every consumer reads it (or
  `worksheetTitle()`, which adds the list's "Untitled"); a test greps all four. Two
  respelled copies existed, and each one kept showing the *printed title* after a
  rename.
- **Absent `name` means the old behaviour exactly** — a document saved before the field
  existed names itself by its title, as it always did. No migration, no version bump.
- **`docProps` in the `.docx` is not this** — it carries the printed, language-aware
  `title` and must not follow the file name.

The toolbar's mark carries the app; the word beside it is the document's name
(`editor/DocumentName.tsx`), renamed in place on click.

- **Blank and unchanged both store nothing** — the first is a slip that would leave the
  document reading "Untitled", the second would spend an undo entry renaming nothing.
  The decision is `renamedName()`, pure and tested; the component is the shell.
- **The box opens on the stored `name` only** — `worksheetTitle()` may be showing a
  fallback, and neither the printed title nor "Untitled" is text typed *here*.
- The name truncates at `22ch` with the full name as its tooltip, or a long one pushes
  Export off the bar.

### Settings live in a dialog

Once-per-document decisions → `DocumentSettings`, a tabbed dialog from the toolbar's
**Setup** and the outline's **Settings**. It claims the keyboard via `useModalLayer()`.
Header *text* is typed on the page; whether the header *exists* lives here.

- **Tabs group by where a thing prints** — the `furniture` tab reads down the page.
- **A choice between two layouts is shown, not named** (`BandPreview` draws actual
  zones; deliberately not `BandEditor`).
- **Deriving the same number twice is reported** (`duplicateComputedFields()`), not
  prevented.

`GroupHeader` (not `Eyebrow`) names regions a user works in.

### Where a new item lands: the insertion anchor

`insertAnchorId` in the store is **a position, not a selection**: the flow id a new
item lands behind (undefined = append). An explicit `afterId` wins.

- **The anchor advances onto what was just added.**
- **A dead anchor is cleared in `commit`** (`livingAnchor()`) — the single write path
  covers undo/redo and removals.
- **The flyout states its destination** (`flowItemLabel()`: derived question number or
  the element's own text).
- **Hovering previews the position; it does not take it.**

### Nothing lands after "END OF PAPER"

With no anchor a question would append after the closing line both exam papers end in.
`appendIndexFor` (`store/worksheetStore.ts`) walks back over the tail before splicing.

- **Derived from shape and format, never a stored flag** (a closing line is an ordinary
  text element a teacher may drag or reword).
- **Only a centred text element is walked past** — centring is what makes a closing
  line a closing line in both reference papers; ranged-left tail elements (the
  lead-in, "Answer any ONE question.") introduce what follows and must not be passed. A
  section marker stops the walk, keeping a new question under the last section.
- **Scoped to `paper1` and `lqMock`**; **questions only** (a layout element appended
  with no anchor genuinely means the end).

The gap affordance is chrome in the item's trailing edge, absolutely positioned
(**reserves no space**), drawing the drop indicator's own dot–line–dot (an insert and a
drop put an item in the identical position). `data-print-hide`.

### Direct manipulation on the page

```
click once                 → select · Delete works · format toolbar appears
click again / double-click → edit in place · Enter commits · Esc cancels
hover in a gap             → insert caret + "+" → adds there
hover                      → margin drag grip → reorder
```

- **The format toolbar docks along the top of the page column**, `fixed` in viewport
  coordinates (inside the preview's `scale()` it would shrink), `left`/`width` from the
  sheet; the scroller reserves the band (`pt-14`).
- **Dragging grabs a margin grip, not the text.** Dragging a multi-selection member
  carries the whole selection.
- **Pictures resize where they are** (`ResizableBlock`): width is the only output
  (height follows aspect via `applyResizeBlock` — corner handles, not edges); delta ÷
  preview scale; committed once; clamped to the text column.
- **A picture's click target stays mounted while selected** (unmounting let the next
  click fall through and clear `selectedBlockId`); while selected it insets 6px clear
  of the corner handles.
- **Double-clicking a diagram opens the drawing canvas**; `EditorApp` hosts it. Edits
  commit via `replaceBlock` by id.
- **Clicking blank paper clears every page selection.** "Blank" is decided by what the
  click landed on (`isBlankAreaClick`), shared with the marquee. **The exemption list
  must name attributes something renders** — `blankClick.test.ts` greps the components
  for each exempted attribute.
- **Arrow keys nudge a diagram selection** through the same `dragHandles` a drag uses;
  the step is not zoom-scaled.
- **No layout shift while editing**: the in-place editor is a plain **`inline`** field
  (an `inline-block` cannot inherit the paragraph's hanging indent) and must not reset
  `text-indent`.
- **One language at a time** — bilingual halves are separate editable spans.
- **Two-step engagement makes keyboard delete safe**: Delete acts on a deliberate
  selection, ignored while focus is in a field; `⌘Z` scoped the same way.
- **Only one layer owns the keyboard** (`ui/modalLayer.ts`): every keydown listener is
  on `window`, so all fire. Overlays call `useModalLayer()`; page handlers ask
  `isModalLayerOpen()`. A module-level counter, synchronous inside the event.
- **Delete picks the right unit per target** (`describeDelete`, `model/edits.ts`): a
  stem paragraph removes the block; a statement leaves the list; a table cell is
  emptied; an MCQ option cannot be deleted.
- **Selecting a component also selects the item that contains it.** A sub-component —
  an MCQ option, a picture, a table cell — is a *finer* selection, not a different
  one, so `selectOwnerOf` (`Preview.tsx`) points the sidebar at its owning question or
  layout element as the selection is made. Before it, only *typing* pulled the owner
  over (`EditorApp.handleEdit`), so the panel arrived one interaction after the
  selection it describes, or showed the previous question beside the component just
  clicked. The owner is resolved from the **model** (`targetQuestionId` /
  `targetLayoutElementId`), never by walking the DOM for a `data-question-id` — a
  stimulus's blocks nest exactly like a question's. This cannot cost a question its
  Delete: the whole-item handler still stands down for every finer selection, below.
- **The sidebar scrolls its matching control into view.** The page publishes the
  selection as an `editTargetKey` (`store.selectedTargetKey`, mirrored one way like
  `selectedElementId`); each panel control carries the same string as
  `data-edit-target`; `Inspector` finds it and scrolls. **`block: 'nearest'`** — a
  control already on screen must not be yanked, since the common case is a teacher
  working within one question whose fields are all visible. Keys are built from
  **ids, not positions**, or a reordered option would scroll to its neighbour.
- **The finest selection owns Delete.** Four handlers, one per selection — text target,
  picture, table cell, whole item — and the whole-item one is destructive. Clicking any
  component inside a question also selects that question on the way up, so the
  whole-item handler must stand down for **all three** finer selections
  (`if (selectedElement | selectedBlockId | activeCell) return;`), each also a
  dependency. Every window listener fires, so standing down is the only way to yield
  the key; without it Delete took the component *and* the question with it.
  `preview/deletePrecedence.test.ts` holds the chain.
- **The question's own body deselects what is inside it.** The coarser selection
  replaces the finer one, mirroring the layout branch. Before it, a component could only
  be dropped by selecting a *different* one or leaving the question entirely: clicking
  the question's own padding — the gap between two parts, beside a stem — left it
  ringed, the sidebar on it and Delete armed for it. Safe to clear unconditionally
  because **this handler is never reached by a click on a child**: every finer path
  (`InlineEditable`, `ResizableBlock`, a cell's text) calls `stopPropagation` precisely
  so the wrapper owns question selection, and the parent selection a component click
  produces comes from `selectOwnerOf`, not from here. **A table cell is the one
  exception** — it activates in *capture*, on the way down, so a click on its padding
  sets the cell and then arrives here; clearing would undo the selection that same
  click just made. (An *empty* cell has no padding to land on: its field takes the
  whole cell.) `deletePrecedence.test.ts` pins both the clearing and the child
  `stopPropagation` calls the exemption depends on.
- **Everything routes through `commit()`** — undo/redo and autosave with no special
  handling.

**The page rail shows real pages** (`editor/PageThumb.tsx`): each card is a scaled
**clone of the rendered sheet** from `#print-root` (no third render pass), inert
(`cloneNode`, `aria-hidden`). Editing chrome is stripped; selection found by
`aria-current`. Refresh ~200ms after the DOM settles via `MutationObserver`. 152px wide
(at 104px a band's zones read as one clump).

### Layout rules

- **Weight matches consequence**: one `Button`/`IconButton`; `primary` reserved for
  Export, `danger` destructive, `subtle` recedes until hovered.
- **Row actions are progressive**: width goes to the stem excerpt; the rest behind `⋯`.
  Glyph-only buttons take a required `label`.
- **Selection is bidirectional**: either pane selects, the other scrolls into view.
- **Depth is carried by rule and label, not more boxes.**

---

## The per-keystroke render path

Typing commits per input, so the pipeline — `renderWorksheet`, the sheets *and* the
pagination probe — used to run twice per keystroke over the whole document. The pure
walk is not the cost (≈0.5ms at 70 questions); reconciling two full React trees is.
Four rules bound it:

- **`renderWorksheet` caches per question, keyed on the question object** (`WeakMap`).
  Commits replace only the touched object (`mapQuestion`), so identity *is*
  "unchanged". A hit also requires mode, derived number, list stream and leading-gap
  count to match (`renderCache.test.ts`). Identity only, never content: a cold cache is
  byte-identical. Contract: questions are immutable.
- **`ItemBody` is the memo boundary** (`Preview.tsx`): skipped when its nodes array,
  selection, language and `ctxStamp` are unchanged. The comparator ignores ctx/handler
  identity, safe under two contracts: everything ctx closures **read at render time**
  is flattened into `ctxStamp` (a missing value is a silent staleness bug), and host
  handlers close over stable things (`useCallback` over store actions, fresh state via
  `getState()`).
- **Per-frame chrome is imperative, not state**: the marquee rectangle is an
  always-mounted hidden div positioned directly; catch-sets bail to the previous `Set`
  when membership is unchanged; the toolbar dock rect lives in `ToolbarDock`, its own
  component.
- **Pagination re-measures on content and geometry, not selection or drag** —
  selection chrome reserves no space; the probe's `ResizeObserver` catches anything
  that genuinely changes size.

---

## State, persistence and text

### Store (`src/store/worksheetStore.ts`)

Zustand, 100-entry undo. Every mutation goes through `commit(recipe)`: apply, push
`past`, clear `future`. Loading resets history. **Drag gestures commit once**:
in-flight values stay local; the store is called on pointer-up.

### Persistence (`src/storage/index.ts`, `src/model/migrations.ts`)

- `WorksheetStore` interface; localStorage implementation today.
- **Autosave** debounced 1.2s. File download/upload as `.worksheet.json`, images
  base64.
- **The index is what the file list reads**, never the documents. `WorksheetSummary`
  carries optional `questionCount`/`hasCover`; entries are validated **per row** — one
  malformed summary must not empty the list.
- **A rename writes `worksheet.name`** (loads and re-saves), never `title` — see § *What
  a document is called is not what it prints*. It stays a field on the document because
  the index is derived from it, so patching the entry alone is undone by the next
  autosave.
- **A worksheet copy re-ids the document and nothing inside it** (the opposite of
  duplicating a question, where `withFreshIds` must walk the clone).
- **Migration chain** `migrate()`: ordered pure functions, currently empty because v1
  is current — the machinery runs on every load (validation, `__unknown` stashing,
  `normalize` defaulting). Adding a migration = append to `MIGRATIONS` + bump the
  constant.
- **Forward compatibility**: unknown top-level fields preserved in `__unknown`.
- **`KNOWN_KEYS` must list every top-level field** — an unlisted key is stripped into
  `__unknown`: it saves fine and vanishes on reload. A test fails when a populated
  worksheet carries a key the set lacks.

### The published-document promise

**The app is public and schema v1 has shipped.** A document saved by any released build
must keep opening, keep its content, and keep rendering. This outranks tidiness.

| Change | What it costs |
|---|---|
| **Add an optional field** | Free — but add it to `KNOWN_KEYS` |
| **Change a field's meaning or shape** | A `MIGRATIONS` step + version bump, proved against the frozen corpus |
| **Remove a field** | Only by migrating its data elsewhere first |

**The promise covers saved documents, not exported bytes.** Byte-identical export of
untouched documents stays a strong convention (many tests pin it) but is not a
guarantee — changing how an old document *prints* is allowed; breaking *open* is not.

- **A migration step is pure and total** — it may not assume optional structure is
  present.
- **The frozen corpus is the only witness.** `src/test/corpus/v1-published.json` was
  written once by the v1 build and is **never regenerated** — every other schema test
  round-trips a document this build constructed, which cannot catch a migration that
  drops a field. `scripts/emit-v1-corpus.test.ts` runs only when cutting a **new**
  version; a new version gets a new corpus file beside the old.
- **`backwardCompat.test.ts` asserts six things** about the corpus: loads with nothing
  in `__unknown`, keeps every top-level structure, keeps all four block kinds, keeps an
  unmarked sub-part unmarked, loses no authored text, survives load → save → load.
  Verified to bite against a simulated field-dropping migration.

**The index fails independently of the documents.** Storage is two halves — the
document under `econ-worksheet:<id>` and its summary in `econ-worksheet-index` — and
the start screen is the only route in, so a broken index entry leaves a document
intact but unreachable.

- **One damaged entry may not cost the whole list**: entries are judged one at a time
  (an `id` to open and a `title` to print shows the row; undated rows sort last;
  unknown fields pass through). Only an unparseable index as a whole yields `[]`.
- `legacyIndex.test.ts` writes the storage keys as **literals**, deliberately not
  imports — they are the published contract with every browser holding data under
  them.

### Bilingual text (`src/model/text.ts`)

- Every user-visible string is `BiText { en, zh }` of `InlineRun[]`.
- Storage markers: `**bold**`, `*italic*`, `__underline__`, `^{sup}`, `_{sub}`.
- Bilingual mode: both languages share **one paragraph**, separated by soft `w:br` /
  `<br>` — one list number per bilingual unit.
- **Newline is run text**: Shift+Enter is a plain `\n` inside run text. `runLines()`
  splits at the one point it must become markup — a raw newline renders as a **space**
  in `<w:t>` and HTML alike.
- Per-script fonts: every run carries `w:rFonts` with `w:ascii`/`w:hAnsi` +
  `w:eastAsia`.

---

## Deployment

```
Vercel (or any static host): Next.js build → fully prerendered. No API routes, DB, or server runtime.
Desktop:  the same `out/` wrapped by Tauri 2 → signed .dmg (macOS arm64 + x64) and .exe (Windows x64).
Browser:  .docx via JSZip client-side · localStorage autosave · file up/download · PDF via window.print()
```

Nothing in `src/` reads `process.env` or the filesystem at runtime. New on-page chrome
needs `data-print-hide`, or it appears in the PDF.

CI (`.github/workflows/ci.yml`) runs typecheck, tests and build on every PR and push to
`main`. A `v*` tag runs `release.yml`, which builds the three desktop targets into one
draft GitHub Release; `desktop-preview.yml` builds unsigned installers on demand (or on a
PR labelled `desktop-preview`) so a version can be tried before it is tagged. The release
steps and the secrets are in [`RELEASING.md`](./RELEASING.md).

---

## Desktop shell (Tauri)

One codebase, two targets: the desktop app is the *same* static export (`out/`) loaded by
a Tauri 2 webview. There is no desktop-only build of the UI and no second renderer.

**Tauri is never imported at the top level.** A static `@tauri-apps/*` import would land
in the web bundle, where those modules throw on load. Every call goes through a dynamic
`import()` inside a function, behind an `isDesktop()` check — `src/platform/` for file
access, `src/desktop/updater.ts` for updates.

**Documents are files on desktop.** `worksheetStore` is chosen once at load:
`FileWorksheetStore` (`storage/fileStore.ts`) under `$APPDATA/worksheets/` — one
`<id>.worksheet.json` per document plus `index.json` — when `isDesktop()`, else the
`localStorage` store. Both share the per-row index validation (`storage/summaries.ts`);
the file store can also rebuild a lost index by scanning the directory. Saving `.docx`
and `.json` uses the native save dialog on desktop, the browser download on the web.

**Updates** come from GitHub Releases: the app fetches `latest.json` from
`releases/latest/download/`, verifies its signature against the public key in
`tauri.conf.json`, and `UpdateBanner` offers to install and relaunch. GitHub's `latest`
excludes prereleases, so a `-beta.N` tag never reaches a stable install.

**`app.security.csp` stays `null`.** Next's static export inlines its bootstrap scripts;
any CSP without `'unsafe-inline'` blanks the app. Tightening it means nonced scripts first.

**Version** is `package.json`, synced into `tauri.conf.json` and `Cargo.toml` by
`scripts/sync-version.mjs` on `npm version`. **Signing**: macOS is Developer ID + notarised
in CI; Windows is unsigned for now (SmartScreen warns on first run).
