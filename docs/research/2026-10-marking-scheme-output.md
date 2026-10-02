# A marking scheme of its own (research, 2026-10-02)

The question, from the user: can a teacher get a **marking scheme / answer sheet as its own
document**, rather than the Teacher version of the worksheet? Papers come in different types and
sometimes an "easy-looking" version. Is there a structured UI for all the answer outputs, or could
teachers design their own marking-scheme version? Research only; nothing is built.

## 1. Short answer

- **A separate document already exists**: the **Answer key** (`src/render/answerKey.ts`). It is a
  real marking scheme (MC grid, HKEAA notation, levels, EC, model and answer-layer diagrams, version
  map, combined Paper 1 + Paper 2). It is hard to find and cannot be shown on screen: `.docx` only,
  behind Export → What → Answer key. The dialog greys "Student or teacher copy" when it is picked.
- **What is missing** is the *structure around it*. There is no on-screen view, no PDF and no clipboard
  copy. It cannot be configured (title, header, preamble, MC grid shape, totals). There is no
  student-facing "suggested answers" handout and no student answer sheet. Easier or differentiated
  versions are not linked to each other.
- **Recommendation**: make the answer documents a **third view** beside Student and Teacher. That view
  previews, prints and exports through the same IR. Customisation is **presets plus a few switches**,
  not free design. Phase it so the first step needs no schema change.

## 2. What exists today (verified in code and generated samples)

| Output | What it is | Backends | How a teacher reaches it |
|---|---|---|---|
| Student version | The paper, answers filtered out by `includeNode` (`src/render/ir.ts`) | preview, `.docx`, PDF, clipboard | Toolbar Student/Teacher |
| Teacher version | The same paper with answers inline: MCQ "Answer: C" in red, structured answer in blue, the scheme after each leaf, a "Teacher Version / 教師版" banner. Writing room still prints | all four | Toolbar Teacher, or Export → "Student or teacher copy" |
| Answer key | A separate document. Title "… Answer key / 答案及評分參考"; per section an MC grid of 5 pairs per row, then explanations; "Question N" → `(a) (3 marks)` → answer → model diagram → answer-layer diagram → scheme; one grid per version plus a version map. No stems, no cover, no header (footer page number only) | **`.docx` only** | Export → Word → What → Answer key / Both |
| Combined answer key | Several saved documents' keys in one file (Paper 1 + Paper 2) | `.docx` only | Export → "Also include" |
| Other apps | ZipGrade, CSV, Kahoot, Blooket, MCQ only. **Ignores versions B–D** | files | Export → Other apps |

**The answer data a scheme can draw on.**
- **MCQ:** `answerIndex`, explanation, per-option rationale, provenance.
- **Parts and sub-parts:** `answer`, a `MarkScheme` (OR routes → groups with `n@`, any-N, first-only
  and `max` → points with `/` alternatives; plus levels and EC), `answerDiagram`, and the new diagram
  answer layer.
- **Totals** are derived (`schemeMax`, `schemeMismatch`).
- **Model hole:** a **no-parts structured question** (an essay) has no `answer` or `scheme` field.

**Versions today.** `Worksheet.versions {count, seed}` gives shuffled MCQ papers A–D, and the key
covers them all. Language (en / zh / bilingual) is an output mode. Document shape (classroom, Paper 1,
LQ, QAB) does not change the key at all. Differentiated or easier versions do not exist: Duplicate
plus hand-editing is the only route, and `lineage` drives no output.

**Terminology drift** to settle whatever is built:
- The chrome says 答案頁, the printed title says 答案及評分參考, the glossary says 評卷參考, and the editor
  says 評分方案.
- EC is 有效溝通 in the editor but 有效傳意 in print.

## 3. How others do it

**HKEAA (the house style HK teachers copy; even tutor-made schemes reproduce it)**

