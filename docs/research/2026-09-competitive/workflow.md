# Research slice: the assessment workflow around authoring (before and after the paper)

Researched 2026-09-24. Sources were read live (ego-browser page p2, WebFetch/WebSearch, and HKEAA/EDB PDFs through pdftotext). Screenshots were taken during research but are not kept in the repo. **[unverified]** marks a claim I could not confirm on a primary page.

Our starting point, from the repo: `McqQuestion` has `options`, one `answerIndex`, optional combination `statements`, and `explanation`. Structured parts and sub-parts have `marks` and a free-text `answer`. There is no topic tag, no shuffling or versions, no structured marking points, and no results data. Desktop documents are files under `$APPDATA/worksheets/`. The web app keeps documents in localStorage.

---

## 1. Marking and grading products

### Gradescope (Turnitin)
- **What it is:** paper and online grading. The teacher uploads a blank template PDF, draws a question outline on it, and uploads batch scans. Gradescope matches each script to the roster, and grading is done question by question against dynamic rubrics.
- **Pricing:** there are two plans. *Basic* is free and includes dynamic rubrics, question-by-question grading, assignment statistics, regrade requests, data export and the student app. *Institutional* is quote-based and adds AI-assisted grading, bubble sheets, anonymous grading, rubric import, LMS, SSO and multi-grader. It starts with a one-term institutional trial. (turnitin.gradescope.com/pricing)
- **Bubble sheets:** up to **5 versions**, each with its own key, points and scoring style.
  - Scoring styles are Exact and partial-credit styles.
  - Marks the AI is unsure about go to an "Uncertain Marks" modal, which shows the cropped bubble image so a human can confirm.
  - A CSV "Download Responses" export exists.
- **Item analysis (seen in the guide screenshots):**
  - One row per question: the % choosing each of A to E, the key % in green, and **a distractor in red when it beat the key**.
  - Weight, a "Disc score" (point-biserial), and a correct-response bar.
  - An **Insights panel** flags discrimination below 0.20. Its "Investigate" modal shows difficulty (Hard <50%, Medium 50–84%, Easy ≥85%) and "25% of top 27% vs 33% of bottom 27% answered correctly", with buttons to Rubric and Answer Key.
  - Test level: Cronbach's alpha (guide: >0.5 typical, 0.8 is research grade), SD, and SEM.
- **Weakness:** statistics are **per version only**. "An overall assignment statistic is not provided under the All tab." Teachers are told to download a CSV and line up the versions themselves.
- **AI answer groups:** Gradescope overlays the blank template on each script to extract the student's ink, then clusters identical answers so one grade covers a whole group. It needs a template identical to what was printed.
  - Our exact exported PDF is that template, which makes us naturally compatible.
- **Tags:** tag questions with concepts or chapters, then view statistics by tag.
- URLs: https://guides.gradescope.com/hc/en-us/articles/22065675043341 · https://guides.gradescope.com/hc/en-us/articles/24838908062093

### Crowdmark
- **What it is:** the teacher uploads the template PDF and Crowdmark stamps **a QR code on every page**. Scans auto-sort by student and page. Grading is split across a team with a comment library, and marked work returns to students.
- **MCQ:** Crowdmark appends up to two 100-question A–E bubble sheets to each booklet (200 MC maximum). Scoring modes are Either/or, Partial and Exact. Changing the key regrades everything. It is A4-compatible and can print large-format for accessibility. The cover page takes OCR name/ID matching.
- **Weakness:** the question prompts are not linked to the bubble sheet ("Crowdmark doesn't currently offer a way to link the question prompts to the bubble sheet").
- **Pricing:** quote only. It is licensed per instructor, department or enterprise. An old case study quotes $3.25 per student per course **[dated]**.
- URLs: https://www.crowdmark.com/help/using-multiple-choice-questions/ · https://www.crowdmark.com/help/getting-started-instructor/

### ZipGrade: the benchmark for cheap OMR
- **What it is:** a phone app on iOS and Android that scans printed bubble sheets with the camera and **works offline**. It also grades PDFs from a sheet-fed scanner (75–300 PPI, one sheet per page), with failed pages returned for review.
- **Pricing:** **100 papers a month free, US$6.99 a year unlimited**. Schools can pay by purchase order.
- **Sheets:** standard 20, 50 and 100 question sheets, plus a Custom Form Wizard. Supports MC, true/false, matching and gridded numeric. Sheets print on plain paper and can have student info pre-filled.
- **Keys:** multiple key versions per quiz and alternate answers with partial credit. "a&i" sets the points for an attempted but incorrect answer.
- **CSV key import format** (primary page), one row per key × question × response: `Key, QuestionNo, Response|Mapping, Points, Tag1, Tag2…`.
  - A **"mapped alternate key"** row maps a version-B question to its primary question number, so the analysis rolls up to the canonical question.
  - Mapping only works when the options are *not* reshuffled. Otherwise each version gets its own provided answers.
