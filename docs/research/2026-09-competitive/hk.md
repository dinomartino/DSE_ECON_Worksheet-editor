# Direct competitors: HKDSE / Hong Kong (research slice)

Researched 2026-09-24. Screenshots were taken during research but are not kept in the repo.

## Headline findings

1. **Two of the "top priority competitors" are ours, not competitors.**
   - *Econ-editor* on aimakecoolstuff.com is **this product**. The site belongs to "aIMakeCoolStuff, a solo developer". Its contact address is the repo owner's email, and its "View source" link goes to `github.com/dinomartino/DSE_ECON_Worksheet-editor`, this repo's `origin`. The same site lists DSEconMentor and DSE Econ Translator, so those are the owner's products too.
   - *CY-Cheung/DSE-PAPER-editor* is a **GitHub fork of this repo** (`fork: true`, parent `dinomartino/DSE_ECON_Worksheet-editor`, MIT, "Copyright (c) 2026 Tino Ho"). 80 of its 81 commits are ours, up to 2026-08-03. CY-Cheung added one commit (2026-08-04). It rewrote the README in Cantonese, cut SYSTEM_ARCHITECTURE.md from about 2,080 lines, and moved the build from Next.js to Vite with a gh-pages deploy script. It added `src/App.jsx`, `main.jsx` and JS copies of `text`/`types`. 0 stars, 0 issues. Its GitHub Pages site (`cy-cheung.github.io/DSE-PAPER-editor/`) shows the page title but an empty body, so the deploy looks broken. **It has no features we lack.** It is a snapshot of us from about 7 weeks ago, and it shows the codebase can be picked up by a local teacher/dev.
