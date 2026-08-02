# Handoff — the mock-exam cover page

**Goal: a teacher can build a cover that is structurally indistinguishable from a real
HKDSE cover, for both Paper 1 and Paper 2, and it comes out identical in the `.docx`, in
the on-screen preview, and in the printed / PDF output.**

**Status (2026-08-02): reached, to the limit of what is deliberately different.** The
work items in §4 and the order in §8 are done — see the addendum at the end of this
file for what changed and what remains open. The traps in §5 and the copyright
constraint in §6 still hold and are still worth reading first.

This originally recorded what existed, what was known-wrong, and where the
verification traps are, so the next person does not rediscover them.

Written by the previous implementer. Where something is unverified or uncertain it says
so — please do not treat any claim here as settled without re-measuring.

---

## 1. Reference material (all paths relative to the repo root)

`real_life_reference/` is **gitignored** — the files are copyright and exist only on the
maintainer's machine. Code and tests must degrade gracefully when they are absent
(`cover.test.ts` shows the pattern: `try { readFileSync(...) } catch { return; }`).

| Path | What it is | Why it matters |
|---|---|---|
| `real_life_reference/2019_Question_Paper_2.docx` | **The single most important file.** The real HKEAA Paper 2, as Word XML. | Every structural claim below was read out of its `word/document.xml`. It is the ground truth — the PDF is only a scan. |
| `real_life_reference/DSE2019_Paper 2.pdf` | Scan of the same paper, 23 pages | Confirms what the XML *means* on paper. Page 1 is the P2 cover. |
| `real_life_reference/DSE2021_Paper 1.pdf` | Scan of Paper 1, 18 pages | Page 1 is the **P1 cover**, which differs structurally from P2 (see §3). No `.docx` exists for this one, so P1 claims are measured off pixels. |
| `real_life_reference/Economics Worksheet (Student) (EN) (4).docx` | An export **from this app**, produced by the user mid-review | Useful as a "what actually lands in Word" sample. The one supplied was pre-fix and had no shapes at all. |

### How to read the reference

```bash
mkdir -p /tmp/p2 && cd /tmp/p2
unzip -o -q "real_life_reference/2019_Question_Paper_2.docx"
# The cover is everything in word/document.xml before "Section A".
```

Parse with `xml.etree` rather than regex — the file nests `w:p` inside `w:txbxContent`,
so a non-greedy regex over `<w:p>…</w:p>` silently returns markup as text. That mistake
cost the first analysis pass.

---

## 2. What the real covers are made of (verified, from the XML)

### Paper 2 — two-column

```xml
<w:sectPr>
  <w:pgSz  w:w="11909" w:h="16834"/>
  <w:pgMar w:top="648" w:right="1296" w:bottom="1440" w:left="1296" w:header="0" w:footer="624"/>
  <w:cols w:num="2" w:space="720" w:equalWidth="0">
    <w:col w:w="5328" w:space="144"/>   <!-- left:  identity, title, instructions -->
    <w:col w:w="3845"/>                 <!-- right: barcode box, candidate-number grid -->
  </w:cols>
</w:sectPr>
```

Three things draw the cover's furniture, and **none of them is a border**:

| Element | Mechanism | Exact spec |
|---|---|---|
| Corner code block | Anchored **`wpg:wgp` group** at (−0.65in, −0.25in) | Group `ext 1730375×1720850` EMU, `chExt 2725×2710`. Contains a `wps:wsp prst="rect"` textbox at child `(0,312)` `ext 1520×1350` holding the code lines, **and** a `prst="line"` at `(0,0)` `ext 2725×2710`, `a:ln w="38100"` (3pt) |
| Column divider | Anchored **`prst="line"`** connector | `extent cx="0" cy="8058150"` (0 × 8.81in), `a:ln w="19050"` (1.5pt), `positionH posOffset="-151130"` |
| Candidate panel | A `w:tbl`, `tblW=4170`, `tblInd=340`, all borders single sz=4 | Row 1 = barcode box (`gridSpan 10`), row 2 = "Candidate Number" + 9 empty cells |

There is **no `w:pgBorders`, no `w:cols w:sep`, no `w:pBdr`** anywhere on the cover.
I checked all four and only shapes are used. Do not "simplify" these into borders — it
was tried and it cannot express a line of a chosen weight down a column's full height.

### Paper 1 — single column

No `.docx` exists, so this is measured off `DSE2021_Paper 1.pdf` page 1:

- **One full-width column.** No candidate panel — MCQ answers go on a separate
  machine-read sheet, so there is nothing to write on the cover.
- Identity lines **centred** across the page (P2 ranges them left in its narrow column).
- Instructions numbered `1.` (P2 uses `(1)`), running the full width.
- **Mixed fonts** — see §3.
- A boxed note bottom-right ("Not to be taken away…"). **Not implemented.**

