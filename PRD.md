# PRD — Bilingual HKDSE Economics Worksheet Generator

**Version:** 1.0
**Date:** 2026-07-25
**Status:** Draft for implementation

---

## 1. Overview

A web application for Hong Kong secondary-school Economics teachers to build printable
worksheets, quizzes, and assessments at HKDSE level. Teachers compose questions in a
browser-based editor and export a **native Microsoft Word (.docx) file** that opens
cleanly in Word and remains fully editable there. All content is bilingual
(English + Traditional Chinese, Hong Kong usage), and every worksheet exists in a
student version and a teacher version (with answers and marking scheme).

### 1.1 The single most important requirement

**The .docx export is the product.** Teachers will finish their papers in Word, so the
export must arrive as native Word constructs:

- Real Word tables (`w:tbl`), not images or HTML approximations.
- Real Word automatic numbering (numbering definitions in `numbering.xml` referenced
  by paragraphs), not typed-in literal numbers — so that if a teacher inserts a new
  question in Word afterwards, numbering continues correctly on its own.
- Real named paragraph/character styles (`styles.xml`) — e.g. "Question", "Option",
  "Sub-question", "Marks" — so teachers can restyle a whole paper in one action.
- Images embedded in the package (`word/media/`), never linked externally.
- Proper per-script font settings: Latin text and CJK text each get their own font
  via `w:rFonts` (`w:ascii`/`w:hAnsi` for Latin, `w:eastAsia` for CJK).

Any feature that conflicts with clean Word output should be resolved in favour of the
Word output.

### 1.2 Non-goals (v1)

- No student-facing delivery, online answering, or auto-grading.
- No multi-user accounts, sharing, or real-time collaboration.
- No PDF export (Word covers printing; PDF may come later).
- No question-bank marketplace or AI question generation (the editor is manual).
- No languages beyond English and Traditional Chinese.

---

## 2. Users

**Primary:** Hong Kong secondary-school Economics teachers preparing HKDSE-style
assessments. They are expert Word users but not technical. They work on
desktop/laptop, usually with Microsoft Word (Windows or Mac) installed.

**Usage pattern:** Build a worksheet in the app → export .docx (or copy to clipboard)
→ polish in Word → print/distribute. Later, reopen the saved worksheet in the app to
revise or produce a variant.

---

## 3. Core concepts and data model

### 3.1 Bilingual text

Every user-visible piece of content is a **bilingual text object**:

```ts
interface BiText {
  en: string;  // English
  zh: string;  // Traditional Chinese (Hong Kong usage)
}
```

This applies to: question stems, MCQ options, nested statements, sub-question text,
table cell contents, image captions, alt text, answers, explanations, marking-scheme
points, worksheet title, section headings, and instructions.

Rich inline formatting (bold, italic, underline, superscript/subscript) must be
representable inside each language's string — model each side as a small rich-text
run array rather than a plain string:

```ts
type InlineRun = { text: string; bold?: boolean; italic?: boolean;
                   underline?: boolean; vertAlign?: 'superscript' | 'subscript' };
type RichText = InlineRun[];
interface BiText { en: RichText; zh: RichText; }
```