- **Analysis:** "Discriminant Factor" (Pearson; aim for >0.2, and a strong negative suggests a mis-keyed item), answer distribution, standards/tag reports, and CSV export.
- URLs: https://www.zipgrade.com/ · https://support.zipgrade.com/hc/en-us/sections/200358085-ZipGrade-General

### Akindi
- **What it is:** a web-based "Scantron alternative" that works with any scanner. Each sheet carries **a QR code that auto-sorts by course, assessment and instructor**, so mixed batches can be scanned together. Scans can also be uploaded by email.
  - Errors come back as a cropped image, so nothing needs rescanning.
- **Analysis:** KR-20 and point-biserial item analysis, plus **"feedback on test design"**. Editing the key regrades everything. Students can be emailed their marks and chosen answers, with the correct ones shown.
- **Importer:** converts Word .docx to QTI with NLP. It detects the key from **bold, italics, asterisk, highlight, or an "Answer: A" line**. Questions must be numbered 1, 2, 3 and options lettered a, b, c. It is licensed separately.
- **Pricing:** annual licence scaled by the number of student tests graded. Quote only, with a 30-day pilot.
- URLs: https://www.akindi.com/paper · https://www.akindi.com/understand-assessment · https://help.akindi.com/en/articles/8269348

### GradeCam, now Gradient
- **What it is:** scanning by webcam, document camera or phone. Item analysis, standards reports and longitudinal/demographic reports. Gradebook sync with PowerSchool and others.
- **Pricing:** **$3.50 per student, packages from $2,800 a year** plus onboarding. US district-oriented.
- URL: https://gradientk12.com/pricing/

### Remark Office OMR
- **What it is:** desktop OMR. Forms are designed in any word processor and printed on plain paper, then read from TWAIN scanners or PDF/TIFF files. It handles cross-outs and multiple marks.
- **Analysis:** "Quick Stats" gives difficulty, discrimination, point-biserial, distractor analysis and KR-20. Export to Excel, SPSS and CSV.
- **Pricing:** perpetual licence **[price not seen]**.
- URL: https://remarksoftware.com/products/remark-office-omr/

### Exam.net and ExamSoft/Examplify: digital-first
- **Exam.net:** school licence by quote. Lockdown browser, 8 question types, auto-marking rules, anonymised and collaborative grading. Students can **scan handwritten work with a phone via a QR code on screen**.
- **ExamSoft:** category tagging with unlimited categories in tiers. Items can carry many tags.
  - **Per-item performance history across the item's whole life** (p-value, discrimination).
  - A **Strengths & Opportunities** report per student by category.
- Neither fits HK paper-first practice, but ExamSoft's item history is the model for a bank that remembers.
- URLs: https://exam.net/pricing · https://support.examsoft.com/hc/en-us/articles/11166810764045

### Browser and free OMR
- **Blended Teaching "Paper Exam Grader":** free and browser-based. It randomises question order, option order and numbers ("infinite versions"), prints bubble sheets, reads office-scanner PDFs, and exports CSV/LMS.
- **Examica:** app scanning with variant-aware reports.
- **OMRChecker:** MIT-licensed Python/OpenCV, about 90% accuracy on phone photos by its own claim. The claim that it "can run inside your browser" is **[unverified]**.
- URLs: https://www.blended-teaching.com/paperexamgrader · https://github.com/Udayraj123/OMRChecker

---

## 2. Item analysis and HKDSE conventions

### Standard statistics
- **Facility (p):** the % who got the item right.
- **Discrimination:** either the upper-27% minus lower-27% difference, or the point-biserial/Pearson item–total correlation. **A flag below 0.20 is the common threshold** (Gradescope, ZipGrade).
- **Distractor efficiency:** a distractor chosen by <5% is non-functional (BMC Med Educ 2024). A distractor chosen more than the key suggests a mis-key.
- **Reliability:** KR-20 or Cronbach's alpha, plus SEM.
- **Moodle** adds random-guess score, intended vs effective weight, and error ratio. Its **question bank columns** are *Usage* (number of quizzes, with a link), *Last used*, *Facility index*, *Discriminative efficiency* and ***Needs checking*** (a question with problem statistics), plus Draft/Ready status, comments, version history, and created/modified by.
  - URLs: https://docs.moodle.org/en/Quiz_statistics_report · https://docs.moodle.org/en/Question_bank