### Font schemes (this took three iterations to get right)

| | Arial | Times New Roman |
|---|---|---|
| **Paper 1** | corner block, authority/identity lines, `ECONOMICS PAPER 1` | timing line, `INSTRUCTIONS`, instruction body |
| **Paper 2** | everything | — |

The corner block is Arial on **both**. A single cover-wide font can express P2 and not
P1, which is why `CoverPage.fonts` is a *default* that any line overrides through its own
`format.fonts`.

---

## 3. What has been built

### Model — `src/model/coverTypes.ts` (types) + `src/model/cover.ts` (behaviour)

Split in two because `model/types.ts` imports `CoverPage`, and a types-only module keeps
that edge one-way (the same reason `model/diagram.ts` is types-only).

```ts
CoverPage {
  cornerLines?, cornerRule?          // the floating corner block
  headLines?                          // identity lines
  instructionsHeading?, instructions?, instructionMarker?  // 'dot' | 'paren'
  panelNote?, panelFieldLabel?, panelBoxes?                // right column
  footLines?
  fonts?                              // DEFAULT face; a line's own format wins
  columns?                            // { left, gap, right } in twips
}
CoverLine { id, text, format?, gapAfter? }   // gapAfter = blank lines after this one
```

`worksheet.cover?: CoverPage` — its own field, **not** layout elements. The first attempt
built covers from masthead `Band`s plus flow elements and could not produce the shape at
all: a band is one full-width row, so a stack of them is a stack of centred lines. That
attempt was scrapped; do not revive it.

### Render — `src/render/worksheet.ts`

`renderCover()` → `CoverRenderNode` on `RenderedWorksheet.cover`. **Deliberately not a
member of the `RenderNode` union**: every member of that union flows in the document
body, and a cover is a whole page. Its *regions* are `RenderNode[]`, so backends reuse
the existing paragraph/columns emitters.

Instruction numbers are derived from position (deleting (2) renumbers the rest), as
literal text on a hung `ColumnsNode` — not a `w:num` stream, which would renumber them as
questions are added.

### Export — `src/export/docx/body.ts`

`coverXml()` at line ~658, plus `cornerGroupXml`, `coverRuleXml`, `lineShapeXml`,
`framedNoteXml`, `panelBoxesXml`, `CORNER_CLEARANCE_LINES`.

Namespaces `xmlns:wps` and `xmlns:wpg` were added to `src/export/docx/package.ts`.

### Preview — `src/components/preview/Preview.tsx`

`CoverSheet` component (~line 1360) renders it as its own `.paper` sheet, ahead of
`pages`. **The cover deliberately bypasses the paginator** — it never splits, so teaching
the packer about it would be cost with no benefit.

### Editing

`coverLine` / `coverField` `EditTarget`s, wired through `model/edits.ts`
(`applyEditTarget`, `applyFormatTarget`, `textOfTarget`, `formatOfTarget`,
`isFormattable`). Lines are click-to-select and double-click-to-edit on the page, like
everything else. Store actions in `src/store/worksheetStore.ts`: `applyCover`,
`removeCover`, `updateCover`, `setCoverLineText`, `formatCoverLine`, `addCoverLine`,
`removeCoverLine`.

### UI

`DocumentSettings.tsx` → **Cover** tab. Paper style radio + optional text fields, then
"Add cover page". Generates and gets out of the way; everything is edited on the page.

### Tests — `src/model/cover.test.ts`, 21 tests

Includes two copyright guards (§6) and an **export-coverage** test (§5).

---

## 4. Known-wrong / not done — the actual work remaining

Ordered by how badly each breaks the goal.

### 4.1 The cover is not a faithful copy — the biggest gap

The user's assessment, and it is correct. What is visibly missing versus the reference:

- **Vertical spacing is guesswork.** The reference's cover uses specific blank-paragraph
  runs (8 before the authority lines, 2 between title groups, 6 before INSTRUCTIONS). Ours
  uses `gapAfter` values I chose by eye. **Measure them off the reference and encode them.**
