# Ideas

The feature backlog: what we could build next, ranked, with where each idea came from.
Evidence is in [`research/2026-09-competitive/`](./research/2026-09-competitive/README.md)
(five slices, researched 2026-09-24). What is being built *now* lives in
[`STATUS.md`](./STATUS.md) — move an idea there when work starts, and delete it here
when it ships (`CHANGELOG.md` is the record of what shipped).

Sizes: **S** ≈ a session, **M** ≈ a few, **L** ≈ an initiative. Every idea must respect
the constraints in `CLAUDE.md`: static web + desktop, no server, `.docx` is the
load-bearing output, saved documents always reopen.

## Where we stand

No HK tool does bilingual on-page authoring of DSE-format papers with native `.docx`;
international builders treat Word as a lossy export. Released through 0.5.0: the export
dialog (answer keys, versions, other apps), paper checks and targets, marking schemes,
diagram areas and templates, file management, and ✦ AI translation. The question bank is
built on `develop`. What remains open: getting existing material in (D), what happens
after the paper is sat (G), and AI authoring (E1/E3/E4 built but paused).

## Built on `develop`, awaiting release

Remove from this list once released.

- **Question bank 題庫** (C1 tags, C2 bank, C4 usage history, C5 classes + sat-on date +
  derived cohort, C6 one tag set across copies, C24 teacher-defined 題型) — CHANGELOG
  Unreleased;
  `docs/design/question-library.md`.

## Recommended order

1. **Now** — release the question bank (C5, C6 settled its stored shape); then the build
   flow C7–C10 and the cheap C11.
2. **Next** — paste-to-structure (D1), the cheapest way to fill the bank; item analysis
   (G1), which also completes C4's facility.
3. **Later** — `.docx` import (D2), unpausing E1/E3/E4 after live evals, data charts
   (B3b), answer frames and the examiner grid (B6, B7), dashboard extras (F).

## A. Export and paper checks

Loose ends on shipped features:
- **Optional sections** (S–M): "answer any ONE" sections are summed in full by the paper
  check and summary; a target cannot be set per section.
- **Versions** (S): the version letter prints only atop page 1, not in the running
  header; the side panel lists options in version A order while the page shows B; a
  versioned key prints MCQ rationale once, in Version A letters.
- **PDF of the answer key** (S): PDF export prints the question paper only.
- **Mark scheme** (S–M): text is edited in the panel, not on the page; the scheme/marks
  mismatch warning is panel-only, not in the paper check.
- **Combined answer key** (S): every part takes the current document's page setup and
  font size.
- **Paper summary** (S): page count follows the preview's language, not the export's.

## B. Content model

- **B3b Data charts** (M): line/bar charts from a table for data-response; close the 11
  partial rows in `docs/Diagram_Requirements/COVERAGE.md`. Geometry in
  `src/model/diagram.ts`, drawing in `src/render/diagram.ts:diagramSvg`. *Aristo e-Graph.*
- **B6 Fill-in-blank answer frames** (S–M): blanks for students, answers for teachers.
  *Econ Excelsior "LQ答題框架", PickMyQuiz.*
- **B7 "For examiner's use" marks grid on the cover** (S–M), from derived marks, as a
  real table. *LaTeX `\gradetable`, OCR covers.*
- **Loose ends** (S each): graph answer space has no on-page select/resize and no custom
  height (four fixed sizes); a model answer diagram has no alt text or title field.

## C. Question library

Design: `docs/design/question-library.md` (a bank is a Worksheet; the index is derived and
rebuildable; copies keep `lineage.rootId`). Deep analysis, sources and traps:
`docs/research/2026-09-question-bank.md`. C1, C2, C4's usage history, C5, C6 and C24 are built (above).
- **題型 in Fill and coverage** (S–M): spread picks across 題型, show missing 題型 of a
  tested sub-topic (user chose group + filter only for now).

