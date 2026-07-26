# System Architecture — Bilingual HKDSE Economics Worksheet Generator

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router), fully static export via `next build` |
| UI | React 19, Tailwind CSS 4 |
| State | Zustand 5 with undo/redo (100-entry history) |
| Language | TypeScript strict |
| Export | Raw OOXML via JSZip (hand-built, no `docx` library) |
| ID Generation | nanoid |
| Linting | ESLint 9 + `eslint-config-next` |
| Test | Vitest 4 |
| Runtime | Browser-only (client-side .docx generation, no API routes) |

---

## Project Structure

```
src/
├── app/              # Next.js App Router entry (layout + page + EditorHost SSR guard)
│   ├── layout.tsx    #   root HTML shell + metadata
│   ├── page.tsx      #   renders <EditorHost>
│   ├── EditorHost.tsx#   dynamic client import (ssr: false)
│   ├── globals.css   #   Tailwind + semantic design tokens
│   └── favicon.ico
├── model/            # Document model, numbering, marks, migrations, text, factories,
│                     #   page setup + header/footer (page.ts), section flow (flow.ts),
│                     #   masthead bands / drop zones (bands.ts),
│                     #   diagram geometry (diagram.ts) + templates (diagramTemplates.ts)
│                     #   + direct-manipulation hit-test/drag/snap (diagramDraw.ts)
├── registry/         # Question-type extension point (§9)
│   ├── types.ts      #   QuestionTypeDefinition interface
│   ├── index.ts      #   registry (mcq + structured registered)
│   ├── mcq.ts        #   MCQ type + renderer
│   ├── structured.ts #   Structured type + renderer
│   └── registry.test.ts
├── render/           # Neutral render IR + worksheet walker + diagram → SVG (diagram.ts)
│   ├── ir.ts         #   RenderNode types + EditTarget
│   ├── worksheet.ts  #   renderWorksheet() — full IR assembly
│   └── diagram.ts    #   diagramSvg() — geometry → SVG
├── export/
│   ├── docx/         # .docx (OOXML) backend
│   │   ├── index.ts  #   orchestration: buildParts, exportDocx
│   │   ├── body.ts   #   document body XML (w:tbl, w:p, w:drawing)
│   │   ├── numbering.ts # numbering.xml: abstract defs + per-stream w:num
│   │   ├── styles.ts #   styles.xml: 14 named paragraph styles
│   │   ├── runs.ts   #   run-level OOXML (w:rFonts, w:r, w:br)
│   │   ├── package.ts#   OPC package: Content_Types, rels, JSZip assembly
│   │   ├── xml.ts    #   XML escaping, sanitization, attribute helpers
│   │   └── docx.test.ts
│   ├── diagramImage.ts # Diagram → PNG pre-pass (browser-only, async)
│   ├── clipboard.ts  # Clipboard HTML backend
│   └── clipboard.test.ts
├── components/
│   ├── EditorApp.tsx  # Root shell — orchestrates Toolbar + AddRail + PageRail + Preview + Sidebar
│   ├── ui/            # Shared primitives
│   │   ├── index.tsx  #   Button, IconButton, Card, Pill, Segmented
│   │   ├── icons.tsx  #   all SVG icon components
│   │   ├── Collapsible.tsx
│   │   ├── Menu.tsx   #   dropdown menu
│   │   └── DragGhost.tsx
│   ├── editor/        # Right sidebar + left rails
│   │   ├── Sidebar.tsx, Outline.tsx, Inspector.tsx
│   │   ├── BiTextField.tsx, BlockEditor.tsx
│   │   ├── McqEditorPanel.tsx, StructuredEditorPanel.tsx
│   │   ├── WorksheetSettings.tsx, PageSetupPanel.tsx
│   │   ├── DiagramEditor.tsx (numeric), DiagramCanvas.tsx (drawing overlay)
│   │   ├── Toolbar.tsx (top bar), AddRail.tsx (left insert rail),
│   │   │   PageRail.tsx (page thumbnail rail)
│   └── preview/       # Live print preview
│       ├── Preview.tsx, BandEditor.tsx, FormatToolbar.tsx, InlineEditable.tsx
│       └── ResizableBlock.tsx  # drag-to-resize handles on images/diagrams
├── store/
│   └── worksheetStore.ts  # Zustand store with undo/redo
├── storage/
│   └── index.ts       # WorksheetStore interface + LocalStorage impl
└── test/
    └── fixtures.ts    # Shared test fixtures
```

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                        Toolbar (top bar)                      │
│              export · mode · language · save/load            │
├────┬────┬─────────────────────────────────────┬──────────────┤
│Add │Page│                                     │              │
│Rail│Rail│         Preview (centrepiece)        │   Sidebar    │
│    │    │   live A4 print preview, scrollable  │  outline +   │
│    │    │   click-to-select, click-to-edit,    │  inspector   │
│    │    │   drag-to-reorder, floating toolbar  │             │
│    │    └──────────┬──────────────────────────┘             │
│    │               │                                        │
└────┴────────────────┼────────────────────────────────────────┘
                      │
                      ▼
              Zustand Store (undo/redo)
        commit() pushes previous state to past stack
          │                 │                    │
          ▼                 ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    Zustand Store (undo/redo)                 │
