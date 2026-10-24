# Making the editor feel like Word — research (2026-10-24)

Task k-0198, research only: nothing in the app was changed. The ask (the user, u-nj70): *"do a
deep research analysis on how can we keep improving the editor so that the user experience
would be more like a teacher using microsoft word, and low down the learning curve of it."*

**How this was done.** I used the web app (`develop` at `9d5c7b8d`, Chrome, driven by a
script, English UI) as a teacher coming from Word would, and read the code behind each
surprise. I also read the four GitHub issues and counted how two teacher-made papers in
`real_life_reference/` are built. Three research passes covered Word, worksheet and exam
tools, and onboarding; sources are linked inline. **Not tried:** the desktop app
(`npm run desktop:dev` needs a display this server lacks), a real iPad, the 中文 UI
beyond a glance, and real teachers.

---

## Short answer

The *page* already behaves like Word. Tables (0.8.3) and Tab (0.8.4) were rebuilt to Word's
rules, and the `.docx` is real Word. **What still feels foreign is the first five minutes of
typing.** Three things in Word's muscle memory work differently here, and two of them throw
away what the teacher typed without saying so:

1. **One click does not put a cursor in the text.** Letters typed after one click are
   dropped until Space is pressed (tables are the exception).
2. **Enter closes the text** instead of starting a new paragraph, and the next words go
   nowhere.
3. **The Word keys teachers press without thinking do nothing:** ⌘S, ⌘P, ⌘F, ⌘H,
   Ctrl+Enter. Right-click has no Cut, Copy or Paste.

Fix those first. It is cheap, and it is where Word users decide whether an app is "hard".
Next comes **find and replace**, a **sample paper on first run**, and **paste from Word
that keeps bold and can turn a pasted question into a question**.

Do **not** copy Word's free layout: text boxes, floating pictures, styles and hand-built
numbering. Those are what teachers fight in Word, and the app's derived numbering and marks
are its whole advantage. **Where the app is structured, it should look structured.** Where
it looks like Word, it should behave exactly like Word.

---

## 1. What a Word teacher hits

Each gap says where it is. "Seen" means I watched it happen in the app. "Code" means I
read it in the source.

### A. Typing — the first five minutes

**G1. One click does not start typing (seen).** In Word one click puts the caret where you
clicked. Here the first click only *selects* a text. Letters typed then are dropped, until
Space or Enter opens the text, and the caret then goes to the end, not where you clicked.
Typing "Single click text" after one click left "click text". The first word was gone, with
no message.
- `src/components/preview/InlineEditable.tsx:583-605`: click selects, a second click edits,
  and only Enter or Space opens.
- Table cells open on one click (`:583`, shipped 0.8.3), so **one page now has two rules**.
  Moving between the two is how Word habits misfire (see § 4, negative transfer).

**G2. Enter closes the text (seen).** In a question's text or an option, Enter ends editing
and the next words land nowhere. "second line" vanished after Enter. In a table cell Enter
makes a new line, as in Word. Shift+Enter makes a line break, but nothing on screen says so.
- `InlineEditable.tsx:400-415`. The comment there gives the reason: "a worksheet field is a
  line, not a document".
- The same complaint was finding #2 in `docs/Tables vs Word.md` (fixed for cells only).

**G3. Delete has no visible way back (code).** Delete or Backspace removes a selected
question, element or picture with no message. ⌘Z brings it back, but only if the teacher
thinks of it. Only deleting a *page* from the rail says "You can undo this with ⌘Z".
- `Preview.tsx:6517-6645`; `src/components/editor/shell.messages.ts:217`.