*Front matter and page*
- **Preamble:** a disclaimer ("for markers' reference… not model answers… alternative answers are
  acceptable") and a symbol legend: `/` alternative, `n@` marks per point, `max`.
- **Chinese version:** 評卷參考; 甲部 / 乙部.
- **Page:** a borderless two-column layout. A hanging `1. (a) (i)` label with the answer under it,
  and a right-hand **Marks / 分數** column. `(1)` sits on the first line of the point it rewards.

*Notation*
- `1@; max: 2` stacked beside a list of points.
- Lists end in "– any other relevant point".
- "[Mark the FIRST TWO points only.]" / [只批閱首兩項].
- **OR** / 或 on a line between whole alternative answers.

*Diagrams*
- The diagram is drawn in full and captioned "Figure 1".
- Marks are split into "Indicate in Figure 1:" (graph features, `(1)` each) and "Verbal elaborations:".

*Paper 1 and effective communication*
- **Paper 1 key:** a `Question No. | Key` table in two column pairs (1–25 | 26–45), blocks of five,
  optionally `C(90%)`, the share of candidates who chose correctly.
- **EC:** the 2028 framework's "EC: max 2" is a `Marks | Performance` table (2 / 1 / 0). I found no
  L1–L3 bands in DSE Economics; it marks by point.

**Other boards**
- **CIE:** a 4-column `Question | Answer | Mark | Guidance` table, with accept/reject rules in
  Guidance and one shared levels table at the end.
- **Edexcel:** a skills line per question (K/App/An) and MC distractor rationales.
- **AQA:** a "KEY LIST" grid for MC and AO tags.
- **IB:** "Answers may include:" plus markbands.

**Software**
- **One item set, several parallel documents.**
  - ExamWizard: paper, mark scheme and examiner report.
  - Exampro: "include mark schemes… can be shared separately".
  - ExamView: one key per scrambled version, a version map, a version ID in the header, bubble
    sheets, and an MC ↔ short-answer "bimodal" switch.
- **Print commands.**
  - Canvas: "Print Blank Quiz" / "Print Key".
  - Wayground: an "Answer keys" toggle (key on the last page), font S–XL, logo.
- **LaTeX `exam`:** one source. `solutionorlines` prints blank lines *or* the solution in the same
  space, so both copies paginate identically.
- **OMR** (ZipGrade, GradeCam, Akindi, Moodle Offline Quiz): the student answer sheet *is* the
  product, with one key per version.
- **Differentiation:**
  - Diffit and MagicSchool give each level **its own key**.
  - Tiered "support / core / extension" sheets keep one scheme only because they keep the same
    questions and marks and vary the scaffolding (hints, sentence starters, more space, bigger type).
- **Word, today's improvised habit:** two files, or hidden text toggled at print time. Hidden text
  stays inside the student file, so it leaks.

Sources:
- HKEAA 2025 Sample Paper MS: https://www.hkeaa.edu.hk/DocLibrary/HKDSE/Subject_Information/econ/SamplePaper-2025-ECON-MS-E.pdf (`-C.pdf` for 中文)
- HKDSE 2017 MS (booklet scan): https://dsepp.com/wp-content/uploads/2018/10/2017-DSE-ECON-MS.pdf
- HKEAA 2024 briefing: https://www.hkeaa.edu.hk/DocLibrary/HKDSE/Subject_Information/econ/PowerPoint-ECON-2024.pdf
- CIE 0455: https://pastpapers.co/caie/IGCSE/Economics-0455/2024-May-June/0455_s24_ms_21.pdf
- Edexcel 9EC0: https://qualifications.pearson.com/content/dam/pdf/A-Level/Economics/2015/Exam-materials/9ec0-01-rms-20230817.pdf
- AQA 8136: https://filestore.aqa.org.uk/resources/economics/AQA-81362-SMS.PDF
- ExamView guide: https://mysavvastraining.com/assets/files/documents/ExamViewTestGeneratorUserGuide_1560286608.pdf
- ExamWizard guide: https://qualifications.pearson.com/content/dam/pdf/services/examwizard-user-guide-new.pdf
- LaTeX `exam`: https://math.mit.edu/~psh/exam/examdoc.pdf
- Wayground print: https://help.wayground.com/support/solutions/articles/158000405025-download-print-resources-as-worksheets

Not verified (paywalled or blocked): HK publishers' teacher kits, school mock schemes, Cambridge Test
Maker, OCR ExamBuilder, Save My Exams' scheme delivery.

## 4. What "an answer document" could mean, as four audiences

1. **Marking scheme 評卷參考** (for markers): marks, `n@`/max, marker notes, OR, EC, and figures with
   "Indicate in Figure n". This is the existing answer key, made visible and HKEAA-faithful.
2. **Suggested answers 參考答案** (handed back to students after the test): answer text and model
   diagrams only, with no `@`/max, marker notes or EC tables. This is common HK practice, and the
   HKEAA disclaimer itself says schemes are not model answers.
3. **Answer sheet 答題紙** (a blank for students): an MC bubble grid (ZipGrade-compatible) plus numbered
   answer boxes. Paper 1 already says "answered on a separate answer sheet" (`documentShape.ts`).
4. **Teacher copy** (the existing Teacher version): answers in place on the full paper. Keep it.

## 5. Recommended design

**A. The view.**
- The toolbar's Student | Teacher control gains a third choice, **Marking scheme 評卷參考** (or an
  "Answers ▾" menu holding the presets).
