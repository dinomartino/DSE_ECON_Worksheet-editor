# AI-first teacher material-prep tools: research findings

Researched 2026-09-24. Primary pages opened in ego-browser (TaskSpace 1, page p6). A few facts come from
web search snippets or third-party reviews and are marked **(secondary)**. Anything I could not confirm
is marked **(unverified)**. Screenshots were taken during research but are not kept in the repo.

Note: the research browser runs in a zh-TW locale, and several vendors served Chinese automatically:
Wayground served Traditional Chinese, Almanack served Simplified Chinese, and ChatGPT showed a Traditional
Chinese UI. Localised chrome is now common. Localised *generation tuned to a local syllabus* is not.

---

## 1. MagicSchool AI (magicschool.ai)

- **What it is:** The biggest "AI operating system for schools". It claims 80+ teacher tools and 50+ student tools. Web app plus a Chrome extension. Raina is the assistant.
- **Pricing (pricing page):** Free $0 includes the 80+ teacher tools, the Raina chatbot, quizzes and Class Writing Feedback. Plus costs $8.33/user/mo billed annually, or $12.99 monthly. Plus adds unlimited generations, output history and AI-output editing, the 50+ student tools, and "MagicSchool Labs". Enterprise is custom and adds SSO, SIS/LMS, district alignment, custom tools, moderation and dashboards. The comparison table lists "Google & Microsoft exports" as a row. One review says the free tier lacks direct export to Docs/Word **(secondary)**.
- **Tool list (relevant subset, from a third-party enumeration (secondary) plus the official /tools pages):**
  - Assessment: Multiple Choice Quiz Generator (text-based), Reading Quiz Generator, Text Dependent Questions, DOK Questions, YouTube Video Question Generator, **Data Table Analysis Generator** (makes a data table plus questions, the closest thing to a data-response item), Three-Dimensional Science Assessment, SAT Reading Practice Test, AI-Resistant Assignment Suggestions, Common Misconception Generator, Conceptual Understanding Generator.
  - Answers and marking: **Exemplar & Non-Exemplar** (model and weak responses), Rubric Generator, Student Work Feedback, Report Card Comments.
  - Differentiation: Text Leveler, Text Scaffolder, Assignment Scaffolder, Accommodation Suggestions, Multiple Explanations for Complex Concepts, Make it Relevant!, Choice Board (UDL), IEP/BIP generators, Vocab List, Vocabulary-Based Text.
  - Content: Worksheet Generator, Academic Content, Informational Text, Text Summarizer/Rewriter/Proofreader, **Text Translator**, Presentation Generator, Lesson/Unit Plan, Syllabus, Science Lab, PBL, Podcast Generator (May 2026).
- **Worksheet Generator 2.0 (help-center "What's new", 1 Jul 2026):** You pick a template, preview the layout, and refine in "Studio Mode". It exports to **PDF, Google Docs or Word**. You can change reading level, question type or length without starting over. It makes leveled versions of the same worksheet in one workflow and includes standards-aligned question sets.
- **Inputs:** a topic or text, pasted text, an uploaded document (MCQ page: "paste in a reading, upload a document"), and YouTube.
- **UX patterns:**
  - An **Actions bar under every output** can change the length, generate questions from the output, or translate it. The translate list covers ~98 languages including Mandarin/Cantonese **(secondary)**.
  - Raina 2.0 routes a plain-language request to the right tool and opens it pre-filled.
  - A Resource Library lets teachers upload their own rubrics and templates to ground outputs.
  - "District Knowledge" lets admins upload standards and guides that every tool then grounds on.
  - Collections group favourite tools.
- **Privacy:** FERPA, COPPA, GDPR and SOC 2 Type 2. Data is stored in the US and "never used to train AI models".
- **Weaknesses:** Most tools are single-shot forms that produce text, not structured items. Reviewers report the Text Leveler's grade-level accuracy is inconsistent and performance drops at peak hours **(secondary)**. It is US-standards-centric.
- URLs: https://www.magicschool.ai/magic-tools, /pricing, /tools/worksheet-generator, https://help.magicschool.ai/en/articles/12386023-what-s-new-tools-features

## 2. Brisk Teaching (briskteaching.com)