- **The P1 boxed footer note** ("Not to be taken away before the end of the examination
  session") has no equivalent. There is no model field for it.
- **Panel geometry is approximate.** The reference's grid is `tblW=4170`, `tblInd=340`,
  cells `1558 + 9×290`. Ours emits `1554` + N×`340` with a hardcoded 3 boxes.
- **The corner block's own proportions** were adjusted by eye to stop text wrapping
  (child width `1900` vs the reference's `1520`). The reference's own codes are shorter;
  a principled fix would size the box from the text.
- **Nothing verifies the cover against the reference geometrically.** Every check is
  "does this string appear in the XML". A pixel-diff harness against
  `DSE2019_Paper 2.pdf` page 1 would catch everything above at once, and is probably the
  highest-value thing to build first.

### 4.2 The clipboard drops the cover entirely — **confirmed bug**

`src/export/clipboard.ts` never reads `rendered.cover`. Copying a worksheet silently
loses its cover. This breaks the architecture's central "one IR, three backends" rule:
preview and `.docx` agree, clipboard does not.

```bash
grep -n "cover" src/export/clipboard.ts   # only `cell.covered` hits — unrelated
```

Decide deliberately whether a cover *should* paste (it carries no page setup by design —
see the clipboard section of `SYSTEM_ARCHITECTURE.md`), and either implement it or write
down why not. Currently it is an omission, not a decision.

### 4.3 The PDF/print diagonal is wrong — **confirmed bug**

The corner diagonal renders far too short in print. Measured on a Chrome-generated PDF:
it spans **68px where it should span ~140px**. The `.docx` is correct; the preview on
screen is correct; only print is wrong.

Cause is almost certainly the preview's percentage-based box
(`top: 6%; bottom: 12%; left: 70%`) resolving against a different containing block once
print CSS neutralises transforms. Reproduce:

```bash
# with the dev server running
node scripts/shot.mjs  # or drive Playwright: page.emulateMedia({media:'print'}); page.pdf(...)
```

### 4.4 Verification is not systematic

There is no single command that answers "do the three outputs agree?". Building one is
worth more than any individual fix. It should, for both paper styles:

1. export the `.docx`, convert with LibreOffice, rasterise page 1
2. rasterise the preview sheet
3. rasterise the print PDF page 1
4. compare all three to each other, and to the reference scan

### 4.5 Smaller items

- `panelBoxes` is fixed at 3 by the generator and has no UI.
- `instructionMarker`, `columns` and `fonts` are stored but have no UI — a teacher cannot
  change them without editing JSON.
- `CoverPage` is in `KNOWN_KEYS` (`src/model/migrations.ts`) so it persists, but there is
  **no migration test** for a document saved with a cover.
- The cover is not represented in the outline (`editor/Outline.tsx`) or the page rail, so
  it cannot be navigated to.
- `emptyCoverPage()` exists but nothing calls it.

---

## 5. Traps — every one of these cost real time

**Read this section before changing anything.**

1. **Measure line directions; never reason about them.** I got the diagonal backwards
   *twice*, in two different systems, from first principles. The reference runs
   bottom-left→top-right (`/`). Drawing that takes `a:xfrm flipV="1"` in OOXML and
   `linear-gradient(to bottom right, …)` in CSS — **both the opposite of the obvious
   guess**. (A CSS gradient keyword names the axis of travel; the stops lay a band
   *perpendicular* to it.) Verify by cropping the render and printing dark-pixel x per y:

   ```python
   a = np.array(Image.open(png).convert('L')); dark = a < 120
   for y in range(30, 300, 20):
       idx = dark[y].nonzero()[0]; idx = idx[idx > 115]
       if len(idx): print(y, idx.min(), idx.max())
   # reference: y 30→130 while x 222→122
   ```

2. **A test that greps for stock text can pass while a whole region is missing.** The
   generated cover repeats itself — the school name is both a head line *and* the foot
   line — so searching for it found the other copy and passed even with the foot region
   deleted from the exporter. The export-coverage test now assigns a **unique sentinel per
   line** (`ZZ-foot-0-ZZ`). Confirm any change to it still fails when you delete each of
   the four regions from `coverXml` in turn.

3. **`wrapNone` reserves no space.** The floating corner block needs
   `CORNER_CLEARANCE_LINES` blank paragraphs after it or the identity lines print straight
   through it. This showed on P2 (narrow column, starts higher) and *not* on P1 — test both.

4. **A table inside a Word column measures against the full section width.** The framed
   panel note ran off the page edge until `w:tblW` was pinned to the column.

5. **Anything that sets `fontSize` must set `lineHeight` too.** The page runs on a fixed
   12pt line; an enlarged run overprints the line above. This was a pre-existing bug in
   `formatStyle` and `bandFieldStyle`, not cover-specific.

6. **`ColumnsNode` needs `hanging` for wrapped rows**, and `hanging` + `indent` must be
   **one** `w:ind` element — Word merges it as a whole and drops whichever came first.

7. **The preview lies more often than you expect.** Three separate bugs were invisible
   on screen and only appeared in the exported file: the missing column rule, the missing
   corner diagonal, and (still open) the short print diagonal. **Always open the export.**

---

## 6. The copyright constraint — do not weaken this

The user's requirement: reproduce the *structure*, never the HKEAA's wording.

Reproduced: layout, geometry, column split, shapes, font scheme.
**Not** reproduced, deliberately: rubric prose, authority and examination lines, the
barcode/candidate-number apparatus, the copyright notice. The right-hand panel is
name/class/number — a school identifies its candidates by name.

Two tests enforce it in `cover.test.ts`:

- a **phrase blocklist** (always runs)
- a **6-word sliding window** over the real `.docx` asserting zero overlap (skips when
  the gitignored reference is absent)

The window test earned its keep: it caught "question-answer book" in an instruction,
which is HKEAA's own name for the format. If you add wording, run it.

---

## 7. How to verify anything

```bash
npm test                 # 634 tests, ~1s
npx tsc --noEmit
npm run lint             # 40 pre-existing warnings, 0 errors — do not add to them

npm run dev              # then drive the UI with playwright-core; see scripts/shot.mjs
```

Round-tripping an export to an image (this is how every visual claim here was checked):

```bash
/Applications/LibreOffice.app/Contents/MacOS/soffice --headless \
  --convert-to pdf --outdir . out.docx
pdftoppm -r 90 -png -f 1 -l 1 out.pdf page
```

Always validate an exported file before trusting it — a malformed shape makes Word
report the *whole document* as needing repair:

```python
z = zipfile.ZipFile('out.docx'); assert z.testzip() is None
for n in z.namelist():
    if n.endswith(('.xml', '.rels')): ET.fromstring(z.read(n))
```

---

## 8. Suggested order of work

1. **Build the three-way visual harness** (§4.4). Everything else is guesswork without it.
2. **Fix the print diagonal** (§4.3) — a confirmed, isolated bug.
3. **Decide and implement the clipboard** (§4.2) — currently an omission, not a decision.
4. **Measure the reference's real spacing and geometry** and encode it (§4.1). This is
   the bulk of "make it actually look the same".
5. Add the P1 boxed footer note, then the missing UI (§4.5).

Context for the whole system: `SYSTEM_ARCHITECTURE.md` (the cover has its own section,
"A cover is a page of regions"). Companion analysis: `DSE2019_P2_GAP_ANALYSIS.md`.

---

## 9. Addendum — the work above is done (2026-08-02)

Everything in §8's order landed, in this sequence:

1. **The harness exists**: `node scripts/cover-verify.mjs` (fixtures from
   `scripts/cover-fixtures.test.ts`, comparison in `scripts/cover-compare.py`). Per
   style it produces `<p>-{docx,preview,print,ref}.png`, a labelled `<p>-contact.png`,
   and pairwise mean-|Δ| scores. It starts its own dev server if none is running.
2. **§4.3 (print diagonal) no longer reproduces** — measured at matched 96dpi, the
   preview and print diagonals are pixel-identical. It was evidently fixed by the final
   corner-block rework before the cover commit. The harness pins it from now on.
3. **§4.2 (clipboard) was decided, not implemented**: the cover is deliberately absent
   from the clipboard, by the same rule that keeps page setup and headers out — pasting
   must not impose this document's page furniture on the destination, and clipboard
   HTML cannot express any of the cover's mechanisms anyway. Written down in
   `clipboard.ts`, `SYSTEM_ARCHITECTURE.md`, and pinned by a test.
4. **§4.1 (geometry) is encoded from the reference**: blank-paragraph rhythm
   (8/1/2/1/6/1) as `gapAfter` values; corner block at the reference's own numbers
   (11pt body-size corner lines are what make its 1520-wide textbox and full-span
   diagonal fit); panel grid via `COVER_PANEL` (tblInd 340, label 1558, boxes 290×504,
   note ≥1584); the foot block moved into the cover section's **own footer part**
   (`footer3.xml` / rId9), which is the reference's mechanism and pins it to the page
   bottom. The harness also caught that the cover `sectPr` omitted `w:pgSz`/`w:pgMar`
   and therefore printed on **Letter** in a default-locale Word — it now restates the
   document's geometry (test-pinned).
5. **§4.5**: the P1 boxed footer note exists (`CoverPage.footNote`, edited on the page
   via a `coverField` target, printed beside the foot lines in the footer part);
   `instructionMarker` and `panelBoxes` have live controls in the Cover tab
   (`CoverOptions`); the cover has a navigable card in the page rail; a round-trip
   test guards persistence.

Final harness numbers (mean |Δ| on 620×877 grayscale): preview↔print 3.7/4.7,
preview↔docx 5.6/5.5, print↔docx 6.1/6.4 (P1/P2). The `ref` distances (~11 P1, ~22 P2)
are the deliberate differences — our wording, no barcode apparatus, the teacher's own
margins — plus scan noise.

Still open, by choice:

- `columns` and `fonts` remain JSON-only — no teacher has asked to move the column
  split, and per-line fonts are already editable on the page.
- The cover's margins follow the worksheet's page setup rather than the reference's
  tighter cover-specific ones (top 648 / sides 1296). If a teacher wants the exact
  HKEAA look, that would need a per-cover margin override.
- The reference flows into its right column with padding paragraphs and no column
  break; ours uses an explicit `w:br type="column"`, which is sturdier. Deliberate.
