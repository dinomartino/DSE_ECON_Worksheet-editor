# Gap analysis — reproducing DSE 2019 Economics Paper 2

Goal: work out which parts of `real_life_reference/DSE2019_Paper 2.pdf` (23 pages, 14
structured questions, 259 marks) this editor can already express, and what each missing
piece costs. Companion to [`DSE2021_P1_GAP_ANALYSIS.md`](./DSE2021_P1_GAP_ANALYSIS.md),
which covers the MCQ paper.

Method: unlike the 2021 P1 scan, this reference ships **both** a PDF and the original
`real_life_reference/2019_Question_Paper_2.docx`. So the shapes are read from the OOXML
directly — counted, not eyeballed — and checked against the model by reading
`src/model/types.ts`, `src/registry/structured.ts` and `src/export/docx/styles.ts`, and
by rendering probe worksheets through `renderWorksheet()`. Page images confirm what the
XML means on paper.

Verified against the code, not assumed. Where a probe settled a question, the result is
noted inline.

---

## What kind of paper this is

Paper 2 is a **Question-Answer Book**: candidates write in the booklet, so most of the
document is not question text at all. Counting the top-level paragraphs of
`word/document.xml`:

| Paragraph kind | Count | Share |
|---|---:|---:|
| Dotted answer lines | 446 | **58%** |
| Other empty paragraphs (spacing) | 206 | 27% |
| Content (stems, parts, rubrics, headings) | 113 | 15% |
| **Total** | **765** | |

Plus 13 tables, 14 anchored drawings, 21 header parts and 23 footer parts across 24
Word sections.

**The headline: the single biggest structural element in this paper is answer space, and
it is the element our model expresses least well.** P1 needed diagrams and MCQ options;
P2 needs writing room. That reframes what "supporting P2" means — the question content
is largely a solved problem, the page furniture around it is not.

---

## Already works

These are real shapes in the paper that the editor handles today. Worth recording,
because several look like they would be gaps.

| Paper shape | Verdict |
|---|---|
| **Q1, Q5, Q8 … — stem then (a)/(b) with per-part marks** | The core structured shape. Probe: parts render `[["(a)",2],["(b)",5]]` with marks on the correct leaves. |
| **Q8, Q13, Q14 — three-level `1.` / `(a)` / `(i)`** | Works; levels 0–2 of the shared question definition, one live `w:num` in Word. |
| **Q6, Q7, Q8, Q9, Q10, Q12 — data tables** | Works. Includes `gridSpan` header cells (Q10's "Range of monthly taxable income" spans two columns, Q12 Source B spans three) and ragged final rows (Source B's "Total" row has fewer cells) — `colSpan` + `covered` + `insertColumn` padding short rows. |
| **Q2, Q12 Source C — single-cell boxed stimulus** | Works — `borders: 'box'`. Exactly the case the `'all' \| 'box'` split was built for. |
| **Q12 Source A — a picture inside a boxed frame** | Works via `TableCell.image`. |
| **Q11 Figure 1, Q13 Figure 3 — S/D and MC/D plots with an underlined title above** | Core diagram vocabulary. `Diagram.title` + `titlePlacement: 'above'` is this shape precisely, and it rasterizes into the one PNG. |
| **Q13 — subscripted curve labels (MC₁, D₁, Q₁, P₁)** | Works. `vertAlign` is a run property, reachable from both the toolbar and the canvas's in-place editor. |
| **Q14 Figure 4 — PPF with numeric ticks on both axes** | Works; `DiagramAxis.ticks` with per-tick labels and offsets. |
| **Q11 Figure 2 — empty labelled axes for the candidate to draw in** | Works, and is the *default* state of an inserted diagram: bare labelled axes with nothing on them. |
| **Q4 — inline CJK inside an English stem (接種季節性流感疫苗)** | Works; per-script `w:rFonts` on every run. |
| **Q14 — narrative paragraphs between parts** ("Suppose Country A engages in…") | Works. A `text` layout element sits in the flow between questions; within one question, extra `blocks` on the following part carry it. |
| **Section A / B / C headings with derived totals** | Works. `partHeader` with `showMarks` derives "(44 marks)" from the questions between markers — and stays right when a question is re-marked. |
| **Cover page: masthead, timing line, numbered instructions** | **Built in** — Setup → Cover generates one for either paper style (`src/model/cover.ts`). It reproduces the *structure*; the wording is this project's own placeholder text, never the HKEAA's rubric, and two tests enforce that. The barcode and candidate-number apparatus is deliberately not reproduced: it is theirs, and a school mock identifies candidates by name and class. |

