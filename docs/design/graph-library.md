# Home polish + Graphs 圖表庫: design

Status: building, 2026-10-02. Asked by the user the same day: one "New worksheet" button with
a template choice, room for the Question bank row without scrolling, and a page for drawing
graphs that can be saved, reused in a question, or copied into Word.

## 1. Home sidebar

**Problem.** Five full-height rows (four kinds + Open a file) sit above Question bank. At a
1440×760 viewport the bank row only just clears the footer; anything added below it scrolls.
The four rows are also the same action: all open `NewWorksheetForm`, only preselecting a type.

**Layout.**

```
[mark] Econ Studio 經濟備課室
Start a worksheet, or pick up where you left off.   (serif headline, unchanged)

[ +  New worksheet                ]   ink CTA, full width (design.md: CTA is neutral ink)
  ⌂ Open a file…                      quiet row, icon + one-line hint

LIBRARY
  ▤ Question bank 題庫      128 questions
    Every question from your worksheets, by topic.
  ◩ Graphs 圖表庫            6 graphs
    Draw a graph once. Reuse it in a question or copy it into Word.
```

- One CTA replaces the four kind rows. It stays visible on an empty desk too (one button
  does not compete with the welcome cards the way a second list of four did).
- Fits with room to spare at 1280×720; keep the short-window rhythm rules.

## 2. New worksheet dialog: a template gallery

The form already leads with Document type. Its four text cards become **page sketches**,
the same drawings the empty desk shows (`WelcomeDesk`), so a teacher picks a paper by its
shape. One definition of the four kinds (`startKinds.ts`) feeds the desk, the dialog and
any later list. Name stays required; the rest keeps its defaults. The CTA opens the dialog
with the last-used type preselected (per-viewer `localStorage`, try/catch; default
Classroom).

Later, not now: "My templates" (save a document's setup as a template), "Start from a copy".

## 3. Graphs 圖表庫

### What a graph is

A saved graph is a **DiagramBlock outside any worksheet**: the same geometry, size and alt
text a worksheet stores, so every renderer, the canvas and the PNG path work unchanged.

```ts
interface SavedGraph {
  id: string;
  name: string;            // filing name; never printed (like Worksheet.name)
  block: DiagramBlock;     // geometry in unit space + widthPx/heightPx + alt
  language: LanguageMode;  // which side(s) its labels draw in
  fonts: FontPair;
  schemaVersion: number;   // the worksheet schema version the block was written under
  templateId?: string;
  createdAt: string;
  updatedAt: string;
}
```

### Backward compatibility

- **Migration reuses the worksheet chain.** `migrateGraph(raw)` wraps `raw.block` in a
  minimal worksheet at `raw.schemaVersion`, runs the existing `migrate()`, and unwraps. A
  future diagram migration then covers saved graphs with no second chain to forget.
- A graph from a newer build opens read-only and is never overwritten (same rule as
  documents).
- A frozen fixture `src/test/corpus/graph-v1.json` is written once by this build and never
  regenerated; a test opens it through `migrateGraph`.
- Graphs are **not** worksheets: they never enter the worksheet index, the dashboard or the
  question bank, so no existing reader can trip on them.

### Storage

Same two-backend shape as the 題型 registry (`src/storage/patterns.ts`), one record per graph
so one bad file costs one graph:

| | web | desktop |
|---|---|---|
| record | `localStorage` `econ-graph:<id>` | `worksheets/graphs/<id>.graph.json` |
| list | scan the prefix; per-record validation | read the directory |

- The prefix is **not** `econ-worksheet:` (the web `clear()` treats that prefix as documents).
- "Clear saved documents" clears graphs too; backup `.zip` carries them (`graphs/…`), and
  restore never overwrites (a clashing id gets a fresh one).
- Thumbnails are derived from geometry with `diagramSvg` (pure), never stored.
- Delete asks once (no Trash in v1).

### Screens

Its own screen beside the bank (`StartScreen` `view: 'graphs'`), left by ← Home.

1. **Library**: a grid of graph cards (live SVG thumbnail, name, updated), search by name,
   **New graph** opening the existing template gallery (`DiagramTemplateCards`) plus Blank.
   Card menu: Rename, Duplicate, Delete.
2. **Graph editor**: the existing `DiagramCanvas` as the page's main surface (not a modal
   over nothing); a right panel with Name, Print width, Title, Labels language
   (EN / 中 / both), Alt text. Top bar: ← Graphs, save status, **Copy image**, **Download
   PNG**, **Use in a worksheet…**. Autosave on change, like documents.

`DiagramCanvas` reads `language` and `fonts` from the worksheet store today; it gains
optional props that win over the store, so the editor keeps working unchanged.

### Getting a graph out

- **Copy image**: one `ClipboardItem` with `image/png` (3× raster, white ground) and
  `text/html` (`<img width height>` at print size), so Word pastes it at the printed size
  rather than 3× too large. Safari needs the PNG passed as a promise inside the click.
- **Download PNG**: through the existing Save As path (`src/platform/webPicker.ts`, the
  desktop save dialog), file name from the graph's name.
- Both reuse `export/diagramImage.ts`'s rasterizer (exported, not copied).

### Getting a graph into a question

Inserting **copies** the geometry; later edits to the saved graph never change a worksheet
(the bank's rule: copies are independent).

- **In the editor (primary):** the diagram template picker, used by + Diagram, re-basing a
  diagram and model-answer diagrams, gains a **My graphs** tab. Picking one inserts a copy
  where the template would have gone.
- **From the Graphs screen:** **Use in a worksheet…** picks a saved worksheet, then a
  question (or "a new question at the end"), appends the diagram to it, opens the worksheet
  and selects it.
- **Back the other way:** a diagram's panel in the editor gets **Save to Graphs**.

## 4. Build order

| WP | Branch | Scope |
|---|---|---|
| A | `feature/home-polish` | §1 sidebar + §2 dialog gallery |
| B1 | `feature/graphs-core` | model, migration, corpus, storage, backup/clear, canvas props, library + editor screens, copy/download |
| B2 | `feature/graphs-use` | My graphs tab, Save to Graphs, Use in a worksheet… (after B1 merges) |

A and B1 run in parallel; both touch `StartScreen.tsx` lightly (A: the panel; B1: the view
and the Graphs row), merged A first.

## 5. Verification

Tests, typecheck, lint against the baseline; `backwardCompat.test.ts` and
`legacyIndex.test.ts` untouched and green; Chromium + WebKit screenshots of the sidebar at
1512×950, 1280×800, 1280×720, the dialog, the library and the graph editor; a downloaded PNG
opened and checked; `npm run samples` still exports. Not verifiable here: a paste into Word
(ask the user), the Tauri shell click-through.
