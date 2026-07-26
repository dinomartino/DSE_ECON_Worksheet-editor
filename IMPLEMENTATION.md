# Implementation record

What was built against [`PRD.md`](./PRD.md), what was decided along the way, what
was verified and how, and what was deliberately left out.

**Date:** 2026-07-25 · **Status:** v1 complete · ~5,900 lines TS/TSX incl. tests
**Stack:** Next.js 16 (App Router) · React 19 · TypeScript strict · Zustand · JSZip · Vitest

> **PRD revision, §5.1 + §5.2 (2026-07-25, after first build).** The editor layout was
> respecified: the preview became the centrepiece with all inputs moving to a right
> sidebar, and bilingual inputs now follow the selected language mode instead of
> always showing both. Both were implemented — see §9 below. The change was confined
> to the UI layer: the model, registry, render IR and every exporter were untouched,
> and the .docx output is byte-for-byte unaffected.

---

## 1. What exists

| Area | Files | State |
| --- | --- | --- |
| Document model, derived numbering, marks, migrations | `src/model/` | Complete |
| Question-type registry (§9 extension point) | `src/registry/` | Complete |
| Neutral render IR + worksheet walker | `src/render/` | Complete |
| .docx export (raw OOXML) | `src/export/docx/` | Complete |
| Clipboard HTML + plain-text export | `src/export/clipboard.ts` | Complete |
| Editor UI, two-pane layout, undo/redo | `src/components/`, `src/store/` | Complete |
| Persistence behind an interface | `src/storage/` | Complete |
| In-place editing on the page (§11) | `src/model/edits.ts`, `src/components/preview/` | Complete |
| Tests | `*.test.ts` | 81 passing |

Verification gates: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
— all clean. `npm run samples` emits real .docx files for manual inspection in Word.

---

## 2. The decision that shaped everything: one IR, three backends

The PRD asks each question type to provide three renderers — preview, docx, clipboard
(§9.3). Implemented literally, that is three chances per type for the preview to
disagree with the exported paper about numbering or teacher-only filtering.

Instead, a question type emits a **neutral render IR** once (`src/render/ir.ts`), and
the three backends consume it. Same contract, one implementation per type, and
preview/export drift becomes structurally impossible.

The IR's `listRef` field is what carries numbering: a node names its numbering
*stream* and level. The docx backend maps each distinct stream to a `w:num`
instance; preview and clipboard fall back to the literal `marker`. This is the hinge
that makes native Word numbering work while keeping the other two backends simple.

---

## 3. Bugs found by opening the actual files

The unit tests passed clean while all three of these were live. They were caught by
generating real .docx files, converting them with LibreOffice, and **reading the
rendered pages**. Each now has a regression test.

### 3.1 MCQ options ran A–D, E–H, I–L across questions

§7.2 requires each question's options to restart at A. I gave every question its own
`w:num` instance referencing a shared abstract definition — which the test suite
confirmed — but multiple instances sharing one abstract definition **continue a single
counter**. Question 2's options rendered E. F. G. H.

Fixed with an explicit `w:lvlOverride`/`w:startOverride` on every level of each
option and statement instance. `src/export/docx/numbering.ts:115-148`.

### 3.2 Section B did not restart at 1 in Word

My *derived* numbering was correct (§4) — `computeNumbering` restarted the section, and
its test passed. But Word recomputes list numbers itself and ignored the value
entirely, rendering 6. and 7. where the model said 1. and 2.

The fix had to make the restart real to Word, not just to the app: a section flagged
`restartNumbering` now opens its own numbering stream with a `startOverride`, while a
continuing section shares the previous stream. Required threading `questionStream`
through `RenderContext` so question types name their stream rather than hardcoding
one. `src/render/worksheet.ts:47-66`, `src/export/docx/numbering.ts:130-135`.

**Lesson worth keeping:** for anything Word recomputes, asserting on the model is not
evidence. The assertion has to be about the OOXML, and ideally about the rendered page.

