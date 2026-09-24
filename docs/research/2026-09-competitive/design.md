# Research slice: worksheet design & classroom activity tools

Researched 2026-09-24 in ego-browser (TaskSpace 1, page p4), with WebSearch/WebFetch when Bing
started refusing connections. Screenshots were taken during research but are not kept in the repo. Prices are as shown on
official pages that day; some pages showed TWD because of geo-detection. Anything marked **[unverified]**
comes from third-party pages or from memory, not from the vendor's own page.

---

## 1. Per-product findings

### Canva for Education
- **What:** a general design editor with a large education template gallery (worksheets, lesson plans, quizzes), plus Canva Docs, whiteboards and AI ("Magic") features.
- **Pricing:** free for verified K-12 teachers and their students. Pro and Teams are paid.
- **Platform:** web, Windows and Mac desktop apps, mobile.
- **Concrete features:**
  - **Worksheet gallery** (`canva.com/worksheets/templates/`). One search box, an "All filters" button, and **"Create a blank Worksheet" as the first tile**. Multi-page templates carry a "1 of 3" badge.
  - **Print:** "PDF – Print" download. Canva has **no Word export**. The search results were all third-party workarounds (PDF → converter), which confirms the gap.
  - **Version history:** File → Version history lists up to 1,000 versions with no time limit and shows the editor's avatar on each version. You can compare, Restore, or "Make a copy" of an old version. This is paid-only; the free tier has none. (help: `/help/version-history/`)
  - **Trash:** Projects → Trash keeps items for 30 days. You can restore or delete items one at a time or with "Empty Trash", and restored items go back to Projects. Canva is explicit that Trash is for deleted designs and Version History is for lost changes. (help: `/help/deleted-designs/`)
  - **Projects page:** filter by Type / Category / Owner / Date modified, sort by relevance, date edited or name, switch between grid and list, star designs and folders ("Your starred" appears in the left nav), and folders. (help: `/help/find-designs-and-folders/`, `/help/filter-sort-homepage/`)
  - **Translate:** translates a whole design, Traditional Chinese included. By default it makes a translated copy; a checkbox translates in place instead. (help: `/help/translate-canva-designs/`)
  - **Interactive elements:** forms, quizzes, dropdowns, dates and an Equations (beta) app.
  - **Other:** LMS integrations; a "Creators program" that lets teachers sell templates.
- **Standout UX:**
  - The blank-first gallery.
  - Translate-as-copy.
  - A clear split between version history and trash.
  - Starring that shows up in the nav.
- **Weaknesses for our users:**
  - Free-form canvas, so no numbering, no marks and no question structure.
  - No .docx.
  - Worksheet templates are primary-school and decorative.
  - Version history is paywalled.
- **Screens:** `canva-templates.png`, `canva-worksheets.png`, `canva-edu.png`.

