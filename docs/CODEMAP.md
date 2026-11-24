# Code map

The short map of the repository. For *why* a rule exists, follow the pointer into
[`SYSTEM_ARCHITECTURE.md`](../SYSTEM_ARCHITECTURE.md) — open only the section you touch.
How-to guides: [`RECIPES.md`](./RECIPES.md). Vocabulary: [`GLOSSARY.md`](./GLOSSARY.md).
What we are doing now: [`STATUS.md`](./STATUS.md).

`src/test/codemap.test.ts` checks every path and `path:symbol` here still exists.

## Data flow in one screen

```
StartScreen ──open──► worksheetStore (Zustand, undo/redo) ──► Worksheet
      ▲                       │
      │                       ├─ autosave (1.2s, dirty only) ─► storage: localStorage | files
      │                       │                                  econ-worksheet:<id> + …-index
   storage index              ▼
                      renderWorksheet(worksheet, mode)        ← registry.render() per question
                              │
                              ▼
                        RenderNode[]  (the IR — one emission, three readers)
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
      Preview.tsx        docx/index.ts     clipboard.ts
      (React DOM)        (raw OOXML)       (text/html)
             │
        packPages() → sheets → printWorksheetPdf() → window.print() (web) / print_to_pdf (desktop) → PDF
```

## model — the document, and every pure edit on it

`src/model/types.ts:Worksheet` · `ContentBlock` · `LayoutElement` · `Question` —
the whole schema, one file.