### Key-position bias
- Hand-written keys cluster in the middle positions: A 19.4%, B 29.5%, C 28.8%, D 22.2% (Attali & Bar-Hillel, "Guess Where").
- **Randomising the key position is the one guideline with no validity cost.**

### HKDSE Economics facts, from primary HKEAA/EDB documents
- **2028 framework:**
  - Paper 1 is MC on the Compulsory Part: 30%, 1 hour.
  - Paper 2 (2 h 30) has Section A short questions at 26%, Section B structured/essay/data-response at 33%, and **Section C elective at 11%**.
  - EDB note: Compulsory-only students can still reach Level 5.
  - Paper 1 has **45 questions** (secondary source) **[verify on a live paper]**.
- **Curriculum topics with suggested hours (EDB C&A Guide, 2025 update):**
  - A Basic Economic Concepts 12
  - B Firms and Production 30
  - C Market and Price 32
  - D Competition and Market Structure 8
  - E Efficiency, Equity and the Role of Government 18
  - F Measurement of Economic Performance 12
  - G National Income Determination and Price Level 16
  - H Money and Banking 18
  - I Macroeconomic Problems and Policies 30
  - J International Trade and Finance 18
  - Elective 1 (Monopoly Pricing / Competition Policy) or Elective 2 (Trade Theory, Growth and Development): 24
  - **This is a ready-made coverage taxonomy with target weights.**
- **Marking-scheme conventions (2025 sample paper MS, used verbatim):**
  - "/" marks an acceptable alternative.
  - "**n@**" means n marks per point.
  - "**max: N**".
  - "**[Mark the FIRST TWO points only.]**" and "Extra answers should not be marked".
  - A "Marks" column on the right with "(1)" beside each line.
  - "OR" between alternative answer routes.
  - Diagram marks itemised: "Indicate in Figure 1: parallel downward shift … (1)".
  - "Verbal elaborations" as a separate block.
  - "any other relevant point".
  - Essays get **content (max 12) plus Effective Communication (EC, max 2)** with a descriptor table for 2, 1 and 0.
  - Also: "answers are for reference only … alternative answers acceptable".
- **Level descriptors** run from Level 1 to Level 5 (5* and 5** within Level 5), each written as "Candidates at this level typically…".
  - **HKEAA publishes no cut scores**, so any "predicted level" is only the teacher's own boundaries.
- **Market signals:**
  - 2026 HKDSE Econ had 13,563 candidates, and **46.6% took the Chinese version** (BigExam). 418 of 440 schools offer Econ.
  - The DSEEA joint mock (HK$430 per subject per student) sells "personal analysis report, level prediction, territory-wide percentile". Teachers and students clearly value analysis after the paper.
  - EdCity's OQB sells HKEAA past MC questions from 2012–2026 for HK$72 a year per individual, MC only.
  - EDB STAR (Chinese, English and Maths, P1–S3) offers reports by class, student and question, but **nothing comparable exists for Econ**.
- URLs:
  - https://www.hkeaa.edu.hk/DocLibrary/HKDSE/Subject_Information/econ/SamplePaper-2025-ECON-MS-E.pdf
  - https://www.hkeaa.edu.hk/DocLibrary/HKDSE/Subject_Information/econ/2028hkdse-e-econ-39q.pdf
  - https://www.hkeaa.edu.hk/DocLibrary/HKDSE/Subject_Information/econ/econ-level-descriptors-e.pdf
  - https://www.edb.gov.hk/attachment/en/curriculum-development/kla/pshe/Econ_C&A_Guide_E_with_updates_in_2025.pdf
  - https://dse.bigexam.hk/en/dseIntro/cateA/cateAsubj/SJ_ECON
  - https://dseea.org.hk/
  - https://edmall.edcity.hk/home/en/oqb-hkeaa-economic.html

---

