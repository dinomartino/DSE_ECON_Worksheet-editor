# Glossary

Words this repository uses in its own way. One line each, with where the thing lives.

- **IR** — the neutral `RenderNode[]` a question renders into once, read by all three
  backends. `src/render/ir.ts`
- **Backend** — a consumer of the IR: preview, `.docx`, clipboard. Never a server.
- **Edit target** — an id-keyed address for one authored string on the page, so a click
  becomes a typed edit. `src/render/ir.ts` · `src/model/edits.ts`
- **Band** — one printed row of the masthead or a header/footer: one Word paragraph with
  tab stops, not a table. `src/model/bands.ts`
- **Zone** — one of a band's three fixed slots (left/centre/right). Placement is
  slot-based, never free. `src/model/bands.ts`
- **Band field** — authored prefix · derived value · authored suffix inside a zone.
  `src/model/bandSegments.ts`
- **Flow** — the interleaved display order of questions and layout elements. It positions
  layout only; `questions` owns question order. `src/model/flow.ts`
- **Section-as-marker** — a `section` is a `LayoutElement` carrying `restartNumbering`, not
  a container; the questions after it simply follow it. `src/model/types.ts`
- **Layout element** — anything on the page that is not a question: heading, spacer,
  divider, page break, answer lines, part header, stimulus, label list.
- **Stimulus** — a shared lead-in owned by a layout element and spanning the next N
  questions, which number against it. `src/model/flow.ts:createStimulusElement`
- **Source** — a *labelled panel* block ("Source A") framing a mix of blocks, with its own
  label line and footnote. Not the same thing as a stimulus. `src/model/types.ts:SourceBlock`
- **Provenance** — an MCQ's teacher-only source note ("Modelled on DSE 2023 Q1"), printed
  "Source:"; not a Source panel. `src/model/types.ts:McqQuestion`
- **Rationale** — why one MCQ option is right or wrong; teacher-only, stored on the option.
  `src/model/types.ts:McqOption`
- **Marking scheme** — HKEAA notation on a part or sub-part (`/` alternatives, `n@`,
  `max: N`, OR routes, levels, EC) with derived totals; teacher-only.
  `src/model/markSchemeTypes.ts:MarkScheme` · `src/model/markScheme.ts`
- **Stem** — a question's own text, above its parts. `STEM_TEXT_INDENT` in `src/model/numbering.ts`
- **Part / sub-part** — `(a)` and `(i)`; marks may be absent, shared, or per sub-part.
  `src/model/marks.ts`
- **QAB** — Question-Answer Book: the long-question booklet, a 10pt document with dotted
  answer space and page furniture. `src/model/pageFurniture.ts:isQabDocument`
- **LQ** — long question; LQ mode is the QAB's feature set. `src/export/docx/styles.ts:LQ_LINE_PITCH_TWIPS`
- **Combined answer key** — one answer-key `.docx` covering several saved documents (Paper 1
  + Paper 2), chosen in Export; export-time only. `src/render/answerKey.ts:renderCombinedAnswerKey`
- **Paper 1** — the HKDSE multiple-choice paper shape: wider boundaries, derived question
  count, its own indents. `src/model/documentShape.ts`
- **Paper 2** — the long-question paper; in this app, the QAB with 58% dotted answer lines.
- **Document shape** — which of `classroom` · `paper1` · `lqWorksheet` · `lqMock` a document
  is, derived not stored; it decides what the editor offers. `src/model/documentShape.ts`
- **Answer lines** — ruled lines (paragraph bottom border, 24pt pitch). A different
  primitive from answer space. `src/render/ir.ts:AnswerLinesNode`
- **Graph space** — blank axes (optional grid) a student draws a diagram on; a part's
  `answerGraph`, whole 12pt lines tall, one PNG in the `.docx`. `src/render/ir.ts:AnswerGraphNode`
- **Model answer diagram** — a teacher-only `DiagramBlock` on a leaf's `answerDiagram`: the
  answer to "draw a diagram", printed after the answer text and in the answer key.
  `src/components/editor/AnswerDiagramRow.tsx:AnswerDiagramRow`
- **Answer space** — the QAB's dotted lines (dotted underline over a tab, 22.1pt pitch).
  `src/render/ir.ts:AnswerSpaceNode`