│  worksheetStore.ts — commits mutate document, pushes to     │
│  history stack. Numbering + marks derived, never stored.    │
└─────────┬─────────────────┬──────────────────┬──────────────┘
          │                 │                  │
          ▼                 ▼                  ▼
┌──────────────────┐ ┌────────────────┐ ┌───────────────────┐
│   Document Model │ │  Perspective   │ │   Question-Type   │
│   (model/)       │ │  (storage/)    │ │   Registry        │
│   types.ts       │ │  localStorage  │ │   (registry/)     │
│   numbering.ts   │ │  JSON file i/o │ │   index.ts        │
│   marks.ts       │ │  WorksheetStore│ │   mcq.ts          │
│   text.ts        │ │  interface     │ │   structured.ts   │
│   migrations.ts  │ │                │ │   types.ts        │
└──────────────────┘ └────────────────┘ └───────────────────┘
                                                    │
                            ┌───────────────────────┼───────────────────────┐
                            │                       │                       │
                            ▼                       ▼                       ▼
                    ┌──────────────┐       ┌──────────────┐       ┌──────────────────┐
                    │ Render IR    │       │ Render IR    │       │ Render IR        │
                    │ (preview)    │       │ (.docx)      │       │ (clipboard)      │
                    └──────────────┘       └──────────────┘       └──────────────────┘
```

---

## Core Architectural Principle: One IR, Three Backends

The question type registry emits a **neutral render IR** (`src/render/ir.ts`) once. Three consumers — preview, .docx exporter, clipboard exporter — all consume the same IR. This guarantees preview/export agreement on numbering, ordering, and teacher-only filtering.

```
Question Type's render() ──► RenderNode[] (neutral IR)
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
               Preview.tsx    docx/index.ts    clipboard.ts
               (React DOM)    (raw OOXML)      (text/html)
```

---

## Data Flow

```
1. User edits in Sidebar ──► Zustand store (commit → push history)
       │
2. Store updated ──► React re-render
       │
3. renderWorksheet() called ──► computeNumbering() + registry.render()
       │
4. RenderNode[] (IR) produced
       │
       ├─► Preview (live on screen)
       ├─► .docx exporter (on "Export" button)
       └─► clipboard exporter (on "Copy for Word" button)
```

---

## Document Model (`src/model/types.ts`)

```
Worksheet
├── schemaVersion: number    (for migration chain)
├── id, title (BiText), instructions (BiText?)
├── titleFormat / instructionsFormat: TextFormat?   (per-element overrides)
├── fonts: { latin, eastAsia }
├── pageSetup: { paper, orientation, margins }      (twips, mirrors w:pgSz/w:pgMar)
├── header / footer: HeaderFooter                   (left/centre/right slots)
│   └── slots[].parts: text | pageNumber | pageCount
├── sections: Section[]
│   ├── id, heading (BiText?), headingFormat?, restartNumbering?
│   ├── layout: LayoutElement[]   (heading/text/spacer/divider/pageBreak/answerLines)
│   ├── flow: SectionItem[]       (positions layout relative to questions)
│   └── questions: Question[]
│       ├── McqQuestion (type: 'mcq')
│       │   ├── blocks: ContentBlock[]     (stem)
│       │   ├── statements?: BiText[]      (combination MCQ)
│       │   ├── options[4]: McqOption[]
│       │   ├── answerIndex, marks, explanation?
│       └── StructuredQuestion (type: 'structured')
│           ├── blocks: ContentBlock[]     (stem)
│           └── parts: QuestionPart[]
│               ├── blocks, marks?
│               ├── answer?
│               └── subParts?: QuestionSubPart[]
│                   ├── blocks, marks
│                   └── answer?