### 3.3 `(iii)Explain the effect` — no space after the marker

Level-2 sub-parts used a 360-twip hanging indent, too narrow for three-character
roman numerals. Widened to 540 (clears up to `(viii)`).
`src/export/docx/numbering.ts:97-99`.

### 3.4 A sanitize regex that silently ate XML

`sanitizeText` was written with literal control characters in its character class,
which got mangled into printable ones — so it stripped `<`, `/`, `>` and produced
`<w:t ...>Price ($) <w:tcPr>` with the closing tag deleted. Rewritten from explicit
`\uXXXX` escapes, with lone-surrogate handling and well-formed pairs preserved.
`src/export/docx/xml.ts:20-35`.

### 3.5 Preview markers sat on their own line

Found in the browser screenshot, not the file: bilingual stacking used block-level
spans, pushing text below its own list marker. Replaced with a soft break plus a
CSS hanging indent that mirrors Word's `w:ind`.
`src/components/preview/Preview.tsx:33-40, 70-97`.

---

## 4. Judgment calls

Items §12 left open, plus decisions the PRD did not cover.

**Bilingual units share one paragraph, not two.** In bilingual mode English and
Chinese are separated by a soft break (`w:br`) *inside a single paragraph*. Two
paragraphs would consume two list numbers, so a bilingual MCQ option would render
"A." then "B." for its own translation. §5.4 permitted always-stacked; this is
stacked, and correct for lists. Asserted in `docx.test.ts`.

**Both storage paths, not one.** §12 recommended picking one. Behind the
`WorksheetStore` interface both were cheap: localStorage drives autosave and reopen,
JSON download/upload gives portability across machines. The interface is the seam
where a server would slot in.

**Raw OOXML, and the `docx` package removed.** §7.1 called `docx` "a reasonable base"
but permitted dropping to raw XML where the library cannot express something.
Custom multilevel numbering with per-instance restarts and `w:eastAsia` on every run
*are* those things, and once they are hand-written the library earns nothing. The
dependency was uninstalled rather than left sitting unused.

**Section restart defaults to on** for the two seeded sections (§12's second open
question), with a per-section toggle either way.

**Rich text via inline markers.** `**bold**`, `*italic*`, `__underline__`,
`^{sup}`, `_{sub}` parsed into the run array the model requires (§3.1). Keeps
bilingual editing to plain textareas. See §6 below for the tradeoff.

**Student-version leakage treated as a security property.** §11.8 says "including
document metadata". Teacher-only nodes are filtered at the IR level, before any
backend sees them, and the test sweeps *every* XML part in the package for answer
text rather than checking `document.xml` alone.

---

## 5. How each acceptance criterion was verified

§11's checklist, and the evidence for each. "Rendered" means the .docx was converted
by LibreOffice and the resulting page was read.