**G4. Paste drops everything but the words (seen + code).** I pasted a Word fragment: a bold
line, two parts "(a) … (2 marks)", "(b) …" and a two-column table. It all became one
question text with line breaks. The bold was lost, the parts did not become parts, and the
table became tab-separated text.
- `src/components/preview/RichTextEditable.tsx:270-285` (plain text by design).
- Word itself now defaults to **Merge Formatting** for paste from other programs. That keeps
  bold, italic and underline and takes the destination's font
  ([Microsoft 365 Insider blog](https://techcommunity.microsoft.com/blog/microsoft365insiderblog/updated-default-paste-option-in-word-for-windows/4225168)).
- A whole-paper import exists, but only from the start screen and only into a *new* paper
  ("Import from Word, PDF or picture…", `src/components/start/StartScreen.tsx:364`).
- A picture cannot be pasted onto the page (`src/components/import/pasteSession.ts:110` is
  the only reader of pasted files).

### B. Keys

**G5. The everyday Word keys are missing (seen + code).** None of these does anything in
the editor:

| Key | What Word does there | What happens in the app |
|---|---|---|
| ⌘S | Save | the browser's "Save page as…" |
| ⌘P | Print | browser print |
| ⌘F / ⌘H | Find / Replace | the browser's find bar; no in-app replace |
| Ctrl+Enter | Page break | nothing |
| Ctrl+E/L/R/J | Align centre / left / right / justify | nothing |
| Ctrl+Shift+> / < | Font size up / down | nothing |
| Ctrl+Y outside a text | Redo | nothing |
| ⌘+ / ⌘− | Zoom | the browser zooms the whole app |

- Word's own list:
  [Keyboard shortcuts in Word](https://support.microsoft.com/en-us/office/keyboard-shortcuts-in-word-95ef89dd-7142-4b50-afb2-f762f663ceb2).
- The keys that do work are ⌘B/I/U while typing, ⌘Z/⇧⌘Z, Tab, ⌘A/C/X/V on selected
  questions, ⌘J (AI) and ⌘, (Settings) (`src/components/ui/undoChord.ts`,
  `EditorApp.tsx:440-489`, `Preview.tsx:6883-6922`).
- The desktop app defines **no native menu bar**, so there is no Edit or File menu either
  (`src-tauri/src` has no menu code).

**G6. No list of the keys (code).** There is no "?" or ⌘/ sheet. B/I/U tooltips say "Bold"
without the key, and the Undo tooltip says "⌘Z" on Windows too
(`src/components/editor/Toolbar.messages.ts:36-37`).

### C. Finding things

**G7. No find and replace (code).** It exists in neither the editor nor the plan
(`docs/IDEAS.md` does not list it). Teachers reuse last year's paper and change a year, a
price or a country throughout; in Word that is ⌘H.

**G8. Insert Table and Insert Picture are hard to find (seen).** In Word they are the first
things on the Insert tab. Here they are not in the left rail's menus (Question / Element).
They are in the right-click menu, but only while a text is open, and in the sidebar's small
"Add Text · Table · Image" row (`src/components/editor/AddRail.tsx:191-279`). This was
flagged in `docs/Tables vs Word.md:103` and is still true.

**G9. Right-click is thin (seen).**
- On an open text: Insert below (Paragraph, Table…, Image…, Diagram, Source panel), AI…,
  Delete paragraph.
- On a question that is selected but not open: only "AI…".
- Never Cut, Copy or Paste (`Preview.tsx:6085-6335`). Microsoft's telemetry made Paste the
  biggest button on the ribbon because people click it more than anything, shortcut or
  not ([Jensen Harris, "No distaste for paste"](https://learn.microsoft.com/en-us/archive/blogs/jensenh/no-distaste-for-paste-why-the-ui-part-7)).

**G10. Words that are not Word's (seen + code).**

| App word | What a Word user would call it |
|---|---|
| Element / 版面 | Insert |
| Stem | question text |
| Shared stimulus | a passage for several questions |
| Source panel | a box |
| Label list | — |
| Part header | a heading with marks |
| Answer lines / Answer space / Answer space · fill | three kinds of lines |
| Setup / Settings | two different things |
| Section | means "restart numbering", not Word's section break (`docs/GLOSSARY.md`) |

- The Element menu has 12 entries (`src/components/editor/AddRail.messages.ts:24-50`).
- The import screen says 子分題 where the editor says 小分題.

**G11. Settings that Word puts on the Home tab live in Setup (code).** Font family, text size,
justify-all and the MC option layout for every question are in Document setup. The format bar
has size, B/I/U, sub/superscript, alignment and colour, but no font, no bullets or
numbering, and no indent (`src/components/preview/FormatToolbar.tsx`;
`src/components/editor/DocumentSettings.messages.ts`). Keeping fonts paper-wide is right
(§ 4), but a teacher hunting for "Font" should land on it.

### D. First run

**G12. Every paper starts blank (seen).** There is no sample paper to open and poke at. The
four paper cards are good (`src/components/start/WelcomeDesk.tsx`), but a Classroom
worksheet opens empty. Every tool that teachers learn quickly starts them from something
filled in (§ 3).

**G13. The New worksheet dialog warns before it helps (seen).** "Everything else has a
default and is **awkward to change** once questions are written." That tells a new user to
be afraid of choices they cannot yet judge (`src/components/start/screen.messages.ts:57-62`).

**G14. The edit hint is wrong and keeps coming back (seen + code).**
- It says "Double-click text to edit". That is not Word's rule, and it is also not the
  app's own rule, since one click then Enter works and tables take one click.
- Its hard-coded Chinese line says 按頁面文字即可編輯 ("click"), while the catalogue says
  按兩下 ("double-click") (`src/components/EditorApp.tsx:729` vs `EditorApp.messages.ts:5`).
- It reappears every time a paper opens (`EditorApp.tsx:697-708`).

**G15. No help to pull (code).** There is no help link or "how do I…?" anywhere. Tooltips are
native `title` text.

### E. Save and print

**G16. "Save" works differently (seen).**
- The app autosaves and shows "Saved", which is good.
- ⌘S does nothing useful, and "Save now" is buried in the ⋯ menu.
- There is no Save As; a copy is Export → .json or Duplicate on the start screen.
- The start screen says "Stored in this browser only. Clearing site data deletes it."
  Accurate, but it is the first sentence a new web user reads about their work.
- NN/g: most users assume nothing is saved until they press Save, so autosave and a Save
  command should coexist ([Efficiency vs. expectations](https://www.nngroup.com/articles/efficiency-vs-expectations/)).

**G17. No Print (code).** A PDF is Export → PDF ("Print to PDF…" on the web). That is
reasonable, but ⌘P should lead there.

### F. Layout surprises

**G18. Three switch groups before any work (seen).** The top bar has three switch groups: EN /
中文 / EN+中, Student / Teacher / Marking scheme, and Edit / Preview. That is eight buttons
of modes. In Word, the page is the page.

**G19. iPad portrait shows a small page (seen).** At 820 px wide the sidebar takes half the
screen and the page is drawn at 37 % (Chrome at iPad size; Split View is narrower still).
The user works from an iPad as often as the Mac (workspace `AGENTS.md`).

**G20. No ¶ marks and no word count (code).** Word users diagnose layout with Show/Hide ¶:
where a tab is, where a break is. It was proposed and not built (`docs/Tabs vs Word.md:103`).
A word count matters less: the paper summary's marks, minutes and pages is the better count
for this job.

### What is already Word-like (keep it)

- Tables type, merge, paste and format like Word (0.8.3).
- Tab, tab stops and the ruler work like Word (0.8.4).
- ⌘Z works while typing.
- Undo and Redo buttons are always visible.
- The page is a real A4 sheet with page breaks where the `.docx` breaks.
- Numbering is a live Word list in the export.
- Copy for Word works, and import from Word/PDF has a review screen.
- Autosave runs about a second after each change.

---

## 2. What the evidence says teachers actually do

**The reporter's own asks.** All four GitHub issues come from one teacher making MC unit tests
on Windows:
- #1: text size 11/12, and an MC question should stay whole.
- #2: justify the options.
- #3: justify the (1)(2)(3) statements.
- #4: a question could not be moved after Q5.

Every one is a Word habit: *make the page look like this, with one control, on the page*.
(#4 is Word's "cut the paragraph, paste it lower".) See `docs/design/format-settings.md` § 1.

**How a teacher's own Word paper is built.** I counted the parts of `DBS_Assessment1.docx`, a
school paper:
- 114 of its 296 paragraphs use Word's automatic numbering;
- 733 tab stops line things up;
- 7 tables;
- 3 hand-made page breaks;
- no text boxes.

The HKEAA's own `2019_Question_Paper_2.docx` is the opposite: 188 text boxes and typed
numbers. **Teachers' Word is lists, tab stops, tables and page breaks.** The app already
models all four, so the gap is in how they are typed, not in what can be made.

**What teachers fight in Word** (why the structure is worth keeping):
- **Numbering breaks.** Mixing the ribbon's number buttons with styles makes "spaghetti
  numbering" ([Shauna Kelly](https://shaunakelly.com/word/numbering/outlinenumbering.html),
  [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/5066067/multilevel-lists-defined-wrong-how-to-fix)).
- **MC options are hard to line up.** Chinese teacher guides call aligning the options "the
  only hard part" of making a paper in Word, and advise tab stops over spaces or tables
  ([kknews](https://kknews.cc/zh-tw/other/293qznz.html)).
- **Pictures and text boxes move.** "Text boxes moving all over the place"; the workaround
  offered was to lay out in PowerPoint
  ([Tes](https://www.tes.com/news/ms-word-hacks-6-ways-supercharge-everyday-tool),
  [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/5395663/how-do-i-stop-pictures-from-moving-around-when-typ)).
- **Marks columns and totals are built by hand.** Teachers use a table with formulas
  ([Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/1c21aa4e-65fd-4cdb-bdcb-92f806f79206/inserting-and-adding-exam-marks)).
  Answer lines are done with underscores or tab leaders
  ([Microsoft: leaders](https://support.microsoft.com/en-us/office/show-dots-or-leaders-between-tabs-c80b62d0-2244-4078-95bd-8c82f91440ba)).
- **The best Word exam template is all styles**, and its reviewers call it "difficult to
  understand for some"
  ([Tes Edexcel template](https://www.tes.com/teaching-resource/custom-paper-template-for-edexcel-maths-1ma1-in-microsoft-word-12721047)).
- **Microsoft has no exam or worksheet template in Word.** It sends teachers to Forms for
  quizzes ([learning templates](https://word.cloud.microsoft/create/en/learning-templates/),
  [Tools for teachers](https://support.microsoft.com/en-gb/office/tools-for-teachers-manage-your-class-0298dcb0-dfba-4b5e-ad71-b7ea119ae62b)).

**What stops teachers adopting a tool.**
- Time comes first. In Hong Kong the most-reported barriers are preparation time and
  confidence ([Bai & Lo](https://researchgate.net/publication/329863799);
  [RPTEL 2026](https://rptel.apsce.net/index.php/RPTEL/article/download/2026-21030/2026-21030)).
- Across 114 studies, teachers adopt what they find *useful* more than what is *easy*
  ([Scherer et al. 2019](https://www.researchgate.net/publication/327724197)).
- So: remove the first-five-minute friction, then *show the payoff* (marks add up, numbers
  stay right, the Word file is clean).

---

## 3. What other tools do to lower the learning curve

- **Start from something filled in, not blank.**
  - Notion opens on a "Getting Started" page that is itself a working checklist
    ([Appcues teardown](https://goodux.appcues.com/blog/notions-lightweight-onboarding)).
  - Linear seeds demo data ([Candu](https://www.candu.ai/blog/linear-onboarding-teardown)).
  - Canva and Twinkl start from templates ([Canva](https://www.canva.com/create/worksheets/),
    [Twinkl Create](https://www.twinkl.com/create)).
- **"Bring my old worksheet" is a first-class start.**
  - Microsoft Forms Quick Import turns a Word quiz into questions, then opens a review step
    ([Microsoft](https://support.microsoft.com/en-us/forms/convert-a-word-or-pdf-form-or-quiz-to-microsoft-forms)).
  - Wayground does the same from DOCX or a photo
    ([Wayground](https://help.wayground.com/support/solutions/articles/158000405095-wayground-ai-turn-worksheets-question-banks-more-into-interactive-assessments)).
  - The app has this (import); the gap is reaching it from inside a paper.
- **One key to insert anything.**
  - Notion's "/" menu lists recent items first and has "turn into" to change a block's type
    ([Notion](https://www.notion.com/help/writing-and-editing-basics)).
  - Google Docs' "@" does the same job
    ([Google](https://support.google.com/docs/answer/10710316?hl=en)).
  - On touch screens Notion uses a toolbar instead, because there is no hover.
- **Find a command by name.**
  - Word's Search box (Alt+Q, once "Tell me") runs commands by name
    ([Microsoft](https://support.microsoft.com/en-us/accessibility/word/keyboard-shortcuts-in-word)).
  - Google Docs has Tool finder (Alt+/) and a shortcut list on ⌘/
    ([Google](https://support.google.com/docs/answer/179738?hl=en&co=GENIE.Platform%3DDesktop)).
- **Marks entered once, every total derived.**
  - LaTeX `exam` adds up points per question, page and paper and prints a grade table that
    updates itself ([exam class manual](https://math.mit.edu/~psh/exam/examdoc.pdf)).
  - The app already does this. It is the payoff to show.
- **Help in context, not up front.**
  - NN/g: up-front tutorials do not improve success and make tasks *feel* harder (91 % vs 94 %
    success, not significant)
    ([Onboarding tutorials](https://www.nngroup.com/articles/onboarding-tutorials/),
    [Mobile tutorials](https://www.nngroup.com/articles/mobile-tutorials/)).
  - Empty states should teach, and offer the next action
    ([Empty states](https://www.nngroup.com/articles/empty-state-interface-design/)).
  - Teach a shortcut just after the slow way, and never override the standard keys
    ([UI accelerators](https://www.nngroup.com/articles/ui-accelerators/)).
  - Onboarding checklists finish only 10–20 % of the time
    ([Userpilot benchmark](https://userpilot.medium.com/customer-onboarding-checklist-completion-rate-2024-benchmark-report-8ebabebefb1f));
    tours the user starts themselves finish about twice as often
    ([Chameleon](https://www.chameleon.io/benchmark-report)).
- **Labels beat icons for non-experts.** Adding text labels to Outlook's icon toolbar "caused
  a total turnaround"
  ([Jensen Harris](https://learn.microsoft.com/en-us/archive/blogs/jensenh/the-importance-of-labels)).
  **Commands should stay in fixed places.** Office 2000's adaptive menus failed
  ([Jensen Harris](https://learn.microsoft.com/en-us/archive/blogs/jensenh/combating-the-perception-of-bloat-why-the-ui-part-3)).

---

## 4. When to copy Word, and when not

- **Jakob's Law:** users expect your app to work like the ones they already use
  ([NN/g](https://www.nngroup.com/videos/jakobs-law-internet-ux/)). Break a convention only
  when it is necessary or much better
  ([Consistency and standards](https://www.nngroup.com/articles/consistency-and-standards/)).
- **Looking familiar but behaving differently is worse than looking new.** When a device is
  "erroneously perceived as familiar", people reuse their old habits and make *more* errors
  than a novice would ([negative transfer, Besnard](https://apps-eprint4-l.ncl.ac.uk/71748);
  [Emergo by UL](https://www.emergobyul.com/news/reducing-use-errors-avoiding-negative-transfer)).

**The rule this gives:**
- Where the app shows a page of text, it must type like Word (click, Enter, keys, paste).
- Where it is a structure Word does not have (a question, its parts, marks, A–D options), it
  should *look* like a structure: a handle, a chip, a box. That way nobody expects Word
  there.
- Today the text looks like Word and types differently (G1, G2). That is the worst of both.

---

## 5. Recommendations, ranked

Impact counts how many teachers hit it in their first hour. Effort uses `docs/IDEAS.md`: S ≈ a
session, M ≈ a few, L ≈ an initiative. None of these changes the saved format, so no schema
step is needed unless marked.

### Top 5 (do in this order)

| # | Change | Impact | Effort |
|---|---|---|---|
| 1 | One click puts the caret where you clicked, in every text, as in table cells; no keystroke is ever dropped | Very high | S–M |
| 2 | Enter in question text starts a new paragraph; Enter in an option goes to the next option; Esc finishes | Very high | M |
| 3 | The Word keys: ⌘S, ⌘P, ⌘F/⌘H, Ctrl+Enter, ⌘E/L/R/J, Ctrl+Shift+>/<, Ctrl+Y, plus a "?" key list and the keys in tooltips | High | S |
| 4 | Find and replace across the paper, both languages, one undo | High | M |
| 5 | A filled sample paper on the start screen, and a calmer New worksheet dialog | High | S–M |

### Quick wins (S each)

**Q1. Never drop a keystroke.** If a text is selected and the teacher types a letter, open it
and keep the letter. This is the safety net under #1, and could ship alone this week.
- *Word:* there is no such state; a click is a caret.
- *Change:* `InlineEditable.tsx:600-605` gives printable keys the same treatment as Enter
  and Space.
- *Risk:* very low. Bare letters must not be taken while a menu, the bank's j/k or the
  題型 sort board (1–9, Z) owns the keys; scope it to the page.

**Q2. The Word keys (#3).**
- *Word:* see the table under G5.
- *Change:*
  - ⌘S runs "Save now" and shows "Saved"; it must never open the browser's Save page.
  - ⌘P opens Export at PDF, or the print dialog on desktop.
  - Ctrl+Enter adds a New page after the current question.
  - The alignment and size keys drive the format bar.
  - Ctrl+Y redoes everywhere.
  - On desktop, a native Edit and File menu lists them.
- *Risk:* low.
  - Ctrl+Enter inside a cell must not split a table.
  - ⌘P must not fight the browser on the web.
  - Mac and Windows labels must differ: show "Ctrl" on Windows, not "⌘" (G6).

**Q3. A key list.**
- *Word / Docs:* Google Docs ⌘/; GitHub "?".
- *Change:* "?" (outside a text) and ⌘/ open one sheet of keys, grouped Type / Questions /
  Page. Every tooltip gets its key: "Bold (Ctrl+B)".
- *Risk:* none.

**Q4. An Undo message after a delete.**
- *Word:* none needed, because the paragraph is visibly gone under the caret. Here a whole
  question disappears.
- *Change:* "Question 3 deleted · Undo" in the corner, as the bank and option layout already
  do.
- *Risk:* none.

**Q5. Right-click like Word.**
- *Change:*
  - Cut / Copy / Paste first on every text and question.
  - "Add question below" and "Insert table / picture" on a selected question, not only "AI…".
- *Risk:* the browser blocks reading the clipboard on a menu click in some cases. The
  in-page question clipboard already works (`Preview.tsx:6904-6922`), and text paste may
  need the platform layer on desktop.

**Q6. Table and Picture in the Element menu, renamed "Insert" (decision D3).**
- *Word:* Insert → Table, Pictures.
- *Change:* two entries at the top of the menu, inserting after the selected question.
- *Risk:* none.

**Q7. Fix the edit hint.**
- *Change:*
  - It matches the rule (after #1: "Click any text to type").
  - The two languages agree.
  - Once dismissed, it stays dismissed (store it with the What's new "seen" state).
- *Risk:* none.

**Q8. A calmer New worksheet dialog.**
- *Change:* say what *can* change later in Setup ("You can change paper, margins and fonts
  later in Setup"). Keep a warning only for what truly cannot change, which a builder should
  check first.
- *Risk:* none.

### Medium (M)

**M1. One rule for clicking and Enter (#1, #2).** This is the core change.
- *Word:* a click places the caret; Enter is a new paragraph; Shift+Enter is a line break.
- *Change:*
  - A click on text places the caret, as in cells (`InlineEditable.tsx:583`).
  - Selecting a whole question moves to its number and handle (the grip is already there),
    and to the margin.
  - Enter in a question's text splits it into the next paragraph block. Its blocks already
    allow several paragraphs: the sidebar's "Add Text".
  - Enter at the end of an option goes to the next option. Enter on an empty last option
    adds E only if the teacher asked for one; otherwise it finishes.
  - Enter in a one-line field (a heading, a marks box) still finishes.
- *Risk: medium.*
  - Today's users have learnt the old rule.
  - IME composition: keep the `isComposing` check that cells already have.
  - Drag-to-select versus drag-to-move: drag stays on the grip only.
  - A split stem must keep every saved paper printing the same. Test against
    `src/test/corpus/v1-published.json` and the sample papers.
- Verify on an iPad: touch has no double-click, so "one tap types" helps there most.

**M2. Find and replace (#4).**
- *Word:* ⌘F opens the Navigation pane with results; ⌘H is Replace (Ctrl+H on Mac).
- *Change:*
  - A bar over the page searches every authored text: question text, options, parts,
    answers, marking points, header and footer.
  - It searches EN, 中文 or both, highlights each hit on the page and in the Content list,
    and offers Replace / Replace all as one undo step.
- *Risk:*
  - Replacing inside teacher-only text must be visible: "3 in answers".
  - Never touch derived text (numbers, marks).
  - A 中文 search must respect full-width punctuation.

**M3. A sample paper (#5).**
- *Word / others:* Notion's getting-started page, Linear's demo data, Canva templates.
- *Change:* "Open a sample paper" on the start screen and in the empty state. It is a short
  Classroom worksheet: 3 MC, 1 structured question with a table and a diagram, marks, an
  answer key. It opens as an ordinary paper the teacher can change or delete.
- *Risk:*
  - Low for the code.
  - Content needs the user: it must be original, DSE-style and bilingual (D4).
  - It must not seed the 題庫 with fake questions; mark it hidden from the bank, which
    Setup can already do.

**M4. Paste from Word that keeps the formatting, and offers to make questions.**
- *Word:* Merge Formatting is the default for pasting from other programs since version 2405.
- *Change:*
  - Pasting into a text keeps bold, italic, underline, sub/superscript and tabs, and drops
    fonts, sizes and colours (the runs the app can store).
  - When the paste looks like questions ("1.", "(a)", "A.", "(2 marks)"), a small bar
    offers "Make these into questions". It runs the existing import engine on the clipboard
    and inserts after the current question, with one undo.
  - Pasting a picture onto the page inserts it.
- *Risk:*
  - The import engine was built for files. Its clipboard readers exist but are unused by
    design: "if a teacher can copy the text, they can paste it"
    (`docs/design/paste-import.md:7-9`). This reverses that call (D6).
  - HTML from Word must be sanitised to the run attributes the model has.

**M5. A command search.**
- *Word:* Search (Alt+Q). *Docs:* Tool finder.
- *Change:* ⌘K (and a 🔍 in the top bar for iPad) lists every insert, every Setup setting and
  every export, in both languages. "font" finds Setup → Fonts, "page break" finds New page,
  "justify" finds Justify text.
- *Risk:*
  - Low.
  - The index must follow the catalogues, so new strings join it automatically.

**M6. Word's words, or Word's words beside ours (D3).**
- *Change:*
  - Rename "Element" to "Insert" (插入).
  - Say "question text" where the UI says "Stem" (題幹 is fine in 中文).
  - Gloss "Section" as "Section · restarts numbering" everywhere.
  - Merge the three answer-line entries into one "Answer lines…" with a choice of ruled,
    dotted, or to the end of the page.
  - Use 小分題 in import too.
- *Risk:*
  - Words are in tests and the film. `docs/design/ui-language.md` and the i18n tests must
    move with them.
  - The current users have learnt the old words, so change each once, with a What's new
    line.

**M7. Show formatting marks (¶).**
- *Word:* Show/Hide ¶ (Ctrl+Shift+8); used to see why a layout breaks.
- *Change:* a toggle that draws tabs (→), line breaks (↵), New page and the "keep on one
  page" / "start on a new page" marks on the page, never in print (`data-print-hide`).
- *Risk:* low. It shows *why* a question moved to the next page, which is the question
  behind GitHub #1 and #4.

### Big bets (L)

**B1. Fit the page to the iPad.**
- *Change:*
  - In portrait and Split View, the sidebar becomes a sheet that slides over the page, and
    the page fills the width.
  - The format bar's touch targets are at least 44 px.
  - One tap types (follows M1).
- *Risk:* layout work across the editor, and it can only be checked on a real iPad. The
  user works from a MacBook, an iPad and an iPhone equally (workspace `AGENTS.md`).

**B2. Import into the open paper, and reopen our own .docx.**
- *Word:* teachers live in .docx.
- *Change:*
  - Import offers "Add to this paper" as well as "New paper".
  - A `.docx` the app exported reopens as its paper, by embedding the paper's JSON in the
    `.docx` as a custom part. This needs a design pass against the "saved documents always
    reopen" promise.
- *Risk:*
  - Medium–high.
  - Anything edited in Word after export cannot round-trip faithfully. Say so, rather than
    guess.

**B3. A Word-style ribbon. Not recommended now (D5).** A single-line "Home · Insert · Layout"
bar would match Word's look ([Simplified ribbon](https://support.microsoft.com/en-us/office/using-the-simplified-ribbon-in-word-for-the-web-c145ac47-ddea-497e-bacc-31699e09a6cc)),
but it is a rebuild of every toolbar for little gain once M5, Q6 and M6 exist. It would also
crowd the iPad. Revisit only if teachers still cannot find things after those.

**B4. Watch three teachers make their first paper.**
- *Change:* 30 minutes each, screen shared, no help given. Record where they stop.
- *Effort:* low for us, high for the user to arrange (D8).
- *Why:* every finding here comes from me using the app as a Word user would. Real teachers
  will find what I could not, especially in the 中文 UI and on Windows.

---

## 6. What not to copy from Word

- **Free text boxes and floating pictures.** They are the top layout complaint about Word
  (§ 2). The app's blocks flow with the text, which is the fix. Keep it.
- **Typed or hand-built numbering, and Word's "1." AutoFormat for questions.** Derived numbers
  and marks are the product's promise (`AGENTS.md`). Typing "1." should not start a list.
  Offer "Make these into questions" instead (M4).
- **Styles and the multilevel list dialog.** Styles are where Word templates become
  "difficult to understand". The app's question types *are* the styles.
- **Section breaks.** Keep "Section" as a numbering restart, glossed (M6). Do not add
  next-page or continuous section breaks.
- **Keep-with-next marks in the `.docx`.** Already removed on the user's call (the black ¶
  squares, 2026-10-19).
- **Free line spacing.** Closed on the user's word (12 pt stays, 2026-10-23).
- **Font per run.** Fonts are paper-wide, as the HKEAA's are. Let ⌘K find "Fonts" instead.
- **A manual-save model.** Keep autosave. Honour ⌘S as "save now" and show "Saved". Never
  make saving the teacher's job.
- **The full ribbon, adaptive menus, up-front tours, and What's new popping up mid-work.**
  Microsoft's own data says adaptive menus failed. NN/g says tours do not help. Keep What's
  new on its badge.
- **Word's two-step "Can't undo" for file actions.** Every change here is undoable, which
  is better than Word. Say so in the delete message (Q4).

---

## 7. Decisions only the user can make

1. **Enter in question text** (M1): new paragraph, as in Word (recommended), or finish, as now?
2. **One click** (M1): types, as in Word and table cells (recommended). Selecting a question
   then moves to its number, handle or margin. Or keep click-to-select?
3. **Words** (M6, Q6):
   - Rename Element → Insert (版面 → 插入)?
   - Stem → question text?
   - Merge the three answer-line entries?
   - Each is one What's new line for current users.
4. **The sample paper** (M3): who writes it, and on which topic? It must be original, not a
   past paper.
5. **Toolbar direction** (B3): keep the rail and floating format bar, adding Insert entries
   and ⌘K (recommended)? Or move toward a Word-style ribbon?
6. **Paste** (M4): keep bold, italic and underline by default (Word's own default now)? And
   reverse the "file-only import" call so a paste can become questions?
7. **⌘S on the web** (Q2): take it from the browser to mean "Save now" (recommended)?
8. **Teacher sessions** (B4): can you find two or three teachers for 30 minutes each, ideally
   one on Windows and one using 中文?
9. **Priority against the format-settings track** (`docs/design/format-settings.md`): do Q1–Q8
   before the next setting?

---

## Appendix — evidence notes

- **Walkthrough script:** a Playwright run against `next dev` on port 3197. Screenshots of the
  start screen, the New worksheet dialog, the empty editor, the editing bar, the Element menu,
  paste, and iPad (820 × 1180) and iPhone (390 × 844) widths were kept outside the repo
  (`/tmp/wordux/shots`).
- **G1** was reproduced at human typing speed (60 ms a key).
- **Census:** a regex count over `word/document.xml`:
  - `w:numPr` for auto-numbered paragraphs;
  - `<w:tab w:` for tab stops;
  - `<w:tbl>` for tables;
  - `w:type="page"` for page breaks;
  - `txbxContent` for text boxes.
  
  `2021 (Student) (EN).docx` is this app's own export and was left out of the conclusions.
- **Could not verify:**
  - Reddit teacher threads (blocked to automated reading).
  - A current Microsoft page for Word's simplified ribbon on desktop.
  - Whether the browser's own ⌘P prints the page well on iPad Safari.