ContentBlock = ParagraphBlock | TableBlock | ImageBlock | DiagramBlock
DiagramBlock  { diagram: Diagram (unit-space geometry), widthPx, heightPx, caption?, altText }
BiText { en: RichText, zh: RichText }
RichText = InlineRun[]  (text, bold, italic, underline, vertAlign)
```

**Key rule:** Numbering is never stored — it is **derived** at render time via `computeNumbering()`. Marks totals are **computed** via `questionMarks()` / `partMarks()`. This makes undo/redo and reordering trivial.

### Section flow (`src/model/flow.ts`)

Teachers need design elements that are *not* questions — a free heading, a note, ruled
answer lines, a spacer, a divider, a page break. These are `LayoutElement`s and sit
deliberately **outside** the `Question` union: they take no number and carry no marks, so
putting them in the registry would force numbering and marks totalling to learn about
types that have neither.

`resolveFlow(section)` produces the display order, under one invariant:

> **`questions` stays the authority on question order.** `flow` contributes only the
> position of layout elements *relative to* the questions.

That is why reordering a question rewrites the `questions` array rather than the flow —
two sources of truth for "which question is third" would silently disagree. A missing or
stale `flow` therefore costs an element its *position*, never its existence, and a
pre-v4 document (no `flow` at all) resolves to exactly its previous order.

### Constrained layout: bands and zones (`src/model/bands.ts`)

Teachers want Canva-style direct manipulation but the output must stay a Word document, so
placement is **slot-based, never free**. A `Band` is one printed row exposing three drop
zones — left / centre / right — and a field can be dragged between them or reordered inside
one. There is no arbitrary x/y, which is the whole point: every arrangement maps onto a
single Word paragraph with tab stops, so what is arranged on screen is what exports.

Zone positions are **fixed thirds** (0, 0.5, 1), not derived from which zones are occupied.
A centre field is therefore centred on the page rather than on the middle of the content,
which is what a masthead needs and what stops it drifting as fields are added.

Two field kinds print a number that is **computed, never stored**: `totalMarks` from
`worksheetMarks()`, and the `partHeader` layout element's suffix from `sectionMarks()`. That
is why they are their own kinds rather than text a teacher retypes — a stored "45 marks"
goes stale the moment a question is re-marked (§3.5).

### One row, many uses: `ColumnsNode`

`ColumnsNode` is the single IR primitive behind every side-by-side layout — band zones,
inline MCQ options, and the label-list element. It exports as **one paragraph with tab
stops** rather than a borderless table, because a table would still be a table to edit in
Word and could not sit inside a numbered list item. Cell positions are fractions of the
row's own width (after `indent`), so all three backends use them directly and they stay
correct when paper size or margins change.

Inline MCQ options are the one place this costs something: a single paragraph cannot carry
four list numbers, so their `A.`–`D.` markers become literal text. Stacked options — still
the default — keep native `w:num` numbering per §7.2.

### Diagrams: geometry in, one image out (`src/model/diagram.ts`, `src/render/diagram.ts`)

Economics papers draw the same handful of shapes every year — two curves crossing, a
marked equilibrium, dashed drop-lines to the axes, a shift arrow. A `DiagramBlock`
models exactly that vocabulary in a **unit coordinate space** (x and y in 0..1, origin
bottom-left) rather than being a free drawing surface, which is what lets one stored
diagram render crisply at any size.

The document stores **geometry, never pixels**. That is what keeps a diagram re-labellable
a year later instead of frozen into a bitmap, and it is why the block holds a `Diagram`
rather than a data URL.

Export flattens it to **exactly one image**:

```
Diagram (geometry) ──► diagramSvg()  ──┬──► preview: live inline SVG, sharp at any zoom
                                       └──► rasterize @3x ──► one PNG
                                                               ├──► .docx: one w:drawing
                                                               └──► clipboard: one <img>