Either side may be empty (teacher hasn't translated yet); the editor should flag
missing translations but never block on them.

### 3.2 Worksheet document model

```ts
interface Worksheet {
  schemaVersion: number;          // for forward-compatible persistence (see §9)
  id: string;
  title: BiText;
  instructions?: BiText;          // e.g. "Answer ALL questions."
  sections: Section[];            // e.g. "Section A: Multiple Choice"
  createdAt: string; updatedAt: string;
}

interface Section {
  id: string;
  heading?: BiText;
  questions: Question[];
}

type Question = McqQuestion | StructuredQuestion;   // discriminated union on `type`
```

**Design rule for longevity:** `Question` is a discriminated union with a `type`
field. All shared behaviour (numbering, marks totalling, content blocks, answer/
explanation) lives in a common base so future types — short answer, true/false,
fill-in-the-blank, matching, essay — are added by defining a new variant plus its
editor panel and its docx renderer, with **no changes** to numbering, persistence,
versioning, or export plumbing.

```ts
interface QuestionBase {
  id: string;
  type: string;
  blocks: ContentBlock[];         // the stem: paragraphs, tables, images, in order
  marks?: number;                 // MCQ marks; structured questions derive totals
}
```

### 3.3 Content blocks

The stem of any question — and the body of any structured-question part — is an
ordered list of blocks:

```ts
type ContentBlock = ParagraphBlock | TableBlock | ImageBlock;

interface ParagraphBlock { kind: 'paragraph'; text: BiText; }

interface TableBlock {
  kind: 'table';
  rows: TableRow[];               // first N rows may be flagged as header rows
  headerRowCount: number;
  caption?: BiText;
}
interface TableRow { cells: TableCell[]; }
interface TableCell {
  text: BiText;
  colSpan?: number; rowSpan?: number;   // merged cells
  align?: 'left' | 'center' | 'right';
}

interface ImageBlock {
  kind: 'image';
  src: string;                    // stored as data or app-managed asset id — never a remote URL
  widthPx: number; heightPx: number;   // display size; preserve aspect ratio
  caption?: BiText;
  altText: BiText;
}
```

Tables are first-class because Economics data-response questions depend on them:
demand/supply schedules, cost tables, national income accounts. Tables and images
must be insertable at **any** level: MCQ stem, structured-question stem, any
sub-question or sub-sub-question.

### 3.4 MCQ

```ts
interface McqQuestion extends QuestionBase {
  type: 'mcq';
  statements?: BiText[];          // optional nested numbered statements (1)(2)(3)(4)
  options: McqOption[];           // exactly 4, labelled A–D
  answerIndex: number;            // 0–3
  explanation?: BiText;           // teacher-version only
}
interface McqOption { text: BiText; }
```

The nested-statements pattern is the HKDSE combination MCQ: the stem is followed by
numbered statements (1), (2), (3) [, (4)], and the A–D options reference combinations,
e.g. "(1) and (2) only" / "(1)、(2)及(3)". Statement numbering (1)(2)(3)… is
rendered by the app/export; the teacher only writes statement text. Options referring
to combinations are ordinary option text (the app does not model the combination
logic in v1).

### 3.5 Structured (long) question

```ts
interface StructuredQuestion extends QuestionBase {
  type: 'structured';
  parts: QuestionPart[];          // (a), (b), (c) …
}
interface QuestionPart {
  id: string;
  blocks: ContentBlock[];         // part text + optional tables/images
  marks?: number;                 // omitted if this part has sub-parts
  subParts?: QuestionSubPart[];   // (i), (ii), (iii) …
  answer?: BiText;                // teacher-version marking scheme for this part
}
interface QuestionSubPart {
  id: string;
  blocks: ContentBlock[];
  marks: number;
  answer?: BiText;
}
```

**Marks totalling:** a part's marks = its own `marks` or the sum of its sub-parts;
a question's total = sum of its parts. Totals are computed, never stored, and are
displayed live in the editor and rendered in the export (e.g. "(Total: 12 marks)").
Marks render per part as "(4 marks)" / "（4分）" in the conventional right-hand
position after the part text.

---

## 4. Numbering

Numbering is **never typed literal text** in the data model; it is always derived.

- **In the editor:** question numbers (1, 2, 3 …), part letters (a, b, c), roman
  sub-parts (i, ii, iii), statement numbers (1)(2)(3), and option letters (A–D)
  regenerate automatically whenever questions are added, removed, or reordered.
  Numbering runs continuously across sections unless a section is configured to
  restart (default: MCQ section and structured section each restart at 1 — make this
  a per-section toggle, default "continue").
- **In the .docx:** numbering is emitted as native Word multilevel list definitions
  (see §7.2) so it keeps working when the teacher edits in Word.

---

## 5. Editor (web app)

### 5.1 Layout

The **worksheet view (live print preview) is the centrepiece, placed in the middle**
of the screen; all **user inputs live in a sidebar on the right**.

- **Centre — worksheet view:** a live print preview of the worksheet, reflecting the
  currently selected output mode (language mode × student/teacher). Clicking a
  question/part/block in the preview selects it and loads its inputs into the right
  sidebar. The preview approximates the Word output; the .docx is the source of
  truth for final appearance.
- **Right sidebar — inputs:** all editing controls for the currently selected item:
  text fields, option editing, marks, statements, table editing, image upload,
  add/remove/reorder of parts and blocks. Adding questions and reordering the
  worksheet structure are also driven from here (a compact structure list with
  drag-to-reorder may sit above the item inputs, or reordering may be done directly
  on preview items — implementer's choice, but the sidebar is the editing home).

### 5.2 Bilingual editing

The language inputs shown in the sidebar **follow the selected language mode**:

- **English only:** show only the EN input box for each text field.
- **中文 only:** show only the 中文 input box.
- **Bilingual:** show both boxes (EN above or beside 中文).

Switching modes only changes which inputs are visible — content in the hidden
language is always preserved, never cleared. Missing-translation warning badges (with
a worksheet-level "untranslated items" count) are shown only in bilingual mode, since
that is the only mode where a missing side affects output.

### 5.3 Question editing

- Add question: choose type (MCQ / Structured; the type picker is the extension point
  for future types).
- MCQ: stem blocks, optional statements list (add/remove/reorder statements), 4
  options, answer selector, explanation.
- Structured: stem blocks; add/remove/reorder parts and sub-parts; marks per leaf
  part; per-part answers; live marks totals.
- Any question, part, or sub-part: insert paragraph / table / image blocks in any
  order; reorder and delete blocks.
- Table editing: add/remove rows and columns, toggle header rows, merge/unmerge
  cells, per-cell alignment.
- Image: upload (PNG/JPEG), resize with aspect ratio locked, caption + alt text.
- Duplicate question; move question between sections.

### 5.4 Output controls

- **Language mode:** English only / 中文 only / Bilingual.
  In bilingual mode, each text unit renders English first, then the Chinese
  equivalent directly below it in the same logical position (same table cell,
  same option line, etc.). For short units (MCQ option, table cell) the two
  languages may share a line separated by a space where both fit — implementers
  may start with "always stacked" for simplicity.
- **Version:** Student / Teacher.
  Teacher version = student version + correct answers marked, explanations, per-part
  marking scheme text, rendered in a visually distinct style (e.g. a named "Answer"
  style, distinct colour) and clearly labelled "Teacher Version / 教師版" in the
  header.
- These controls drive the preview, the export, and the clipboard copy.

---

## 6. Persistence

- Worksheets save and reload for later editing. v1 storage: local (browser storage
  or local file via download/upload of the JSON document) — pick one and implement it
  well; a backend DB is not required for v1 but the storage layer should be an
  interface so a server can slot in later.
- The saved format is the JSON document model from §3, always carrying
  `schemaVersion`.
- **Backward compatibility is a hard requirement:** the app must open every worksheet
  saved by any earlier released schema version. Implement an ordered chain of pure
  migration functions (v1→v2→v3 …) run on load. Never mutate the meaning of an
  existing field; add new fields as optional with defaults. Unknown fields found in a
  document (from a newer version) should be preserved through load/save, not dropped.
- Autosave in the editor (debounced), plus explicit Save.
- Images are stored inside the saved document (base64) or as app-managed assets
  referenced by id — either way, a saved worksheet must be self-contained enough to
  reload with all images intact on the same machine.

---

## 7. Export

### 7.1 .docx — general

- Generated client-side or server-side (implementation's choice; the `docx` npm
  package is a reasonable base, but drop to raw OOXML where the library can't express
  something — e.g. custom numbering or east-Asian font attributes — rather than
  compromising the output).
- Must open with **no repair prompt** in Microsoft Word (Windows + Mac, current
  versions). LibreOffice compatibility is nice-to-have, not required.
- File naming: `<worksheet title> (<Student|Teacher>) (<EN|ZH|Bilingual>).docx`.
- A4, portrait, sensible margins (2.54 cm default). Header: worksheet title (+
  "Teacher Version / 教師版" when applicable). Footer: page number as a native Word
  page-number field.

### 7.2 .docx — numbering (critical)

Emit real multilevel numbering so Word maintains it:

- One abstract numbering definition for **questions** (decimal: 1. 2. 3.) with
  levels for structured parts ((a)(b)(c), lowerLetter) and sub-parts ((i)(ii)(iii),
  lowerRoman), with correct indents and hanging indents at each level.
- A numbering definition for **MCQ options** (A. B. C. D., upperLetter) that
  **restarts for every question** — in practice, a fresh `w:num` instance per
  question referencing the shared abstract definition, so each question's options
  start again at A.
- A numbering definition for **nested statements** ((1)(2)(3), decimal in
  parentheses), also restarting per question.
- Acceptance test: in the exported file, place the cursor at the end of question 3,
  press Enter, and Word must offer/continue the list so a new "4." appears (or,
  for options, a new "E." — proving it is a live list, not typed text). Deleting
  question 2 in Word must renumber the rest automatically.

### 7.3 .docx — styles

Define named styles in `styles.xml` and attach every paragraph to one:
`Question Stem`, `MCQ Option`, `Statement`, `Sub-question`, `Sub-sub-question`,
`Marks`, `Table Caption`, `Image Caption`, `Section Heading`, `Answer`,
`Marking Scheme`. Direct formatting is kept to a minimum so a teacher can restyle
globally via the style gallery.

### 7.4 .docx — fonts and CJK

- Every run carries `w:rFonts` with separate Latin (`w:ascii`/`w:hAnsi`) and CJK
  (`w:eastAsia`) fonts. Defaults: Times New Roman (Latin) and PMingLiU 新細明體 or
  Microsoft JhengHei 微軟正黑體 (CJK) — make the pair configurable per worksheet with
  these as presets. Set the same pairing in the document defaults (`docDefaults`)
  and in every named style.
- Mixed EN/中文 within one run must render each script in its proper font
  (this is exactly what `w:eastAsia` handles — verify with mixed strings like
  "GDP平減物價指數").
- Chinese text uses full-width punctuation（，。「」）; the editor should not
  auto-convert, but sample content and docs use HK conventions.

### 7.5 .docx — tables and images

- Tables: real `w:tbl` with grid, merged cells (`gridSpan` / `vMerge`), header rows
  flagged `w:tblHeader` (repeat on page break), visible borders by default, cell
  alignment honoured.
- Images: embedded in `word/media/`, inline with text wrapping "in line with text",
  sized per the editor's display size, with alt text set on the drawing. Captions as
  `Image Caption`-styled paragraphs beneath.

### 7.6 .docx — page breaks

A question must not split across pages: apply `keepNext`/`keepLines` across each
question's paragraphs and `cantSplit` on table rows, so Word pushes the whole
question to the next page when it doesn't fit. (Very long structured questions that
exceed a full page are allowed to break between parts, but never mid-part.)

### 7.7 Clipboard copy

A "Copy for Word" action places the current output (same language/version mode as
selected) on the clipboard such that pasting into Word preserves formatting:
tables as tables, images inline, numbering acceptable as literal text here
(clipboard HTML cannot carry real Word numbering definitions). Implement via the
async Clipboard API writing a `text/html` flavour styled for Word paste, plus a
plain-text fallback. Scope options: copy whole worksheet or a single question
(per-question copy button). The .docx remains the fidelity gold standard; the
clipboard path is convenience.

---

## 8. Rendering rules summary (both preview and export)

- MCQ: stem blocks → statements (if any) → options A–D. Teacher version: answer
  letter shown (e.g. "Answer: C") + explanation, in `Answer`/`Marking Scheme` styles.
- Structured: stem blocks → parts (a)… each with its blocks, sub-parts (i)… with
  marks per leaf shown as "(n marks)/（n分）", question total at the end. Teacher
  version: each part's answer follows that part.
- Bilingual mode: EN unit then 中文 unit, stacked, at every text position.
- Section headings render in `Section Heading` style; instructions after the title.

---

## 9. Extensibility contract

Adding a future question type (short answer, true/false, fill-in-the-blank,
matching, essay) must require only:

1. A new variant in the `Question` union (+ schema-version bump with migration
   defaulting old docs unchanged).
2. An editor panel component for the type.
3. A renderer implementation for: preview, docx, clipboard HTML.
4. Registration in a single question-type registry (id, display name in both
   languages, factory for a blank instance, the three renderers, the editor panel).

Nothing in numbering, marks totalling, persistence, or export orchestration may
need modification. Treat this registry as an architectural acceptance criterion.

---

## 10. Tech stack

- Node.js, Next.js (App Router), React, TypeScript (strict).
- State: any mainstream store (Zustand/Redux) — must support undo/redo of editor
  actions (undo/redo is required in v1).
- docx generation: `docx` npm package, extended with raw OOXML where needed (§7.1).
- No requirement for a database in v1 (§6).
- All UI chrome (buttons, labels) bilingual or English-first with 中文 labels where
  natural; UI language is secondary to content bilingualism.

---

## 11. Acceptance criteria (condensed test checklist)

1. Export a worksheet with 5 MCQs (one using nested statements + a table in the
   stem + an image) and 2 structured questions (parts a–c, sub-parts i–iii, marks)
   → opens in Word with no repair prompt.
2. In Word: insert a paragraph after question 3 and continue the list → new question
   number appears and subsequent questions renumber. Delete a question → renumbers.
3. In Word: every paragraph shows a named style from §7.3 in the style pane;
   changing the "MCQ Option" style updates all options.
4. Mixed-language run "GDP平減物價指數(GDP deflator)" renders Latin in the Latin
   font and CJK in the CJK font.
5. Tables arrive as editable Word tables; merged cells intact; header row repeats
   across a page break.
6. Images are embedded (file works with network off / moved to another machine);
   alt text present.
7. No question is split across a page boundary in Word's print layout.
8. Student export contains no answers/explanations anywhere (including document
   metadata); teacher export contains all of them, clearly styled and labelled.
9. Language modes: EN-only export contains no Chinese content text; 中文-only
   contains no English content text; bilingual contains both, EN first.
10. Reorder questions in the editor → all numbering (questions, statements kept
    per-question, parts) updates instantly; marks totals recompute when a sub-part's
    marks change.
11. Save a worksheet, reload the app, reopen it → identical content including
    images and merged tables. A document saved at schemaVersion N-1 (fixture) opens
    correctly at version N.
12. Copy-for-Word of a question with a table → paste into Word gives a real table
    with formatting.
13. Undo/redo works across add/delete/reorder/edit operations.

---

## 12. Open questions (decide during implementation, don't block)

- Exact bilingual line-sharing rule for short units (§5.4) — start with always-stacked.
- Whether section numbering restart defaults per §4 match HKDSE house style the
  teacher expects — ship the toggle either way.
- Storage choice for v1 (browser storage vs. file download/upload) — file
  download/upload is simplest to make reliable and portable; recommended.
