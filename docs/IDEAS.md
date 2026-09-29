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

- **Question bank 題庫** (C1 tags, C2 bank, C4 usage history) — CHANGELOG Unreleased;
  `docs/design/question-library.md`.

## Recommended order

1. **Now** — release the question bank, then its follow-ups (C).
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
rebuildable; copies keep `lineage.rootId`). C1, C2 and C4's usage history are built (above).

- **C4 facility** (S, after G1): "used in Mock 2025 5A, P1 Q12, facility 0.34" — usage is
  shown; facility needs results.
- **✦ Suggest topics from the text** (S): tag-as-you-go suggests from neighbouring
  questions' tags; a keyless glossary term → topic table would read the question itself.
- **Drag from the 題庫 tab onto the page** (S).
- **Packs** (M): bank worksheets in the backup zip with `{publisher, license}`; import
  flags questions already held by `rootId`, never overwrites. Ship no HKEAA content.

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
document" dialog (was C3) — the 題庫 tab's From filter does it.
