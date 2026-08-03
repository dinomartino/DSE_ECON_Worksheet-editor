# HKDSE Economics Worksheet Generator

Build printable Economics worksheets, quizzes and assessments at HKDSE level in English
and Traditional Chinese (Hong Kong usage), and export a **native Microsoft Word `.docx`**
that stays fully editable in Word — live numbering, real styles, real tables, per-script
fonts.

It runs entirely in the browser. No account, no server, no database, no API keys.

```bash
git clone https://github.com/dinomartino/DSE_ECON_Worksheet-editor
cd DSE_ECON_Worksheet-editor
npm install
npm run dev          # → http://localhost:3000
```

That is the whole setup. If the page loads, you have a working environment.

---

## Table of contents

- [HKDSE Economics Worksheet Generator](#hkdse-economics-worksheet-generator)
  - [Table of contents](#table-of-contents)
  - [Requirements](#requirements)
  - [Getting started](#getting-started)
    - [First run](#first-run)
  - [Project scripts](#project-scripts)
  - [How the app works](#how-the-app-works)
    - [What makes the `.docx` a real Word document](#what-makes-the-docx-a-real-word-document)
  - [Codebase tour](#codebase-tour)
  - [The five invariants](#the-five-invariants)
  - [Adding a question type](#adding-a-question-type)
  - [Testing](#testing)
  - [Deployment](#deployment)
  - [Contributing](#contributing)
  - [Licence and third-party material](#licence-and-third-party-material)

---

## Requirements

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | **20.9+** (22 LTS recommended) | Next.js 16 requires ≥20.9. Developed on 22.16. |
| npm | 10+ | Ships with Node 20/22. `package-lock.json` is committed — use `npm ci` for a reproducible install. |
| Browser | Any modern Chromium, Firefox or Safari | Needs `Blob`, `atob` and the download attribute. |

Optional, only for the screenshot harness (`scripts/shot.mjs`):

- **Google Chrome** installed locally. The repo depends on `playwright-core`, which does
  *not* download its own browser; the script launches your system Chrome via
  `channel: 'chrome'`. Skip this and everything else still works.

There are **no environment variables**. Nothing in `src/` reads `process.env`, so there
is no `.env` file to create and no secrets to obtain.

## Getting started

```bash
npm ci               # reproducible install from the lockfile (or: npm install)
npm run dev          # dev server on http://localhost:3000
```

Then, to check your environment is sound before you change anything:

```bash
npm run typecheck    # tsc --noEmit
npm test             # 750 unit + export tests, ~1s
npm run lint
```

`typecheck` and `test` pass clean on a fresh checkout. `npm run lint` reports ~41
pre-existing warnings (unused vars, exhaustive-deps) and **2 pre-existing errors**, both
in `MarksTrail` (`src/components/preview/Preview.tsx`) from the React Compiler's
`set-state-in-effect` and memoization rules. They flag a deliberate, documented pattern:
the marks label's placement can only be decided by measuring the laid-out line, so the
measurement must run in a layout effect and set state (see *"(4 marks)" sits on the last
line with text* in [`SYSTEM_ARCHITECTURE.md`](./SYSTEM_ARCHITECTURE.md)). Treat any *new*
error as breakage.

### First run

The editor opens on an empty worksheet with the paper in the middle of the screen.

1. **Question** in the left rail adds a multiple-choice or structured question.
2. Double-click any text on the page to edit it in place — the preview *is* the editor.
3. **Setup** in the toolbar opens per-document settings (fonts, paper, margins,
   header/footer, title block).
4. **Export .docx** downloads the Word file. **PDF** prints via the browser.

Your document autosaves to `localStorage` and reopens on refresh. Use the `⋯` menu to
download it as portable `.json` (images included, base64-encoded) or load one back.

## Project scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server with hot reload. |
| `npm run build` | Production build. Emits a fully static prerendered route. |
| `npm start` | Serves the production build. |
| `npm test` | Vitest over `src/` — model, numbering, migrations, pagination, diagram geometry, OOXML export. |
| `npm run test:watch` | The same suite in watch mode. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint (`eslint-config-next`). |
| `npm run samples` | Writes real `.docx` files to `/tmp/econ-samples` so you can open them in Word by hand. Override with `SAMPLE_DIR=./out`. |

`npm run samples` is the fastest way to eyeball export changes:

```bash
SAMPLE_DIR=./out npm run samples && open ./out
```

## How the app works

```
┌────────┬────┬───────────────────────────────┬──────────────────────────┐
│  Add   │Page│                               │ [ Content 7 ][ Question 2]│
│  Rail  │Rail│          Preview              ├──────────────────────────┤
│        │    │     (scales-to-fit A4)        │  outline / inspector     │
│  Ques- │ 1  │                               │                          │
│  tions │ 2  │  ⠿ 1 What happens…  MC  1m    │  drag to reorder         │
│  Layout│ 3  │  ⠿ 2 Study the table… MC 1m   │  ⋯ overflow actions      │
└────────┴────┴───────────────────────────────┴──────────────────────────┘
```

**One render pipeline, three backends.** A question type emits a neutral render IR
once. The on-screen preview, the `.docx` exporter and the clipboard exporter all consume
that same IR, so numbering, ordering and student/teacher filtering cannot drift apart
between what you see and what you export.

```
Question ──registry.render()──► RenderNode[] ──┬──► preview (React)
                                               ├──► .docx (hand-built OOXML)
                                               └──► clipboard (text/html)
```

**Derived, never stored.** Question numbers, part letters, option letters and marks
totals are computed at render time. Reordering renumbers instantly and undo/redo needs
no special handling.

### What makes the `.docx` a real Word document

The export is hand-built OOXML rather than a library's approximation, because the
requirements include constructs most libraries cannot express:

| Requirement | How it is met |
| --- | --- |
| Live numbering | `numbering.xml` with three abstract multilevel definitions. Questions/parts/sub-parts (`1.` / `(a)` / `(i)`) share one, so Word renumbers automatically on insert or delete. |
| Options restart at A | Each question instantiates its own `w:num` with `w:startOverride`, so lettering restarts instead of running A–D, E–H. |
| Section restarts | A section flagged "restart numbering" opens a new numbering stream — the restart is Word's, not typed text. |
| Named styles | `styles.xml` defines `Question Stem`, `MCQ Option`, `Marks`, `Section Heading`, `Answer`, `Marking Scheme` and more. Every paragraph attaches to one; direct formatting stays minimal. |
| Per-script fonts | Every run carries `w:rFonts` with separate `w:ascii`/`w:hAnsi` (Latin) and `w:eastAsia` (CJK), so `GDP平減物價指數(GDP deflator)` renders each script in its own font. |
| Tables | Real `w:tbl` with `gridSpan`/`vMerge` merges, `cantSplit` rows, and named border modes (`all` / `box` / `headerRule`) that reach the boxed stimulus and T-account shapes the papers actually draw. Deliberately **no** header row: no HKDSE table has one, so nothing emits `w:tblHeader`, grey fill or automatic bold. |
| Images and diagrams | Embedded in `word/media/`, inline with text, alt text on the drawing. Never linked. |
| Page breaks | `keepNext`/`keepLines` across a question's paragraphs, so questions are not split across pages. |

Verified by unzipping real exports and asserting on the XML
(`src/export/docx/docx.test.ts`), and by opening generated files in Word and LibreOffice.

## Codebase tour

```
src/
├── app/          Next.js App Router shell; EditorHost dynamically imports the
│                 editor with ssr:false (the store is browser-only)
├── model/        Document model, derived numbering, marks, migrations, page setup,
│                 document flow, bands, cover page, page furniture, table and
│                 diagram geometry + templates
├── registry/     Question-type extension point — the one place types are declared
├── render/       Neutral render IR, worksheet walker, diagram SVG renderer
├── export/       .docx (hand-built OOXML) and clipboard HTML backends
├── store/        Zustand store with undo/redo
├── storage/      Persistence behind a WorksheetStore interface (localStorage today)
└── components/   preview/ (the paper, which is also the editor)
                  editor/  (right sidebar, left rails, dialogs)
                  ui/      (buttons, fields, dialog, menu primitives)
```

`SYSTEM_ARCHITECTURE.md` is the deep reference: full data flow, the rendering pipeline,
the numbering system, the diagram model, pagination, and the reasoning behind each
editor-layout decision. Read it before making structural changes.

## The five invariants

These are load-bearing. Breaking one produces bugs that unit tests do not obviously
catch, so they are called out here and enforced in the codebase.

1. **The registry allows no type branching.** No shared module may branch on a concrete
   question type (`'mcq'`, `'structured'`). `src/registry/registry.test.ts` greps eight
   shared modules and fails if one does.

2. **`questions` owns question order; `flow` only positions layout elements.** Section
   markers are `LayoutElement`s in one flat document flow — a section is a *marker*, not
   a container.

3. **The diagram projection is shared.** The drawing canvas takes its pixel↔unit maths
   from `diagramPlot()` and its anchors from the render module's anchor functions. If a
   drag handle computes a position independently, it drifts away from the drawn element
   the moment a constant changes.

4. **Formatting is layered over named styles.** `TextFormat` stores only deltas, so a
   document whose formatting was never touched exports byte-identically to the
   style-only baseline.

5. **Drag gestures commit once.** In-flight values stay in local component state; the
   store is called on pointer-up only. Committing per-move floods the undo stack.

A sixth, practical one: **`KNOWN_KEYS` in the persistence layer silently drops fields.**
Add a field to `Worksheet` without adding it there and it will save fine, then vanish on
reload.

And a seventh: **the two band paths must agree.** `BandEditor` (an active header/footer)
and `ReadOnlyBandRow` (an idle one, and the print/PDF path) draw the same rows, so they
share `bandFieldStyle` for formatting and must occupy identical space — editing chrome is
drawn with `ring` and absolute positioning so it reserves none. A difference between them
is a preview that lies about the printed page.

## Adding a question type

Only a registry entry is needed — numbering, marks totalling, persistence and export
orchestration stay untouched:

1. Add the variant to the `Question` union in `src/model/types.ts`. Bump
   `CURRENT_SCHEMA_VERSION` and append a migration if existing documents need a default.
2. Write an editor panel component.
3. Write `render(question, context) => RenderNode[]`.
4. Register `{ id, displayName, create, render, EditorPanel }` in `src/registry/index.ts`.

Because all three backends consume the render IR, one `render` function gives you
preview, `.docx` and clipboard output simultaneously.

## Testing

```bash
npm test                                  # everything under src/
npx vitest run src/export/docx            # one area
npx vitest src/model                      # watch one area
```

The suite covers the document model and migrations, derived numbering and marks,
document flow, pagination, diagram geometry and hit-testing, and OOXML export — the
export tests unzip a generated `.docx` and assert on the XML inside.

Two conventions worth knowing:

- **Verify UI in a browser, not by reading source.** Density and overflow problems are
  invisible in JSX. `node scripts/shot.mjs out.png --seed` drives the real app in real
  Chrome and seeds it with content first, because an empty document hides exactly the
  crowding you are looking for.
- **After UI work, prove the export still holds.** The `.docx` is the product. Run
  `npm run samples`, unzip one, and confirm the XML parses and `word/media/` contains
  what you expect.

## Deployment

Deploys to Vercel (or any static host) as-is. `npm run build` produces a fully
prerendered static route:

- no API routes, no database, no server runtime;
- the `.docx` is generated in the browser (`JSZip` + `atob`), so export works on a
  static host with no serverless function;
- nothing reads `process.env` or the filesystem at runtime.

Keep it that way — client-side export is a design constraint, not an accident.

## Contributing

Issues and pull requests are welcome. Before opening a PR:

```bash
npm run typecheck && npm test && npm run lint
```

- Match the surrounding code's style. This codebase comments the *why* — the constraint
  or the bug that forced a decision — rather than restating the code. Please keep that.
- If you change anything structural, update `SYSTEM_ARCHITECTURE.md` in the same PR.
- If you touch rendering, layout or export, include evidence it still works: a
  screenshot from `scripts/shot.mjs`, or a sample `.docx` you opened.

## Licence and third-party material

Licensed under the [MIT Licence](./LICENSE) — © 2026 Tino Ho. Use it, modify it, ship it
commercially; just keep the copyright notice.

**No exam-board material is distributed with this repository.** Development referred to a
local folder of HKDSE past-paper question scans and a school assessment PDF, used to
trace diagram templates and match header/footer layout. Those are exam-board and school
copyright, so they are gitignored and excluded from the repository and its history. If a
comment or a doc cites a reference paper, it is describing what was observed in it, not a
file you will find here.

The diagram templates in `src/model/diagramTemplates.ts` are original code that
*reproduces the conventional shapes* of standard Economics diagrams (supply and demand,
AD–AS, PPC). Those conventions are not copyrightable, so the templates ship freely.

Worksheets **you** create are yours. The app stores them in your own browser and exports
them to your own disk; nothing is uploaded anywhere.