```

Word gets a raster, not the SVG: Word's SVG support varies by version and platform, and
a PNG is the one format every build places, prints and emails identically. One image
also means Word treats the diagram as a single object to move and resize, rather than a
group of shapes a stray click can pull apart.

Rasterizing needs a canvas, so it is the one genuinely browser-only, asynchronous part
of the export path. It is factored out as a pre-pass (`export/diagramImage.ts`) that
returns a plain `Map<blockId, pngDataUrl>`, which is what lets `buildParts` and
`worksheetClipboardHtml` stay synchronous and unit-testable. With no map — a non-browser
runtime — a diagram emits **no drawing at all** rather than one pointing at a missing
relationship, which Word would report as a repair error.

Two rules the renderer follows that only show up on a real page: axis titles are laid
out *outside* the plot, so the padding is sized from the title's own estimated width
(otherwise a long title is silently clipped, not overflowed); and in bilingual mode a
label whose two sides are identical prints **once**, because "AD" and "E₀" are symbols
rather than prose and stacking them would print each curve's name twice.

Two defaults are set by where things actually collide on a DSE diagram rather than by
symmetry. The x-axis title is anchored just past its **arrowhead**, not right-aligned to
the SVG edge: the edge is `PAD.right` away — room reserved so a long title cannot clip —
so right-anchoring stranded a short title like "Quantity" in open space far from the axis
it names, while a long one still grows leftward into the reserved room. And a point's
label defaults to **`right`, not `upRight`**: a marked point is nearly always an
intersection, so the diagonal space above-right of it is exactly where the *other* curve
runs, and an equilibrium label placed there lands on the line it annotates.

`DIAGRAM_TEMPLATES` (`model/diagramTemplates.ts`) traces the reference papers in
`real_life_reference/` — AD-AS, money market, tariff, import quota, PPC. A template is
only an initial value: it produces plain geometry with fresh ids, and nothing downstream
ever looks the template up again.

#### Drawing the diagram (`model/diagramDraw.ts`, `components/editor/DiagramCanvas.tsx`)

A diagram has **two editing surfaces over one geometry**. The sidebar panel types
coordinates as percentages, which is how you place something exactly; **Draw** opens a
full-screen canvas where the same elements are dragged, which is how you place something
quickly. Neither owns anything the other cannot see — a hand-drawn curve is the identical
`DiagramCurve` the panel would have produced, so either can refine the other's work. That
interchangeability is the payoff for storing geometry rather than strokes.

The canvas draws its handles as a separate `pointer-events-none` SVG layered **over** the
real one, so the diagram underneath stays byte-identical to what exports — editing chrome
never reaches the geometry, the same rule `EditTarget` follows in the render IR.

Two decisions make it feel precise rather than approximate:

- **The projection is shared, not re-derived.** `diagramPlot()` returns the very
  projection `diagramSvg()` will use, including its inverses `ux`/`uy`. The plot edges
  are not constants — they move with the axis titles — so a canvas that recomputed them
  would drop a point where the renderer then draws it slightly elsewhere.
- **Gestures replay from the geometry captured at pointer-down**, never from the latest
  state, so a drag is one idempotent transform rather than an accumulating one.

Hit-testing prefers **handles over bodies** (grabbing a curve's end moves that end, not
the whole curve) and, among bodies, the topmost. Snapping catches curve intersections and
existing marked points, because the coincidences in a DSE diagram — an equilibrium on
both curves, a parallel shift — are meant to be exact and cannot be hit by eye. Snapping
stores nothing: it only decides where a point lands.

**A drag lets go of what it moved.** Pressing an element does not select it; it arms a
gesture that only writes geometry once the pointer has travelled past a ~4px threshold,
and on release a single dragged element is **deselected**. Before this, every press both
selected *and* armed a move, so a click meant to inspect one curve nudged it by the two
pixels any click contains, and — worse — an element stayed armed after its own drag, so
reaching for the next shape moved the one the teacher believed they had let go of. The
threshold makes clicking safe; releasing the selection makes the *next* click safe. Two
gestures are exempt: a **multi-element** selection survives its drag, since a group is
deliberate work that would be tedious to rebuild after every nudge, and **shift-click**
toggles membership without arming a move at all.

That leaves a click meaning exactly one thing — *select this, so the inspector points at
it* — which is why the selection is set on **release** rather than on press.

Because grab-and-go has no visible arming step, the **cursor carries the affordance**
(`cursorFor` in `model/diagramDraw.ts`): `grab`/`grabbing` over a whole curve or arrow,
a resize arrow oriented along the segment an endpoint would stretch, and `move` for a
point or label that has no axis. The four CSS resize cursors are chosen by bucketing the
segment's angle into 45° quadrants, in **screen** space — unit y grows upward and screen
y downward, and getting that negation wrong swaps the two diagonals, which is invisible
on an axis-parallel line and wrong on every supply curve.

Snapping does create one hazard worth naming: aiming a new point at an *already-marked*
intersection lands it exactly on the existing dot, and a second point stacked pixel-perfect
on the first is invisible on screen and in the PNG while being unselectable and
undeletable by clicking. `pointAt()` catches that case and selects the existing point
instead of adding the twin.

#### Every label moves, and every label stays attached

All seven kinds of text on a diagram are draggable: free labels, curve names, point
names, arrow labels, a point's two axis tick labels, the axis titles and the axis ticks.
Only the free `DiagramLabel` stores an absolute position. **Everything else stores an
offset from its own anchor** — `labelOffset` on a curve/point/arrow, a scalar `offset`
on a tick, `titleOffset` on an axis — so re-dragging a supply curve carries its "S" along
instead of stranding it. That is the same reason the model held `labelOffset` from the
beginning; it simply had nothing writing it.

Three constraints fall out of keeping text attached:

- **A drag accumulates the pointer delta onto the offset**, never snapping to the pointer.
  The anchor sits at an arbitrary place, so an absolute drop would teleport the label to
  the cursor on the first pixel of the gesture.
- **Tick labels slide along their own axis only** — one scalar, not a point. A tick that
  drifted off its axis stops lining up with the drop-line that makes it read as a tick,
  and the cursor advertises the constraint (`ew`/`ns`) before the drag starts.
- **Axis titles nudge inside the room already reserved for them.** `diagramPlot` still
  sizes the padding from the title's estimated width, so a long title cannot be pushed
  into the clip the `PAD` comment warns about.

A point label is the one place two positioning systems coexist: the eight compass slots
(`labelSide`) remain what templates ship and what the sidebar restores, and a free drag
writes a `labelOffset` that **supersedes** the slot. Picking a side again clears the
offset, which is how a hand-placed label gets back on the rails — and `ResetLabelPosition`
does the same for every other kind, since an offset is otherwise invisible in the sidebar.

Deleting anchored text deletes the **text**, never its anchor: removing a whole supply
curve because its name was selected would be a destructive surprise. Copying does the
opposite and takes the whole anchor, for the same reason a `vertex` handle does — a
curve's name cannot exist without the curve.

Hit-testing labels needs positions the renderer owns (they depend on font size, padding
and the language being shown), so `diagram.ts` exports `curveLabelAnchor`,
`pointLabelAnchor`, `arrowLabelAnchor`, `axisTitleAnchor` and `axisTickAnchor`, and the
canvas feeds the results to `hitTest` as `LabelAnchor[]`. This is the projection rule
again: a canvas that recomputed a label's anchor would make it grabbable somewhere it is
not drawn. Text competes with vertices on distance and both beat whole bodies — a curve's
name is drawn right beside the line it names, and losing to that line would leave it
unreachable.

**Selection is a set, not a single handle.** Dragging empty space sweeps a marquee
(`selectWithin`), shift-click toggles one element, `⌘A` takes everything. A marquee
catches only elements **fully** inside it: a demand curve spans the whole plot, so
partial-overlap selection would make every box catch every curve. Two rules keep group
gestures honest — a plain click on something already selected keeps the whole selection
(so dragging a group by one member moves all of it), and a multi-element drag never
snaps, because snapping the anchor would teleport the entire group the moment the pointer
crossed an intersection.

`⌘C`/`⌘V`/`⌘X`/`⌘D` copy, paste, cut and duplicate through a **canvas-local clipboard**
(`DiagramClip`) rather than the system one: diagram geometry has no sensible text/plain
form, and reading the system clipboard needs a permission prompt mid-drawing. `pasteInto`
re-ids on the way in and offsets the copy, so one clip pastes repeatedly without collision
and the copy never lands invisibly on its original. Paste selects what it created, which
is what makes copy → paste → drag the natural way to build an "S₁ → S₂" shift.

The stage renders at a **zoom multiple** of the stored size (default 2×). Zoom scales
only what is displayed — `toUnit` divides the pointer position back out, and handle radii
divide by it too so they stay a constant size on screen. Stored geometry never sees it,
which a test asserts by comparing rendered path data across a zoom change.

### Per-element formatting (`TextFormat`)

Named styles (§7.3) still supply every default; `TextFormat` records only the deltas a
teacher chose. All three backends apply it as **direct formatting on top of the style**,
so a worksheet that never touches formatting exports byte-identically to before, and a
later change to a style still reaches everything that did not override it. Formatting
attaches to whole elements, never to one language side — a bilingual heading is a single
paragraph in Word, so per-side sizes could not be exported faithfully.

---

## Render IR (`src/render/ir.ts`)

```
RenderNode = TextNode | ColumnsNode | TableNode | ImageNode | DiagramNode
           | PageBreakNode | SpacerNode | DividerNode | AnswerLinesNode

