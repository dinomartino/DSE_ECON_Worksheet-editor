# International exam-paper builders & question banks — research notes

Date: 2026-09-24. Researched via ego-browser (TaskSpace 1, page p3, now closed), help centres, vendor PDFs, and WebSearch/WebFetch. Raw page text and images were saved during research but are not kept in the repo.
"(unverified)" = from a third party, marketing copy, or not seen first-hand.

Screenshots / images taken during research (not kept in the repo):
- `intl/ew_build-12.png`: Pearson examWizard "Build a Paper" (from the official user guide PDF). Left: search-result tiles (description, marks, minutes, paper/series, View + Add). Right: question preview with tabs Question / Mark Scheme / Examiner's Report / Resources. Top bar: "My Exam Paper" name field plus a running total "N questions · N minutes · N marks", with View/Edit, Save, Remove all and Export.
- `intl/exampro_comb-science-search.png`: Exampro search popup. Tabs across the top (Trilogy / Synergy / Level / Type / Maths / Working Scientifically) and a tri-level spec tree with checkboxes.
- `intl/exampro_comb-science-questions.png`: Exampro question list. Each row shows a coloured level symbol, the topic title, a keyword line, a clock (minutes), a tick (marks) and an ID "Q23.1.01". Questions are dragged into a docked "Science homework" document panel that has export/minimise/close buttons. Rows already added appear greyed.
- `intl/exampro_share.png`: export targets are PDF, Word, Google Drive and QR/weblink.
- `intl/sme_tb.png`: Save My Exams Test Builder marketing mock (Easy/Medium/Hard chips, marks per question, "Download test").

---

## 1. Exam-board builders (official past-paper questions)

### Cambridge International — Test Maker
- **What / audience:** an online builder that assembles papers from Cambridge past-paper questions. For teachers at registered Cambridge schools only. Accessed through the School Support Hub or Cambridge GO.
- **Pricing:** it was subscription-only. It is now **free to approved Cambridge schools**.
- **Coverage:** only 6 IGCSE syllabuses (Biology, Business Studies, Chemistry, Maths, Add Maths, Physics), about 500 questions each. **No Economics.**
- **Features:**
  - Filter by syllabus topic.
  - Sort by question type, exam series, difficulty and number of marks.
  - Select by assessment objective (AO).
  - Preview a question before adding it.
  - "Review and check" summary: number of questions, difficulty level, total marks, topic and AO coverage.
  - Reorder questions.
  - Auto-generated **customised mark scheme** for each test.
  - Export as PDF or Word.
  - Save a test and return to it later.
  - Supports different tests for different learners.
