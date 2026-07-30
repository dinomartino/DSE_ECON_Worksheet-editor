# System Architecture — Bilingual HKDSE Economics Worksheet Generator

The deep reference: data flow, the render pipeline, numbering, the diagram model,
pagination and the header/footer geometry. For setup, scripts and a first tour of the
code, start with [`README.md`](./README.md).

**Read this before making structural changes.** It records the *rules* a change has to
keep, and — where a rule is counter-intuitive — the constraint that forced it. The
README's invariants are all explained in full here.

Where this document and the code disagree, the code is right; please fix the document in
the same PR.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router), fully static export |
| UI | React 19, Tailwind CSS 4 |
| State | Zustand 5, undo/redo with a 100-entry history |
| Language | TypeScript strict |
| Export | Raw OOXML via JSZip (hand-built, no `docx` library) |
| Test | Vitest 4 — 407 tests across 20 files, ~1s |
| Runtime | Browser-only: client-side `.docx` generation, no API routes |

## Project structure

```
src/
├── app/          Next.js shell. EditorHost dynamically imports the editor with
│                 ssr:false, because the store is browser-only.
├── model/        types · numbering · marks · migrations · text · page · flow ·
│                 bands · bandSegments · edits · factories · diagram ·
│                 diagramTemplates · diagramDraw
├── registry/     Question-type extension point: types · index · mcq · structured
├── render/       ir (RenderNode + EditTarget) · worksheet (the walker) · diagram (SVG)
├── export/       docx/ (index · body · numbering · styles · runs · package · xml) ·
│                 diagramImage (PNG pre-pass) · clipboard
├── store/        worksheetStore — Zustand with undo/redo
├── storage/      WorksheetStore interface + localStorage implementation
├── components/   EditorApp (shell) · preview/ (the paper, which is the editor;
│                 RichTextEditable + richTextDom are the shared WYSIWYG surface) ·
│                 editor/ (sidebar, rails, dialogs) · ui/ (primitives)
└── test/         shared fixtures
```

Tests sit beside what they test (`model/flow.test.ts`, `export/docx/docx.test.ts`, …).
`scripts/` holds the screenshot harness and the sample-`.docx` emitter.

> **Not in the repository:** development referred to a local folder of HKDSE past-paper
> scans and a school assessment PDF, used to trace diagram templates and match
> header/footer layout. That material is exam-board and school copyright and is
> gitignored. Notes citing "the reference paper" describe what was observed in it, not a
> file you will find here.

---

## The central principle: one IR, three backends

A question type's `render()` emits a **neutral render IR** (`src/render/ir.ts`) once.
Three consumers read the same IR, which is what guarantees the preview and the export
cannot disagree about numbering, ordering or teacher-only filtering.

```
Question ──registry.render()──► RenderNode[] ──┬──► Preview.tsx      (React DOM)
                                               ├──► docx/index.ts    (raw OOXML)
                                               └──► clipboard.ts     (text/html)
```

Data flow, end to end:

```
edit ──► store.commit() ──► React re-render ──► renderWorksheet()
                                                 (computeNumbering + registry.render)
                                                        │
                                                        ├──► preview, live
                                                        ├──► .docx, on Export
                                                        └──► clipboard, on Copy for Word
```

The editor layout the preview sits in:

```
┌────────┬────┬───────────────────────────────┬──────────────────────────┐
│  Add   │Page│          Preview              │ [ Content ][ Edit ]      │
│  Rail  │Rail│   (scales-to-fit A4 sheets)   │  outline / inspector     │
└────────┴────┴───────────────────────────────┴──────────────────────────┘
```

---

## Document model (`src/model/types.ts`)

```
Worksheet
├── schemaVersion              CURRENT_SCHEMA_VERSION = 6
├── id · title · titleFormat? · instructions? · instructionsFormat?
├── fonts: FontPair            { latin, eastAsia }
├── pageSetup?: PageSetup      paper · orientation · margins, all in twips
├── bands?: Band[]             the masthead / title block
├── header? / footer?: HeaderFooter
│     enabled · bands: Band[] · rule? · showOnFirstPage? · firstPage?: { bands, rule? }
├── questions: Question[]      every question, in printed order
│     ├── McqQuestion         blocks · statements? · options · optionLayout? ·
│     │                        answerIndex · marks · explanation?
│     └── StructuredQuestion  blocks · showTotalMarks? ·
│                              parts[ blocks · marks? · answer? · subParts? ]
├── layout: LayoutElement[]    section · heading · text · spacer · divider · pageBreak ·
│                              answerLines · partHeader · labelList
├── flow: FlowItem[]           display order of questions and layout, interleaved
├── createdAt · updatedAt      ISO strings
└── __unknown?                 fields from a newer build, preserved verbatim

ContentBlock = ParagraphBlock | TableBlock | ImageBlock | DiagramBlock
BiText { en: RichText, zh: RichText }        RichText = InlineRun[]
```

**Numbering and marks are never stored.** `computeNumbering()` derives numbers at render
time; `questionMarks()` / `partMarks()` / `sectionMarks()` / `worksheetMarks()` total
marks on demand. That is what makes reordering and undo/redo trivial — there is nothing
to keep in step.

### Document flow (`src/model/flow.ts`)

Headings, notes, ruled answer lines, spacers, dividers and page breaks are
`LayoutElement`s, deliberately outside the `Question` union: they take no number and
carry no marks, so registering them would force numbering and marks totalling to learn
about types that have neither.

`resolveFlow(worksheet)` produces display order under one invariant:

> **`questions` owns question order. `flow` contributes only the position of layout
> elements relative to the questions.**

So reordering a question rewrites `questions`, not the flow — two sources of truth for
"which question is third" would silently disagree. A missing or stale flow costs an
element its *position*, never its existence; ids absent from the flow are appended.

### A section is a marker, not a container

There is **one flow for the whole document**. A `section` is a layout element inside it
carrying `restartNumbering`; the questions it names simply follow it.

Sections used to own their own `questions`/`layout`/`flow`, and that container job was
the source of a class of bugs — a real paper runs Section B on from Section A mid-sheet,
so a sheet shared by two sections had no single owner. Flattening deleted four separate
"which section owns this id?" implementations, reduced `movePage` to one
`moveRunInFlow`, and made an insert a position rather than a guessed container.

Two derivations key on the section element's **id**, not an index, because a marker keeps
its identity when dragged: `computeNumbering` resets the display counter, and
`renderWorksheet` opens a new Word list stream (`question:<elementId>`) so the restart is
native `w:num`.

A section heading and a free heading **render identically** — same style, same
`keepNext`. They differ only in what they mean to numbering, and numbering is derived
before rendering. That is why the v4→v5 flattening left `word/document.xml` byte-identical
for a migrated document. The migration emits one `section` element per old section
followed by that section's resolved items; a section that never had a heading contributes
**no element**, since an empty heading would print a blank line that was never there.

### Constrained layout: bands and zones (`src/model/bands.ts`)

Placement is **slot-based, never free**. A `Band` is one printed row exposing three drop
zones — left / centre / right. A field drags between zones or reorders within one; there
is no arbitrary x/y. That is the point: every arrangement maps onto a single Word
paragraph with tab stops, so what is arranged on screen is what exports.

Zone positions are **fixed thirds** (0, 0.5, 1), not derived from which zones are
occupied, so a centre field is centred on the page rather than on the middle of the
content and does not drift as fields are added.

Two field kinds print a **computed** number: `totalMarks` from `worksheetMarks()`, and
the `partHeader` element's "(19 marks)" suffix from `sectionMarks()`. They are their own
kinds rather than typed text because a stored total goes stale the moment a question is
re-marked.

### A field is authored wording around a derived value

Every `BandField` has the same shape underneath — **authored text · derived value ·
authored text** — and `bandFieldSegments()` (`model/bandSegments.ts`) is the one place
that says so. A plain `text` field is the degenerate case with no middle; "Full marks: 45
marks" has one; "Page 5 of 12" interleaves two.

That decomposition is what makes a computed field **editable**. It previously was not:
`totalMarks`, `fillIn` and `pageNumber` rendered as a dead `<span>`, and the wording
around each number ("Full marks: ", " marks", "分") was a string literal inside
`bandFieldText` — so the row a teacher most wants to adjust was the one row whose text
could not be retyped, sized, coloured or line-broken. The number stays derived; only the
phrasing became `prefix`/`suffix` rich text. A `fillIn` was worse than inert: it emitted
an `EditTarget` while `patchBandFields` wrote only `kind === 'text'`, so typing into it
appeared to work and was silently discarded.

Four consequences:

