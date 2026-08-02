# Handoff — an LQ (Paper 2 Question-Answer Book) mode

**Goal.** Add an explicitly separate mode for authoring long-question mock papers that
mimic `real_life_reference/2019_Question_Paper_2.docx` (HKDSE Economics Paper 2, a
*Question-Answer Book*). The existing worksheet approach stays exactly as it is — this is
a second mode beside it, not a migration of it.

Read [`SYSTEM_ARCHITECTURE.md`](./SYSTEM_ARCHITECTURE.md) first; it records the rules a
change must keep and, where a rule is counter-intuitive, the constraint that forced it.
Where this document and the code disagree, the code is right.

---

## 1. What "LQ mode" means, and what it must not do

A Paper 2 booklet is **mostly writing room**. The candidate answers *in* the booklet, so
question text is the minority of the page and the answer space is the product. That is
the whole reason this needs its own mode: today's worksheet is a document whose length is
decided by its content, and a QAB is a document whose length is decided by how much room
each question is *given*.

**The constraint the user has stated: keep the original approach.** The classroom
worksheet, the Paper 1 cover, MCQ and structured questions, and every existing export
must behave identically after this work. Concretely:

- An existing document must export **byte-identically** to before. There is a precedent
  for how to guarantee that (§ *Per-element formatting*: `TextFormat` stores only deltas,
  so an untouched document is unchanged). Do the same here: everything new is either a
  new opt-in field or absent, and absent means today's behaviour.
- **Do not repurpose `answerLines`.** It is a real element with real users and a
  different look (see §3.1). The LQ line is a different primitive.
- **Do not branch shared modules on the mode.** `registry.test.ts` already greps eight
  modules for `'mcq'`/`'structured'` to enforce that no shared module knows a concrete
  question type. Adding `if (mode.paper === 'lq')` through the walker, the exporter and
  the paginator would be the same mistake in a new coat. Prefer: LQ contributes *data*
  (a node kind, a style, a resolved line count) that the existing walkers already
  understand.

**Ask before building** if you conclude the constraint above cannot be met — that is a
decision for the user, not a thing to work around quietly.

---

## 2. What the reference actually is (measured, not assumed)

All numbers below are from `real_life_reference/2019_Question_Paper_2.docx` (the file is
**gitignored — copyright**; read it locally, never commit its text or wording). Re-derive
anything you intend to rely on; a previous pass through this file recorded a paragraph
count that a later measurement contradicted, so trust your own extraction.

| Fact | Value |
|---|---|
| Rendered length | **24 A4 pages** (LibreOffice), 595×842 pt |
| Word sections (`sectPr`) | **24** — roughly one per page |
| Explicit page breaks (`w:br w:type="page"`) | **0** |
| `w:type` on sections | **absent everywhere** → all default to `nextPage` |
| Header parts / footer parts | **21 / 23** |
| Top-level paragraphs | 1090 |
| Dotted answer lines | **425 paragraphs** (`<w:u w:val="dotted"/>` over a tab) |
| `w:u w:val="dotted"` runs | 870 |
| Tables | 13 · Drawings | 14 |
| `w:numPr` (native Word numbering) | **8 only** |
| Marks labels | 42 paragraphs contain `marks)`; they are **not underlined** (3/42 carry any `w:u`) |
| Dotted-line pitch, rendered | **46px @150dpi = 22.08pt ≈ 442 twips** (measured off page 10) |
| Sections | `Section A (44 marks)`, `Section B (60 marks)`, `Section C (16 marks)` |

Structure per page, from `pdftotext`: pages 2–9 are Section A, 9–19 Section B, 20–22
Section C, 23 a spare answer page, 24 a Supplementary Answer Sheet. **Pages 10, 12, 14,
17, 18, 19, 21 carry no question text at all** — they are pure answer space plus page
furniture. That is the shape to reproduce.

### 2.1 The answer line, verbatim

```xml
<w:p><w:pPr>
  <w:tabs><w:tab w:val="right" w:pos="9300"/></w:tabs>
  <w:spacing w:before="320" w:after="240"/>
  <w:jc w:val="both"/>
  <w:rPr><w:color w:val="000000"/><w:u w:val="dotted"/></w:rPr>
</w:pPr><w:r>
  <w:rPr><w:color w:val="000000"/><w:u w:val="dotted"/></w:rPr><w:tab/>
</w:r></w:p>
```