| # | Criterion | Evidence |
| --- | --- | --- |
| 1 | 5 MCQs + 2 structured open with no repair prompt | Fixture built to spec; package structure, relationship integrity and XML well-formedness asserted across every part; files identified as "Microsoft Word 2007+" by macOS and opened by LibreOffice |
| 2 | Numbering is live in Word | `numbering.xml` structure asserted (3 abstract defs × 9 levels, correct formats); document body asserted to contain **no** literal `1.` / `(a)` / `A.` text; restart overrides asserted per instance; **rendered** to confirm 1./(a)/(i) resolve |
| 3 | Every paragraph carries a named style | All 11 §7.3 styles asserted present in `styles.xml`; every `w:p` in the body asserted to have a `w:pStyle` |
| 4 | Mixed-script run renders per script | `GDP平減物價指數(GDP deflator)` kept in one run with `w:rFonts` carrying separate `ascii`/`hAnsi`/`eastAsia`; **rendered** to confirm Latin and CJK take different faces |
| 5 | Tables editable, merges intact, headers repeat | `w:tbl` + `tblGrid` + `gridSpan` + `vMerge` + `tblHeader` + `cantSplit` asserted; **rendered** to confirm merged header and shading |
| 6 | Images embedded, alt text present | `word/media/image1.png` asserted to contain real PNG magic bytes; `descr` asserted on the drawing; no external URL |
| 7 | Questions not split across pages | `keepNext` on question paragraphs, `keepLines` in styles, `cantSplit` on rows |
| 8 | Student export free of answers *anywhere* | Every `.xml` part in the package swept for answer strings; `docProps/core.xml` checked; teacher export separately asserted to contain them |
| 9 | Language modes isolate content | EN-only asserted free of every zh translation string; ZH-only free of English; bilingual asserted EN-first with a `w:br` inside one `w:p` |
| 10 | Reorder renumbers; marks recompute | Model tests on `computeNumbering` and `questionMarks`; store tests on reorder/move-between-sections |
| 11 | Save/reload identical; N-1 fixture opens at N | v1 fixture migrated to v2; round-trip asserted byte-identical incl. base64 images and merged cells; unknown-field preservation asserted both directions |
| 12 | Copy-for-Word gives a real table | Clipboard HTML asserted to contain `<table>`, `colspan`, data-URI `<img>`, escaped metacharacters, and per-question scoping |
| 13 | Undo/redo across all operations | Store tests: edit, add, delete, reorder, redo-branch invalidation, no-op at history ends, load-resets-history |

**Criterion 4 caveat, stated plainly:** rendering confirms the two scripts take
different fonts, which is the substance of the requirement. Confirming they are
*specifically* Times New Roman and PMingLiU requires Microsoft Word, which I could
not drive headlessly. The `w:rFonts` attributes are asserted exactly.

Also verified beyond the checklist: the whole flow driven in a real Chromium session
against the production build — load JSON, edit, undo/redo, toggle modes, export —
with **zero console errors**, and the browser-generated .docx confirmed valid. This
doubles as proof the client bundle carries no Node dependency.

---

## 6. Known gaps

Real §5 wording, consciously not implemented:

- **Rich text has no WYSIWYG surface.** Inline markers in plain textareas, parsed
  into the model's run array. The data model is exactly as §3.1 specifies; the
  editing affordance is more technical than a teacher may expect.
- **Preview selection is question-level, not block-level.** §5.1 says clicking a
  "question/part/block" loads its inputs. Clicking any question does open the right
  editor — which contains every part and block — but the sidebar does not scroll to
  the specific part that was clicked.
- **Vertical cell merge is thinner than horizontal.** `vMerge` is emitted and the
  geometry is handled, but merge-down is less exercised by tests than merge-right.
- **No E2E test in the repo.** The Playwright runs were one-offs; Playwright was
  uninstalled afterwards to keep the dependency tree lean.

---

## 7. Deployment

Deploys to Vercel as-is: `npm run build` produces a fully static prerendered route,
no API routes, no database, no runtime `process.env` or filesystem access.

The .docx is generated **in the browser** (`atob` + JSZip), so export works on a
static host with no serverless function. The base64 decoder prefers `atob` — present
in browsers, the Edge runtime and modern Node — with a `globalThis.Buffer` lookup as
a last resort that cannot reach the client bundle. Verified by exporting a valid
Word file from a real browser session against the production build.

---

## 8. Where to start reading

1. `src/model/types.ts` — the document model, and the rules the rest depends on.
2. `src/render/ir.ts` — the neutral IR; `listRef` is the interesting part.
3. `src/export/docx/numbering.ts` — the hardest file, and where §3.1/§3.2 live.
4. `src/registry/index.ts` — the single registration point for new question types.
5. `src/registry/registry.test.ts` — §9 enforced as a test rather than a convention.

---

## 9. PRD revision: §5.1 and §5.2

The PRD was revised after the first build, respecifying the editor layout. Sections
§1–§4 and §6–§12 were unchanged, so the work was confined to the UI layer.

### 9.1 §5.1 — preview centre, inputs in a right sidebar