2. **No third-party tool in HK does what we do**: bilingual WYSIWYG authoring of DSE-format papers with native, editable .docx. The real HK landscape is:
   - (a) EdCity/HKEAA **online MCQ assessment** platforms (OQB, DFS), which assign, auto-mark and report, and do not produce papers
   - (b) **publisher question banks** (Aristo, UPEP, OUP), gated behind textbook adoption, which export Word or run online tests
   - (c) **student self-study apps** (DSEconMentor, DSE神器, PickMyQuiz, Anson Kong's bank)
   - (d) small AI "paper generators" of poor quality.
3. The recurring capabilities we lack are **a question library with topic tags**, **pulling questions in from existing material** (publisher Word banks, past papers), and **richer econ diagrams** (shaded welfare areas, auto-shifted equilibria, data line/bar charts).

---

## Per product

### 1. Econ-editor (aimakecoolstuff.com/products/econ-editor): OUR OWN PRODUCT
- Marketing page for this repo. Features listed: bilingual authoring with HK terminology and per-script fonts, native .docx (live numbering, Word styles, real tables), "Built for HKDSE", "No account, no server". Web only; the desktop app isn't mentioned; no pricing (free/MIT); no screenshots or demo link on the page.
- **Gap to fix (ours):** the page has no screenshots, no "Open the app" link and no mention of the desktop build. Its only CTA is "View source", which is for developers, not teachers.
- URL: https://www.aimakecoolstuff.com/products/econ-editor

### 2. CY-Cheung/DSE-PAPER-editor: FORK OF OUR REPO
- See headline 1. Tech: the same TypeScript source, rebuilt with Vite, React 19 and zustand. The README is a Cantonese translation of ours (it quotes "750 tests" from our older state). It contains Windows paths (`c:/Users/cyche/...`), so it was done locally by one person. The fork adds no features.
- URL: https://github.com/CY-Cheung/DSE-PAPER-editor

### 3. EdCity Online Question Bank (OQB) + HKEAA Diagnostic Feedback System (DFS)
- **What:** a school-subscription **online MCQ assessment platform**, run by EdCity with HKEAA authorisation. It has more than 10,000 past HKDSE questions across 10 subjects, Economics included, plus about 2,500 free questions from publishers and teachers. DFS (HKEAA) is a paid upgrade on top of OQB: more than 4,000 MCQs with expert feedback per question, estimated DSE grades from statistical models, and diagnostic reports.
- **Audience:** whole schools. Teachers F3–F6; students F4–F6.
- **Pricing:** "whole school, all subjects" annual subscription, quote on request (no public price). Early-bird discount to 31 Oct 2026, multi-year discounts. DFS has a 60-day free trial for new schools in 2026/27.
- **Platform:** web plus mobile/tablet; EdCity login.
- **Features (from the feature page and the teacher PDFs):**
  - Paper builder: filter by topic, author (HKEAA or other), difficulty, **language (Chinese / English / bilingual, where a bilingual paper can be assigned in either language later)**, number of questions, exam year and **question number**. Options to "exclude questions previously assigned to these students" and "NSS vs non-NSS".
  - Paper preview: reorder, add and remove questions; title and description.
  - Assignment settings: time limit (the system suggests one from the question count), forced completion, **randomised question and option order** (anti-copying), auto-submit, open/close dates, modes (test, exercise, revision), and when students may see the report. Distribution by QR code or link.
  - Reports (4 types): overall, by topic, by difficulty, and item analysis. The item analysis shows **student correct % against the HKEAA correct % for that item in its exam year** and the distribution of chosen options per item.
  - "Preset papers": more than 120 teacher-curated topical sets. The Economics set (St Francis Tsuen Wan) has 7 papers, for example market intervention (21 Qs) and elasticity (10 Qs).
  - Students can "retake failed questions".
- **Weaknesses:**
  - MCQ only; no structured or LQ questions.
  - Online delivery only. The teacher quick guide covers no way to print or export a paper. A secondary source says whole assessments can't be downloaded or printed (only certain Maths and Geography items have a print icon). Report charts can be exported as PNG, JPEG, PDF or SVG.
  - Needs a school subscription.
- **URLs:** https://teacher.edcity.hk/zh-hant/oqb/introduction/, /feature/, /subscription/, /resources/; https://www.edcity.hk/home/en/edmarket/edtech-solutions/oqb/; https://www.hkeaa.edu.hk/en/global_assessment_learning/dfs/. Teaching-idea PDFs are saved in `research/hk/`.

### 4. Anson Kong: HKDSE Economics Question Bank
- **What:** a personal **student revision** tool built in 2022 in plain HTML/CSS/JS by a DSE candidate who got a 5**. Past-paper questions from 11 years are sorted into **109 question types** (for example "Time cost", "Changes in opportunity costs (v1)", "Price control with diagram"). It has **Random** and **Chronological** modes plus "Choose".
- **UX (from the screenshots):** a dark UI. The question sits in a box tagged with its source (for example `[13.9 (c)] … (3m)`). The student types an answer in the left pane and presses Enter to reveal the marking scheme in the right pane, **in red with a "(1)" after each scoring point**.
- **Pricing and availability:** free. Only screenshots are public on the portfolio; there is no live link, and the old `/projects/econ_question_bank/` URL returns 404. The GitHub account (Hotstopper) has no public repo for it.
- **Weaknesses:** English only, student-facing, no authoring or export, not maintained.
- **URL:** https://ansonzhin.com/projects/hkdse-economics-question-bank

### 5a. DSEconMentor (dseconmentor.com): OUR OWNER'S OTHER PRODUCT
- A student platform built on Gemini: AI tutor, "Pattern Master" drills by DSE question type, SM-2 flashcards, notes (MD/PDF/DOCX), an MCQ practice mode, an insights heatmap, and a weekly SCMP digest.
- **Past papers:** 2012–2026 in both languages, plus the old and 2028-syllabus sample papers and the practice paper, with no login. MCQs and LQs are **regrouped into 71 MCQ topics and 50 LQ topics**, in English and Chinese, across syllabus parts A–J.
- **Relevance:** the owner already holds a bilingual **topic taxonomy** and a structured MCQ bank. That is the most direct source for any "question library" feature (idea 1 below). HKEAA copyright applies to past-paper text. The site shows a non-commercial and takedown notice.
- URL: https://www.dseconmentor.com/past-papers

### 5b. Econ Excelsior (econexcelsior.com)
- **What:** a tutoring business (video and live classes, WhatsApp Q&A), not software. The "Econ資源分享" library was empty when checked, and "學生登入" goes to a separate student site.
- **Notable artefact:** their sample notes use **"LQ答題框架"**, which are **fill-in-the-blank answer-flow templates**. They are boxed and bilingual, with English first and then Chinese. Examples: "Full cost = monetary cost + time cost … _____A_____ is higher than _____B_____", and "Effect on efficiency: Price ______, quantity transacted ______ … Change in PS / Change in CS". Teachers and tutors clearly make cloze-style scaffold worksheets.
- URL: https://www.econexcelsior.com/econ補習筆記

### 6. Publisher teacher platforms
**Aristo (雅集), *HKDSE Economics in Life (2nd ed.)*.** The richest teacher portal; resources are gated to schools that adopt the textbook.
- **Assessment resources:**
  - "Question Bank+" (online, relaunched Sept 2024: My Quiz, Manage Quiz, Create Quiz; chapters 1–29)
  - **"Question Bank (MS Word)", downloadable per chapter**
  - Online Test, plus Online Test (MS Word)
  - Mock Tests (up to no. 44)
  - DRQ (data-response question) samples
  - Concept-checking worksheets
  - Revision exercises, including as Google Forms
- **Multimedia and interactive:** Kahoot, Quizizz and Nearpod activities; a Padlet concept map.
- **e-Graph: about 45 interactive textbook figures.** Example: "Drag S0 upwards to see the change in price, quantity and total revenue". Dashed P0/Q0 guides and **shaded "gain / loss in total revenue" areas** update live. The figures cover price ceiling, floor, quota, tax and subsidy (with tax-burden shares), elasticity and total revenue, AD/AS gaps, the money market, tariff and quota, and monopoly pricing.
- **e-Word Bank:** a searchable bilingual glossary filterable by chapter.
- **URLs:** https://www.aristo.com.hk/economicsinlife2ed/, https://www.aristo.com.hk/QBPlus/7/29, https://www.aristo.com.hk/economicsinlife2ed/egra/en/fig11_13

**UPEP (培進), *NSS Exploring Economics 3e* (新高中經濟學探索).**
- Question bank at onlineqb.upephk.com; UPEP member login needed (it lists Windows, Chrome and Firefox as supported).
- The public sample PDF (made in Word, Mar 2025) shows the item format:
  - each item has an **ID** (`B1C01_01` = book 1, chapter 1)
  - each item carries a **"(參考：HKDSE 2023 Q1)" note naming the past DSE question it is modelled on**
  - each item has an answer and a **per-option explanation** ("選項 A：…").
- The sample term test (20 pages, Word) has:
  - a cover with name, class, marks box, time and chapters covered
  - MC and short-question sections
  - **shared stimulus "細閱以下…然後回答題 3 及題 4"**
  - data tables.
- URLs: https://econ-ss.upephk.com/zh-hant/continuous-assessment/question-bank/, https://rdlink.upephk.com/marketing/resources/sec/econ/nss-econ-3e/qb/QB_sample_c.pdf

**Oxford (OUPC) Online Question Bank (試題庫).**
- A general paper builder for OUP titles. **Whether it covers Economics is unverified**; OUPC's HKDSE list looks weighted towards English, Maths and Science.
- **Search:** by ID, category, marks range and keyword; **"questions not used in period X by me / by my school"**; update batch; favourites; random N.
- **Building:** select and favourite questions; a running tally of type, count and **total marks**; zh/en toggle.
- **Export:** a zip of Word files, with options for **Chinese or English, questions only, answers only, or both**, editable in MS Word. Desktop browsers only.
- URL: https://www.oupchina.com.hk/digital/onlineqb/ZH/

**Pearson HK.**
- Economics teacher resources sit behind MyPearson login (dse-mock-exam.pearson.com.hk/econ, digital-resource.pearson.com.hk).
- The public self-learning page has only Exam Kit and 應試錦囊 PDFs per book.
- **Test-generator features are unverified.**

### 7. Other HK-specific finds
- **"HKDSE Exam Paper Generator" by Hugo Wong** (pyscriptapps).
  - Subjects are Maths, Physics and Biology only; no Economics.
  - It sends one prompt to xAI `grok-2` with **an API key embedded in the page JS**. The prompt covers counts of MC, short and long questions, topics and difficulty.
  - It renders Markdown with MathJax and exports Word via `docx.js`.
  - Shows how thin and unsafe the "AI paper generator" competition is. No bilingual support; generic output.
  - https://hugo_wong.pyscriptapps.com/exam-paper-generator-v3-public/latest/
- **DSE神器 Econ (dseapp.com / 10minquiz) and PickMyQuiz** are commercial student apps.
  - DSE神器 Econ: 1,200+ questions, 442 flashcards, "scoring points + Level 5 framework" per question, and AI marking of long answers on argument, structure and evidence.
  - PickMyQuiz: turns uploaded PDFs, Word files and photos into MC, fill-in, T/F and short-answer questions with AI, including "AI 挖空" cloze. Exports PDF.
  - Neither targets teachers.
- **zanyws/hkdse-worksheet** (GitHub) is an HKDSE *Chinese* reading-worksheet generator.
  - It uses AI and a backend on Render, with bring-your-own model: Gemini, OpenAI, Anthropic or a custom endpoint.
  - Output is a **student version plus a teacher version with answers in red**, as PDF or HTML.
  - It shows teachers accept BYO-key AI.
- **Ew1009/my-dse-econ-app** "Graph Engine v3".
  - A canvas econ-graph engine for students.
  - **Whole-curve drag that keeps the slope**, with attached reference and quota lines that follow.
  - Polygon shading with labels, horizontal and reference lines, free-text labels, toJSON/fromJSON, and PNG export.
- **wchunsansam/dse-econ-bafs-tools** is one teacher's classroom site (Econ and BAFS) behind a class code: an MC grader ("作業角"), a seating planner, labs for deposit creation and the money market, and past papers.
- **The owner's earlier private question-bank prototype** (Jan 2026) is an earlier prototype of a question library: questions tagged by topic, folders, search, PDF/Word generation, Firebase.
- **The 2028 syllabus changes the exam structure.**
  - Paper 1 is still 30% MCQ.
  - Paper 2 changes to: Section A short questions (26%); Section B structured, essay and data-response on the compulsory part (33%); Section C elective, where candidates **answer one of two elective parts** (11%).
  - Source: https://www.hkeaa.edu.hk/DocLibrary/HKDSE/Subject_Information/econ/2028hkdse-e-econ-39q.pdf

---

## Ideas for us (ranked)

Constraints recap: static web plus Tauri desktop, no server, everything must export to .docx, and schema additions must be optional and listed in `KNOWN_KEYS`.

1. **Personal question library with syllabus-topic tags** (M–L).
   - *User gets:* save any question (with its stimulus, diagram and mark scheme) to a library, tag it with DSE topics A–J and subtopics, then search and insert it into another worksheet. Filters by topic, type, marks and "not used in the last N months".
   - *Inspired by:* OQB/DFS filters, OUP "unused questions" search and marks-range filter, Aristo Question Bank+, Anson's 109 types, the DSEconMentor 71/50-topic taxonomy (ours), and the owner's own Firebase prototype.
   - *Feasibility:* high. Use localStorage/IndexedDB on the web and a folder of files on desktop, reusing the existing store split. Tags are an optional field. Insert is a deep copy with new ids. Can seed from the DSEconMentor taxonomy.
2. **Paste or import a question from Word or plain text** (M).
   - *User gets:* paste a block such as "1. … A. … B. … C. … D. …", or structured "(a)(i) … (3 marks)", from a publisher's per-chapter Word bank or an old worksheet, and it becomes real MCQ or structured questions with derived numbering and marks.
   - *Inspired by:* Aristo and UPEP delivering banks as MS Word. Today our paste is plain text only (`RichTextEditable.tsx` onPaste).
   - *Feasibility:* high. A client-side parser of clipboard text/HTML, with a .docx reader possible later via JSZip, which we already ship.
3. **Econ diagram upgrades: shaded areas, auto-shift, data charts** (M each).
   - (a) **Shaded polygon regions** with labels: CS, PS, deadweight loss, tax revenue, gain or loss in TR. Our `Diagram` has curves, points, labels and arrows but no areas.
   - (b) **"Shift curve" action** that places S1/D1 in parallel and auto-drops dashed P1/Q1 guides to the new intersection.
   - (c) **Line and bar charts from a table** for data-response questions. We have pie only.
   - (d) Grow templates towards Aristo's e-Graph list: ceiling, floor, quota, tax/subsidy incidence, elasticity and TR, inflationary and deflationary gaps, monopoly.
   - *Inspired by:* Aristo e-Graph, Ew1009 Graph Engine, Econ Excelsior notes.
   - *Feasibility:* fits "geometry in, one PNG out"; no .docx risk.
4. **Answer-frame / cloze blanks** (S–M).
   - *User gets:* inline fill-in blanks inside question or answer text (student version shows `______`, teacher version shows the answer), plus a boxed "answer flow" scaffold block.
   - *Inspired by:* Econ Excelsior LQ答題框架, PickMyQuiz AI 挖空.
   - *Feasibility:* high. It is a run-level marker rendered by all three backends; .docx prints underlined blanks or red answers.
5. **Shuffled versions and answer-key grid for MCQ papers** (S–M).
   - *User gets:* "Version A/B" exports with shuffled question and/or option order (with statement-type questions kept intact), plus a printable answer-key table per version.
   - *Inspired by:* the OQB "randomise question and answer order" anti-copying setting.
   - *Feasibility:* high. It is derived at export time, so nothing new is stored beyond an optional seed.
6. **Export filters: questions-only, answers-only, and language** (S).
   - *User gets:* one-click .docx of the question paper, a separate marking-scheme-only document, and the zh or en edition.
   - *Inspired by:* OUP export options, OQB bilingual papers.
   - *Feasibility:* high, since teacher/student versions and bilingual text already exist. Mostly UI plus an IR filter.
7. **"Modelled on DSE 20xx Qn" source note and per-option rationale in the teacher version** (S).
   - *User gets:* a small provenance tag that prints in the teacher version, plus rationale for each option. MCQ already has a single `explanation`.
   - *Inspired by:* UPEP question-bank format, Anson's `[13.9 (c)]` tags.
   - *Feasibility:* trivial optional fields.
8. **Official-term glossary check** (M).
   - *User gets:* flag or suggest EDB-standard zh/en term pairs while typing, for example 從量稅 for "per-unit tax".
   - *Inspired by:* the owner's DSE Econ Translator (EDB list of 1,320 terms), Aristo e-Word Bank.
   - *Feasibility:* a static JSON bundled in the app; no server.
9. **2028-format templates** (S).
   - *User gets:* a new-syllabus Paper 2 skeleton (Section A short questions, B, C with "answer ONE elective part") and updated cover instructions.
   - *Inspired by:* HKEAA 2028 framework, DSEconMentor 2028 sample.
   - *Feasibility:* a template in `newWorksheet` only.
10. **AI draft or translate with a bring-your-own key** (M, optional).
    - *User gets:* generate a draft question, mark scheme or zh translation from a prompt, with the result landing as editable questions.
    - *Inspired by:* Hugo Wong's generator (done badly: embedded key, flat Markdown), zanyws (BYO Gemini, OpenAI or Anthropic), DSE Econ Translator (prompt-only, key-free).
    - *Feasibility:* needs the user's own key, called directly from the browser or desktop. A zero-key fallback is to "copy prompt" as the Translator does. Never embed a key.
11. **Fix our own product page** (S, marketing).
    - *User gets:* the aimakecoolstuff Econ-editor page gains screenshots, a live-app link and desktop download links (the download widget already exists), and a Chinese version. Today its only CTA is "View source".