- **What it is:** A Chrome/Edge extension that works "on any page, in any file": Google Docs/Slides, Word/PowerPoint/OneDrive, YouTube, PDFs, websites and LMSs. It also has a web hub ("Brisk Next") and student activities ("Brisk Boost"). It claims 1 in 3 US teachers use it.
- **Pricing (plans page):** Free for teachers (20+ tools, "Standard" models). Premium for schools and districts is custom (35+ tools, "Turbo" models, standards and rubric alignment, admin). Intelligence is custom and grounds on the district's adopted curriculum.
- **Tool catalog ("Showing 51 of 51"), relevant subset:**
  - Quiz Maker/Generator, DOK Questions, **Teacher Exemplar** (free), AI Rubric Generator, Rubric Criteria Feedback, Glow & Grow / Next Steps / Targeted feedback, Inspect Writing (replays how a student revised).
  - **Text Leveler** (premium), **Text Translation Tool** (58 languages, free), Guided Notes Generator, Printables & Worksheet Generator, Inquiry Worksheet, "Create Anything", Standards Unpacker, ACT/SAT/state practice-test generators, Podcast Generator, Presentation Maker.
- **Quiz generator:**
  - Input: any open webpage, PDF or YouTube video, or highlighted text.
  - Options: grade, question type (MCQ, short answer, open-ended), count and focus.
  - **Output destinations:** Google Doc, **Word Doc**, Google Form, Microsoft Form, Kahoot!, Nearpod, and Canvas QTI for schools. Answer keys are embedded.
  - The refinement loop has Brisk ask clarifying questions first. You then **chat back and forth** to add questions or change difficulty. Prompt history lets you re-run earlier requests.
- **Change Level:** It **detects the source's grade level**, rewrites for grades 1–12, and translates into 50+/58 languages in one click. On Microsoft it can translate or re-level a Word doc in place and save .docx/.pptx to OneDrive.
- **Brisk Next:** Chat-to-adjust (reading level, question focus, format). "Bundles" combine a reading, activity sheet and exit ticket, with "Next Ideas" suggestions. Batch Feedback drafts per-student comments, and **you approve and edit before anything is sent**.
- **Privacy:** Brisk claims a 95% Common Sense Privacy rating. It says it "only reads the content you choose… and deletes it after generating a resource".
- **Weaknesses:** Output is dumped into a new Google or Word file as flat formatted text. There is no item model, so re-editing means working in the Doc. The free tier uses weaker models.
- URLs: https://www.briskteaching.com/ai-tools-for-teachers, /plans, /ai-tools/quiz-generator, /change-reading-level, /brisk-next, /platforms/microsoft

## 3. Diffit (diffit.me)

- **What it is:** Leveled, print-ready resources from any topic or source, focused on differentiation (ELL, SPED, MTSS).
- **Pricing:**
  - Basic is free: generate, edit, download PDF and print, with access to the last 90 days.
  - Individual teacher costs $14.99/mo or $149.99/yr **(secondary)**.
  - "Diffit for Schools" adds exports to **Google Docs/Slides/Forms/Classroom and Microsoft formats**, alignment to standards, skills, MTSS tier and DOK, the full archive, and a graphic-organizer library.
- **Current UI (screenshot diffit-app.png):**
  - It is a single prompt box ("A mini lesson with guided notes, practice problems, and exit ticket for…"). Under it are **Attach / Adapt / Align** buttons and quick chips: Slides, Scaffold, Test Prep, Math, Stations, Study Guide.
  - **Adapt popover** (diffit-adapt.png) offers Reading Level, Language, MTSS Tier (premium, crown icon) and Source Text, each defaulting to "Auto" with the note "We'll automatically level and scaffold based on your profile and prompt".
  - There are 24 starter templates. The relevant ones are a reading passage with comprehension questions, a **document-based question with primary sources and essay prompt**, **tiered practice at three difficulty levels with answer key**, a **unit test (MC, short answer, extended response) with answer key**, a graphic organizer (cause-effect, flow chart), bell ringers, and a vocabulary activity.