Was: two panes, structural editor left, preview right. Now: the preview is the
**centrepiece in the middle**, and **all inputs live in a right sidebar**.

- `EditorApp.tsx` — preview is now `<main>` (flex-1, centre); the sidebar is a
  fixed-width `<aside>` on the right.
- `Sidebar.tsx` (new, replaces `StructureEditor.tsx`) — two stacked regions: a
  compact structure list on top, the selected item's inputs below. Selecting a
  question in either the list *or* the centre preview loads its inputs here.
- **Drag-to-reorder implemented**, closing a gap the previous build had listed.
  Needed a new `reorderQuestion(questionId, targetQuestionId)` store action —
  remove-then-insert-at-target, rather than the neighbour swap `moveQuestion` does,
  so a drag lands where it was dropped instead of one position off. It also works
  across sections and is undoable like any other edit.
- The A4 page now **scales to fit** the narrower centre column
  (`ResizeObserver` + `transform: scale`) rather than being clipped. Measured at
  three viewport widths: 1700px → no scaling, 1100px → 0.784 and fully visible.

### 9.2 §5.2 — inputs follow the selected language mode

Was: both language boxes always shown regardless of mode. Now: English-only shows
only the EN box, 中文-only only the 中文 box, bilingual shows both.

The critical constraint is that switching mode must **never clear** the hidden
language. This holds because every input patches the `BiText` object
(`{ ...value, en: … }`) rather than replacing it, so the invisible side is carried
through untouched — asserted in `store.test.ts` by editing under EN-only and
confirming the zh side survives and reappears.

Applied in `BiTextField.tsx` and to the table-cell inputs in `BlockEditor.tsx`,
which had their own hardcoded EN/中文 pair. Missing-translation badges and the
worksheet-level untranslated count now appear **only in bilingual mode**, per the
revised wording.

### 9.3 Verification of the revision

Four new store tests (drag-reorder within a section, across sections, the
no-op/undo cases, and language-mode content preservation) — 64 passing overall,
up from 60.

Driven in Chromium against the production build: bilingual showed both boxes,
English-only 16 EN / 0 zh, 中文-only 0 EN / 16 zh, and content round-tripped back
intact; clicking a question in the centre preview loaded its panel in the sidebar.
Zero console errors. Two flaws found this way and fixed: the sidebar header wrapped
instead of truncating, and the preview was clipped at narrower widths.

The .docx export was re-generated and re-validated afterwards to confirm the UI
change did not disturb it.

---

## 10. UI rework: usability pass

The editor worked but was hard to use, and the sidebar's regions were hard to tell
apart. Diagnosed by driving the app in Chromium against the acceptance fixture and
reading the screenshots, rather than from the source alone.

### 10.1 What the screenshots showed

- The structure list was pinned at `max-h-[45%]`. With 7 questions it showed four and
  clipped the fifth mid-row, while worksheet title/instructions consumed the top third
  despite being edited about once per worksheet.
- A question row packed eight controls into ~380px, so the stem excerpt — the only
  thing identifying a question — was truncated to about ten characters ("2. Study …"),
  while a rarely used move-to-section dropdown took more width than the label.
- One hairline and identical white backgrounds separated the outline from the
  inspector. That was the substance of "hard to distinguish the components".
- Every action shared one grey `btn` class: delete, move-up and a bare `W` button were
  visually identical, and `⧉`/`W`/`→` had no accessible name at all.
- The table editor rendered an align select and two merge buttons **in every cell** —
  27 controls for a 3×3 table.

### 10.2 What changed

`src/components/ui/` now holds the shared primitives (§ *Editor Layout* in
`SYSTEM_ARCHITECTURE.md` states the rules they encode). The sidebar became three
regions — collapsed worksheet settings, `Outline`, `Inspector` — with a **draggable
divider** replacing the fixed 45%. Row actions collapsed into a `⋯` menu; the cell
toolbar now appears only for the focused cell; the toolbar folded from two rows of
nine equal buttons into one row where Export is the only filled control.

