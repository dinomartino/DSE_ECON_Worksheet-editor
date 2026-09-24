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
        packPages() → sheets → window.print() → PDF
```

## model — the document, and every pure edit on it

`src/model/types.ts:Worksheet` · `ContentBlock` · `LayoutElement` · `Question` —
the whole schema, one file.

- `src/model/migrations.ts:KNOWN_KEYS` · `:CURRENT_SCHEMA_VERSION` · `:migrate` · `:serializeWorksheet`
- `src/model/flow.ts:resolveFlow` · `:applyOrder` · `:moveRunInFlow` — display order
- `src/model/numbering.ts:computeNumbering` · `:listIndentScheme` — derived numbers
- `src/model/marks.ts:partMarks` · `:questionMarks` · `:sectionMarks` — derived totals
- `src/model/edits.ts:applyEditTarget` · `:applyDeleteTarget` · `:insertBlockAfter` — every mutation recipe
- `src/model/bands.ts:createBand` · `src/model/bandSegments.ts:bandFieldSegments` — masthead rows
- `src/model/text.ts:BiText` helpers — `:rt` · `:plain` · `:normalizeRuns` · `:applyRunFormat`
- `src/model/page.ts:pageSetupOf` · `:headerFooterOffsets` · `src/model/pageFurniture.ts:furnitureBoxes`
- `src/model/cover.ts:createCoverPage` · `src/model/documentShape.ts:documentShape`
- `src/model/diagram.ts:Diagram` · `src/model/diagramDraw.ts:applyDrag` · `src/model/diagramTemplates.ts:DIAGRAM_TEMPLATES`
- `src/model/table.ts:insertRow` · `:resolveCellPadding` · `:resolveColumnWidths`
- `src/model/factories.ts:createWorksheet` · `src/model/newWorksheet.ts:createWorksheetFrom`

Invariants:
- Numbering and marks are derived, never stored — §Document model.
- `questions` owns question order; `flow` only positions layout elements — §Document flow.
- A `section` is a marker carrying `restartNumbering`, not a container — §A section is a marker.
- A new optional field must be in `KNOWN_KEYS` or it vanishes on reload — §The published-document promise.
- A band field is authored wording around a derived value — §A field is authored wording.

## registry — the question-type extension point

`src/registry/types.ts:QuestionTypeDefinition` — `id` · `create` · `render` · `EditorPanel` ·
`examGapLines?` · `countMissingTranslations?`.

- `src/registry/index.ts:listQuestionTypes` · `:requireQuestionType`
- `src/registry/mcq.ts:mcqType` · `:resolveOptionLayout`
- `src/registry/structured.ts:structuredType`

Invariants:
- No shared module branches on a concrete type id; `src/registry/registry.test.ts` greps eight modules — §Question-type registry.
- A hand-built numbered paragraph must copy the block's `format` itself — same section.

## render — the IR, and the walker that fills it

`src/render/ir.ts:RenderNode` · `:EditTarget` · `:RenderContext` · `:renderContentBlocks` ·
`:pushGap` · `:BLANK_LINE_PT`.

- `src/render/worksheet.ts:renderWorksheet` — the one walker; `:collectListStreams`
- `src/render/diagram.ts:diagramSvg` · `:diagramPlot` · `:diagramSize` · `:flowChartLayout` · `:forumChartLayout`

Invariants:
- One IR, three backends; they must never disagree — §The central principle.
- `edit` targets are inert in export — §Render IR.
- Derived text carries no edit target — §Render IR.
- Pixel↔unit maths for a diagram comes from `diagramPlot()`, never from the canvas — §Drawing.

## export/docx — raw OOXML, built client-side

`src/export/docx/index.ts:exportDocx` · `:exportDocxBuffer` · `:docxFileName`.

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
- `src/export/imageImport.ts:prepareImageForStorage` · `:planImageImport` — downscale on paste

Invariant: a diagram is geometry in, exactly one rasterised PNG out — §Geometry in, one image out.

## store — Zustand, undo/redo

`src/store/worksheetStore.ts:useWorksheetStore` — every mutation goes through one
`commit` (pure recipe + undo push); 100-entry history.

Invariants:
- Actions are thin; the work lives in `model/edits`, `model/flow`, `model/bands` — §Store.
- A drag commits once, on pointer-up — memory `drag-gestures-commit-once`.
- Autosave only fires on dirty; flush by value before swapping or unmounting — §The start screen.

## storage — two halves that fail independently

`src/storage/index.ts:worksheetStore` — chosen once at load: file store on desktop, else
`:LocalStorageWorksheetStore`.

- `src/storage/types.ts:WorksheetStore` · `:WorksheetSummary`
- `src/storage/fileStore.ts:FileWorksheetStore` — `$APPDATA/worksheets/<id>.worksheet.json` + `index.json`
- `src/storage/summaries.ts:usableSummaries` — per-row validation, shared by both stores
- `src/storage/document.ts:parseWorksheet` · `:summarize` · `src/storage/download.ts:triggerDownload`

Invariants:
- One malformed index row must never empty the list — §The published-document promise.
- Guards: `src/model/backwardCompat.test.ts`, `src/storage/legacyIndex.test.ts`.

## platform / desktop

- `src/platform/index.ts:isDesktop` · `:saveFile` · `:pickTextFile` · `:printPage` · `:revealFile` · `:openFolder` · `:exportsFolder`
- `src/storage/fileStore.ts:savedWorksheetPath` · `:savedWorksheetsFolder` · `src/storage/index.ts:pickWorksheetFile`
- `src/desktop/updater.ts:checkForUpdate` · `:currentVersion`
- `src/components/editor/UpdateBanner.tsx:UpdateBanner`

Invariants:
- Never import `@tauri-apps/*` at the top level — dynamic `import()` behind `isDesktop()` — §Desktop shell.
- Nothing reads `process.env` or the filesystem at runtime on the web path — §Deployment.
- `src-tauri/tauri.conf.json` `app.security.csp` stays `null` — §Desktop shell.

## components/start

`src/components/start/StartScreen.tsx:StartScreen` — the list and the only way in;
`src/components/start/NewWorksheetForm.tsx:NewWorksheetForm` — once-per-document decisions.

- `src/components/start/FileDashboard.tsx:FileDashboard` — grid of first pages / list; search, kind, order
- `src/components/start/dashboard.ts:visibleSummaries` — the filter and sort, pure
- `src/components/start/PageThumbnail.tsx:PageThumbnail` · `src/components/start/thumbnail.ts:loadThumbnail` — derived first page

Invariants:
- The gate lives in `src/app/EditorHost.tsx:EditorHost`, outside the editor — §The start screen.
- A thumbnail is derived from the IR, never stored — §The file dashboard.

## components/editor — the chrome around the page

- `src/components/EditorApp.tsx:EditorApp` — the shell, autosave, export actions
- `src/components/editor/Sidebar.tsx:Sidebar` · `src/components/editor/Inspector.tsx:Inspector`
- `src/components/editor/Outline.tsx:Outline` · `:groupByPage` · `src/components/editor/AddRail.tsx:AddRail`
- `src/components/editor/DiagramCanvas.tsx:DiagramCanvas` · `src/components/editor/DocumentSettings.tsx`

Invariants:
- The sidebar shows one thing, and never mirrors printed text — §The sidebar is an inspector.
- Printed text is typed on the page, and only there — same section.

## components/preview — the paper *is* the editor

- `src/components/preview/Preview.tsx:Preview` — IR → DOM, paginated into sheets
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

## scripts — the harnesses

- `scripts/shot.mjs` — screenshot the real app (`--seed`, `--dark`)
- `scripts/emit-samples.test.ts` — real `.docx` files (`npm run samples`)
- `scripts/cover-verify.mjs` · `scripts/lq-verify.mjs` — the three backends agree
- `scripts/cover-fixtures.test.ts` · `scripts/lq-fixtures.test.ts` · `scripts/q6-sample.test.ts`
- `scripts/sync-version.mjs` — `package.json` → `src-tauri/tauri.conf.json` + `Cargo.toml`
- `scripts/lq-pitch.py` · `scripts/cover-compare.py` — measure the rendered output

## tests and corpus

`npm test` = `vitest run src`. Tests sit beside what they test; `scripts/*.test.ts` are
harnesses run by hand (`vitest.config.ts` includes them, `npm test` does not).

- `src/test/fixtures.ts:buildAcceptanceWorksheet` — the shared document
- `src/test/corpus/v1-published.json` — frozen v1 output; **never regenerate**
- `src/model/backwardCompat.test.ts` · `src/storage/legacyIndex.test.ts` — the two guards
- `src/registry/registry.test.ts` — the no-type-branching grep
- `src/test/codemap.test.ts` — keeps these docs honest