- `src/model/migrations.ts:KNOWN_KEYS` · `:CURRENT_SCHEMA_VERSION` · `:migrate` · `:serializeWorksheet` · `:writtenSchemaVersion` · `:isNewerThanBuild`
- `src/model/flow.ts:resolveFlow` · `:applyOrder` · `:moveRunInFlow` — display order
- `src/model/numbering.ts:computeNumbering` · `:listIndentScheme` — derived numbers
- `src/model/marks.ts:partMarks` · `:questionMarks` · `:sectionMarks` · `:sectionRuns` — derived totals; an "answer any n" section (`answerCount`) counts its best n
- `src/model/edits.ts:applyEditTarget` · `:applyDeleteTarget` · `:insertBlockAfter` — every mutation recipe
- `src/model/lineage.ts:freshIds` · `:copyQuestion` · `:rootIdOf` · `:questionIdOwners` — every id a question holds, renewed for a copy (a diagram's own geometry is kept); `src/model/dedupeIds.ts:dedupeIds` — ids held twice repaired on open, in `src/storage/document.ts:parseWorksheet`
- `src/model/topics.ts:TOPICS` · `:topicOf` · `:parentCode` · `:matchesTopic` · `:topicLabel` — the EDB topic taxonomy as data; `Question.tags` stores codes, names are looked up. On screen a topic is its name, never its slug: `:topicDisplay` ("Law of demand 需求定律"; an unknown code as stored) · `:topicHeading` ("C · Law of demand", and tooltips), with `src/model/patterns.ts:tagText` for a tag of any kind. The tag grammar: `:TOPIC_CODE_PATTERN` · `:SYSTEM_TAG_SIGIL` · `:rollupTopic` · `:stringTags`, with `src/model/patterns.ts:isReservedTag` · `:freeTagIssue`
- `src/model/excerpt.ts:questionExcerpt` · `:biTextExcerpt` · `:blocksExcerpt` — one-line plain text of a stem (Outline, panel rows, the bank), the asked-for language first
- `src/model/bands.ts:createBand` · `src/model/bandSegments.ts:bandFieldSegments` — masthead rows
- `src/model/text.ts:BiText` helpers — `:rt` · `:plain` · `:normalizeRuns` · `:applyRunFormat`
- `src/model/page.ts:pageSetupOf` · `:headerFooterOffsets` · `src/model/pageFurniture.ts:furnitureBoxes`
- `src/model/watermark.ts:watermarkOf` · `:sheetWatermarks` · `:withSheetWatermark` · `:withPaperWatermark` · `:watermarkBox` · `:docxWatermarkPlan` — the watermark behind a paper's pages (k-0242): `Worksheet.watermark` holds the paper's own copy of the picture, its switch and per-page choices keyed by a flow id on the page (a page is derived; `WATERMARK_FIRST_PAGE` for a first page with no flow item); drawn by `src/components/preview/WatermarkLayer.tsx:WatermarkLayer` (switch `:SheetWatermarkToggle`; drag to move, corners to resize: `:WatermarkAdjuster` → `src/model/watermark.ts:withWatermarkPlacement`, `:withDefaultPlacement`, `:withCenteredPlacement`), anchored in the `.docx` by `src/export/docx/watermark.ts:watermarkRunXml` (running header when every page has it, `:withLeadingRun` at each measured sheet head, `measurePaperPagination`, when pages differ). The marking scheme follows the paper: `src/model/watermark.ts:keySheetWatermarks` · `:questionWatermarks`, drawn by `src/components/preview/AnswerKeyPreview.tsx`, paper sheets from `src/components/preview/PageCountProbe.tsx:PaperSheetsProbe` and `src/components/preview/measurePageStarts.tsx:measureAnswerKeyPagination`. The saved list is app settings, not a document: `src/settings/watermarks.ts:WATERMARK_SETTINGS`; UI in `src/components/watermark/` (`WatermarkButton.tsx`, `WatermarkField.tsx` in Setup → Page, `WatermarksSection.tsx` in Settings); browser proof `scripts/watermark-verify.mjs`
- `src/model/cover.ts:examinerGridBands` · `:COVER_GRID` · `:EXAMINER_GRID_WORDING` — the cover's opt-in "For examiner's use" grid (`src/model/coverTypes.ts:CoverPage` `examinerGrid`, a switch; numbers and marks derived), laid out as `src/render/ir.ts:CoverGridRender` and drawn by `src/export/docx/body.ts:examinerGridXml` and `src/components/preview/Preview.tsx:ExaminerGridView`
- `src/model/cover.ts:createCoverPage` · `src/model/documentShape.ts:documentShape` · `:paperKind` (the shape refined by content: dotted answer space → LQ worksheet)
- `src/model/versions.ts:activeVersion` · `:shuffledOrder` · `:versionHeaderText` — paper versions A/B/C; only `Worksheet.versions` (count + seed) is stored; the letter rides the running header as a last row (`src/model/page.ts:versionRowStandsAlone`); the Teacher version's marker joins the same header (`src/model/headerMarks.ts:teacherMarkPlacement`), both on page 1 per `:derivedMarksOnPageOne`
- `src/model/markScheme.ts:schemeMax` · `:groupMax` · `:schemeMismatch` — HKEAA marking-scheme totals, derived; types in `src/model/markSchemeTypes.ts:MarkScheme`
- `src/model/drq.ts:createDrqContent` · `:createSourceOf` · `:withSourceReference` · `:essayNote` · `:sourceLetter` — a DRQ as DSE Paper 2 sets it (k-0474): the source kinds, the DRQ starter (Sources A–D, parts (a)–(e)), "Refer to Source …" in both languages, the essay part's note. Starting values and text edits only, no stored shape; the views table is `src/model/tableTemplates.ts:TABLE_TEMPLATES` `views`
- `src/model/paperHealth.ts:checkPaper` — the pre-print check, derived; `src/components/editor/PaperHealthPanel.tsx:PaperHealthPanel` shows it, for the edition chosen in Export (`src/components/editor/ExportPaperCheck.tsx:ExportPaperCheck`; another mode's page count comes from a hidden `src/components/preview/PageCountProbe.tsx:PageCountProbe`)
- `src/model/paperSummary.ts:summarizePaper` · `:estimateMinutes` · `:MINUTES_PER_MARK` · `:targetOf` — per-type counts, marks, minutes against the optional `Worksheet.target`; the one time model (`checkPaper` reads it); `src/components/editor/PaperSummaryBar.tsx:PaperSummaryBar` is the toolbar line, the Target row is in `DocumentSettings`
- `src/model/diagram.ts:Diagram` · `src/model/diagramDraw.ts:applyDrag` · `src/model/diagramTemplates.ts:DIAGRAM_TEMPLATES`
- `src/model/diagramAreas.ts:areaPolygon` · `:presetArea` · `:detachAreas` — shaded areas as references; `src/model/diagramShift.ts:shiftCurve` — D→D₁ plus the new equilibrium, both equilibria anchored and unnamed (`:equilibriumLabelSide` places a name added later)
- `src/model/diagramAnchors.ts:resolveAnchor` · `:resolveDiagram` · `:detachRelations` — anchored points (`DiagramPointMark.anchor`) and derived curves (`DiagramCurve.derive`: MR, parallel (optional `ys` bounds), shift — a copy that follows its source, importQuota — S with an import quota at Pw, tangent, level, vertical); resolved values written into `at`/`points`
- `src/model/diagramSpans.ts:spanGeometry` · `src/render/diagramSpan.ts:spanLayout` — `Diagram.spans`: bracket, arrow, double arrow, dimension between two places; an axis span rests past the tick labels by `src/render/diagram.ts:axisSpanClearance`; `src/model/diagramDraw.ts:snapPlace` · `:attachPointOnDrop` — attach on release
- `src/model/diagram.ts:axisValue` · `:axisUnit` · `:axisTickLabel` — `DiagramAxis.max` value scale; `src/components/editor/DiagramRelationControls.tsx:SpanInspector` · `:CurveRelationControls`
- `src/model/diagramTemplates.ts:DIAGRAM_TEMPLATE_GROUPS` · `:buildFromTemplate` — one template per scheme diagram type, by topic; bodies in `src/model/diagramTemplatesMarket.ts` · `src/model/diagramTemplatesMacro.ts` · `src/model/diagramTemplatesTrade.ts`, written in relations with `src/model/diagramTemplateKit.ts:eq` · `:shiftOf` · `:priceLine` · `:reading` · `:axisArrows` · `:shade` · `:finish` (anchored equilibria, derived curves, spans, Shade presets; `finish` resolves them so older builds draw the shape). A shipped id is never removed
- `src/model/diagramAreas.ts:areaPolygon` · `:presetArea` · `:detachAreas` — shaded areas as references; `src/model/diagramShift.ts:shiftCurve` — D→D₁ plus the new equilibrium
- `src/model/diagramAreas.ts:newPresetArea` · `:PRESET_PATTERNS` — a welfare preset as the menu adds it (hatched, its own pattern); `:revenueArea` · `:rectangleDifference` · `:guessRevenuePoints` — TR, revenue gain/loss (`DiagramArea.revenue`, derived rectangle or L)
- `src/model/diagramPresets.ts:SHADE_PRESETS` · `:planPreset` · `:guessRoles` · `:presetStatus` — the grouped Shade catalogue: presets declare roles (D, S, S₁, price lines, MR, MC), the menu guesses or asks; `:onCurveAtLevelSupported` gates point-level prices on the `{ on, y }` anchor
- `src/model/diagramAreas.ts:areaPolygon` reads `band.cap` (a third edge trimming edge 0 — the trapezium presets as one area) via `cappedBandPolygon`
- `src/render/diagram.ts:areaLabelLayout` · `:AREA_PALETTE` · `:areaLabelSeedOffset` — area colour and the inside/leader label rule; pixel geometry in `src/render/diagramLeader.ts:placeOutside` · `:leaderLine`
- `src/render/diagram.ts:areaFillMarkup` · `:hatchLines` · `:hatchDots` — shade, or the six hatch patterns as clipped segments/dots; the inspector's swatches draw with it
- `src/model/table.ts:insertRow` · `:resolveCellPadding` · `:resolveColumnWidths`
- `src/model/table.ts:mergeRange` · `:stackCellTexts` · `:formatCells` · `:setColumnWidthTwips` — Word's Merge Cells (texts kept), range formatting, exact widths; `src/model/tableClipboard.ts:gridFromClipboard` · `:fillCells` · `:rangeToClipboard` — tables pasted in, ranges copied out
- `src/model/table.ts:withHeaderRows` · `:styleCells` · `:CELL_SHADES` — heading rows that repeat on each page, vertical alignment and grey shading (Tables vs Word, phase 3)
- `src/model/factories.ts:createWorksheet` · `src/model/newWorksheet.ts:createWorksheetFrom`
- `src/model/factories.ts:createAnswerDiagram` · `src/model/edits.ts:isAnswerDiagram` — a leaf's model answer diagram (`answerDiagram`), found and patched by block id like a stem figure
- `src/model/diagramAnswers.ts:answerLayer` · `:markNewAsAnswers` · `:answeredDiagrams` — the answer layer (`answer: true` on a diagram element): what the student version drops (dependents included); `src/render/ir.ts:withAnswerLayers` sets `DiagramNode.answers` in the teacher version, `diagramSvg`'s `answers` draws it in `src/render/diagram.ts:ANSWER_INK`
- `src/model/factories.ts:FONT_PRESETS` — the font pairs offered; `src/model/fonts.ts:cssFontFamilies` spells a pair as CSS (preview, print, clipboard, diagram SVG), adding browser stand-ins for faces a Mac lacks (DFKai-SB → Kai); the `.docx` writes the stored name only

Invariants:
- Numbering and marks are derived, never stored — §Document model.
- `questions` owns question order; `flow` only positions layout elements — §Document flow.
- A `section` is a marker carrying `restartNumbering`, not a container — §A section is a marker.
- A new optional field must be in `KNOWN_KEYS` or it vanishes on reload — §The published-document promise.
- A document from a newer build opens read-only and is never overwritten — §Schema evolution.
- A second copy of a question in one document goes through `freshIds`; any id left shared makes an edit to one land in both — §Persistence.
- A band field is authored wording around a derived value — §A field is authored wording.

## registry — the question-type extension point

`src/registry/types.ts:QuestionTypeDefinition` — `id` · `create` · `render` · `EditorPanel` ·
`mapTexts` · `examGapLines?` · `healthFacts?` · `answerKey?` · `variant?` ·
`summary?` (short count label + `minutesPerItem`, for the paper summary) · `qualityView?` (anchors for the AI quality check) · `paperKinds?` (the papers it normally belongs on; advisory, `src/library/paperTypes.ts:paperTypeIds`).

- `src/registry/index.ts:listQuestionTypes` · `:requireQuestionType`
- `src/registry/mcq.ts:printedOptionLayout` — the set layout, or the next one that holds the text
  (inline → 2 columns → grid), measured by `src/render/textWidth.ts:lineWidthTwips`
- `src/registry/mcqLayouts.ts:withOptionLayouts` · `:planOptionLayouts` · `:optionLayoutTally` — Setup →
  Option layout for all MC questions: every MC question's own `optionLayout` (stacked stored as absence;
  figure options never go in a row; Fit each question = `suggestOptionLayout` per question, in the on-screen
  language), so the page, thumbnails, `.docx` and clipboard follow through the IR with no code of their own.
  The Setup block is `src/components/editor/OptionLayoutField.tsx:OptionLayoutField`; its click is
  `src/components/editor/optionLayoutAction.ts:applyOptionLayout` (one `commit`, a count, an Undo bound to that
  commit). Tests: `src/registry/mcqLayouts.test.ts`, `src/registry/mcqLayoutsSurfaces.test.tsx` (every surface,
  bulk = by hand), `src/components/editor/optionLayoutAction.test.ts`; fixture `src/test/optionLayoutFixture.ts:buildOptionLayoutPaper`;
  browser proof `scripts/option-layout-verify.mjs`
- `src/registry/mcq.ts:mcqType` · `:resolveOptionLayout` · `:optionRationales` — teacher-only notes:
  `McqOption.rationale` (travels with its option through a shuffle) and `McqQuestion.provenance`
  ("Source:", `src/model/text.ts:provenanceLabel`); teacher version + answer key only
- `src/registry/structured.ts:structuredType`

Invariants:
- No shared module branches on a concrete type id; `src/registry/registry.test.ts` greps eighteen modules — §Question-type registry.
- A hand-built numbered paragraph must copy the block's `format` itself — same section.

## render — the IR, and the walker that fills it

`src/render/ir.ts:RenderNode` · `:EditTarget` · `:RenderContext` · `:renderContentBlocks` ·
`:pushGap` · `:BLANK_LINE_PT`.

- `src/render/worksheet.ts:renderWorksheet` — the one walker; `:collectListStreams`
- `src/render/questionGap.ts:boundaryGapLines` · `:stimulusGapLines` · `:gapNumberApplies` · `:defaultGapLines` · `:gapAboveStatus` — the air
  between two questions, one rule on every paper shape: straight under a question of the same type the width is the
  question's own `gapBefore`, then Setup's `Worksheet.examGapLines`, then (a Paper 1 only) the type's measured
  `examGapLines`; one line anywhere else, so a paper nobody set a number on prints as before. `render/ir.ts:withLeadingGap`
  puts it on the question's first paragraph (it dies at a sheet top), so the page, thumbnails, `.docx` and clipboard follow
  with no code of their own. The controls: `src/components/editor/BetweenQuestionsField.tsx:BetweenQuestionsField` (Setup →
  Page) and `src/components/editor/SpaceAboveField.tsx:SpaceAboveField` (both question panels; says why when its number
  cannot be used); the drag handle on the page reads `RenderedQuestion.adjustableGap`. No new field. Tests:
  `src/render/questionGap.test.ts` (the rule, with the 0.8.4 rule frozen beside it), `src/render/questionGapSurfaces.test.tsx`
  (every surface), `src/components/editor/SpaceAboveField.test.tsx`, `src/components/editor/BetweenQuestionsField.test.tsx`,
  `src/components/editor/spaceAbovePanels.test.tsx`, `src/store/questionGapActions.test.ts`; fixtures
  `src/test/questionGapFixture.ts:buildQuestionGapPaper` and `test-fixtures/manual/question-gap-mix.json`; browser proof
  `scripts/question-gap-verify.mjs`
- `src/render/pageFlow.ts:sheetStart` · `:sheetOpeners` · `:startsPageStatus` · `:isKeptWhole` — what a question asks of its page:
  `QuestionBase.startOnNewPage` (a sheet opens at the question, or at the heading, lead-in or source that opens the run of
  elements above it, with a rubric under the heading; never for the first question or straight under a New page element) and
  `keepOnOnePage` (a structured question the paginator offers no break inside; an MC and a Paper 1's questions are kept whole
  already, `isKeptWhole`). The walker stamps `RenderedQuestion.startsPage` · `:keptTogether` · `RenderedLayout.startsPage` and
  leaves no gap above what opens a sheet; `src/components/preview/flowFlags.ts:startsSheetOf` · `:keptTogetherOf` hand them
  to the paginator (`pagination.ts:PackItem` `startsSheet`, `breakAfter: []`). The `.docx` has no code of its own (it breaks where
  the measured sheets do); Copy for Word writes the break (`export/clipboard.ts:worksheetClipboardHtml`); `model/lineage.ts:copyQuestion`
  leaves `startOnNewPage` behind. The controls: `src/components/editor/PageFlowFields.tsx:PageFlowFields` (both question
  panels, under Space above). Both fields are `contentKey` metadata. Tests: `src/render/pageFlow.test.ts` (the rules, the
  marks), `src/render/pageFlowSurfaces.test.tsx` (paginator, `.docx`, Copy for Word, the card), `src/components/preview/pagination.test.ts`,
  `src/components/editor/PageFlowFields.test.tsx` · `pageFlowPanels.test.tsx`, `src/store/pageFlowActions.test.ts`; fixtures
  `src/test/pageFlowFixture.ts:buildPageFlowPaper` and `test-fixtures/manual/page-flow-mix.json`; browser proof
  `scripts/page-flow-verify.mjs`
- `src/render/answerKey.ts:renderAnswerKey` — the separate answer key; entries come from the `answerKey` hook
- `src/render/answerKey.ts:answerKeyView` — the same nodes plus each node's question and the key's own fields (title, subtitle), for the Marking scheme view; it hands them back through `:withSpacedKey`, the paper's Line spacing on every text line and hung row of the key (k-0483; tables, diagrams, gaps and the title lines keep theirs), so the view, print and every key `.docx` agree
- `src/render/answerKey.ts:collectAnswerKey` → `:ANSWER_KEY_STYLES` → `:renderStandardKey` — the key's data gathered once, laid out by its preset's style; `src/render/answerKeySections.ts:MC_KEY_RENDERERS` · `:LQ_KEY_RENDERERS` are the per-section layouts (grid / HKEAA table / list / reasons table; compact / Marks column / Detailed table / Suggested answers' answers-only)
- `src/model/answerKeyLayout.ts:ANSWER_KEY_FIXED` — what a preset decides alone (Suggested answers: LQ layout, legend, disclaimer, sources); stored changes to it are ignored. Leak tests: `src/render/suggestedAnswers.test.tsx` over `src/test/suggestedAnswersFixture.ts:buildLeakWorksheet`
- `src/render/ir.ts:TableNode` `headerRows` · `rowKeepNext` — a table that breaks between rows; `src/components/preview/AnswerKeyPreview.tsx:keyUnits` · `:runNodes` pack it row by row, its heading again on a sheet it opens (`src/components/preview/pagination.ts:PackItem` `leadKey`)
- `src/model/answerKeyLayout.ts:resolveAnswerKeyLayout` — `Worksheet.answerKeyLayout` (preset + deltas) to every setting; `:ANSWER_KEY_PRESETS` · `:withAnswerKeyPreset` · `:withAnswerKeySetting` · `:normalizeAnswerKeyLayout` (on load)
- `src/render/answerKeySections.ts:answerKeyRunningHead` — "Marks / 分數" atop every page of a key with a Marks column (`TextNode.marksColumn`); the `.docx` header and the preview read the same
- `src/model/coverageReports.ts:normalizeCoverageReports` — `Worksheet.coverageReports` (k-0489 v2): saved syllabus coverage checks, newest first, at most five readable per paper; record format `v: 1`, each run's results + `fingerprint`; never printed, never raises the written schema version
- `src/model/examResults.ts:normalizeExamResults` — `Worksheet.examResults` (k-0471): MC % correct by question id and the MC / structured comments, key only; printed by `src/render/answerKeySections.ts:keyText` ("B (65%)") and `src/render/examResultsKey.ts:renderPerformance` (end of the key); entered in `src/components/editor/ExamResultsDialog.tsx` from the Layout tab (`src/components/editor/ExamResultsSection.tsx`); switches `showMcPercent` / `showPerformance`. Browser proof: `scripts/exam-results-verify.mjs`
- `src/render/answerKey.ts:AnswerKeyRow` — `diagram` carries a leaf's model answer diagram; `src/render/ir.ts:diagramNodeFor` builds its node
- `src/render/answerKey.ts:renderCombinedAnswerKey` · `:answerKeyPartTitle` · `:answerKeyParts` — several saved documents' keys in one file, each under its paper's heading; in the `.docx` a section each, in its document's page setup and body size
- `src/render/markScheme.ts:schemeParagraphs` — a scheme shown as one paragraph per route with its total (`MarkScheme.display`, k-0470); `src/render/answerKeySections.ts:ecBlock` — the key's EC as HKEAA's Marks | Performance table; `src/model/markScheme.ts:HKEAA_EC_STANDARD` — the standard EC rows
- `src/model/markSchemePatterns.ts:createSchemeFromPattern` — a DRQ part's scheme from a pattern sized to its marks (k-0475); `src/components/editor/SchemeStatusChip.tsx:SchemeStatusChip` — the part row's scheme chip; `src/model/markScheme.ts:statedContentMax` — a stated content mark over indicative points
- `src/render/markScheme.ts:renderMarkScheme` — a part's HKEAA scheme as `Marking Scheme` paragraphs; marks ride `TextNode.trail` (`src/render/ir.ts:trailLabel`); given `at`, its text carries scheme edit targets (`src/model/markScheme.ts:withSchemeText` writes them)
- `src/render/diagram.ts:diagramSvg` · `:diagramPlot` · `:diagramSize` · `:flowChartLayout` · `:forumChartLayout` · `:stakeholderChartLayout` · `:chartLayout`
- `src/render/answerGraph.ts:answerGraphNode` · `:answerGraphBox` · `:answerGraphSvg` — blank answer axes (`src/model/answerGraph.ts:createAnswerGraph`); PNG via the diagram pre-pass, whole 12pt lines

Invariants:
- One IR, three backends; they must never disagree — §The central principle.
- `edit` targets are inert in export — §Render IR.
- Derived text carries no edit target — §Render IR.
- Pixel↔unit maths for a diagram comes from `diagramPlot()`, never from the canvas — §Drawing.

## export/docx — raw OOXML, built client-side

`src/export/docx/index.ts:exportDocx` · `:exportDocxBuffer` · `:docxFileName` ·
`:exportAnswerKeyDocx` · `:answerKeyFileName` (from `src/export/docx/fileNames.ts`, light enough to name a file before the builders load).

- `src/export/docx/body.ts:renderNodeXml` · `:coverXml` · `:formatParagraphProps`
- `src/export/docx/styles.ts:buildStylesXml` · `:FIXED_LINE_TWIPS` · `:exactLineFor` · `:LQ_LINE_PITCH_TWIPS`
- `src/export/docx/numbering.ts:buildNumberingXml` · `:assignNumIds`
- `src/export/docx/runs.ts:richTextRuns` · `:marksRuns` · `src/export/docx/xml.ts:escapeXml`
- `src/export/docx/package.ts:buildDocumentRelsXml` · `:buildHeaderXml` · `src/export/docx/furniture.ts:furnitureHeaderXml`
- `src/export/docx/pageBreaks.ts:joinWithPageBreaks` · `:itemUnits` · `:keyBodyXml` — page breaks at the preview's sheet starts, measured by `src/components/preview/measurePageStarts.tsx:measurePaperPageStarts` · `:measureAnswerKeyPageStarts` (`src/components/preview/pagination.ts:pageStarts`)

Invariants:
- Fixed 12pt line, no paragraph spacing; separation costs a blank line — §One fixed line.
- Side-by-side layout exports as tab stops, never a table — §One row, many uses.
- `baseFontSize` scales body styles; the 12pt line never shrinks — §The booklet is a 10pt document.
- `justifyText` justifies through the body styles, never `Body` — §One row, many uses.
- An LQ style is emitted only when the rendered IR uses one — §The dotted answer line.
- No `w:keepNext` / `w:keepLines` / `w:pageBreakBefore` in any part; pages break where the preview's do — §The `.docx` breaks its pages where the preview does.

## export (other)

- `src/export/clipboard.ts:questionClipboardHtml` · `:copyForWord` — the third backend: one question to Word (Outline ⋯); `:worksheetClipboardHtml` feeds the start-screen thumbnail
- `src/export/diagramImage.ts:renderDiagramImages` — PNG pre-pass; one image per diagram
- `src/export/diagramImage.ts:renderNodeDiagramImages` — the same pre-pass over a stand-alone IR (the answer key)
- `src/export/imageImport.ts:prepareImageForStorage` · `:planImageImport` — downscale on paste
- `src/export/csv/answerKeyCsv.ts:buildAppExport` — MCQ key for ZipGrade / plain CSV, MCQs
  for Kahoot / Blooket; reads the registry's `answerKey` and `quizItem` hooks; warns, never
  truncates. `src/export/csv/xlsx.ts:buildXlsx` — minimal one-sheet `.xlsx`

Invariant: a diagram is geometry in, exactly one rasterised PNG out — §Geometry in, one image out.

## store — Zustand, undo/redo

`src/store/worksheetStore.ts:useWorksheetStore` — every mutation goes through one
`commit` (pure recipe + undo push); 100-entry history.

Invariants:
- Actions are thin; the work lives in `model/edits`, `model/flow`, `model/bands` — §Store.
- A drag commits once, on pointer-up — memory `drag-gestures-commit-once`.
- Autosave only fires on dirty; flush by value before swapping or unmounting — §The start screen.
- `readOnly` (a newer build's document) makes `commit`, undo/redo and `save` inert and holds print preview — §Schema evolution.

## storage — two halves that fail independently

`src/storage/index.ts:worksheetStore` — chosen once at load: file store on desktop, else
`:LocalStorageWorksheetStore`; wrapped in the change feed (`src/storage/changes.ts:withChangeFeed`).

- `src/storage/types.ts:WorksheetStore` · `:WorksheetSummary`
- `src/storage/fileStore.ts:FileWorksheetStore` — `$APPDATA/worksheets/<id>.worksheet.json` + `index.json`
- `src/storage/summaries.ts:usableSummaries` — per-row validation, shared by both stores
- `src/storage/trash.ts:usableTrash` · `:settleTrash` — Trash rows (a separate list, 30-day lazy purge)
- `src/storage/folders.ts:usableFolders` · `:folderOf` · `:updateFolders` · `:mergeBackupFolders` — dashboard folders
  (metadata, a separate key/file; every failure reads as "at root")
- `src/model/paperSet.ts:paperSetOf` · `:setRoleOf` · `src/storage/paperSets.ts:setGroups` · `:changeSetMembers` — paper sets
  (k-0299): stored in each member, grouped from index rows; `src/components/start/dashboard.ts:dashboardEntries` frames them,
  `src/components/editor/PaperSetStrip.tsx:PaperSetStrip` lists them in the editor (and reads the set once for `src/components/editor/setMembers.ts:useSetPapers`)
- `src/model/setDetails.ts:sharedLines` · `:withDetails` · `:detailDrift` — step B: school / examination (`CoverLine.sharedAs`), date sat, classes,
  copied into each paper; `src/components/start/SetDetailsDialog.tsx:SetDetailsDialog` (start screen ⋯ and the editor strip)
- Step C, the whole set: `src/model/duplicateSet.ts:duplicateSetPapers` · `:bumpYears` (Duplicate set…, years moved on in names, titles, covers);
  `src/components/preview/SetKeyPreview.tsx:SetKeyPreview` (Marking scheme → Whole set, read-only; `src/components/editor/KeyScopeSwitch.tsx:KeyScopeSwitch`);
  Export → Whole set in `src/components/editor/ExportDialog.tsx:ExportDialog` (.zip on the web, a folder on desktop; PDFs through
  `src/components/editor/printJob.tsx:printJobPdf`, which shows a document that is not open in the page's place for one print)
- `src/model/mockSet.ts:createMockSet` — New worksheet's Mock set (k-0311): the chosen paper + a blank partner, linked;
  `src/components/start/NewWorksheetForm.tsx:NewWorksheetForm` asks Just this paper / Mock set on Paper 1 and Paper 2
- `src/storage/summaries.ts:rowFacts` · `:kindRepairs` — what a row records beyond counts (kind, set, exam paper); rows below `INDEX_ROW_REV` 3 are repaired from their documents once
- `src/storage/backup.ts:buildBackup` · `:readBackup` · `:restoreBackup` — one-zip backup; restore never overwrites
- `src/storage/document.ts:parseWorksheet` · `:summarize` · `src/storage/download.ts:triggerDownload`
- `src/storage/document.ts:NewerDocumentError` · `:editableCopy` — `save()` refuses to overwrite a newer build's document; the copy is downgraded, under a new id
- `src/storage/types.ts:WorksheetStore` `adopt` · `loadTrashed` — the sync engine's write (origin `'sync'` on the feed) and Trash read

Invariants:
- One malformed index row must never empty the list — §The published-document promise.
- Guards: `src/model/backwardCompat.test.ts`, `src/storage/legacyIndex.test.ts`, `src/storage/newerDocument.test.tsx`.
- Trash lives outside what older builds read: key `econ-worksheet-trash` (never under
  `econ-worksheet:`), `worksheets/trash/` on desktop — §Persistence.
- Folders are never a field on an index row (an older build's rewrite drops it): key
  `econ-worksheet-folders`, `worksheets/folders.json`; in a backup, inside `manifest.json` — §Persistence.
- A paper set is the opposite: a field **in each document** (`paperSet`), so it syncs and survives `.json` and older
  builds; its index fields `set`/`paper` are a cache an older build may drop, repaired from the document — §Persistence.

## sync — one engine for every storage source (desktop: Settings → Storage location chooses the folder)

`docs/design/sync-engine.md`. The store stays primary; a source is a mirror. Pure TypeScript.

- `src/sync/types.ts:SyncSource` · `:BaseStore` · `:CopyNamer` — entries `{ key, revision, size }`, CAS writes
- `src/sync/plan.ts:planSync` · `:planDocument` · `:planStray` — pure three-way plan (local, remote, base)
- `src/sync/run.ts:runSync` — executor: CAS, re-plan on change, base moves last; `SyncReport`; `isBusy` holds a
  document open with unsaved edits
- `src/sync/scheduler.ts:createScheduler` — when runs happen: start, focus, debounced saves, source hints, 60 s rescan;
  single-flight, backoff, own-echo skip, observable `status()`; `:webLock` for a future web source
- `src/sync/librarySync.ts:startLibrarySync` — the controller (desktop), attached by `import()` from `src/app/EditorHost.tsx`:
  runs the scheduler whenever a folder is chosen (reachable or not); `:chooseFolder` · `:stopSyncing` · `:syncNow`, one
  queue; `:clearSavedLibrary` detaches the folder (base and folder forgotten) before Clear saved documents
- `src/sync/syncView.ts:useSyncView` — what the interface reads (`location`, `status`, Needs attention); Tauri-free
- `src/sync/syncNotices.ts:syncNotices` — conflict copies, refilled remote, unreachable (one per outage), stable ids
- `src/sync/foundFolder.ts:offerFoundFolder` — at launch with no folder: one notice offering a library `library_found` saw in a cloud
  folder; its button is `:chooseFolder`'s flow; closed or used is kept in localStorage (`:FOUND_DONE_KEY`), so once per computer
- `src/components/settings/sections/storageSection/StorageSection.tsx:StorageSectionView` — Settings → Storage location;
  this computer's name in `src/settings/sync.ts:SYNC_SETTINGS`, read by `src/sync/localNamer.ts:computerName`
- `src/sync/openEditor.ts:openEditorGuard` — never writes under unsaved edits; a clean open document reloads, with a notice
- `src/sync/localNamer.ts:localNamer` — copy names from `src/sync/messages.ts:SYNC_MESSAGES`, in the interface language
- `src/storage/index.ts:worksheetHashCache` — the one hash cache; `worksheetStore` is `withChangeFeed(forgetOnWrite(…))`
- `src/sync/snapshot.ts:readLocal` · `:readRemote` — the two sides as the planner sees them
- `src/sync/persistentBase.ts:createBaseStore` — the base per (computer, source): web IndexedDB `econ-worksheet-sync`,
  desktop `$APPDATA/sync/base-<hash>.json` (`src/storage/fileStore.ts:syncBaseFile`); a bad row or file reads as absent
- `src/sync/hashCache.ts:memoryHashCache` · `:forgetOnWrite` — local hashes by `updatedAt`, sound only while every write forgets
- `src/sync/folderSource.ts:folderSource` — the cloud folder as a source, over `src/platform/library.ts:LibraryBridge`:
  keys = relative paths (provider copies keep theirs: strays), revision = content hash, `changes()` from watcher bursts
  (`reset` whenever one may be missed), `onHint` per burst; a file that will not read is `unreadable`, so it is held
- `src/sync/memorySource.ts:MemoryCloud` — test source with faults; `src/sync/testKit.ts:computer` — simulated computers;
  `src/sync/folderTestKit.ts:FakeLibrary` — the Rust commands' rules over `MemoryCloud`. `run.test.ts` and
  `property.test.ts` run through both sources (`src/sync/testKit.ts:Connect`)
- `src/storage/document.ts:adoptRefused` — `adopt()`'s one refusal (older schema over a newer build's document)

Invariants:
- Never compares two computers' clocks; never hard-deletes by sync; a newer build's file is never uploaded over.
- No `@tauri-apps/*` in `src/sync/`, and no paths in the engine; the folder's specifics live in its source.
- Never writes a document open with unsaved edits; the web runs nothing until it has a source.
- Guard: `src/sync/property.test.ts` (no version lost, both computers identical, none held twice, no stale cached hash;
  a variant with open editors typing unsaved on both computers).

## platform / desktop

- `src/platform/buildChannel.ts:RELEASE_BUILD` — whether this is a release build (the Release workflow's, `NEXT_PUBLIC_RELEASE_BUILD=1`), a build-time constant; a feature built but not shipped hides itself in a release and nowhere else (the Question studio, `src/questionStudio/trial.ts:studioDefaultOn`)
- `src/platform/index.ts:isDesktop` · `:saveFile` · `:pickTextFile` · `:pickFile` · `:printPage` · `:revealFile` · `:openFolder` · `:exportsFolder` · `:openExternal`
- `src/platform/index.ts:chooseSavePath` · `:savePdf` — desktop PDF: the save sheet, then the shell's `print_to_pdf` command
- `src/platform/index.ts:chooseSaveTarget` · `:chooseFolderTarget` · `:canChooseLocation` — ask where first (inside the click), write after the build; `src/platform/webPicker.ts` is the browser's Save As / folder picker (Chrome, Edge), the anchor download elsewhere
- `src-tauri/src/pdf/mod.rs` — the one app command, `print_to_pdf` (path, page box, sheet count); `src-tauri/src/pdf/macos.rs` (WKWebView save job) · `src-tauri/src/pdf/windows.rs` (WebView2 `PrintToPdf`). Declared in `src-tauri/build.rs`, granted as `allow-print-to-pdf` in `src-tauri/capabilities/default.json`
- `src-tauri/src/library.rs` — the library folder's commands (`library_location` · `_choose` · `_forget` · `_list` · `_read` ·
  `_write` · `_remove` · `_watch` · `_unwatch`, `cargo test`): root picked in Rust and kept in `$APPDATA/library-location.json`
  (denied to plugin-fs), paths relative and inside the root, CAS by SHA-256, temp + fsync + rename, identical bytes skipped,
  an unusable root `unavailable`, placeholders listed unhashed. Bridge: `src/platform/library.ts:desktopLibrary`
- `src-tauri/src/cloud.rs:detect` — `library_cloud_folders`: the cloud drive folders on this computer, from paths and env only
  (macOS CloudStorage needs the provider's app installed; Windows env, fixed drives only, Google Drive by volume label, profile folders); `cargo test` over a fake
  `Machine`. Bridge `src/platform/library.ts:cloudFolders`; shown by `src/components/settings/sections/storageSection/StorageSection.tsx:CloudFolders`
- `src-tauri/src/cloud.rs:library_in` · `:find_library` · `:picker_start` — `library_found`: a library in `<cloud folder>/Econ Studio` or one
  folder down (stat only, hidden folders skipped); `library_choose` `start` opens at its parent. Bridge `src/platform/library.ts:foundLibrary`
- `src-tauri/src/ocr/mod.rs:ocr_status` · `:ocr_image` — offline OCR (PP-OCRv6 small on statically linked ONNX Runtime): image bytes in, lines with boxes out; `src-tauri/src/ocr/detect.rs` (DB boxes, `DET_PARAMS`) · `src-tauri/src/ocr/recognize.rs` (crop, CTC). Models downloaded by `src-tauri/build.rs`; CI vendors ONNX Runtime with `scripts/fetch-onnxruntime.mjs` — §Desktop shell
- `src-tauri/src/bundle_rename.rs:decide` · `:rename_legacy_bundle` — macOS, before any window: an updated `Econ Worksheet.app` renames itself `Econ Studio.app` and relaunches once, else logs why it skipped (`cargo test`)
- `src-tauri/tauri.conf.json` `dragDropEnabled: false` (`src/test/desktopDragDrop.test.ts`) — the shell's native drag handler is off, so HTML5 drags (outline, page grip, thumbnails) and file drops reach the page; `src/platform/fileDropGuard.ts:guardStrayFileDrops` (mounted in `src/app/EditorHost.tsx`) cancels a file dropped where nothing takes it, so the webview never navigates to it. `scripts/drag-verify.mjs` drives all of it in Chrome — §Desktop shell
- `src/platform/index.ts:unlistenSafely` — every Tauri unlisten goes through it (it can reject before the listener registers); the native file-drop helpers it once served are gone (k-0263)
- `src/storage/fileStore.ts:savedWorksheetPath` · `:savedWorksheetsFolder` · `src/storage/index.ts:pickWorksheetFile`
- `src/desktop/updater.ts:checkForUpdate` · `:currentVersion` · `src/desktop/updateStore.ts:checkOnLaunch` — one check per launch
- `src/components/editor/UpdateBanner.tsx:UpdateBanner` (raises the "update ready" notice) · `:VersionLine`
- `src/components/editor/NewerVersionNotice.tsx:NewerVersionNotice` — the read-only bar: check for updates (desktop) / download link (web), "Duplicate as editable copy"
- `src/whatsNew/changelog.ts:parseChangelog` · `:sectionMarkdown` · `:compareVersions` — `CHANGELOG.md` as data, shared with `scripts/release-notes.mjs`; each entry is `{ en, zh? }`, `zh` from the `<!-- zh: … -->` under it, which `sectionMarkdown` (the release body) leaves out
- `src/whatsNew/changelog.generated.ts:CHANGELOG_MD` — the bundled copy, written by `scripts/sync-changelog.mjs` (`predev`/`prebuild`); `src/whatsNew/notes.ts:CHANGELOG` parses it once
- `src/whatsNew/seen.ts:decideWhatsNew` · `:LAST_SEEN_VERSION_KEY` — pop "What's new" once per new version, never on a first run
- `src/components/whatsNew/WhatsNewDialog.tsx:WhatsNewDialog` · `:WhatsNewOnLaunch` — one release after an update, or every release (start screen, ⋯ menu)

Invariants:
- Never import `@tauri-apps/*` statically — dynamic `import()` behind `isDesktop()`, only in `src/platform/`, `src/desktop/`, `src/storage/fileStore.ts` — §Desktop shell.
  Guards: `src/test/tauriImports.test.ts`, the ESLint rule in `eslint.config.mjs`, `scripts/check-web-bundle.mjs` (`postbuild`).
- Nothing reads `process.env` or the filesystem at runtime on the web path — §Deployment. The build-time constants Next inlines are the exception: `NODE_ENV` and `src/platform/buildChannel.ts:RELEASE_BUILD` (only `release.yml` sets it; `src/platform/buildChannel.test.ts` pins that).
- `src-tauri/tauri.conf.json` `app.security.csp` stays `null` — §Desktop shell.
- The changelog copy is committed and must match `CHANGELOG.md`: `src/whatsNew/changelog.generated.test.ts` fails CI when stale (`npm run changelog`).
- Every CHANGELOG entry carries its 繁體中文 in HK wording: `src/whatsNew/changelogZh.test.ts`.

## components/start

`src/components/start/StartScreen.tsx:StartScreen` — the list and the only way in;
`src/components/start/NewWorksheetForm.tsx:NewWorksheetForm` — once-per-document decisions.

- `src/components/start/FileDashboard.tsx:FileDashboard` — grid of first pages / list; search, kind, order (the start screen's Question bank entry opens § library's own screen)
- `src/components/start/StartScreen.tsx:StartNewSection` — the panel's New worksheet button (opens the form on `src/components/start/startKinds.ts:readLastKind`) and "Open a file…" (hidden on an empty desk); the Library rows follow it; the panel's words are `src/components/start/messages.ts:START_PANEL_MESSAGES`
- `src/components/start/WelcomeDesk.tsx:WelcomeDesk` — the desk while nothing is saved: welcome, the four papers sketched as cards opening the same form, open a file / restore a backup
- `src/components/start/startKinds.ts:START_KINDS` — the one list of the four kinds; `src/components/start/PaperSketch.tsx:PaperSketch` draws each, for the welcome cards and the form's gallery
- `src/components/start/dashboard.ts:visibleSummaries` · `:scopedSummaries` — folder scope, then filter and sort, pure
- `src/components/start/dashboard.ts:questionHits` · `:snippetOf` — search inside questions over the 題庫 rows (`src/library/search.ts:searchRows`), with the matching question and a snippet; `:cardMarks` — a card's total marks from the row's `totalMarks` (`src/storage/document.ts:summarize`)
- `src/components/start/dashboardDrag.ts:stepDrag` · `:parseDropTarget` — document→folder drag state machine, pure
- `src/components/start/useDocumentDrag.tsx:useDocumentDrag` — pointer-event drag: capture, ghost, one `drop` on release
- `src/components/start/fileDrop.ts:planDrop` · `:overlayFor` · `:importSummary` — files dropped on the start screen (web `File`s, desktop paths): one opens/restores (a Word or PDF file opens Import), several import, pure
- `src/components/start/TrashList.tsx:TrashList` — Restore / Delete forever / Empty Trash
- `src/components/start/PageThumbnail.tsx:PageThumbnail` · `src/components/start/thumbnail.ts:loadThumbnail` — derived first page
- `src/launch/splash.ts:splashMode` · `src/launch/splash.ts:SPLASH_BOOT_SCRIPT` · `src/launch/splash.ts:SPLASH_HTML` · `src/launch/splash.css` — the launch splash: static in `layout.tsx`, drawn by keyframes, handed off to the start screen's `[data-launch-target]` mark by the inline script

Invariants:
- The gate lives in `src/app/EditorHost.tsx:EditorHost`, outside the editor; the start screen is always home, with no way back but a card; leaving awaits `src/app/EditorHost.tsx:flushBeforeLeaving`, except clearing, which must not save (`src/app/EditorHost.tsx:clearSavedDocuments`) — §The start screen.
- A thumbnail is derived from the IR, never stored — §The file dashboard.
- In-page drags use pointer events, never HTML5 drag-and-drop — §The file dashboard.
- The launch splash plays once per session and never under automation (`navigator.webdriver`, `?nosplash`; `?splash=1` forces it); it never waits on React and is removed when it ends — §The launch splash.

## graphs — Graphs 圖表庫 (saved diagrams outside any worksheet)

Design: `docs/design/graph-library.md`. The start screen's `view: 'graphs'`.

- `src/model/graph.ts:SavedGraph` · `:createGraph` · `:migrateGraph` (wraps the block in a worksheet, runs `migrate`) · `:isGraphNewerThanBuild`
- `src/storage/graphs.ts:GraphStore` · `:localGraphFiles` · `:restoreGraphs` · `src/storage/fileStore.ts:graphDirFiles` · `src/storage/index.ts:graphStore`
- `src/storage/backup.ts:graphEntryName` — `graphs/*.graph` entries in the backup zip
- `src/components/graphs/GraphsScreen.tsx:GraphsScreen` · `src/components/graphs/GraphLibrary.tsx:GraphLibrary` · `src/components/graphs/GraphEditor.tsx:GraphEditor` · `src/components/graphs/GraphPanel.tsx:GraphPanel`
- Every kind edits on the worksheet's surfaces, embedded: `src/components/editor/DiagramCanvas.tsx:DiagramCanvas` · `src/components/editor/FlowCanvas.tsx:FlowCanvas` · `src/components/editor/ForumCanvas.tsx:ForumCanvas` · `src/components/editor/DiagramDataFields.tsx:PieSliceFields` · `:ForumFields` · undo gate `src/components/graphs/graphList.ts:graphHistoryAction`
- `src/export/graphImage.ts:copyGraphImage` · `:graphClipboardHtml` · `src/export/diagramImage.ts:rasterizeDiagram`
- `src/components/editor/fieldScope.ts:FieldScopeContext` — a graph's language for `BiTextField`, over the store
- Into worksheets: `src/model/graph.ts:graphBlockCopy` · `:rebaseOnGraph` · `:graphFromBlock` (Save to Graphs, in `src/components/editor/DiagramEditor.tsx`)
- `src/components/graphs/MyGraphsCards.tsx:MyGraphsCards` — the My graphs tab of `src/components/editor/DiagramTemplatePicker.tsx:DiagramTemplatePopover`
- `src/components/graphs/UseInWorksheetDialog.tsx:UseInWorksheetDialog` → `src/components/graphs/placeGraph.ts:placeGraphInOpenDocument` (via `StartScreen` `openSaved`) · `src/store/worksheetStore.ts:blockSelectRequest`

Invariants:
- Never under `econ-worksheet:`, never in the index, the dashboard or the bank — §Graphs 圖表庫.
- Inserting a graph copies it (fresh block id); nothing links a worksheet to a saved graph.
- `src/test/corpus/graph-v1.json` is frozen; never regenerate it (`src/model/graph.test.ts`).
- No backup entry for a graph ends in `.json` (shipped builds restore those as worksheets).

## library — the question bank 題庫 (derived, never a source of truth)

Design: `docs/design/question-library.md`. Every saved document's questions, indexed by a
scan; rebuildable, so no teacher's work lives in it.

- `src/library/types.ts:BankRow` · `:BankGroup` · `:BankQuery` · `:BankStatus` · `:StoreChange` — the contracts
- `src/library/indexer.ts:rowsOf` — a document's rows (text only, never images; `bankHidden` yields none)
- `src/library/contentKey.ts:contentKey` · `:IGNORED` · `:IGNORED_PART` — content fingerprint ignoring ids and the metadata fields (`lineage`, `tags`, `tagsAt`, `gapBefore`; on every part and sub-part `tags`, `rootId`); `src/library/contentKeyFields.test.ts` classifies every question, part and sub-part field as content or metadata and fails on a new one
- `src/library/bankDocs.ts:copyToBank` · `:addToBank` · `:bankHolds` · `:updateBankCopy` — the only writes into a bank document (`:addToBank`: new questions from an imported file, as originals, skipping any the bank holds by content); a bank never holds two copies of one root (a question already there is skipped; an edited one is updated, never copied again). The teacher never picks or names a bank: writes go to the one bank, `:oneBank` (import through `:addToOneBank`), a new one made quietly when there is none (`:nextBankName`); Copy to bank (`:copyToOneBank`) follows the root, `:copyBankOf` (a writable bank already holding a version of it, else the one bank). UI in `src/components/editor/BankActions.tsx:useBankActions` (copies at once with a notice; only another version asks: Update bank copy, or Treat as a new question, `src/components/editor/BankActions.messages.ts:treatNewText`)
- Trash keeps questions: `src/library/leavingBank.ts:questionsLeavingBank` (a paper's or bank's questions no other live document says word for word, `:questionsOnlyIn`) · `src/library/bankDocs.ts:oneBank` (the one bank, unasked: most recent writable, `:oneBankOf`, else a new one) · `:keepInBank` (may hold a second version of a root beside the bank's, by content; `:copyToBank` never does) · `src/components/start/TrashDialog.tsx:trashKeeping` (keep first; a failed keep leaves the paper live)
- `src/library/search.ts:searchRows` (words match the question or its paper's title, read at query time) · `src/library/group.ts:groupRows` · `src/library/history.ts:usedIn` · `:usedWith` · `:newestFirst` · `src/library/fill.ts:pickFill`
- `src/model/classes.ts:dateOfUse` · `:parseClasses` · `:foldLegacyClassTag` — who sat a paper (`classes`, `satOn`) and when it counts from; `:commitClassInput` — Setup's Classes box (Enter or a comma commits a class; new form-led names in capitals, stored ones never rewritten; classes compare by `:classKey`, case-insensitive); `src/library/cohort.ts:cohortOf` · `:sameStudents` — the derived DSE cohort the anti-repeat filters match by
- `src/library/useBank.ts:useBank` — the one read both surfaces use, over the persistent index below
- `src/library/bankIndex.ts:createBankIndex` — stored rows first, then reconcile `list()` against `updatedAt` stamps (idle chunks, newest first), then the change feed, coalesced (S8: saves in one burst are indexed in one pass, one commit, one publish; the paper open in the editor is held, `src/library/useBank.ts:holdBankDocument`, until it is let go, a reader calls `flush`, or `HOLD_MS`); wakes on focus for other tabs
- `src/library/bankBackend.ts:BankIndexBackend` · `:createDocFilesBackend` · `:createMemoryBackend` · `:INDEX_FORMAT` · `:STORED_INDEX_FORMAT` — where rows persist; a bad entry drops only its document, another format key rebuilds all. The key folds a hash of the topic labels; bump `INDEX_FORMAT` when `rowsOf` output changes (`src/library/rowsGolden.test.ts` fails to say so)
- `src/library/idbBackend.ts:createIdbBackend` — web: IndexedDB `econ-worksheet-library` (`rows` keyed `[docId, questionId]`, `stamps`, `meta`)
- `src/storage/changes.ts:withChangeFeed` · `:onStoreChange` — the store singleton announces each successful mutation (`StoreChange`)
- `src/storage/fileStore.ts:libraryDocFiles` — desktop: a file per document in `worksheets/library/docs/`; `:libraryIndexFile` is the old single file, migrated once and removed; `:libraryPackFile` + `:libraryJournalFile` let a launch read one pack plus the files changed since (`src/library/bankBackend.ts:PackPorts`; a bad or missing pack reads every file)
- `src/components/bank/BankRow.tsx:BankRow` — the shared row: excerpt, quiet meta, no button (drag it; a focused row takes Enter via `onActivate`), in-paper / used-with-class / missing-language / selected states, and `partsFor` ("(b) Efficiency" when a topic filter matches only some parts, `src/library/slotMatch.ts:slotsMatching`); `:SourceText` — "Paper · Q4" on one line, the title cut, the number never
- Look-alike rows read apart: `src/library/docLabels.ts:distinctDocLabels` (two papers of one title add the day, then classes: the From list, rows, facts) · `src/components/bank/bankText.ts:versionDiff` (what an edited version says: "Says “…by 25% and…”", "Reworded") · `:countOf` · `:allOf` (plurals: "1 sub-topic", "both copies")
- `src/store/worksheetStore.ts:insertQuestionCopies` — bank copies in (`copyQuestion`), one commit, one undo
- `src/components/bank/page/QuestionBankScreen.tsx:QuestionBankScreen` — the bank as its own screen (the start screen's `view`, left by ← Home): levels, filters, picks, the one window key listener, topic writes
- `src/components/bank/page/TopicCards.tsx:TopicCards` (level 1: topic cards, untagged strip) · `src/components/bank/page/ReviewPage.tsx:ReviewPage` (level 2: sub-topic rail, collapsible, one Tab stop, large preview, facts; from `RAIL_WINDOW_FROM` entries the rail draws a window, `src/components/bank/page/railWindow.ts:visibleRange`, rows measured once drawn) · `src/components/bank/page/TagAsYouGo.tsx:TagAsYouGo` (level 3: one untagged question, numbered topic keys; a question with parts adds a part strip, and the keys tag the whole question until a part is picked by click or [ ]; ⌫ / ⌘Z / Undo takes the last save back with one `everywhere(removeTopics)` write per copy) · `src/components/bank/page/FilterPopover.tsx:FilterPopover` (the button names one short filter, else counts: `:filterButtonLabel`)
- Bank tagging: `src/components/bank/page/TopicPickerDialog.tsx:TopicPickerDialog` (one list: Edit topics without parts, bulk Set topic, All topics) · `:PartTopicPickerDialog` (Edit topics on a question with parts: a part column, Whole question first; hands back one `StateEdit`) · `src/components/bank/page/partTopics.ts:toggleAt` · `:ticksAt` · `:changeAt` · `:patternEditAt` · `:sameAsPart` · `:savedByPart` — each pick is a `StateEdit` on a draft tag state, replayed by the save on every copy; bulk Set topic stays a list edit, so every part gets it
- Suggest topics from the text: `src/library/termTopics.ts:TERM_TOPICS` (EDB glossary key → topic codes; a test holds every key to the data) · `:textTopics` (glossary matches, EN and 中文, most mentioned first) · `:rowText` (`searchText` without its tag words, abbreviations re-capitalised); merged first (three at most) by `src/components/bank/page/bankScreen.ts:suggestTopics`, keys' names underlined with dots, `:termsByTopic` in the tooltip
- `src/components/bank/page/bankScreen.ts:levelUp` · `:levelForSearch` · `:railSections` · `:suggestTopics` · `:latestClassUsage` — the screen's pure half: levels, rail headings (sub-topics, then General), suggestion ranking. The rail lists entries, not questions (`:railOrder`, `:entryIndex`): a question on two headings is two entries, each with `alsoIn` and the `query` its heading names; `:partsTesting` · `:testsThisText` · `:testsWhatText` · `:topicsByPart` say which part tests it ("Part (b) tests this")
- `src/components/bank/page/bankPage.ts:coverage` · `:filterRows` · `:traySummary` · `:addTarget` — the data half; counts are distinct `rootId`s; `:missingSides` is the Language filter (Missing 中文 / English) over `BankRow.missing` / `missingTeacher` (teacher text counts when the preview shows Teacher or AI Settings include it); the Diagram filter reads `BankRow.hasDiagram`; `:sortGroups` is the Filter's Sort (newest, least used by `:useCount`, oldest, most marks), applied before `railSections` so each heading keeps it, reading uses and dates from the unfiltered groups; never counted as a filter, kept by Clear filters
- `src/components/bank/page/PaperPreview.tsx:PaperPreview` · `src/components/bank/page/questionPreview.ts:questionPreviewHtml` — one question through the clipboard reader of the IR, Student or Teacher, at print size in its own document's setup, under its number in that document (`src/export/clipboard.ts:questionClipboardHtml`'s `printedNumber`); its `highlight` (part keys) wraps the matching part in `data-part-mark`, screen only: the clipboard is never marked
- `src/library/tagWrites.ts:writeTags` · `:withQuestionTags` · `:copyWrites` · `:bulkTopicEdit` · `:matchEdit` · `:otherCopyWrites` — topic edits into the owning documents, one save per document; every topic edit (bank or editor) writes every copy of the question, each adopting the shared tag state under one stamp
- `src/library/sameCopies.ts:identicalCopies` · `:writeIntoCopies` · `:writesForCopy` · `:restoreCopies` — text writes (✦ Fill, Check terms) made on the shown copy, carried slot for slot to every copy with its `rootId` and `contentKey`; one load, check and save per document; never Trash, hidden or newer-build documents; a copy changed since is skipped and reported. `restoreCopies` is the bank's Undo all: only copies still holding what was written, later topic edits kept
- ✦ AI on the bank screen: `src/components/bank/page/BankAiMenu.tsx:BankAiMenu` (the door beside Filter; scopes and verbs pure in `src/components/bank/page/bankAiScopes.ts:bankVerbRows`) · `src/components/bank/page/bankAi.ts:createBankAi` (the run store: running, review, error; `:needsConfirm` over 20 questions) · `src/components/bank/page/BankAiBar.tsx:BankAiBar` · `:BankAiNote` (the note above the paper); marks on the paper through `src/components/bank/page/PaperPreview.tsx:markTexts`; the engine is `src/assist/bankRun.ts` (§ AI door)
- `src/components/editor/topicSync.ts:setQuestionTopics` (one list; `:setQuestionTags` takes the edit itself) — the editor's Topic row: the open copy through the store (one undo), every other document's copy through storage, never the open one; "Also updated in N other worksheets"
- `src/library/sharedTags.ts:sharedTags` — one tag set per question: the copy with the newest `tagsAt` wins (unstamped rank oldest, ties and no stamps give the union). `:withSharedTags` applies it once where the index publishes (`src/library/bankIndex.ts:createBankIndex`), stored rows keep each copy's own. `:withRowTags` gives a copy taken from the bank that set and stamp (`src/components/bank/page/fromSelection.ts:readPicks`, `src/components/bank/bankSession.ts:insertFromBank`). `src/components/editor/sharedTopics.ts:useShownTags` — the editor's Topic row and Outline show it at display time; opening never changes a document's tags (the open-save writes it back as loaded)
- Topics per part (design `docs/design/part-tags.md`): `src/model/tagSlots.ts:tagStateOf` · `:derivedTags` · `:effectiveSlotTags` · `:normalizeTagState` · `:collapseTagState` · `:stateFor` · `:withTagState` · `:matchSlots` · `:slotRef` · `:slotAtTarget` · `:slotHighlightIds` — a question's tag state (its list plus each part's), read through the registry's `tagSlots` / `withSlotTags` (`src/registry/types.ts:TagSlotInfo`, implemented in `src/registry/structured.ts`); `src/model/lineage.ts:partRootOf` · `:withoutLineage` (part roots, stamped by `copyQuestion`). Library: `src/library/sharedTags.ts:sharedState` · `:stateOfRow` · `:rowTagFields` (rows' derived `tags`, `slots`, `ownTags`); `src/library/tagWrites.ts:wholeQuestion` · `:atSlot` · `:everywhere` · `:inheritAtSlot` · `:freeTags` · `:changeEdit` · `:retagQuestion` (a list edit means the whole question); `src/library/slotMatch.ts:slotsMatching` ("(b) tests this"); `src/components/editor/topicSync.ts:setQuestionTags` · `src/components/editor/sharedTopics.ts:useShownTagState`; the Edit panel's per-part row `src/components/editor/PartTopics.tsx:PartTopics` (whole question, part, sub-part "Same as (a)" / "Its own", chosen by `src/components/editor/partTopicView.ts:topicMode`; `:partTopicLines` · `:outlineTagLine` for the Outline); preview marking `src/export/clipboard.ts:questionClipboardNodes` · `:highlightedNodes`
- 題型 (Patterns): `src/model/patterns.ts:parsePatternTag` · `:withPattern` — the tag form `<sub-topic>::<name>` on `Question.tags`; `src/library/patterns.ts:listPatterns` · `:patternWrites` · `:renamePatternEdit` · `:removePatternEdit` — lists per sub-topic × type (registry ∪ names on questions), and the edits a rename, merge or delete writes into every copy; `src/storage/patterns.ts:usablePatterns` · `:updatePatternRegistry` — the app-level registry (`econ-worksheet-patterns` / `worksheets/patterns.json`), per-row validated, in the backup manifest; `src/library/usePatterns.ts:usePatternRegistry`; UI `src/components/bank/PatternPicker.tsx:PatternPicker` (Topic row and topic dialog; registers nothing: the Topic row registers a new name, a dialog keeps it only by saving) · `src/components/bank/patternOptions.ts:patternOptions` (what typing lists and highlights: an existing match before New) · `src/components/bank/page/PatternsPage.tsx:PatternsPage` (the 題型 map, one layout: where the library stands, `src/library/patterns.ts:sortProgress` · `:topicsToSort`; nothing named yet, topic cards and an example; in use, a box per sub-topic with 題型, one list with type badges, `:subTopicList` · `:subTopicTallies`, other topics on one line; "+ New 題型 here") · `src/components/bank/page/PatternSortBoard.tsx:PatternSortBoard` (the sort board, bank level `sort`: one coarse topic's unsorted questions per sub-topic, `src/library/patterns.ts:sortSections` · `:sortBuckets`; select and name, 1–9 into a bucket, Z undo; writes `:sortIntoEdit` / `:unsortEdit`); topic names on both follow the 題庫 view language (k-0500), `src/components/bank/page/topicText.ts:topicName`; editor 題庫 tab filter `src/library/tabFilters.ts:tabPatternChoices`
- `src/components/bank/page/bankCart.ts:useBankCart` · `:togglePick` · `:movePick` · `:sortByType` · `:prunePicks` — the cart: picks as `(docId, questionId)` in print order, one per question (`rootId`), in this tab's sessionStorage (per-viewer, never document data); picks whose question is gone are dropped once the index is ready. UI `src/components/bank/page/SelectionTray.tsx:SelectionTray` (the list: drag, ↑ ↓, Alt+↑ ↓, remove, MCQ before LQ, Clear with Undo)
- `src/components/bank/page/fromSelection.ts:worksheetFromPicks` (named after the shared topic, never titled) · `src/components/bank/page/addToOpen.ts:addPicksToOpenDocument` — New worksheet from these / Add to the paper opened last this session, never a guessed one (`src/components/bank/page/bankPage.ts:addTarget`); one ⌘Z, then the 題庫 review: highlighted, scrolled to
- C8 "Adding to" picker: `src/components/bank/page/TargetPicker.tsx:TargetPicker` (rail header, a native select) over `src/components/bank/page/bankPage.ts:resolveTarget` · `:initialTargetChoice` · `:paperTargets` · `:rootsInPaper` (the rail's "Already in this paper · Q4", from the index rows); a new Paper 1 / Paper 2 opens empty (`src/components/bank/page/fromSelection.ts:paperForPicks`) and takes the picks through `addPicksToOpenDocument`, so each lands in its type's section. The choice is session state in `useKeptTarget` (`new:<type>` or a document id), forgotten when another document opens
- `src/library/tabFilters.ts:visibleGroups` · `:paperRoots` · `:anchorLabel` · `:blockingFilter` — the editor tab's filters, "in this paper", the anchor line, which filter emptied the list
- `src/components/bank/BankTab.tsx:BankTab` — the editor's 題庫 sidebar tab: drag hint, filters, list, Fill (its status line names the anchor). The type filter and Fill start on what the paper takes (`src/library/paperTypes.ts:paperTypeFilter`); the list is one Tab stop, ↑ ↓ move, Enter inserts
- `src/library/paperTypes.ts:paperTypeIds` · `:paperTypeFilter` · `:typesOutsidePaper` — what a paper normally takes, from the registry's `paperKinds`; `src/components/bank/tabText.ts:outsidePaperNote` is the review bar's line when an insert goes outside it
- `src/components/bank/bankSession.ts:insertFromBank` — load sources read-only (`:loadBankCopies`), one `insertQuestionCopies` (`:commitBankCopies`), start the review; `:useBankSession` also carries the open-tab request
- `src/components/bank/bankDrag.tsx:useBankRowDrag` · `:BankDragLayer` · `:useBankDrag` — drag a tab row onto the page: pointer capture past a threshold, the slot re-aimed once per frame, the store touched only on release (`commitBankCopies` at the slot, one ⌘Z); Esc / off the page cancels; ⌘Z is swallowed until the drop (`src/components/bank/bankDrag.tsx:isBankDragActive`); the tab list keeps its place until the button is up (`:holdScrollers`: WebKit autoscrolls the list a press began in). `src/components/bank/dropSlot.ts:pickSlot` (flow gap under the pointer, hysteresis, held over the ghost and the bands) · `:provisionalWorksheet` (derived, never stored); the page draws it through `src/components/EditorApp.tsx:PreviewWithBankDrop` and `Preview`'s `provisionalId`; the page rail's cards show it too (`src/components/editor/PageThumb.tsx:PageThumb` keeps `[data-bank-ghost]` when it strips print-hidden chrome)
- `src/components/bank/BankReviewBar.tsx:BankReviewBar` — inserted copies highlighted on the page (`data-bank-new`), ‹ ›, Undo, Done; a quiet second line when a type the paper does not normally take came in (`BankReview.note`)

Invariants:
- A bank is a `Worksheet` with `kind: 'bank'`; no second storage format.
- The bank screen writes documents only while no editor is mounted (it is part of the start screen, which replaces the editor), so there is no in-memory copy to save over the write. The editor writes only documents other than the open one. Writes are queued one at a time (topic edits and ✦ AI share the queue; leaving the screen waits for a ✦ run's last write). A second tab (S4): each tag write re-reads its document just before saving and redoes the change on a newer revision (`src/library/tagWrites.ts:saveRevised`), and an editor holding the paper takes newer tags in from the `storage` event (`src/storage/index.ts:onDocumentSavedElsewhere`, `src/library/tagWrites.ts:adoptNewerTags`) so its autosave keeps them. With nothing unsaved, the editor takes the whole saved document instead (a ✦ Fill included), dropping its undo history; with unsaved edits it takes only the tags and warns, offering Reload (`src/components/editor/savedElsewhere.ts:takeSavedElsewhere`).
- Copies are independent; identity is `lineage.rootId`, never a shared id.
- "Already in this paper" is by question: the paper holds any copy of the pick's root, edited or not. Add to skips those and says so (`src/components/bank/page/addToOpen.ts:splitAlreadyInPaper`); a set of picks keeps one copy per root (`:uniquePicks`); the tab marks them In this paper (`src/library/tabFilters.ts:paperRoots`).
- A use is a paper with `classes`, dated `satOn ?? createdAt`; never `updatedAt`, which only stamps index freshness. Drafts list where a question lives but never count as uses.
- No module in `src/library/` branches on a type id (`src/library/noTypeBranching.test.ts`).
- A 題型 is (sub-topic, type id, name); the question's own type decides its list, and the name on the question is the truth. It never reaches the IR (`src/components/editor/topicTags.test.ts`).
- On a question with parts, topics live per part and `BankRow.tags` is derived from them; readers use the derived list, writers go through `src/library/tagWrites.ts` (never write `QuestionPart.tags` directly), and one `tagsAt` covers every list. Part tags and roots never print and never change `contentKey`.
- The index follows `list()`, never storage keys (a trashed web document keeps its key); it holds no images and no teacher's work — §Persistence.
- The 題庫 tab is sticky: while open, a page selection moves the insert anchor instead of switching to Edit (`src/components/editor/Sidebar.tsx:Sidebar`).
- A drag from the tab re-paginates per *slot*, never per pointer frame; while a provisional question is drawn, the page writes nothing it measures back (split, trim, fill), and those writes also wait for a fresh measurement (`usePagination`'s `isFresh`).

## pastpapers — the Past paper bank 歷屆試題庫 (read-only, downloaded, never a document)

Design: `docs/design/pastpaper-bank.md` (k-0443; plan k-0441 § 15). A second bank beside the
teacher's 題庫, never mixed into it: static files (`manifest.json` + `topics/<id>.json`, each
an editor `kind: 'bank'` document) read from one address, on demand.

- `src/pastpapers/config.ts:BUILT_IN_SOURCE` · `:PAST_PAPER_SETTINGS` · `:sourceUrl` · `:sourceAddress` · `:fileUrl` — the switches: the constant (empty = feature gone), Settings → Past paper bank (Built-in / Off / another address, `econgen.settings.pastPapers`), and the data's own `"enabled": false`
- `src/pastpapers/config.ts:gitHubSource` · `:latestUrls` · `:pinnedSource` · `src/pastpapers/bank.ts:parseLatest` — hosting (k-0447): a raw-GitHub base reads `latest.json` from its branch (jsDelivr's copy only when GitHub can't be reached and nothing is kept), then the list and topics at the commit it names from jsDelivr, GitHub raw at that commit as the fallback; no `latest.json` = the branch, as before; `enabled: false` there is the off switch
- `src/pastpapers/net.ts:fetchText` — the one GET (no credentials, no body); with `src/ai/http.ts` the only network files (`src/test/networkCalls.test.ts`)
- `src/pastpapers/cache.ts:createIdbCache` — IndexedDB `econ-pastpaper-bank`, keyed `<base>|<file>` (the bank's own address and the file's name, never the commit or mirror: a publish re-downloads only changed topics), records carry `sha256` and the commit `rev`; never the documents' storage or a backup; `:createMemoryCache` for tests
- `src/pastpapers/bank.ts:loadManifest` · `:loadTopic` · `:createPastPaperBank` · `:usePastPaperBank` · `:keepDownloads` — the list (published: no download while `latest.json` names the kept list's commit; else fresh; kept copy offline; `enabled: false` prunes), a topic from cache while its `sha256` matches, else downloaded from the list's mirrors in order (kept only when it matches); web asks `navigator.storage.persist()` once
- `src/pastpapers/pack.ts:parseManifest` · `:parseTopic` · `:sourceOf` · `:matchItem` · `:liftStimulusLead` · `:parseSearch` · `:papersOf` · `:sourceLabel` · `:withPictureGrid` — tolerant readers (the list's `search` index, k-0444: a search of every topic downloads only the topics shown; picture options get the 2×2 grid): a topic goes through `src/model/migrations.ts:migrate`, unknown question types are left out and counted; a stimulus's paper lead sentence becomes its `prefix`/`suffix` only when it names exactly the questions after it
- `src/library/stimuli.ts:stimuliServing` · `:planStimulusCopies` — a shared passage travels with its questions, also on the 題庫's own Insert (`src/components/bank/bankSession.ts:loadBankCopies`) and into the teacher's bank (`src/library/bankDocs.ts:copyToBank`'s `leads`)
- `src/storage/webQuota.ts:webStorageUse` — the web build's ~5 MB: `src/components/editor/SaveStatus.tsx` "Storage nearly full", the bank's tray refuses picks that would not fit
- `src/pastpapers/groups.ts:groupTopics` · `:partOf` · `:filterGroups` — topics under their syllabus part (k-0446) by the list's `syllabus` codes; part names from `src/model/topics.ts:TOPICS`, never the bank's; the picker `src/components/pastpapers/PastPaperTopicPicker.tsx:PastPaperTopicPicker` (collapsible parts, Find a topic, a folded bar at phone width) and the 題庫 tab's `<optgroup>`s
- `src/pastpapers/years.ts:groupByYear` · `:yearSelection` · `:compareByYear` · `:yearRows` · `:stepYearRow` — By year (k-0497): every paper under its exam and year (HKDSE newest first, Practice and Sample after, then HKCEE, then HKALE) off the source tags in the search index (no topic downloaded), the open year and its question filter (`src/pastpapers/pack.ts:sittingKey`), the keyboard walk; the list `src/components/pastpapers/PastPaperYearPicker.tsx:PastPaperYearPicker` and `:ViewSwitch` (By topic / By year, `view` in `PAST_PAPER_SETTINGS`, remembered); the open year in sessionStorage `econ-pastpaper-year`
- `src/pastpapers/copy.ts:planCopies` · `src/pastpapers/actions.ts:insertIntoOpen` · `:copyIntoMyBank` · `:emptyPaperFor` — the only ways out, all copies (`lineage.rootId` kept); a stimulus goes in once before its questions with the `span` they fill, through `src/store/worksheetStore.ts` `insertQuestionCopies`'s `leads` (one commit, one ⌘Z, the 題庫 review bar)
- `src/render/questionSource.ts:withSourceTrail` · `:withQuestionSources` · `src/pastpapers/actions.ts:sourceChoiceDecides` — Show source (user u-w7gs): `Worksheet.showQuestionSources` prints each question's `provenance` in brackets as the numbered line's `trail` (the "(4 marks)" slot, so preview/print, `.docx` and clipboard agree; no node added, answer key untouched; a label the IR's estimate (`:sourceFits`) says won't fit gets `TextNode.trailOwnLine`, a break before the `.docx` tab and the preview's own-line path). The bank's box (`PAST_PAPER_SETTINGS.showSources`, remembered) sets it in the insert's own commit only while the paper has no sourced question; after that the paper's switch rules (Setup → Page `src/components/editor/QuestionSourcesField.tsx:QuestionSourcesField`, or the tab's box). Format (u-z6ft): `src/render/questionSource.ts:sourceTrail` · `:sourceParts` · `:withQuestionSourceFormat`, `Worksheet.questionSourceFormat` (absent = full), picker `src/components/pastpapers/SourceFormatSelect.tsx:SourceFormatSelect`. Proof: `src/render/questionSource.test.ts`, `scripts/pastpaper-source-verify.mjs` (`--format=full|short|shortRoman`)
- UI: `src/components/pastpapers/PastPaperScreen.tsx:PastPaperScreen` (start screen view `pastpapers`, Library row in `src/components/start/StartScreen.tsx`) · `src/components/pastpapers/BankTabSwitch.tsx:BankTabSwitch` (top of the editor's 題庫 tab: My bank / Past papers) · `src/components/pastpapers/PastPaperTab.tsx:PastPaperTab` · `src/components/pastpapers/PastPaperIndexCard.tsx:PastPaperIndexCard` (an index hit before its topic is downloaded) · `src/components/pastpapers/PastPaperSheet.tsx:PastPaperSheet` (a card's paper, drawn near the viewport; `src/components/pastpapers/pastPaperPreview.ts:pastPaperPreviewHtml`, Student version through the clipboard reader) · `src/components/pastpapers/usePastPaperBrowse.ts:usePastPaperBrowse` · Settings `src/components/settings/sections/pastPapersSection/PastPapersSection.tsx`
- Proof: `src/pastpapers/pastpapers.test.ts`, `src/pastpapers/pastpapers-k0444.test.ts`, `src/pastpapers/pastpapers-k0447.test.ts` (synthetic data only: the bank's questions never enter this repo); `scripts/pastpaper-topics-verify.mjs` (the picker by part, built-in bank; `--codes` adds `syllabus` until the published list has it), `scripts/pastpaper-cache-verify.mjs` (k-0447: what each visit downloads, against the live bank), `scripts/pastpaper-verify.mjs` and `scripts/pastpaper-search-verify.mjs` against a local export in `public/pastpaper-bank/` (gitignored; `scripts/pastpaper-index.mjs` adds the search index to an export)

Invariants:
- Nothing writes the bank; its topic documents never reach `worksheetStore` or storage. Copies are the teacher's.
- No bank data in this repo, ever (it is public; the data has its own repo).
- No change to the stored document shape: a copy is an ordinary question (and stimulus).

## components/editor — the chrome around the page

- `src/components/EditorApp.tsx:EditorApp` — the shell, autosave, export actions
- `src/components/editor/ExportDialog.tsx:ExportDialog` — the one Export action: format `.docx` / PDF / `.json`, then paper / answer key / both / other apps; `src/components/editor/exportSession.ts:deliverFiles` — picker before build; several files to one folder, else one plain download per click
- `src/components/editor/KeyDocumentsField.tsx:KeyDocumentsField` — "Also include": other saved documents' keys in the same answer key; `src/components/editor/exportSession.ts:loadKeyDocuments` reads them read-only, skipping (and naming) any that will not open — export-time, never stored
- `src/components/editor/printPdf.ts:printWorksheetPdf` — PDF: set the print mode, wait for the sheets, then `printPage()` (web; flags lifted on `afterprint`) or, given a desktop file, `savePdf()` (flags lifted when it resolves; the print sheet if it fails)
- `src/components/editor/exportSession.ts:paperMode` — "Include" toggles → `OutputMode.omitCover` / `omitAnswerSpace` (export-time, never stored; the preview ignores them)
- `src/components/editor/AnswerKeyLayoutPanel.tsx:AnswerKeyLayoutPanel` — the Marking scheme view's Layout tab (style cards from `src/components/editor/AnswerKeySketch.tsx:AnswerKeySketch`, switches); writes through `src/store/worksheetStore.ts:updateAnswerKeyLayout`
- `src/components/editor/Sidebar.tsx:Sidebar` · `src/components/editor/Inspector.tsx:Inspector` · `src/components/editor/TopicRow.tsx:TopicRow` (tags row under every EditorPanel; on a question with parts `src/components/editor/PartTopics.tsx:PartTopics` wraps it per part) · `src/components/editor/TopicRow.tsx:TopicPicker`
- `src/components/editor/MarkSchemeEditor.tsx:MarkSchemeEditor` — points, `n@`/any/max, OR, levels, EC for one leaf
- `src/components/editor/panelKinds.tsx:PanelKindCard` · `:panelKindProps` · `:PanelKindChip` — the right panel's colour per kind (question text, source, part, sub-part, teacher-only scheme; CSS in `globals.css` § Panel kinds, theme tokens only); `src/components/editor/panelLocation.ts:panelLocation` feeds the sticky "where am I" line; `src/components/editor/drqPanelParts.tsx:DrqStarterCard` · `:ReferToRow` · `:TeacherArea`; `src/components/editor/sourceKinds.tsx:sourceKindOptions` is the one Add → Source ▾ / Insert → Source… list. Proof: `scripts/drq-panel-verify.mjs`
- `src/components/editor/AnswerDiagramRow.tsx:AnswerDiagramRow` — a leaf's model diagram: thumbnail, Draw…, template, width
- `src/components/editor/Outline.tsx:Outline` · `:groupByPage` · `src/components/editor/AddRail.tsx:AddRail`
- `src/components/editor/DiagramCanvas.tsx:DiagramCanvas` · `src/components/editor/DocumentSettings.tsx`
- `src/components/editor/DiagramTemplatePicker.tsx:DiagramTemplateCards` · `:DiagramTemplatePopover` — the grouped, searchable template grid (insert and re-base)
- `src/components/editor/DiagramAreaControls.tsx:ShadeMenu` · `:AreaInspector` · `:ShiftCurveControls` — the canvas's area and shift controls
- `src/components/feedback/FeedbackDialog.tsx:FeedbackDialog` (⋯ menu, start screen) · `src/feedback/feedback.ts:buildReport` · `:githubIssueUrl` · `:mailtoUrl` — prefilled issue / mail / clipboard; no server, no token, never the document. An optional screenshot rides the clipboard as PNG (`src/feedback/screenshot.ts:clipboardPlan`), pasted by the teacher
- `src/feedback/anonymise.ts:anonymiseWorksheet` — the anonymised copy (k-0180): on the device, every string scrambled unless its key is in `:KEPT_KEYS` (ids, enums, colours, fonts), letters by width class (`:scrambleText`), pictures as noise PNGs of the same pixel size (`:noiseImage`), `report-<date>`; `src/feedback/anonymisedCopy.ts:makeAnonymisedCopy` · `:saveAnonymisedCopy` serialise once and save that text; `src/components/feedback/AnonymisedCopyPreview.tsx:AnonymisedCopyPreview` shows it (measure-only `Preview` under `.paper-view`, mounted after the dialog's entrance). Guards: `src/feedback/anonymise.test.ts` (no leak, same shape/IR/.docx, type census); `scripts/anon-verify.mjs` (Chrome: same sheets in editor, preview and saved file)

Invariants:
- The sidebar shows one thing, and never mirrors printed text — §The sidebar is an inspector.
- Printed text is typed on the page, and only there — same section.

## components/preview — the paper *is* the editor

- `src/components/preview/Preview.tsx:Preview` — IR → DOM, paginated into sheets
- `src/components/preview/AnswerKeyPreview.tsx:AnswerKeyPreview` — the Marking scheme view: the key's IR on the same paginator, no paper chrome; shown when the store's `documentView` is `answerKey`
- `src/components/preview/pagination.ts:packPages` · `:composePages` · `:resolveFillCounts` — `PackItem.startsSheet` opens a sheet at a question that asked to start a page (§ `render/pageFlow.ts`)
- `src/components/preview/pageNodes.ts:pageNodes` — a question's answer space one node per line and a table one node per run of rows (`tablePieces`), so a sheet breaks where Word does; `bodyEntries` joins the pieces a sheet holds back into one table
- `src/components/preview/fieldEnter.ts:fieldEnter` · `:fieldJoin` · `:enterBreaksLine` — Word's Enter / Backspace / Delete between fields (k-0200), for the paper and the Marking scheme view alike: a paragraph or a mark point splits and joins (`src/model/paragraphs.ts:splitParagraph`, `src/model/markScheme.ts:splitMarkPoint` · `:joinMarkPoint` · `:withoutEmptyMarkPoint`), an option hands over (the last starts E, F… or takes an empty added one back: `src/model/mcqOptionEnter.ts:lastOptionEnter` · `:optionLimit`), an answer or descriptor takes a line break
- `src/components/ui/ime.ts:isImeKeydown` — a key a Chinese IME owns (Chrome's and WebKit's orders of the confirming Enter); every Enter / Escape / Backspace handler on a text field asks it first, and `src/components/preview/heldKeystrokes.ts:typesCharacter` never holds one
- `src/components/preview/InlineEditable.tsx` · `src/components/preview/RichTextEditable.tsx` — click-to-edit
- `src/components/preview/editorClick.ts:useEditorClick` — a click inside the open text box (or a drag-select from it released past its edge) is the editor's: the question's, layout element's and paper's deselecting click handlers ask it first, so the format bar stays (k-0484)
- `src/components/editor/pressedClick.ts:usePressedClick` — on the side panel (`Sidebar.tsx`): a press on a control clicks it even if the panel moved under the pointer when the page's field blurred (k-0478)
- `src/components/preview/runShortcuts.ts:runShortcut` · `:toggledRange` — ⌘B ⌘I ⌘U ⌘= ⌘⇧= on the runs of any field (GitHub #8, k-0479); `src/model/fraction.ts:textSegments` · `:fractionRuns` — stacked fractions as marked runs, drawn by every backend; `src/components/preview/FractionDialog.tsx:FractionDialog`
- `src/components/preview/BandEditor.tsx:BandEditor` · `:bandFieldStyle`
- `src/components/preview/bandRow.tsx:BandRowFrame` · `:layoutBandRow` · `:bandTabPlan` — every band row on the page (editor, idle header, IR masthead) is its Word tab-stop paragraph: inline zones, tab spacers sized as Word resolves them
- `src/components/preview/tabLayout.ts:layoutTabs` · `:useTabLayout` · `:tabColumn` — typed tabs (`\t` in a run) as `[data-tab]` gaps sized as Word resolves them, from `[data-tab-origin]` (sheet, probe, source panel, cell); the rules are `src/model/tabStops.ts:nextTabStop` · `:tabGap`
- `src/components/preview/TabRuler.tsx:TabRuler` — the ruler and Tab stops panel under the format bar (`TextFormat.tabStops`, quick layouts `src/model/tabStops.ts:tabPresetStops`)
- `src/components/preview/ContextBar.tsx` · `src/components/preview/PageContextMenu.tsx`

Invariants:
- A page is derived and owns the break that made it — §A page is derived.
- New on-page chrome needs `data-print-hide` — §Deployment.
- Overlays claim the keyboard through `src/components/ui/modalLayer.ts:useModalLayer` — memory `window-listeners-all-fire`.

## components/ui

`src/components/ui/index.tsx:Button` · `:SelectField` · `:Segmented`;
`src/components/ui/Dialog.tsx:Dialog` · `:DialogTabs`; `src/components/ui/Menu.tsx`;
`src/components/ui/modalLayer.ts:useModalLayer`.
- Notices: `src/store/notices.ts:notify` · `:dismiss` · `:closeNotice` · `:pruneDeadActions` · `:holdHistoryNotices`;
  `src/components/ui/NoticeLayer.tsx:NoticeLayer` (once, in `src/app/EditorHost.tsx`) ·
  `:useNotices` · `:useDialogNotices` · `:useNoticeInset`. `src/store/appDialogs.ts` `notify(message)`
  forwards here for callers outside React.

Invariants:
- Chrome uses semantic tokens (`src/app/themes/tokens.css`, the HUD's `hud-*` / `ruler-*` too); anything on the paper takes literal hex — RECIPES § Add an interface theme.
- Dismissible notices go through `notify()`, never inline; a dialog's float inside it — §Notices float. Guard: `src/store/notices.test.ts`.

## Translation, glossary, settings

AI translation (EN ↔ 繁中), Check terms and app-wide Settings — § AI translation, glossary
and app Settings. `src/components/settings/settingsVisible.test.tsx` proves Settings registers
through `AppSettingsHost` alone.

- `src/model/textSlots.ts:TextSlot` · `src/model/textSlots.ts:TextWalker` · `src/model/textSlots.ts:TranslationWrite` · `src/model/textSlots.ts:ApplyReport` — the slot contract; helpers `src/model/textSlots.ts:patch` · `src/model/textSlots.ts:mapSame` · `src/model/textSlots.ts:sameRuns` · `src/model/textSlots.ts:missingSide`
- `src/model/textWalk.ts:mapWorksheetTexts` · `src/model/textWalk.ts:collectTexts` · `src/model/textWalk.ts:slotsForTarget` — the one identity-preserving walk over every BiText, in print order; questions through `src/registry/types.ts:QuestionTypeDefinition` `mapTexts`
- `src/model/textWalk.ts:needsTranslation` · `src/model/textWalk.ts:countUntranslated` · `src/model/textWalk.ts:fieldNeedsFill` — one definition of "missing", per edition
- `src/model/diagramText.ts:mapDiagramTexts` — every BiText in a diagram (parity with `src/model/diagramDraw.ts:handleText`)
- `src/model/symbols.ts:isSymbolOnly` · `src/model/symbols.ts:CAPITAL_WORDS` — E₀, `MC = MR`, `$14 000`: never sent, counted only where it prints as a gap; `PAPER 2`, `ONE`, `No` are words; `src/model/symbols.ts:WORDED_SYMBOLS` · `src/model/textWalk.ts:wordedLabel` — an area's DWL / TR takes the glossary's 中文 (`src/translate/run.ts:writesFor`)
- `src/model/translationApply.ts:applyTranslationBatch` — stale-guarded batch apply; re-measures a changed diagram bilingually
- `src/components/editor/useUntranslatedCount.ts:useUntranslatedCount` — the toolbar pill, cached per question
- `src/test/translateFixture.ts:buildTranslateFixture` — the kitchen sink: every slot kind; `src/model/textWalk.census.test.ts` proves the walk misses no `{en, zh}`
- `src/store/worksheetStore.ts:applyTranslations` — one commit (one undo) per batch; `src/model/paperHealth.ts:TermSummary` — Check terms' input to `checkPaper`
- `src/store/appDialogs.ts:useAppDialogs` — one app dialog at a time (Translate, Settings)
- `src/translate/types.ts:TranslationPlan` · `src/translate/types.ts:JobResult` · `src/translate/types.ts:TermRow` · `src/translate/types.ts:RunDepsResult`
- `src/translate/plan.ts:planFromSlots` · `src/translate/plan.ts:planTranslation` · `src/translate/plan.ts:defaultTranslateOptions` · `src/translate/plan.ts:slotInScope` — scope, direction, symbol copies, dedupe, context, chunks
- `src/translate/wire.ts:encodeRuns` · `src/translate/wire.ts:decodeWire` — the closed tag set; edges and blank widths live in the codec
- `src/translate/validate.ts:validateItem` · `src/translate/conventions.ts:CONVENTIONS` — deterministic item checks; HKEAA letter, currency and paper-furniture forms (also prompt rule 12)
- `src/translate/normalize.ts:normalizeZh` · `src/translate/normalize.ts:normalizeEn` · `src/translate/simplified.ts:SIMPLIFIED_PAIRS` — Hong Kong punctuation and forms; Simplified detection
- `src/translate/promptText.ts` · `src/translate/prompt.ts:buildRequest` · `src/translate/prompt.ts:PROMPT_VERSION` — the prompt's words and assembly (sha-pinned in `src/translate/prompt.test.ts`)
- `src/translate/run.ts:runTranslation` · `src/translate/run.ts:writesFor` · `src/translate/run.ts:translateOne` · `src/translate/run.ts:announcedSleep` — per-chunk pipeline, one repair pass, better of two; rate-limit waits shown as `waiting`
- `src/translate/termCheck.ts:buildTermCheck` · `src/translate/termCheck.ts:termFixWrites` · `src/translate/termCheck.ts:termSummary` — Check terms (`src/translate/types.test.ts` pins the signatures)
- `src/translate/deps.ts:createRunDeps` — Settings to client, preset, model and glossary
- `src/translate/testKit.ts` · `src/translate/fakeGlossary.ts` — test-only: scripted client, reference client, a 20-entry glossary
- `evals/translate.eval.ts` · `vitest.eval.config.ts` — the live quality eval (`npm run eval:translate`), never under `npm test`
- `src/glossary/types.ts:Glossary` · `src/glossary/types.ts:PreferredOverrides` · `src/glossary/attribution.ts:GLOSSARY_ATTRIBUTION` · `src/glossary/load.ts:loadGlossary` · `src/glossary/useGlossary.ts:useGlossary` · `src/glossary/index.ts`
- `src/glossary/data/edb-economics-2020.json` — the EDB data, verbatim (`src/glossary/NOTICE.md`); `src/glossary/glossary.ts:createGlossary` builds the `Glossary` from it
- `src/glossary/overrides.ts:PREFERRED_OVERRIDES` (import → 進口) · `src/glossary/overrides.ts:GENERIC_TIER` · `src/glossary/overrides.ts:ZH_OVERRIDES` · `src/glossary/overrides.ts:EN_OVERRIDES` — corrections and policy over the data
- `src/glossary/deny.ts:DENY` — known wrong forms and their fixes
- `src/glossary/choices.ts:chosenOf` · `src/glossary/choices.ts:relatedFor` · `src/glossary/choices.ts:sanitize` · `src/glossary/choices.ts:customEntry` — term preferences, own wordings and the teacher's terms: the JSON is never edited; overrides < the teacher's choices < related terms that follow one
- `src/glossary/parse.ts:parseGlossary` · `src/glossary/fold.ts:foldZh` · `src/glossary/matchEn.ts:buildEnMatcher` · `src/glossary/matchZh.ts:buildZhMatcher`
- `src/glossary/check.ts:checkEnToZh` · `src/glossary/check.ts:checkZhToEn` · `src/glossary/check.ts:autoFix` · `src/glossary/pin.ts:pin`
- `src/glossary/seededTerms.test.ts` — every seeded template, preset and sample passes the check
- `src/ai/types.ts:ProviderPreset` · `src/ai/types.ts:AiError` · `src/ai/providers.ts:PRESETS` · `src/ai/schema.ts:ITEMS_SCHEMA` · `src/ai/schema.ts:parseItemsPayload`
- `src/ai/client.ts:createClient` · `src/ai/client.ts:testConnection` — config check, the structured-output ladder, the rung cache
- `src/ai/http.ts:send` — the only `fetch` in `src/`; fetch hygiene, 2 MB response cap, timeouts, transport retries
- `src/ai/errors.ts:mapHttpError` · `src/ai/errors.ts:mapThrown` · `src/ai/errors.ts:isSchemaRejection` · `src/ai/errors.ts:redact` — table-driven error mapping, teacher-facing messages
- `src/ai/adapters/gemini.ts:geminiAdapter` · `src/ai/adapters/openaiCompat.ts:openaiCompatAdapter` · `src/ai/adapters/anthropic.ts:anthropicAdapter` — wire shapes (`src/ai/adapters/adapter.ts:Adapter`)
- `src/ai/usage.ts:recordUsage` · `src/ai/usage.ts:usageByJob` — the usage log (k-0537): every answered call's tokens (input incl. cached, Anthropic cache writes, output, thinking) and credits (Mentor's receipt, else Mentor's rates for an own Gemini key), one job per client, last 300 calls in localStorage `econ-ai-usage`; adapters translate each provider's cached field (`src/ai/adapters/gemini.ts:geminiUsage` · `src/ai/adapters/openaiCompat.ts:compatUsage` · `src/ai/adapters/anthropic.ts:anthropicUsage`); Anthropic's system block carries `cache_control`. `evals/usage.eval.ts` measures real jobs (`npm run eval:usage`)
- `src/ai/keyShape.ts:keyShapeProblem` — a key from another provider is never sent without "test anyway"
- `src/ai/mentor.ts:createMentorRelay` · `src/ai/providers.ts:MENTOR_API` — the DSEcon Mentor account (k-0519): link-code sign-in, credits, sign-out; its AI requests are the `mentor` preset (`relay: 'mentor'`: Gemini's request wrapped by `src/ai/adapters/mentor.ts:mentorAdapter` for `POST /ai/generate`, the server's model, a stream must end with Mentor's receipt) through `createClient`. Wire: Mentor's `Outbox/k-0518/CONTRACT.md` (k-0518). `src/ai/fakeMentor.ts:fakeMentor` — the stand-in relay tests use
- `src/settings/mentorAccount.ts:createMentorSession` · `src/settings/mentorAccount.ts:useMentorAccount` — sign in (token = secret `ai:mentor`, keychain on desktop), signed in makes `provider: 'mentor'`, sign-out returns to an own key; Settings → AI's `src/components/settings/sections/aiSection/MentorAccountCard.tsx:MentorAccountCard` (own keys under Advanced when signed in) and the setup card's `MentorRow`
- AI status chip (k-0524): `src/components/ai/aiChip.ts:aiChipState` (credits / own key / Set up AI; low = `src/components/ai/aiChip.ts:lowCreditsLine`, one studio run), drawn by `src/components/ai/AiStatusChip.tsx:AiStatusChip` in the studio header and composer and the import check (no status bar: removed in k-0526, u-uw4t). Kept current, only while a chip or Settings → AI is on screen (`src/settings/mentorLive.ts:useMentorLive`, ref-counted by `src/settings/mentorLive.ts:createLiveHolds`; Buy holds it for its 3 min watch), by `src/settings/mentorLive.ts:createMentorLive` (focus/visibility, 60 s light read, 5 s poll for 3 min after `src/settings/mentorLive.ts:openBuyCredits`) and each relay receipt's balance (`src/ai/relayOutcome.ts:reportRelayOutcome` from `client.ts` → `MentorSession.applyBalance`); `refresh()` shares one read in flight
- Mentor credits or my own key (k-0527): the choice IS `AiSettings.provider` (+ `ownProvider`, which own key "My own key" means): `src/settings/aiChoice.ts:aiChoiceState` (shown only signed in AND an own key saved) · `src/settings/aiChoice.ts:choicePatch` · `src/settings/aiChoice.ts:providerAfterForget` (forgetting the key in use → Mentor, in `aiSetupRunner.ts` forget) · `src/settings/aiChoiceLive.ts:setAiChoice`; drawn by `src/components/settings/sections/aiSection/AiChoiceField.tsx:AiChoiceField` (Settings → AI) and the chip's menu (`AiStatusChip.tsx`; in a portal, placed by `src/components/ai/AiStatusChip.tsx:placeChoiceMenu` so it stays inside the window, k-0541, browser check `scripts/ai-chip-menu-verify.mjs`); the error's Use my own key switches + retries (`errorActions.ts`). Every run reads only `provider` (`resolveAiConfig` from `src/translate/deps.ts:createRunDeps`); `src/settings/aiChoice.test.ts` proves the other side gets no request
- `src/ai/credits.ts:creditsFor` · `src/components/ai/CreditEstimate.tsx:CreditEstimate` — "Uses about N credits" before a run (a verb's `estimate`, the import dialog's AI check; `studioJob` for the studio screen). Each job carries its calls' `feature`; `src/ai/credits.ts:ratesFor` prices it at `models.rates[models.byFeature[feature] ?? models.default]` (CONTRACT v1.6, k-0543: the server picks the model by feature, translate on Flash-Lite), else the top-level `rates` (an older Mentor). Never a job list of its own
- `src/ai/fixtures/` — provider error bodies (recorded with dummy keys, or documented shapes); `src/ai/fakeFetch.ts` — the scripted fetch tests use
- `src/settings/types.ts:SettingsSchema` · `src/settings/validators.ts:recordOf` · `src/settings/sections.ts:registerSettingsSection` · `src/settings/sections.ts:useSettingsSections` — schema and section registry
- `src/settings/store.ts:createSettingsStore` · `src/settings/store.ts:appSettings` · `src/settings/store.ts:useSettings` — per-field validation, unknown keys kept, never lowers `v`
- `src/settings/aiSettings.ts:AI_SETTINGS` · `src/settings/aiSettings.ts:readAiStatus` · `src/settings/aiSettings.ts:useAiStatus` · `src/settings/aiSettings.ts:resolveAiConfig` — status never reads the keychain
- `src/settings/appearance.ts:APPEARANCE_SETTINGS` · `src/settings/appearance.ts:THEMES` · `src/settings/appearance.ts:THEME_BOOT_SCRIPT` — the interface theme (stored ids `system` / `light` = Classic / `dark` keep their meaning); `<html data-theme>` names it and `data-scheme` (light/dark) drives `dark:` and native controls; `src/components/settings/sections/appearanceSection/AppearanceEffect.tsx:AppearanceEffect` follows the OS while System, `src/components/settings/sections/appearanceSection/AppearanceSection.tsx` previews each theme under its own `data-theme`. Tokens: `src/app/themes/tokens.css` (semantic names, zones, the paper's reset), one file of primitives per theme with `src/app/themes/light.css` as the contract (guard `src/app/themes/themes.test.ts`); non-default themes load for `screen` only, so print is always Classic. Proof: `scripts/theme-contrast.mjs` (WCAG AA per theme), `scripts/theme-verify.mjs` (paper/`.docx`/print identical across themes, default unchanged, gallery + live text audit)
- `src/settings/termPreferences.ts:TERM_SETTINGS` — Settings → Translation terms (`econgen.settings.terms`, v2); the pane is `src/components/settings/sections/termsSection/TermsSection.tsx` over the pure `src/components/settings/sections/termsSection/termRows.ts`
- `src/settings/termData.ts:cleanCustomTerm` · `src/settings/termsCsv.ts:termsToCsv` · `src/settings/termsCsv.ts:parseTermsCsv` · `src/components/settings/sections/termsSection/termsImport.ts:previewImport` · `src/components/settings/sections/termsSection/termsBackup.ts:restoreTermsCsv` — the teacher's own wordings and terms: row validation, CSV, import preview, backup
- `src/settings/language.ts:LANGUAGE_SETTINGS` · `src/settings/language.ts:LANGUAGE_BOOT_SCRIPT` — the interface language (`en` / `zh-HK`) and the paper language (`en` / `zh` / `bilingual`; read with `src/settings/paperLanguage.ts:paperLanguage` · `src/settings/paperLanguage.ts:usePaperLanguage` · `src/settings/paperLanguage.ts:paperSide`); `src/components/settings/sections/languageSection/LanguageEffect.tsx:LanguageEffect` keeps `<html lang>` in step
- `src/i18n/catalogue.ts:defineMessages` · `src/i18n/catalogue.ts:resolveMessages` · `src/i18n/catalogue.ts:localize` · `src/i18n/catalogue.ts:TextKey` — co-located interface catalogues (§ Interface language; recipe: Translate an area's interface text)
- `src/i18n/language.ts:useMessages` · `src/i18n/language.ts:uiLanguage` · `src/i18n/language.ts:UiLanguageOverride` — read a catalogue in the current language; the override pins a test render
- `src/i18n/terms.ts:KEEP_ENGLISH` · `src/i18n/terms.ts:STANDARD_TRANSLATIONS` — HK wording; `src/i18n/catalogues.test.ts` guards every `messages.ts`
- `src/i18n/format.ts:relativeTime` · `src/i18n/format.ts:calendarDate` — "5 minutes ago" / 5 分鐘前; "24 September 2026" / 2026年9月24日
- `src/i18n/wording.ts:wordingProblems` — the HK wording checks, shared by `src/i18n/catalogues.test.ts` and `src/whatsNew/changelogZh.test.ts`
- `src/i18n/literals.test.ts` · `scripts/i18n-literals.mjs:literalsIn` · `scripts/i18n-literals.mjs:ALLOWLIST` — the ratchet on English-only UI literals per file; `src/i18n/literals.baseline.json` only shrinks (`--write`)
- `src/platform/secrets.ts:readSecret` · `src/platform/secrets.ts:writeSecret` · `src/platform/secrets.ts:peekSecret` — the only holder of AI keys; `src-tauri/src/secrets.rs` the keychain commands
- `src/components/settings/AppSettingsHost.tsx:AppSettingsHost` — mounted in `src/app/EditorHost.tsx`; Effects, ⌘, listener, the dialog
- `src/components/settings/AppSettingsDialog.tsx:AppSettingsDialog` · `src/components/settings/AppSettingsDialog.tsx:AppSettingsFooter` · `src/components/settings/AppSettingsDialog.tsx:closeStep` — rail, lazy pane, close guard
- `src/components/settings/shortcut.ts:shouldOpenSettings` — ⌘, / Ctrl+, rules
- `src/components/settings/sections/index.ts` — one import per section
- `src/components/settings/sections/ai.ts` — registers AI & translation; `src/components/settings/sections/language.ts` registers Language 語言; their rail text is `src/components/settings/sections/messages.ts`
- `src/components/settings/sections/aiSection/aiSetup.ts:aiSetupReducer` · `src/components/settings/sections/aiSection/AiSection.tsx` · `src/components/settings/sections/aiSection/AiSectionView.tsx:AiSectionView` — the AI pane
- `src/components/settings/sections/aiSection/aiSetupRunner.ts:createAiSetupRunner` — the pane's side effects, injected; a flow never outlives its card
- `src/test/secretsNeverLeave.test.ts` — a key is in no document, backup, export or setting
- `src/components/translate/copy.ts` — the copy deck
- `src/components/translate/translateMenu.ts:pageAiScope` · `src/components/translate/translateMenu.ts:fillVerbFor` · `src/components/translate/translateMenu.ts:toolbarSettingsEntries` — the AI door's entry points, pure (right-click scope, Export's preselect, ⋯ Settings…)
- `src/components/translate/fieldFill.ts:fillButton` · `src/components/translate/fieldFill.ts:runFieldFill` — `BiTextField`'s inline fill (the `translate` prop)
- `src/components/settings/SettingsButton.tsx:SettingsButton` — the gear, far right of the start screen's and bank's top row; the editor keeps ⋯ Settings… (no room at 1024); `src/components/ui/icons.tsx:PageSetupIcon` (Setup; the gear is app Settings)
- `scripts/ai-verify.mjs` · `scripts/ai-mock-server.mjs` — the AI door's browser run (six groups, Chromium and WebKit; answers / source / quality paused) against a canned provider; nothing sent before a click
- `scripts/hosted-ai-live.mjs` — the same account against a REAL Mentor dev server (real Gemini, keep runs few): sign in with Allow, credits and packs, one studio send with a reference picture and diagrams, one import check, no credits and the month's limit (through Mentor's test-account helper); screenshots in Outbox/k-0519/live
- `scripts/hosted-ai-verify.mjs` — the DSEcon Mentor account in a browser (k-0519): setup card Sign in → code → Allow → the verb runs on the account, Settings card and Advanced, the menu's credit line, out of credits, Sign out; the AI status chip per state in the studio header (k-0524), no status bar and no reads with no chip shown (k-0526), Mentor credits / own key choice in Settings and the chip's menu with requests counted per side (k-0527), live refresh and Buy's poll; Mentor's host answered by a stand-in inside the browser
- `scripts/bank-ai-verify.mjs` — the bank's ✦ run in Chromium and WebKit (filter, fill into identical copies, Undo all, a 25-question batch with confirm and Stop, Check terms, SetupCard, region error, 1024 and dark layout); `--seed=` adds a teacher's documents

Invariants:
- Nothing new is stored in a document; settings under `econgen.settings.<section>`, keys only in the secrets store.
- `src/ai/` imports nothing from React, the store, `src/model`, `src/settings`, `@/platform` or Tauri (`src/ai/imports.test.ts`).
- Network calls appear only in `src/ai/http.ts` (`src/test/networkCalls.test.ts`).
- The glossary data is reached only through `src/glossary/load.ts` (a lazy chunk).

## AI door — one menu for every AI action

- `src/assist/types.ts:AiVerb` · `src/assist/types.ts:VerbOutcome` · `src/assist/types.ts:ReviewItem` — the contract every verb implements
- `src/assist/registry.ts:registerVerb` · `src/assist/registry.ts:verbs` — verbs self-register; `src/assist/verbs/index.ts` has one import per verb file
- `src/assist/paused.ts:PAUSED_VERBS` — E1, E3, E4 built but hidden from teachers: the menu skips them, `startVerb` refuses them; remove an id to bring one back (`setPausedForTest` for their own tests)
- `src/assist/scope.ts:scopeFromSelection` · `src/assist/scope.ts:scopeLabel` — the selection as an `AiScope`, pure (multi-selection via the store's `selectedFlowIds`)
- `src/assist/menuStore.ts:openAi` — what every entry point calls; `src/assist/runStore.ts:useAiRun` — one run at a time: running → review (after a direct insert) or error
- `src/components/ai/SetupCard.tsx:SetupCard` — the no-key card inside the menu (provider, key, Save & continue → `onReady`); flow in `src/components/settings/sections/aiSection/setupCardFlow.ts:createSetupCardFlow` over the Settings runner
- `src/components/ai/AiHost.tsx:AiHost` — mounted once in `EditorApp`; renders `src/components/ai/AiMenu.tsx` and `src/components/ai/AiBar.tsx`, owns ⌘J / Ctrl+J (`src/components/ai/shortcut.ts:shouldOpenAi`)
- `src/components/ai/AiButton.tsx:AiButton` — the toolbar's "✦ AI" (untranslated count as its badge); `src/components/ai/AiMenu.tsx:AiMenuPopover` — filter, scope chip (`src/assist/scope.ts:scopeChoices`), grouped verbs, setup and input steps, provider footer; rows pure in `src/components/ai/aiMenuModel.ts:menuGroups`
- `src/assist/verbs/translate.ts:translateVerb` — Fill missing / Re-translate 中文 or English: one `applyTranslations`, then `inserted` review items; `src/assist/verbs/checkTerms.ts:checkTermsVerb` — keyless findings, Replace N; store-free rules in `src/assist/fillRules.ts` (`fillOptions`, `textsIn`, `rowNotes`, `depsError`, `genericError`) and `src/assist/termRules.ts` (`safeFix`, `termNotes`, `termTally`), re-exported by `src/assist/verbs/translateShared.ts`, which adds the store half (`slotsOf`, `applyWrites`, `commitUndo`)
- `src/assist/bankRun.ts:runBankFill` · `:runBankTerms` · `:replaceTerms` — the same verbs over saved documents for the question bank: one question at a time (Stop keeps what is done), each result written into every identical copy (`src/library/sameCopies.ts`)
- `src/components/ai/AiBar.tsx:AiBar` — running / review / error bar over the page column; `src/components/ai/ItemCard.tsx:ItemCard` beside the text; `src/components/ai/errorActions.ts:errorActions` the error's buttons (`:runErrorAction` takes the run it drives, the editor's or the bank's); the pieces both bars use in `src/components/ai/barParts.tsx:BarButton` · `:RunningBody` · `:ErrorBody`, the menu's last line in `src/components/ai/ProviderFooter.tsx:ProviderFooter`
- `src/components/ai/pageMarks.ts:usePageMarks` — review highlights as a `data-ai-mark` attribute on `#print-root` text, re-applied by a MutationObserver; styled under `@media screen` in `src/app/globals.css`
- `src/assist/verbs/fromSource.ts:makeFromSourceVerb` — E3 "Questions from a source…": `src/generate/recipe.ts:recipeFor` (what this paper can contain) → `src/generate/run.ts:generateFromSource` (one request, `src/generate/prompt.ts:SOURCE_QUESTIONS_SCHEMA`) → `src/generate/validate.ts:checkDraft` → `src/generate/build.ts:buildBatch` → the store's `insertQuestionBatch`
- `src/assist/verbs/polish.ts:polishVerb` — Improve wording (k-0549, `check.wording`, beside Check terms): MC questions in scope → `src/polish/collect.ts:polishQuestions` (stem paragraphs, statements, option lines; tables read-only context) → `src/polish/run.ts:runPolish` (chunks of `src/ai/credits.ts:POLISH_CHUNK`; system = `src/dseStyle/profile.ts:DSE_STYLE_PROFILE` then `src/polish/prompt.ts:POLISH_RULES`, feature `polish`, texts in the wire format `src/translate/wire.ts:encodeRuns`/`:decodeWire`; 中文 tidied by `src/polish/run.ts:tidyRuns` keeping typed spaces) → guards `src/polish/guard.ts:numbersMoved` · `:orderMoved` + the key letter (a broken one is `failed`, never offered) → `checkDseStyle` before/after in the summary; findings with `ReviewItem.diff` (`src/polish/diff.ts:diffText`, drawn by `src/components/ai/ItemCard.tsx`), Accept / Accept all = `src/polish/apply.ts:applyPolishEdits` in one `commit` (both sides at once, stale-guarded), Discard = the bar's `dismissLabel`; estimate `src/ai/credits.ts:polishJob`; browser run `scripts/polish-verify.mjs`
- `src/assist/verbs/quality.ts:qualityVerb` — Check question quality (E4), findings only; engine `src/quality/run.ts:runQuality` · `src/quality/checks.ts:deterministicFindings` · `src/quality/collect.ts:qualityQuestions` (reads the registry's `qualityView`); words `src/quality/promptText.ts:SYSTEM_QUALITY`, `src/quality/prompt.ts:PROMPT_VERSION`

- `src/assist/verbs/coverage.ts:coverageVerb` — Check syllabus coverage (k-0317), a report (`VerbOutcome` kind `report`, shown by `src/components/ai/CoverageReportDialog.tsx:CoverageReportDialog` from the bar's Open report); units `src/coverage/units.ts:markedUnits`, engine `src/coverage/run.ts:runCoverage` (each question's result to its own temporary file, `src/platform/scratch.ts:openScratch`: `$APPDATA/scratch/` on desktop, OPFS or memory on the web, disposed in a `finally`, leftovers swept by `:sweepScratch`), report `src/coverage/report.ts:buildReport`; syllabus data `src/syllabus/index.ts:SYLLABUS`, generated by `scripts/gen-syllabus.mjs` from `docs/research/syllabus-2025.json`; design `docs/research/2026-11-syllabus-analysis.md` § 10.11; browser run `scripts/coverage-verify.mjs`; k-0489: the report's language is the paper's (`src/coverage/language.ts:reportLanguage`: one-language paper → that one, translated → the view, bilingual → English, as `src/model/topics.ts:topicNamesFor`), the run hands back `src/coverage/result.ts:CoverageResult` (language, title, scope, date, page size, and a set's `papers`); Download report (PDF) prints `src/components/ai/CoverageReportSheets.tsx:CoverageReportSheets` (blocks measured off screen, packed by `:packBlocks`, table header repeated) as a `coverage` print job (`src/components/editor/printJob.tsx:printJobPdf`), its printed words in `src/coverage/reportText.ts:reportText` (not a UI catalogue; since k-0503 in the teacher's "Report in" English / 中文 pick beside Download, remembered by `src/coverage/reportLanguagePref.ts:readReportLanguage`, the paper's language until then; syllabus names stay the paper's via `src/coverage/reportText.ts:nameIn`; mirrored by the dse-econ-coverage skill); `src/assist/verbs/coverage.ts:coverageSetVerb` (`check.syllabus.set`, paused with `check.syllabus` by `src/assist/paused.ts:isPaused`'s family rule) runs every paper of the set (`VerbContext.paperSet`, filled through `src/assist/paperSetSource.ts:setPaperSetSource` by `src/components/editor/setMembers.ts:paperSetForAi`) into one report; k-0489 v2: every finished check is kept with each paper it read (`src/model/coverageReports.ts:withCoverageReport`, `Worksheet.coverageReports`, only the latest per paper, `:MAX_COVERAGE_REPORTS` = 1 (u-vouw), extras tidied on load, read through `:savedCoverageReports`, malformed dropped / newer formats kept by `:normalizeCoverageReports`, no schema bump, duplicates leave them behind) by `src/store/coverageReports.ts:keepCoverageReport` (stored copy via `changeSetMembers` + `adoptSavedElsewhere`, called from `src/assist/runStore.ts`), rebuilt by `src/coverage/result.ts:coverageFromSaved`, changed papers by `:changedRuns` against `src/coverage/questions.ts:paperFingerprint`; `src/assist/verbs/coverage.ts:coverageSavedVerb` (`check.syllabus.saved`, Last coverage report, no key) reopens it; the PDF's summary page reads `src/coverage/insights.ts:insights`
- `src/assist/verbs/writeAnswers.ts:makeWriteAnswersVerb` — E1 `write.answers` (§ AI answers and mark schemes); engine `src/answers/plan.ts:planAnswers` · `src/answers/run.ts:runAnswers` · `src/answers/validate.ts:evaluateAnswer` · `src/answers/apply.ts:applyAnswerWrites` · `src/answers/prompt.ts:PROMPT_VERSION`
- `src/model/answerLeaves.ts:AnswerLeaf` — what the registry hook `mapAnswers` offers; test-only `src/answers/testKit.ts`

Invariants:
- Results insert directly as one commit; review is after, and `undoAll` reverts that one commit.
- Highlights are imperative chrome: no IR or `ItemBody` read, never printed, never in the `.docx`.
- A verb's network call happens only on its menu click; nothing AI-related is stored in a document.

## dseStyle — the HKDSE Paper 1 MC house style (k-0548)

Measured on the 725 HKDSE Paper 1 questions of the past-paper bank (report `Outbox/k-0548/DSE-STYLE.md`). Not tied to the studio: any feature that asks the AI to write or improve a Paper 1 question uses the same block and check (k-0549's wording enhancement, `src/polish/`, does).

- `src/dseStyle/profile.ts:DSE_STYLE_PROFILE` · `:DSE_STYLE_MARKER` · `:DSE_STYLE_PROFILE_VERSION` — one fixed text (EN rules with the 中文 patterns inside), ≈ 1,550 tokens; `src/ai/credits.ts:STYLE_BLOCK_TOKENS` counts it in the studio's estimate
- `src/dseStyle/check.ts:checkDseStyle` · `:STYLE_FINDING_IDS` · `:optionNumber` — 16 deterministic rules on `{ stem, statements, options }` per side (`**bold**`, table rows as "a | b")
- `src/dseStyle/bank.ts:styleItemOf` — an editor-schema question (rich runs, paragraph/table blocks) as the check's input
- `src/dseStyle/messages.ts:DSE_STYLE_MESSAGES` · `:styleFindingText` (entries in `src/dseStyle/words.ts:DSE_STYLE_WORDS`)

Invariants:
- The block is one constant: the same bytes on every call (a prompt cache can reuse it). Change it only on purpose, bump the version, and re-run the check over the bank (`DSE_BANK_DIR=<bank>/topics npx vitest run src/dseStyle`): real HKDSE questions must stay ≥ 95% clean (717 of 725 at v1).
- Style findings are notes, never a block; past-paper wording never enters the block (it describes patterns, with counts).

## questionStudio — the Question studio, engine and page (k-0499; shown in a develop build, hidden in a release build)

Design `docs/design/question-studio.md`. The engine is pure over injected deps, like `src/generate/`; one click is at most five requests. The session, delivery and gate files wire it to the app; the page is `src/components/studio/`.

- `src/questionStudio/types.ts:StudioRequest` · `:StudioDraft` · `:CheckRow` · `:StudioOutcome` — what a teacher asks, what comes back (findings are codes; the words belong to the page)
- `src/questionStudio/run.ts:writeDrafts` — write → local checks → one rewrite of hard failures → blind solve → one rewrite of key disagreements → solve; `:refine` — Another / Harder / Easier / the Change line; `:parseSolveReply`
- `src/questionStudio/brief.ts:makeBrief` — the key point, points and NOT-required limits from `src/syllabus`, the key plan; `:briefPayload` the JSON that is sent; `:sentSummary` what the form lists; `:PAYLOAD_KEYS` the keys nothing else may join
- `src/questionStudio/prompt.ts:buildWriteRequest` · `:buildSolveRequest` — the two requests, their schemas and system prompts (`WRITE_TASK_MARKER`, `SOLVE_TASK_MARKER`)
- `src/questionStudio/validate.ts:localChecks` — every local check on one cleaned draft; `:parseWriteReply` · `:shapeFindings` · `:statusOf`
- `src/questionStudio/nearCopy.ts:checkNearCopy` · `:buildCorpusIndex` — shingles (6 words / 8 characters, numbers read as `#`) against an index of the bank, the teacher's questions, the open paper
- `src/questionStudio/numbers.ts:checkNumbers` (EN = 中文 numbers, 5 billion = 50億) · `src/questionStudio/lint.ts:lintDraft` · `:lintBatch` · `src/questionStudio/guard.ts:scanLimited` (NOT-required terms)
- `src/questionStudio/pick.ts:pickKeyPoints` · `:parsePicks` — step 1 of every write: the AI picks the EDB key point(s), one request, codes checked against the syllabus; `session.ts:withKeyPoints` runs it (k-0514)
- `src/questionStudio/figures.ts:figuresOfBlocks` · `:withFigures` · `:placedFigureBlocks` · `:figureLang` — a reference question's pictures and diagrams as images sent with the request (`ai/types.ts:CompletionRequest.images`, `ai/providers.ts:supportsImages`), pictures in table cells included (a Q36-style grid, k-0544), a set printed together (a grid in a stem table, a picture under every option: `:FigureCell`, `SourceQuestion.figureGrid`) drawn as one labelled picture by `src/questionStudio/composite.ts:drawComposite` (layout `:compositeLayout`; one by one where there is no canvas), up to `:MAX_FIGURES_PER_EXAMPLE`, each with where it sits (`SourceQuestion.figureAt`: "stem (1)", "option A"), the Chinese pictures on a 中文-only paper; `references.ts:searchRows` picks a question by hand. Proof: `src/questionStudio/referenceShapes.test.ts`; `scripts/studio-reference-verify.test.ts` runs every question of a local bank copy (`PASTPAPER_BANK=…`) and fails on any picture or table lost; `scripts/studio-composite-sheet.test.ts` + `scripts/studio-composite-sheet.mjs` draw every set in Chrome on a contact sheet
- `src/questionStudio/partial.ts:partialDrafts` (the write reply read while it streams) · `stream.ts:applyEvent` (events → `LiveState`) · `types.ts:StudioEvent` · `run.ts:writeDrafts` `onEvent`, and its diagram step (`generateDiagram` per draft) — the engine API for the screen, `docs/design/question-studio.md` § Engine API; `src/ai/client.ts` `stream` + `http.ts:sendStream` the transport
- `src/questionStudio/referenceShape.ts:referenceGap` — a picked reference's form the writer cannot follow yet (several stem diagrams, option diagrams, option tables; k-0544 step 7): `run.ts` marks each pattern-mode draft's format row `shape.referenceForm` (look) and the run `run.referenceShape`; the chat's `refShape` note. Browser proof: `scripts/studio-gap-verify.mjs`
- `src/questionStudio/source.ts:sourceFromQuestion` (an MC question as an example) · `:corpusDocOf` (any question's printed words) — text only: tables as " | " lines (merged cells fill what they cover; option tables in the option's words), a picture as `:PICTURE_MARK`
- `src/questionStudio/insert.ts:studioBuilds` — picked drafts → `QuestionBuild`s for `insertQuestionBatch`, tagged with the key point; reuses `src/generate/build.ts:fillMcq`
- `src/questionStudio/session.ts:createStudioSession` · `:StudioState` · `:canWrite` · `:requestOf` — the screen's one in-memory state (form, drafts newest first with the request each was written for, ticks, focus, the run in progress, usage); one run at a time, Stop, Try again, Another/Harder/Easier/Change in place; never saved. `src/questionStudio/live.ts:useStudio` is the app's session over `src/questionStudio/live.ts:liveEnv` (provider from `createRunDeps`, glossary, corpus from the Past paper bank's search index and the library index `bankRowsNow`)
- `src/questionStudio/corpus.ts:studioCorpus` · `:pastPaperDocs` · `:ownDocs` — what drafts are compared with (the Past paper index's words, the teacher's own questions once per `contentKey`); built once per inputs
- `src/questionStudio/deliver.ts:pickedEntries` · `:buildsOf` · `:insertIntoOpenPaper` · `:keepInMyBank` · `:materialize` · `:languageOf` · `:paperName` — the tray's two ways out: one `insertQuestionBatch` (one ⌘Z) or `src/library/bankDocs.ts:addToOneBank`; originals, tagged with each draft's key point
- Quality (u-bd41): `src/questionStudio/references.ts:findReferences` · `:chooseReferenceRows` · `:referencesWanted` · `:referenceOf` — 3–5 real HKDSE questions of the key point as automatic style references (weighted: recent HKDSE, words over pictures, the shape asked, a plain/combination mix; only the topics holding the picks are downloaded), wired by `src/questionStudio/session.ts:withReferences` and `src/questionStudio/live.ts:liveBank` and switched by `src/questionStudio/options.ts:STUDIO_OPTIONS`; `src/questionStudio/frequency.ts:keyPointCounts` — HKDSE MC questions per key point, used by `src/components/studio/studioView.ts:rankKeyPoints` (counts, sorted, never-asked folded); strict reference mode = `StudioRequest.strict` + `src/questionStudio/brief.ts:referenceMode` (`make.reference` `style` or `pattern`) + `src/questionStudio/nearCopy.ts:checkNearCopy`'s `exempt` (no limit against the picked reference, finding `copy.reference`)
- `src/questionStudio/trial.ts:STUDIO_TRIAL_SETTINGS` · `:studioDefaultOn` · `:useStudioTrial` · `:applyTrialRequest` · `:readTrialRequest` — the trial switch (`econgen.settings.questionStudio`): the default is on in a develop build and off in a release build (`src/platform/buildChannel.ts:RELEASE_BUILD`, `NEXT_PUBLIC_RELEASE_BUILD=1` set only by `.github/workflows/release.yml`); `?studio=trial` / `?studio=off` once at the start screen override it, the address cleaned; the page's "Turn the trial off" is offered only where the studio is opt-in (a release build)
- Page `src/components/studio/QuestionStudioScreen.tsx:QuestionStudioScreen` (start screen view `studio`, Library row in `src/components/start/StartScreen.tsx` only while the switch is on; k-0516 chat screen): chat column (`src/components/studio/chat/ChatTurns.tsx:ChatTurns` steps and notes, `src/components/studio/chat/PickLine.tsx:PickLine` the AI's pick with Change, `src/components/studio/chat/Composer.tsx:Composer`) and the paper `src/components/studio/chat/PaperCanvas.tsx:PaperCanvas` (Paper | Side by side, streaming slots, `src/components/studio/chat/whatChanged.ts:whatChanged`) with `src/components/studio/chat/ChatDraftCard.tsx:ChatDraftCard` and `src/components/studio/Tray.tsx:Tray`; state `src/components/studio/chat/chatStore.ts:createChatStore` (`src/components/studio/chat/live.ts:useChat`), saved by `src/components/studio/chat/chatStorage.ts:localChatStorage` (`econgen.studioChats.v1`, per-chat validation `:readChat`); the engine only through `src/components/studio/chat/engine.ts:liveEngine` (`StudioEngine`: pick, write, refine; `src/components/studio/chat/localPick.ts:localPick` when the AI names no key point); picker `src/components/studio/ReferencePicker.tsx:ReferencePicker`; words `src/components/studio/chat/chat.messages.ts:STUDIO_CHAT_MESSAGES`, `src/components/studio/picker.messages.ts`; check rows `src/components/studio/CheckLine.tsx:CheckLine`; errors `src/components/studio/StudioError.tsx:RunErrorNotice` (a notice; Gemini unreachable adds the VPN note, `src/components/ai/errorActions.ts:errorNote`)
- Editor ✦ Write tab (k-0516 B): `src/components/studio/panel/WritePanel.tsx:WritePanel` (in `src/components/editor/Sidebar.tsx`) · `src/components/studio/panel/paperChat.ts:usePaperChat` · `:acceptDrafts` · `:reopenUndone` · `src/components/studio/panel/ghosts.ts:ghostsOf` · `:withGhosts` (placed by `src/store/worksheetStore.ts:placeQuestions`, the insert's own rule) · `src/components/studio/panel/PageDrafts.tsx:usePageDrafts` (the page's derived copy, from `src/components/EditorApp.tsx`; `src/components/preview/Preview.tsx:GhostLayer`) · `src/components/studio/panel/coverage.ts:paperCoverage` (the opener's topics from tags) · `src/components/studio/panel/writePanelState.ts:hideGhostsForPrint`
- Words: `src/components/studio/messages.ts:QUESTION_STUDIO_MESSAGES` · `src/components/studio/findings.messages.ts:STUDIO_FINDING_MESSAGES` · `src/components/studio/findings.ts:findingText` (every code the engine reports has a sentence: `findings.test.ts` reads the engine's sources)
- "✦ Write like this": `src/components/studio/WriteLikeButton.tsx:WriteLikeButton` on Past paper cards (`src/components/pastpapers/PastPaperScreen.tsx`) and the Question bank review page (`src/components/bank/page/ReviewPage.tsx`); `src/components/studio/openStudio.ts:writeLikeThis` opens a fresh chat with the question and starts at once (k-0516; the AI picks the key point, the tag is only the fallback's hint); `src/components/studio/studioView.ts:keyPointOfTags`
- The AI-made label (the field `aiMade` of `src/model/types.ts:QuestionBase`, `true` or absent): set by `src/questionStudio/insert.ts:studioBuilds`, so in a paper and in the bank alike; review state, so `src/library/contentKey.ts:IGNORED` lists it and `src/library/contentKeyFields.test.ts` classes it metadata; `src/model/lineage.ts:copyQuestion` keeps it. Shown, never printed: `src/components/preview/AiMadeChip.tsx:AiMadeChip` (absolute, `data-print-hide`, only on a page being typed on, drawn by `src/components/preview/Preview.tsx:ItemBody`), `src/components/editor/AiMadeNote.tsx:AiMadeNote` in the Edit panel with the Checked button (`:CHECKED_PATCH`, absence never `false`, one undo step), a ✦ mark in `src/components/editor/Outline.tsx`, a read-only line on the 題庫 review page, and the `aiMade` warning of `src/model/paperHealth.ts:checkPaper` (the Export dialog's Paper check). Words: `src/components/editor/AiMade.messages.ts:AI_MADE_MESSAGES`
- Trial kit, quality additions: marks `dse` and `tested` on `src/questionStudio/trialLog.ts:TrialDraft` (not part of the bar), `:Arm` (`today` · `refs` · `strict` · `style`) on each run, `src/questionStudio/trialRun.ts:requestForArm` (the brief run's way of writing), `src/questionStudio/trialScore.ts:tally` `byArm` and the report's "Style and concepts" lines
- The trial kit (decision 7a): `src/questionStudio/trialBriefs.ts:TRIAL_BRIEFS` (30 invented briefs, `:TRIAL_EXAMPLES`, `:requestOfBrief`) · `src/questionStudio/trialRun.ts:runBriefs` · `:createBriefRunner` (one Write per brief on the teacher's key, resumable, never touches the sheet; `src/questionStudio/live.ts:useBriefRun`) · `src/questionStudio/trialLog.ts:createTrialLog` (every run's drafts and checks plus the teacher's marks, in `localStorage` `econgen.studioTrial.v1`; `live.ts:useTrialLog`; the session's `onRun` hook records the teacher's own requests) · `src/questionStudio/trialScore.ts:tally` · `:reportText` · `:BAR` (key defensible ≥ 90%, usable ≥ 60%, no near-copy shown, judged once 20 are marked). Page: Settings → AI, `src/components/settings/sections/aiSection/TrialKitBlock.tsx:TrialKitBlock` opens `src/components/studio/TrialView.tsx:TrialView` in a dialog (k-0516) (`:BriefsPanel`) · `src/components/studio/TrialList.tsx:TrialList` (cards, `src/components/studio/trialView.ts:readingList`) · `src/components/studio/TrialReport.tsx:TrialReport` · `src/components/studio/TrialMarks.tsx:TrialMarks`; words `src/components/studio/trial.messages.ts:STUDIO_TRIAL_MESSAGES`
- Reading a message once drafts exist (k-0535, u-yu7s): `src/components/studio/chat/intent.ts:readLocally` (the computer's rules: fast path and fallback) · `:decide` · `:briefsOf`; the AI's read is folded into step 1, `src/questionStudio/understand.ts:buildUnderstandRequest` · `:parseTurn` (via `src/components/studio/chat/engine.ts:liveEngine` `pick` with `drafts`; `picks: false` = answer-only, no syllabus); the store acts in `src/components/studio/chat/chatStore.ts:createChatStore` (`readAndAct` → `act` → `changeIn`, the one place an AI edit makes a version; `answerWhich`); the composer's chip and guess in `src/components/studio/chat/Composer.tsx:Composer`; phrasings `src/components/studio/chat/intentPhrasings.ts:PHRASINGS` with recorded AI replies (re-record with `intent.record.test.ts` after a prompt change); browser run `scripts/studio-intent-verify.mjs`. `Refinement.parts` (`src/questionStudio/types.ts:Refinement`) tells refine what a change touches (`diagram` → k-0534's diagram path)
- Test-only `src/questionStudio/fixtures.ts` (invented questions, never past-paper text); `scripts/ai-mock-server.mjs` answers the studio's requests for browser runs
- HKDSE house style (k-0548): `src/dseStyle/profile.ts:DSE_STYLE_PROFILE` (the fixed prompt block, in the write system prompt as rule 15 + block) · `src/dseStyle/check.ts:checkDseStyle` (the `style` row of `localChecks`) · `src/dseStyle/messages.ts:styleFindingText` (words; `src/dseStyle/words.ts:DSE_STYLE_WORDS` spread into the studio's findings catalogue) — a module of its own, see § dseStyle

Invariants:
- Once drafts exist, an edit is never turned into new drafts: an AI "new" against the computer's edit, or no read at all, asks which draft (`intent.ts:decide`); an edit is a new version of its card (`older`), never a new card (only Another adds one).
- Nothing is sent before a click, and what is sent is exactly the brief: a picked example's words and key, never its label (year, paper, number).
- A draft the hard checks fail (`shape`, `copy`) is never built; nothing is inserted except by `studioBuilds` on the teacher's Add.
- The studio is off for everyone: no row, no screen, no ✦ Write like this button unless `studioTrialOn()`; nothing is written to a paper or the bank except by Add or Keep, and a draft that landed leaves the sheet.
- `aiMade` reaches no backend: the IR, `.docx`, PDF and clipboard are the same with it or without it (`src/questionStudio/aiMade.test.ts`); a new question field is classed in `contentKeyFields.test.ts` (a question field needs no `KNOWN_KEYS`: that set is the worksheet's top level only).
- The trial's record holds the AI's drafts, their checks and the teacher's marks, never an example's words (`RequestSummary` counts them) and never a paper.
- No file here reads `src/coverage/` words or edits `src/syllabus/`.

## diagramGen — AI-made diagrams for generated questions (k-0515; MC figures, checks and edits k-0534)

The model returns a small semantic spec, never coordinates; `compile.ts` builds it with the template kit into an ordinary anchored `Diagram`, so a teacher edits it like one they drew. Pure over injected deps; at most two requests (one repair turn when a check fails). Entry: `src/diagramGen/index.ts` (the call the studio engine makes, documented there).

- `src/diagramGen/types.ts:DiagramSpec` (kinds `none` / `curves` / `chart` / `template`, `placement` question or answer) · `:DiagramGenInput` (question + key + optional `reference`: an editor diagram, a picture, or words) · `:DiagramGenDeps` (`completeWithImages` sends a picture when the provider layer can) · `:DiagramGenOutcome`
- `src/diagramGen/schema.ts:DIAGRAM_SPEC_SCHEMA` (every key required, strict-mode safe) · `:parseSpec` (never throws; a bad enum is a `look`)
- `src/diagramGen/set.ts:generateDiagrams` (k-0545) — several figures in ONE request (`FigureAsk` `at`: `stem`, grid `(1)`–`(4)`, options `A`–`D`), each a spec checked as one is; `:checkGraphNote` (drawn shape vs the writer's note), `:solveSet` (a grid of tax graphs → "which of (1)–(4) show X" → the option); the repair re-asks only the failed figures. Role `graph` (`types.ts:GRAPH_SHAPES`, `compile.ts:GRAPH_LINES`) draws plain "Y against X" lines. Fixtures: `src/diagramGen/setFixtures.json` (also the mock AI's replies).
- `src/diagramGen/compile.ts:compileSpec` — curves by role and slope, `shift` copies with following arrows, anchored equilibria, price lines, shortage/surplus brackets, Shade-menu presets and revenue areas, frontiers, data charts, editor templates
- `src/diagramGen/validate.ts:checkDiagram` (axes titled, curves named and distinct, a gap's word matches Qd vs Qs, a ceiling/floor that binds) · `:checkAgainstKey` — `:keyClaims` (English and 中文 "demand increases", "S shifts upward", "需求減少") against `:diagramChanges` (read from labels and geometry, so templates are covered); opposite = error
- `src/diagramGen/prompt.ts:buildDiagramRequest` (the template and Shade menus are derived from the registries) · `:buildRepairRequest`; `src/diagramGen/describe.ts:describeDiagram` (a reference figure in words)
- `src/diagramGen/run.ts:generateDiagram` · `:evaluateReply` · `:evaluateSpec` (compile + every check, no request) · `:blockOf`; cases `src/diagramGen/fixtures.ts:CASES`, MC cases `src/diagramGen/mcFixtures.ts:MC_CASES`; samples `scripts/diagram-gen-samples.mjs` (PNG + contact sheet)
- k-0534: `types.ts:SpecPoint` (any two lines meet, or a curve at an earlier tick) · `:SpecLevel` (`above`/`below` a named crossing; `style` guide = the HKDSE dashed drop carried by its furthest point, no line of its own; `quota` = a quantity level) · `:SpecAsks` (what the question asks). `compile.ts:compileSpec` slides each level inside its band to keep ticks apart, widens a shift a level must sit between, and places shift arrows clear of levels and points. `labels.ts:checkLabels` (every label the question names is drawn; Q/P ticks numbered in order) · `validate.ts:checkStem` (the stem's policy and "from S1 to S2" match the drawing) · `solve.ts:solveKey` (the key worked out again from the geometry: ceiling, floor, quota, tax, subsidy; must be the keyed option) · `words.ts:figureWords` (the figure in words for the blind solve). Edit mode: `DiagramGenInput.edit` → `DIAGRAM_EDIT_SCHEMA` (the spec + `questionChange`). The system prompt is a fixed prefix, byte-identical per call (Gemini implicit caching, u-gi2a; test in `src/questionStudio/figureFlow.test.ts`). Before/after sheet: `scripts/k0534-before-after.mjs`

Invariants:
- Never `failed` into a paper: a diagram with an error issue comes back with `block: null`.
- No file here imports `src/generate/`, `src/questionStudio/`, `src/import*/`, `src/coverage/` or `src/syllabus/`.

## import — Import from Word or PDF (D1), the engine

`docs/design/paste-import.md` (§ 10 As built). Pure: no React, no store, no DOM (the PDF reader's optional figure crops aside).

- `src/import/index.ts:readDocx` / `src/import/readPdf.ts:readPdf` → `src/import/index.ts:analyseLines` (re-run on every pin) → `src/import/build.ts:buildImport` → the store's `insertQuestionBatch`. `:readPaste` / `:analysePaste` (clipboard text) are kept and tested, but the app no longer calls them: import is file-only
- `src/import/types.ts:SourceLine` · `:Pin` · `:LayoutProfile` · `:Outline` · `:Analysis` — the shapes; flags are codes (`:FlagKind`), worded by the UI
- `src/import/readPlain.ts:readPlain` · `src/import/readHtml.ts:readHtml` → `src/import/lines.ts:toSourceLines` — readers, then labels, marks, cells and multi-item rows split off
- `src/import/index.ts:readDocx` — a `.docx` file to the same lines: `src/import/readDocx.ts:readDocxLines` (package, pictures, title; rejects with `:DocxReadError`) · `src/import/docxBody.ts:BodyReader` (paragraphs, tables, text boxes at their anchor, drawings → pictures or slots) · `src/import/docxNumbering.ts:Numbering` · `:Styles` · `src/import/xml.ts:parseXml`; tests build invented files with `src/import/fixtures/docx.ts:makeDocx`
- Word drawings as pictures (k-0498): `src/import/docxDrawing.ts:drawPieces` (a group of shapes, or a diagram's floating shapes pooled by `BodyReader`, flattened to one SVG: presets, freeforms, flips, arrowheads, text boxes; null → the slot stays) · `src/import/docxChart.ts:drawChart` (pie, doughnut, bar, line; null for the rest) · `src/import/drawingml.ts:readTheme` · `:colorOf` (theme colours and modifiers, fills, strokes, the SVG writer). `readDocxLines` hands each SVG to `prepareImage` (the app stores a PNG; `.docx` export takes no SVG); `ImageRef.drawn` / `:optionLetters` let the import check offer MC for four lettered graphs. Hand-run: `scripts/drawn-probe.test.ts`, `scripts/word-drawings-verify.mjs`
- `src/import/readPdf.ts:readPdf` — a `.pdf` file: pdf.js items and drawing ops → `src/import/pdfLayout.ts:layoutPdf` (pure: rows, columns, re-attached labels and marks, tables, joined paragraphs, noise) · `:findFigures` (slots, PNG crops via `prepareImage`). pdf.js loads only here: `src/import/pdfjs.ts:pdfjsLib` (legacy build, worker from `src/import/pdf.worker.ts`, `:useMainThread` when a webview refuses it). Tests build PDFs with `src/import/fixtures/pdfWriter.ts:makePdf`
- Scans (§ 13, desktop): `src/platform/ocr.ts:readyOcrEngine` (the shell's `ocr_status` / `ocr_image`; `:fakeOcrEngine` for tests) · `src/components/import/scanImport.ts:recognisePages` (pages one at a time: `src/import/readPdf.ts:renderPdfPages` for a PDF, `src/components/import/scanImport.ts:pictureToPng` for a picture) → `src/import/ocrLayout.ts:readOcrPages` (pure adapter: px→pt, deskew, unclip, `:splitGluedLabel`) → `layoutPdf`, `source: 'ocr'`. Fixtures: `src/import/fixtures/ocrPages.ts`
- `src/import/detectors.ts:DETECTORS` — one function per convention; `src/import/levels.ts:inferLevels` · `:settleQuestionRuns` — family levels and question runs; `src/import/walk.ts:walk` — the outline
- `src/import/solve.ts:solve` — pins, answers, language, the inferred profile; `src/import/scan.ts:pasteKind` — `empty` / `scan` / `ok`
- `src/import/figures.ts:missingFigures` · `:placeFigures` — captions and references with no picture, lost pictures (slots), image pins placed after their line; `src/import/build.ts:previewFigure` reads a preview block back to its pin or slot
- Answers from another file (§ 11): `src/import/answerFiles.ts:classifyImport` · `:suggestPairs` · `:splitAnswers` — which files hold questions or answers, which go together, a paper's own answers cut off; `src/import/answerSheet.ts:readAnswerSheet` — keys and schemes as entries, every line given a use; `src/import/matchAnswers.ts:matchAnswers` — entries to `answer` and `scheme` pins and a per-question report. `src/import/solve.ts:applySchemes` puts them on the outline; `src/import/build.ts:schemeFields` writes `scheme`, `answer` or `explanation`. Tests: `src/import/answers.test.ts`
- DRQ and HKEAA schemes (k-0480): `src/import/drq.ts:shapeDrq` (after the walk: a mark printed once after the last sub-part goes on the part, `:sharedMark`; "Strategy X …" / "Scheme C …" rows and a drawn table labelled so become the DRQ starter's table, `:withStrategyTables` → `src/model/drq.ts:strategyTableOf`); the answer reader keeps a scheme's structure as `src/import/types.ts:SchemeShape` (groups with `:SchemeGroup` headings and rules, EC rows, content max, levels, paragraph style; `src/import/answerSheet.ts:isSchemeHeading` · `:firstOnlyRule`), carried by the `scheme` pin to `build.ts` as the editor's `MarkScheme`; a key's "D (69)" is `AnswerEntry.percent` → the `answer` pin's `percent`; "Comments on candidates' performance" is `AnswerSheet.comments` → the `results` pin (an MC paper's prose picked by `src/import/matchAnswers.ts:mcProse`) → `ImportBatch.results`, written by `src/import/build.ts:withImportResults` in the insert's own commit (`src/components/import/fileImport.ts:createImportedDocument`). Every imported text goes through `src/import/build.ts:importedRuns` (no blank line at either end, k-0468). Scans: `src/import/ocrLayout.ts:unstackColumn` splits a key's glued column; `src/import/pageChrome.ts:mastheadVerdict` stops at a key row; `SourceLine.right` (where a line's text ends) lets the answer reader tell a wrapped line from a point's last. Word equations become runs (`m:f` → `src/model/fraction.ts:fractionRuns`, `m:sSub`/`m:sSup` → `vertAlign`) in `src/import/docxBody.ts`; a PDF's sub/superscripts are read from size and baseline in `src/import/pdfLayout.ts`. Tests: `src/import/drqImport.test.ts`
- Real papers (k-0480, never in the repo): `scripts/ocr-pages.py` (the shell's OCR, `src-tauri/src/ocr`, ported to Python for a headless run) writes each page's `OcrResult`; `scripts/import-probe.test.ts` imports files or those pages through the app's own readers (`recognisePages` with figures cropped) and dumps the outline, the answer sheet, the match and the made document to a folder outside the repo; `scripts/import-shot.mjs` screenshots that document's sheets or Marking scheme view
- `src/import/scorecard.test.ts` over `src/import/fixtures/expected.ts:FIXTURES` (synthetic only: the repo is public, real paper text never enters it)

The dialog (`src/components/import/`), reached only from the start screen:

- `src/components/start/StartScreen.tsx:StartNewSection` — "Import from Word, PDF or picture…" under New worksheet (several files: `src/platform/index.ts:pickFiles` on desktop); dropped `.docx`/`.pdf` files (`src/components/start/fileDrop.ts:planDrop` → `papers`) open the same dialog through `src/components/import/ImportHost.tsx:LazyImportDialog` (lazy: the readers and pdf.js never load with the start screen)
- `src/components/import/ImportDialog.tsx:ImportDialog` — reading (one file or several), a problem (`.doc`, password, not a paper, unreadable, scan), linking papers to answers (`src/components/import/LinkStep.tsx:LinkStep`), each paper's review (`src/components/import/ReviewStep.tsx:ReviewStep`, its answers bar worded by `:answerRowText`), then Save as (`src/components/import/SaveAsStep.tsx:SaveAsStep` for one paper, `src/components/import/SaveManyStep.tsx:SaveManyStep` for several): new papers of the four types, or 題庫 only (`src/library/bankDocs.ts:addToBank`)
- `src/components/import/importBatch.ts:examineFile` · `:linkedAnswers` · `:paperReview` · `:answerSummary` — several files, pure (§ 11 UI): each file's guess, each paper's answers (the teacher's pick, else `suggestPairs`), a paper solved with the sheet's pins before the teacher's, the rows to check; `src/components/import/fileImport.ts:createImportedDocuments` — several new papers, written one at a time, the first opened
- `src/components/import/fileImport.ts:readPaperFile` · `:defaultDocumentType` · `:misfit` · `:importLanguageMode` · `:startLanguage` · `:createImportedDocument` — pure apart from the last: the file to a review or a problem, the suggested type, the type that does not fit, the new paper's language, and the new paper made by `createWorksheetFrom`, opened, then the batch in one commit
- `src/components/import/pasteSession.ts:pasteVerdict` · `:withPin` · `:checkPlaces` · `:optionIndexAt` — the review's logic, pure: empty/scan/OCR, fixes as pins, flags to visit, the clicked option; `:carriedFiles` · `:imagePin` — a pasted or dropped picture as an image pin
- `src/components/import/previewDoc.ts:previewItems` — the batch in a scratch worksheet, rendered by `renderWorksheet`; questions cached by outline so an unchanged one keeps its nodes
- Import check (k-0494, `docs/design/paste-import.md` § 16): `src/importCheck/checks.ts:deterministicFindings` (the rules: the file's lines against the questions; `:JUNK`, `:SYMBOL_PUA`, `:splitOptionText`) · `src/importCheck/ops.ts:applyOp` (the closed set of fixes, `:CheckOp`, blocks found again by `src/importCheck/address.ts:blockKey`, never adding or removing a question) · `src/importCheck/run.ts:checkReview` / `:checkPaper` (the two doors) · `:batchWithFixes` (the review's fixes in the batch, `PaperState.fixes`, undone by `src/components/import/ReviewStep.tsx:undoFix`) · `:paperRecipe` (an open paper's fix as one commit) · `src/importCheck/ai.ts:runAiCheck` / `:validateProposals` (the AI half: only the file's words or printed marks) · `src/importCheck/sources.ts:rememberImport` (the session's files, memory only); review UI `src/components/import/ImportCheckPanel.tsx:ImportCheckPanel` (its AI row `:AiCheckRow`, worded by `src/importCheck/aiSummary.ts:aiReport` — every finished run says what it did, k-0501; the review bar's ✦ AI check runs it in one click); verb `src/assist/verbs/importCheck.ts:importCheckVerb` (`check.import`); real papers through `scripts/import-check-probe.test.ts` (output outside the repo) and the AI row in a browser through `scripts/import-ai-verify.mjs`
- `src/components/import/ReviewLines.tsx:ReviewLines` · `:RoleMenu` — the file's lines with role chips; `src/components/import/ReviewPreview.tsx:ReviewPreview` — the editor's `NodeView`, read-only, zoomed to fit

Invariants:
- Text is never dropped: a line the walk cannot place stays in the nearest stem, flagged. The PDF reader drops only running headers/footers, page numbers, rotated margin text and a figure's own labels.
- pdf.js stays out of the app's first load: reached only through `import('./pdfjs')`.
- Only `src/import/build.ts` names question types (`src/import/solve.test.ts` guards it).
- Nothing is stored in a document: imported questions are ordinary questions.
- Nothing is written before Save; ⌘Z inside the dialog takes back a fix, never a document.

## scripts — the harnesses

- `.claude/skills/jev/SKILL.md` — session tooling, not app code: `bin/find.mjs` (ranked doc and file pointers), `bin/verify-plan.mjs` (which checks a diff needs), the edit guard's `rules.json`; hooks registered in `.claude/settings.json`
- `scripts/shot.mjs` — screenshot the real app (`--seed`, `--dark`, `--port=` / `--url=`)
- `scripts/demo.mjs` — website video + screenshots into `demo-media/` (`npm run demo`); steps in `scripts/demo/record.mjs:STORYBOARD`
- `scripts/demo/diagrams.mjs:diagramStoryboard` — the diagram film (`npm run demo:diagrams`): one recording, numbered stills and the exported `.docx` into `demo-media/diagrams/`; seed from `scripts/demo/diagrams-seed.test.ts`
- `scripts/emit-samples.mjs` — real `.docx` files (`npm run samples`), exported through the app's Export dialog in Chrome so the pages break where the preview does; `scripts/emit-samples.test.ts` plans the documents
- `scripts/template-gallery.mjs` — every diagram template screenshotted (en / zh / bilingual) into a folder; `--app` also seeds them into the running app and shoots the sheets and the picker
- `scripts/relation-drag.mjs` — drags one curve or point per retrofitted template on the real canvas, before/after shots, and the Shade menu on the tax diagram
- `scripts/cover-verify.mjs` · `scripts/lq-verify.mjs` — the three backends agree
- `scripts/cover-fixtures.test.ts` · `scripts/lq-fixtures.test.ts` · `scripts/q6-sample.test.ts`
- `scripts/sync-version.mjs` — `package.json` → `src-tauri/tauri.conf.json` + `Cargo.toml`
- `scripts/sync-changelog.mjs` — `CHANGELOG.md` → `src/whatsNew/changelog.generated.ts`
- `scripts/check-web-bundle.mjs` — `postbuild`: fails the build if a Tauri chunk is loaded up front or with app code
- `scripts/release-notes.mjs` — one version's section, the GitHub release body; `scripts/release-notes.test.ts`
- `scripts/lq-pitch.py` · `scripts/cover-compare.py` — measure the rendered output

## scripts/film — the product film

The 94 s launch film, all code: `scripts/film/capture/capture.mjs` films the built app in
virtual time → the asset store; the Three.js stage (`scripts/film/stage/engine.js`,
`scripts/film/stage/lib/`, one module per scene in `scripts/film/stage/scenes/`) composes
it; `scripts/film/score/score.mjs` synthesises the music; `scripts/film/render.mjs` renders
with parallel Chrome workers; `scripts/film/film.mjs` runs it all. Spec:
`scripts/film/FILM.md`. How to change it: the `econ-film` skill (`.claude/skills/econ-film/`).

- `scripts/film/timeline.mjs:SCENES` · `:CUES` · `:COPY` — bars, shared cues by stable id
  (scenes read them with `scripts/film/timeline.mjs:cueAt`), every on-screen string
- `scripts/film/assets.mjs:ASSETS` — the registry: asset id → file, capture command, scenes allowed
- `scripts/film/stage/lib/type.js:text` — text blocks that wrap and shrink to their box
- `scripts/film/tools/doctor.mjs` — `npm run film:doctor`: timeline, assets, clip windows, score, text fit, capture age, GPU
- `scripts/film/paths.mjs` — outputs to `$FILM_OUT` or `demo-media/film/`; the asset store is always the main checkout's

Invariants: a scene's `update(t)` is a pure function of `t`; scenes load assets by registry
id, text from `COPY`, times from cue ids; no fake UI (every product pixel is captured from
the real app or its export); the film never changes `src/`; a cue or clip-event change
makes the score stale (rebuilt by `npm run film:score`).

## tests and corpus

`npm test` = `vitest run src`. Tests sit beside what they test; `scripts/*.test.ts` are
harnesses run by hand: `vitest.config.ts` includes them only when the command names a
`scripts/` path, so a bare `npx vitest run` is `src/` only. The corpus emitter also
refuses to write without `EMIT_V1_CORPUS=1`.

- `src/test/fixtures.ts:buildAcceptanceWorksheet` — the shared document
- `src/test/corpus/v1-published.json` — frozen v1 output; **never regenerate**
- `src/test/corpus/v1-mcq.json` — frozen MC-question document (statements, picture option, table/picture in stem, stimulus, tags, lineage, `srcZh`), written by `scripts/emit-v1-mcq-corpus.test.ts`; guarded by `src/model/mcqCorpus.test.ts`; **never regenerate**
- `src/test/corpus/bank-v0.6.0-paper.json` · `bank-v0.6.0-bank.json` · `bank-v0.6.0-index.json` — written by tag v0.6.0 itself (`scripts/emit-bank-v0.6.0-corpus.test.ts` refuses any other commit): part tags and roots, a copy pair, the legacy shape, INDEX_FORMAT 7 rows; guarded by `src/library/bankCorpus.test.ts`; **never regenerate**
- `src/model/backwardCompat.test.ts` · `src/storage/legacyIndex.test.ts` — the two guards
- `src/registry/registry.test.ts` — the no-type-branching grep
- `src/test/codemap.test.ts` — keeps these docs honest
- `docs/Diagram_Requirements/COVERAGE.md` — the §8 checklist, item by item: which template, preset or relation meets it; `src/model/diagramTemplateRelations.test.ts` checks the ids it cites and that the templates' relations hold under a drag