- **`bandFieldText` composes, never respells.** It concatenates the segments, so the
  string form and the editable form are the same decomposition and a retyped prefix
  reaches the `.docx`, the clipboard and the preset thumbnails for free.
- **The `.docx` walks segments too**, so only an actual placeholder becomes a native
  `PAGE`/`NUMPAGES` field and the authored wording around it stays ordinary runs. Both
  backends read one answer to "which characters are authored".
- **A `bandField` target names a `side`.** Selecting "Full marks: " must not also select
  " marks", or the toolbar could not bold the label alone. Omitted `side` means `prefix`,
  so a `text` field is all prefix and older targets still resolve.
- **Segments are not separate cells.** A `ColumnsNode` cell *is* a tab stop, so splitting
  a field across three would emit a `w:tab` between each fragment and scatter it across
  the row. They ride as `parts` inside one cell.

Two things fail silently if got wrong, both of which did:

- **The wording carries its own spacing.** "Full marks: " ends in a space and " marks"
  opens with one; as separate DOM nodes, HTML collapses both at the inline boundary. Both
  band paths set `whitespace-pre-wrap`, or the page reads "Full marks:45marks" while the
  `.docx` — which writes `xml:space="preserve"` — spaces it correctly.
- **An empty side is an affordance, and affordances print.** A `pageNumber` ships with no
  wording, so both its sides render a `+` inviting some; unmarked, that `+` appeared
  beside every page number in the PDF. It takes `data-print-hide`, deliberately *not*
  `data-empty-placeholder` — that hides the prompt but keeps the box, which is right for a
  whole paragraph and wrong for a fragment, where the reserved box opens a gap mid-phrase.

The v5→v6 migration writes the old hardcoded spelling into `prefix`/`suffix`, so a
migrated document prints exactly what it printed before. Its defaults are inlined rather
than imported from `DEFAULT_FIELD_WORDING`: `bandSegments` reaches `factories` through
`page`, and `factories` imports `migrations`, so the import would close a cycle — a test
asserts the two spellings agree instead.

### One row, many uses: `ColumnsNode`

`ColumnsNode` is the single IR primitive behind every side-by-side layout — band zones,
inline MCQ options, the label-list element. It exports as **one paragraph with tab
stops**, never a borderless table: a table is still a table to edit in Word and cannot
sit inside a numbered list item. Cell positions are fractions of the row's own width
(after `indent`), so all three backends use them directly and they stay correct when
paper size or margins change.

Inline MCQ options pay for this: one paragraph cannot carry four list numbers, so their
`A.`–`D.` markers become literal text. Stacked options — the default — keep native
`w:num`.

### Per-element formatting (`TextFormat`)

Named styles supply every default; `TextFormat` records **only the deltas** a teacher
chose, and all three backends apply it as direct formatting on top of the style. So a
document that never touches formatting exports byte-identically to the style-only
baseline, and a later change to a style still reaches everything that did not override
it.

Formatting attaches to whole elements, never to one language side: a bilingual heading is
a single Word paragraph, so per-side sizes could not be exported faithfully.

### Per-run formatting (`InlineRun`)

`TextFormat` overrides a whole element; an **`InlineRun` overrides a stretch of
characters**. A `RichText` is an array of runs and each carries its own `fontSize`,
`color` and `fonts` alongside bold/italic/underline — mirroring `w:r`/`w:rPr`, so one
paragraph exports as several runs with different properties and a stem can hold a 14pt
bold phrase inside ordinary body text.

Three layers compose: named style → element `TextFormat` → run. Flags **or** with the
element (an element set bold means every run is bold, and nothing in the UI offers
un-bolding one run); size, colour and fonts **replace** it, since a run carrying one is
precisely a request to differ.

`applyRunFormat(runs, start, end, patch)` (`model/text.ts`) is the whole mechanism: it
splits runs at both offsets, patches the covered ones, and `normalizeRuns` merges
identical neighbours back. Without that merge the runs only ever fragment — bolding a
word and unbolding it would leave three runs where there was one. A `null` in the patch
**clears** an attribute; `undefined` cannot, being indistinguishable from "not mentioned"
once spread over a run.

### The editing surface renders runs, not markers

`**bold**`, `__underline__` and `^{sup}` are a **storage** form — what `serializeRuns`
produces so a run array can round-trip through a plain string. They are not a thing to
type at, and every editing surface (`components/preview/RichTextEditable.tsx`, shared by
the page's `InlineEditable`, the sidebar's `BiTextField` and the table cells) renders the
runs *as themselves*: a bold run is bold, a 14pt red phrase is 14pt and red. Teachers
were previously shown `her **opportunity cost** of choosing…` mid-sentence and asked to
infer what it meant.

That is not only cosmetic — a textarea can hold only a string, and the string is lossy:

- **`serializeRuns` spells five flags and nothing else.** Size, colour and fonts live on
  the run, so `parseRuns(source)` rebuilt runs that had lost them. A 16pt phrase applied
  from the toolbar therefore survived only until the field closed. Reading the DOM back
  reads *attributes* (`data-run-attrs`), so every attribute survives an arbitrary edit.