**The build flow** — every mature bank starts from the paper or shows the target:
- **C7 A real cart** (S–M): the tray lists its picks (remove one, reorder, MCQ before LQ)
  and survives Open in worksheet and Home.
- **C8 Choose where it goes** (S–M): a visible "Adding to: ‹paper ▾›" picker, or a new
  Paper 1 / Paper 2 / Classroom sheet with sections; "already in this paper" badges.
- **C9 Add from bank inside the editor** (M): the review page opens as a drawer with the
  open paper as target and running totals; one filter module instead of two.
- **C10 Blueprint and fill to spec** (M, schema): "36 MCQ across A–J, 45 min" or "60 marks
  from C, G, I"; show the picks before inserting, ↻ per pick, name the gaps honestly.
  A top-level `blueprint?` in `KNOWN_KEYS` — never inside `target`, which `targetOf` strips.

**Finding and judging**:
- **C11 Names, not slugs, and the free filters** (S): "Market intervention 市場干預"
  everywhere; filter has-diagram, missing 中文/English, source paper; sort by least used,
  oldest, marks. The data is already indexed.
- **C12 Derived item facts** (S–M): per leaf, command word → skill band (Know /
  Apply-Analyse / Evaluate, EN and 中文 lexicon); per question, stimulus kind (data,
  diagram, extract). Filter on them. Registry hook, no type branching; no schema change.
- **C13 Coverage grid** (S–M): the open paper's 雙向細目表 — topic × band × marks, flags for
  an empty compulsory topic, one topic over 40%, no Evaluate marks in Paper 2, MCQ keys
  clustered on B/C. In the summary popover and the export paper check.
- **C14 Command word × marks lint** (S): "Explain" for 1 mark, "State" for 6, "with the
  aid of a diagram" with no answer graph, Evaluate with no levels. Keyless.
- **C15 Source in HKEAA form** (S–M): index `provenance`; "2019 DSE P2 Q4(b)" as a filter;
  an optional "Licensed by copyright owner: HKEAA" line; a warning before a ✦ AI verb
  sends an HKEAA-sourced question (the licence forbids AI use).
- **C4 facility** (S, after G1): stats keyed by version (`contentKey`), not lineage;
  bands with n, never two decimals; flag only a likely mis-key or negative discrimination.

**Curating**:
- **C16 Canonical version** (S–M): "Make this the bank version"; the bank copy leads its
  group, else the newest — not whichever copy was touched last.
- **C17 Retire and star** (S, schema): per-question hide or "vetted", honoured by filters
  and Fill. Add to `contentKey`'s ignored list.
- **C18 Near-duplicate finder** (M–L): retyped questions → "these look the same, link as
  versions" (sets `lineage.rootId`).
- **C19 Reserve for the mock** (S): hidden from Fill and the 題庫 tab until a date.
- **✦ Suggest topics from the text** (S): a keyless glossary term → topic table, merged
  into tag-as-you-go; today it suggests only from neighbouring tags.

