# Ideas

The feature backlog: what we could build next, ranked, with where each idea came from.
Evidence is in [`research/2026-09-competitive/`](./research/2026-09-competitive/README.md)
(five slices, researched 2026-09-24). What is being built *now* lives in
[`STATUS.md`](./STATUS.md) — move an idea there when work starts, and delete it here
when it ships.

Sizes: **S** ≈ a session, **M** ≈ a few, **L** ≈ an initiative. Every idea must respect
the constraints in `CLAUDE.md`: static web + desktop, no server, `.docx` is the
load-bearing output, saved documents always reopen.

## Where we stand

No HK tool does what this one does — bilingual on-page authoring of DSE-format papers
with native `.docx`. Every international builder treats Word as its lossy "editable"
export; ours is the faithful one. The gap competitors expose is everything **around**
authoring: a question library, the export dialog (answer keys, versions), and what
happens after the paper is sat. Nobody makes editable economics diagrams.

## Built on `develop`, awaiting release

Remove from this list once released.

- **Export dialog + separate answer key** (was A1) — `src/components/editor/ExportDialog.tsx`,
  `src/render/answerKey.ts:renderAnswerKey`.
- **Paper health check** (was A2) — `src/model/paperHealth.ts:checkPaper`, shown in the
  export dialog. Not yet: "answer any ONE" sections are summed in full; the Paper 2
  1.5 min/mark rate assumes ~100 marks (unverified).
- **Backup zip + restore** (was F1) — `src/storage/backup.ts`.
- **Trash with 30-day restore** (was F2) — `src/storage/trash.ts`.
- **Seeded MCQ versions A–D** (was A3) — `src/model/versions.ts`, registry `variant` hook,
  per-version keys and a version map in the answer key. Not yet: version in the running
  header; the side panel lists options in version A order while the page shows B.
- **Other-apps export** (was A4) — `src/export/csv/answerKeyCsv.ts`: ZipGrade key, plain
  key CSV, Kahoot `.xlsx`, Blooket CSV. No real import tried in any of the four apps.
- **Export toggles** — cover on/off, answer space on/off (`OutputMode.omitCover` /
  `omitAnswerSpace`, export-time only).
- **Marking scheme in HKEAA notation** (was B1, 2026-09-25) — `src/model/markSchemeTypes.ts`,
  `src/model/markScheme.ts`, `src/render/markScheme.ts`, `MarkSchemeEditor.tsx`. Not yet:
  on-page editing of scheme text; the mismatch warning is panel-only, not in the paper
  check; Chinese labels and default EC wording unverified against a real HKEAA scheme.
- **MCQ rationale + provenance** (was B2, 2026-09-25) — `McqOption.rationale`,
  `McqQuestion.provenance`; teacher version + answer key. Not yet: versioned key prints
  notes once in Version A letters; bilingual "Source 出處：" spacing.
- **Diagram shaded areas + shift curve** (was B3, 2026-09-25) — `src/model/diagramAreas.ts`,
  `src/model/diagramShift.ts`, `DiagramAreaControls.tsx`; CS / PS / DWL / tax presets.
  Not yet: shifted equilibrium point is not attached to its curves; template curves stop
  short of the y-axis so CS/PS leave a small strip; print-PDF leg not re-run.
- **Graph answer space** (was B4, 2026-09-25) — `src/model/answerGraph.ts`,
  `src/render/answerGraph.ts`, `AnswerGraphFields.tsx`; blank axes, grid, 12/16/20/24 lines.
  Not yet: on-page select/resize; custom height; Word itself untested (LibreOffice only).
- **In-app feedback** — `src/feedback/feedback.ts`, `src/components/feedback/FeedbackDialog.tsx`:
  prefilled GitHub issue (URL capped at 3,500 chars — GitHub's sign-in redirect breaks
  above ~4k), `mailto:` to dseconmentor@gmail.com, or clipboard. Labels only stick when
  the reporter can triage the repo. Not tried: desktop opener, a signed-in GitHub form.

## Recommended order

1. **Now** — paper summary bar (A5).
2. **Next** — topic tags (C1) → local question library (C2).
3. **Later** — paste/Word import (D1, D2), BYOK AI (E), item analysis (G1), remaining
   diagram upgrades (B3b).

## A. Export and paper checks

- **A5 Paper summary bar with a target** (S): "38/45 MCQ · 52 marks · ~61 min", with an
  optional blueprint. *examWizard, Exampro, ExamSoft.*

## B. Content model

- **B3b Diagram upgrades, remaining** (M): line/bar charts from a table for
  data-response; more templates. Shaded areas and shift-curve shipped 2026-09-25.
  Geometry in `src/model/diagram.ts`, drawing in `src/render/diagram.ts:diagramSvg`.
  *Aristo e-Graph.*
