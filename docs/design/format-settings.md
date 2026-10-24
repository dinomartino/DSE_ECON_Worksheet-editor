# Formatting settings like Justify — design proposal

Status: **approved 2026-10-23** (the user took every recommendation in § 6); building one setting
at a time. Option layout (§ 4.1) is built (§ 9.1), space between questions (§ 4.2) is built (§ 9.2) and
keep-together / new page (§ 4.3) is built (§ 9.3) and Justify in table cells (§ 4.4, row 4) is built on
`feature/table-justify` (§ 9.4). **2026-10-23: the user checked the samples of #2, #3 and table Justify and said all good,
including decisions 8 and 9 (§ 6).** The paper-wide "Start every question on a new page" (k-0189) is built (§ 9.5);
what is left waits for the user's word. Written against `develop` at `d8194642` (it has since gained the
GitHub #4 fix, `bbb0494e`; nothing here depends on it). Task k-0178. Evidence: the four GitHub
issues, `CHANGELOG.md`, the Justify commits, a code survey (by reading; nothing was run in a
browser, Word or Tauri) and a measurement pass over `real_life_reference/`.

The ask (the user, 2026-10-23, from a voice message): *"I want to work in the econ editor app.
What new function can we add? Based on the past 3 issues … I remember we fixed the justified
setting. Is it possible for us to provide other settings similar to that?"*

## In short

Justify worked because it is one small control on the page the teacher is looking at, stored as
an optional field and carried by the render IR, so the page, the thumbnails, the `.docx` and Copy
for Word agree with almost no extra code (§ 2). Nine similar settings were checked against that
template, against what the app already does, and against the real papers (§ 3).

**The finding that shapes the plan: three of the ideas already exist in some form** (MC option
layout, between-question gaps, forced page breaks). What is missing is *reach*: one click for the
whole paper, every paper shape, or the page itself. Reach is cheaper than a new engine, and it is
what the evidence supports. For a paper like the reporter's (20 MC questions), #1 below is the one
that adds something new: justify, text size and keep-whole are already there, and so are the
between-question gaps if it is a Paper 1 mock.

| # | Setting | Scope | Effort | Evidence | Verdict |
|---|---|---|---|---|---|
| 1 | **Option layout everywhere**: apply to all MC questions in one click; later a control on the page | paper (bulk) + question | S–M | Real papers stack text options (44 of 45). School papers choose per question: mock ≈20 stacked / 4 two-by-two / ≈21 one-row, DBS 17 / 0 / 2. Today only the sidebar panel, one question at a time | **Build first** |
| 2 | **Space between questions on every paper** | paper + question | M | Gap before a question: real Paper 1 35–84 pt, mock 25 pt, DBS 36 pt. Today it exists only on a Paper 1 mock | **Built** (§ 9.2) |
| 3 | **Keep a question together / start it on a new page** | question (+ paper default) | S–M | Real Paper 2 starts 12 of 14 (2019) and 9 of 11 (2025) questions on a fresh page; the mock splits Q10 and its source over three pages. Today only MC is kept whole | **Built** (§ 9.3) |
| 4 | Justify: what is left (table cells; a whole question at once) | block / question | S–M | 28 of 238 table paragraphs in the 2019 paper are justified; the paper switch skips tables | **Table cells built** (§ 9.4); a whole question waits |
| 5 | Line spacing | paper | L | Every reference is ≈ single (line pitch ÷ text size 1.09–1.2). Only Text size 12 (1.00) is tighter than any of them | **Decided 2026-10-23: no change, 12 pt stays** (§ 6 decision 5) |
| 6 | Answer lines: length, style, default count | leaf / paper | M–L | Always dotted and full width; counts follow page fill (1.4–4.8 lines per mark) | Later, at most "lines per mark" |
| 7 | Indent of the (1)(2)(3) statements | paper | M | The Paper 1 preset already matches the real paper (label +0.85 cm, text +1.70 cm) | Skip |
| 8 | Font size per block | block | S–M | Real papers are 10 pt throughout; Text size already answered #1 | Skip |
| 9 | Question numbering style | paper | L | One convention in every paper; labels are literals in about ten places | Skip |

Effort uses the scale in `docs/IDEAS.md`: S ≈ a session, M ≈ a few, L ≈ an initiative.

**Recommendation: build 1, 2, 3 in that order,** each as its own small branch. None needs a
schema change, and none changes how a saved paper prints until the teacher turns it on. The
decisions the user must make are in § 6.

## 1. What teachers have asked for