**Marking and sharing**:
- **C20 Examiner notes** (S): a teacher-only "common mistakes" note on a leaf's scheme,
  printed in the teacher version only; prompted after results ("Q12(b): 31%. What went
  wrong?").
- **C21 Level and EC presets** (S): insert HKEAA-style bands (L1 1–2 / L2 3–4 / L3 5–6,
  EC 2/1/0) into a scheme, bilingual.
- **C22 Parallel paper** (M, after C12/C13): swap each question for a sibling with the
  same sub-topic, type, marks and band, unused by the cohort. MCQ option shuffle only.
- **C23 Inventory CSV** (S): one row per question — topic, bands, marks, uses, facility —
  for the panel head's Excel audit.
- **Packs** (M): bank worksheets in the backup zip with `{publisher, license}`; import
  flags questions already held by `rootId`, strips foreign class tags, never overwrites.

**Engineering** (S each): don't hash image bytes on every autosave; per-document desktop
index files; virtualise the review rail; guard the bank screen's tag writes against a
second tab holding the same paper.

## D. Getting existing material in

- **D1 Paste-to-structure** (M): numbered MCQs with A–D and "(a)(i) … (3 marks)"
  parts become real questions, with a review step before commit. Today paste is plain
  text (`src/components/preview/RichTextEditable.tsx`). *Doc-to-Form, MS Forms Quick
  Import, Akindi Importer.*
- **D2 `.docx` import** (L), then PDF/photo (L). Publishers hand out banks as Word.

## E. AI — bring your own key, one ✦ AI door, results insert directly

The base shipped in 0.5.0: provider layer (`src/ai/`), text walker, EDB glossary, app
Settings, the ✦ AI menu (`src/assist/`). In HK, Gemini needs a VPN; DeepSeek and Qwen work
without one (`src/ai/providers.ts`). Never embed a key; never send student scripts.
*MagicSchool, Brisk, Diffit, Eduaide, QuestionWell, MS Teach.*

- **Unpause E1 answers, E3 source → items, E4 quality check** (S each): built
  (`src/answers/`, `src/generate/`, `src/quality/`) but hidden by
  `src/assist/paused.ts:PAUSED_VERBS` until live evals show the output is good enough.
- **Term lint on save** (S): Check terms runs on demand; a keyless paper-wide lint could
  run on every save.
- **E5 Differentiated copy** (M), **E6 data-response builder** with diagrams from a preset
  vocabulary, never raw model coordinates (L).

## F. File management

- **F3 Tags, stars and filter chips on the dashboard** (S–M); extend
  `src/components/start/dashboard.ts:visibleSummaries`. Folders lack nesting,
  multi-select move and touch drag.
- **F4 Total marks and page count on each card**, derived (S); the index stores only
  question count and cover.
- **F5 Full-text search from the dashboard** (S): the 題庫 searches question text; the
  dashboard still matches titles only.
- **F6 Local version snapshots** (M) — on export and before import; watch the quota.
- **F7 Collections** (M): several documents exported as one `.docx`; today only the
  answer key can combine documents.
- **F8 Department sharing via a shared cloud folder** on desktop (M): read-only until
  "Copy to edit", author initials, conflicted-copy detection. *OCR, Kognity.*

## G. After the paper is sat

- **G1 Item analysis from pasted results** (M): facility, discrimination, distractor
  choice, topic breakdown, combined across versions (Gradescope cannot). Results live in
  a separate file keyed by question id — documents and the corpus are untouched.
- **G2 Follow-ups** (S each, after G1): corrections worksheet, retrieval sets.
- **G3 Teacher-defined level boundaries** (S), labelled a school estimate — HKEAA
  publishes no cut scores.
- **G4 In-browser phone OMR** (L) — low priority: the ZipGrade key export already feeds
  apps that scan.

## Other

- **Presentation mode** (M): one question at a time, reveal the scheme. *Kuta.*
- **Large-print / dyslexia output profile** (M): `baseFontSize` scales text but the 12pt
  line is fixed, so it must be a separate profile that scales the line too. *Twinkl,
  Wayground.*
- **Product page** (S): the aimakecoolstuff.com Econ-editor page has no screenshots, no
  "open the app" link, no desktop download and no Chinese version.

## Deliberately not doing

AI marking of student scripts (student data + server); web share links / QR (need
hosting); storage caps or expiry; a free-form canvas (layout is slot-based by decision);
shipping HKEAA past-paper content; embedding any API key in the bundle; year-specific
paper templates (e.g. "2028 Paper 2") — the generic mock template serves every year,
and a dated template would need re-doing annually; a separate "Insert from another
document" dialog (was C3) — the 題庫 tab's From filter does it; mandatory metadata
forms, Bloom/AO tagging or teacher-rated difficulty (derive instead, and measure); QTI
export (HK schools are paper-first).
