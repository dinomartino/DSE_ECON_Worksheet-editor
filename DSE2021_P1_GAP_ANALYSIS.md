# Gap analysis — reproducing DSE 2021 Economics Paper 1

Goal: build a byte-faithful copy of `real_life_reference/DSE2021_Paper 1.pdf` (18 pages,
45 MCQs) in this editor. This records what the editor can already express, what it
cannot, and what each missing piece costs.

Method: all 18 pages read as images (the PDF is a DocuCentre scan with no text layer),
then every observed shape checked against the model — by reading `src/model/types.ts`,
`src/model/diagram.ts` and `src/registry/mcq.ts`, and by rendering probe worksheets
through `renderWorksheet()` to see what actually reaches the IR.

Verified against the code, not assumed. Where a probe settled a question, the result is
noted inline.

---

## Already works (verified by probe)

These looked like gaps and are not. Worth recording, because each is a shape a reader
would expect to be missing.

| Paper shape | Verdict |
|---|---|
| **Q5, Q11, Q12, Q16 — table *before* the stem text** | Works. A non-paragraph first block emits an empty numbered paragraph, then the blocks; the question number lands correctly. Probe: `["spacer","text","table","text",…]`. |
| **Q27 — diagram *is* the whole stem, no text at all** | Works. Probe: `["spacer","text","diagram",…]`, number intact. |
| **Q22, Q24, Q42, Q43, Q45 — merged header cell + empty corner cell** | Works. `colSpan` + `covered` survive to IR. |
| **Q15, Q39 — four statements (1)–(4)** | Works; statements are unbounded. |
| **Q1–Q45 — no per-question marks** | Correct as-is. The paper says "All questions carry equal marks"; MCQ renders no marks trail. |
| **Q3, Q7, Q8 … — inline "(1) and (2) only" options** | Works via `optionLayout: 'inline'`. |
| **Q11 — subscripts in table cells (Q₁, Q₂)** | Works; `vertAlign` is a run property and cells take run formatting. |
| **Q30 — inline CJK inside an English stem (比特幣)** | Works; per-script `w:rFonts` on every run. |
| **Q5, Q12, Q16 — centred tables** | Works via `setTableAlign` → `w:jc`. |
| **Q17, Q28, Q33, Q44 — S/D plots, drop-lines, ticks, shift arrows** | Core diagram vocabulary; templates ship for supply-demand, AD-AS, money-market, tariff. |

---

## Gaps, in the order they block the reproduction

### 1. An MCQ option cannot hold anything but text — blocks Q36

`McqOption` is `{ id: string; text: BiText }`. Q36's four options are **diagrams** laid
out 2×2, each with its own A./B./C./D. label.

Probe: attaching a diagram to an option is silently dropped — the option nodes come back
`["text","text","text","text"]`.

This is the one gap that makes a question **impossible**, not merely awkward. Everything
else on this list has a workaround.

Cost: `McqOption` grows `blocks?: ContentBlock[]`, and the option renderer gains a
non-text path. Note the existing `columns2` layout already puts options in a 2×2 grid —
but `ColumnsNode` cells are text-only, and per §*ColumnsNode is the row primitive* a row
must export as tab stops, which cannot carry four pictures. A diagram-option grid needs
its own export shape, and that decision touches the load-bearing "never a table" rule.

### 2. No inline blank in body text — affects 11+ questions

Q1, 2, 9, 13, 14, 19, 23, 24, 30, 40, 45 all run a fill-in-the-blank stem:
"…can be regarded as ______ because ______."

`fillIn` exists **only as a `BandField`** (masthead/header), with `widthCh`. There is no
body-text equivalent.

Workaround that genuinely works today: type spaces and underline them. `xml:space="preserve"`
is on every run and `__underline__` is a real run flag, so it reaches `.docx` correctly —
this is also exactly how Word does it. So this is a **usability** gap, not a capability
gap: the teacher counts spaces by hand and the width is not stored as intent.

Cost: low if accepted as-is; medium to add a first-class inline blank run.

### 3. Figures cannot be centred — affects every diagram and image

`ImageNode` and `DiagramNode` carry no alignment, and `pictureXml()` emits a `w:pPr` with
spacing and `keepNext` but **no `w:jc`**. Every figure prints flush left.

In the paper, *every* diagram and image is centred or indented — Q4, 17, 23, 27, 28, 30,
33, 36, 38, 39, 44. Tables already solved this (`align` → `w:jc`); pictures did not.

Cost: low. Add `align` to the two IR nodes, emit `w:jc` in `pictureXml`, mirror in the
preview. Keep it unstored when `left`, per the byte-identical rule.

### 4. Diagram text does not break onto a second line

`render/diagram.ts` never calls `runLines()`, so a `\n` in an axis title or curve label
renders as a space (per §*Newline is run text*, every renderer must split it).