TextNode:
  kind: 'text'
  style: NodeStyle      (one of 14 named styles)
  text: BiText
  listRef?: ListRef     (stream + definition + level + marker literal)
  marks?: number        (trailing "(4 marks)")
  keepNext?: boolean    (prevent page break)
  teacherOnly?: boolean (filtered for student version)
  indent?: number       (extra left indent in twips)

ListRef:
  stream: string        (unique id per numbering stream)
  definition: 'question' | 'option' | 'statement'
  level: number         (0=top, 1=sub, 2=sub-sub)
  marker: string        (e.g. "3.", "(a)", "A.")

EditTarget (optional, on TextNode / table cell / caption):
  the model address the text was rendered from — 'blockText' | 'tableCell' |
  'mcqOption' | 'partAnswer' | 'worksheetTitle' | …, always keyed by **id**
```

`edit` is what makes the previewed page directly editable, and it is **inert in
export**: the .docx and clipboard backends never read it, so adding it left exported
files byte-for-byte identical. Derived text (marks totals, the "Answer: C" line)
deliberately carries no target, because it is computed rather than stored (§3.5, §4)
and typing over it would have nowhere to go.

The `listRef.stream` is the key that connects IR nodes to .docx `w:num` instances. Each distinct stream becomes one `w:num` in `numbering.xml`.

---

## Numbering System (`src/model/numbering.ts` + `src/export/docx/numbering.ts`)

### Derived numbering (app-level)
- `computeNumbering()` walks sections/questions, returns a `NumberingPlan`.
- Numbers are 1-based, continuous across sections unless `section.restartNumbering` is set.

### Native Word numbering (OOXML)
- Three abstract multilevel definitions in `numbering.xml`:
  - **Abstract 0** (questions): level 0 = "1." decimal, level 1 = "(a)" lowerLetter, level 2 = "(i)" lowerRoman
  - **Abstract 1** (MCQ options): level 0 = "A." upperLetter
  - **Abstract 2** (statements): level 0 = "(1)" decimal
- Each `stream` in the IR gets a concrete `w:num` instance.
- Options/statements get one `w:num` per question with `w:startOverride`, so lettering restarts at A per question.
- Section restart creates a new `w:num` instance for the question stream, forcing Word to restart at 1.

---

## Export Pipeline

### .docx (`src/export/docx/`)

| File | Responsibility |
|------|---------------|
| `index.ts` | Orchestration: render IR → collect images/decode → build parts → zip |
| `body.ts` | Document body XML: paragraphs, tables, images with `w:tbl`/`w:drawing` |
| `numbering.ts` | `numbering.xml`: abstract defs + per-stream `w:num` instances with overrides |
| `styles.ts` | `styles.xml`: 14 named paragraph styles (Question Stem, MCQ Option, etc.) |
| `runs.ts` | Run-level OOXML: `w:rFonts` (Latin + East-Asia), `w:r` elements, bilingual stacking via `w:br` |
| `package.ts` | OPC package: `[Content_Types].xml`, relationships, header/footer, `sectPr` page geometry, settings, font table, JSZip assembly |
| `xml.ts` | XML helpers: escaping, sanitization (illegal chars), attribute builder |

### Page setup and header/footer (`src/model/page.ts`)

Paper size, orientation and margins are stored in **twips** so the exporter writes them
straight into `w:pgSz` / `w:pgMar`, and the preview converts the same numbers to
millimetres — the previewed text column is the one Word will use.

`MARGIN_PRESETS` are labelled in centimetres but stored in twips, and a test asserts
each label matches its own stored value so the two cannot drift. **Custom…** is a real
selectable option that reveals four per-edge cm fields, clamped to 0–5 cm; choosing it
keeps the current geometry as the starting point rather than resetting the page. Each
field commits on blur/Enter rather than per keystroke, so one edit is one undo entry,
and holds a local draft string while focused — re-deriving the text from the stored
twips would delete the decimal point the moment it was typed.

Headers and footers are **lists of `Band` rows** — the very model the masthead uses
(§ "Constrained layout"). One row was not enough: `real_life_reference/head2.png` stacks
five, running an exam line beside a page number, three centred title rows, then a marks
total beside a "Date:____" rule. Reusing `Band` rather than growing a parallel type means
one editing surface (`BandEditor` serves the masthead, the header and the footer), one
drag-between-zones interaction and one exporter path.

Each row is still **one Word paragraph with tab stops**, with the centre and right stops
derived from the live content width, so they stay correct after a paper or margin change
that a fixed stop would silently break. A rule is drawn only on the edge-most row — under
the last for a header, above the first for a footer — so it frames the block rather than
putting a hairline between every title line.

**The header is edited on the page, not in the sidebar.** It was the one part of the
document that rendered on the page but could only be changed through a panel, which made
it the thing users could not work out how to edit. Clicking header text now opens the
same in-place editor body text uses, and a field drags between the three zones. The panel
keeps only what has no visual representation on the page — show/hide, rule, on-page-1 —
plus **presets** traced from the reference papers, because a teacher who has never built
a header does not know that "school, paper title, then a Name rule" is the shape.

A **page number is one field with a pattern** (`plain`, `pDot` for "P.5", `longForm` for
"Page 5 of 12") rather than the three tokens a teacher used to assemble by hand. The
pattern string lives in `pageNumberPlaceholder` and is shared: the preview substitutes a
chip for its `#`, and the exporter splits on the same placeholders so only the numbers
become `PAGE`/`NUMPAGES` fields. Having each backend spell "Page # of N" itself is how a
footer ends up reading differently on screen than it does in Word.