---

## Gaps, in the order they block the reproduction

### 1. Answer lines are the wrong rule, and cannot fill a page — 58% of the paper

Two separate problems, both in the same element.

**The rule is drawn differently.** Ours is a paragraph with a solid grey bottom border
(`AnswerLine` in `src/export/docx/styles.ts`: `border: { color: 'A6A6A6', size: 6 }`) at
a fixed 24pt line. The paper's is a paragraph containing a single right-tab run carrying
`<w:u w:val="dotted"/>` — a **dotted underline over a tab**, spaced `w:before="240"
w:after="240"`:

```xml
<w:p><w:pPr>
  <w:tabs><w:tab w:val="right" w:pos="9300"/></w:tabs>
  <w:spacing w:before="240" w:after="240"/>
  <w:rPr><w:color w:val="000000"/><w:u w:val="dotted"/></w:rPr>
</w:pPr><w:r><w:rPr><w:color w:val="000000"/><w:u w:val="dotted"/></w:rPr><w:tab/></w:r></w:p>
```

The visual difference is plain on page 2: a fine dotted rule, not a solid grey one. This
matters beyond taste — a dotted rule reads as "write here", a solid grey one reads as a
divider.

Note the mechanism sidesteps the collapse problem our style solves with `w:between`:
because the rule is an *underline on a run*, consecutive lines cannot merge, and each
line's own `w:before`/`w:after` sets the writing pitch. It is also the one place in this
paper where paragraph spacing is used at all.

**The count cannot be authored.** `answerLines` takes a fixed `lines: number`. But in a
Question-Answer Book the count is not a number a teacher picks — it is *whatever fills
the rest of the sheet*. Q1's answer space is 28 lines because 28 is what remained after
the stem; Q13's is split across pages 20–21, where page 21 is nothing but 30 lines. To
author this today you would have to count lines by hand, then recount every time a stem
gained a word.

**Cost.** The dotted style is a small change to `styles.ts` plus the matching preview CSS
— but it should be a *choice*, since a school worksheet may still want the solid rule, so
it wants a variant on the element rather than a replacement. Fill-the-page is the larger
piece: it needs `answerLines` to accept a `fill` mode that the paginator resolves against
remaining sheet height, which touches `components/preview/pagination.ts` — the one place
that knows how much room is left. That is genuinely new coupling (today the element's
size is an input to pagination, not an output of it), and it is the single highest-value
thing on this list.

### 2. ~~Sub-parts cannot share one marks label~~ — **fixed**

`QuestionSubPart.marks` is required, and `structured.ts` prints it on every sub-part.
The paper repeatedly gives **one label to a group**: Q13(b)(i) and (b)(ii) share a single
"(5 marks)" printed after (ii); Q8(a)(i) and (a)(ii) share "(5 marks)"; Q12(a) does the
same.

Probe result — sub-parts rendered with `marks: 0` and `marks: 5`:

```
subpart marks: [["(i)",0],["(ii)",5]]
```

So the workaround prints a literal **"(0 marks)"** on (i). There is no way to suppress
it. The paper prints nothing on (i) and "(5 marks)" on (ii).

**Fixed.** `QuestionSubPart.marks` is now optional, and absent is distinct from zero. The
three backends already gated on `marks !== undefined`, so the model change reached the
page, the `.docx` and the clipboard at once. Two things did not fall out for free and are
worth recording:

- **`partMarks` needed a fallback**, not just a looser sum. With no sub-part marked,
  summing returns 0 for a part plainly worth 5 — understating the question, its section
  and the paper. It now falls back to the part's own `marks` in exactly that case; any
  sub-part carrying marks flips it back to summing, so the ordinary case is untouched.
- **"+ Sub-part" used to clear `part.marks`.** That was harmless while sub-parts always
  carried marks, and destructive afterwards: it discarded the very number the shared case
  needs. It now keeps the value.

The panel gained a "Marks for (i)–(ii) together" field (labelled from the real sub-part
labels) and shows `shared` on an unmarked sub-part's pill — interpolating the absent
number rendered a bare `m`, a defect the unit tests could not see and the screenshot
could. Verified end to end: the browser prints one `(5 marks)` on (ii), and an exported
`.docx` is well-formed with the label on the `ilvl=2` (ii) paragraph and no `(0 marks)`
anywhere. Six regression tests in `src/registry/sharedSubPartMarks.test.ts` cover all
three backends, and each was confirmed to fail when the logic is reverted.