## 3. Paper hygiene and versions
- **ExamView:** up to 25 versions (A–Z). Scrambles questions and/or choices, and **per-question "don't move" for choices that must stay put**. Prints a **version map**, a chart of how each version was scrambled. Also produces automatic answer keys and study guides.
- **Blended Teaching / Akindi:** randomisation plus a key per version. Akindi and Crowdmark regrade everything on a key change.
- **HK-specific constraints:**
  - Combination MCQs ("A. (1) and (2) only…") conventionally keep their option order. Shuffling them should default to *locked*.
  - Question groups sharing a stimulus ("Study the diagram and answer Questions 8 and 9") must move as one unit.
- **Time per mark:** Paper 1 is roughly 80 seconds per question (60 min / 45). For Paper 2, the paper's mark total is **[not verified]**, so derive minutes per mark from the paper's own total.

## 4. Department collaboration and files
- **No product here fits a serverless desktop app.** They are all institutional SaaS: Moodle, ExamSoft, Crowdmark, Akindi.
- **The Obsidian model is the fit:** "your data is simply stored as files in a folder", synced by iCloud, OneDrive, Google Drive or Syncthing.
  - Its documented caveats: keep the folder "Always keep on this device" or "Keep Downloaded" (Files On-Demand causes problems), iCloud on Windows can duplicate or corrupt files, and Google Drive on iOS is unsupported.
  - URL: https://obsidian.md/help/sync-notes
- **Web fallback:** `showDirectoryPicker()` is experimental and not Baseline. In practice it is Chromium only (Chrome/Edge), so there is no Safari or Firefox support **[from knowledge; the MDN compat table was not rendered]**. It needs HTTPS and a user gesture.
- **Word import:**
  - Respondus 4 convention: "1." or "1)" numbering, "a." or "a)" options, "*" before the correct option.
  - Akindi Importer uses NLP and detects the key from bold, italics, asterisk, highlight or "Answer: A".
  - Wayground (formerly Quizizz) AI extracts questions from PDF/DOCX/PPTX/images, up to 25 MB and 30 pages.
- **Vetting (審題):** HK panels vet internal papers, but I found no primary source on the workflow **[unverified practice]**.

## 5. Student-facing follow-ups
- **Carousel Learning:** question banks (5K+ community banks and department sharing), retrieval quizzes, **students self-mark**, teacher moderation, **Whole-Class-Feedback reports**, and printable quizzes. Used in 4K+ schools. Free trial, then individual or school plans **[prices not shown]**.
- **Blended Teaching** auto-generates "slides and questions to revisit challenging concepts".
- **Akindi and ZipGrade** email or print each student's selections with the correct answers.

---

## Ideas for us, ranked

For each idea: (a) benefit, (b) inspired by, (c) feasibility, (d) size.

1. **Structured marking points in the HKEAA convention** — the teacher version becomes a real marking scheme.
   - (a) Co-markers get a scheme that looks like HKEAA's: `n@`, `max: N`, `[Mark the FIRST TWO points only.]`, `/` alternatives, `OR` routes, itemised diagram marks, and an EC 2/1/0 table for Section B essays.
   - (b) The HKEAA 2025 sample MS; Gradescope rubrics.
   - (c) Pure authoring and rendering, the same in all three backends. It needs optional fields on part and sub-part answers (`points[]`, `perPoint`, `max`, `firstN`), **added to KNOWN_KEYS**. A total derived from `max` should be checked against the part's marks.
   - (d) **M**.
2. **Paper health panel** — derived, never stored.
   - (a) One glance before printing shows:
     - the A/B/C/D key counts, with a flag for runs of 4+ identical keys and skew beyond ±1 of balanced;
     - a "rebalance" action that permutes options of *unlocked* items;
     - mark totals per section;
     - minutes per mark against the paper's duration;
     - EN/ZH parity: a side missing, option counts differing, a marks label only on one side (this matters with 46.6% sitting in Chinese);
     - topic coverage against the EDB A–J hours.
   - (b) Attali & Bar-Hillel; ExamView; the EDB time allocation.
   - (c) Trivial and client-only. Coverage needs an optional `topic` field (A–J, E1, E2) in KNOWN_KEYS.
   - (d) **S**, plus S for topic tags.
3. **Versions A/B/C with a key and a version map.**
   - (a) Anti-copying versions of Paper 1 without rebuilding by hand.
   - (b) ExamView version map; Gradescope's 5 versions; Blended Teaching.
   - (c) Store only `{seed, count, locks}`, and derive each version's order. Lock combination MCQs and anything else flagged, and move stimulus groups as one unit. Export each version's .docx plus a one-page key grid (version × Q) and the map back to the master number.
   - (d) **M**.