Fill-in rules ("Name:______") come free from `BandField`, which already had them for the
masthead — they export as a real ruled run rather than typed underscores that will not
align.

Clipboard output deliberately carries none of this: pasting into an existing Word
document must not override that document's page setup or headers.

### Clipboard (`src/export/clipboard.ts`)
- Same IR consumed as the .docx backend.
- Writes `text/html` + `text/plain` flavours to clipboard via `ClipboardItem`.
- Numbering is literal text (clipboard HTML cannot carry Word numbering definitions).

---

## Question-Type Registry (`src/registry/`)

The extension point (§9). A `QuestionTypeDefinition` includes:
- `id` — discriminator
- `displayName` — bilingual label
- `create()` — factory for blank question
- `render(question, context) → RenderNode[]` — single render function for all three backends
- `EditorPanel` — React component for editing
- `countMissingTranslations?` — untranslated-field counter

Currently registered: `mcq` and `structured`. Adding a new type requires only a new definition in this registry — no changes to numbering, marks, persistence, or export orchestration.

Enforced by `src/registry/registry.test.ts`: tests fail if any shared module branches on a concrete `type`.

---

## Editor Layout (`src/components/`)

The preview is the centrepiece; every input lives in the right sidebar (§5.1). The
sidebar is three regions with deliberately different surfaces, so they read as
separate things rather than one undifferentiated column. Two left rails provide
**insert** (AddRail — how content gets on the page) and **navigation** (PageRail — page
thumbnails for cross-page drag-and-drop, visible only when the document spans multiple
sheets).

```
┌────────┬────┬───────────────────────────────┬──────────────────────────┐
│  Add   │Page│                               │ ▶ Worksheet · <title>    │
│  Rail  │Rail│          Preview              │   collapsed: title,      │
│        │    │     (scales-to-fit A4)        │   instructions, fonts    │
│        │    │                               ├──────────────────────────┤
│  Ques- │ 1  │  ⠿ 1 What happens… MC 1m     │  QUESTIONS           [7] │
│  tions │ 2  │  ⠿ 2 Study the tab… MC 1m    │    outline rows          │
│  Layout│ 3  │  ⠿ 3 …                       │    drag, ⋯ overflow      │
│  Elems │    │                               │ ═════ drag resize ══════ │
│        │    │  ← drag item to page card     │  EDITING  Question 2  ✕  │
│        │    │     to land on that sheet →   │  Stem / Options / Marks  │
└────────┴────┴───────────────────────────────┴──────────────────────────┘
```

### Direct manipulation on the page

The previewed worksheet is the primary editing surface — what you click is what you
edit, with the sidebar reserved for structure and for fields that have no place on
the printed page.