A **dotted underline drawn over a right-aligned tab** — not a paragraph border, not
underscores.

**Correction (re-measured):** the spelling above is a one-off. Of 425 dotted-line
paragraphs, **404 carry `<w:spacing w:before="240"/>` alone** (right tab at 9300 —
which is simply that document's content width); `w:before="320" w:after="240"` occurs
exactly once. The rendered pitch is 46px @150dpi = 22.08pt ≈ 442 twips, dead regular.
The app expresses that pitch as a single exact line box (`LQ_LINE_PITCH_TWIPS = 442`),
keeping the fixed-line invariant — see SYSTEM_ARCHITECTURE §The LQ mode.

### 2.2 Question numbering is literal text

Only 8 `w:numPr` in the whole file. `1.`, `(a)`, `(i)` are ordinary runs placed with tab
stops and `w:ind` using `w:hangingChars`/`w:hanging` — e.g. a part sits at
`w:left="1200" w:hangingChars="600" w:hanging="1200"`, a question at `w:left="600"
w:hangingChars="300"`. The app instead emits real `w:num` streams
(§ *Numbering*), which is **better** for authoring (reorder and renumber for free) and
should be kept. Match the *geometry*, not the mechanism — unless you find a case where
the mechanism is visible in the output.

### 2.3 Page furniture is anchored shapes, not borders

The page frame and the rotated "Answers written in the margins will not be marked" text
are **anchored shapes inside the header** (one `prstGeom prst="rect"`, two
`bodyPr vert="vert270"`), which is precisely why the file carries 21 header parts: Word
needs a section per page to vary them. The band model (§ *A header lives in the margin*)
has no vocabulary for either.

---

## 3. The three real problems

Everything else here is ordinary work. These three are where the design decisions are, so
resolve them explicitly and write down *why* in the same style as the rest of the
architecture doc.

### 3.1 The LQ answer line is not `AnswerLine`

| | today's `AnswerLine` | the reference |
|---|---|---|
| mechanism | paragraph **bottom border**, `A6A6A6` size 6 | **dotted underline over a right tab** |
| height | `exactLine: ANSWER_LINE_HEIGHT_TWIPS` (24pt) | `w:before="320" w:after="240"` |
| spacing | zero, per the fixed-line model | its own before/after |

The dotted-underline form also sidesteps the border-collapse behaviour that
`AnswerLine` has to work around (§ *Answer lines are a style, not direct formatting*:
Word collapses consecutive paragraphs sharing one border set, so the style declares both
`w:between` and `w:bottom`).

**This collides with a load-bearing invariant.** § *One fixed line, no paragraph spacing*
says every paragraph is `w:line="240" w:lineRule="exact"` with zero before/after, and that
all vertical rhythm comes from the line box — the reference worksheet's own model, and
what keeps the preview, the exporter and the paginator agreeing. An LQ line paragraph
carrying `before`/`after` is a deliberate exception to it. Decide whether to:

- **(a)** allow the exception for this one style, stated as such, with
  `formatParagraphProps()` restating `w:line` as it already does whenever spacing is
  overridden; or
- **(b)** express the same pitch as an exact line height so the invariant holds
  unbroken, and verify the rendered pitch matches the reference.

Whichever you pick, **measure the rendered result against the reference**, do not reason
about it. Both backends (preview CSS and `.docx`) must agree — that is the standing rule
and it has been broken silently before.

### 3.2 The line count is not authorable — it is "fill the page"

In a QAB, the answer space for a question is *whatever is left on the sheet*. Today
`answerLines.lines` is a stored number, and an element's size is an **input** to
pagination. A fill mode inverts that: the size becomes an **output** of the paginator,
which is the one place that knows the remaining height (§ *Preview paginates into
sheets*, measure-then-pack).

This is the hardest part of the job. Suggested shape, but verify it against the code:

- Give the LQ line node a resolved count that the *paginator* writes, with the author
  choosing an intent (`fill` vs an explicit number), not a pixel count.
- Beware the feedback loop: a fill element that grows to fit changes the packing that
  decided how much room it had. Make the resolution a single pass with a defined answer
  (e.g. fill is only ever the *last* thing on a sheet), rather than iterating to a fixed
  point.
- The `.docx` has no paginator. Word will reflow it, so the exported count has to be the
  count the preview resolved — which means the resolved value must reach the exporter,
  not be recomputed there. Two computations of this number is exactly how the preview and
  the paper would start disagreeing about where pages break.

### 3.3 Per-page furniture is facsimile-only — decide the scope with the user

The 21 headers exist to put a frame and rotated margin text on every page. Reproducing
that faithfully means a Word section per page, which the model has no notion of (a page
is *derived*, § *A page is derived*). The previous assessment was to **deprioritise this
as facsimile-only**, and that is probably still right: a school's mock paper needs the
*shape* (answer space, marks, sections, three-part structure), not HKEAA's frame.

Propose a scope explicitly. A reasonable line: reproduce the frame as a simple page
border plus a rotated margin note if it is cheap, and skip the per-page section
machinery. **Confirm with the user before building any of it** — it is the one part
here with a large cost and a small benefit.

---

## 4. Things that will bite you

Each of these has already cost a debugging session in this repo. They are in the
architecture doc, but these are the ones this task walks straight into.

- **The `.docx` is the deliverable — open it.** Several cover bugs were invisible on
  screen and only appeared in the exported file: a `sectPr` that omitted `w:pgSz` printed
  on Letter; a column rule the preview drew and Word did not. Most recently a blank sheet
  appeared between the cover and the body because a `continuous` section break *and* a
  page break were both emitted — a section break **is** a page transition. Verify by
  rendering, not by reading XML.
- **`scripts/cover-verify.mjs` is the model to copy.** One command that rasterises the
  `.docx` (LibreOffice), the preview (Playwright) and the print PDF and diffs them
  against the reference scan. It now also asserts a **page count** — its image legs only
  ever rasterised page 1, which is how the blank-sheet bug scored perfectly while being
  wrong. An LQ harness must check *length* (a 24-page reference is a length claim) and
  should check a mid-document page, not only the first.
- **`KNOWN_KEYS` must list every new top-level `Worksheet` field**, or it is stripped into
  `__unknown` on load: the control appears to work, then the value vanishes on reload.
  Three fields were lost this way already.
- **Verify UI in a browser at a real window height.** Source reading hides density
  problems, and a laptop viewport (~800px CSS) has already exposed a dialog whose action
  button was sliced by the panel edge.
- **A new document must reach storage.** `replaceWorksheet` marks the store clean and
  autosave only fires on `dirty`, so anything that creates a document must save it
  explicitly (`EditorHost.open` does).
- **New on-page chrome needs `data-print-hide`**, or it appears in the PDF.
- **Reference wording is copyright.** Reproduce *structure*, never prose, rubric,
  authority lines or apparatus. Two tests already guard this for the cover — a phrase
  blocklist and a 6-word sliding window over the reference file — and an LQ mode should
  have the same.

---

## 5. Suggested order of work

1. **Re-measure the reference yourself** and write down what you find. Correct §2 here if
   it is wrong; a prior pass through this file recorded numbers a later pass contradicted.
2. **Decide §3.1** (the line primitive) and build it end to end — model → IR → all three
   backends → preview — with the pitch verified against a render. This is small, and it
   unblocks everything else.
3. **Build the LQ paper as data**: sections A/B/C with their own mark totals, questions
   carrying an answer-space intent, the underlined marks label. Reuse `structured`
   wherever it already fits; a new question type is a legitimate option (the registry
   exists for exactly this and needs no changes elsewhere), but only if `structured`
   genuinely cannot express it — say which.
4. **Then §3.2** (fill-to-page), which is the risky one. Land it behind the intent field
   so a document that does not use fill is untouched.
5. **A verification harness**, modelled on `cover-verify.mjs`, checking page count and at
   least one interior page.
6. **§3.3 only after agreeing scope with the user.**
7. Update `SYSTEM_ARCHITECTURE.md` in the same change — its own rule.

## 6. Definition of done

- An existing worksheet exports byte-identically to before this change (assert it).
- `npx vitest run` green, `npx tsc --noEmit` clean, `npx eslint src scripts` no errors.
- An LQ paper exports a `.docx` that **opens in Word without a repair prompt**, and whose
  rendered page count and answer-space pitch match the reference within a stated
  tolerance.
- The preview, the `.docx` and the print PDF agree — proven by a harness, not by eye.
- The copyright tests pass for the new mode.