Needed by Q33 ("Nominal / interest rate" as a stacked y-axis title) and Q39 ("average /
growth rate" as a two-line curve label).

Cost: low, but note `diagramSize()` measures the box from the drawn text — a two-line
title must also grow the reserved room, or it clips.

### 5. No shared stimulus across questions — affects Q8–Q9

Page 4 reads "Study the following diagram and answer Questions 8 and 9", with one pie
chart serving both. The model has no way to say a stimulus belongs to a *range* of
questions.

Workaround: put the figure in Q8's stem and add a layout `text` element above. Prints
identically; only the authoring intent is lost (deleting Q8 orphans Q9's figure).

Cost: medium if modelled properly; zero if the workaround is accepted.

### 6. Boxed insets are only approximable — Q7, 18, 21, 30

The paper boxes a stimulus four times. Borders in this model are deliberately uniform
(§*Tables have no header row* removed per-cell border control), so:

- **Q7, Q18** — a 1-cell / 2-column table. Works.
- **Q21** — "Proposal (1): …" ×3 inside one box with **no inner rules**. Cannot be
  expressed: a 3-row table draws its inner borders.
- **Q30** — a box containing a paragraph **and a centred photo**. `TableCell.text` is
  `BiText`; a cell cannot hold an `ImageBlock`.

Cost: Q21 needs either per-cell border suppression or a "boxed group" block. Q30
additionally needs blocks-in-a-cell — the same shape as gap #1.

### 7. No flow-chart diagram vocabulary — blocks Q23

Q23 is a production chain: labelled **boxes** joined by **labelled arrows** ($200 raw
materials → Local importers → $400 → Local supermarkets → …). The diagram model is a
*plot* — axes, curves, points — and `DiagramArrow` is a shift arrow between curves, not a
connector between nodes. There are no boxes.

Workaround: draw it elsewhere and insert as an `ImageBlock`. That is what the model
already expects for non-plot figures, and it prints correctly.

Cost: high to model properly, and arguably out of scope — §*Geometry in, one image out*
is explicit that the diagram model covers "the DSE vocabulary", not a general drawing
surface.

### 8. No pie chart — Q8/Q9

Same reasoning as #7: not plot vocabulary. Insert as an image.

### 9. Cover-page and running furniture — partly there

- **Page 1** (exam title block, "8.30 am – 9.30 am", numbered INSTRUCTIONS, the boxed
  "Not to be taken away…", the copyright block) — buildable from bands + layout `text`
  elements + a 1-cell table. `firstPage` header/footer already models "page 1 differs".
- **Footer** "2021-DSE-ECON 1–2" + centred page number — works (`pageNumber` field).
- **"Go on to the next page ▷"** on odd pages — the arrow is a graphic, and there is no
  per-page conditional footer (only page-1-vs-rest). Approximate with the text and a
  glyph, or accept it on every page.
- **The diagonal rule** across the top-left of page 1 — decorative; not modelled.

---

## Summary

| # | Gap | Blocks | Status |
|---|---|---|---|
| 1 | Option cannot hold blocks | Q36 | **Done** — `McqOption.blocks` |
| 2 | No inline blank | 11 questions | **Done** — toolbar action |
| 3 | Figures cannot be centred | ~11 questions | **Done** — but see correction below |
| 4 | No line break in diagram text | Q33, Q39 | **Done** — run-aware split |
| 5 | No shared stimulus | Q8–Q9 | Open — workaround prints identically |
| 6 | Boxed insets | Q21, Q30 | **Done** — `borders: 'box'`, `TableCell.image` |
| 7 | No flow-chart shapes | Q23 | Out of scope — insert as an image |
| 8 | No pie chart | Q8 | Out of scope — insert as an image |
| 9 | Per-page footer variants, page-1 decoration | furniture | Open — cosmetic |

### Two corrections to this document's first draft

**#3 was wrong as written.** Figures were *already* centred: `pictureXml()` hardcoded
`<w:jc w:val="center"/>` and the preview hardcoded `text-center`. Since every figure in
the paper is centred, this never blocked the reproduction. What shipped is the *ability
to choose* left/right — `align` on `ImageBlock`/`DiagramBlock`, resolved in the IR,
honoured by all three backends, defaulting to `center` so nothing changes for existing
documents.

**#2 was overstated.** An underlined run already exported correctly, so the blank was
reachable by hand all along. The work was an insert action, not a new representation.

### What is left

The paper is now reproducible end to end. #5 costs authoring intent only (put the
stimulus in Q8's stem and a rubric line above it — it prints identically). #7 and #8 are
deliberate non-goals of a diagram model that covers plot vocabulary, not general
drawing; images are the intended answer. #9 is the "Go on to the next page ▷" arrow,
which has no per-page conditional footer to hang on.