```
click once   → select the element (outlined)   → Delete / Backspace removes it
                                               → floating format toolbar appears
click again  → edit the text in place          → Enter commits, Esc cancels
hover        → drag grip appears in the margin → drag to reorder, drop indicator
                                                 marks the insertion edge
```

- **The format toolbar docks along the top of the page column.** It used to float over
  the selection, which put a dark slab directly on the paper covering the two or three
  lines above whatever was being edited — so formatting a section heading hid the
  instruction line it has to sit beneath. Docked, it has one learnable place and never
  occludes the document; it carries a label naming its subject, since it is no longer
  beside it, and the page keeps its violet outline so both ends of the link are visible.
  It stays `fixed` in viewport coordinates (a bar inside the preview's `scale()`
  transform would shrink with the zoom), taking `left`/`width` from the sheet and `top`
  from the scroll container — deriving `top` from the sheet made it ride up over the
  page's own edge once the first sheet scrolled away. The scroller reserves the band
  (`pt-14`) so the bar occupies space the document was never going to use. Every
  control reports current state, and toggling an active one clears the override back to
  the named style.
- **The reorder grip is visible at rest.** It was six 14px dots at `#b9b4ae` on bare
  paper, revealed only on hover — fainter than the document's own text, and
  undiscoverable. It is now a bordered pill with a grip flanked by up/down chevrons
  (~18×34, roughly 3× the hit area), quiet at rest and strengthening on hover. The
  muting is done with **colour rather than `opacity`**, because fading the pill also
  faded the border that makes it read as a control at all.
- **Dragging grabs a margin grip, not the text.** The text is already a click target
  for editing, so making it draggable would make selecting a word impossible. The drop
  indicator is drawn on the hovered item's leading or trailing edge depending on which
  half the pointer is in, and the drop honours that edge.
- **Layout elements drag in the same list as questions**, which is the whole point of
  the flow — a divider can be dropped between question 3 and question 4.

- **Pictures resize where they are** (`preview/ResizableBlock.tsx`). Sizing a diagram
  is a visual judgement — "as wide as the text", "small enough to sit beside the
  table" — so selecting one draws four corner handles and a drag sets its width. Four
  rules make it behave: **width is the only output**, height following the block's own
  aspect ratio via `applyResizeBlock`, the identical rule the sidebar's number field
  obeys (which is also why the handles are corners, not edges — an edge handle would
  promise independent width and height the model does not offer); the delta **divides
  by the preview scale**, since the page sits inside a `scale()` transform; the
  in-flight size is **local state committed once on release**, so a drag that emits
  dozens of widths a second costs one undo entry rather than dozens; and the drag
  clamps to the **text column**, because a picture wider than the column is clipped on
  screen and rescaled by Word, so the size dragged to would not be the size printed.
  `ImageNode` carries a `blockId` for the same reason `DiagramNode` always did — a
  picture has no text, so without it the only way to reach one was its caption.
- **A picture's click target stays mounted while it is selected.** It used to unmount
  the moment the block was selected, leaving only a `pointer-events-none` outline — so
  the *next* click fell through to the question wrapper underneath, whose handler clears
  `selectedBlockId`. The selection was gone before the teacher could act on it, which is
  why Delete on a selected picture appeared to do nothing at all. While selected the
  target insets by 6px so it never covers the corner handles.
- **Double-clicking a diagram opens the drawing canvas** (`onOpenBlock`). The preview
  reports only "this block was double-clicked"; the host resolves the id and renders the
  canvas, which keeps the canvas out of the render path and lets a read-only preview
  stay read-only. It is rendered by `EditorApp` rather than by the sidebar's
  `DiagramEditor`, because that panel only exists while its question is open — a diagram
  reached from the page has no panel to host it. Edits commit through `replaceBlock`,
  which addresses the block by id and so needs no knowledge of its owning question.
- **Clicking blank paper clears every page selection.** "Blank" is decided by what the
  click *landed on* (`isBlankAreaClick` walks up from the target), not by an identity
  test against the paper node: the sheet is a stack of nested layout divs, so the empty
  space below the last question belongs to a child and the old test reported "not
  background" for the most obvious place to click. Both the paper's own handler and the
  marquee sweep share that one definition. All five selections are dropped together —
  clearing only the marquee set left a question armed for Delete, and
  `selectedQuestionId` lives in the store, so clearing it needs `onSelectQuestion`
  to accept `undefined`.
- **Arrow keys nudge a diagram selection**, fine by default and coarse with Shift.
  Routed through the same `dragHandles` a drag uses, so a nudge and a drag produce
  identical geometry and every handle kind — including a tick's along-axis constraint
  and a label's offset — obeys its own rule for free. The step is deliberately not
  scaled by zoom: a nudge is a fixed edit to the geometry, and tying it to the stage's
  zoom would move a curve a different distance each session.
- **No layout shift.** The editor is an `inline-block` textarea that inherits font,
  size and leading and grows to its content, so the list marker stays in its gutter
  and nothing below moves. Measured at Δy=0.0, Δh=0.0.