Four GitHub issues, all from the same reporter (a teacher making MC unit tests on the Windows
desktop app; the #4 screenshots show "2627 S4 T1 UT", 20 MC questions).

| # | Opened | The ask | State | What the teacher got |
|---|---|---|---|---|
| 1 | 10-10 | Text size 10 is too small, make it 11/12 "to match a DSE page"; a one-click question font size; an MC question split across pages should move whole to the next page | closed 10-13 | 0.8.1: Setup → Worksheet → **Text size** 10 / 11 / 12 pt (Mock default stays 10); an MC question always stays on one page |
| 2 | 10-14 | Justify the MC options, not only the stem | closed 10-15 | 0.8.2: **Justify** on any option (`optionAlign`), and **Justify text** for the whole paper in Setup |
| 3 | 10-20 | Justify the (1)(2)(3) statements too | closed 10-22 | 0.8.4: **Justify** on any statement (`statementAlign`) |
| 4 | 10-23 | Cannot reorder MC: nothing can be placed after Q5 "even with plenty of room on the page"; Q6 can only go before Q5 | open (fixed on `develop`, unreleased) | Not a setting: a reorder bug, fixed by another session in `523ad87b` (§ 7) |

The pattern is the point. Every ask is a small, concrete control over how the printed page
*looks* (size, alignment, where a question breaks); the teacher wants it **on the page they are
looking at**; and each was answered with one control per question plus, once, a paper-wide
switch. The one thing the product already says it will not do is in Setup → Text size: *"the line
spacing stays the same"* (中文: 行距不變).

## 2. How the Justify fix was done (the template)

Four commits over 2026-10-15 → 10-22. Sizes are non-test source lines; the tests were larger each
time.

| Step | Commit | What it added | Source |
|---|---|---|---|
| #2 options | `bd82bb51` | `McqQuestion.optionAlign`, a format-bar Justify on an option, `.docx` `w:jc` | 6 files, +209 |
| Whole paper | `a81ce3fb` | `Worksheet.justifyText`, Setup → Text size → **Justify text** | 13 files, +188 |
| Simplify | `5e11264d` | an option offers Justify only (centre or right could move the letter in Word); one toggle | 4 files, +60 |
| #3 statements | `5eb85fb3` | `McqQuestion.statementAlign`: the same pipeline again | 6 files, **+32** |

**The route one setting takes**

```
teacher ──► model field ──► render ──► IR (RenderNode[]) ──┬─► Preview.tsx:formatStyle   → page, page rail, print PDF
 click      question or     registry/mcq.ts stamps         ├─► docx/body.ts:formatParagraphProps → .docx
 a bar /    paper; optional the node's `format`            └─► clipboard.ts:formatCss    → Copy for Word,
 a switch   no schema bump  (paper switch: ir.ts:withJustifiedBody)                         start cards, bank preview
```

1. **Stored as an optional field, no schema bump.** Absent means what every old document printed.
   A *paper* field (`Worksheet.justifyText`) is added to `KNOWN_KEYS` (`src/model/migrations.ts`)
   or it saves and vanishes on reload. A *question* field (`McqQuestion.optionAlign`,
   `statementAlign`) is not a top-level key; it is classified in
   `src/library/contentKeyFields.test.ts`, which fails until it is (content = "an edit makes a
   new version in the bank": both are content; `gapBefore` is metadata).
2. **Set on the page.** Click an option or statement and the format bar shows one Justify toggle
   (`src/model/edits.ts`: `isAlignOnly`, `applyFormatTarget`, `nextOptionAlign`;
   `src/components/preview/FormatToolbar.tsx`: `alignOnly`, `alignOnlyFor`). The paper switch is
   a checkbox (`src/components/editor/DocumentSettings.tsx:JustifyTextField`). Precedence: the
   element's own, then the question's, then the paper's, then the style's. **Left** is stored as
   an explicit opt-out of a justified paper.
3. **Stamped on the render node, once.** `src/registry/mcq.ts` puts `format: { align }` on each
   option and statement; the paper switch is stamped on every body paragraph that has no align of
   its own (`src/render/ir.ts:withJustifiedBody`). No backend has to know the switch exists.
4. **Every backend reads that node.** The page, the editor's page rail (a clone of the live page,
   `src/components/editor/PageThumb.tsx`) and the print PDF share `Preview.tsx:formatStyle`. The
   `.docx` writes `w:jc both` (`formatParagraphProps`), moves the paper switch onto the named
   styles (`src/export/docx/styles.ts:justifiedStyleIds`) and adds `w:doNotExpandShiftReturn`, so
   a bilingual line that ends in a line break stays ragged in Word as on the page
   (`src/export/docx/package.ts:buildSettingsXml`). Copy for Word writes `text-align:justify`
   (`src/export/clipboard.ts:formatCss`), and the same HTML draws the start-screen cards and the
   bank's question preview.
5. **Proved four ways** (`src/registry/mcqStatementAlign.test.ts` is the model): the field
   round-trips and an old document is unchanged; the IR carries it, and nothing when absent; the
   `.docx` XML gains exactly one `w:jc`; the clipboard HTML gains `text-align`. The frozen v1
   corpus guard (`src/model/backwardCompat.test.ts`) stays green because nothing is written
   unless the teacher sets it.

**What this tells us about the next settings**

- A setting that is a **paragraph format** on a render node (`TextFormat`: `fontSize`, `bold`,
  `italic`, `underline`, `align`, `color`, `spaceBefore`, `spaceAfter`, `fonts`, `tabStops`) is
  cheap: one mapping in each of the three consumers above, and every backend agrees by
  construction. That was the +32-line step.
- A **paper-wide metric** is dearer. `Worksheet.baseFontSize` is read directly in about nine places
  (the preview ×3, the answer-key preview, the bank's question preview, the start-screen card, the
  import review, the clipboard wrapper, the `.docx` styles). Where it can, a paper setting should
  be stamped on the IR as Justify text is. One that changes question nodes must also join
  `questionRenderCache` (`src/render/worksheet.ts`) and the preview's `ctxStamp`
  (`src/components/preview/Preview.tsx`), or the page shows stale questions.
- **Word fidelity is where the risk is, not the code.** Word packs justified lines tighter (not
  fixable, `docs/STATUS.md`), and STATUS lists these builds as not yet tried in real Word or the
  Tauri shell. Every setting below inherits an "untried in Word" line until the user opens one
  file.
- A control is offered only where the text prints as its own paragraph: inline and 2-column MC
  rows have no line to align, so the format bar withholds Justify there and keeps the stored value
  for when the options stack again (`printsAsParagraph`).

## 3. What the real papers do

**Method.** Files in `real_life_reference/`. *Real* = HKEAA 2021 Paper 1 (MC, scan), 2019 Paper 2
(Word) and the 2025 Chinese-version Paper 2 (scan). *School* = a 2021–22 S6 mock (Paper I, II) and
`DBS_Assessment1` (Word, one teacher's template). `hkdse_paper1_layout_1.docx`,
`2021 (Student) (EN).docx` and `2021.worksheet.json` are the editor's own output and were not
counted. Measured from `.docx` XML, PDF content streams and 200 dpi scans; counts were spot-checked
(an independent text count of option rows gave mock 20 one-row + 4 two-by-two and DBS 2 one-row,
against ≈21 / 4 / 2 in the survey). Only the 2021 MC paper is in the folder, so "real" Paper 1
means one year. Appendix A has the rest and what was not checked.

| | Real HKEAA | School mock | DBS assessment |
|---|---|---|---|
| Text options in MC | stacked 44 of 45; the one 2×2 is a figure question | ≈20 stacked / 4 two-by-two / ≈21 one-row | 17 stacked / 2 one-row |
| What decides it | content: figures go 2×2, text is always stacked, even "(1) and (2) only" | option length, not strictly (one-row all ≤ 21 characters; stacked all have one ≥ 43) | the author, per question |
| Text and alignment | Times 10 pt, justified | Times 11 pt, 9 of 21 wrapped stems flush right | Times 11 pt, ragged |
| Line pitch (text size) | 11.5 pt (10) in Paper 1; exact 12 pt (10) in Paper 2 | 12.6 pt (11) | 12.0 pt (11) |
| Gap before a question | Paper 1: 35–84 pt, median 60 (n = 26) | 25 pt | 36 pt |
| (1)(2)(3) statements | label +0.85 cm, text and option letter +1.70 cm, option text +2.55 cm; one blank line each side | label position takes 9 different values | label 568 tw, text 1048 tw |
| Answer space | dotted, full width, 9–86 lines per question, one block after the last part | none (separate answer book) | none |
| MC split across pages | 0 of 45 (4–10 cm left blank instead) | 0 of 45 | 0 of 25 |
| Questions that start a page | Paper 2: 12 of 14 (2019), 9 of 11 (2025) | Q10 and its source split over pp. 3–5 | 3 manual breaks |
| Page | A4, 2.5 cm (P1), 2.29 cm (P2) | A4 2.0 cm; Paper II US Letter 1.78 cm | A4, 1.5 cm left/right |

**Varies per question:** MC option layout, answer space, the gap before a question, whether a
question may break across pages. **Varies per paper:** justified or ragged, text size (10 or 11),
indent grid, margins and page size. **One fixed convention:** label styles ("1." "(a)" "(i)" "A."
"(1)"), spacing inside a statement block, option-to-option spacing, line spacing (always ≈ single),
the marks label and its right tab, the dotted answer rule, no shading. A switch earns its place
where the papers vary; where they do not, it adds a control nobody needs.

## 4. The candidates

Free = the backend already reads what the setting writes. New = code needed. "Page" means the
preview, the page rail, the print PDF and (through the same IR) the start cards and bank preview.

| # | Scope | Editor | Page | `.docx` | Copy for Word | Other |
|---|---|---|---|---|---|---|
| 1 Option layout | paper (bulk) + question | **new**: Setup block; later an on-page control | free | free | free | no model change for the bulk action |
| 2 Between questions | paper + question | **new**: shown for every shape; "Space above" on structured | **new**: `boundaryGapLines` rule | free (`w:before`) | free (margin) | `gaps.test.ts`, `paper1.test.ts`, `docx.test.ts` |
| 3 Keep / new page | question (+ paper) | **new**: toggle in the question panels | **new**: paginator chain | free (follows the preview's measured breaks) | free (forced break) | `questionRenderCache` key, `contentKeyFields.test.ts` |
| 4 Justify gaps | block / question | small | free | free | free | `CellAlign` gains a value |
| 5 Line spacing | paper | new | new | new | new | about twelve sites, five pinned test files |
| 6 Answer lines | leaf / paper | new | new | new | new | card CSS, shared `LQ_LINE_*` constants |
| 7 Indent | paper | new | new | free (numbering) | **new** (hard-coded CSS) | `listIndentScheme`, cache, `ctxStamp` |
| 8 Font size per block | block | small | free | free | free | — |
| 9 Numbering style | paper | new | new | new | new | key, CSV, import, `questionRangeText` |

### 4.1 Option layout everywhere (recommended first)

**Today.** `McqQuestion.optionLayout` is `stacked`, `inline` or `columns2`, set only in the sidebar
MC panel, one question at a time (`src/components/editor/McqEditorPanel.tsx`: Option layout 選項排列
with Stacked 直列 / Inline 橫列 / 2 columns 兩欄). A **Fit to content** 配合內容 button appears when
it would change something (`suggestOptionLayout` in `src/registry/mcq.ts`: one row if the longest
option is ≤ 24 characters, two columns if ≤ 40, else stacked). Nothing writes a layout unprompted:
absent means stacked. There is no paper default and no "apply to all", and the format bar cannot
reach it (it is withheld on inline and 2-column rows). In a 20-question paper that is 20 trips to
the sidebar. The teacher's three phrases map to the stored values: 1 column = `stacked`, 4 in a
row = `inline`, 2×2 = `columns2` (two per row by tab stops; a real table only for figure options).

**Real papers.** See § 3: the real paper stacks text; school papers mix per question, and the
mock's own rule (one row when every option is ≤ 21 characters, stacked when one is ≥ 43) is close
to the app's 24 / 40.

**Proposal.**
- **(a) Bulk, in Setup (S).** Under Text size / Justify text: *Option layout for all MC questions*
  with **Fit each question** (applies `suggestOptionLayout` to every MC, measured in the language
  mode on screen as the Fit button does today), **All stacked**, **All in a row**, **All 2
  columns**. It writes each question's existing `optionLayout`, so no new field,
  no schema, no change to any backend; one undo step; the hint says how many questions change
  ("19 of 20"). Figure-option questions keep stacked / 2 columns (`resolveOptionLayout` already
  forbids inline for them). A row that cannot hold its text still falls back to two columns and
  then a grid at print time (`printedOptionLayout`; the stored value is never rewritten), so
  "All in a row" on long options will not print as a row; the hint says so.
- **(b) On the page (M, after a).** A layout control beside Justify. Because the format bar is
  withheld on rows, it needs its own anchor on the question; that is a UX decision, so it waits.
- **(c) A paper default field** (`Worksheet.optionLayout`) is not needed once (a) exists and would
  cost `KNOWN_KEYS` + cache + `ctxStamp`. Not proposed.

Draft labels (to confirm against `docs/design/ui-language.md`): 全部 MC 題的選項排列 · 配合各題內容
· 全部直列 · 全部橫列 · 全部兩欄.

### 4.2 Space between questions on every paper

**Built 2026-10-23: § 9.2.** What follows is the proposal as it was approved.

**Today.** Two controls exist and both are Paper 1 only. `Worksheet.examGapLines` (Setup → Page →
**Between questions** 題目之間: Default (3) or 1–6 blank lines) and `QuestionBase.gapBefore` (the MC
panel's **Space above** 上方空位: 1–9, or a drag handle on the page). `boundaryGapLines` in
`src/render/worksheet.ts` returns one blank line on any other shape, and the wide gap applies only
between two questions of the same type. On a classroom worksheet or a booklet the only tool is a
"Blank space" element (height in pt) dropped between questions by hand. The gap is whole lines of
the fixed 12 pt grid.

**Real papers.** Real Paper 1: 35–84 pt before a question (median 60; 17 of 26 between 55 and
66 pt). Mock: 25 pt (one blank line). DBS: 36 pt (two). A Paper 1 mock has the control; a
classroom worksheet does not.

**Proposal (M).** Show **Between questions** for every paper shape and let `boundaryGapLines`
honour it there; add **Space above** to the structured-question panel. Keep whole lines, 1–6, so
nothing depends on line spacing. The default on classroom and booklet shapes stays one line, so no
saved paper moves. Backends need nothing: the gap is stamped on the next question's first
paragraph (`withLeadingGap` in `src/render/ir.ts`), the `.docx` writes `w:before`, the clipboard
writes a margin, and it disappears at the top of a page (`withoutBoundaryGap` in
`src/export/docx/pageBreaks.ts`). The effort is the rule change and its tests
(`src/render/gaps.test.ts`, `src/model/paper1.test.ts`, `src/export/docx/docx.test.ts`).

A paragraph-level **Space after** in points (`TextFormat.spaceAfter`) already prints in all three
backends but no control sets it. Real papers keep the gap *inside* a question fixed (stem to first
option is one blank line in all three papers), so it is not proposed; it would be an S–M control
on the format bar if a teacher asks (Appendix B has the one trap).

### 4.3 Keep a question together, or start it on a new page

**Built 2026-10-23: § 9.3**, with two differences from this proposal (both are in § 9.3): neither
choice is built as the `pageBreak` node or a keep chain in the IR, but as a mark the paginator acts on.
What follows is the proposal as it was approved.

**Today.** An MC question is always kept whole (`keepWhole` on the MC type in `src/registry/mcq.ts`;
a Paper 1 mock keeps every question whole). A structured question on a classroom worksheet or
booklet splits wherever the packer finds a break (`keepQuestionWhole` in `src/render/worksheet.ts`
chains the nodes; `src/components/preview/pagination.ts` packs). A **New page** 新頁面 element forces
a break (`src/components/editor/AddRail.tsx`). The `.docx` carries no keep flags, by the user's
decision in 0.8.4 (no black ¶ squares): it breaks where the preview breaks, with plain page breaks
(`src/export/docx/pageBreaks.ts`, `src/components/preview/measurePageStarts.tsx`).

**Real papers.** No MC question splits in any paper (4–10 cm is left blank instead). Real Paper 2
starts most questions on a new page; the mock's Q10 and its Source A box split across three
pages, which is what a teacher wants to prevent.

**Proposal (S–M).** A per-question **Keep this question on one page** 此題保持在同一頁 for
structured questions (default off, so nothing moves), read where `keepWhole` is decided; a
per-question **Start on a new page** 此題由新頁開始 that emits the same `pageBreak` node the New page
element does; and, if wanted, a paper-wide **Start every question on a new page** for LQ papers.
Because the `.docx` follows the preview's measured breaks, there is no Word code at all, and the
rule that the file never carries `w:keepNext` is untouched. A question taller than a sheet still
cannot be kept (the chain is cut, as today); the hint says so. No MC opt-out is proposed: no real
paper splits an MC question. (GitHub #4's half-empty page 2 was a manual New page break, not
keep-whole: § 7.)

### 4.4 Justify: what is left

**Table cells built 2026-10-23: § 9.4** (T≡ in the Table tools bar; the paper-wide switch still skips tables, § 6 decision 8). What follows is the proposal as it was written; a question-level `partsAlign` is still not built.

Per-paragraph Justify covers stems, parts, sub-parts and text elements; per-question Justify covers
options and statements; **Justify text** stamps stems, statements, options, parts, sub-parts and
body text, inside source panels too (`withJustifiedBody`), and skips rows, grids, tables, titles,
marks, answers, schemes and the cover. What a teacher can still not do: justify **table cell text**
(`CellAlign` is left / centre / right; the 2019 paper's table paragraphs are 133 left, 77 centred,
28 justified), justify **a whole structured question** without the paper switch (only paragraph by
paragraph), and format a **source label or footnote** as a whole (the bar appears, the edit does
nothing; Appendix B). Small and additive: a `justify` value for cell text with `w:jc both` and
`text-align`, and a question-level `partsAlign` like `optionAlign` (S each). Do them when asked
again, not before.

### 4.5 Line spacing

**Today.** No setting. One fixed 12 pt **exact** line is the rhythm of the whole app, copied from
the reference paper (`w:line="240" w:lineRule="exact"`), and it is restated in the `.docx` styles
and `exactLineFor` (`src/export/docx/styles.ts`), `formatParagraphProps`, the IR's blank line
(`src/render/ir.ts`), band rows (`src/model/page.ts`), `.paper { line-height: 12pt }`
(`src/app/globals.css`), `formatStyle`, the card and bank CSS, the ruled and dotted answer lines
and the table minimum row height. The paginator measures the DOM, so only a few pixel constants
are hard-coded. Setup → Text size says the line stays the same.

**Real papers.** Every reference is ≈ single: 11.5 pt on 10 pt, 12.6 on 11, 12.0 on 11, exact 12
on 10. No paper uses 1.5.

**The one real problem.** Text size 12 puts 12 pt text on the 12 pt line (ratio 1.00), tighter than
any reference. A paragraph set to 12 pt in the format bar gets 13.1 pt (`exactLineFor`), and the
start cards and bank preview already use `max(12pt, 12em/11)` (13.1 pt at 12 pt), so the page and
the `.docx` (12 pt, pinned by `src/model/fonts.test.ts`) disagree with the thumbnails. This is read
from the code, not seen on screen.

**Options.** (i) Leave it. (ii) A narrow fix: 12 pt text gets a 13 pt line, in the twelve places
above (M); it makes every line of a saved 12 pt paper about 9 % taller, so those papers
re-paginate. (iii) A paper-wide **Line spacing**
Standard / Relaxed (L): a `Worksheet` field + `KNOWN_KEYS` + cache + `ctxStamp` + the sites, and the
tests that pin the line (`src/export/docx/docx.test.ts`, `src/model/fonts.test.ts`,
`src/components/preview/tableGeometry.test.ts`, `src/components/preview/pagination.test.ts`,
`src/render/answerGraph.test.ts`, plus the `lq-verify` and `cover-verify` scripts). The line must
stay `exact` in twips: "auto" or a multiple follows font metrics and would desync the measured
hard page breaks. **Recommendation:** do not build (iii); ask the reporter whether 12 pt feels
tight; decide (ii) after that.

### 4.6 Answer lines

**Today.** `answerSpace` is a count of dotted lines on a part, sub-part or leaf question
(`src/components/editor/StructuredEditorPanel.tsx`: Answer lines 答題線), the flow has dotted
"answer space" and ruled "answer lines" elements, and the paginator fills the rest of a page. Paper 1
hides them, `omitAnswerSpace` drops them from an export. Lines are always the full text width;
there is no control over length, style or colour, and no paper default (the new-paper wizard seeds
5 and 8).

**Real papers.** Dotted, full width (16.4 cm), 23.5 pt pitch, one block per question after the last
part, 9–86 lines per question, 1.4–4.8 per mark, apparently driven by page fill. School papers
have none. The look is one fixed convention, so length and style switches add little. What a
teacher may want is a **lines per mark** helper (S–M). A new look would need an IR field, three
backends, the card CSS, the `LQ_LINE_*` constants and a conditional `styles.xml` (the byte-identical
rule). `docs/IDEAS.md` B6 (fill-in-blank frames) is a different feature.

### 4.7 Indent of the (1)(2)(3) statements

**Today.** Derived from the paper shape (`ListIndentScheme`, `listIndentScheme` in
`src/model/numbering.ts`): classroom statement 720 / hanging 360, option 1080 / 360; the Paper 1
scheme (`PAPER1_LIST_INDENTS`) 960 / 480 and 1423 / 459. `TextFormat` has no indent, and some
indents are hard-coded (`OPTION_INDENT` in `src/registry/mcq.ts`, the clipboard's CSS).
**Real papers:** the Paper 1 scheme equals the measured real grid (label +480 tw, text +960,
option text ≈ +1440), the mock's positions are accidental, DBS differs. The app deliberately fixes
this ("measured against this column"); a setting would be a `Worksheet` key feeding
`listIndentScheme`, the cache, `ctxStamp` and a clipboard fix (M). Skip unless asked.

### 4.8 Font size per block

**Today.** Text size 10 / 11 / 12 for the paper, and Font size 9–40 on the format bar for titles,
text elements, stems, parts, sub-parts, band fields, cover lines and table cells (Justify only on
options and statements). Sizing options alone is impossible; nobody has asked. Real papers are
10 pt throughout (9 pt in some tables). #1's "one-click question font size" is Text size.
Skip.

### 4.9 Question numbering style

**Today.** Numbers are derived integers; every label is a literal ("1.", "(a)", "(i)", "(1)",
"A."), and Word's `numFmt` / `lvlText` are in `src/export/docx/numbering.ts`.
`CoverPage.instructionMarker` is the precedent for storing a style while deriving the number. A new
style touches the label helpers, the Word list levels, the preview markers, the clipboard's question
number, the answer key's literals, the hanging indent (a longer marker must fit), the CSV, the
question-range text and the import's label reader, and `optionLabel(...).replace('.','')` would leak
"(A)" into the key. Every paper uses one convention (DBS mixes "a)" and "(a)", which is a slip).
L; skip.

**Later, not now:** a **Paper look** preset (HKEAA style / school style) that sets text size,
justify, between-question gap and indent together. Real and school papers differ in exactly that
bundle, so it is how these switches would finally be offered, but it needs two or three of them to
exist first.

## 5. Ranking and recommendation

Ranked on four things, in this order: evidence of need (an issue, or papers that differ), how much
of the engine already exists, the risk to saved papers and Word fidelity, and effort.

1. **Option layout everywhere.** The strongest evidence (school papers choose per question, the
   reporter's paper is MC), the engine is finished, no backend changes, and the bulk action touches
   no stored format. Cheapest win.
2. **Space between questions.** Every paper has a gap and papers differ; the engine and both
   controls exist but are fenced to one paper shape. The work is lifting the fence safely.
3. **Keep together / new page.** Real papers settle it in both directions; costs only the
   paginator because the `.docx` follows measured breaks.
4. Justify: what is left. Small, wait for a request.
5. Line spacing. No reference supports a looser setting; the 12 pt case is a decision, not a
   feature (§ 4.5).
6–9. Answer lines, indent, font size per block, numbering style: the papers show one convention,
   so a switch adds a control nobody needs.

**Why not line spacing first:** it is the largest job (about twelve sites, five pinned test files,
Word exactness) and the only support is one ratio at one text size.

## 6. Decisions

**Answered by the user, 2026-10-23: "go with the recommendation"** (every recommendation below).
Each item shows the question as it was asked, then what it fixes.

1. **Order.** Build 1 → 2 → 3, each on its own branch? **Decided: yes.** One `feature/` branch
   cut from `develop` per setting, one session each, merged to `develop` and pushed once its tests,
   build and samples pass, then stop and report. Never `main`, a release or a tag.
2. **Option layout.** The bulk action overwrites layouts a teacher already chose, with a count and
   one undo. Include **Fit each question**? The on-page control (§ 4.1 b) in the same round, or
   later? **Decided: overwrite, with the count and one undo; include Fit each question; the
   on-page control later.** Build 1.
3. **Between questions.** Open it on every shape, same-type rule as Paper 1, whole lines 1–6, default
   one line on classroom and booklet shapes so saved papers do not move? **Decided: yes.** Build 2.
4. **Keep together.** Per question first, off by default? Add the paper-wide "start every question
   on a new page" for LQ papers now, or wait? **Decided: per question first, off by default; the
   paper-wide switch waits.** Build 3. **Then built as k-0189, on the user's word (2026-10-23): § 9.5.**
5. **Line spacing.** Hold until the reporter says whether 12 pt feels tight? **Decided: hold.**
   **Closed 2026-10-23, on the user's word: no change, 12 pt stays; nothing to build.** Neither a 13 pt line at
   12 pt nor a paper-wide setting is wanted, so no saved paper re-paginates.
6. **Word.** Someone has to open one `.docx` from `npm run samples` in real Word after each build;
   an agent cannot, and `docs/STATUS.md` lists the recent builds as untried there. **Open, after
   every build:** each build's report names the files to open.
7. **Wording.** The draft 中文 labels in § 4 (they follow `docs/design/ui-language.md`).
   **Decided: as written.**
8. **Does "Justify text" reach table cells? Decided 2026-10-23 (k-0188): no; a cell is justified one by one or by range.**
   Evidence: (a) the 2019 Paper 2 `.docx` (read-only census, tables parsed from `word/document.xml`,
   styles resolved): its body is justified where it is long (73 of 78 body paragraphs of 60+ characters), but only
   18 of 224 table-cell paragraphs are (77 centred, 129 left); of the 17 cell paragraphs of 35+ characters, 5 are
   justified, 5 centred, 7 left, and the longest prose cells (154 to 892 characters, the quoted
   sources) are flush left; 13 of the 16 justified text cells hold one line, where justifying changes nothing
   visible. DBS: body 0 of 131 justified, 5 of 63 cell paragraphs, all one line. (The doc's earlier "28 of 238"
   counted slightly more paragraphs; the proportions agree.) (b) The product has told teachers since 0.8.2 that
   Justify text leaves tables alone (Setup hint, changelog); reaching them would re-typeset every saved
   paper that has the switch on and a wrapping cell, against "a saved paper prints as before". (c) Narrow cells
   justify badly (wide gaps), and numbers and headings are single lines or centred, so a switch would
   mostly do nothing and sometimes harm. If a teacher asks for it: a separate "Justify table text" switch
   (new `Worksheet` field, `KNOWN_KEYS`, stamped in `tableNodeFor`), off by default. Not built.
9. **Where the control lives. Decided while building:** the Table tools bar's Cell text group (T≡ after T⇤ T↔ T⇥),
   not the format bar. The cell's alignment is one four-way choice stored in `CellAlign`, the format bar
   hides its align group for a cell on purpose (`SYSTEM_ARCHITECTURE.md` § The contextual toolbar row), and
   the Table tools bar already acts on a swept range, so a whole column is one click.

**Confirmed by the user, 2026-10-23, after opening the samples of #2 (space between questions), #3 (keep together / new page)
and table Justify: all good, including decisions 8 and 9 above** (T≡ stays in the Table tools bar; "Justify text" skips tables).

## 7. GitHub #4 is not a setting

It was the only open issue, and a bug. Another session fixed it while this proposal was being
written (`523ad87b`, merged on `develop` as `bbb0494e`; unreleased, and the issue is not yet
answered, `docs/STATUS.md`), so nothing was changed here. What the screenshots show: the 內容
outline lists Q5 alone under 第 2 頁 and Q6–Q8 under 第 3 頁, and the page view shows page 2
holding Q5 and Q6 with most of the sheet blank and Q7 starting page 3, which is a paper whose
pages end in a manual New page break. Per that commit: a layout element is filed under the
question before it (`resolveFlow`), the outline's Move up/down reordered `questions` only, so the
break travelled with its question, and outline rows took every drop *before* themselves, so
nothing could follow the last question of a page. Move up/down now goes through the resolved flow
and rows drop on the half the pointer is over. A read of `src/components/editor/Outline.tsx` made
before that commit found the drop half of this and missed the break half, which is why the
half-empty page is not evidence about keep-whole (§ 4.3).

## 8. Verifying a build

Each branch follows `AGENTS.md`: `npm test`, `npm run typecheck`, `npm run lint` at the baseline,
screenshots with `scripts/shot.mjs` in English and 中文, `npm run samples` and a look at the
`.docx`, and `scripts/cover-verify.mjs` / `scripts/lq-verify.mjs` for anything that moves a gap. A
changelog line with its 繁體中文, and every new string in a `messages.ts` catalogue. A new question
field is classified in `src/library/contentKeyFields.test.ts`; a new `Worksheet` field goes in
`KNOWN_KEYS` and `src/model/model.test.ts`. `src/model/backwardCompat.test.ts` must stay green
without touching `src/test/corpus/v1-published.json`.

## 9. Build log

### 9.1 Option layout for all MC questions (built 2026-10-23, `feature/option-layout-all`)

**What a teacher sees.** Document setup → Worksheet tab, under Text size and Justify text: *Option
layout for all MC questions* 全部 MC 題的選項排列, a line saying how the paper stands ("Now: 2
stacked · 1 in a row · 1 in two columns"), and four buttons: Fit each question 配合各題內容, All
stacked 全部直列, All in a row 全部橫列, All 2 columns 全部兩欄. A click changes every MC question in
one history step and raises a notice, "Changed 3 of 4 MC questions.", with an Undo that undoes only
that click (a later edit, or ⌘Z, retires it; it fades after ten seconds, ⌘Z stays). Nothing to
change says so and records no history. The block is absent on a paper with no MC question and its
buttons are off on a read-only paper.

**How.** No new field: each choice writes the question's own `optionLayout`, the one its panel
writes, so the page, the thumbnails, the `.docx` and Copy for Word follow through the IR with no
code of their own (`src/registry/mcqLayouts.ts`; the block `OptionLayoutField.tsx`; the click
`optionLayoutAction.ts`). No schema change, no `KNOWN_KEYS`, no cache or `ctxStamp`. The stale
comments on `optionLayout` (Appendix B) are corrected.

**Decided while building** (what the proposal left open):
- **Stacked is stored as nothing**, like Text size 11. Putting a paper back to "all stacked" hands
  back questions identical to ones never touched, `contentKey` included (absent and `stacked` hash
  differently). A question already stacked is not "changed": a `stacked` its panel wrote stays, and
  is not counted.
- **A figure question is skipped by All in a row**, not given an `inline` that would reappear on
  the day its figures are removed; the notice says "Left as they are: 1 figure question". All 2
  columns and Fit each question do take it (a 2×2 grid of figures).
- **The count is what changed in the stored layouts**, so a question set in a row whose options are
  too long (it prints in 2 columns anyway) counts when it becomes "2 columns", though the page does
  not move. The panel's own note says why a question prints differently from its setting.
- **The count comes after the click, not before.** The proposal said the hint would say how many
  change; four buttons would need four counts, and the line "Now: …" plus the notice and its Undo
  say the same thing at the moment it matters.
- **Fit each question measures in the language the page is showing**, as the panel's Fit button
  does; bilingual takes the wider side. A teacher who fits in 中文 and prints English gets rows the
  English may not fit; the print falls back (below), and the panel says so.
- **All in a row is a request, not a promise.** Options too long for one line still print in 2
  columns and then in a grid (`printedOptionLayout`), and a bilingual paper prints a row as a grid
  (two languages cannot share one tab-stop line). The stored value stays `inline`. The hint says
  "still print in 2 columns"; the panel's note is exact per question.
- **A bulk change is a content edit for `contentKey`**, as the per-question control already is
  (`optionLayout` is classified `content` in `src/library/contentKeyFields.test.ts`), so the bank
  sees every changed MC question as edited.

**Verified.** Unit tests for the rules, all five surfaces (bulk = by hand; page, card, bank
preview, `.docx` tab stops and tables, clipboard) and the click on the real store
(`src/registry/mcqLayouts.test.ts`, `mcqLayoutsSurfaces.test.tsx`,
`src/components/editor/optionLayoutAction.test.ts`, `OptionLayoutField.test.tsx`,
`mcqPanelOptionLayout.test.tsx`). `scripts/option-layout-verify.mjs` drives the real dialog in
Chrome in English and 中文 on `test-fixtures/manual/option-layout-mix.json`: the four buttons,
the line, the notice and Undo, ⌘Z and Redo, what the page and the page rail draw, and a second
click saying there is nothing to change. The five `option-layout/` samples from `npm run samples`
were rendered by LibreOffice and match the page. **Not tried in real Word, on an iPad, or in the
desktop app.**

### 9.2 Space between questions on every paper shape (built 2026-10-23, `feature/question-gap-all`)

**What a teacher sees.** Document setup → Page tab → *Between questions* 題目之間 is on every paper:
a classroom worksheet, an LQ worksheet, a booklet and a Paper 1. "Default: 1 line" (預設：1 行) off the
exam paper, "Default: 3 lines (the reference paper)" on it, then 1 to 6 lines. In a question's panel,
*Space above* 上方空位 (the paper default, then 1 to 9 lines) is now there for MC and structured questions
alike, under the stem on a structured one. The small handle in the page's right margin drags the same
number. A number counts straight under a question of the same type; when the teacher sets one it cannot
use (the first item, a heading or note above, a question of another kind above) a line under the control
says so. The page, the thumbnails, the `.docx` and Copy for Word follow through the IR.

**How.** No new field, no schema change, nothing in `KNOWN_KEYS`: the rule that was fenced to a Paper 1
is lifted, and the two numbers (`Worksheet.examGapLines`, `QuestionBase.gapBefore`) were already stored,
cached (`gap` is in `questionRenderCache`'s key) and carried by the IR (`withLeadingGap`). The functions
moved out of `render/worksheet.ts` into `src/render/questionGap.ts` so the walker and the controls read
one source (`boundaryGapLines`, `stimulusGapLines`, `gapNumberApplies`, `defaultGapLines`,
`gapAboveStatus`); the controls are `BetweenQuestionsField.tsx` and `SpaceAboveField.tsx`. What stays the
exam paper's is the *default* (`typeGapLines`: the type's measured number on a Paper 1 only), so a paper
nobody set a number on prints as it did.

**Decided while building** (what the proposal left open):
- **The lead-in above a source takes the document's number on every shape**, as it does on a Paper 1
  (`stimulusGapLines`): it opens a new question group, and with Between questions at 4 it would read as a
  caption of the question above it. Only the *document's* number reaches it; a question's own `gapBefore`
  belongs to questions, and the two-line stand-off under a lead-in stays the reference paper's.
- **A mixed worksheet skips the boundaries between kinds.** Decision 3 said "same-type rule as Paper 1", so
  an MC under a structured question (or the reverse) keeps one line whatever Setup says. The Setup hint and
  the panel's note say so; if a teacher would rather it apply to any two questions, it is one line in
  `gapNumberApplies`.
- **Setup offers 1–6, a question 1–9**, as the Paper 1 control always did; the drag handle stops at 9.
- **"Paper default" is stored as absence**, never a 0 or the default's current value
  (`spaceAbovePatch`), so a question keeps following Setup and the shape.
- **The gap always rides on the question's numbered paragraph**, even when the stem opens with a table or a
  figure, so it dies at a sheet top like any other. (I had expected a spacer fallback there; the number is
  its own paragraph ahead of every stem block.)
- **A leftover number counts.** A paper that stopped being a Paper 1 (cover removed), or a question copied
  in from one, still carries its `examGapLines` / `gapBefore`; with the controls everywhere it is now
  honoured and visible. None of the frozen corpora or fixtures carries one off a Paper 1 (the real 2021
  Paper 1 does, and is unchanged), so no paper the app saved without setting one moves.
- **The structured panel's field sits under the stem**, in its own ruled row, as the MC panel's sits under
  its stem; both are one component (`SpaceAboveField`).

**Verified.** `src/render/questionGap.test.ts` freezes the 0.8.4 rule beside the new one and compares every
shape against every neighbour (a paper with no number must equal it; a Paper 1 must equal it with any number;
off a Paper 1 a number is read only straight under a like question), plus the rule shape by shape and the
frozen corpora; `questionGapSurfaces.test.tsx` draws three lines on the page, the card, both clipboards and
the `.docx` for a classroom MC paper, a classroom structured paper and a booklet, in three languages, and
checks the sheet-top case; the field, the Setup row, both panels and the store actions have their own tests.
Mutation-checked: re-adding the fence, dropping the same-type check and re-fencing the lead-in each fail
tests. **Saved papers do not move**, three ways: 22 fixtures (the frozen corpora, the hand-testing papers, the
real 2021 Paper 1, the wizard's four shapes; 6 modes each, 936 items) hashed before and after, no node or gap
differs (only the non-printing `adjustableGap` gains a value where a number can now apply); the 32 existing
samples exported through the real Export dialog on the old and the new build compare equal part by part, 26
byte-identical and 6 (versions B and C, and the answer keys) differing only by the shuffle's random ids, which
the old build also does against itself, with the same XML structure; and every frozen corpus paper renders
with one line between questions. `scripts/question-gap-verify.mjs` drives the real app in Chrome in English
and 中文 on `test-fixtures/manual/question-gap-mix.json`: the Setup row, the panel field, the notes, a real
pointer drag of the handle, ⌘Z, the page rail, the gap shedding at a page break, and the `.docx` the Export
dialog writes (62 checks). `npm run samples` writes five `question-gap/` files and the four English ones were
rendered by LibreOffice and match the page. **Not tried in real Word, on an iPad, or in the desktop app.**
In Word, open `question-gap/gap-3-lines-en.docx` (beside `gap-default-1-line-en.docx`, the control) and
`gap-booklet-3-lines-en.docx`; `gap-own-numbers-en.docx` shows per-question numbers. Look for three lines
between MC questions 2–10 and between the two structured questions that follow; one line above Q11 (an MC is
above it) and Q13 (a note is above it); no white space at the top of page 2; in the booklet, three lines
between the three questions and nothing stranded at the top of a page.

### 9.3 Keep a question together, or start it on a new page (built 2026-10-23, `feature/keep-together`)

**What a teacher sees.** In the sidebar panel of a question, under Space above: **Start on a new page** 此題由新頁開始 on
every kind of question (MC and structured), and **Keep this question on one page** 此題保持在同一頁 on a structured question
(with a line saying what it does and that one taller than a page is still split). An MC is always kept whole and so is every
question of a Paper 1, so the MC panel has no Keep choice and a structured question on a Paper 1 says "A Paper 1 keeps every
question on one page." Ticking Start on a new page begins the question at the top of a page: the page above ends there, and the
heading, lead-in or source directly above it travels with it (so a page never begins under a stranded heading). Ticking Keep
moves the question whole to the next page when it does not fit what is left. The page, the page rail, the Content list, the
`.docx` and the start screen's card all follow. Nothing changes in a paper until a box is ticked.

**How.** Two optional question fields, `keepOnOnePage` and `startOnNewPage` (`true` or absent, never `false`), no schema
change (question fields are not in `KNOWN_KEYS`), `contentKey` metadata (ticking one never makes a new version of a bank question).
`src/render/pageFlow.ts` holds the rules (`sheetStart`, `sheetOpeners`, `startsPageStatus`, `isKeptWhole`), `PageFlowFields.tsx`
the control, `flowFlags.ts` the glue to the paginator. The walker stamps `startsPage` (on the item that opens the sheet) and
`keptTogether` on the IR; `PackItem.startsSheet` opens a sheet at an item that holds something above it, and `breakAfter: []`
leaves a kept question no legal boundary (its node boundaries are still measured, so one taller than a sheet is cut where the
sheet ends, as before).

**Decided while building** (what the proposal left open, or got differently):
- **A mark, not the `pageBreak` node.** The proposal had Start on a new page emit the same `pageBreak` node the New page element
  does. A break node inside a question's nodes is invisible to the paginator (a manual break is its own zero-height flow item), and
  a synthetic break item would carry an id the page rail, the Content list and drag/drop cannot address (Remove page break would
  do nothing). Marked instead, the sheet it opens is nobody's break, so the `.docx`'s own measured page start does the work, at the
  end of the paragraph before (no spent line, no blank page) with the item's gap dropped: no Word code at all.
- **Keep is a mark too, not a keep chain.** `keepQuestionWhole` chains the nodes, but not across an answer space, which is one node
  per line (`pageNodes`) that breaks anywhere; a structured question with answer lines would only have been kept in pieces.
- **What travels with the question:** the heading, lead-in (a Paper 1's "There are 45 questions…") or source above it, and a
  rubric between a heading and its question; a closing line such as "END OF SECTION A" stays on the page it ends. A request for a
  page is a break, not a squeeze: the question above is not pulled along, though its last part is held against the next stem.
- **The first question never opens a sheet,** and one straight under a New page element does not open a second; the panel says so
  under the box. The masthead above the first question is not a reason to push it to page 2 (a title page is a New page element).
- **No air above what opens a sheet,** by construction: the walker stamps no gap on it (it would die at the sheet top; Copy for
  Word, with no pages, would have kept it), hides the drag handle, and Space above says "This question starts a new page, so no
  space is left above it" if a number is set.
- **The ask to start a page stays behind when a question is copied into another document** (`copyQuestion`: bank, "add to
  bank", insert from the bank); the ask to be kept on one page, about the question's own size, travels. A leftover `gapBefore`
  travels as before.
- **Copy for Word:** the per-question copy carries no break. The whole-paper clipboard HTML is used in the product only by the start
  screen's card, which now ends its first page at the break; both are tested.
- **The paper-wide "start every question on a new page" waits** (§ 6 decision 4).

**Verified.** Unit tests for the rules and the IR marks (`pageFlow.test.ts`), the paginator (`pagination.test.ts`: opens a sheet,
never a blank one, never twice, never a continuation, brings the heading, does not pull the question above; kept moves whole and
is still cut when taller than a sheet), every surface (`pageFlowSurfaces.test.tsx`: the packer's starts into the `.docx` with the
break at the end of the paragraph before and no gap, Copy for Word, the card, the bank preview; three languages; a classroom MC
paper, a structured one and a booklet), the control, both panels, the store and `copyQuestion`. Mutation-checked: 15 mutants killed
by the unit tests and two more by the Chrome harness (the preview's wiring); one mutant is equivalent (the `!piece` guard in the
packer is redundant with the queue order). `scripts/page-flow-verify.mjs` drives the real app in Chrome in English and 中文 on
`test-fixtures/manual/page-flow-mix.json`: both checkboxes (real clicks), the sheets the preview packs, the page rail's cards,
the heading going with its question, the notes, Undo and Redo, the start screen's card, a reload, and the `.docx` the Export dialog
writes. **Saved papers do not move**, three ways: 14 papers (the four frozen corpora, the acceptance paper, the hand-testing papers
and the wizard's four shapes; 6 modes each, 84 renderings) hash the same before and after; nine saved papers (the corpora and the
hand-testing papers) pack the same sheets in real Chrome on the old and the new build; and the 37 existing samples exported through
the real Export dialog on both builds compare equal part by part, 31 byte-identical apart from the file's own timestamp and 6
(versions B and C, and the answer keys) differing only by the version shuffle's random ids, which the old build also does against
itself. `npm run samples` writes seven `page-flow/` files, rendered by LibreOffice: its pages match the editor's. **Found:** a sheet
that holds only the tail of a split question had no group in the Content list (Page 1, then Page 3; the old build does the same with
a New page element after it). This first said "the page rail"; the rail does show its card (inert: nothing on it to drag or
delete). **Fixed 2026-10-24 (`fix/rail-tail-sheet`):** the group its question ends now reads Pages 1–2 (`groupByPage`,
`lastPageNumber`; `src/components/editor/outline.test.ts`). **Not tried in real Word, on an iPad, or in the desktop app.** In Word, open
`page-flow/page-flow-default-en.docx` (the control: Q3 cut across pages 1–2), then `page-flow-keep-q3-en.docx` (Q3 whole on
page 2, white space at the foot of page 1), `page-flow-new-page-q4-en.docx` (Section B and Question 4 begin page 3),
`page-flow-keep-and-new-page-en.docx` (four pages), `page-flow-booklet-en.docx` and `page-flow-paper1-en.docx` (Question 10
begins page 3 after the cover); no black ¶ squares, no blank pages.

### 9.4 Justify in table cells (built 2026-10-23, `feature/table-justify`, k-0188)

**What a teacher sees.** Click a table cell (or drag across several) and, in the Table tools bar, the Cell text group has a
fourth button, **T≡** Justify cell text 儲存格文字左右對齊, after T⇤ T↔ T⇥. A sentence that wraps in the cell then reaches both
edges (the last line stays flush left; a one-line cell does not move). The four are one choice: T⇤ puts it back. Over a swept
range it acts on every cell in one undo step and reads pressed only when all agree. The page, the page rail, the print PDF,
the `.docx`, Copy for Word, the start card and the bank preview follow. Nothing changes until it is pressed.

**How.** `CellAlign` gains `'justify'` (`src/model/types.ts`); no new field, no schema change, no `KNOWN_KEYS` (a cell's fields
are nested), and `schemaVersion` stays 1. The page (`textAlign: cell.align`) and Copy for Word (`text-align:${cell.align}`) already
wrote the value; the one code change in a backend is `cellParagraph` in `src/export/docx/body.ts`, which wrote the value into
`w:jc` raw and now spells it `both` through `jcValue` (shared with `formatParagraphProps`). The `.docx` sets
`w:doNotExpandShiftReturn` by finding `<w:jc w:val="both"/>`, so a bilingual cell's English line stays ragged in Word as on the page.
The bar: `CELL_ALIGNS` in `ContextBar.tsx`, `alignCellJustify` in `ContextBar.messages.ts`.

**Decided while building:** see § 6 decisions 8 (Justify text does not reach tables) and 9 (where the control lives). Also:
- **A stale `format.align: 'justify'` on a cell (the format bar could store one before 0.8.3) still aligns nothing.** Reading it
  would have re-typeset saved papers; the cell's own `CellAlign` is the only thing read (tested).
- **Word import does not carry cell alignment at all** (found; unchanged): an imported table's cells are all flush left.
- **Older builds.** A build before this one that opens a paper with a justified cell prints it justified on the page but writes
  `w:jc w:val="justify"`, which is not a value of `w:jc`, into its `.docx`. How real Word treats that is **untried**. The schema mark
  cannot help (it only guards v0.4/0.5; 0.6–0.8.5 read v2 as their own), and a separate field would have let such a
  build print the cell flush left instead; the approved design was a `CellAlign` value, so it was kept. Teachers on mixed
  versions are the only ones exposed.

**Verified.** `src/components/preview/cellJustify.test.tsx` (20 tests: the value round-trips and a saved paper is schema 1; set,
replaced and swept; the IR; page, Word (`both`, exactly one `w:jc` changed, never `justify`), Copy for Word, the card; the bar's
four buttons in English and 中文, pressed states over a sweep; "Justify text" leaves cells alone; a stale `format.align` stays
inert). Mutation-checked: writing the value raw into `w:jc`, and dropping the button, each fail 4 tests.
`scripts/table-justify-verify.mjs` drives the real app in Chrome in English and 中文 on
`test-fixtures/manual/table-justify-mix.json`: real clicks on T≡, the right edge of every line measured (ragged before, flush after),
a real drag sweeping a column, one undo for three cells, a one-line cell not moving, a spanning cell, an MC's table, the English line
of a bilingual cell staying ragged, Setup's Justify text leaving tables alone, a reload, the start card, and the `.docx` the Export
dialog writes. **Saved papers do not move:** the 44 existing samples exported through the real Export dialog on `origin/develop` and on this build compare equal part by part, 38 byte-identical apart from the file's own timestamp and 6 (versions B and C, and the answer keys) differing only by the version shuffle's random content, which the base build also does against itself, with the same XML structure. `npm run samples` writes five `table-justify/` files; LibreOffice renders them as the page does (ragged default,
flush justified descriptions). **Not tried in real Word, on an iPad, or in the desktop app.** In Word open
`table-justify/table-justify-default-en.docx` (the control), then `table-justify-policies-en.docx` (the three description cells
justified), `table-justify-all-en.docx`, `table-justify-paper-switch-en.docx` (Justify text on: stems justified, tables as
they were except the chosen cells) and `table-justify-bilingual-teacher.docx` (the English line before each break stays ragged).


### 9.5 Start every question on a new page (built 2026-10-23, `feature/start-every-question-new-page`, k-0189)

**What a teacher sees.** Document setup → Page, under Between questions: a box **Start every question on a new page** 每題由新頁開始
with a hint. Ticked, every question after the first begins a page, and the heading, lead-in or source directly above it goes
with it, exactly as a question's own **Start on a new page** does (§ 9.3). The first question and one straight under a New page
stay where they are. It is off in every saved paper, so none moves. It is not offered on a Paper 1 (forty-five MC on forty-five
pages is never meant), and a stored `true` is ignored there. Every question's own boxes (Keep this question on one page, Start on
a new page, Space above) still work beside it. The page, the rail, the `.docx`, Copy for Word and the start card follow.

**How.** One optional `Worksheet` field, `startEveryQuestionOnNewPage` (`true` or absent), in `KNOWN_KEYS`; no schema change.
Nothing new in the walker or the paginator: `sheetOpeners(flow, every)` in `src/render/pageFlow.ts` counts every question as having
asked, so `sheetStart` (heading travels, first / after-break open nothing), the walker's `startsPage` marks, `PackItem.startsSheet`
and the `.docx`'s measured page starts all do the work already built for #3. `startsEveryQuestion(worksheet)` is the one test
(off on a Paper 1), `withStartEveryQuestionOnNewPage` the one edit (off removes the field), `StartEveryQuestionField.tsx` the control;
`gapAboveStatus` says "starts a page" for Space above under it. A question copied into another paper is unaffected (the switch is the
paper's, not the question's).

**Verified.** `startEveryQuestion.test.ts` (opens at every question but the first, off and stored false do nothing, heading / lead-in /
source go along, New page break and first question open nothing, classroom / LQ / booklet / MC, Paper 1 ignores it, the boxes beside it,
no air above a sheet opener, no key on a paper that has it off), `StartEveryQuestionField.test.tsx` (EN + 中), the model test that
`KNOWN_KEYS` covers the type, the frozen-corpus guards. `scripts/start-every-verify.mjs` (Chrome, EN + 中, real clicks): off on a saved
paper, hint, ticking gives six sheets with Section B's heading on its question's sheet, rail, Undo/Redo one step, the question boxes
beside it, `.docx` with five hard breaks (none a paragraph of its own, no keep flags), reload, start card, off again restores three
sheets. `npm run samples` writes five `start-every-question/` files; LibreOffice: 6 / 6 / 4 / 6 / 4 pages, and the Paper 1 file's
`document.xml` is byte-identical to `page-flow/page-flow-paper1-en.docx`. **Not tried in real Word, on an iPad or in the desktop app.**
In Word open `page-flow/page-flow-default-en.docx` (the control, three pages), `start-every-question/start-every-en.docx` (six pages,
one question each, Section B's heading with Question 4), `start-every-with-question-boxes-en.docx` (the same, with Q3 kept and Q4 asking
for itself) and `start-every-booklet-en.docx`; no black ¶ squares, no blank pages. **Not built:** "except these" opt-outs, or the switch
for an MC-only paper.

## Appendix A — real-paper measurements

Measured by a read-only pass; scratch files were not kept. `NOT CHECKED`: other years' MC papers;
the 2025 Chinese paper's pp. 17–28; the mock's marking-scheme scan; table text size in the Paper 1
scan; header and footer XML beyond three of the 2019 footers.

- **MC options.** Real Paper 1 (45): 44 stacked, 1 two-by-two (Q36, diagram options, the letter on
  its own line above each figure). Mock Paper I (45): about 20 / 4 (Q4, 22, 28, 32) / about 21.
  The same 16–21-character combination options are one-row ×16 but two-by-two ×2 (Q4, Q22); Q28
  (44 characters) is two-by-two while Q17 (43) is stacked. DBS Part A (19): 17 / 0 / 2 (Q4, Q11,
  built as a 4-cell table); of its 4 combination questions, Q4 and Q11 are one-row and Q1 and Q18
  stacked.
- **Statements.** Real Paper 1: 16 of 45 questions have them (13 with three, 2 with four, Q21 in a
  box). Measured on 17 pages with the number at 0: stem text and the "(1)" label at +0.85 cm (480
  tw); statement text and option letter at +1.70 cm; option text at +2.55 cm (±0.05). Justified
  (Q22's wrapped lines are flush at 18.5 cm); one blank line (11.5 pt) before and after the
  block, none between statements. Mock I: label x takes 9 distinct values (17 pt spread), option
  letter x takes 10; 4 of 16 lack a blank on one side; Q26 uses (I)(II)(III).
- **Line rule.** 2019 `.docx`: no docDefaults spacing or size (10 pt); 908 of 1101 paragraphs carry
  direct spacing; stems, parts and sub-parts are 58 of 58 exact 240; blank separators vary (exact
  200 49 %, auto 29 %, exact 160 6 %); answer lines are auto with 240 before (a 23.5 pt pitch).
  DBS: docDefaults after 160 / line 278 auto, but 296 of 296 paragraphs carry direct spacing, 275
  exact 240. PDFs: real Paper 1 11.5 pt; mock 12.6 pt; DBS 12.0 pt; the 2025 scan stems ≈ 13.3 pt.
- **Alignment.** Real: Paper 2 stems and parts 58 of 58 `w:jc both`; Paper 1 stems, statements
  and options flush right (Q4, 10, 22, 43). 2019 table cells: centred 77, left 133, justified 28.
  DBS: 0 of 134 non-table paragraphs justified. Mock: 9 of 21 wrapped stems flush right.
- **Space (baseline to baseline).** Stem to first option or statement: real 23 pt (one blank line),
  mock 25, DBS 24. Option to option: 11.5 / 12.6 / 12. Question to question: real median 60
  (17 of 26 at 55–66, 6 at 43–55, 2 at 80–84, 1 at 35); mock 25 (29 of 34); DBS 36 (15 of 15).
  Real Paper 2: stem to part and part to part ≈ 22 pt, blank paragraphs hand-sized (6–14 pt), space
  before a question 0 (×4), 6 pt (×7), 9.6 pt (×1) or 10.8 pt (×2).
- **Answer space.** Real: dotted tab-leader lines, 16.4 cm, 23.5 pt pitch (2019) or ≈ 25 pt (2025),
  28–29 lines per full page, one block per question after the last part. Lines per mark: 2019
  1.5–4.8 (median ≈ 3.4: Q1 24/5, Q3 9/3, Q8 20/8, Q9 43/10, Q10 29/13, Q12 86/22); 2025 1.4–3.8.
  Blank axes to draw on: 2019 Q10, Q11. Lines run onto the next page in 4 of 14 questions.
- **Numbering and marks.** Real Paper 1: "1." hanging 480, "A.", "(1)". Paper 2: "1." hanging 600;
  "(a)" at 600 with text at 1200; "(i)" at 1200 with text at 1800; continuous across sections.
  Marks "(n marks)" by a right tab at 9320 tw, plain, "(1 mark)" singular; 2025 uses "(n 分)".
  31 of 39 sit at the end of the part's last line.
- **Pagination.** MC splits: 0 of 45, 0 of 45, 0 of 25. 2019 `.docx`: no `keepNext`, `keepLines`,
  `pageBreakBefore` or page `w:br`; 24 sections = 24 pages.
- **Other.** Stimulus boxed 4 of 45 (Q7, 18, 21, 30), tables 10, figures 12; a shared stimulus for
  Q8–9. Source captions sit above 0.5 pt bordered panels. No shading, no line numbers, one column.
  Key words in capitals and bold (ONE ×9, TWO ×4, NOT ×3). Thousands separator is a non-breaking
  space ("$5 000") in the real papers and a comma in the school ones.

## Appendix B — found while reading

Not fixed here (no code changes in this task); for whoever builds or triages next.

- `docs/STATUS.md` said GitHub #3 was "not merged/pushed" and "not answered"; it merged
  (`207b46b6`), shipped in 0.8.4 and was answered on 2026-10-22. Corrected in this branch.
- The comments on `optionLayout` in `src/model/types.ts` ("Omitted means auto") and on
  `resolveOptionLayout` in `src/registry/mcq.ts` ("the editor calls it when a question is created
  … and writes the result") are stale: absent means stacked, and only the MC panel's Fit button
  calls `suggestOptionLayout`.
- The MC panel's Fit to content hover names a layout by its stored id in English: "These options fit
  better as columns2" (`fitTitle` in `src/components/editor/McqEditorPanel.messages.ts`; the 中文
  is fine). Left alone in § 9.1.
- **Suspected bug:** `isFormattable` lists `sourceLabel` and `sourceFootnote`, so the format bar
  appears for them, but `applyFormatTarget` has no case for either (`default: return worksheet`),
  so an element-wide format (Justify, size) does nothing; selected characters still work. Read
  from the code, not run.
- At Text size 12 the start cards and bank preview set a 13.1 pt line while the page and `.docx`
  set 12 pt (§ 4.5). Read from the code, not seen.
- With characters selected the format bar sends everything through `onFormatRuns`, which drops
  non-run keys (`toRunPatch` in `src/model/text.ts`); a paragraph-level control such as
  `spaceAfter` must be routed around it as `tabStops` is. `TextFormat.spaceBefore` and
  `spaceAfter` print in all three backends but no control sets them.