Two fixes came from reading the *after* screenshots, not the code: textareas clipped
long bilingual stems (now auto-sizing, since a fixed `rows` is wrong for exactly the
long CJK+Latin text this app exists for), and the empty state rendered above the
section headings instead of in document order.

### 10.3 Verification

`typecheck`, `lint`, `test` (64 passing) and `build` all clean — the static export is
still a single prerendered route. Ten interactions driven in Chromium, all passing
with zero console errors: empty state, settings disclosure, row overflow menu,
duplicate + ⌘Z undo, Escape-closes-menu, drag-resize (outline 240px → 440px),
preview→outline selection sync, toolbar menu, and the MCQ answer radio.

**The export path was deliberately untouched, and that was checked rather than
assumed:** .docx generated from a real browser session against the production build,
both versions identifying as "Microsoft Word 2007+" with all 18 package parts
present, the student file sweeping clean of answer strings and the teacher file
containing them.

One eslint finding worth keeping: the first auto-size hook returned `{ ref, resize }`,
which reads a ref during render (`react-hooks/refs`). The fix was to delete the manual
call entirely — the value is fully controlled, so a `useLayoutEffect` keyed on it
already covers typing, undo/redo and switching questions.

---

## 11. Direct manipulation: what you click is what you edit

§6 listed "preview selection is question-level, not block-level" as a known gap. That
gap is now closed in the stronger form: the previewed page **is** the editor. Click
text to select it, click again to edit it there, press Delete to remove it.

### 11.1 The mechanism: an edit address in the IR

The IR described what to draw but not where it came from, so a click on the page had
nothing to write back to. `TextNode`, table cells and captions now carry an optional
`EditTarget` (`src/render/ir.ts`) — the model address of the `BiText` they were
rendered from, always keyed by **id** rather than index so an edit stays correct if
questions are reordered mid-edit.

Resolution lives in `src/model/edits.ts`, not in the store, so the rules are testable
without a React tree. It walks the optional `parts`/`subParts` shape generically
rather than switching on a type id, keeping §9 intact.

**The field is inert in export.** The .docx and clipboard backends never read it —
verified by exporting before and after: both files came out at exactly 8824 and 9184
bytes, and a grep for target names across every XML part found none.

### 11.2 Two-step engagement, and why

Click-to-select then click-to-edit is not ceremony; it is what makes a keyboard
Delete safe. Delete acts only on a selection the user made deliberately, and is
ignored whenever focus sits in a field. The same guard was retrofitted to `⌘Z`,
which previously undid an entire document commit while you were typing a character
in *any* field, including the sidebar's — a real bug this work surfaced.

`describeDelete` picks the unit per target: a stem paragraph removes the block, a
statement leaves the list so the rest renumber (numbering is derived, so nothing else
updates), a table cell is emptied rather than removed because dropping it would break
the grid, and an MCQ option is refused outright since §7.2 fixes the count at four.

### 11.3 The bug found by driving it

Escaping out of an editor left the element still *selected*, so the next click read as
a second click and reopened the editor instead of re-arming Delete. The page looked
right — an empty editor covered the text — but the delete never fired. Committing and
Escaping now both clear the selection.

Worth recording because the first browser run reported it as "page no longer shows it:
PASS" alongside "deleted from the model: FAIL". The visible half passed while the real
half failed; only checking the persisted document caught it.

### 11.4 Verification

`typecheck`, `lint`, `build` clean; **81 unit tests**, up from 64 — 17 new ones in
`src/model/edits.test.ts` covering target resolution at every depth, the
other-language-preserved rule, delete semantics per target, the four-option refusal,
and an assertion that derived nodes carry no target.

Four browser suites, 44 checks, zero console errors: in-place editing of stems,
options, table cells and the title; edit coverage (110 editable fields in student
view, 132 in teacher); click-select-delete including the typing-safety guard; and the
earlier UI suite as a regression check. Layout shift on opening an editor measured at
Δy=0.0, Δh=0.0.