### Twinkl (Twinkl Create, resource library)
- **What:** a library of 1M+ teacher-made resources (Twinkl's claim), plus **Twinkl Create**, a free A4 editor with templates and Twinkl illustrations.
- **Pricing:** HK/TW page quotes NT$225–280/month for membership. Create is free with an account.
- **Platform:** web, and Twinkl has localized sites (a zh-TW UI was served in HK).
- **Concrete features:**
  - **Create** starts from a template or from scratch. It has undo/redo, a symbols palette (maths, Latin, arrows), educational fonts and AI images. It **downloads PDF only** ([TwinklCares](https://twinkl.zendesk.com/hc/en-gb/articles/4838311022877-Saving-Downloading-Twinkl-Create)).
  - **"More downloads / Other versions"** is the key pattern ([blog](https://www.twinkl.com/blog/personalise-your-resources-using-our-alternative-versions)). One resource page offers:
    - an editable version (Word/PPT)
    - Higher / Middle / Lower ability versions
    - Eco black & white
    - Greyscale
    - Super Eco Colour
    - regional handwriting fonts
    - dyslexia-friendly fonts
  - **Accessibility page:** dyslexia font guidance, "Request a resource" (Ultimate tier), Symbols (AAC), EAL dual-language resources, and captions on videos.
- **Standout UX:** variants are chosen at *download* time, not at authoring time, and the print-cost variants (eco, greyscale) are explicitly for saving ink.
- **Weaknesses:**
  - Create is decorative and PDF-only.
  - Editable versions are separate hand-made files, not one source.
  - No exam structure.
- **Screens:** `twinkl-create.png`, `twinkl-hk-pricing.png`.

### TeacherMade → now **Classwork.com**
- **Note:** the `teachermade.com` address redirects to `classwork.com`.
- **What:**
  - Turns PDFs, Word, Slides and images into interactive activities by **overlaying answer fields on the page**.
  - Has 48+ auto-graded item types (hot spot, drag-drop, inline choice, match grid, graphing).
  - Also has a "Flex Editor" for authoring from scratch and AI generation with automatic standards/DOK/Bloom tagging.
- **Pricing:**
  - District, school and team plans are by quote.
  - "Teams" needs at least 3 teachers.
  - A teacher self-pay tab exists, but no price was shown.
- **Weaknesses:**
  - Now aimed at US districts.
  - Everything is online and depends on accounts.
- **Screen:** `classwork-features.png`.

### LiveWorksheets
- **What:** upload a PNG/JPG/PDF (≤5.5 MB) as the background, then drag **Elements** onto it. Elements include single choice, drag↔drop pairs (linked by the same value), text boxes and MP3 audio, each configured with a pencil icon.
- **Metadata:** each worksheet records language, subject, level, age range, public/private, and whether PDF download is allowed. Uploaded media goes into a reusable **media library**.
- **Pricing** (`/subscriptions`):
  - **Basic (free):** 30 private worksheets, 100 students, 25 workbooks. Ad-free costs $1.99/month extra.
  - **Plus:** $7/month for 125 private worksheets.
  - **Premium:** $15/month for 1,000 private worksheets and 100 workbooks.
  - New: "Practice Mode" with instant feedback.
- **Standout UX:**
  - **"Workbooks"** (collections of worksheets).
  - Private vs public sharing.
  - The print PDF is the source; the interactive layer is an overlay.
- **Weaknesses:** the page is only an image, so the text can't be edited. Quotas push people to delete old work.

### Wordwall
- **What:** you type content once and pick a template. There are 12 standard and 22 Pro templates (quiz, match, crossword, wordsearch, labelled diagram, rank order, maths generator, and more).
- **Pricing:**
  - **Basic (free):** 3 activities.
  - **Standard:** NT$120/month, unlimited activities, print and AI.
  - **Pro:** NT$180/month, adds the extra templates.
  - Annual billing is 33% off.
- **Standout UX:**
  - **"Switching template"**: the same content becomes a Crossword, Quiz or Wordsearch in one click. Wordwall pitches this for differentiation.
  - **"Most templates available in both an interactive and a printable version"**, and printables have their own options (font, **multiple copies per page**).
  - Visual "styles" change the look without touching content.
  - Community activities can be forked and edited.
  - If you cancel, you can still see and play your activities but can't edit them.
- **Weaknesses:** built for games and vocabulary, not extended-response exam writing.
- **Screens:** `wordwall.png`, `wordwall-plans.png`.

### Kuta Software (Infinite Algebra, etc.)
- **What:** **desktop** test and worksheet generators, with lifetime licences. This is the closest model to our desktop app.
- **Pricing:**
  - Single-user **lifetime licence: $150 for one program**, with a limit of two computers.
  - Site licence: $186/year.
  - Kuta Works (online) seats: $1 per student-semester.
- **Features** ([features](https://www.kutasoftware.com/features.html)):
  - Regenerate questions from parameters, for a whole assignment, a question group or one question.
  - **One-click "Respace"** to change the room left for working.
  - **Multiple-version printing:** scramble choices, scramble questions, or make new questions. Each version can be saved.
  - **Scale assignment** to change the number of questions.
  - **Merge assignments** into a unit test.
  - Toggle any question between free-response and multiple choice, with distractors based on common mistakes and 2–5 choices.
  - **Answer format** choices: separate answer sheet, **odds only**, in context, or none.
  - **Presentation mode:** 1–4 questions on screen, zoom, reveal answer.
  - Diagrams drawn to scale.
  - Any paper size or margin, with automatic reflow.
  - Export questions as bitmaps to paste into Word. That is a weakness: it isn't native.
- **Standout UX:** document-level operations (respace, scale, merge, versions) instead of hand edits.
- **Weaknesses:**
  - Maths only.
  - The UI is dated (not inspected directly).
  - Export to Word is bitmap only.

### Math-Aids / WorksheetWorks
- **What:** one form per topic. You choose difficulty, 10 or 15 problems, **the worksheet's language** (10+ languages), a "memo line" printed bottom-left, and whether to include an **answer page showing worked steps**, then press Create to get a PDF.
- **Pricing:** free with ads; paid to remove ads. WorksheetWorks has a premium membership (price not checked).
- **Standout UX:** the answer key shows working, not only final answers, and the language is a per-print option.
- **Weaknesses:** heavy ads (a video overlay covers the form), a 2009-era UI, PDF only.
- **Screen:** `mathaids.png`.

### Formative
- **Pricing:**
  - Classroom: $249/year.
  - Small School: $3,125/year for up to 250 students.
  - District: custom.
  - No free tier was listed.
- **Features:**
  - 20+ tech-enhanced item types.
  - The Luna AI builds activities from PDFs or documents.
  - Rubrics.
  - **Released state-test items**.
  - A premium **Item Bank** at district level.
  - Common assessments and **standards tagging**.
  - Translation into 50+ languages.
- **Takeaway:** past-paper item banks and tagging are what schools pay for.

### Wayground (formerly Quizizz)
- **Pricing:**
  - **Basic (free):** 20 stored activities, and **activities expire after 14 days**. That is a strong anti-pattern for work people care about.
  - **Individual:** NT$564/month billed annually (NT$6,768).
  - School: by quote.
- **"Worksheet" print mode** ([help](https://help.wayground.com/support/solutions/articles/158000405025)) has these toggles:
  - Shuffle answers
  - Shuffle questions
  - Answer key on the last page
  - **Font size S/M/L/XL**
  - Include question tags
  - Instructor name
  - School logo
  - Image size for questions and options
- **Import from the library:** search public resources, preview, then **"+ Add question"** one at a time or **"+ Add all questions"**. "Teleport" pulls questions into a new quiz. There is also spreadsheet import with a downloadable template.
- **Accommodations**, assigned per student ([help](https://help.wayground.com/support/solutions/articles/158000404955)):
  - Reduce answer choices to 2 or 3
  - Read aloud
  - Extra time
  - Translate (includes zh_TW)
  - Bilingual dictionary
  - **Dyslexia font (OpenDyslexic)**
  - Font size
  - **Font spacing**
  - Hints
- **Other:** "Tag resources for easy organisation" is a paid feature.

### Kahoot!
- **Pricing:** free (Go), then Kahoot!+ Bronze $3, Silver $7, Gold $12 and a top tier at $19 per month billed annually. Player caps are 40 to 800.
- **Features:**
  - Question bank of about 500M community questions (Kahoot's claim).
  - Templates.
  - AI turns a PDF into a Kahoot, and an AI "question extractor" pulls questions out of PDFs (3 pages free, up to 150 on paid plans).
  - Courses (collections).
  - **Spreadsheet import (.xlsx template)**. The template limits question and answer length: 95/60 characters in the older template docs, while the plan page says quiz questions can be up to 120. **[conflicting; check before relying on it]**

### Blooket
- **Pricing:** free Starter. Plus is paid (price not taken from the vendor).
- **Plus features** ([help](https://help.blooket.com/hc/en-us/articles/16182029397655)):
  - **Folders** (a paid feature)
  - **Question Bank:** add questions from any set to your own
  - **Merge sets**
  - **Copy & duplicate**
  - Audio questions
  - Homework deadlines up to 365 days
- **Import:** CSV import from a template (a Google Sheets copy, or .xlsx download then save as CSV).

### Google Forms (quiz mode) / Microsoft Forms
- **Google Forms:**
  - Settings → "Make this a quiz". Then answer key, points and automatic feedback per question.
  - Release grades immediately or after manual review.
  - Summaries of frequently missed questions.
  - ([help](https://support.google.com/docs/answer/7032287))
- **Microsoft Forms "Quick Import"** ([support](https://support.microsoft.com/en-us/forms/convert-a-word-or-pdf-form-or-quiz-to-microsoft-forms)):
  - Converts a **Word or PDF quiz** (≤10 MB) into a Form.
  - Supports titles, multiple choice and open text.
  - Shows review suggestions for anything it missed.
- **Takeaway:** a clean .docx from us is a direct on-ramp to MS Forms, which Hong Kong schools on M365 already have. **[unverified: how well it parses our specific layout, e.g. tab-stop options]**

### Book Creator
- **Pricing:** Starter is free (1 library, 40 books). Premium price is behind a monthly/annual toggle (≈$12.99/month **[unverified]**). Schools by quote.
- **Features:**
  - Unlimited libraries on Premium.
  - **Archive libraries**
  - **Combine books**
  - Remixing
  - Print book as PDF
  - Download as ePub
  - Share a link to a single page
  - 800+ page templates
  - AI alt text
  - Translation tool
  - Text-to-speech for PDFs

### Nearpod
- **Pricing:**
  - Silver: free, 300 MB.
  - Gold: $159/year, 1 GB.
  - Platinum: $397/year, 5 GB.
  - Schools and districts: unlimited.
- **Features:** upload PPT, PDF or Slides; Google Slides add-on; AI question generator; **"Sub Plans"**; co-editing and shared school libraries at school tier.
- **Takeaway:** storage quotas are the paywall.

### Pear Deck (GoGuardian)
- **Pricing:** Teacher Premium $149/year. Pear Assessment Premium $125/year. Free tiers exist.
- **What:** an **add-on inside Google Slides and PowerPoint**, i.e. it lives in the tool teachers already use.
- **Also:** 80,000+ certified assessment questions. ("Takeaways" — a per-student Google Doc after the session — is **[unverified this round]**.)

### Genially
- **Pricing:**
  - **Free:** 5 GB, imports PDF/PPT.
  - **Pro:** $10/month annual. Adds **PDF/JPG/video/offline download**, private sharing and **folders**.
  - **Master:** $25/month. Adds brand kit and project spaces.
- **What:** interactive presentations, escape rooms, choice boards, and a quiz builder.
- **Takeaway:** folders and offline export sit behind the paywall again.

### Teachers Pay Teachers (TpT / "TPT")
- **Filter facets:**
  - Grade, subject, price
  - **Format:** Digital, Easel, eBook, Google Apps, Image, and more
  - Resource type
  - Supports: ESL/ELL, SpEd
  - Language: Español, Français, English (UK)
- **What sells** (economics search, 1,400+ results for "economics supply and demand worksheet"):
  - Listings stress **"print AND digital"**, **"no-prep / print-and-go"**, **answer keys included**, **editable**, bundles, and **differentiated / SpEd versions**.
  - Example: Mister Harms' supply-and-demand pack ($4.50) ships **"PDF & Google formats"** plus teacher directions and a video. Reviews praise the "extra explanation on how to teach the material".
  - Seller advice (third-party): offer both an editable file and a print-ready PDF, and ship answer keys as PDF + Word.
- **Takeaway:** teachers pay for editable + print-ready + answer key + differentiated. That is exactly our teacher/student version plus .docx.
- **Screen:** `tpt-format.png`.

### Word-native and Google Docs add-ons
- **Doc to Form Quiz Maker** (Workspace Marketplace, 200k+ installs):
  - Teachers type `Q1. … / A. … / Answer: C / Explanation: … / [2 points]` in a Doc and get an auto-graded Form.
  - Handles images and `$LaTeX$`.
  - **This plain-text convention is a de facto standard** that teachers already know.
  - Similar tools: Form&Quiz Maker, FormCreator (Sheets-based).
- **Microsoft Word exam templates:** mostly third-party table-based MCQ templates. Microsoft's own template site redirected into a school SSO and was **not inspected**.
- **Word features teachers use for papers** (general knowledge, **[not re-verified]**):
  - multilevel list numbering for Q1(a)(i)
  - styles
  - Quick Parts / Building Blocks for reusable snippets
  - `.dotx` templates
  - Compare documents
  - Track Changes for vetting
- Our output lands in this ecosystem, so we should play well with styles, numbering and templates.

---

## 2. Cross-cutting patterns
1. **Content separate from presentation.**
   - Wordwall switches template.
   - Kuta toggles free-response ↔ MCQ and has answer-format options.
   - Wayground offers print toggles.
   - We already have one IR and several backends, so presentation variants are cheap for us.
2. **Variants chosen at output time:**
   - ability (Twinkl H/M/L)
   - print economy (eco, greyscale)
   - font or font size (Wayground S–XL, dyslexia font)
   - shuffled versions A/B (Kuta, Wayground)
   - answer key placement (Kuta: separate, odds-only, in context, none)
3. **Question reuse across documents:**
   - Blooket's Question Bank and merge sets
   - Kuta's merge assignments
   - Wayground's "+ Add question / Add all"
   - Kahoot's bank
   - Formative's item bank
   - Every one of these is a paid feature, which means it is valued.
4. **The print ↔ digital bridge is almost always import from a document:**
   - MS Forms Quick Import
   - Doc-to-Form add-ons
   - Kahoot/Blooket/Wayground spreadsheet templates
   - LiveWorksheets and Classwork overlays
   - We don't need to host anything to reach digital. We only need to emit files those tools import.
5. **Paywalls land on organisation and safety:**
   - folders (Blooket, Genially)
   - version history (Canva)
   - storage and expiry (Wayground: 14 days, 20 items; LiveWorksheets: 30 private)
   - We can give all of these away locally.
6. **Accessibility is output settings:** OpenDyslexic, bigger font, wider spacing, fewer MCQ options. None of them change content.

---

## 3. Ideas for us (ranked)
Constraints: static web plus Tauri desktop, no server or accounts, .docx is the output that everything depends on.

1. **Output variants panel ("Print options") at export.**
   - **Benefit:** from one source, export student / teacher / **answer key at end** / **answer key only**, **Version A/B** (shuffled MCQ options, and question order within sections), **large print** (bigger base size), and **eco / greyscale** (strip tints and colours).
   - **Inspired by:** Wayground worksheet toggles, Kuta answer format and multi-version printing, Twinkl alternative versions.
   - **Feasibility:** high. These are all render-time transforms of the IR.
     - Shuffling must be seeded and stored with the export, so B stays B.
     - Answer letters must remap in the mark scheme.
     - Must not mutate the document, since numbering is derived.
   - **Size:** M.
2. **Question library across documents.**
   - **Benefit:** "Insert from my other worksheets": search every saved document's questions by text, topic or marks, preview, then **+ Add** (a copy, not a link). Also "Merge worksheets into a mock".
   - **Inspired by:** Blooket Question Bank and merge sets, Wayground "+ Add question / Add all", Kuta merge.
   - **Feasibility:** reads the local store, no server needed. Needs a per-question text index, which can be built on load.
   - **Size:** M–L.
3. **Export to digital-quiz formats (MCQ only).**
   - **Benefit:** the same paper becomes a Kahoot, Blooket, Wayground or Google Forms quiz without retyping.
   - **Options:**
     - Kahoot .xlsx
     - Blooket CSV
     - Wayground spreadsheet
     - a "Doc-to-Form"-style plain-text/.docx that MS Forms Quick Import and the Google add-on already parse
   - **Inspired by:** those tools' import templates, and MS Forms Quick Import.
   - **Feasibility:** client-side file generation. Kahoot's character limits apply, so warn about questions that are too long. Charts and diagrams go as images or are dropped.
   - **Size:** S–M per target.
4. **Paste-to-structure import.**
   - **Benefit:** paste `1. … A. … B. … Answer: C [2 marks]` (the Doc-to-Form convention) or text copied from an old Word paper, and get real MCQ or structured questions.
   - **Inspired by:** Doc to Form Quiz Maker, MS Forms Quick Import, Kahoot's PDF question extractor.
   - **Feasibility:** a deterministic parser with no AI or server. Show a review step with "we couldn't parse" hints, the way MS Forms does.
   - **Size:** M.
5. **One-click "Respace" / answer-space density.**
   - **Benefit:** grow or shrink the answer space for the whole paper to hit a page count.
   - **Inspired by:** Kuta Easy Spacing.
   - **Feasibility:** we already compute answer lines from the paginator. This adds a global multiplier. Store it as a delta so old documents stay byte-identical.
   - **Size:** S.
6. **Accessibility export presets.**
   - **Benefit:** a dyslexia-friendly variant (sans font, 1.5× line and letter spacing, off-white page) and large print (14–18pt) for SEN students in HK mainstream schools.
   - **Inspired by:** Wayground accommodations, Twinkl dyslexia fonts.
   - **Feasibility:** .docx can name the font but not embed it, so use a system font. This also breaks our fixed 12pt-line model, so it must be a separate output profile.
   - **Size:** M.
7. **Language-at-output for bilingual papers.** Export EN, 中文 or bilingual side-by-side from one document.
   - **Inspired by:** Math-Aids' per-print language, Canva's "translate as a copy", Twinkl dual-language resources.
   - **Feasibility:** depends on how our bilingual content is stored.
   - **Size:** M–L. **[depends on the model]**
8. **Starter templates gallery with "Blank" first.**
   - **Benefit:** templates such as HKDSE Paper 1 MCQ, Paper 2 structured, weekly worksheet, and quiz with cover.
   - **Inspired by:** Canva's gallery, Twinkl Create's templates.
   - **Feasibility:** templates are bundled JSON documents run through the normal migration path.
   - **Size:** S.
9. **Presentation mode.**
   - **Benefit:** project one question at a time, zoom, reveal the answer or mark scheme. Useful when going over a paper in class.
   - **Inspired by:** Kuta's presentation mode.
   - **Feasibility:** a new view over the existing IR.
   - **Size:** M.

### File management and organisation (we are building this now)
Already built: thumbnails, grid/list, title search, kind filter, recent/name sort.

- **F1. Trash with 30-day restore.**
  - **Benefit:** delete never destroys work.
  - **Inspired by:** Canva Trash (restore, delete forever, empty trash).
  - **Feasibility:** a `deletedAt` flag on the index entry, keeping the document. Purge on start-up after 30 days. On desktop, move the file to a `.trash/` folder or the OS trash.
  - **Size:** S. It fits our backward-compatibility ethos.
- **F2. Duplicate / "Save as new" / "Make a copy of this version".**
  - **Benefit:** teachers fork last year's paper constantly.
  - **Inspired by:** Canva, Blooket copy & duplicate, TpT-style reuse.
  - **Size:** S.
- **F3. Local version snapshots.**
  - **Benefit:** a list of versions with time stamps, a thumbnail per version, Restore or Make a copy. Auto-snapshot on export and before import or overwrite.
  - **Inspired by:** Canva's version history (paid there).
  - **Feasibility:** web keeps a capped count per document in its own keys, watching the localStorage quota. Desktop uses sidecar files.
  - **Size:** M.
- **F4. Folders or tags, plus Starred.**
  - **Benefit:**
    - Tag by form (S4–S6), topic (for example "Market & Price", "Macro: Money & Banking"), term, and paper type.
    - Pin or star items to the top.
    - Filter chips on the dashboard.
    - Tags beat folders for a flat localStorage index, and a desktop folder can map to a tag.
  - **Inspired by:** Canva folders and "Your starred", Blooket folders, Wayground tags, LiveWorksheets workbooks.
  - **Feasibility:** an optional index field. It **must go in KNOWN_KEYS**, and the per-row validation must tolerate its absence.
  - **Size:** S–M.
- **F5. Full-text search** of question text, not only titles.
  - **Inspired by:** Canva's search inside content.
  - **Feasibility:** build the index lazily from documents. Shares the index with idea 2.
  - **Size:** M.
- **F6. "Recently exported" row and exported-files link.** Show which variants were printed when, and reopen the .docx folder. The desktop reveal already exists.
  - **Inspired by:** Kuta's saved versions.
  - **Size:** S.
- **F7. Backup/restore all (zip of JSON).**
  - **Benefit:** localStorage is fragile (browser clears, a new laptop), and no product here needs to give this because they have servers. We do.
  - **Feasibility:** a client-side zip. Import must go through `migrate`.
  - **Size:** S–M. **High priority** given the no-account model.
- **F8. Collections ("Workbook" / unit).** Group a set of worksheets into a unit and export them as one combined .docx.
  - **Inspired by:** LiveWorksheets Workbooks, Book Creator "combine books", Kahoot courses.
  - **Size:** M.
- **F9. Sort by last opened as well as last modified; dashboard stats** (pages, number of questions, total marks) on each card.
  - **Inspired by:** the Canva and Drive homes.
  - **Feasibility:** the stats are derived, so compute them rather than store them.
  - **Size:** S.

### Anti-patterns to avoid
- Expiring or capped storage (Wayground's 14 days; LiveWorksheets' quotas).
- Paywalling folders or history.
- PDF-only or bitmap export (Twinkl Create, Kuta).
- Free-form canvases with no structure (Canva).
- Ad-heavy generator pages (Math-Aids).
