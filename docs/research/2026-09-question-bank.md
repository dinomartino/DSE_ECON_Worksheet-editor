# Question bank: deep analysis (2026-09-29)

Four slices, merged: a competitor survey, the HK DSE context, assessment-design theory,
and a gap analysis of the 題庫 on `develop` (3922e85, driven in Chromium). The ranked
backlog it produced is `docs/IDEAS.md` § C. Web claims carry their source; *inferred*
marks a conclusion no source states.

## 1. What every mature bank does (table stakes)

- **Filter-first, syllabus-shaped.** Exam-board builders filter by spec point, type, AO,
  demand and series ([Exampro](https://www.exampro.co.uk/science/),
  [Exam-Mate](https://www.exam-mate.com/topicalpastpapers),
  [Save My Exams](https://www.savemyexams.com/teacher-tools/test-builder/)); LMS banks
  pair a folder tree with tags ([Moodle](https://docs.moodle.org/502/en/Question_banks)).
- **The mark scheme travels with the question**, and the builder emits a matching scheme
  ([Exam-Mate](https://www.exam-mate.com/faq/Build%20Exam)). Its absence is a top complaint.
- **Versions and "where used".** Moodle keeps a history per edit, lets a quiz pin a version
  or "always latest", and shows where used plus facility/discrimination.
- **Draft vs ready.** Moodle 5 admits only "Ready" questions to a quiz; Learnosity filters
  published / unpublished / archived.
- **The add button lives in the destination.** Moodle "Add › from question bank", Canvas
  "+ Item bank", Google Forms "Import questions", Blackboard "Reuse questions" are all
  launched from inside the paper being edited, so the target is never in doubt. Exampro
  drags from the bank onto a visible paper. *Inferred:* our "Add to ‹last worksheet›"
  confused because the target was implicit and lived outside the bank.

## 2. Recurring complaints (what to avoid)

- **Duplicates.** Copying a quiz copies its questions; one Moodle site held 330,000+
  ([forum](https://moodle.org/mod/forum/discuss.php?d=452758)). Our lineage guards
  copies; retyped questions are still unguarded.
- **Silent divergence after copy** (Blackboard documents it). Say at add time whether the
  teacher gets a copy or a link.
- **Hard to find and organise; no "where used"; ownership locked to one teacher** (Canvas).
- **Rigid rules**: Canvas forces equal points per bank. Keep per-question marks.

## 3. The Hong Kong context

- **Syllabus** (EDB C&A Guide, 2025 update): compulsory Topics A–J, electives EP1 (monopoly
  pricing, competition policy) and EP2 (trade theory, growth). Key points are numbered
  (G(ii)). **From the 2028 DSE the elective is optional** and Topic J gains the balance of
  payments ([EDB circular](https://www.edb.gov.hk/attachment/tc/curriculum-development/renewal/CM/EDBCM24113C.pdf)).
  `src/model/topics.ts` already carries `bop`.
- **Assessment (2026)**: Paper 1 MCQ 30%, 1 h; Paper 2 2 h 30 — A short 26%, B
  structured/essay/DRQ 35%, C elective 9%
  ([HKEAA](https://www.hkeaa.edu.hk/DocLibrary/HKDSE/Subject_Information/econ/2026hkdse-e-econ.pdf)).
- **Scheme conventions** (2025 sample scheme): `1@; max: 2`, `/` for alternatives, "any
  other relevant point", "[Mark the FIRST TWO points only.]", "for reference only".
- **Citation form**: "2019 HKDSE Economics Paper 2 Question 4(b)".
- **Copyright** ([HKEAA licence](https://www.hkeaa.edu.hk/en/resources/publications/licence/)):
  per-school, premises-only, ≤ 75% of any one paper, every copied question carries its
  particulars plus "Licensed by copyright owner: HKEAA", and the cover sheet forbids **use
  with AI tools**. So: ship no HKEAA content, never share across schools, store the source
  so the particulars can print, and warn before a ✦ AI verb sends a question marked
  HKEAA-sourced.
- **Workflow** (*inferred*): the panel head sets a uniform test with a 雙向細目表 (topic ×
  question type); teachers contribute 校本 questions; papers go to the print room as Word,
  in EN and 中文 for EMI/CMI classes; nobody wants a class to see a question twice.
- **Market**: Aristo 試題庫+ (bilingual, 2026 questions), tutorial centres with 2000+
  questions sorted by their own note numbers. Norms: by-topic, MCQ/LQ split, EN/中 pairs.

## 4. Assessment-design principles

1. **Index the marked part, retrieve the whole question.** Topic lives on the question;
   command word, skill band and marks belong to each leaf part.
2. **Derive, don't ask.** A teacher fills one field (topic). Marks, type, time, stimulus
   kind, languages, scheme present, and the command word (first verb of a leaf) derive.
3. **Measured beats guessed.** Teachers predict difficulty poorly
   ([Impara & Plake 1998](https://onlinelibrary.wiley.com/doi/10.1111/j.1745-3984.1998.tb00528.x));
   one real % correct outweighs a difficulty label.
4. **Statistics belong to a version** (`contentKey`), not a lineage: an edit makes old
   facility false. Show an earlier version's figure greyed.
5. **n = 30 is small.** Show bands and n, never two-decimal discrimination. Flag only: a
   distractor beating the key among top scorers, negative discrimination, a distractor
   under 5% in two sittings.
6. **Results are student data.** Anonymous aggregates in a separate file, never in a
   `Worksheet`, but in the backup zip (they are not rebuildable).
7. **Anti-repeat is per cohort, not per class label.** "5A 2025-26" is "6A 2026-27".

Three skill bands from DSE command words replace Bloom/AO tagging:
**Know** (state, identify, define, 列出/指出) · **Apply/Analyse** (explain, illustrate
with a diagram, calculate, compare, 解釋/試以圖解說明/計算) · **Evaluate** (discuss,
evaluate, to what extent, 討論/評論/你是否同意).

## 5. What our 題庫 does, and where it falls short

The engineering core is sound: a derived, rebuildable index (`src/library/indexer.ts:rowsOf`),
lineage on copies, deterministic class-aware Fill (`src/library/fill.ts:pickFill`),
bilingual teacher/student preview, back-to-bank that keeps filters and focus.

The weak points are the **meaning of a "use"** and the **build flow**:

- **`updatedAt` means three things**: index freshness, the date of a use, and which copy
  leads a group (`src/library/history.ts:newestFirst`). Tagging a 2024 test from the bank
  bumps it, so it reads as used this year and becomes the default version. Curation
  corrupts history.
- **`classTag` is one free string.** A uniform test sat by 5A–5E cannot say so; cohorts
  across years don't match; drafts count as uses. None of `classTag`, `lineage`, `tags`,
  `kind`, `bankHidden` is on `main` yet, so **the shape is still free; after release it
  costs a migration.**
- **Tags live on copies.** Review-page Edit writes one copy, tag-as-you-go writes all,
  bulk Set topic writes the lead row; coverage and the rail then disagree.
- **The cart can't be inspected or kept.** The tray shows count, marks and topic mix but
  not the picks; picks vanish on Open in worksheet or Home; "New worksheet from these"
  always makes a sectionless Classroom sheet in click order.
- **Two surfaces, two grammars.** The editor tab (Insert, Fill, no preview) and the bank
  screen (select → tray, big preview) duplicate their filter code, and neither shows the
  other's strength.
- **Raw slugs leak** ("C.intervention") in Topics, tray and editor rows.
- **Unused facts**: `hasDiagram` and languages are indexed but not filterable; MCQ
  `provenance` is not indexed at all.
- **Scale**: every autosave re-keys every question including image data URLs; desktop
  rewrites the whole index file per commit; the review rail is not virtualised.
- **Concurrent tabs**: the bank screen writes tags into papers; a second tab with that
  paper open overwrites them on its next autosave.

## 6. Hazards found in the code

- **Never nest a new setting inside `target`.** `src/model/paperSummary.ts:targetOf`
  rebuilds the target from `marks`, `minutes` and `counts` only, and the Setup dialog
  writes through it, so any shipped build erases unknown keys inside `target`. A
  blueprint must be its own top-level field in `KNOWN_KEYS`.
- **A new question-level field must also join `contentKey`'s ignored list**, or it
  splits one question into two "versions".

## 7. Traps

Required metadata forms; six-level Bloom or AO 1–7 tagging (teachers disagree, data is
noise); IRT or KR-20 on one class; stats that follow `rootId` across edits; student names
in documents; password-encrypted banks (a lost password is a destroyed file); QTI export
(HK schools are paper-first, bilingual text and diagrams degrade); shuffling Paper 2 or
pinned MCQ options ("all of the above").