- **B6 Fill-in-blank answer frames** (S–M): blanks for students, answers for teachers.
  *Econ Excelsior "LQ答題框架", PickMyQuiz.*
- **B7 "For examiner's use" marks grid on the cover** (S–M), from derived marks, as a
  real table. *LaTeX `\gradetable`, OCR covers.*

## C. Question library — the most-requested gap

- **C1 Topic tags** (S): an optional field on questions — EDB topics A–J + electives,
  or DSEconMentor's 71 MCQ / 50 LQ topics. `KNOWN_KEYS` guards only top-level
  `Worksheet` fields, so a question-level field passes through — still check
  `src/model/migrations.ts:migrate` normalises nothing away, and prove it on the corpus.
- **C2 Local question library** (L): search every saved document's questions by topic,
  type, marks, "not used with this class since…"; insert a copy. Web: IndexedDB;
  desktop: a folder. Ship no HKEAA content (copyright). *EdCity OQB, OUP, IB
  Questionbank, OCR ExamBuilder, Exampro.*
- **C3 Merge documents / insert from another document** (M) — the cheap first step
  toward C2. *Kuta, Wayground.*
- **C4 Question history** (M): "used in Mock 2025 5A, P1 Q12, facility 0.34". Needs a
  stable origin id carried through copies. *Moodle, ExamSoft.*

## D. Getting existing material in

- **D1 Paste-to-structure** (M): numbered MCQs with A–D and "(a)(i) … (3 marks)"
  parts become real questions, with a review step before commit. Today paste is plain
  text (`src/components/preview/RichTextEditable.tsx`). *Doc-to-Form, MS Forms Quick
  Import, Akindi Importer.*
- **D2 `.docx` import** (L), then PDF/photo (L). Publishers hand out banks as Word.

## E. AI — bring your own key, review before insert

Constraints: no server, so BYOK from the browser (accept any OpenAI-compatible base
URL — major APIs may restrict Hong Kong, **unverified**) or desktop-only with the key in
the keychain. Output is JSON validated against the question types, shown in a review
tray, inserted through normal store actions — the `.docx` path is unchanged. Never embed
a key. Never mark student scripts: "no student data leaves your machine" is a selling
point. *All of MagicSchool, Brisk, Diffit, Eduaide, QuestionWell, MS Teach.*

- **E1 Answers, mark schemes and MCQ explanations for existing questions** (S).
- **E2 EN↔繁中 fill with a pinned HKDSE glossary** (S–M). A keyless half: bundle the
  EDB's official term list and flag non-standard terms (M).
- **E3 Source → HKDSE items** (M): paste a news extract, get Paper 1 MCQs (including
  combination statements) and Paper 2 parts with marks.
- **E4 Item quality check** (S): the non-AI checks are the paper health check; the AI half flags ambiguous
  stems and two defensible options.
- **E5 Differentiated copy** (M), **E6 data-response builder** with diagrams from a preset
  vocabulary, never raw model coordinates (L).

## F. File management — continues the 2026-09-24 dashboard

- **F3 Tags, stars and filter chips on the dashboard** (S–M); extend
  `src/components/start/dashboard.ts:visibleSummaries`. **F4** total marks and page
  count on each card, derived (S). **F5** full-text search of question text (M, shares
  an index with C2).
- **F6 Local version snapshots** (M) — on export and before import; watch the quota.
- **F7 Collections** exported as one `.docx` (M).
- **F8 Department sharing via a shared cloud folder** on desktop (M): read-only until
  "Copy to edit", author initials, conflicted-copy detection. *OCR, Kognity.*

## G. After the paper is sat

- **G1 Item analysis from pasted results** (M): facility, discrimination, distractor
  choice, topic breakdown, combined across versions (Gradescope cannot). Results live in
  a separate file keyed by question id — documents and the corpus are untouched.
- **G2 Follow-ups** (S each, after G1): corrections worksheet, retrieval sets.
- **G3 Teacher-defined level boundaries** (S), labelled a school estimate — HKEAA
  publishes no cut scores.
- **G4 In-browser phone OMR** (L) — do A4 first; existing apps already scan.

## Other


- **Presentation mode** (M): one question at a time, reveal the scheme. *Kuta.*
- **Large-print / dyslexia output profile** (M) — conflicts with the fixed 12pt line, so
  it must be a separate profile. *Twinkl, Wayground.*
- **Product page** (S): the aimakecoolstuff.com Econ-editor page has no screenshots, no
  "open the app" link, no desktop download and no Chinese version.

## Deliberately not doing

AI marking of student scripts (student data + server); web share links / QR (need
hosting); storage caps or expiry; a free-form canvas (layout is slot-based by decision);
shipping HKEAA past-paper content; embedding any API key in the bundle; year-specific
paper templates (e.g. "2028 Paper 2") — the generic mock template serves every year,
and a dated template would need re-doing annually.