- **Weaknesses:** very small syllabus coverage. No online delivery or marking (Tutopiya's comparison blog says so; it is a competitor, so treat as biased).
- **Sources:** cambridgeinternational.org/support-and-training-for-schools/support-for-teachers/teaching-and-assessment/test-maker/ ; help.cambridgeinternational.org/hc/en-gb/articles/360000416338

### OCR ExamBuilder (Cambridge OCR)
- **What / audience:** a free builder with unlimited users for staff at OCR centres. Students and private tutors are barred. Covers 60+ qualifications.
- **Filtering:**
  - Filters for level, question type, topic (with subtopic tree), unit/paper, and AO.
  - Keyword search, with "quoted phrases" for exact matches.
  - **Inclusive vs Exclusive filtering.** Exclusive means "tagged *only* AO1". It is poorly designed: you must tick parent, child and grandchild topics, or you get zero results.
- **Building:**
  - Add a whole question or **just parts of a question**.
  - "**Merged questions**": parts that cannot be split are auto-added together and stay together when reordering.
  - Drag to reorder in "View test". Numbering **and the mark scheme** reorder automatically.
  - Multi-select remove, and undo a removal.
  - Full-screen preview "for presenting in class".
- **Provenance:** each question shows its original question number, session and component code. Figure numbers keep the original numbering (e.g. "Figure 31.1") so they still match examiner reports.
- **Saving:** tests need unique names and get an optional "time available". My Tests lists them by last-updated date and is searchable. **Clone** makes "[name]_clone". Edit overwrites the original.
- **Sharing:** "Share with rest of your centre" (and un-share). Colleagues must **Copy Edit** before changing a shared test. Shared tests survive the author's account deletion. No sharing across centres.
- **Export dialog:**
  - PDF (looks like a real OCR paper) or **Editable Word** (looks less like one but can be edited).
  - Question paper, mark scheme or both. Separate files mean exporting twice.
  - Extra materials: examiner reports, inserts, data sheets.
  - **OCR cover page**, filled from the test (marks, time available, date set, instructions to candidates). Some cover fields are editable before export.
  - Footer "Created in ExamBuilder" so a test cannot pass as a real paper.
  - The layout packs questions to save paper. Answer space can only be adjusted in the Word export: "copy-paste extra lines in answer spaces".
- **Weaknesses:**
  - Minimum 1280×960 screen, otherwise the Export button is hidden.
  - Word images are linked, so they are blocked by Word's Trust Center.
  - 15-minute session timeout.
  - Single-subject tests only ("merge offline in Word").
- **Sources:** ocr.org.uk/qualifications/past-paper-finder/exambuilder/ ; …/exambuilder-faqs/ ; teach.ocr.org.uk/computing-exambuilder

### Pearson Edexcel examWizard (+ ResultsPlus)
- **What / audience:** free for teachers with an Edexcel Online account. Covers GCSE, International GCSE, AS/A level, International A level, BTEC and T Levels.
- **Areas:** Find Past Papers (Paper / Mark Scheme / Examiner's Report / Resources tabs), Build a Paper, and My Papers.
- **Build a Paper:** four panes (search filters, results, My Exam Paper, preview).
  - Filters: qualification, specification, year, series, unit, tier, skills, question type, AO, and a topic/section popup.
  - Each tile shows description, **total mark, expected time** and paper code/session.
  - Drag tiles to reorder.
  - The panel footer keeps **live totals: questions / time / marks**.
- **Output:** export to Word or PDF, or print, with an optional cover sheet. The mark scheme and examiner's report are generated automatically from the chosen questions.
- **My Papers:** edit, copy, delete.
- **ResultsPlus** is the separate results-analysis side (question-level analysis of real exam results).
- **Weaknesses:** a dated UI. You must pick a subject before logging in.
- **Sources:** qualifications.pearson.com/content/dam/pdf/services/examwizard-user-guide-new.pdf ; stg-eu.examwizard.pearson-intl.com/ExamWizardUserGuide.pdf (v3.0) ; qualifications.pearson.com/examwizard

### AQA Exampro (Doublestruck Ltd)
- **What / audience:** a paid bank of AQA GCSE and A-level questions, with mark schemes and examiner comments, for 30 qualifications. Unlimited teacher logins per school site. MAT (multi-academy trust) pricing available.
- **Pricing:** "from £75/year" (edtechimpact, unverified). Priced per subject bank (unverified).
- **Search:**
  - A popup with **subject-specific tabs** (e.g. Science: spec tree, Level, Type, Maths skills, Working Scientifically).
  - "Quick index" keyword search runs over topics and the description line only, not the question text.
  - Coloured **symbols** encode a facet (e.g. Maths: yellow circle = non-calculator, red cross = calculator).
  - Question IDs encode provenance (Q18JP1F.01 style, e.g. 2018 June Paper 1F Q1). IDs can be hidden.
  - "Question selector" auto-suggests questions from the chosen filters.
  - The Science AO filter was dropped: most questions span 2–3 AOs, so tagging is done at mark-point level in MERiT instead.
- **Building:**
  - Drag and drop from the Questions window into a docked **Document window**.
  - Shift-click to multi-add.
  - Drag questions between two open documents.
  - Limit of 60 questions.
  - Footer shows **Count / Marks / Time**. The time is editable on the cover.
  - Help text advises putting easy questions first.
- **Saving:** documents have Title and Author fields, and the help suggests departments agree naming conventions. "Save a copy" duplicates. An online library holds documents, plus **ready-made documents** and topic tests (editable Word, with a self-assessment feedback form: confidence score, mark, comment, "I can… / I need to…").
- **Export:**
  - PDF ("print-optimised"), Word ("ready to edit"), or Google Drive.
  - Choose components: questions, mark scheme, examiner remarks, notes.
  - **Toggle answer lines on or off** ("remove answer lines to reduce printing costs").
  - Cover page with Title, Subtitle, Time allowed, Total marks, Comments.
- **Sharing:**
  - Saved docs get a **weblink and a QR code**, readable without login.
  - "**Choose what to share**" can reveal the mark scheme later at the same URL. For example, set homework with questions only, then add the mark scheme after it is due.
  - Terms require that links stay within the school.
- **Analytics:** MERiT gives mock-exam analysis against other schools. Onscreen+ adds auto-marked questions and diagnostic reports.
- **Sources:** exampro.co.uk ; exampro.co.uk/science/ ; support.exampro.co.uk/kb (articles lnk.li/lJ, lk, lm, k3, LN, Ln, kJ, Nv, yi, NS, kp, k8, kP, Jz, nX)

### IB Questionbank (official, via Follett/Titlewave)
- **Licensing:** per-subject licence, **max 10 teacher logins per school**. Price is quote-based and not published. **Economics is available**, including an Econ + Business Management bundle.
- **Filters:** year, month, paper, level, time zone, question type, exam date, marks available, **command term** (which also returns similar command terms), syllabus-section tree, and keyword. You can filter by IB-authored vs your own questions and by "**previously used questions**" (per Follett).
- **Building:** drag and drop into the test. Create your own questions inside the bank. Folders for tests, duplicate a test.
- **Test Dashboard:** export PDF or **DOCX**, include or exclude **student answer space**, markschemes, examiner comments. Supplemental case studies and markbands are included.
- **Question codes:** e.g. `19M.1.SL.TZ1.S_10`.
- **Sources:** questionbank.ibo.org/instructions?locale=en ; follettcontent.com/classroom-curriculum/international-baccalaureate/questionbank

---

## 2. Commercial banks / platforms

### Save My Exams — Test Builder
- **What / audience:** teacher side of a large student revision brand. Questions are written in-house "to mirror command words and mark schemes". Covers GCSE, IGCSE, A level, IB and AP. **Economics** builders exist for AQA A-level, Edexcel A-level, IB SL/HL, CIE IGCSE, Edexcel IGCSE and CIE O level. No HKDSE.
- **Features:**
  - Filter by topic and **Easy/Medium/Hard**.
  - Mix question types (diagram, MCQ, extended).
  - **Teacher-Only Questions** that students cannot see, so tests stay fair.
  - Print-ready PDF download.
  - Assign to classes and see results.
  - Suggests differentiated versions for different ability groups.
- **Pricing (seen on savemyexams.com/teachers):**
  - Essential: £6/mo, billed £72/yr, "Basic Test Builder".
  - Premium: £12/mo, billed £144/yr, "Full Test Builder".
  - Free teacher account: unlimited test creation, but **1 download per week**.
- **Weaknesses:** PDF-first, with no Word export seen. Pricing is per subject/tier (per Tutopiya, biased). Not board-official.
- **Sources:** savemyexams.com/teacher-tools/test-builder/ ; /learning-hub/sme-articles/how-to-use-test-builder/ ; /subjects/economics/test-builder/ ; /teachers/

### Kerboodle (OUP)
- **What / audience:** a school platform tied to OUP textbooks. The Assessment tab has automated interactive tests and paper-based tests. Paper marks are entered in the **Markbook**, which feeds Reports. You can upload your own assessments (5MB file limit) and share them with the school via shortcuts. Uploads are hidden from students by default.
- **Plan Assist AI generators:**
  - Tools: MCQ, Worksheet, Very Short Answers, Glossary, and others.
  - Inputs: keywords, up to 3 textbook "cartridges", an optional uploaded Word/PDF, learner age, SEN needs.
  - Actions: **Generate / Regenerate / Refine**, then export to Word, PDF or quiz tools (MS Forms).
  - Output has answers at the end, with advice to "check for accuracy".
- **Sources:** support.kerboodle.com (assessment, plan-assist-multiple-choice-questions-generator, plan-assist-worksheet-generator)

### Educake
- **What / audience:** an online auto-marked quiz bank (UK science and others, ~30k questions per structural-learning.com, unverified).
- **Five-step wizard:** topic from spec → choose questions (filter by tier, type recall/application, low/medium/high demand; "**Choose random N**") → extras (message, links, **randomise order once or per student**) → dates → class.
- **Other:** preview as student, results grid with "LATE", markbook, analysis by question type and topic, department quiz templates.
- **Source:** help.educake.co.uk/how-do-i-set-a-quiz

### Seneca (teacher tools)
- "Exam Questions Only" assignments with up to 25 questions. Pick topics, **filter by marks**, and preview with the mark scheme.
- **AI-marked** free-text answers, which the teacher can re-mark. Per-question class results. Needs Seneca Premium (school subscription, price unverified).
- **Sources:** help.senecalearning.com/en/articles/6696847 ; /6536455

### Kognity (IB/IGCSE)
- "Exam-style question assignment". Filter by marks and paper. Preview question and answer.
- **Mark-scheme lock control:** the scheme stays locked until the teacher unlocks it.
- Reorder questions, add an instruction message, schedule sending.
- Students answer online, or on paper as a fallback.
- **Teacher-authored questions are shared with same-subject colleagues** and labelled with the author's initials. The rich editor has maths support. Questions link to a subtopic.
- Marketing claims 35k questions and "AI-supported scoring" (suggested score plus reasoning, confirmed by the teacher).
- Pricing is quote-based (unverified).
- **Sources:** intercom.help/kognity/en/articles/2828324 ; /3811287 ; kognity.com/products/ibdp/features/assessment/

### Revision Village (IB)
- School partnership with per-teacher pricing (unverified). Includes EducatorPro.
- "Create assessment → Build your own". A **Teacher-Only question bank** is kept out of students' reach and shown with a "Teacher-only" label and filter.
- Assessment folders, Newton AI auto-marking (including photo upload), class analytics.
- **Sources:** revisionvillage.com/schools/ ; help.revisionvillage.com/en/quarantined-questionbank

### InThinking (thinkib / thinkigcse Economics)
- Subscription subject sites for teachers with hundreds of classroom materials, updated weekly. "Written by expert practitioners and not by AI". IGCSE Econ by Paul Hoang.
- A resource library, **not a paper builder** (no builder seen).
- **Source:** thinkigcse.net/economics

### Tes / Physics & Maths Tutor / "Exam Papers Plus"
- **Tes:** a marketplace where teachers upload resources free or priced (worksheets, exam packs). No builder.
- **PMT:** free, no login. Past-paper **questions by topic (QBT)** as PDFs with mark schemes, across boards (Economics included). No builder.
- **"Exam Papers Plus":** no distinct product found (searches only returned SME, PMT, exam-mate and others). **Unverified / likely not relevant.**
- Lesson from all three: teachers build workarounds out of topic-sorted PDFs.

---

## 3. Test-generator software (publisher bank + desktop authoring)

### ExamView Test Generator (Turning Technologies; bundled with 10k+ textbooks)
Source: the ExamView Test Generator manual (study.sagepub.com/sites/default/files/ExamViewManual.pdf) and help.cengage.com.
- **Platform:** desktop (Win/Mac) test files. A **password per test** is optional.
- **Question metadata:** difficulty, reference, learning objective, national/state/local standard, topic, keywords, item ID. Questions can be flagged "**do not use on tests**".
- **Selection modes:**
  - QuickTest Wizard: random picks from banks.
  - Randomly, with N per question type.
  - From a list: choose by number from a printed bank.
  - While viewing.
  - By Standard: counts per objective.
  - By criteria.
- **Narratives:** shared stimulus text with linked questions. Questions stay grouped with their narrative when reordering.
- **Layout:**
  - Group by question type (with per-type instructions, optional new page per type, restart numbering) or mixed.
  - **Sort by any metadata**, e.g. increasing difficulty.
  - Two-column mode, with rules for too-wide questions and a per-question "always one column".
  - **Answer Space on/off.**
  - Points shown inline, on a line before, or hidden.
  - First-page vs subsequent-page headers and footers.
  - Style Gallery of standard test looks (e.g. PSAT).
  - Replace Font across the test.
  - **Adjust Choices** reduces every MCQ to fewer options.
  - **Bimodal questions:** the same item prints as MCQ or as short answer.
- **Versions:**
  - Scramble sections, questions and/or MCQ choices. Choices can be marked "**do not move**" (e.g. "All of the above").
  - Version letters A–Z.
  - At print time: 1–26 versions, each with its **own answer sheet**, an **answer strip**, and a **version map** (a correlation chart of how each version was scrambled).
  - Bubble forms for scanning.
- **Translate Test:** swaps each question for its twin in an alternate-language bank (e.g. English↔Spanish).
- **Test Summary Report:** banks used, points, count by type, objectives, standards.
- **Export:** RTF, HTML, question-bank format (lets you merge banks), LMS zips. XML import.
- **Weakness:** "designed for a print-era workflow" (notelyn.com, biased). Tied to publisher banks.

### Pearson TestGen (Tamarack Software)
- **Platform:** desktop app with publisher testbanks (.bok).
- **Features:**
  - Drag questions into a test.
  - Header/footer editor.
  - Answer-key preview on screen.
  - **Scramble with pin/unpin** (keep specific questions in place).
  - Lock/unlock algorithmic values.
  - Assign point values.
  - Answer-blank width and count for short answers.
  - Filter by difficulty, topic or objective, and static vs algorithmic.
- **Export to RTF:**
  - "Formatted Text File" is a print-exact layout built from columns and section breaks, with the answer key after the test. Editing it breaks the layout.
  - "Easy Edit" RTF drops those breaks so it can be edited safely.
- This is the exact tension we have with .docx.
- **Sources:** tamarack-software.com/webhelp/webhelp76/printexport/rtf.htm ; highered.mheducation.com/…/Test_Gen_Users_Guide.pdf ; pearson.my.site.com TestGen get-started

### Respondus 4.0
- Windows authoring for LMS (Canvas, Blackboard, Moodle…), plus print.
- **Print Options:** Exam / Exam with Answer Key / Answer Key only. Edit headers. **Number of exam variations** (randomised question order). Save to Word, RTF or text.
- Imports questions from Word. Campus licence (price not checked).
- **Sources:** web.respondus.com/he/respondus/ ; alamocolleges.screenstepslive.com/a/1534056

### ExamSoft (Turnitin) — authoring side
- **Categories:** hierarchical tags such as Bloom's, course objectives and accreditation. Bulk-tag many questions. A sub-category tag does *not* imply its parent.
- **Assessment Blueprint:** define content areas, either by category ("5 knowledge, 3 application, 2 synthesis") or free-form by type. Each section shows a **"0/5 Questions" counter** until filled.
- **Sources:** support.examsoft.com articles 11168066027661, 11147598207757

---

## 4. LaTeX `exam` class (CTAN examdoc.pdf) — print-first feature checklist
- Automatic numbering for questions → parts → subparts → subsubparts.
- Points can print:
  - at the start of the question, in the left margin, or in the right margin;
  - right-aligned at the end of the question (`\droppoints`, which is the DSE "(3 marks)" style);
  - in brackets, parentheses or a box;
  - with a custom word ("marks"), and half points.
- **Auto-sum points per question and per page.** `\numquestions` and `\numpoints` can go in instructions ("This exam has N questions, for a total of M points").
- `\titledquestion` gives named questions. `\bonusquestion` / `\bonuspart` hold bonus points that are excluded from totals and get their own tables.
- MCQ layouts: `choices`, `oneparchoices` (inline), `checkboxes`. `\CorrectChoice` is emphasised only in the answers build.
- `\fillin[answer]` puts a blank in running text that shows the answer in the key. `\answerline` is for short answers.
- **Answer space types:** blank `\vspace`, empty box, lined, **dotted lined**, **grid/graph paper**.
- **Solution toggling:** a single `\printanswers` switch. The `solutionorlines` / `solutionordottedlines` / `solutionorbox` / `solutionorgrid` environments print the solution in the teacher build and **the same amount of answer space** in the student build.
- **Grade tables** (`\gradetable[v|h][questions|pages]`) list the points possible with an empty "score" row. **Point tables** omit the score row. Also bonus tables, combined tables, and **grading ranges** (partial tables for a section: first/last question, points in range).
- Headers and footers in three parts (left/centre/right). First page can differ, as can the last page (`\lastpage`), and odd vs even pages.
- **Continuation messages:** `\ifcontinuation` / `\ifincomplete` / `\ContinuedQuestion` give "Question 3 continues on the next page" and "(Question 3 continued)".
- `coverpages` environment, with roman-numbered cover pages and separate headers and footers.
- `\uplevel` / `\fullwidth` put instructions for a group of questions ("Answer ALL questions in this section") at full width.
- Cross-references to question numbers.
- Overleaf's exam templates are thin wrappers over this class (not separately browsed).

---

## 5. Patterns across the category
1. **Live totals bar** (questions / marks / time) while assembling. This is universal (examWizard, Exampro, Test Maker "review and check").
2. **Auto mark scheme** that follows question order. This is universal. Reordering the paper reorders the scheme.
3. **An export dialog is the product's centre:** paper / mark scheme / both, answer space on/off, cover on/off, PDF vs editable Word.
4. **Provenance codes** on every question (session / paper / Q#), and the original figure numbers are kept.
5. **Question-part granularity:** a bank can hold part-level items, with "merged" parts that must travel together.
6. **Clone-then-edit** and a **department share** that forces a copy before edits.
7. **Teacher-only / quarantined questions** kept away from students to keep tests fair (SME, RV).
8. **Tags:** topic tree + difficulty + command term + AO + marks + type + "previously used". Tagging at part level beats whole-question tagging.
9. **Versions** (ExamView, TestGen, Respondus): scramble questions and/or options, pin items, version letter, per-version key, version map.
10. **AI** shows up only as draft generation (Kerboodle) or suggested marking (Seneca, Kognity, RV). It always requires teacher review.
11. **Word export is always the lossy "editable" option** (OCR, TestGen). Nobody does print-faithful and editable in one file, which is where our .docx pipeline differs.

---

## 6. Ideas for us (ranked)

Constraints:
- Static web plus Tauri desktop, no server.
- AI needs a user-supplied key.
- Everything must export to .docx.
- Any new stored field must be optional and go in `KNOWN_KEYS`.

A quick repo scan shows:
- We already have `LanguageMode en|zh|bilingual` (BiText), student/teacher `VersionMode`, combination-MCQ `statements`, dotted `answerSpace`, and a Paper 1 cover.
- We have no topic/difficulty tags, no question library, no separate mark-scheme/answer-key export, and no shuffling.

1. **Paper summary bar + blueprint check** — size S.
   - (a) Shows live questions, marks and estimated time, plus marks by topic/difficulty once tags exist. An optional target ("Paper 1: 45 MCQ, 1 h") shows a "38/45" counter like ExamSoft's.
   - (b) Inspired by: examWizard totals, Exampro Count/Marks/Time, CIE Test Maker "review and check", ExamSoft blueprint.
   - (c) Marks are already derived, so this is pure UI. The bar must carry `data-print-hide`.
2. **Export options dialog: paper / mark scheme / answer key / both** — size S–M.
   - (a) One click produces the student paper plus a **separate compact mark-scheme .docx** (Q#, answer, marks; an A/B/C/D grid for MCQ).
   - Also: answer space on/off to save paper, and cover on/off.
   - (b) Inspired by: OCR export window, IB Test Dashboard, Exampro, Respondus "Answer Key only".
   - (c) Reuses the IR. The mark scheme is a new render target from the same `RenderNode[]` source.
3. **Local question library with HKDSE tags** — size L; the core enabler.
   - (a) "Save question to library" and "Insert from library". Tags: curriculum topic (compulsory/elective), difficulty, command word, paper/section, source code ("DSE 2019 P1 Q12", "Own"), and **last used with class / date**.
   - Filter by tag and keyword. Tag at the part level where possible.
   - (b) Inspired by: IB Questionbank (command term, "previously used"), OCR (inclusive/exclusive AO), Exampro (IDs, symbols), ExamView metadata.
   - (c) Web: IndexedDB. Desktop: a folder of files. Tags are optional `Question` fields and must go in `KNOWN_KEYS`.
   - We ship **no content** because HKEAA papers are copyrighted. Teachers fill the library themselves.
4. **Department sharing without a server** — size S–M.
   - (a) Export/import a library or paper bundle (.json/zip).
   - Desktop: point the library at a **shared OneDrive/Google Drive folder**.
   - Shared items are read-only until the teacher clicks "Copy to edit". Author initials appear on shared items.
   - (b) Inspired by: OCR "Copy Edit", Kognity initials, Exampro naming conventions.
   - (c) Files only, no accounts.
5. **MCQ A/B versions** — size M.
   - (a) Anti-copying versions for Paper 1 mocks: shuffle question order, and option order where it is safe. Also a pin toggle, a version letter in the header, a per-version answer key, and a version map.
   - (b) Inspired by: ExamView (do-not-move choices, version map, answer strip), TestGen pin/unpin, Respondus variations.
   - (c) Store only a seed and version count, and derive the order, which fits "derived, never stored".
   - **Never shuffle options on combination MCQs (`statements`)** or on options that refer to other options.
   - Exports as one .docx per version.
6. **"For examiner's use" marks grid on covers** — size S–M.
   - (a) An auto question-by-question max-marks table with empty score cells, plus a total. Optionally a grading range per section.
   - (b) Inspired by: exam-class `\gradetable` and partial tables, the OCR cover.
   - (c) Derived from marks. This is a real table in .docx, not a ColumnsNode.
7. **Diagram answer space** — size S–M.
   - (a) "Draw a diagram" parts get a boxed or grid space, or **pre-drawn blank P/Q axes**, instead of dotted lines. This is an Econ-specific gap.
   - (b) Inspired by: exam-class `\fillwithgrid` and `solutionorgrid`, ExamView graph tools.
   - (c) Reuses diagram geometry and exports as one PNG.
8. **Answer-in-the-space teacher version** — size M (check what the teacher view does today).
   - (a) The teacher copy prints the model answer *inside* the student's answer space, so both versions paginate identically and page references match.
   - (b) Inspired by: exam-class `solutionorlines` / `solutionordottedlines`.
9. **Continuation furniture** — size S–M.
   - (a) "Question 5 continues on next page" and "(Question 5 continued)", derived from the paginator.
   - (b) Inspired by: exam-class `\ifcontinuation`.
   - (c) Must match between preview and .docx. It is hard in Word, since Word re-paginates, so it may be preview/PDF-only.
10. **Assemble to target from the library** — size M, after #3.
    - (a) "Pick 10 MCQ on Elasticity, mixed difficulty, ~20 marks" gives a draft paper. Can also sort by difficulty (easy first).
    - (b) Inspired by: Educake "Choose random", Exampro question selector, ExamView QuickTest / sort.
11. **Bimodal MCQ** — size S.
    - (a) Print a chosen MCQ without its options, as a short-answer version for differentiation.
    - (b) Inspired by: ExamView bimodal / Adjust Choices, SME differentiated versions.
12. **Local markbook / QLA (question-level analysis)** — size L; lower priority.
    - (a) Enter marks per student per question after a paper mock to get topic/AO weakness charts, with CSV export.
    - (b) Inspired by: Kerboodle Markbook, MERiT, ResultsPlus, Educake analysis.
    - (c) Local-only storage. Student names raise privacy concerns.
13. **AI drafts with the teacher's own API key** — size M.
    - (a) Draft MCQ distractors, a mark scheme for a structured question, or TC↔EN translation of a stem. All output is reviewed before insertion.
    - (b) Inspired by: Kerboodle Plan Assist (Generate/Regenerate/Refine), Kognity and Seneca suggested marking.
    - (c) BYOK is the only option: no server, and the key must be stored locally.

**Non-goals / cautions:**
- Web share links and QR codes (Exampro) need hosting.
- Do not reproduce HKEAA content.
- Bilingual is already a differentiator. ExamView's "Translate Test" (twin items across banks) is a clunkier version of what BiText already does.