- **Offsets needed translating.** A textarea's offsets counted marker characters the
  model has no idea about, so a selection had to be discounted through
  `sourceOffsetToText` before it could be formatted. Offsets in the DOM surface are
  already plain-text offsets — the model's own coordinate space — so there is nothing to
  translate and nothing to get wrong. (`sourceOffsetToText` survives for the marker
  string's remaining non-editing uses.)
- **There is no second copy of the text.** The draft/flush/re-sync dance existed only to
  keep a string in step with the runs while both were live; with one representation, the
  class of staleness is gone.

Four rules this surface has to keep, each of which failed silently when it did not:

- **A contenteditable is an *uncontrolled* input.** The browser writes into it directly,
  so React owns only *whether* the element exists — the runs are painted imperatively
  (`runToNode`). Rendering them as JSX children makes React reconcile the very nodes the
  browser is mutating: every keystroke re-inserted the whole accumulated string, so
  typing "Based" produced `BasedBaseBasBaB`.
- **The field's own echo must not repaint it.** Typing commits to the store, and the
  store hands the same value straight back down. `paintedRef` + `sameRuns` recognise that
  round trip and leave the DOM alone, so only a *genuine* outside change — the toolbar
  applying bold — repaints, and only then is the caret restored by offset.
- **Typing is left to the browser.** `onBeforeInput` intercepts only when a *pending*
  format is waiting ("bold on, then type", which has no run for the browser to continue);
  everything else is native, which is what keeps IME composition, autocorrect and undo
  working. Paste is the other exception, forced to plain text so a web page's fonts and
  colours cannot ride onto the sheet.
- **The toolbar reports the selection, not the element.** Merging the element's format
  underneath inverted a click: the Title style is bold, so the bar read `bold: true` for a
  selection carrying none and sent "clear bold" instead of "set bold". Choosing a font
  size also blurs the field (the bar exempts form controls from its `preventDefault` so
  the native popup can open), so the blur handler ignores focus moving into
  `[role="toolbar"]`.

`replaceRichTextRange(runs, start, end, insert, fallback)` in `model/text.ts` is the edit
primitive underneath: inserted characters inherit from the run on the **left** of the
caret (then the right, then the caller's fallback), which is what continues a bold phrase
you are typing inside — the same rule Word follows.

---

## Render IR (`src/render/ir.ts`)

```
RenderNode = TextNode | ColumnsNode | TableNode | ImageNode | DiagramNode
           | PageBreakNode | SpacerNode | DividerNode | AnswerLinesNode

TextNode
  style: NodeStyle    one of 14 named styles
  text: BiText
  listRef?  { stream, definition: 'question'|'option'|'statement', level, marker }
  marks?    trailing "(4 marks)"          keepNext?   teacherOnly?
  indent?   extra left indent, twips      format?     TextFormat overrides
  edit?     EditTarget — the model address this text came from
```

`EditTarget` is a discriminated union always keyed by **id**: `worksheetTitle`,
`worksheetInstructions`, `blockText`, `blockCaption`, `tableCell`, `mcqOption`,
`mcqStatement`, `mcqExplanation`, `partAnswer`, `subPartAnswer`, `layoutText`,
`bandField`, `labelListCell`. A section heading has no target of its own — it is a layout
element, so `layoutText` reaches it.

Two rules about `edit`:

- **It is inert in export.** The `.docx` and clipboard backends never read it, so adding
  it left exported files byte-for-byte identical.
- **Derived text carries no target** — marks totals, the "Answer: C" line, the number
  inside a band field. It is computed rather than stored, so typing over it would have
  nowhere to go. The authored wording *around* such a number is a different thing and does
  carry one (§ a field is authored wording around a derived value).

`listRef.stream` is the key connecting IR nodes to `.docx` `w:num` instances: each
distinct stream becomes one `w:num` in `numbering.xml`.

---

## Numbering (`src/model/numbering.ts` + `src/export/docx/numbering.ts`)

**Derived, app-level.** `computeNumbering()` walks the one resolved flow and returns a
`NumberingPlan`. Numbers are 1-based and continuous until a `section` element sets
`restartNumbering`. Walking the *flow* rather than a nested section list is what makes
the restart happen where the heading actually sits — drag a section marker above question
3 and the questions after it renumber, with no container to move anything between.

**Native, in OOXML.** Three abstract multilevel definitions:

| Abstract | Used for | Levels |
|---|---|---|
| 0 | questions | `1.` decimal → `(a)` lowerLetter → `(i)` lowerRoman |
| 1 | MCQ options | `A.` upperLetter |
| 2 | statements | `(1)` decimal |

Each IR stream gets a concrete `w:num`. Options and statements get one `w:num` per
question with `w:startOverride`, so lettering restarts at A. A section restart creates a
new `w:num` on the question stream, so Word restarts at 1 natively.

---

## Export pipeline

### `.docx` (`src/export/docx/`)

| File | Responsibility |
|------|---------------|
| `index.ts` | Orchestration: render IR → collect and decode images → build parts → zip |
| `body.ts` | Body XML: paragraphs, `w:tbl`, `w:drawing` |
| `numbering.ts` | `numbering.xml`: abstract defs + per-stream `w:num` with overrides |
| `styles.ts` | `styles.xml`: the 14 `NodeStyle` paragraph styles plus `AnswerLine` |
| `runs.ts` | Run-level OOXML: `w:rFonts` (Latin + East-Asia), `w:r`, bilingual `w:br` |
| `package.ts` | OPC package: content types, rels, header/footer parts, `sectPr`, settings, font table, JSZip assembly |
| `xml.ts` | Escaping, illegal-character sanitization, attribute builder |

### One fixed line, no paragraph spacing

Every paragraph is set on a **fixed 12pt line** (`w:line="240" w:lineRule="exact"`) with
`w:before` and `w:after` of **zero**. This is the reference paper's model, taken
literally: 275 of its 296 paragraphs carry exactly that spacing over a "No Spacing"
style, and 102 of them are empty. All of its vertical rhythm comes from the line box;
none comes from paragraph padding.

Four consequences, each of which fails silently if broken:

- **Separation costs a line.** With no `w:after` anywhere, the only way to open air is to
  spend a blank 12pt line on it. `blankLine()` in `render/ir.ts` is that one line, and
  every gap on the page goes through it: `ITEM_GAP` in `render/worksheet.ts` separates
  each top-level item (a heading from what precedes it, a question from the question
  before it), and the question types use the same helper for the gaps *inside* a
  question. This is why the gap is an IR node rather than a style property — the preview,
  the `.docx` and the clipboard then space everything identically for free.

  The reference's sub-unit rhythm, which the question types reproduce exactly: **stem →
  blank → the (1)(2)(3) statements → blank → the A–D options**, and **stem → blank → (a)
  → blank → (b) → blank → (i)**. An MCQ with no statements gets only the stem's blank, or
  the gap before its options would double. The between-item gap lives in the walker
  rather than in a question type because it belongs to the *boundary*: a type appending
  its own trailing gap would double against the next item's and leave a stray blank at
  the end of the document.

  **A gap counts what is already there.** Because separation *is* a spent line, anything
  else that spends one at the same boundary makes the gap double. Text ending in a
  trailing hard break (Shift+Enter) prints its own blank line, so a separator pushed after
  it put the next part two lines down while its neighbours sat one — a difference with no
  visible cause in the document. `pushGap()` and `endsInBlankLine()` in `render/ir.ts` are
  the one rule: push a blank line *unless* the stream already ends in one, counting both
  an explicit `blankLine()` and a text node whose own last line is empty. The break still
  prints; it counts as the gap rather than adding to one. Every gap site goes through it —
  the walker's `ITEM_GAP`, the part and sub-part separators, the MCQ stem and statement
  gaps. `endsInBlankLine` is deliberately **language-neutral**, testing both sides: one IR
  feeds all three backends, so a per-language gap would make the preview and the `.docx`
  disagree about the document's height, and the paginator measures these boxes.

  **The gap is suppressed only at the true top of the page**, not at flow index 0. The
  masthead bands, the title and the instructions all print *above* the flow, so a section
  sitting first in the flow usually has a title directly over it and needs its gap like
  any other heading. Keying on the index alone made the same element space differently
  depending only on position — "Section A" printed tight under the header rule while an
  identical "Section B" had air above it, and the gap reappeared the moment anything was
  dragged in front of the section, so the cause looked like unrelated content.
  `somethingAboveFlow` in `render/worksheet.ts` is that test; a genuinely bare page still
  spends no line, where a gap would only shift the top margin.
- **`exact` does not grow.** Unlike `atLeast`, an exact box clips text too tall for it
  rather than expanding — which is what keeps a bilingual page on one rhythm regardless
  of CJK glyphs, superscripts and inline images. The cost is that any larger size needs a
  larger box, so `exactLineFor()` scales one from the 11pt/12pt base and the title and
  section-heading styles take theirs from it.
- **Every style states its own metrics.** Word merges `w:spacing` as a whole element, not
  attribute by attribute, so a style setting only `w:before`/`w:after` would be relying on
  the inheritance chain to supply `w:line`. Direct formatting has the same hazard, which
  is why `formatParagraphProps()` restates the line whenever a teacher overrides spacing
  or font size.
### A numbered paragraph indents as a block, not by its first line

Word's list geometry is `w:ind` `left` + `hanging`: the paragraph's text column sits at
`left`, and the **marker alone** is pulled back by `hanging` into the margin. Every line
— wrapped lines and lines after a hard break alike — starts at `left`. The reference
paper prints exactly this: a stem's second and third lines sit flush under its first
word, with only the number out in the margin.

The preview expressed it as `padding-left: 18pt; text-indent: -18pt`, which is a
*different* shape. CSS `text-indent` moves the **first line only**, so line 1 began 18pt
left of every other line — on a real question that reads as "the second line is indented
to the right", and it disagreed with both Word and the paper.

The marker is drawn **absolutely positioned** at `left - hanging`: taking it out of the
flow moves the number alone, where an in-flow marker has to be pulled left by
`text-indent` and drags its whole line with it.

**Each level's marker starts where its parent's text starts.** `1.` hangs in the margin
with the stem at 360; `(a)` begins *at* 360 — under the stem's first word, not under the
`1.` — with its own text at 720; `(i)` begins at 720, under part (a)'s text. So
`left - hanging` at each level equals `left` at the level above, and a part reads as a
continuation of its stem rather than as a separate indented block. Levels 1 and 2 were
one full step too deep (1080 and 1980), which started a sub-part a third of the way
across the column and wrapped long parts well before Word did.

`QUESTION_LIST_INDENTS` in **`model/numbering.ts`** is the one definition. Three
consumers read it and none may import the others: `export/docx/numbering.ts` writes it
into `w:ind`, `Preview.tsx` lays the paper out with it, and `registry/structured.ts`
indents a part's *continuation* paragraphs (`PART_TEXT_INDENT` / `SUBPART_TEXT_INDENT`)
to line up under its first one. `model/` may not import `export/` and neither may the
registry, so the constant sits below all three. Getting one copy out of step is silent:
the preview paginates on geometry Word will not reproduce, so page breaks land in
different places on screen and on paper.

The style classes must add **no margin of their own**. `Sub-question` and
`Sub-sub-question` carried `ml-6` / `ml-12` *on top of* that padding, so every part was
indented twice — once by the numbering the export uses, again by a class the export knows
nothing about.

- **The preview pins the same numbers.** `.paper` sets `font-size: 11pt` and a fixed
  `line-height: 12pt`, with zero paragraph margins, mirroring the exporter. Left to
  inherit the app shell's 16px and its ~1.5 leading, the preview packed roughly a third
  less onto a sheet than Word did and every page break landed early — the paginator
  measures these boxes.

### "(4 marks)" sits on the last line with text

A part's marks sit at the right-hand end of its **final** line, dropping to a line of
their own only when that line leaves no room. The `.docx` gets the position from a
right-aligned tab stop at the content edge: a `w:tab` run *after* the text, so the marks
flow to the end of the paragraph and land on whichever line that turns out to be. A tab
stop reserves nothing on the *other* lines, so the body text must wrap exactly as it would
with no marks at all — the paginator measures those boxes.

**No CSS property expresses that**, and the preview has been wrong three times reaching
for one:

- **`float: right` is placed on the first line with *room*, not the last.** A float is
  positioned when a line box is built and never participates in inline layout. Emitted
  *before* the text it attached to the first line and shortened it, wrapping the stem
  earlier than Word. Emitted *after* the text it still failed whenever the last line's
  remaining width was narrower than the label: the float dropped down, and being out of
  flow it did not grow the paragraph, so the marks printed into the **next** paragraph's
  12pt box and overprinted it. That depends on the tail's length, which is why it read as
  intermittent.
- **`text-align-last: justify`** stretches the body text's word spacing, and a full-width
  flexible gap wraps to its own line regardless.

So reserving the room and placing the label are **separate**, and the reserve *is* the
label (`MarksTrail` in `Preview.tsx`):

- An **invisible twin** of the label rides inline at the end of the text. Being in flow it
  shortens only the line the text actually ends on; being the label itself it reserves
  exactly the right width at any font size, with nothing to measure or keep in step. A
  fixed-width shim cannot do this — where the shim fits but the label does not, the two
  overprint.
- The **visible copy is pinned `bottom: 0; right: 0`**. The paragraph's last line is its
  bottom, so it lands there at any height, right-aligned at the content edge like the tab
  stop. (The paragraph is already `relative`, for the list marker.)

**A trailing hard break is a blank line the marks must not hang on.** Text ending in
Shift+Enter has a real empty final line — it prints, and dropping it would change the
document — but `bottom: 0` is *that* line, so the label appeared below the part rather
than on it. Word had the same fault from the same cause: the tab run came after the
trailing `<w:br/>`. `trailingBlankLines()` in `model/text.ts` counts them for both
backends, which is why it is shared rather than derived twice — the page and the `.docx`
must choose the same line. The preview lifts its label by that many `lh` (resolving
against the element's own line-height, so it stays right on the styles that scale their
exact line box), and the exporter **moves the trailing breaks after the marks** so the
label joins the last text line and the blank lines follow. `marksAnchorRuns()` picks which
side to count in bilingual mode: Chinese renders last, falling back to English when there
is no Chinese, or an untranslated part would count zero blank lines while the page shows
them.

Two residual limits, both deliberate:

- The reserve can only ride at the **end of the inline flow**, because the text belongs to
  a contenteditable and a sibling injected inside it would put React in charge of nodes
  the browser mutates. So with trailing breaks the reserve lands on the blank line. It is
  harmless there, but it means a *hard-broken* final line already reaching the right edge
  can still be overlapped — and Word is in the identical position, since a tab stop cannot
  push a line a `w:br` has already ended. Matching that is the point: the preview must not
  invent a wrap the `.docx` will not reproduce.
- Both copies are `whitespace-nowrap`, so neither splits "(4" from "marks)".

A one-line part looks correct under every one of these schemes, which is why the bug
survived so long: it only shows on a part long enough to wrap, or one ending in a break.

`BAND_ROW_TWIPS` in `model/page.ts` is the same 240tw, since a band row is one paragraph
in that same box. It is duplicated rather than imported (`model/` must not depend on
`export/`) and a test asserts the two agree.

### Answer lines are a style, not direct formatting

A ruled answer line is an empty paragraph with a bottom border, and two things about that
are invisible until a real page prints:

- **Word collapses consecutive paragraphs sharing one border set** into a single bordered
  block, drawing the rule once, under the last paragraph. The `AnswerLine` style
  therefore declares both `w:between` (every interior boundary) and `w:bottom` (closing
  the last), which rules N lines at any N. Emitting one `w:p` per line was never the bug
  — a test counting those paragraphs passed while the page showed one rule, which is why
  the regression guard asserts the *border*.
- **An empty paragraph is only as tall as its line height**, which is not a writing line,
  so the style sets an exact 24pt height. Trailing `w:after` space would fall *outside*
  the border — a hairline with no room to write on.

Both live in a named style rather than direct formatting: Word flags a directly-formatted
paragraph in the left margin, and forty of them read as editing chrome rather than as a
page to write on. It is also restylable from Word's gallery in one edit.

`AnswerLine` is deliberately **not** a `NodeStyle`. That union is the IR's shared
vocabulary and all three backends must understand every member, but a paragraph border is
a Word concern the preview and clipboard each draw their own way (`border-bottom`, an
`<hr>`) — and `AnswerLinesNode` carries no `style` field at all.

### Clipboard (`src/export/clipboard.ts`)

Same IR; writes `text/html` + `text/plain` via `ClipboardItem`. Numbering becomes literal
text, since clipboard HTML cannot carry Word numbering definitions. It deliberately
carries **no page setup or headers**: pasting into an existing document must not override
that document's own.

---

## Diagrams

### Geometry in, one image out (`model/diagram.ts`, `render/diagram.ts`)

Economics papers draw the same handful of shapes every year. A `DiagramBlock` models
exactly that vocabulary in a **unit coordinate space** (x and y in 0..1, origin
bottom-left) rather than being a free drawing surface, which is what lets one stored
diagram render crisply at any size — and keeps it re-labellable a year later instead of
frozen into a bitmap.

Export flattens it to **exactly one image**:

```
Diagram (geometry) ──► diagramSvg() ──┬──► preview: live inline SVG
                                      └──► rasterize @3x ──► one PNG
                                                              ├──► .docx: one w:drawing
                                                              └──► clipboard: one <img>
```

Word gets a raster because its SVG support varies by version and platform, and because
one image means Word treats the diagram as a single object rather than a group of shapes
a stray click can pull apart.

Rasterizing needs a canvas, so it is the one genuinely browser-only, async part of
export. It is factored out as a pre-pass (`export/diagramImage.ts`) returning a plain
`Map<blockId, pngDataUrl>`, which lets `buildParts` and `worksheetClipboardHtml` stay
synchronous and unit-testable. With no map — a non-browser runtime — a diagram emits **no
drawing at all**, rather than one pointing at a missing relationship, which Word would
report as a repair error.

Three renderer rules that only show up on a real page:

- **Axis titles are laid out outside the plot**, so right-hand padding is sized from the
  title's own estimated width and capped at `MAX_X_TITLE_SHARE` (35% of the canvas). A
  flat reserve made a short title like "$" cost 29% of the canvas and pushed the plot box
  well left of centre; capping alone re-clips long titles; sliding a long title back from
  the edge draws it on the arrowhead. So `axisTitleAnchor` clamps the title inside the
  canvas but never left of the arrow tip. The clamp lives in `axisTitleAnchor`, not in
  `diagramSvg`, because `DiagramCanvas` builds the title's drag handle from the same call.
- **In bilingual mode a label whose two sides are identical prints once** — "AD" and "E₀"
  are symbols, not prose, and stacking them prints each curve's name twice.
- **A point's label defaults to `right`, not `upRight`.** A marked point is nearly always
  an intersection, so the diagonal above-right is exactly where the *other* curve runs.

`DIAGRAM_TEMPLATES` (`model/diagramTemplates.ts`) ships nine starting shapes: blank,
supply-demand, demand-shift, AD-AS, money market, tariff, import quota, proportional tax,
PPC. A template is only an initial value — it produces plain geometry with fresh ids, and
nothing downstream ever looks the template up again.

### Drawing (`model/diagramDraw.ts`, `components/editor/DiagramCanvas.tsx`)

A diagram has **two editing surfaces over one geometry**: the sidebar panel types
coordinates as percentages (exact placement), and **Draw** opens a full-screen canvas
where the same elements are dragged (quick placement). A hand-drawn curve is the
identical `DiagramCurve` the panel would have produced, so either can refine the other's
work. That is the payoff for storing geometry rather than strokes.

The canvas draws its handles as a separate `pointer-events-none` SVG layered **over** the
real one, so the geometry underneath stays byte-identical to what exports — the same rule
`EditTarget` follows in the IR.

Load-bearing rules:

- **The projection is shared, not re-derived.** `diagramPlot()` returns the very
  projection `diagramSvg()` uses, including the inverses `ux`/`uy`. Plot edges move with
  the axis titles, so a canvas that recomputed them would drop a point where the renderer
  then draws it elsewhere. The same applies to text: `curveLabelAnchor`,
  `pointLabelAnchor`, `arrowLabelAnchor`, `axisTitleAnchor` and `axisTickAnchor` are
  exported from the render module and fed to `hitTest` as `LabelAnchor[]`.
- **Gestures replay from the geometry captured at pointer-down**, never the latest state,
  so a drag is one idempotent transform rather than an accumulating one.
- **A drag lets go of what it moved.** Pressing arms a gesture; geometry is written only
  past a ~4px threshold; on release a single dragged element is **deselected**. Before
  this, a click meant to inspect a curve nudged it, and an element stayed armed after its
  own drag so reaching for the next shape moved the previous one. Exempt: a
  **multi-element** selection survives its drag, and **shift-click** toggles membership
  without arming a move.
- **Cursors are bucketed in screen space.** `cursorFor` picks `grab`/`grabbing`, a resize
  arrow oriented along the segment an endpoint would stretch, or `move`. Unit y grows
  upward and screen y downward; getting that negation wrong swaps the two diagonals —
  invisible on an axis-parallel line, wrong on every supply curve.

Hit-testing prefers **handles over bodies** and, among bodies, the topmost; text competes
with vertices on distance and both beat whole bodies, or a curve's name — drawn right
beside its line — would be unreachable. Snapping catches curve intersections and existing
marked points, because the coincidences in a DSE diagram are meant to be exact; it stores
nothing, only deciding where a point lands. `pointAt()` guards the one hazard snapping
creates: a new point aimed at an already-marked intersection would stack pixel-perfect on
the existing dot, invisible and unclickable, so it selects the existing point instead.

**Selection is a set.** Marquee (`selectWithin`) catches only elements **fully** inside it
— a demand curve spans the plot, so partial overlap would make every box catch every
curve. A plain click on something already selected keeps the whole selection, and a
multi-element drag never snaps, since snapping the anchor would teleport the group.

`⌘C`/`⌘V`/`⌘X`/`⌘D` use a **canvas-local clipboard** (`DiagramClip`), not the system one:
geometry has no sensible text/plain form and reading the system clipboard prompts for
permission mid-drawing. `pasteInto` re-ids and offsets, so one clip pastes repeatedly
without collision, and paste selects what it created — which is what makes copy → paste →
drag the natural way to build an "S₁ → S₂" shift.

The stage renders at a **zoom multiple** of the stored size (default 2×). Zoom scales
only what is displayed: `toUnit` divides the pointer position back out and handle radii
divide by it too. Stored geometry never sees it, asserted by comparing rendered path data
across a zoom change.

### Every label moves, and stays attached

All seven kinds of diagram text drag: free labels, curve names, point names, arrow
labels, a point's two axis tick labels, axis titles and axis ticks. Only the free
`DiagramLabel` stores an absolute position. **Everything else stores an offset from its
own anchor** — `labelOffset` on a curve/point/arrow, a scalar `offset` on a tick,
`titleOffset` on an axis — so re-dragging a supply curve carries its "S" along.

Three constraints follow:

- **A drag accumulates the pointer delta onto the offset**, never snapping to the
  pointer, or an absolute drop would teleport the label to the cursor on the first pixel.
- **Tick labels slide along their own axis only** — one scalar, not a point — since a
  tick off its axis stops lining up with the drop-line that makes it read as a tick. The
  cursor (`ew`/`ns`) advertises the constraint before the drag.
- **Axis titles nudge inside the room already reserved for them**, per the clamp above.

A point label is the one place two positioning systems coexist: the eight compass slots
(`labelSide`) are what templates ship and the sidebar restores, and a free drag writes a
`labelOffset` that **supersedes** the slot. Picking a side again clears the offset;
`ResetLabelPosition` does the same for every other kind, since an offset is otherwise
invisible in the sidebar.

Deleting anchored text deletes the **text**, never its anchor — removing a whole supply
curve because its name was selected would be a destructive surprise. Copying takes the
whole anchor, for the same reason a `vertex` handle does.

---

## Pagination and pages

### A page is derived, and owns the break that made it

There is no `Page` in the model. A page is whatever the paginator measured onto one
sheet, so every page-level action must be expressed in ids the store understands. The
measuring half lives in the component (heights come from a real layout); the *deciding*
half is pure and sits in `components/preview/pagination.ts`, which is what lets the break
rules be tested without a DOM.

- **A manual break belongs to the page it opened.** It consumes no space and is never
  packed onto a sheet, but it is the element that put the sheet there. Leaving it out of
  `PageComposition.flowIds` made every page action operate on a page's content while its
  own break stayed behind — moving a page collapsed it back on the next repagination,
  deleting one left a blank page appearing from nowhere, and an empty page had no id to
  be dropped onto. The break therefore *leads* `flowIds`, matching its position in the
  flow so a moved run reads in document order. Only the delete dialog's item count
  subtracts it again.
- **A trailing empty page survives only if a break opened it.** The two cases pack
  identically and mean opposite things. Incidental slack is dropped, since Word emits no
  sheet for it and the preview would disagree with the export about the document's
  length. A page the teacher *added* is kept — "New page" that visibly changes nothing
  reads as "not inserted", and the response is to add it again. It renders a `BlankPage`
  affordance: it says it is empty on purpose, accepts a dragged item (landing it *after*
  the break) and offers the add buttons.
- **Consecutive breaks each open their own page.** Testing "does the current page hold
  content" treats an already-empty page as room to reuse, which collapses a deliberate
  blank page and drops the second break's id, leaving that sheet unnamed and so unmovable.

`movePage` is one `moveRunInFlow`. It was the hardest action in the store while sections
were containers; with one document-wide flow, a page is just a run of ids — which is what
the rail always believed it was handing over.

### A drop target receives the run, not the grabbed id

Dragging a member of a multi-selection carries the whole selection (§direct
manipulation). That rule lives in the *drag*, so every target has to honour it, and a
target cannot re-derive the selection for itself — which is why `onDragItemChange`
publishes `string[]`, the run resolved once at the source. Publishing the grabbed id
alone let the page rail move one item out of a swept five, silently discarding the
sweep; the same bug sat in the `BlankPage` drop target. Both now route through
`movePage`, so a bulk drop is one commit and one undo entry.

`dropRunAnchor()` (`preview/pagination.ts`) decides where a run dropped on a rail card
lands: after the target page's last member that is not itself moving. A card is one
target with no meaningful "between" — the thumbnail shows content, not gaps you could
aim at — so the end of the page is the only position it can name. It returns nothing
when the run already *is* that page's tail, so an accidental release costs no undo
entry. It is pure and lives beside the break rules for the same reason they do.

**The first sheet is the one destination no anchor can name.** Nothing precedes it, so
it can never carry a page break, and once its content is dragged away it has no members
either — it then reads as `structuralOnly` with no `breakId`, exactly like a
masthead-only page, and the rail's `isActionable` refused it. That made emptying page 1
permanent: the content was gone and the only route back was a card that no longer
accepted drops. Receiving is therefore a weaker test than acting (`canReceive`), because
the destination is *positional*: `moveToDocumentStart` orders the run before the first
item that is not itself moving, needing no id to act on at all.

### The outline groups by page (`editor/Outline.tsx`)

A page break as an ordinary outline row is a faithful description of the model and a poor
description of what a teacher made: they added a page. `groupByPage()` cuts the resolved
flow into the sheets the paginator reported and promotes the break out of the list to
become the **tab heading** of the run it opened; its menu deletes the page.

Two properties follow from a page being measured, not modelled — and are why this is a
view over `resolveFlow` rather than a container in the document:

- **A group is a result, not a promise.** Dropping a question into a full page pushes
  what no longer fits onto the next one. Nothing pins a group; they re-cut on the next
  measurement.
- **A section can begin mid-sheet**, as every real paper does. Groups are the top level
  and a section heading is a row *inside* one, so one sheet is one group. Nesting groups
  inside a per-section loop drew a shared sheet twice, each copy holding half the page and
  offering its own drop targets.

Tabs are collapsible and **open by default** — a grouping nobody has seen before must not
start by hiding what it groups. Items not yet placed by a composition fall into a
trailing unnumbered group, so a new question stays visible for the frame before
pagination catches up. An added-but-empty page has no items for the run-based cut to
find, so it is inserted at the position its break occupies; dropping on any tab lands the
item at the **head** of that page, the one position the rows underneath cannot express.

---

## Page setup, headers and footers (`src/model/page.ts`)

Paper, orientation and margins are stored in **twips**, so the exporter writes them
straight into `w:pgSz` / `w:pgMar` and the preview converts the same numbers to
millimetres — the previewed text column is the one Word will use.

`MARGIN_PRESETS` are labelled in centimetres but stored in twips, and a test asserts each
label matches its stored value. **Custom…** reveals four per-edge cm fields clamped to
0–5 cm, starting from the current geometry. Each commits on blur/Enter (one edit, one
undo entry) and holds a local draft string while focused — re-deriving the text from
stored twips would delete the decimal point the moment it was typed.

Headers and footers are **lists of `Band` rows**, the same model the masthead uses. One
row was not enough: a real school header stacks five. Reusing `Band` means one editing
surface (`BandEditor` serves masthead, header and footer), one drag-between-zones
interaction and one exporter path.

### A header lives in the margin, not in the text column

Word grows a header **downward from `w:header`** and pushes body text down only once it
passes `w:top`; the footer mirrors this. A header's room is therefore `top - header`.

`headerFooterOffsets()` derives the offset from what the bands contain — but **only when
they do not already fit**. Word's 1.27 cm default is what a header is expected to look
like; a header moves only if it is too tall for the room under that default, then only as
far as it needs, clamped at `MIN_EDGE_TWIPS` (284 tw, 0.5 cm) so a band is never placed
in the printer's dead zone. Computing `margin - height` unconditionally flattens even a
one-row header against the paper edge.

**Offsets are sized from the running rows, not the taller of the two lists.** One
`w:header` serves the whole section, so a document whose page 1 carries a five-row cover
over a one-row running header cannot give each its own offset — and taking the max lets
the cover squash every *other* sheet. The running rows print on nearly every page, so
they shape the margin; page 1's cover hangs further down and takes its overflow as extra
padding **on page 1 only** (`pageStyleFor`), which is why the preview's padding is
per-sheet.

**Word gets an estimate; the preview measures.** `bandsHeight()` estimates from the
~264tw line box an 11pt run occupies, scaled by any font size a field sets, since 14pt
title rows are exactly what makes a header overflow. That is correct for Word, which lays
the rows out itself. The preview has a DOM, so it measures the real boxes through a
`ResizeObserver` (`measuredFirst` for page 1) and falls back to the estimate only before
first layout — a guess even slightly short reports no overflow while the browser draws
the rows tens of pixels taller.

**Overflow moves the text column; it does not merely shrink its budget.** Subtracting the
total from `contentHeightPx` alone made the column shorter without moving its top, so a
tall header printed *over* the first question. The two edges are kept separate and added
to the padding: the header's overflow moves the top down, the footer's moves the bottom
up, which is what Word does. Page 1's overflow is computed against `edgeOffsets` — the
offset page 1 is actually drawn at — rather than one re-derived from its own height,
since `bandsOverflow` recomputes the offset internally and a taller cover makes that come
out *smaller*, leaving the difference as overlap.

One case is genuinely unsolvable: rows taller than the whole margin have nowhere to go,
so Word displaces the body and the preview agrees. That is reported
(`BandOverflowNotice`) rather than fixed — widening the margin and dropping a row are
both reasonable answers, and the symptom (content missing from the *bottom* of the sheet)
gives no clue that a header caused it.

Each row exports as **one Word paragraph with tab stops**, with centre and right stops
derived from the live content width so they survive a paper or margin change. A rule is
drawn only on the edge-most row — under the last for a header, above the first for a
footer — so it frames the block rather than putting a hairline between every title line.

### Page 1 can differ

`HeaderFooter` resolves to **three** states, not a show/hide flag:

| State | Stored as | Page 1 prints |
|-------|-----------|---------------|
| Same on every page | neither field | `bands` |
| Blank on page 1 | `showOnFirstPage: false` | nothing |
| Its own rows | `firstPage: { bands }` | `firstPage.bands` |

Word models exactly this with `w:titlePg` plus a `w:type="first"` part, so the choice
costs one flag and one extra part rather than a second section.
`firstPageHeaderFooter()` resolves the three states in **one place**, shared by exporter
and preview, so the sheet on screen and the page in Word cannot disagree.

Two consequences: `w:titlePg` switches page 1 to the "first" references *wholesale*, so
once either edge differs **both** need a first-page part — the unchanged edge gets its
running content again or it vanishes from page 1 as a side effect. And a part is emitted
when *either* the running rows or page 1's rows would print, since a cover-only header
has empty running bands.

**A write aimed at page 1 creates the separation.** The three states are a *model*
distinction; they must not become an order of operations. Both `addHeaderFooterBand` and
`setHeaderFooterBands` used to require `firstPage` to already exist before honouring
`scope: 'firstPage'`, and fell through to the running list when it did not — so the
surface a teacher was looking at was not the one they edited, silently. Page 1 rows now
create `firstPage` on first write (and set `showOnFirstPage: true`, since building a cover
is the intent to print it), which is what lets the cover be built before any decision
about later pages.

The panel follows the same order. `HeaderFooterSection` renders **two labelled surfaces —
"Page 1" first, then "Pages 2 onward"** — each with its own rows, rule, presets and
`BandSurface` (one component used twice, because two hand-written copies would drift and
the pair has to look alike for the split to read as one choice made twice). Previously
page 1 was defined *relative to* the running rows: a teacher wanting a cover had to build
a header for pages 2+ they might not want, choose "Its own rows" to copy it, then edit the
copy — backwards from how a paper is made, where the cover is decided first and the
running line is the afterthought. The link between them survives as two quiet actions
("Same as page 1", "Give page 1 its own header") rather than as a mode that must be passed
through, since most papers do repeat one header.

### Editing bands on the page

**The header is edited on the page, not in the sidebar.** It was the one part of the
document that rendered on the page but could only be changed through a panel. Clicking
header text opens the same in-place editor body text uses, and a field drags between the
three zones. The panel keeps only what has no visual representation on the page —
show/hide, rule, and whether page 1 has its own rows — plus **presets**, because a teacher
who has never built a header does not know that "school, paper title, then a Name rule" is
the shape. Which *rows* page 1 carries is decided in the panel's "Page 1" surface or on
sheet 1 itself; both write the same `firstPage` list (§ Page 1 can differ).

**A page number is one field with a pattern** (`plain`, `pDot` → "P.5", `longForm` →
"Page 5 of 12"), not three tokens assembled by hand. The pattern string lives in
`pageNumberPlaceholder` and is shared: the preview substitutes a chip for its `#` at
render time via `withPageNumber`, and the exporter splits on the same placeholders so
only the numbers become `PAGE`/`NUMPAGES` fields. `bandFieldText` returns the
*placeholder*, because the model has no page to report and the `.docx` backend needs the
token intact — baking a number in would freeze every exported footer to whichever page
the preview happened to draw. Fill-in rules ("Name:______") come free from `BandField`
and export as a real ruled run rather than typed underscores that will not align.

Page-1 rows are edited on page 1 by the same `BandEditor`, so `patchHeaderFooterBand`
searches both band lists — a click there reports only a band id. The two lists never share
ids (`setFirstPageMode` re-ids on copy), or one keystroke would edit both.

**A structural edit must name which list it means (`BandScope`).** Searching both lists
works for a *field*, which arrives with an id; a row being **created** has no id yet, so
`addHeaderFooterBand` and `setHeaderFooterBands` take a `'running' | 'firstPage'` scope,
resolved in `HeaderFooterBand` from the sheet the click landed on (`pageNumber === 1 &&
value.firstPage`). Without it, "+ Row" and every preset wrote to `bands` unconditionally
and a teacher looking at page 1 silently changed pages 2 onward. Deletion needs no scope
— it carries a band id, so `removeHeaderFooterBand` filters both lists.

`BandEditor` therefore offers a hover-revealed **`+ Row`**, a per-row **✕** in the margin,
and a label naming the surface (`PAGE 1 HEADER`, `Header · pages 2+`, `Title block`) —
three band lists can print on one sheet and look alike, so "which of these am I changing"
must be answerable where the change is made. All of it is `data-print-hide` chrome
positioned outside the flow.

Two rules that fail silently if got wrong:

- **An empty band list still renders while editing** (`bandsShouldRender(bands,
  editable)` in `model/page.ts`, extracted so it is testable without a DOM). Returning
  early on `bandsAreEmpty` is right for the read-only and print paths but leaves nowhere
  to put the first row back. The guard keys on **whether editing is possible at all**,
  not on which region currently has focus — which is why `HeaderFooterBand` takes
  `editing` (is this region active) and `editable` (does this preview allow editing) as
  separate props.
- **A hover-revealed control must be reachable.** The per-row `✕` sits outside the row's
  box, and CSS `:hover` follows the element box, so travelling to the button leaves the
  row and hides the button mid-approach. It is wrapped in a `pointer-events-none` strip
  spanning from button back to row, and revealed with `opacity`, never `display` — a
  zero-size box cannot be hovered at all.

### One sheet, three regions to edit

A sheet shows body, header and footer at once, but they are separate documents to edit,
exactly as Word treats them. Inactive regions render at `opacity: 0.42` with a hint of
blur and `pointer-events: none`. **Double-click** steps into a dimmed header or footer;
**single click** on the dimmed body returns to it — leaving is the commoner move, and
with the body inert there is no other one-click way back. Word greys rather than blurs,
and greying is what survives 11pt on screen; a real blur turns the line into a smear.

This is not decoration: it keeps a click meant for question 1 out of the header row a few
pixels above it, and keeps the header's chrome off every hover across the top of the page.

Three implementation notes:

- **The wake overlay needs a region with a height.** A band box is placed in the margin
  by `top`/`left`/`right` alone, so `inset: 0` and `height: 100%` both resolve to zero.
  `.paper-region { height: fit-content }` gives it one; `.paper-region-body` opts out,
  being a `flex: 1` child that must fill the sheet.
- **Not a grid.** `display: grid` with every child in one cell also stacks the body's real
  children into a single overprinted line.
- **Chrome must not be measured.** The paginator reads the band box's height; with the
  overlay inside it, the overlay counted as header height. The measurement targets
  `[data-band-rows]`, the one child that is printed content.

Print CSS neutralizes the dimming and hides the overlay, so PDF export is unaffected.

### Print preview is the print rules, run on screen

The **Edit | Preview** switch (`store.printPreview`) shows the sheets exactly as they
will print: no chrome, no selection, nothing editable. It is a `Segmented`, like
Language and Version, and sits with them: the two states are equal and permanent, so a
button would have to label the state you are *not* in — reading as an instruction while
leaving the current mode unnamed. "Exactly" is a claim that has to be
*structurally* true rather than maintained by hand, so the rules that strip the page
down are written once and shared by `@media print` and `body.print-preview`. A control
added later needs `data-print-hide` exactly once and is correct in both; a second,
separately-written impression of printing would drift.

Two things follow that CSS alone cannot deliver:

- **Gestures are disabled in JavaScript, not by `pointer-events`.** The marquee sweep
  begins on the scrolling column and then tracks on `window`, so making the sheets
  transparent left drag-to-multi-select fully working over an inert page. `Preview`
  reads `printPreview` from the store and returns early from the sweep's `mousedown`
  and from the bulk-shortcut handler. That handler cannot instead ask "is anything
  selected?" — ⌘A is what *creates* a selection — and it swallows ⌘A rather than
  ignoring it, or the browser's native select-all highlights the whole app.
- **`#print-root` keeps its own pointer events** while its descendants lose theirs.
  Disabling them on the root as well makes the sheet transparent, so a double-click
  passes through to the sidebar behind it and selects *its* text.

`printPreview` lives beside `mode` in the store, deliberately **not inside** it:
`OutputMode` is the document's own state and is what the exporter reads, so a view
toggle that reached `.docx` generation would be a bug waiting to happen. Entering the
mode clears the question selection, exactly as `handlePdf` does before printing, and
`HintPill` hides itself there — it teaches an interaction the mode has removed.

### Both band paths must agree

`BandEditor` (active region) and `ReadOnlyBandRow` (idle region, and the print/PDF path)
draw the same rows, so any disagreement is a preview that lies about the document.

- **Formatting is one shared function**, `bandFieldStyle`. `ReadOnlyBandRow` once ignored
  `field.format` entirely, so a 14pt bold school name previewed *and printed* at 12pt
  regular — presenting as a region-focus bug, when the idle state was wrong all along.
- **Geometry must be identical.** Editing chrome reserves no space: drop-zone outlines
  use `ring`, which paints outside the border box, and spacing around the list belongs to
  `HeaderFooterBand`, which applies it in both paths. Verify by measuring the *same text
  node* in both states — comparing an ordered list of spans misleads, because the active
  state inserts a label chip and shifts the list by one.

---

## Question-type registry (`src/registry/`)

A `QuestionTypeDefinition` carries:

- `id` — the discriminator
- `displayName` — bilingual label
- `create()` — factory for a blank question
- `render(question, context) → RenderNode[]` — one function feeding all three backends
- `EditorPanel` — React editing component
- `countMissingTranslations?` — untranslated-field counter

Registered today: `mcq` and `structured`. Adding a type needs only a new definition —
no changes to numbering, marks, persistence or export orchestration.

**The numbered paragraph is hand-built, so it must copy the block's `format` itself.**
Every *other* paragraph goes through `renderContentBlocks`, which passes
`format: block.format` for free; the one carrying the question number is assembled by
hand (it needs the `listRef`), and all four such sites — the MCQ stem, and the
structured stem, part and sub-part — omitted it. The failure is silent and
asymmetric: the first paragraph of a stem ignored alignment, size and colour while
every later one honoured them. Worse, only the preview applies alignment (as CSS), so
a right-aligned stem previewed as right-aligned and exported with **no `w:jc` at
all** — a preview that lies about the document. `registry.test.ts` now sets a format
on each type's first block and asserts it reaches the IR.

**No shared module may branch on a concrete type.** `registry.test.ts` greps eight
modules — `model/numbering.ts`, `render/worksheet.ts`, `export/docx/{index,body,numbering}.ts`,
`export/clipboard.ts`, `model/migrations.ts`, `storage/index.ts` — and fails if one
mentions `'mcq'` or `'structured'`.

---

## Editor layout (`src/components/`)

The preview is the centrepiece. The right sidebar shows **one thing at a time** behind two
tabs; two left rails provide **insert** (AddRail) and **navigation** (PageRail, visible
only when the document spans multiple sheets).

### One panel, one job

**Content** is the outline; **Edit** is the selection. Each gets the column's full height.
The tab **follows the selection** rather than waiting to be clicked — selecting a
question, on the page or in the outline, *is* the request to edit it.

This replaced four regions stacked in one 400px column (two settings accordions, the
outline, a draggable divider, the inspector), which left both halves of the actual work
permanently half-height. The divider was the tell: a control whose only job was refereeing
a fight between panels that should not have shared the space.

### Settings live in a dialog

Title, instructions, fonts, paper, orientation, margins, header, footer and the title
block are decided roughly **once per document**. `DocumentSettings` is a tabbed dialog
reached from the toolbar's **Setup** button or the outline's **Settings** button (both,
because both are places a user looks). It claims the keyboard via `useModalLayer()`, or
Delete typed into a settings field also reaches the preview's delete handlers.

The split rule is unchanged: header *text* is typed on the page, while *whether the header
exists at all* has no visual representation there, so it lives in a panel.

**Tabs group by where a thing prints, not by which field stores it.** "Title block" was
its own tab while printing on page 1 below the header and *replacing* the title set on the
"Worksheet" tab — one decision spread across three places. The `furniture` tab now reads
down the page: title, then header, then footer.

Two rules follow:

- **A choice between two layouts is shown, not named.** Name-only preset buttons could
  only be learned by applying one — destroying what was there — closing the dialog and
  looking. `BandPreview` draws the actual zones at their actual weights, and the three
  page-1 states draw the rows they would print. These are deliberately **not**
  `BandEditor`: nothing is editable or draggable, so a picture of a choice never becomes a
  second editing surface to keep in step.
- **Deriving the same number twice is reported.** The "Exam paper" header preset and
  `assessmentTitleBlock` both carry a `totalMarks` field, so choosing both printed the
  total twice. `duplicateComputedFields()` detects it and the panel says so — reported
  rather than prevented, since which copy is unwanted depends on the paper.

`GroupHeader` replaces `Eyebrow` for anything naming a region a user works in: 10px
uppercase with wide tracking is a typographic texture, and a panel of five such headings
scans as one undifferentiated grey column.

### Direct manipulation on the page

```
click once                → select (outlined) → Delete removes it, format toolbar appears
click again / double-click → edit text in place → Enter commits, Esc cancels
hover                     → drag grip in the margin → drag to reorder
```

- **The format toolbar docks along the top of the page column**, not over the selection —
  a floating slab covered the lines above whatever was being edited. It stays `fixed` in
  viewport coordinates (a bar inside the preview's `scale()` would shrink with the zoom),
  taking `left`/`width` from the sheet and `top` from the scroll container. The scroller
  reserves the band (`pt-14`) so it occupies space the document was never going to use.
  Every control reports current state, and toggling an active one clears the override back
  to the named style.
- **Dragging grabs a margin grip, not the text**, which is already a click target for
  editing. The drop indicator marks the hovered item's leading or trailing edge depending
  on which half the pointer is in, and the drop honours that edge. Layout elements drag in
  the same list as questions — that is the whole point of the flow. Dragging a member of
  a multi-selection carries the whole selection, and that is the *drag's* rule, not any
  one target's: every drop target has to honour it (§a drop target receives the run).
- **Pictures resize where they are** (`preview/ResizableBlock.tsx`). Four rules:
  **width is the only output**, height following the block's aspect ratio via
  `applyResizeBlock` (which is why the handles are corners, not edges — an edge handle
  would promise independent width and height the model does not offer); the delta
  **divides by the preview scale**; the in-flight size is **local state committed once on
  release**, so a drag costs one undo entry; and the drag **clamps to the text column**,
  since a wider picture is clipped on screen and rescaled by Word.
- **A picture's click target stays mounted while selected.** Unmounting it left only a
  `pointer-events-none` outline, so the next click fell through to the question wrapper
  and cleared `selectedBlockId` — which is why Delete on a selected picture appeared to do
  nothing. While selected the target insets by 6px so it never covers the corner handles.
- **Double-clicking a diagram opens the drawing canvas.** The preview reports only "this
  block was double-clicked"; `EditorApp` resolves the id and renders the canvas, which
  keeps the canvas out of the render path and lets a read-only preview stay read-only. It
  is hosted there rather than by the sidebar's `DiagramEditor`, because that panel only
  exists while its question is open. Edits commit through `replaceBlock`, addressing the
  block by id.
- **Clicking blank paper clears every page selection.** "Blank" is decided by what the
  click *landed on* (`isBlankAreaClick` walks up from the target), not by an identity test
  against the paper node — the sheet is a stack of nested divs, so the empty space below
  the last question belongs to a child. The paper's handler and the marquee sweep share
  that definition, and all selections drop together.

  **The exemption list must name attributes something renders.** Clearing includes
  *returning focus to the body*, so an element the selector fails to match does not
  merely fail to select — clicking it silently leaves the region being edited. The list
  named `data-band-field`, which no component has ever rendered, while header and footer
  fields carry `data-field-id`: every click inside an active header therefore counted as
  blank paper and deactivated the header, so the region could be entered by double-click
  but never worked in. The selector is valid CSS and the components are correct; only the
  two *together* are wrong, which is why `blankClick.test.ts` greps the preview
  components for each attribute the list exempts.
- **Arrow keys nudge a diagram selection**, routed through the same `dragHandles` a drag
  uses, so every handle kind obeys its own rule for free. The step is deliberately not
  scaled by zoom: a nudge is a fixed edit to geometry.
- **No layout shift while editing.** The editor is a plain **`inline`** field inheriting
  font, size and leading, so the list marker stays in its gutter and nothing below moves.
  `inline`, specifically: an `inline-block` establishes its own formatting context, so
  its lines cannot inherit the paragraph's hanging indent (`padding-left: 24px` +
  `text-indent: -24px`), and a `w-full` on top pushed it out to the whole column. Clicking
  into a numbered stem therefore moved every line ~29px left, out of the gutter the `1.`
  shares, and moved them back on commit — the text visibly jumped on entry and exit. For
  the same reason the field must **not** reset `text-indent`: the paragraph's negative
  indent applies to its own first line, the one the marker sits on.
- **One language at a time.** In bilingual mode the two halves are separate editable
  spans, so clicking the Chinese line writes `zh` and leaves `en` untouched.
- **Two-step engagement makes keyboard delete safe.** Delete acts on a deliberate
  selection and is ignored whenever focus is inside a field. `⌘Z` is scoped the same way.
- **Only one layer owns the keyboard** (`components/ui/modalLayer.ts`). Every keydown
  listener is attached to `window`, so they share one target and `stopPropagation` cannot
  separate them — they all fire. With a diagram selected on the page and the canvas open
  on top, Delete removed one curve *and* ran the preview's handler, deleting the whole
  block. A full-surface overlay calls `useModalLayer()` to claim the keyboard while
  mounted, and every page-level handler asks `isModalLayerOpen()` first. It is a
  module-level **counter**, not state or context, because a keydown handler needs the
  answer synchronously inside the event — and a counter rather than a boolean so two
  stacked overlays release only when the last closes. Both failure directions are silent,
  so both are unit-tested.
- **Delete picks the right unit per target** (`describeDelete` in `model/edits.ts`): a
  stem paragraph removes the block, a statement leaves the list so the rest renumber, a
  table cell is emptied rather than removed (it would break the grid), and an **MCQ option
  cannot be deleted at all**, the count being fixed at four.
- **Everything routes through `commit()`**, so in-place edits and deletions get undo/redo
  and autosave with no special handling.

**The page rail shows real pages, not sketches** (`editor/PageThumb.tsx`). Each card is a
scaled **clone of the rendered sheet** taken from `#print-root`, so a teacher can find
"the page with the tariff diagram" by looking; a column of grey proportional bars was
placed correctly and looked alike. Cloning the finished DOM avoids a third render pass.
The clone is inert (`cloneNode` copies markup, not handlers) and `aria-hidden`, so the
card underneath keeps click, drag and delete. Editing chrome is stripped on the way in,
and the selection highlight is found by `aria-current` rather than a class string — the
classes are literal hex per the token rule. Thumbnails refresh ~200ms after the preview's
DOM settles, watched with a `MutationObserver` rather than keyed on page composition: a
retyped title rewrites a sheet without moving anything between pages. The rail is 152px,
sized by what a thumbnail must *show* — at 104px a band's three zones were ~26px each and
read as one clump.

### Layout rules

- **Weight matches consequence.** One `Button`/`IconButton` with variants: `primary` is
  reserved for Export, `danger` for destructive actions, `subtle` for row actions that
  recede until hovered.
- **Row actions are progressive.** A question row spends its width on the stem excerpt;
  duplicate / copy / move / delete live behind a `⋯` menu. Glyph-only buttons take a
  required `label` that becomes both tooltip and accessible name.
- **Selection is bidirectional.** Clicking a question in either pane selects it and the
  other pane scrolls it into view; the preview suppresses its own scroll when the click
  originated there.
- **Depth is carried by rule and label, not by more boxes.** Parts use a left rule and a
  marks pill rather than a fourth nested border.

---

## State, persistence and text

### Store (`src/store/worksheetStore.ts`)

Zustand with a 100-entry undo history. Every mutation goes through `commit(recipe)`,
which applies the recipe, pushes the previous state onto `past` and clears `future`.
Loading a document resets history. Undo/redo are plain stack moves — numbering and marks
need no special handling, being derived.

**Drag gestures commit once.** In-flight values stay in local component state; the store
is called on pointer-up only, or one drag floods the undo stack with dozens of entries.

### Persistence (`src/storage/index.ts`, `src/model/migrations.ts`)

- `WorksheetStore` interface: `list()`, `load()`, `save()`, `remove()`; implemented today
  by `LocalStorageWorksheetStore`.
- **Autosave** debounced 1.2s after the last change.
- **File download/upload** as `.worksheet.json`, images included base64.
- **Migration chain**: `migrate()` runs ordered pure functions v1→v6
  (`CURRENT_SCHEMA_VERSION = 6`) on load.
- **Forward compatibility**: unknown top-level fields are preserved in `__unknown` through
  load and save.
- **`KNOWN_KEYS` must list every top-level field.** An unlisted key is treated as written
  by a newer build: `migrate()` strips it off the worksheet into `__unknown`, so it
  persists to storage but never reaches the model. `titleFormat`, `instructionsFormat`
  and `bands` were all missing once, which presented as the font-size control "not
  working" — it applied live, saved correctly and vanished on reload. A test now fails
  when a populated worksheet carries a key the set lacks.

### Bilingual text (`src/model/text.ts`)

- Every user-visible string is `BiText { en: RichText, zh: RichText }`.
- Rich text uses lightweight inline markers: `**bold**`, `*italic*`, `__underline__`,
  `^{sup}`, `_{sub}`.
- In bilingual mode English and Chinese share **one paragraph**, separated by a soft
  `w:br` (Word) or `<br>` (preview/clipboard), so a bilingual unit takes one list number.
- **A hard line break (Shift+Enter) is stored as a plain `\n` inside the run's text**, not
  as a distinct run kind, so every saved document stays valid and no migration is needed.
  `runLines()` splits it at the one point where it must become markup: a raw newline
  renders as a **space** in all three backends — `<w:t>` collapses it and so does HTML.
  A break is deliberately not a paragraph, for the same reason bilingual stacking is not.
- Per-script fonts: every run carries `w:rFonts` with separate `w:ascii`/`w:hAnsi` (Latin)
  and `w:eastAsia` (CJK).

---

## Deployment

```
Vercel (or any static host)
  Next.js build → fully prerendered route. No API routes, no DB, no server runtime.
        │
        ▼
  Browser: .docx generated client-side (JSZip + atob)
           localStorage autosave · file download/upload for portability
           PDF via window.print() over the real sheets
```

Nothing in `src/` reads `process.env` or the filesystem at runtime. Keep it that way —
client-side export is a design constraint, not an accident. New on-page chrome needs
`data-print-hide`, or it appears in the PDF.