4. **Export answer keys for the scanners teachers already have.**
   - (a) A US$7-a-year phone app, or the school's OMR machine, grades our paper with no server and no retyping.
   - (b) ZipGrade's CSV key format (mapped alternate keys, tags from `topic`); Gradescope bubble-sheet keys, up to 5 versions **[import format unverified]**.
   - (c) A CSV writer.
   - (d) **S**.
5. **Item analysis from a results file** — the "after the paper" wedge.
   - (a) Paste or import a response matrix: a ZipGrade or Gradescope CSV, Google Forms, an OMR machine export, or a quick type-in grid of letters per student. The page then shows:
     - facility and discrimination (upper/lower 27% and point-biserial), with Gradescope's thresholds;
     - distractor % with <5% non-functional flagged and a distractor-beats-key in red;
     - KR-20;
     - a per-topic breakdown;
     - everything rolled up across versions through the version map, which Gradescope cannot do.
   - (b) Gradescope Insights; ZipGrade; Moodle.
   - (c) 100% client-side. Store results as a **separate sidecar file per class sitting**, keyed by stable question ids, so the paper document stays clean and the corpus is safe.
   - (d) **M**.
6. **Question history across papers.**
   - (a) Show "Used: 2025 Mock · 5A · P1 Q12 · facility 0.34 · needs checking" on each question, and warn "used last year with this cohort's siblings".
   - (b) Moodle's Usage, Last used and Needs checking columns; ExamSoft's performance history.
   - (c) Desktop: build the index by scanning the documents folder. Needs a stable `originId` that is carried when a question is copied into another paper, plus sidecar results. Web: scan the localStorage index only.
   - (d) **M**.
7. **Folder-based department bank.**
   - (a) A panel shares a OneDrive, Google Drive or iCloud folder of papers, and "Insert question from…" browses it.
   - (b) Obsidian vaults.
   - (c) Tauri already writes files. Make the folder chooseable. Use atomic writes and one file per document, detect "conflicted copy" siblings, and add a "keep this folder on this device" hint. The web app gets a zip bundle export/import, with `showDirectoryPicker` as a Chromium-only extra.
   - (d) **M**.
8. **Vetting mode.**
   - (a) The panel head reviews a paper.
   - (b) Moodle's Draft/Ready status plus comments.
   - (c) Per-question status and comments stored in the file (KNOWN_KEYS). A "vetting copy" export carries the health checklist and, optionally, real Word comments (`w:comment`) so the review round-trips through Word, which HK teachers already use.
   - (d) **S–M**.
9. **Student follow-ups from the analysis.**
   - (a) Three outputs:
     - a one-click **corrections worksheet** of the lowest-facility items, with the existing `explanation` printed;
     - per-student **feedback slips** showing score by topic, wrong items and the key;
     - a **retrieval set** drawn from the bank by topic and oldest "last used".
   - (b) Carousel's Whole Class Feedback; Akindi student emails; Blended Teaching.
   - (c) Reuses the authoring engine.
   - (d) **S** each, once #5 exists.
10. **Word import (.docx to questions).**
    - (a) Migrates a teacher's back catalogue.
    - (b) The Akindi Importer and Respondus conventions.
    - (c) Client-side JSZip parse. Handle "1." and "1)" numbering, A–D options, a key from bold, asterisk, highlight or "Answer: B", "(2 marks)" labels, and full-width Chinese punctuation. Always show a review screen before committing.
    - (d) **L**. PDF past-paper import is lower yield: **L+**, later.
11. **In-browser phone OMR.**
    - (a) Scan answer sheets with no app.
    - (b) ZipGrade; OMRChecker.
    - (c) Feasible: getUserMedia plus an OpenCV.js WASM build (about 8 MB, lazy-loaded), a printed sheet with 4 fiducials, student-number and version bubbles, and an uncertain-mark review queue like Gradescope's. Accuracy and support cost are the risk. Do #4 first.
    - (d) **L**.
12. **Teacher-defined level boundaries** — do this with caution.
    - (a) Map mock scores to levels 1–5** for reports, which the DSEEA joint mock shows is wanted.
    - (b) DSEEA.
    - (c) HKEAA publishes no cut scores, so the boundaries must be the teacher's own and labelled "school estimate".
    - (d) **S**.

**Sequencing:** 2 → 1 → 3 → 4 → 5 → 9 → 6/7. Items 2, 3 and 4 are cheap and turn "the paper is printed" into "the paper is fair, versioned and scannable". Item 5 is the step into what happens after the paper.