- The preview then paginates the answer document's IR (`renderAnswerKey`) into real sheets.
  - Print PDF and the clipboard work for free, because they read the same IR.
  - Export follows the view.
- The answers are typed on the page through the existing edit targets (`partAnswer`, `mcqExplanation`,
  and so on). The preview is the editor, so editing the scheme in its own view is natural. Scheme text
  would need edit targets, which it lacks today (`SYSTEM_ARCHITECTURE.md` notes this).

**B. Presets, not free design.** Layout is slot-based by decision (`IDEAS.md` § not doing).
- **HKEAA style (default):** preamble and legend (switchable), the Marks column, the two-column-pair MC
  table in blocks of five, "Indicate in Figure n:" around answer diagrams, and per-question
  "(Total: n marks)".
- **Suggested answers (student):** a strict subset. Answer text and diagrams only. Leak tests must prove
  that no marker-only content survives.
- **Detailed (CIE-like):** Question | Answer | Marks | Guidance, MC distractor rationales. Later, only
  if asked.

**C. A few switches**, persisted per document:
- the title text;
- a header and footer that are either "same as the paper" or the scheme's own (reusing bands);
- show question stems, or numbers only (Kuta's "in context");
- MC grid shape;
- show the HKEAA legend and disclaimer;
- totals per question, section and paper;
- language.

There is also a **per-question override**: hide from the scheme, answer only, or full guidance.

**D. Data and compatibility.**
- **Phase 1** is export- and view-time only, so it needs **no schema change**.
- **Saved settings** are one optional top-level field, e.g. `answerDocument?: {…}`. It must go in
  `KNOWN_KEYS` and needs a round-trip test. It controls presentation only, so an older build that
  ignores it leaks nothing. That is unlike the answer layer's nested `answer: true`, which does leak.
- **Per-question overrides:** optional fields on the question and part, with the same rule.
- **Essay holes:** add `answer?` and `scheme?` to `StructuredQuestion` for no-parts essays (optional,
  free; renderer plus key).

**E. Versions and "easy-looking" papers.**
- **Shuffled A–D:** already in the key. Also fix the CSV and ZipGrade keys for B–D, and print the version
  letter in the paper's header so a paper can be matched to its key (ExamView pattern).
- **"Easy-looking" = presentation** (bigger type, more space, a partly drawn diagram, hints). If the
  teacher means this, it should be a *print preset of the same document*. The same questions mean the
  same marks and **one scheme, with no new key**. This is the cheapest and strongest option. **Needs
  confirming with the teacher.**
- **"Easier" = different questions:** keep it as a Duplicate copy linked by `lineage`. Each copy's
  scheme is its own, and the combined answer key can print them side by side ("Standard / Foundation").
  Do not try to make one scheme serve two different question sets; every tool reviewed gives each
  level its own key.

## 6. Phases

| Phase | Scope | Size | Schema |
|---|---|---|---|
| 1 | Marking scheme view in the preview (existing key IR, paginated), PDF + clipboard, toolbar entry, one consistent term (評卷參考) | M | none |
| 2 | HKEAA fidelity: Marks column, legend and disclaimer, MC table 1–25 / 26–45 in fives, "Indicate in Figure n", question totals; essay `answer`/`scheme` | M | optional fields |
| 3 | Presets (Marking scheme / Suggested answers) + switches + per-question overrides, saved per document | M | `answerDocument?` + `KNOWN_KEYS` |
| 4 | Answer sheet 答題紙 (MC bubble grid, ZipGrade layout), version-aware CSV, version letter in the header; "easy-looking" print preset | M–L | maybe none |

## 7. Risks

- **Leaks:** a student-facing preset sharing an IR with a marker preset. Each preset needs its own
  "contains no X" test, alongside `docx.test.ts`'s student test.
- **Three backends must agree:** a new paginated document in the preview needs cover-verify and
  lq-verify-style proof.
- **Combined keys** inherit the first document's page setup (known loose end).
- **Scope creep:** "design your own" pulls towards a free canvas. Keep it to presets plus switches.

## 8. Decisions for the user

1. Which audiences matter first: the marking scheme (teachers), suggested answers (students), the
   answer sheet (MC bubble), or all three?
2. The entry point: a third toolbar choice (on screen, editable) or Export only with a preview?
3. Customisation depth: presets plus switches (recommended) or reuse bands and the cover for a fully
   designed scheme?
4. Save the scheme's settings per document (an optional field) or choose them each time at export?
5. Ask the teacher: does "easy-looking version" mean bigger and gentler presentation (one scheme), or
   easier questions (its own scheme)?
