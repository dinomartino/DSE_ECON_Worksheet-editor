# Bilingual HKDSE Economics Worksheet Generator

Build printable Economics worksheets, quizzes and assessments at HKDSE level, in
English and Traditional Chinese (Hong Kong usage), and export a **native Microsoft
Word (.docx) file** that stays fully editable in Word.

Implements [`PRD.md`](./PRD.md). See [`IMPLEMENTATION.md`](./IMPLEMENTATION.md) for the
build record: decisions made, bugs found while verifying against real Word output,
how each acceptance criterion was checked, and known gaps.

For the full system architecture, data flow, rendering pipeline, numbering system,
diagram model, and editor layout, see [`SYSTEM_ARCHITECTURE.md`](./SYSTEM_ARCHITECTURE.md).

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm run build        # production build
npm test             # unit + export tests
npm run lint
```

## What makes the .docx a real Word document

The export is hand-built OOXML rather than a library's approximation, because §7 of
the PRD requires constructs most libraries cannot express:

| Requirement | How it is met |
| --- | --- |
| Live numbering | `numbering.xml` with three abstract multilevel definitions. Questions/parts/sub-parts (`1.` / `(a)` / `(i)`) share one definition, so Word renumbers automatically when a question is inserted or deleted. |
| Options restart at A per question | Each question instantiates its own `w:num` with a `w:startOverride`, so lettering restarts rather than running A–D, E–H. |
| Section restarts | A section flagged "restart numbering" opens a new numbering stream with `startOverride`, so the restart is Word's, not typed text. |
| Named styles | `styles.xml` defines `Question Stem`, `MCQ Option`, `Statement`, `Sub-question`, `Sub-sub-question`, `Marks`, `Table Caption`, `Image Caption`, `Section Heading`, `Answer`, `Marking Scheme`. Every paragraph is attached to one; direct formatting is minimal. |
| Per-script fonts | Every run carries `w:rFonts` with separate `w:ascii`/`w:hAnsi` (Latin) and `w:eastAsia` (CJK), also set in `docDefaults` and each style — so `GDP平減物價指數(GDP deflator)` renders each script in its own font. |
| Tables | Real `w:tbl` with `gridSpan`/`vMerge` merges, `w:tblHeader` repeating header rows and `cantSplit` rows. |
| Images | Embedded in `word/media/`, inline with text, alt text on the drawing. Never linked. |
| Page breaks | `keepNext`/`keepLines` across a question's paragraphs so questions are not split. |

Verified by unzipping real exports and asserting on the XML (`src/export/docx/docx.test.ts`),
and by opening generated files in LibreOffice and macOS's Office Open XML parser.

## Architecture

```
src/model/       document model, derived numbering, marks totalling, migrations
src/registry/    question-type registry — the extension point (§9)
src/render/      neutral render IR + worksheet walker
src/export/      .docx (OOXML) and clipboard HTML backends
src/store/       Zustand store with undo/redo
src/components/  centre preview and right-sidebar editor
src/storage/     persistence behind a WorksheetStore interface
```

**One render pipeline, three backends.** A question type emits a neutral render IR
once; the preview, the .docx exporter and the clipboard exporter all consume it. So
numbering, ordering and student/teacher filtering can never drift apart between what
you see and what you export.

**Derived, never stored.** Question numbers, part letters, option letters and marks
totals are all computed at render time. Reordering questions renumbers instantly,
and undo/redo needs no special handling for them.

## Using the editor

The live preview is the centrepiece in the middle; all editing controls are in the
right sidebar (§5.1). Click any question in the preview — or in the sidebar's
structure list — to load its inputs. Questions drag-to-reorder within and between
sections.

The **Language** control changes which inputs are visible as well as what the export
contains (§5.2): English-only shows one box per field, 中文-only the other, Bilingual
both. Switching modes never clears the hidden language — content you typed in 中文 is
still there when you switch back, and still exports in bilingual mode. Missing
translations are flagged only in bilingual mode, where they actually affect output.

The **Version** control switches between the student paper and the teacher version
(answers, explanations, marking scheme). Both controls drive the preview, the .docx
export and the clipboard copy identically.

### Adding a question type

Per §9, only a registry entry is needed — numbering, marks totalling, persistence and
export orchestration stay untouched:

1. Add the variant to the `Question` union (bump `CURRENT_SCHEMA_VERSION` and append a
   migration if existing documents need a default).
2. Write an editor panel component.
3. Write a `render(question, context) => RenderNode[]` function.
4. Register `{ id, displayName, create, render, EditorPanel }` in `src/registry/index.ts`.

`src/registry/registry.test.ts` enforces this: it fails if any shared module starts
branching on a concrete question type.

## Persistence

Documents are JSON carrying `schemaVersion`. Loading runs an ordered chain of pure
migration functions, so every worksheet saved by an earlier release still opens.
Fields written by a *newer* build are preserved through load/save rather than
dropped. Storage sits behind the `WorksheetStore` interface (localStorage +
autosave today; a server can slot in without touching the editor), and worksheets
also download/upload as portable `.json`, images included as base64.

## Deployment

Deploys to Vercel as-is — `npm run build` produces a fully static prerendered route
with no API routes, no database and no server runtime. The .docx is generated in the
browser (`atob` + JSZip), so export works on a static host and needs no serverless
function. Nothing reads `process.env` or the filesystem at runtime.

## Notes

- Bilingual mode stacks English above Chinese inside a single paragraph, so a
  bilingual option consumes one list number rather than two.
- Rich text uses lightweight inline markers in the editor: `**bold**`, `*italic*`,
  `__underline__`, `^{superscript}`, `_{subscript}`.
- "Copy for Word" writes `text/html` plus a plain-text fallback. Clipboard HTML
  cannot carry Word numbering definitions, so numbering pastes as literal text —
  the .docx remains the fidelity gold standard.