### 3. The page frame and rotated margin warnings

Every body page (2–23) is enclosed in a rectangular frame, with "Answers written in the
margins will not be marked." set **rotated 90°** down both margins and repeated
horizontally under the frame. This is not `w:pgBorders` — it is three anchored shapes in
the header:

- one `prstGeom prst="rect"` textbox drawn as the frame,
- two textboxes with `bodyPr vert="vert270"` carrying the rotated warning.

That is why the file has 21 near-identical header parts: each page is its own Word
section, so each needs its own copy.

Our header/footer model is **lists of `Band` rows** — horizontal rows of tab-stopped
fields. It has no vocabulary for a shape anchored to the page, and none for rotated
text. `bandsHeight()` reasons about rows stacking downward from `w:header`; a frame
enclosing the body is a different geometry entirely.

**Cost.** High, and worth being honest about: this is the one item here that does not
fit the existing model rather than merely extending it. A "page frame" would most
naturally be a page-level property (border + optional rotated margin note) resolved in
the IR and emitted as anchored shapes, not a band. It is also the piece a school
worksheet is least likely to want — it exists because HKEAA booklets are scanned and
machine-marked. **Recommend deferring** unless the goal is a literal facsimile.

### 4. No bullet list

Q12(c) lists the three things the essay must cover as a hyphen-bulleted list —
`numId 17` → abstract 4, `numFmt="bullet"`, `lvlText="-"` — nested inside a question
part.

We ship exactly three abstract definitions (questions, MCQ options `A.`, statements
`(1)`). There is no bullet, and `ContentBlock` has no list block, so the only way to
author this today is three paragraphs each starting with a typed hyphen — which loses the
hanging indent, so a wrapped bullet aligns under the hyphen instead of under the text.

**Cost.** Moderate. A fourth abstract definition in `export/docx/numbering.ts` is easy;
the real work is that a bullet list is a new `ContentBlock` kind, which means a renderer
in all three backends plus an editing surface. Lower value than 1 and 2 — it appears
once in this paper — but it generalises well beyond it.

### 5. Graph-paper grid for a drawn answer

Q14's answer space is a **10×10 empty table** (`tbl12`, every row 10 cells) — squared
paper for plotting the PPF answer by hand.

This one is *expressible*: insert a 10×10 table with `borders: 'all'`. But nothing sizes
the cells square, and the table size picker caps at **16×8**, so a 10×10 is reachable
while a finer grid is not. There is no "graph paper" affordance, so a teacher has to
know the trick.

**Cost.** Small if treated as a preset — a table factory that makes an N×M grid with
square cells and light rules — rather than a new block kind.

### 6. Per-page furniture that varies down the document

The footer carries a "Go on to the next page ▷" arrow on continuing pages and drops it on
the last page of each section; page 1's furniture differs from the rest. Our model has
exactly **two** states — running and first page (`firstPageHeaderFooter()`), matching
Word's `w:titlePg`.

The paper's 23 footers are mostly the same two or three shapes repeated per section, so
this is not 23 distinct designs — but "last page of the section drops the arrow" is a
third state we cannot express.

**Cost.** Moderate, and I would push back on modelling it directly. Word itself has no
"last page" header state; HKEAA gets it by cutting a section per page. Adding a third
state to a model deliberately shaped on `w:titlePg` would buy one arrow. A better answer
is probably a document-level "continuation marker" the exporter places, if it is wanted
at all.

---

## Recommendation

Ranked by value per unit of work, judged against how much of the paper each unlocks:

1. **Fill-the-page answer lines + a dotted variant** (gap 1). 58% of the paper. The
   dotted style is nearly free; the fill mode is the one genuinely new idea and the one
   that makes a Question-Answer Book authorable at all rather than hand-counted.
2. ~~**Optional sub-part marks** (gap 2).~~ **Done** — the output was *wrong*, not merely
   unavailable, so this went first.
3. **Graph-paper preset** (gap 5). Small, and mostly a factory plus a picker that goes
   past 16×8.
4. **Bullet list block** (gap 4). Moderate; generalises past this paper.
5. **Page frame and rotated margin text** (gap 3) and **per-page footer variants**
   (gap 6). Both are facsimile-only. Defer unless the goal is to reproduce an HKEAA
   booklet exactly, and reconsider gap 6's shape before building it.

Items 1–3 would make a genuine P2-style Question-Answer Book authorable. Items 5–6 are
about looking like HKEAA, which is a different goal from setting a paper.