- **One language at a time.** In bilingual mode the two halves are separate editable
  spans, so clicking the Chinese line writes `zh` and leaves `en` untouched —
  patch-never-replace, the same rule the sidebar follows (§5.2).
- **Two-step engagement is what makes keyboard delete safe.** Delete acts on a
  selection that the user made deliberately, and is ignored whenever focus is inside
  a field, so it can never eat a character being typed. `⌘Z` is scoped the same way.
- **Only one layer owns the keyboard** (`components/ui/modalLayer.ts`). Every keydown
  listener in the editor is attached to `window` — the preview's four delete handlers,
  the drawing canvas's shortcuts — so they share one target and `stopPropagation` cannot
  separate them: they all fire. That was a real bug, not a theoretical one. With a
  diagram selected on the page and the canvas open on top, Delete removed one curve
  *and* ran the preview's handler, deleting the entire diagram block; the canvas's
  `preventDefault` did nothing, because it was never a propagation problem.
  So a full-surface overlay calls `useModalLayer()` to claim the keyboard while it is
  mounted, and every page-level handler asks `isModalLayerOpen()` first. It is a plain
  module-level counter rather than state or context because a keydown handler needs the
  answer **synchronously**, inside the event, before the next render — and a counter
  rather than a boolean so two stacked overlays release only when the last one closes.
  Both failure directions are silent, so both are unit-tested: an unreleased claim kills
  every page shortcut for the session, and a missing claim restores the original bug.
- **Delete picks the right unit per target** (`describeDelete` in `model/edits.ts`):
  a stem paragraph removes the block, a statement leaves the list so the rest
  renumber, a table cell is emptied rather than removed (it would break the grid),
  and an **MCQ option cannot be deleted at all** because §7.2 fixes the count at four.
- **Everything routes through `commit()`**, so in-place edits and deletions get
  undo/redo and autosave with no special handling.

Rules the layout follows:

- **Weight matches consequence.** `src/components/ui` exposes one `Button`/`IconButton`
  with variants; `primary` is reserved for Export, `danger` for destructive actions,
  `subtle` for row actions that recede until hovered. Previously every action shared
  one grey `btn` class, so delete looked like move-up.
- **Row actions are progressive.** A question row spends its width on the stem
  excerpt; duplicate / copy-for-Word / move-to-section / delete live behind a `⋯`
  menu. Glyph-only buttons take a required `label` that becomes both tooltip and
  accessible name.
- **Selection is bidirectional.** Clicking a question in either pane selects it, and
  the other pane scrolls it into view — the preview suppresses its own scroll when
  the click originated there.
- **Depth is carried by rule and label, not by more boxes.** Parts use a left rule
  and a marks pill rather than a fourth nested border.

---

## State Management (`src/store/worksheetStore.ts`)

- Zustand store with undo/redo history (100 entries limit).
- Every mutation goes through `commit(recipe)`, which:
  1. Applies `recipe` to current worksheet
  2. Pushes previous state onto `past` stack
  3. Clears `future` (invaliding redo branch)
- Loading a document resets history.
- Undo/redo are simple stack moves — no special handling for numbering or marks since they're derived.

---

## Persistence (`src/storage/index.ts`)

- `WorksheetStore` interface: `list()`, `load()`, `save()`, `remove()`
- v1 implementation: `LocalStorageWorksheetStore` (browser localStorage)
- **Autosave:** debounced 1.2s after last change
- **File download/upload:** `.worksheet.json` files for portability
- **Migration chain:** `migrate()` runs ordered pure functions (v1→v2→...) on load
- **Forward compatibility:** unknown top-level fields preserved in `__unknown` through load/save
- **`KNOWN_KEYS` must list every top-level field.** An unlisted key is treated as
  written by a newer build: `migrate()` deletes it off the worksheet and stashes it in
  `__unknown`, so it persists to storage but never reaches the model. `titleFormat`,
  `instructionsFormat` and `bands` were all missing, which presented as the font-size
  control "not working" — the size applied live, saved correctly, and vanished on
  reload. A test now fails when a populated worksheet carries a key the set lacks.

---

## Bilingual Text Handling

- Every user-visible string is `BiText { en: RichText, zh: RichText }`
- Rich text uses lightweight inline markers: `**bold**`, `*italic*`, `__underline__`, `^{sup}`, `_{sub}`
- In bilingual mode, English and Chinese share one paragraph separated by a soft `w:br` (Word) or `<br>` (preview/clipboard) — this ensures one list number per bilingual unit
- Per-script fonts: every run carries `w:rFonts` with separate `w:ascii`/`w:hAnsi` (Latin) and `w:eastAsia` (CJK)

---

## Deployed Architecture

```
┌─────────────────────┐
│  Vercel (static)    │
│  ┌───────────────┐  │
│  │ Next.js build │  │
│  │ (prerendered) │  │
│  │ No API routes │  │
│  │ No DB         │  │
│  │ No server     │  │
│  └───────────────┘  │
└─────────────────────┘
         │
         ▼
    Browser loads JS
    .docx generated client-side (atob + JSZip)
    localStorage for autosave
    File download/upload for portability
```