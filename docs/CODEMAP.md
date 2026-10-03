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
- `src/model/marks.ts:partMarks` · `:questionMarks` · `:sectionMarks` — derived totals
- `src/model/edits.ts:applyEditTarget` · `:applyDeleteTarget` · `:insertBlockAfter` — every mutation recipe
- `src/model/lineage.ts:freshIds` · `:copyQuestion` · `:rootIdOf` · `:questionIdOwners` — every id a question holds, renewed for a copy (a diagram's own geometry is kept); `src/model/dedupeIds.ts:dedupeIds` — ids held twice repaired on open, in `src/storage/document.ts:parseWorksheet`
- `src/model/topics.ts:TOPICS` · `:topicOf` · `:parentCode` · `:matchesTopic` · `:topicLabel` — the EDB topic taxonomy as data; `Question.tags` stores codes, names are looked up. On screen a topic is its name, never its slug: `:topicDisplay` ("Law of demand 需求定律"; an unknown code as stored) · `:topicHeading` ("C · Law of demand", and tooltips), with `src/model/patterns.ts:tagText` for a tag of any kind. The tag grammar: `:TOPIC_CODE_PATTERN` · `:SYSTEM_TAG_SIGIL` · `:rollupTopic` · `:stringTags`, with `src/model/patterns.ts:isReservedTag` · `:freeTagIssue`
- `src/model/excerpt.ts:questionExcerpt` · `:biTextExcerpt` · `:blocksExcerpt` — one-line plain text of a stem (Outline, panel rows, the bank), the asked-for language first
- `src/model/bands.ts:createBand` · `src/model/bandSegments.ts:bandFieldSegments` — masthead rows
- `src/model/text.ts:BiText` helpers — `:rt` · `:plain` · `:normalizeRuns` · `:applyRunFormat`
- `src/model/page.ts:pageSetupOf` · `:headerFooterOffsets` · `src/model/pageFurniture.ts:furnitureBoxes`
- `src/model/cover.ts:createCoverPage` · `src/model/documentShape.ts:documentShape` · `:paperKind` (the shape refined by content: dotted answer space → LQ worksheet)
- `src/model/versions.ts:activeVersion` · `:shuffledOrder` — paper versions A/B/C; only `Worksheet.versions` (count + seed) is stored
- `src/model/markScheme.ts:schemeMax` · `:groupMax` · `:schemeMismatch` — HKEAA marking-scheme totals, derived; types in `src/model/markSchemeTypes.ts:MarkScheme`
- `src/model/paperHealth.ts:checkPaper` — the pre-print check, derived; `src/components/editor/PaperHealthPanel.tsx:PaperHealthPanel` shows it
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
- `src/render/answerKey.ts:renderAnswerKey` — the separate answer key; entries come from the `answerKey` hook
- `src/render/answerKey.ts:answerKeyView` — the same nodes plus each node's question and the key's own fields (title, subtitle), for the Marking scheme view
- `src/render/answerKey.ts:collectAnswerKey` → `:ANSWER_KEY_STYLES` → `:renderStandardKey` — the key's data gathered once, laid out by its preset's style; `src/render/answerKeySections.ts:MC_KEY_RENDERERS` · `:LQ_KEY_RENDERERS` are the per-section layouts (grid / HKEAA table / list / reasons table; compact / Marks column / Detailed table / Suggested answers' answers-only)
- `src/model/answerKeyLayout.ts:ANSWER_KEY_FIXED` — what a preset decides alone (Suggested answers: LQ layout, legend, disclaimer, sources); stored changes to it are ignored. Leak tests: `src/render/suggestedAnswers.test.tsx` over `src/test/suggestedAnswersFixture.ts:buildLeakWorksheet`
- `src/render/ir.ts:TableNode` `headerRows` · `rowKeepNext` — a table that breaks between rows; `src/components/preview/AnswerKeyPreview.tsx:keyUnits` · `:runNodes` pack it row by row, its heading again on a sheet it opens (`src/components/preview/pagination.ts:PackItem` `leadKey`)
- `src/model/answerKeyLayout.ts:resolveAnswerKeyLayout` — `Worksheet.answerKeyLayout` (preset + deltas) to every setting; `:ANSWER_KEY_PRESETS` · `:withAnswerKeyPreset` · `:withAnswerKeySetting` · `:normalizeAnswerKeyLayout` (on load)
- `src/render/answerKeySections.ts:answerKeyRunningHead` — "Marks / 分數" atop every page of a key with a Marks column (`TextNode.marksColumn`); the `.docx` header and the preview read the same
- `src/render/answerKey.ts:AnswerKeyRow` — `diagram` carries a leaf's model answer diagram; `src/render/ir.ts:diagramNodeFor` builds its node
- `src/render/answerKey.ts:renderCombinedAnswerKey` · `:answerKeyPartTitle` — several saved documents' keys in one file, each under its paper's heading, from a new page
- `src/render/markScheme.ts:renderMarkScheme` — a part's HKEAA scheme as `Marking Scheme` paragraphs; marks ride `TextNode.trail` (`src/render/ir.ts:trailLabel`); given `at`, its text carries scheme edit targets (`src/model/markScheme.ts:withSchemeText` writes them)
- `src/render/diagram.ts:diagramSvg` · `:diagramPlot` · `:diagramSize` · `:flowChartLayout` · `:forumChartLayout`
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

Invariants:
- Fixed 12pt line, no paragraph spacing; separation costs a blank line — §One fixed line.
- Side-by-side layout exports as tab stops, never a table — §One row, many uses.
- `baseFontSize` scales body styles; the 12pt line never shrinks — §The booklet is a 10pt document.
- An LQ style is emitted only when the rendered IR uses one — §The dotted answer line.

## export (other)

- `src/export/clipboard.ts:worksheetClipboardHtml` · `:copyForWord` — the third backend
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
- `src/storage/backup.ts:buildBackup` · `:readBackup` · `:restoreBackup` — one-zip backup; restore never overwrites
- `src/storage/document.ts:parseWorksheet` · `:summarize` · `src/storage/download.ts:triggerDownload`
- `src/storage/document.ts:NewerDocumentError` · `:editableCopy` — `save()` refuses to overwrite a newer build's document; the copy is downgraded, under a new id

Invariants:
- One malformed index row must never empty the list — §The published-document promise.
- Guards: `src/model/backwardCompat.test.ts`, `src/storage/legacyIndex.test.ts`, `src/storage/newerDocument.test.tsx`.
- Trash lives outside what older builds read: key `econ-worksheet-trash` (never under
  `econ-worksheet:`), `worksheets/trash/` on desktop — §Persistence.
- Folders are never a field on an index row (an older build's rewrite drops it): key
  `econ-worksheet-folders`, `worksheets/folders.json`; in a backup, inside `manifest.json` — §Persistence.

## platform / desktop

- `src/platform/index.ts:isDesktop` · `:saveFile` · `:pickTextFile` · `:pickFile` · `:printPage` · `:revealFile` · `:openFolder` · `:exportsFolder` · `:openExternal`
- `src/platform/index.ts:chooseSavePath` · `:savePdf` — desktop PDF: the save sheet, then the shell's `print_to_pdf` command
- `src/platform/index.ts:chooseSaveTarget` · `:chooseFolderTarget` · `:canChooseLocation` — ask where first (inside the click), write after the build; `src/platform/webPicker.ts` is the browser's Save As / folder picker (Chrome, Edge), the anchor download elsewhere
- `src-tauri/src/pdf/mod.rs` — the one app command, `print_to_pdf` (path, page box, sheet count); `src-tauri/src/pdf/macos.rs` (WKWebView save job) · `src-tauri/src/pdf/windows.rs` (WebView2 `PrintToPdf`). Declared in `src-tauri/build.rs`, granted as `allow-print-to-pdf` in `src-tauri/capabilities/default.json`
- `src-tauri/src/bundle_rename.rs:decide` · `:rename_legacy_bundle` — macOS, before any window: an updated `Econ Worksheet.app` renames itself `Econ Studio.app` and relaunches once, else logs why it skipped (`cargo test`)
- `src/platform/index.ts:listenForFileDrops` · `:readDroppedFile` — Finder/Explorer file drops arrive as Tauri's native event, never HTML5 `drop`; effects use `:subscribeToFileDrops`, and every Tauri unlisten goes through `:unlistenSafely` (it can reject before the listener registers)
- `src/storage/fileStore.ts:savedWorksheetPath` · `:savedWorksheetsFolder` · `src/storage/index.ts:pickWorksheetFile`
- `src/desktop/updater.ts:checkForUpdate` · `:currentVersion` · `src/desktop/updateStore.ts:checkOnLaunch` — one check per launch
- `src/components/editor/UpdateBanner.tsx:UpdateBanner` · `:VersionLine`
- `src/components/editor/NewerVersionNotice.tsx:NewerVersionNotice` — the read-only bar: check for updates (desktop) / download link (web), "Duplicate as editable copy"
- `src/whatsNew/changelog.ts:parseChangelog` · `:sectionMarkdown` · `:compareVersions` — `CHANGELOG.md` as data, shared with `scripts/release-notes.mjs`; each entry is `{ en, zh? }`, `zh` from the `<!-- zh: … -->` under it, which `sectionMarkdown` (the release body) leaves out
- `src/whatsNew/changelog.generated.ts:CHANGELOG_MD` — the bundled copy, written by `scripts/sync-changelog.mjs` (`predev`/`prebuild`); `src/whatsNew/notes.ts:CHANGELOG` parses it once
- `src/whatsNew/seen.ts:decideWhatsNew` · `:LAST_SEEN_VERSION_KEY` — pop "What's new" once per new version, never on a first run
- `src/components/whatsNew/WhatsNewDialog.tsx:WhatsNewDialog` · `:WhatsNewOnLaunch` — one release after an update, or every release (start screen, ⋯ menu)

Invariants:
- Never import `@tauri-apps/*` statically — dynamic `import()` behind `isDesktop()`, only in `src/platform/`, `src/desktop/`, `src/storage/fileStore.ts` — §Desktop shell.
  Guards: `src/test/tauriImports.test.ts`, the ESLint rule in `eslint.config.mjs`, `scripts/check-web-bundle.mjs` (`postbuild`).
- Nothing reads `process.env` or the filesystem at runtime on the web path — §Deployment.
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
- `src/components/start/dashboardDrag.ts:stepDrag` · `:parseDropTarget` — document→folder drag state machine, pure
- `src/components/start/useDocumentDrag.tsx:useDocumentDrag` — pointer-event drag: capture, ghost, one `drop` on release
- `src/components/start/fileDrop.ts:planDrop` · `:overlayFor` · `:importSummary` — files dropped on the start screen (web `File`s, desktop paths): one opens/restores, several import, pure
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
- `src/library/bankDocs.ts:copyToBank` · `:bankHolds` · `:updateBankCopy` — the only writes into a bank document; a bank never holds two copies of one root (a question already there is skipped; an edited one is updated, never copied again); a new bank takes the teacher's name (`:nextBankName`, picker labels `:bankChoices`); UI in `src/components/editor/BankActions.tsx:useBankActions` (Treat as a new question asks first, in plain words: `:TREAT_NEW_TEXT`)
- `src/library/search.ts:searchRows` (words match the question or its paper's title, read at query time) · `src/library/group.ts:groupRows` · `src/library/history.ts:usedIn` · `:usedWith` · `:newestFirst` · `src/library/fill.ts:pickFill`
- `src/model/classes.ts:dateOfUse` · `:parseClasses` · `:foldLegacyClassTag` — who sat a paper (`classes`, `satOn`) and when it counts from; `:commitClassInput` — Setup's Classes box (Enter or a comma commits a class; new form-led names in capitals, stored ones never rewritten; classes compare by `:classKey`, case-insensitive); `src/library/cohort.ts:cohortOf` · `:sameStudents` — the derived DSE cohort the anti-repeat filters match by
- `src/library/useBank.ts:useBank` — the one read both surfaces use, over the persistent index below
- `src/library/bankIndex.ts:createBankIndex` — stored rows first, then reconcile `list()` against `updatedAt` stamps (idle chunks, newest first), then the change feed; wakes on focus for other tabs
- `src/library/bankBackend.ts:BankIndexBackend` · `:createJsonFileBackend` · `:createMemoryBackend` · `:INDEX_FORMAT` · `:STORED_INDEX_FORMAT` — where rows persist; a bad entry drops only its document, another format key rebuilds all. The key folds a hash of the topic labels; bump `INDEX_FORMAT` when `rowsOf` output changes (`src/library/rowsGolden.test.ts` fails to say so)
- `src/library/idbBackend.ts:createIdbBackend` — web: IndexedDB `econ-worksheet-library` (`rows` keyed `[docId, questionId]`, `stamps`, `meta`)
- `src/storage/changes.ts:withChangeFeed` · `:onStoreChange` — the store singleton announces each successful mutation (`StoreChange`)
- `src/storage/fileStore.ts:libraryIndexFile` — desktop: `worksheets/library/index.json`
- `src/components/bank/BankRow.tsx:BankRow` — the shared row: excerpt, quiet meta, no button (drag it; a focused row takes Enter via `onActivate`), in-paper / used-with-class / missing-language / selected states, and `partsFor` ("(b) Efficiency" when a topic filter matches only some parts, `src/library/slotMatch.ts:slotsMatching`); `:SourceText` — "Paper · Q4" on one line, the title cut, the number never
- Look-alike rows read apart: `src/library/docLabels.ts:distinctDocLabels` (two papers of one title add the day, then classes: the From list, rows, facts) · `src/components/bank/bankText.ts:versionDiff` (what an edited version says: "Says “…by 25% and…”", "Reworded") · `:countOf` · `:allOf` (plurals: "1 sub-topic", "both copies")
- `src/store/worksheetStore.ts:insertQuestionCopies` — bank copies in (`copyQuestion`), one commit, one undo
- `src/components/bank/page/QuestionBankScreen.tsx:QuestionBankScreen` — the bank as its own screen (the start screen's `view`, left by ← Home): levels, filters, picks, the one window key listener, topic writes
- `src/components/bank/page/TopicCards.tsx:TopicCards` (level 1: topic cards, untagged strip) · `src/components/bank/page/ReviewPage.tsx:ReviewPage` (level 2: sub-topic rail, collapsible, one Tab stop, large preview, facts) · `src/components/bank/page/TagAsYouGo.tsx:TagAsYouGo` (level 3: one untagged question, numbered topic keys; a question with parts adds a part strip, and the keys tag the whole question until a part is picked by click or [ ]; ⌫ / ⌘Z / Undo takes the last save back with one `everywhere(removeTopics)` write per copy) · `src/components/bank/page/FilterPopover.tsx:FilterPopover` (the button names one short filter, else counts: `:filterButtonLabel`)
- Bank tagging: `src/components/bank/page/TopicPickerDialog.tsx:TopicPickerDialog` (one list: Edit topics without parts, bulk Set topic, All topics) · `:PartTopicPickerDialog` (Edit topics on a question with parts: a part column, Whole question first; hands back one `StateEdit`) · `src/components/bank/page/partTopics.ts:toggleAt` · `:ticksAt` · `:changeAt` · `:patternEditAt` · `:sameAsPart` · `:savedByPart` — each pick is a `StateEdit` on a draft tag state, replayed by the save on every copy; bulk Set topic stays a list edit, so every part gets it
- `src/components/bank/page/bankScreen.ts:levelUp` · `:levelForSearch` · `:railSections` · `:suggestTopics` · `:latestClassUsage` — the screen's pure half: levels, rail headings (sub-topics, then General), suggestion ranking. The rail lists entries, not questions (`:railOrder`, `:entryIndex`): a question on two headings is two entries, each with `alsoIn` and the `query` its heading names; `:partsTesting` · `:testsThisText` · `:testsWhatText` · `:topicsByPart` say which part tests it ("Part (b) tests this")
- `src/components/bank/page/bankPage.ts:coverage` · `:filterRows` · `:traySummary` · `:addTarget` — the data half; counts are distinct `rootId`s; `:missingSides` is the Language filter (Missing 中文 / English) over `BankRow.missing` / `missingTeacher` (teacher text counts when the preview shows Teacher or AI Settings include it)
- `src/components/bank/page/PaperPreview.tsx:PaperPreview` · `src/components/bank/page/questionPreview.ts:questionPreviewHtml` — one question through the clipboard reader of the IR, Student or Teacher, at print size in its own document's setup, under its number in that document (`src/export/clipboard.ts:questionClipboardHtml`'s `printedNumber`); its `highlight` (part keys) wraps the matching part in `data-part-mark`, screen only: the clipboard is never marked
- `src/library/tagWrites.ts:writeTags` · `:withQuestionTags` · `:copyWrites` · `:bulkTopicEdit` · `:matchEdit` · `:otherCopyWrites` — topic edits into the owning documents, one save per document; every topic edit (bank or editor) writes every copy of the question, each adopting the shared tag state under one stamp
- `src/library/sameCopies.ts:identicalCopies` · `:writeIntoCopies` · `:writesForCopy` · `:restoreCopies` — text writes (✦ Fill, Check terms) made on the shown copy, carried slot for slot to every copy with its `rootId` and `contentKey`; one load, check and save per document; never Trash, hidden or newer-build documents; a copy changed since is skipped and reported. `restoreCopies` is the bank's Undo all: only copies still holding what was written, later topic edits kept
- ✦ AI on the bank screen: `src/components/bank/page/BankAiMenu.tsx:BankAiMenu` (the door beside Filter; scopes and verbs pure in `src/components/bank/page/bankAiScopes.ts:bankVerbRows`) · `src/components/bank/page/bankAi.ts:createBankAi` (the run store: running, review, error; `:needsConfirm` over 20 questions) · `src/components/bank/page/BankAiBar.tsx:BankAiBar` · `:BankAiNote` (the note above the paper); marks on the paper through `src/components/bank/page/PaperPreview.tsx:markTexts`; the engine is `src/assist/bankRun.ts` (§ AI door)
- `src/components/editor/topicSync.ts:setQuestionTopics` (one list; `:setQuestionTags` takes the edit itself) — the editor's Topic row: the open copy through the store (one undo), every other document's copy through storage, never the open one; "Also updated in N other worksheets"
- `src/library/sharedTags.ts:sharedTags` — one tag set per question: the copy with the newest `tagsAt` wins (unstamped rank oldest, ties and no stamps give the union). `:withSharedTags` applies it once where the index publishes (`src/library/bankIndex.ts:createBankIndex`), stored rows keep each copy's own. `:withRowTags` gives a copy taken from the bank that set and stamp (`src/components/bank/page/fromSelection.ts:readPicks`, `src/components/bank/bankSession.ts:insertFromBank`). `src/components/editor/sharedTopics.ts:useShownTags` — the editor's Topic row and Outline show it at display time; opening never changes a document's tags (the open-save writes it back as loaded)
- Topics per part (design `docs/design/part-tags.md`): `src/model/tagSlots.ts:tagStateOf` · `:derivedTags` · `:effectiveSlotTags` · `:normalizeTagState` · `:collapseTagState` · `:stateFor` · `:withTagState` · `:matchSlots` · `:slotRef` · `:slotAtTarget` · `:slotHighlightIds` — a question's tag state (its list plus each part's), read through the registry's `tagSlots` / `withSlotTags` (`src/registry/types.ts:TagSlotInfo`, implemented in `src/registry/structured.ts`); `src/model/lineage.ts:partRootOf` · `:withoutLineage` (part roots, stamped by `copyQuestion`). Library: `src/library/sharedTags.ts:sharedState` · `:stateOfRow` · `:rowTagFields` (rows' derived `tags`, `slots`, `ownTags`); `src/library/tagWrites.ts:wholeQuestion` · `:atSlot` · `:everywhere` · `:inheritAtSlot` · `:freeTags` · `:changeEdit` · `:retagQuestion` (a list edit means the whole question); `src/library/slotMatch.ts:slotsMatching` ("(b) tests this"); `src/components/editor/topicSync.ts:setQuestionTags` · `src/components/editor/sharedTopics.ts:useShownTagState`; the Edit panel's per-part row `src/components/editor/PartTopics.tsx:PartTopics` (whole question, part, sub-part "Same as (a)" / "Its own", chosen by `src/components/editor/partTopicView.ts:topicMode`; `:partTopicLines` · `:outlineTagLine` for the Outline); preview marking `src/export/clipboard.ts:questionClipboardNodes` · `:highlightedNodes`
- 題型 (Patterns): `src/model/patterns.ts:parsePatternTag` · `:withPattern` — the tag form `<sub-topic>::<name>` on `Question.tags`; `src/library/patterns.ts:listPatterns` · `:patternWrites` · `:renamePatternEdit` · `:removePatternEdit` — lists per sub-topic × type (registry ∪ names on questions), and the edits a rename, merge or delete writes into every copy; `src/storage/patterns.ts:usablePatterns` · `:updatePatternRegistry` — the app-level registry (`econ-worksheet-patterns` / `worksheets/patterns.json`), per-row validated, in the backup manifest; `src/library/usePatterns.ts:usePatternRegistry`; UI `src/components/bank/PatternPicker.tsx:PatternPicker` (Topic row and topic dialog; registers a new name as it is made) · `src/components/bank/patternOptions.ts:patternOptions` (what typing lists and highlights: an existing match before New) · `src/components/bank/page/PatternsPage.tsx:PatternsPage` (the manage level)
- `src/components/bank/page/bankCart.ts:useBankCart` · `:togglePick` · `:movePick` · `:sortByType` · `:prunePicks` — the cart: picks as `(docId, questionId)` in print order, one per question (`rootId`), in this tab's sessionStorage (per-viewer, never document data); picks whose question is gone are dropped once the index is ready. UI `src/components/bank/page/SelectionTray.tsx:SelectionTray` (the list: drag, ↑ ↓, Alt+↑ ↓, remove, MCQ before LQ, Clear with Undo)
- `src/components/bank/page/fromSelection.ts:worksheetFromPicks` (named after the shared topic, never titled) · `src/components/bank/page/addToOpen.ts:addPicksToOpenDocument` — New worksheet from these / Add to the paper opened last this session, never a guessed one (`src/components/bank/page/bankPage.ts:addTarget`); one ⌘Z, then the 題庫 review: highlighted, scrolled to
- `src/library/tabFilters.ts:visibleGroups` · `:paperRoots` · `:anchorLabel` · `:blockingFilter` — the editor tab's filters, "in this paper", the anchor line, which filter emptied the list
- `src/components/bank/BankTab.tsx:BankTab` — the editor's 題庫 sidebar tab: drag hint, filters, list, Fill (its status line names the anchor). The type filter and Fill start on what the paper takes (`src/library/paperTypes.ts:paperTypeFilter`); the list is one Tab stop, ↑ ↓ move, Enter inserts
- `src/library/paperTypes.ts:paperTypeIds` · `:paperTypeFilter` · `:typesOutsidePaper` — what a paper normally takes, from the registry's `paperKinds`; `src/components/bank/tabText.ts:outsidePaperNote` is the review bar's line when an insert goes outside it
- `src/components/bank/bankSession.ts:insertFromBank` — load sources read-only (`:loadBankCopies`), one `insertQuestionCopies` (`:commitBankCopies`), start the review; `:useBankSession` also carries the open-tab request
- `src/components/bank/bankDrag.tsx:useBankRowDrag` · `:BankDragLayer` · `:useBankDrag` — drag a tab row onto the page: pointer capture past a threshold, the slot re-aimed once per frame, the store touched only on release (`commitBankCopies` at the slot, one ⌘Z); Esc / off the page cancels; ⌘Z is swallowed until the drop (`src/components/bank/bankDrag.tsx:isBankDragActive`); the tab list keeps its place until the button is up (`:holdScrollers`: WebKit autoscrolls the list a press began in). `src/components/bank/dropSlot.ts:pickSlot` (flow gap under the pointer, hysteresis, held over the ghost and the bands) · `:provisionalWorksheet` (derived, never stored); the page draws it through `src/components/EditorApp.tsx:PreviewWithBankDrop` and `Preview`'s `provisionalId`; the page rail's cards show it too (`src/components/editor/PageThumb.tsx:PageThumb` keeps `[data-bank-ghost]` when it strips print-hidden chrome)
- `src/components/bank/BankReviewBar.tsx:BankReviewBar` — inserted copies highlighted on the page (`data-bank-new`), ‹ ›, Undo, Done; a quiet second line when a type the paper does not normally take came in (`BankReview.note`)

Invariants:
- A bank is a `Worksheet` with `kind: 'bank'`; no second storage format.
- The bank screen writes documents only while no editor is mounted (it is part of the start screen, which replaces the editor), so there is no in-memory copy to save over the write. The editor writes only documents other than the open one. Writes are queued one at a time (topic edits and ✦ AI share the queue; leaving the screen waits for a ✦ run's last write). A second tab holding one of those documents can still save over the write (known, unsolved).
- Copies are independent; identity is `lineage.rootId`, never a shared id.
- "Already in this paper" is by question: the paper holds any copy of the pick's root, edited or not. Add to skips those and says so (`src/components/bank/page/addToOpen.ts:splitAlreadyInPaper`); a set of picks keeps one copy per root (`:uniquePicks`); the tab marks them In this paper (`src/library/tabFilters.ts:paperRoots`).
- A use is a paper with `classes`, dated `satOn ?? createdAt`; never `updatedAt`, which only stamps index freshness. Drafts list where a question lives but never count as uses.
- No module in `src/library/` branches on a type id (`src/library/noTypeBranching.test.ts`).
- A 題型 is (sub-topic, type id, name); the question's own type decides its list, and the name on the question is the truth. It never reaches the IR (`src/components/editor/topicTags.test.ts`).
- On a question with parts, topics live per part and `BankRow.tags` is derived from them; readers use the derived list, writers go through `src/library/tagWrites.ts` (never write `QuestionPart.tags` directly), and one `tagsAt` covers every list. Part tags and roots never print and never change `contentKey`.
- The index follows `list()`, never storage keys (a trashed web document keeps its key); it holds no images and no teacher's work — §Persistence.
- The 題庫 tab is sticky: while open, a page selection moves the insert anchor instead of switching to Edit (`src/components/editor/Sidebar.tsx:Sidebar`).
- A drag from the tab re-paginates per *slot*, never per pointer frame; while a provisional question is drawn, the page writes nothing it measures back (split, trim, fill), and those writes also wait for a fresh measurement (`usePagination`'s `isFresh`).

## components/editor — the chrome around the page

- `src/components/EditorApp.tsx:EditorApp` — the shell, autosave, export actions
- `src/components/editor/ExportDialog.tsx:ExportDialog` — the one Export action: format `.docx` / PDF / `.json`, then paper / answer key / both / other apps; `src/components/editor/exportSession.ts:deliverFiles` — picker before build; several files to one folder, else one plain download per click
- `src/components/editor/KeyDocumentsField.tsx:KeyDocumentsField` — "Also include": other saved documents' keys in the same answer key; `src/components/editor/exportSession.ts:loadKeyDocuments` reads them read-only, skipping (and naming) any that will not open — export-time, never stored
- `src/components/editor/printPdf.ts:printWorksheetPdf` — PDF: set the print mode, wait for the sheets, then `printPage()` (web; flags lifted on `afterprint`) or, given a desktop file, `savePdf()` (flags lifted when it resolves; the print sheet if it fails)
- `src/components/editor/exportSession.ts:paperMode` — "Include" toggles → `OutputMode.omitCover` / `omitAnswerSpace` (export-time, never stored; the preview ignores them)
- `src/components/editor/AnswerKeyLayoutPanel.tsx:AnswerKeyLayoutPanel` — the Marking scheme view's Layout tab (style cards from `src/components/editor/AnswerKeySketch.tsx:AnswerKeySketch`, switches); writes through `src/store/worksheetStore.ts:updateAnswerKeyLayout`
- `src/components/editor/Sidebar.tsx:Sidebar` · `src/components/editor/Inspector.tsx:Inspector` · `src/components/editor/TopicRow.tsx:TopicRow` (tags row under every EditorPanel; on a question with parts `src/components/editor/PartTopics.tsx:PartTopics` wraps it per part) · `src/components/editor/TopicRow.tsx:TopicPicker`
- `src/components/editor/MarkSchemeEditor.tsx:MarkSchemeEditor` — points, `n@`/any/max, OR, levels, EC for one leaf
- `src/components/editor/AnswerDiagramRow.tsx:AnswerDiagramRow` — a leaf's model diagram: thumbnail, Draw…, template, width
- `src/components/editor/Outline.tsx:Outline` · `:groupByPage` · `src/components/editor/AddRail.tsx:AddRail`
- `src/components/editor/DiagramCanvas.tsx:DiagramCanvas` · `src/components/editor/DocumentSettings.tsx`
- `src/components/editor/DiagramTemplatePicker.tsx:DiagramTemplateCards` · `:DiagramTemplatePopover` — the grouped, searchable template grid (insert and re-base)
- `src/components/editor/DiagramAreaControls.tsx:ShadeMenu` · `:AreaInspector` · `:ShiftCurveControls` — the canvas's area and shift controls
- `src/components/feedback/FeedbackDialog.tsx:FeedbackDialog` (⋯ menu, start screen) · `src/feedback/feedback.ts:buildReport` · `:githubIssueUrl` · `:mailtoUrl` — prefilled issue / mail / clipboard; no server, no token, never the document

Invariants:
- The sidebar shows one thing, and never mirrors printed text — §The sidebar is an inspector.
- Printed text is typed on the page, and only there — same section.

## components/preview — the paper *is* the editor

- `src/components/preview/Preview.tsx:Preview` — IR → DOM, paginated into sheets
- `src/components/preview/AnswerKeyPreview.tsx:AnswerKeyPreview` — the Marking scheme view: the key's IR on the same paginator, no paper chrome; shown when the store's `documentView` is `answerKey`
- `src/components/preview/pagination.ts:packPages` · `:composePages` · `:resolveFillCounts`
- `src/components/preview/InlineEditable.tsx` · `src/components/preview/RichTextEditable.tsx` — click-to-edit
- `src/components/preview/BandEditor.tsx:BandEditor` · `:bandFieldStyle`
- `src/components/preview/ContextBar.tsx` · `src/components/preview/PageContextMenu.tsx`

Invariants:
- A page is derived and owns the break that made it — §A page is derived.
- New on-page chrome needs `data-print-hide` — §Deployment.
- Overlays claim the keyboard through `src/components/ui/modalLayer.ts:useModalLayer` — memory `window-listeners-all-fire`.

## components/ui

`src/components/ui/index.tsx:Button` · `:SelectField` · `:Segmented`;
`src/components/ui/Dialog.tsx:Dialog` · `:DialogTabs`; `src/components/ui/Menu.tsx`;
`src/components/ui/modalLayer.ts:useModalLayer`.

Invariant: chrome uses semantic tokens (`src/app/globals.css`); anything on the paper takes literal hex.

## Translation, glossary, settings

AI translation (EN ↔ 繁中), Check terms and app-wide Settings — § AI translation, glossary
and app Settings. `src/components/settings/settingsVisible.test.tsx` proves Settings registers
through `AppSettingsHost` alone.

- `src/model/textSlots.ts:TextSlot` · `src/model/textSlots.ts:TextWalker` · `src/model/textSlots.ts:TranslationWrite` · `src/model/textSlots.ts:ApplyReport` — the slot contract; helpers `src/model/textSlots.ts:patch` · `src/model/textSlots.ts:mapSame` · `src/model/textSlots.ts:sameRuns` · `src/model/textSlots.ts:missingSide`
- `src/model/textWalk.ts:mapWorksheetTexts` · `src/model/textWalk.ts:collectTexts` · `src/model/textWalk.ts:slotsForTarget` — the one identity-preserving walk over every BiText, in print order; questions through `src/registry/types.ts:QuestionTypeDefinition` `mapTexts`
- `src/model/textWalk.ts:needsTranslation` · `src/model/textWalk.ts:countUntranslated` · `src/model/textWalk.ts:fieldNeedsFill` — one definition of "missing", per edition
- `src/model/diagramText.ts:mapDiagramTexts` — every BiText in a diagram (parity with `src/model/diagramDraw.ts:handleText`)
- `src/model/symbols.ts:isSymbolOnly` · `src/model/symbols.ts:CAPITAL_WORDS` — E₀, `MC = MR`, `$14 000`: never sent, counted only where it prints as a gap; `PAPER 2`, `ONE`, `No` are words
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
- `src/ai/keyShape.ts:keyShapeProblem` — a key from another provider is never sent without "test anyway"
- `src/ai/fixtures/` — provider error bodies (recorded with dummy keys, or documented shapes); `src/ai/fakeFetch.ts` — the scripted fetch tests use
- `src/settings/types.ts:SettingsSchema` · `src/settings/validators.ts:recordOf` · `src/settings/sections.ts:registerSettingsSection` · `src/settings/sections.ts:useSettingsSections` — schema and section registry
- `src/settings/store.ts:createSettingsStore` · `src/settings/store.ts:appSettings` · `src/settings/store.ts:useSettings` — per-field validation, unknown keys kept, never lowers `v`
- `src/settings/aiSettings.ts:AI_SETTINGS` · `src/settings/aiSettings.ts:readAiStatus` · `src/settings/aiSettings.ts:useAiStatus` · `src/settings/aiSettings.ts:resolveAiConfig` — status never reads the keychain
- `src/settings/appearance.ts:APPEARANCE_SETTINGS` · `src/settings/appearance.ts:THEME_BOOT_SCRIPT` — the colour scheme; dark tokens in `globals.css` key on `<html data-theme>`, never the OS query; `src/components/settings/sections/appearanceSection/AppearanceEffect.tsx:AppearanceEffect` follows the OS while System
- `src/settings/termPreferences.ts:TERM_SETTINGS` — Settings → Translation terms (`econgen.settings.terms`, v2); the pane is `src/components/settings/sections/termsSection/TermsSection.tsx` over the pure `src/components/settings/sections/termsSection/termRows.ts`
- `src/settings/termData.ts:cleanCustomTerm` · `src/settings/termsCsv.ts:termsToCsv` · `src/settings/termsCsv.ts:parseTermsCsv` · `src/components/settings/sections/termsSection/termsImport.ts:previewImport` · `src/components/settings/sections/termsSection/termsBackup.ts:restoreTermsCsv` — the teacher's own wordings and terms: row validation, CSV, import preview, backup
- `src/settings/language.ts:LANGUAGE_SETTINGS` · `src/settings/language.ts:LANGUAGE_BOOT_SCRIPT` — the interface language (`en` / `zh-HK`); `src/components/settings/sections/languageSection/LanguageEffect.tsx:LanguageEffect` keeps `<html lang>` in step
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
- `src/assist/verbs/quality.ts:qualityVerb` — Check question quality (E4), findings only; engine `src/quality/run.ts:runQuality` · `src/quality/checks.ts:deterministicFindings` · `src/quality/collect.ts:qualityQuestions` (reads the registry's `qualityView`); words `src/quality/promptText.ts:SYSTEM_QUALITY`, `src/quality/prompt.ts:PROMPT_VERSION`

- `src/assist/verbs/writeAnswers.ts:makeWriteAnswersVerb` — E1 `write.answers` (§ AI answers and mark schemes); engine `src/answers/plan.ts:planAnswers` · `src/answers/run.ts:runAnswers` · `src/answers/validate.ts:evaluateAnswer` · `src/answers/apply.ts:applyAnswerWrites` · `src/answers/prompt.ts:PROMPT_VERSION`
- `src/model/answerLeaves.ts:AnswerLeaf` — what the registry hook `mapAnswers` offers; test-only `src/answers/testKit.ts`

Invariants:
- Results insert directly as one commit; review is after, and `undoAll` reverts that one commit.
- Highlights are imperative chrome: no IR or `ItemBody` read, never printed, never in the `.docx`.
- A verb's network call happens only on its menu click; nothing AI-related is stored in a document.

## scripts — the harnesses

- `.claude/skills/jev/SKILL.md` — session tooling, not app code: `bin/find.mjs` (ranked doc and file pointers), `bin/verify-plan.mjs` (which checks a diff needs), the edit guard's `rules.json`; hooks registered in `.claude/settings.json`
- `scripts/shot.mjs` — screenshot the real app (`--seed`, `--dark`)
- `scripts/demo.mjs` — website video + screenshots into `demo-media/` (`npm run demo`); steps in `scripts/demo/record.mjs:STORYBOARD`
- `scripts/demo/diagrams.mjs:diagramStoryboard` — the diagram film (`npm run demo:diagrams`): one recording, numbered stills and the exported `.docx` into `demo-media/diagrams/`; seed from `scripts/demo/diagrams-seed.test.ts`
- `scripts/emit-samples.test.ts` — real `.docx` files (`npm run samples`)
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
- `src/model/backwardCompat.test.ts` · `src/storage/legacyIndex.test.ts` — the two guards
- `src/registry/registry.test.ts` — the no-type-branching grep
- `src/test/codemap.test.ts` — keeps these docs honest
- `docs/Diagram_Requirements/COVERAGE.md` — the §8 checklist, item by item: which template, preset or relation meets it; `src/model/diagramTemplateRelations.test.ts` checks the ids it cites and that the templates' relations hold under a drag