- **Fill answer space** — an `answerSpace` whose `lines` is the paginator's *output*, not
  the author's input; it absorbs the sheet's slack and ends the sheet.
  `src/components/preview/pagination.ts:resolveFillCounts`
- **Boundary gap** — the blank line the walker inserts between two items; `examGapLines`
  widens it for a paper. `src/render/ir.ts:pushGap`
- **Cover** — a mock exam's front page: two unequal columns of regions, never seen by the
  paginator. `src/model/cover.ts`
- **Furniture** — per-page frame and margin notes, drawn as one running header of anchored
  shapes. `src/model/pageFurniture.ts` · `src/export/docx/furniture.ts`
- **Sheet / paper** — one `.paper` element in the preview: a measured page, derived, never
  stored. `src/components/preview/pagination.ts`
- **`KNOWN_KEYS`** — the allowlist of `Worksheet` fields; anything absent from it is stashed
  into `__unknown` and disappears from the typed document. `src/model/migrations.ts`
- **`__unknown`** — fields written by a newer build, preserved verbatim through a
  round-trip so a downgrade does not destroy them. `src/model/migrations.ts`
- **Corpus** — `src/test/corpus/v1-published.json`, a frozen document written by the
  shipped v1 build. Never regenerated.
- **Index** — the `econ-worksheet-index` summary array (or `index.json` on desktop); the
  other half of storage, validated per row. `src/storage/summaries.ts`
- **Folder** — a dashboard label a document is filed under; metadata in its own key/file,
  never in the index or the document. A missing or stale one means "at root".
  `src/storage/folders.ts:FolderState`
- **Platform adapter** — `src/platform/index.ts`: the only place that may reach Tauri, always
  through a dynamic import behind `isDesktop()`.
- **`data-print-hide`** — the attribute that keeps on-page chrome out of the print PDF.
  `src/app/globals.css`
- **Teacher-only** — a node included in the teacher version and filtered from the student
  one, by `OutputMode`. `src/render/ir.ts:includeNode`
- **Twips** — 1/20 pt, Word's unit; every stored geometry is in twips. `src/model/page.ts`
- **Hatch pattern** — how a hatched area is drawn (diagonal, reverse, cross, horizontal,
  vertical, dots; normal or dense): plain clipped lines or dots, never an SVG `<pattern>`,
  so areas differ on a monochrome copy. `src/render/diagram.ts:areaFillMarkup`
- **Preset role** — the part a curve or line plays for a Shade preset (demand, supply,
  shifted supply, price line, Pw, Pw + t, MR, MC); guessed, or picked when ambiguous.
  `src/model/diagramPresets.ts:PresetRoles`
- **Band cap** — an optional third edge that trims a band's edge 0 toward edge 1, so a
  rectangle-plus-triangle (CS loss, PS gain) is one area. `src/model/diagramAreas.ts:areaPolygon`
- **Revenue area** — TR (a band under E's price to E's quantity) or a revenue gain/loss:
  one P×Q rectangle less another, derived from two points each render — a rectangle, an
  L, or nothing. `src/model/diagramAreas.ts:revenueArea`
- **Anchor** — a position named by what is drawn ("where D meets S", "S at Pw + t"),
  not by coordinates; an anchored point follows it. `src/model/diagramAnchors.ts:resolveAnchor`
- **Derived curve** — a curve defined by a relation (MR of D, parallel, tangent, a level);
  `points` keeps its last resolved shape. `src/model/diagramAnchors.ts:resolveDiagram`
- **Span** — a bracket or change arrow between two places (shortage, tax wedge, P₁→P₂),
  optionally on an axis. `src/model/diagramSpans.ts:spanGeometry`
- **Diagram template** — a starting geometry picked by shape, grouped by syllabus topic; an
  initial value only (`templateId` is a note, never a dependency), so a shipped id is never
  removed. `src/model/diagramTemplates.ts:DIAGRAM_TEMPLATES`
- **Unit space** — a diagram's 0–1 coordinate system; pixels come only from
  `src/render/diagram.ts:diagramPlot`.
- **Run** — one formatted span of text; `RichText` is `InlineRun[]` and a `\n` inside
  `run.text` is a real line break. `src/model/types.ts:InlineRun`
- **BiText** — `{ en, zh }`, the bilingual pair every authored string is. `src/model/text.ts`