- **Standout UX:** Print-optimised layouts by default, and "all exports stay editable".
- **Privacy:** "No student logins, no student AI… Zero student data collected".
- **Weaknesses:** Exports are gated behind the paid tier. It is generic K-12 with no exam-board structure, and the language submenu options were not confirmed (the hover menu didn't open for me).
- URLs: https://web.diffit.me/, https://web.diffit.me/pricing, https://app.diffit.me/

## 4. Eduaide.ai

- **Pricing:** Free with a generation limit. **Pro $5.99/mo**, with regional pricing at checkout. Pro adds unlimited generations, "Erasmus" document chat for revisions, questions/rubrics/translations added to a document, image generation, **YouTube transcripts as a source**, a reasoning model, and more context (3× longer prompts, 5 standards, 3 uploaded docs).
- **Tools:**
  - A large template library with categories. Relevant ones: **Source Analysis Questions**, **Tiered Questions**, **Scenario-Based Questions**, Multiple Choice, True/False, Matching, Deep Question, Real World Examples, Mock Study, Anchor Chart Outline, Inquiry-Based Model, and graphic organizers and games.
  - **Assessment Builder** (eduaide-assessment.png) supports **9 question types**: multiple choice, multi-select, T/F, matching, fill, short, scenario-based, **multi-part**, essay. It builds the assessment in **sections**, each with a question count and **points per question**. A **Cognitive Demand distribution bar** sets the Easy/Medium/Hard percentages, e.g. 10/50/40.
- **Inputs:** a topic or learning objective, Word and PDF uploads, websites, YouTube, and standards from 50+ jurisdictions.
- **Review loop:**
  - **Evaluators** (eduaide-evaluators.png, "partnered with Learning Commons") score grade level, text complexity, prior-knowledge demands and grade appropriateness *before you teach*.
  - An "Adapt and Differentiate" side panel offers chunk text, summarise, draft a rubric, **build an answer key**, create an exit ticket, and generate MCQs.
  - The editor is a document with a toolbar.
- **Exports:** PDF, Google Docs, TXT, Google Forms, **DOCX**.
- **Weaknesses:** US standards. The output is a document, so questions aren't reusable items after export.
- URLs: https://www.eduaide.ai/, https://www.eduaide.ai/pricing

## 5. QuestionWell (questionwell.org)

- It describes itself as "Research-aligned generative, analytic, and agentic AI", organised as **Author / Analyze / Adapt**.
  - Author: standards-aligned questions, readings, vocab and interactive videos.
  - **Analyze**: "research-aligned lenses annotate your materials surfacing cognitive level, rigor, student agency, alignment".
  - Adapt: an agentic thought partner that helps reach a final draft.
- A teacher quote on the site: "kicks ChatGPT's butt in its ability to generate plausible **distractors**".
- **Exports (export-options page):** Kahoot, Blooket, Canvas, Quizlet, Quizizz, Moodle, Blackboard, Gimkit, Socrative, Schoology, MS Forms, **MS Word**, Google Slides, Google Forms, plus reading and vocab exports. It claims 22+. It offers LTI/Clever sync and **a custom MCP server** for plugging into other AI systems.
- **Pricing:** Free (MCQ and discussion questions from short readings). Premium is ≈US$70/yr, with longer inputs up to ~10k words, file upload, more question types (fill, short answer, T/F, multi-select) and video quizzes **(secondary)**.
- URLs: https://questionwell.org/, /export-options

## 6. Conker (conker.ai)

- A quiz generator for "standards-aligned quizzes in a flash", with 600k+ quizzes created. It has a ready-made NGSS/TEKS library.
- Question types: MC, fill-blank, short answer, T/F, reading comprehension **(secondary)**.
- Every quiz has **integrated read-aloud**.
- Exports to Google Forms and Canvas.
- Pricing: Free, Basic $3.99, Pro $5.99/mo **(secondary)**.
- It is the thinnest product in this set.

## 7. Twee (twee.com): language teaching

- 40+ tools for 10 languages, aligned to CEFR A1–C2.
- Input: "paste a topic, link, or list of words". YouTube is supported.
- Tools include texts, dialogues, fill-in-the-gap, open questions, and **Word-Translation Matching "for bilingual classrooms"**.
- Output: **PDF or Word (.doc)**, Google Forms/Docs, or an interactive link. AI grades student responses.
- Pro is ≈$7.49–$11.95/mo depending on billing **(secondary, conflicting)**.
- Relevance to us: its "level" parameter is a recognised exam framework (CEFR) rather than a US grade. Our equivalent is the HKDSE level (1–5**) and paper format.

## 8. Curipod (curipod.com)

- It has pivoted from an AI slide generator to **writing practice with instant AI feedback**, aligned to US ELA curricula.
- Pricing: Free (weekly sessions). Premium costs **$24/mo, or $228/yr**. District plans are custom.
- Features: "Score writing against your own rubric", content translations, bilingual ESL practice, and download lessons as PDF.
- Low relevance to paper authoring.

## 9. Khanmigo Teacher Tools (Khan Academy)

- **Free** for teachers, funded by Microsoft. It is available in multiple locales worldwide; I did not check whether HK/Chinese is included **(unverified)**.
- 25+ tools: lesson plan, IEP assistant, **Exit Ticket**, **Rubric Generator**, **Multiple Choice Quiz**, report card comments, recommendation letter, **Refresh my Knowledge**, recommend assignments, and class snapshot. They are grouped into Create / Differentiate / Plan / Support / Learn.
- A "Documents" section holds outputs to export or edit.
- URL: https://support.khanacademy.org/hc/en-us/articles/14799047733645

## 10. Education Copilot (educationcopilot.com)

- Free with 3 templates. **Pro $9/mo annual ($108/yr)**.
- "15+" tools: lesson plan, worksheet, slides, rubric, quiz/test maker with answer keys, unit/syllabus, IEP/differentiation, and newsletter.
- Export to PDF, Google Docs, Word or slides.
- It is generic, and its FAQ names economics only as an example subject.

## 11. SchoolAI (schoolai.com)

- It is mostly **student-facing AI "Spaces"** with teacher insights.
- Free trial: 5 Space launches a year. Pro and Scale are quote-based.
- Live translation in 60+ languages.
- A browser extension offers "Create a resource", content adaptation and presentations.
- Low relevance, since we have no student surface.

## 12. Almanack (almanack.ai)

- Positioning: "curriculum implementation". You **Adapt** a lesson (reading level, topic, pacing), **Differentiate** it into below-grade, above-grade, ELL and IEP versions against the same standards, and **Replan** it against your real calendar.
- Pricing: Free. **Pro US$7.50/mo annual ($89.99/yr)** or $11.99 monthly. Small Teams costs $6/user/mo. Schools are custom.
- Pro adds DOK differentiation and exports to Google Slides, PowerPoint and PDF. The integrations list names Word, Docs, Forms, Kahoot, Gimkit, Blooket, Wayground and Quizlet.
- The UI is fully localised: it auto-served zh-CN.

## 13. Wayground (formerly Quizizz)

- It auto-served a full **Traditional Chinese (zh-TW)** marketing site.
- AI builds a full activity "from a topic, document, standard or upload". A Chrome extension creates activities anywhere.
- "Small AI modifications" include **translate a homework page, add real-world scenarios, change reading level**.
- Built-in accommodations: read-aloud, translation, reduced answer choices, extra time.
- It emphasises the anti-cheating and academic-integrity angle.
- Individual "Super" plan pricing is **(unverified)**; one directory says "from $75/mo", which looks wrong.
- HK schools commonly use Quizizz **(unverified, but worth checking)**.

## 14. Microsoft "Teach" in the Microsoft 365 Copilot app

- It is **free with an M365 Education faculty licence**, and no paid Copilot licence is needed.
- Tools:
  - Lesson Plan, saved as a **Word document**.
  - **Rubric**, saved as a **Word document**.
  - **Quiz**, created in **Microsoft Forms**.
  - Flashcards, plus Fill-in-the-Blanks (coming).
  - Modify existing content: **Align to standards**, **Differentiate instructions**, **Modify reading level**, **Add supporting examples**.
- A History view is filterable by content type.
- The UI supports 100+ languages. Each generative tool has its own language list.
- It is grounded on "international standards".
- Because it is free and bundled, **HK schools on M365 A1/A3 already have it** (likely; I did not check HK tenant availability). This makes it the baseline an HK teacher will compare us against.
- URL: https://support.microsoft.com/en-us/education/copilot/teach-in-the-microsoft-365-copilot-app

## 15. Gemini in Google Classroom

- It is free in all Google Workspace for Education editions. The Gemini tab has **13 template tools**:
  - Outline a lesson plan
  - **Generate a quiz**: grade, count and topic, or a Drive file or pasted text. You edit the learning objectives first and then pick types (MC/TF/short/long). Output goes to **Copy, Add to Class, Google Docs or Google Forms**.
  - **Re-level text**
  - **Create a rubric**
  - Brainstorm project ideas
  - Write informational text
  - **Generate text-dependent questions**
  - Choice board
  - Vocabulary list
  - Hook
  - **Tackle common misconceptions**
  - Story
  - **Translate text**
- It also has **14 "prompt tools"** that open Gemini chat with a long pre-written prompt, e.g. real-world examples, DOK questions, unit plan, jigsaw **(secondary: Control Alt Achieve)**.
- 2026 additions: convert a Drive file into a Classroom-ready rubric (Aug 2026), audio lessons, NotebookLM-grounded outputs, and writing-feedback suggestions.
- Languages: "all Classroom-supported languages where the Gemini app is also supported".
- Notable UX: the teacher **confirms and edits the learning objectives before questions are generated**, which is a cheap alignment check.

## 16. ChatGPT for Teachers (OpenAI)

- A workspace **free for verified US K–12 educators until June 2027**. It includes file uploads, image generation, **Google Workspace and Microsoft 365 connectors**, and a teacher prompt library. Data is not used for training by default and it is FERPA-oriented **(secondary: OpenAI help and news)**.
- **Not available to HK teachers** (US-only eligibility).

## 17. Economics-specific tools

- **tutor2u Examiner AI (ai.tutor2u.net):**
  - It is **marking only**. It covers AQA and Edexcel A-Level Economics (7 question types each) and AQA GCSE Economics, among other subjects.
  - It converts handwriting and "never generates the correct answer".
  - It uses credits: £5 for 250 credits up to £100 for 25k, at ≤10 credits per answer.
  - It shows teachers pay for board-specific, question-type-specific marking prompts.
- **Notie AI:** grades AP, IB and A-Level economics essays and data-response answers, including "whether diagrams are analysed rather than described". It is grading, not authoring.
- **Graph makers** (Cloudairy, chatflowchart, Energent): text-to-supply/demand images. They are static pictures and cannot be edited as geometry.
- **Generators:** MagicSchool's *Data Table Analysis Generator* is the closest to a data-response item. **I found no tool that generates editable economics diagrams, or items in a specific board's format (HKDSE Paper 1 MCQ with (1)(2)(3)(4) combination statements, or Paper 2 structured parts with marks).** That gap is ours.

## 18. HK-local AI competitors (brief; other slices may cover these in depth)

- **thinka (thinka.ai):**
  - It covers HKDSE, IGCSE, A-Level and IB.
  - "Generate worksheets in seconds" by topic, difficulty and type (MC/short/long), with answers included.
  - It offers AI marking against official marking schemes and a class dashboard.
  - Teacher Premium costs **HK$390/mo, HK$1,990 per half-year, or HK$2,990/yr**.
  - It claims 20,000+ educators and 50+ schools.
- **KongPaper 港卷:**
  - It is student-first. It covers 11 DSE subjects **including 經濟 (economics)**, with Chinese and English writing marking.
  - Plans run HK$38–628/mo. Batch API is for teachers and institutions.
  - It demoed "all-subject paper generation" at the 2026 HK Learning & Teaching Expo **(secondary)**.
- **HKDSE.ai and UnaGPT:** mainly marking and language subjects **(secondary)**.
- **Implication:** HK AI entrants compete on *generation plus marking inside their own platform*. None claims native Word output that looks like an HKEAA paper, bilingual parallel text, or editable diagrams.

---

## Cross-cutting patterns worth copying

1. **Source-first input:** paste text, a URL, YouTube, a PDF/Word upload, or a highlighted selection (Brisk, MagicSchool, Eduaide, Diffit "Attach", Gemini "Drive file").
2. **Shape controls before generation:** count, type mix, points per question and difficulty distribution (Eduaide's cognitive-demand bar), plus editing the objectives before generating (Gemini).
3. **Post-generation action bar:** shorter/longer, translate, "generate questions from this", add an answer key (MagicSchool Actions, Eduaide Adapt panel, MS Teach "Modify").
4. **Chat-to-refine** on the generated artifact (Brisk, Brisk Next, Eduaide Erasmus, QuestionWell agentic Adapt).
5. **Quality lenses:** annotate rigor, cognitive level and text complexity before use (QuestionWell Analyze, Eduaide Evaluators).
6. **Leveled or tiered versions from one source** (Diffit, MagicSchool Worksheet 2.0, Almanack).
7. **Teacher approval gate** before anything reaches students (Brisk batch feedback, Gemini's "always double-check").
8. **Exports to many destinations,** but almost always as *flat documents*. Nobody keeps a structured item model through to a native Word exam layout. This is our structural advantage.

---

## Ideas for us (ranked)

Every idea lands as ordinary `McqQuestion` / `StructuredQuestion` / `SourceBlock` / `TableBlock` data (with
`BiText` en/zh), inserted through the same store actions a teacher's typing uses. The `.docx`, print and
clipboard backends therefore work unchanged, and nothing new is persisted. If AI provenance is ever
stored, it must go in `KNOWN_KEYS`. Recommendation: don't store it. Keep a transient **review tray** where
each generated item is accepted, edited or discarded before insertion. Numbering and marks stay derived.

### Feasibility options (applies to all)

- **A. Bring-your-own-key from the browser.**
  - Zero infrastructure and no server runtime, so it fits "static export". OpenAI and Gemini APIs accept browser CORS calls, and Anthropic requires the `anthropic-dangerous-direct-browser-access` header **(unverified this session)**.
  - Store the key in localStorage on web, or the OS keychain or Tauri Stronghold on desktop.
  - Downsides: teachers rarely have API keys, and the key sits in the page.
  - **Critical HK caveat (unverified, must check):** OpenAI, Anthropic and Google Gemini APIs have restricted or unsupported-region policies for Hong Kong. Providers that work from HK include Azure OpenAI (Azure has an HK region), Alibaba Qwen / DeepSeek international endpoints, and possibly OpenRouter. So BYOK should be **provider-agnostic, using an OpenAI-compatible base URL plus key**.
- **B. Vercel serverless proxy.**
  - This would be the **first server runtime**. It breaks "browser-only / nothing reads process.env at runtime".
  - With no accounts, we would need rate limiting and abuse protection.
  - We would pay per-token costs, likely cents per generation depending on the model (estimate).
  - Vercel Hobby is non-commercial, so a paid plan is needed.
  - Region and provider-ToS risk if it relays for users in unsupported regions.
  - It only makes sense with a paid tier.
- **C. Desktop-only.**
  - Tauri makes the HTTP call from Rust, so there is no CORS issue and the key lives in the keychain.
  - It could also target a **local model via Ollama/LM Studio**. Qwen-family models handle Traditional Chinese well. That route is free, offline and private (nothing leaves the machine) but lower quality and hardware-heavy.
  - Good for a "Pro desktop" story.
- **Recommended path:** one `AiProvider` interface (OpenAI-compatible chat plus JSON-schema output). Ship BYOK on desktop first (option C with a remote key), then web BYOK. Validate every response against a schema derived from our types before it reaches the tray.

### Ranked features

1. **Suggested answers, mark schemes and MCQ explanations for existing questions.** This fills the teacher version.
   - (a) The teacher version already exists, but the teacher must write every `answer` / `explanation`. This fills them per part and sub-part, respecting marks (e.g. 4 marks gives 4 creditable points plus a level descriptor for essay parts). It is the most-requested chore and has the lowest risk, because the teacher wrote the question.
   - (b) Brisk Teacher Exemplar, MagicSchool Exemplar & Non-Exemplar, Eduaide "Build an Answer Key".
   - (c) BYOK: the input is one question's JSON and the output is BiText answers. There is no schema change.
   - (d) **S.**
2. **Bilingual fill: EN↔繁中 with an HKDSE economics glossary.** Completes the missing side of `BiText` for a question, a source or the whole paper.
   - (a) EMI and CMI versions of the same paper are routine in HK. No competitor does *parallel* bilingual documents with HKEAA terminology (需求的價格彈性, 邊際成本…). Glossary pinning beats generic MT.
   - (b) Brisk Change Level / Translate (58 languages), MagicSchool Actions → Translate, Diffit Adapt → Language, Twee word-translation matching.
   - (c) BYOK LLM with a glossary in the prompt. A fallback is Chrome's on-device Translator API, which is free with no key, but I have not checked its zh-Hant quality or availability, and it doesn't know the glossary.
   - (d) **S–M.**
3. **Source → HKDSE items generator.** Paste an article, news clip, table or URL text, and get Paper 1 MCQs (including **combination (1)(2)(3)(4) statements**, which `McqQuestion.statements` already models) and/or Paper 2 structured questions with parts, sub-parts, marks and answers.
   - (a) This is the core time-saver, and the only one shaped like a real DSE paper.
   - (b) Brisk quiz (source-first plus clarify plus chat refine), Eduaide Assessment Builder (sections, count, points, difficulty-mix bar), QuestionWell (distractor quality), Gemini (confirm objectives first).
   - (c) BYOK with JSON output validated against McqQuestion/StructuredQuestion, then a review tray.
   - (d) **M.**
4. **Item quality lens.** Flags an ambiguous stem, two defensible options, implausible distractors, answer-letter imbalance across the paper, marks vs command-word mismatch ("explain" worth 1 mark), and missing answers in the teacher version.
   - (a) This is a moderation step before printing. The non-AI checks (answer distribution, missing answers) can ship free.
   - (b) QuestionWell Analyze lenses, Eduaide Evaluators.
   - (c) Deterministic part runs locally; the LLM part is BYOK. Results show as sidebar annotations, never printed (so no `data-print-hide` risk, because it isn't on the paper).
   - (d) **S** (deterministic) **+ S** (AI).
5. **Differentiated copy.** Duplicate a worksheet into a scaffolded version (hints, sentence starters, a long part split into steps, a word bank, 3-option MCQs) or a stretch version.
   - (a) Mixed-ability and SEN classes.
   - (b) Diffit Adapt / MTSS tiers, MagicSchool Worksheet 2.0 leveled versions, Almanack Differentiate, MS Teach "Differentiate instructions".
   - (c) BYOK. The output is a new document, so the original is untouched.
   - (d) **M.**
6. **Data-response builder from a table or chart.** Paste CSV, a table or a screenshot to get a `TableBlock`/`SourceBlock` plus structured parts (calculate % change, explain the trend, "with the aid of a diagram…"), and optionally **a starter economics diagram as editable `Diagram` geometry** (curves, points, labels, a shifted curve).
   - (a) This is the signature DSE Econ item. **No competitor generates editable econ diagrams**; they only offer static graph images.
   - (b) MagicSchool Data Table Analysis Generator; the graph makers show demand, but as images.
   - (c) BYOK (a vision model for screenshots). Diagram output should be restricted to a small preset vocabulary (S/D shift, tax wedge, price ceiling/floor, PPC) that our code turns into geometry, rather than raw coordinates from the LLM.
   - (d) **L.**
7. **Import a past paper or old worksheet (PDF/DOCX/photo) into structured questions.**
   - (a) Teachers' existing banks become editable, bilingual and re-printable. This is a strong adoption driver.
   - (b) Wayground "generate from upload", Brisk on PDFs, Eduaide uploads.
   - (c) BYOK vision/LLM. It is heavy on the parsing and review UI.
   - (d) **L.** It may overlap with the import/OCR research slice.
8. **Rubric / level descriptors for extended-response parts** (e.g. an 8-mark evaluate question gets L1–L3 descriptors in the teacher version).
   - (b) Every competitor has a rubric generator (MS Teach and Gemini are free).
   - (c) BYOK.
   - (d) **S.** It is a special case of #1.
- **Don't build: AI marking of student scripts.** It needs student data, accounts and a server. thinka, KongPaper and tutor2u already own it, and it conflicts with our no-account, no-server, privacy stance. Keep "no student data ever leaves the teacher's machine" as a selling point, like Diffit's "zero student data".

### Positioning note

Free bundled tools (MS Teach, Gemini in Classroom) now cover the generic generators, including quiz,
rubric, re-level and translate. HK-local AI players (thinka, KongPaper) cover practice and marking. Our
defensible angle is **AI that writes into a real HKDSE paper structure**: DSE item formats, derived
marks and numbering, parallel EN/繁中, editable diagrams, and native .docx that looks like an HKEAA paper.
The AI features should always land as editable structured items, never as a text blob.
