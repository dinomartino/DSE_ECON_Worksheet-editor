# Changelog

What each release of Econ Studio contains, newest first. Written for teachers: name
the thing they can now do, not the file that changed.

Rules: every feature or fix that lands on `develop` adds a line under **Unreleased** in
the same commit. At release, that section is renamed to the version and date, and its
text becomes the GitHub release body (see `RELEASING.md`). Sections are grouped as
**Added**, **Changed**, **Fixed**. Nothing below a version heading is edited afterwards.

## Unreleased

### Added
- **Graphs 圖表庫: draw a graph once and keep it.** Open Graphs from the start screen,
  start from a template or blank axes, and draw on the full page. Graphs save as you work,
  sit in your backups, and copy straight into Word at their printed size, or download as
  a PNG.
- **Put your saved graphs into questions.** Diagram ▾ has a My graphs tab beside the
  templates: pick one and a copy goes into the question. From a graph, Use in a worksheet…
  adds it to any question (or a new one) and opens the worksheet there. A diagram's panel
  has Save to Graphs to keep it for later. Each copy is independent, so changing one
  never changes another.
- **Pie charts, flow charts and forum figures in Graphs too.** New graph offers every
  template, and each is edited on the Graphs page the way it is in a worksheet: slices,
  boxes and arrows, speech bubbles. Save to Graphs, My graphs and Download PNG work for
  all of them. ⌘Z no longer changes the graph while Use in a worksheet… is open.
- **A proper welcome on first launch.** With nothing saved yet, the start screen shows
  the four kinds of paper as pictures of the page each one prints. Click one to name it
  and start, or open a file or restore a backup you already have.
- **Econ Studio opens with a short animation of its mark**: the axes, demand and supply
  draw in and meet at the equilibrium, then the mark settles into its place on the start
  screen. Click or press any key to skip it. It plays once per session and respects
  Reduce motion.
- **Tag questions with DSE topics.** Pick a topic (A–J and the electives, or your own
  free tag) in the Edit panel. Tags never print. A free tag can't look like a topic code
  (such as "K" or "C.ped"), contain "::" or start with "@"; those are kept for topics.
- **Tag each part of a long question with its own topic and 題型.** Click a part on the
  page to tag it; a sub-part can follow its part or have its own. Click the stem to see
  every part's topics at once, which parts have none yet, and "Add to every part". With a
  topic chosen in the 題庫 tab, a long question says which part tests it.
- **Say which classes sat a paper, and when.** In Setup, add the classes (type 5A and press
  Enter or a comma after each) and the date it was sat. The question bank counts a paper as used only once it names a
  class, and knows that 4A last year and 5A this year are the same students, so "not used
  with" follows a year group up the school (shown as DSE 2027 and so on). Tagging or
  correcting an old paper no longer makes it look used this year.
- **Copy questions to a question bank from the outline.** Use a question's ⋯ menu to copy it to a bank (or start a new one); after you improve a question, "Update bank copy" refreshes the bank's version, and "Treat as a new question" cuts a copy loose from its origin (it explains what that means before it does anything, and one Undo reverses it). A new bank asks for its name, and the list of banks tells two alike apart. A bank that already has the question says so instead of taking a second copy, and offers "Update bank copy" when your version differs.
- **Question bank 題庫, its own screen**: open it from the start screen to see every
  question from your worksheets as topic cards (how many of each, and which topics are
  thin) under a coverage bar across the topics. Open a topic to read its questions one by one at print size, in English, 中文 or
  both, Student or Teacher version, with the list grouped by sub-topic (hide it for more
  room; Tab reaches the list, and the arrow keys move through it). Each question shows its own number from its paper, and the Filter button counts the filters that are on. Tick questions to make a new worksheet from them or add them to the worksheet
  you had open last (if you have not opened one yet, only a new worksheet is offered).
  Adding skips any question that worksheet already has ("Skipped 1 already in this
  paper") and opens it at the new questions, highlighted, with one Undo for the lot.
  Picks stay in a list you can reorder (drag, or Alt+↑ ↓), put MCQ before LQ in one click,
  or trim, with the count, marks and MCQ/LQ split as you go. The list keeps while you open
  a question in its worksheet, go Home or reload the page, and empties once the questions
  are in a worksheet.
  Topics show by name, in English and 中文 ("Law of demand 需求定律"), never as a code.
  Each question in the list says which worksheet it lives in and its number, so copies and
  questions that start alike read apart, and an edited version says what it changed.
  Search finds questions by the name of their worksheet too (type "Mock 2026"). Each topic
  card's bar is drawn to scale, so a topic with one question looks like one.
  Untagged questions get a quick tagging mode: press 1 to 6 to pick a suggested topic,
  Enter to save and see the next. Pressed the wrong key? Backspace, ⌘Z or Undo brings the
  last question back with its topic taken off. Open any question right where it sits in its worksheet,
  and come back to the same place in the bank. ← Home takes you back.
  A long question shows which part tests the topic you are browsing ("Part (b) tests
  this"), and that part is highlighted on the paper. A question on two sub-topics is listed
  under both, each saying where else it is, and its topics show part by part.
- **題庫 tab in the editor**: find questions from your other worksheets by words, topic,
  type or marks and drag copies onto the page, or Fill a set by topic after the question
  you click, preferring ones your class has not seen. The list and Fill start on what your
  paper takes (MCQs on a Paper 1, LQs on a booklet or LQ worksheet, both on a classroom
  worksheet); add another type anyway and a short note says so. The new questions are
  highlighted on the page, and one Undo takes the whole set back out. Each question shows
  the worksheet it comes from on a line of its own, and two worksheets with the same name
  are told apart by date.
- **Drag a question from the 題庫 tab onto the page.** While you drag, the page shows the
  result before you let go: the question sits where it would land, the questions after it
  renumber and the pages re-flow. Let go to insert it (one Undo takes it out); press Esc or
  let go off the page and nothing changes. Dragging replaces the Insert button; from the
  keyboard, Tab to the list, move with the arrow keys and press Enter to add a question after
  the one you clicked. On a small screen (1024 wide) the page now sits beside the sidebar
  instead of under it, so all of it takes the drop, and the page thumbnails show where the
  question will land.

- **Your own 題型 (Patterns) in the question bank.** Inside a sub-topic, file questions
  under the kinds of question you set, such as "Calculate PED from a change in TR". Pick
  one or type a new name while you set a question's topic, in the bank or the Edit panel;
  MCQ and LQ keep separate lists. Typing part of a name and pressing Enter picks the
  existing 題型 (use the arrow keys to choose another, or New), a name close to one you
  already have is pointed out, and a new 題型 is kept even if you cancel the dialog. Set
  topic on selected questions can also clear a 題型, or remove only the 題型 and keep the
  sub-topic, for questions of any type. The bank groups each sub-topic's questions by 題型,
  filters by one, and counts them on the topic cards. The 題型 Patterns page lists them
  all and renames, merges or deletes one in every worksheet at once. They come with your
  backup and never print.
- **✦ AI in the question bank.** On a topic's page, ✦ AI fills in missing 中文 or English
  for the question on screen, the questions in your list, or every question shown. Check
  terms (free, no key needed) finds terms that differ from the EDB glossary and replaces
  them. A question used in several worksheets changes in every copy that says the same
  thing, so the bank still shows it once; a copy you have edited, a paper hidden from the
  bank and a paper in Trash are left as they are. Up to 20 questions start straight away;
  more asks first and says roughly how long it takes, and Stop keeps what is done. What
  changed is highlighted in the list and on the paper, ‹ › steps through it, and Undo all
  puts it back. The Filter has a new Language choice: Missing 中文 or Missing English.
- **Choose where your export is saved.** In Chrome and Edge, exporting a worksheet, the
  worksheet file or a backup now asks where to save it, as the desktop app does. Exporting
  several files at once (Student and Teacher, versions A, B and C, or the answer key too)
  asks for one folder instead of once per file, and never replaces a file already there.
  Firefox and Safari still save to your Downloads folder.

### Changed
- **One New worksheet button on the start screen.** It opens a gallery of the four kinds
  of paper, drawn as the page each one prints, with the kind you made last already
  chosen. The Question bank now sits under Library, with room to spare on a small screen.
- **The Edit panel shows which row matches what you clicked.** Click a stem, a statement,
  an option, a table cell, a picture or a part of a long question on the page, and its row
  in the Edit panel lights up in blue with a brief glow, so you can see where to change
  its settings.
- **The how-to-edit tip sits below the page instead of on top of it**, so the bottom of
  a page is never hidden, and scrolling to the end of a document no longer runs on past
  the last page. On a smaller screen the tip stays on two lines.
- **The Add Question menu says where each type goes**: "in Section A" or "in Section B",
  instead of a heading cut off mid-word.
- **A tidier question panel.** The Add row (Text, Table, Image, Diagram, Source) fits on
  one line, and empty paragraphs simply say "Empty".
- **HKEAA wording on new exam papers.** New Paper 1 and Paper 2 mock papers end with
  試卷完 and say 選答一題, and AI translation writes END OF PAPER as 試卷完. Papers you
  already saved keep their own wording.
- **A new question looks calmer on the page.** Only the question text keeps the blue
  "Double-click to add" prompt; empty options, parts and captions show a short grey
  "Add English" or "Add 中文" instead. Prompts still never print or export.
- **A tidier top bar with more room for the worksheet's name.** The summary chip shows
  marks and pages (point at it for the full count of each question type), and saving is
  a small dot: point at it to see when your changes were saved. It only says something
  in words if your changes could not be saved.
- **Dialogs say when there is more below.** Export, Settings, Setup and New worksheet
  show "More below" when a setting is out of view; click it to scroll. In Export, the two
  version choices are now "Student or teacher copy" and "Shuffled versions". In AI
  settings, the model list shows each model's name in full with its details underneath.
- **A tidier start screen on smaller laptops.** Worksheet previews are one steady size
  however many you have, the search, filter, order and view controls fit on one line at
  1024 pixels wide, and What's new, Send feedback and Back up now stay easy to read at
  the bottom of the left panel.
- **A new worksheet asks for its name first**, so it no longer appears as Untitled in
  your list. The name is for filing and the file name, and does not print on the paper.
  A duplicated worksheet is now listed as "(copy)" of that name.
- **A worksheet made from the question bank is named after its topic** (or "Questions
  from bank" when the questions cover several topics) instead of Untitled. Like any new
  worksheet, it prints no title until you type one.
- **The app is now called Econ Studio (經濟備課室).** Your worksheets, settings and saved
  keys carry over unchanged. On Windows, updating replaces Econ Worksheet with Econ Studio
  in the Start menu; pin it to the taskbar again if you had pinned it. On a Mac, the app
  renames itself from Econ Worksheet to Econ Studio the first time it opens after the
  update, so Finder, Launchpad and Spotlight show the new name. If you already have both,
  they are the same app with the same worksheets: move Econ Worksheet to the Bin.
- **The ⋯ menu no longer has "Worksheets…".** Click the app mark at the top left to go back to your worksheets.
- **Settings is easier to find.** Its gear now sits in the top-right corner of the start
  screen and the question bank. In a worksheet, Settings is still in the ⋯ menu.
- Start screen rows and saved worksheets now highlight on hover without the blue side bar.
- **See and test your saved AI keys.** Settings › AI & translation now starts with "Your
  keys": each saved key with its provider, only its last 4 characters shown, which one is
  in use, and a Test button that checks it any time. Providers with a key say "Key saved",
  and the key panel is shorter.
- **Plainer wording in messages and hints.** Hints, notices and error messages now use
  short sentences instead of long dashes.
- **Question bank: one action per question.** Reading a question, you now see only "Open
  in worksheet". To add questions to your last worksheet, tick them and use the bar at the
  bottom.
- **Question bank: one set of topics per question.** Changing a question's topics in the
  bank, or in the Edit panel of a worksheet, now changes every copy of it in your other
  worksheets ("Also updated in 2 other worksheets"), and the bank shows the same topics
  everywhere. Removing a topic removes it everywhere too, and it stays gone, even from a
  worksheet you restore from Trash later: the latest change always wins. A question you
  add from the bank brings its topics with it. Set topic for ticked questions can now
  add, remove or replace topics.
  In the bank, tag a long question as a whole or part by part: Edit topics lists its parts,
  so you tick topics for the whole question and then change one part (or sub-part) alone.
  Tagging as you go does the same: the keys tag the whole question until you pick a part
  (click it, or press [ and ]), and the paper marks the part you picked. Set topic for
  ticked questions gives every part the topic.
- **Question bank: easier to read.** "Used in" puts each paper's full title on its own
  line, and the Class filter shows a short name ("Not used with DSE 2027") with the
  classes it covers listed underneath.
- **MCQ and LQ, the same words everywhere.** Setup's Target now counts MCQ and LQ, as the
  question bank does; the Edit panel says "1 mark", not "1 marks"; and the 題庫 tab's topic
  lists group each topic's sub-topics under it.
- **The start screen shows when there's more to scroll.** Its left column fades at the
  bottom while more is below, and shows a thin line at the top once you have scrolled down.
- **Header & footer settings are organised by page.** In Setup, pick Page 1 or Pages 2
  onward, then choose whether page 1's header and footer are the same as later pages, its
  own, or nothing. Page 1's title settings sit with them.

### Fixed
- **A diagram's y-axis label in English and 中文 no longer sits on the arrow.** With labels
  in both languages, "價格" printed on top of the y-axis arrowhead; both lines now sit
  above it, on screen, in the Graphs editor, in the PDF and in Word.
- **Back up now shows when you have graphs but no worksheets yet**, and the graph
  editor's tools fit on one row on a 13-inch screen.
- **Bilingual papers no longer print the footer twice.** A paper code or page number that
  reads the same in English and 中文 now prints once, on screen, in the PDF and in Word.
  Cover instruction numbers such as (1) print once too.
- **A new question goes to the section made for its type.** With nothing selected, a
  Multiple Choice question lands in Section A and a Structured question in Section B,
  including questions added from 題庫. It used to land after the last heading whatever its
  type. Select a question or heading first to put it right after that instead.
- **A mislabelled button no longer deletes page 1's own header.** "Same as page 1" kept
  the later pages' header and removed page 1's. The new page choices replace it.
- **PDF export on Mac (and in Safari) no longer shrinks the pages or runs them into each
  other.** Each sheet prints full size on its own page.
- **A row added on page 1 stays on page 1.** When page 1 was set to no header or footer,
  adding a row there put it on every later page instead. Page 1 now gets its own rows.
- **Typing on the page is lighter.** The page no longer redraws twice for every key you
  press, which on a busy computer could stop the editor with an error mid-sentence.
- **Editing a duplicated question no longer changes the original.** Worksheets where a
  duplicate and its original were stuck together are separated when you open them.
- **Right-clicking anywhere inside a question now opens its menu**, including ✦ AI: the
  space beside a diagram, the question number, option letters and marks no longer bring
  up the browser's own menu.
- **Undo waits while you drag from the 題庫 tab.** Pressing ⌘Z (or Ctrl+Z) mid-drag used
  to change the worksheet under the question in your hand. Now it does nothing until you
  let go; after the drop, one Undo takes the new question out.

## 0.5.0 — 2026-09-28

### Added
- **Light or dark, your choice**: Settings → Appearance picks Light, Dark or System (follows
  your computer, as before). Worksheets still print black on white.
- **✦ AI**: one button (or ⌘J, Ctrl+J on Windows) holds every AI tool, for the whole
  paper or whatever you have selected — right-click any text, table or question for AI on
  just that part. The number on the button is how many texts still need translating. It
  uses your own AI account (Gemini, DeepSeek, Qwen and others): the first time, pick a
  provider and paste your key right in the menu, and the action you chose runs once the
  key works.
- **Fill missing 中文 or English** with AI. Economics terms follow the Education Bureau
  glossary; a single field fills in place.
- **AI results go straight onto the page**, highlighted: walk through them with ‹ ›, and
  take them all back with **Undo all** or one ⌘Z. Anything worth a second look is marked
  in amber; a text that couldn't be translated safely is left as it was and listed.
- **Check terms**: compare the Chinese with the EDB glossary — no key needed. Findings are
  underlined on the page; replace them one by one or all at once.
- **Settings** (⋯ → Settings…): app-wide preferences for this browser or computer,
  starting with AI & translation. The per-document dialog is now called **Setup**
  everywhere.
- New font choice **Times New Roman / 標楷體** (Setup → Fonts, or when creating a
  worksheet): Chinese text prints and exports in 標楷體. The default stays 新細明體.

### Changed
- New diagrams and the sample paper now use the Education Bureau glossary's Chinese
  terms (物價水平, 總收入, 生產可能曲線, 洛倫茨曲線 …), and 效率損失 for deadweight loss,
  物品X and 廠商A as in HKDSE papers; the sample Paper 2 question now reads as an HKDSE
  paper would (寫出…, **一個**). Worksheets you already made keep their wording.
- The ‘untranslated’ count now covers the whole paper — cover, header and footer, tables
  and diagram labels — and shows in 中文 mode too.
- Status messages such as "Exported .pdf" float under the toolbar instead of pushing the
  page down, and "Saved" shows its time when you point at it.
- Getting around is easier: click **Worksheets** at the top-left of the editor to return
  to your home page of worksheets — your work is saved first — and click any worksheet
  there to open it. On the home page, Settings is the gear in the bottom-left corner.

### Fixed
- **Clear saved documents** now clears the worksheet you have open too, even with
  unsaved changes — it no longer reappears on the home page afterwards.
- The toolbar stays on one line on smaller laptop screens: a long worksheet name is
  shortened with "…" (point at it for the full name), Setup shows as its icon, and
  "Saved" becomes a small dot until the window is wider.

## 0.4.0 — 2026-09-27

### Added
- **Paper summary with a target**: the toolbar shows what the paper holds — "38 MCQ ·
  2 structured · 52 marks · ~65 min · 5 pages". Set a target in Setup (questions per
  type, marks, minutes) and it reads "38/45 MCQ · 52/50 marks", tinted when you are over;
  the export check lists anything over or under. The time estimate now uses the DSE
  Paper 2 pace of 150 minutes for 120 marks.
- **Diagram templates follow your drags**: move a curve and the equilibria, dashed
  drops, P and Q arrows, shortage and import brackets, the tax wedge, output gaps and
  shaded areas move with it; D₁ or S + t keeps its shift, MR stays twice as steep as D,
  and the CPF stays tangent to the PPF. Shade ▾ now adds areas on a template without
  asking which curve is which.
- **22 more diagram templates**, one for each scheme item that had none: the MCQ
  double-shift grid, shortage before and after, a lowered ceiling, CS change under a
  ceiling, an ineffective ceiling, revenue at a fixed price, the minimum-wage bill, quota
  G / L and a demand rise under a quota, subsidy overproduction (MC > MB), TSS loss when
  MC rises, AD and SRAS both shifting left, AD at full capacity, gap₀ and gap₁, the
  inflationary self-adjustment, the substitute-good exchange-rate case, a demand rise
  under an import quota with quota rent, monopoly with rising MC, MC rising, a lump-sum
  tax, "same P and Q after MC falls", and two countries' PPFs on one figure.
- **Every welfare area the marking schemes name, one click from Shade ▾**: buyers' and
  sellers' burden, CS loss under a tax, consumer and producer benefit of a subsidy, DWL of
  a tax, subsidy, price control, tariff or monopoly, TSS loss, revenue or wage bill at a
  fixed price, CS + / − under a ceiling, tariff revenue, PS gain, CS loss and quota rent.
  Each is hatched apart from its neighbours, labelled in both languages, and follows the
  curves when you drag them. The menu is grouped, asks which curve is which when it
  cannot tell, and "Between two edges…" shades any region between two curves or levels.
- **Marking scheme in HKEAA notation** on structured question parts: marking points with
  marks, `/` alternatives, "any N @ 1", `max: N`, "mark the FIRST N only", OR routes,
  level descriptors and Effective Communication marks. Prints in the teacher version
  and the answer key; the student paper is unchanged.
- **MCQ rationale and source note**: per option, why it is right or wrong, and a
  "Source:" line such as "modelled on DSE 2023 Q1". Teacher version and answer key only;
  rationale follows its option when paper versions shuffle.
- **Shaded areas on diagrams**: consumer surplus, producer surplus, deadweight loss and
  tax revenue presets, plus a free shape; grey shade or hatch, draggable label. Areas
  follow the curves they are built on.
- **Hatch patterns for shaded areas**, so areas still tell apart on a black-and-white
  photocopy: diagonal, reverse diagonal, cross-hatch, horizontal, vertical or dots, at
  normal or dense spacing. New CS, PS, DWL and tax revenue areas each start in their own
  pattern; areas you already drew keep their look.
- **Revenue areas on diagrams**: total revenue (P × Q) at an equilibrium, and the revenue
  gain and loss between E₀ and E₁ after a shift — even when the gain or loss is an
  L-shape. Pick which points they measure; they follow the points when you drag them.
- **Shift a curve**: shift D or S left/right/up/down by a percentage to get D₁ (or S₁),
  the shift arrow and the new equilibrium E₁ with guide lines and P₁/Q₁ labels.
- **Model answer diagrams on long questions**: attach a diagram to a part's answer
  from its ⋯ menu ("Add model diagram") and draw it with the same diagram tools. It
  prints in the teacher version and the answer key; the student paper is unchanged.
- **Graph answer space**: a blank-axes box (optional grid, axis labels, 12/16/20/24
  lines, half or full width) that students draw on, in any part or sub-part.
- **Folders on the start screen**: create, rename and delete folders; move documents in
  from the menu or by dragging; search and filter inside a folder. Folders are kept in
  backups.
- **One Export button** for `.docx`, PDF and `.json`, chosen inside the dialog; options
  that do not apply to a format are greyed with a reason.
- **What's new**: the first time a new version opens, a short note lists what it adds,
  once. "What's new" beside Send feedback on the start screen, and in the editor's ⋯
  menu, lists every release.
- **Worksheets from a newer version open safely**: a file saved by a newer Econ Worksheet
  opens read-only with a note to update, and is never overwritten. "Duplicate as editable
  copy" makes a copy you can edit now.
- **Diagrams that stay connected**: an equilibrium placed on a crossing follows its
  curves, so shifting S₁ moves E₁ with it. Add MR (same intercept, twice as steep),
  a line parallel or tangent to another (CPF, terms of trade), price-level and vertical
  lines, and brackets or arrows between two points: shortage, the tax wedge "t",
  P₁→P₂ on the axis. They follow what they measure.
- **Axis scales for diagrams**: give an axis a maximum (30 wheat, 60 cloth) and type a
  point's position as values; empty tick labels print their value.
- **Diagram templates for every diagram the marking schemes ask for**, grouped by topic
  with a search box: supply and demand shifts (one curve or both), elastic and inelastic
  revenue boxes, fixed supply, labour importation, surplus; price ceiling, minimum wage,
  quotas and deadweight loss; per-unit tax and subsidy burdens, Lorenz curve; AD–AS shifts,
  output gaps, self-adjustment, LRAS growth; money supply and demand shifts;
  exchange-rate revenue, tariff, import quota; monopoly (MC constant, MC = 0, MC falls)
  and PPF trade. Each ships the after-state — both curves, both equilibria, the arrows.

### Changed
- **Diagrams draw P and Q change arrows the way marking schemes do**: outside the axes,
  below the Q₀ Q₁ labels and left of P₀ P₁, and the tick labels now sit right against
  their axis. Brackets and gaps on an axis sit there too; drag one to move it further out
  or back in. The tax t and subsidy s between S₀ and S₁ are always an arrow onto S₁ —
  up for a tax, down for a subsidy — and turn round if you drag S₁ past S₀.
  Equilibrium points now come without an E₀ / E₁ name, as schemes usually draw them;
  select a point and click **Label E₀** (it offers the next free number) to add one, and
  it lands right of the dot, clear of the curves. Diagrams you already made keep their
  names.
- **Desktop: Export → PDF saves a file directly, no print sheet.** Choose where in the
  save dialog (it starts in your exports folder, like `.docx`); the status line then
  offers Show in Finder / Explorer. In a browser, PDF still goes through the print
  dialog's Save as PDF.
- **Smoother buttons, menus and dialogs**: buttons press in and ease their colours,
  menus grow out of the button that opened them, and dialogs fade in instead of
  appearing all at once. Quick enough never to slow you down.

- **The inflationary and deflationary gap templates mark the gap just above the output
  axis**, between Y₀ and Yf, with its name above the arrow. It still follows AD, SRAS
  and LRAS when you drag them.
### Fixed
- **Shift a copy in an English-only worksheet named the copy S₅₀** (and its ticks P₅₀
  and Q₅₀). It is now S₁, with P₁ and Q₁.
- **The import-tariff template had no imports**: Pw + t sat above the market's own
  equilibrium. It now sits between Pw and it, with Q₁, Q₂ and the imports QM marked. The
  old four-quantity figure is still there as "Tariff: welfare areas".
- **PDF printed every marks label twice** ("(4 marks)" after the text and again at the
  right margin). It now prints once, at the right.
- **Desktop PDF: the cover's corner box printed solid black.** Its diagonal now prints
  as a line.
- **Desktop: Export → PDF opens the print sheet** instead of failing silently.
- **Print PDF lost every arrowhead and pie hatching** (axis arrows, shift arrows,
  flow-chart arrows, hatched and dotted pie slices). All now print.
- **Dragging a document onto a folder now works in the desktop app.**
- **Desktop: dropping a worksheet file onto the start screen imports it.** Drop several
  `.json` files at once to add them all to your list; nothing already there is replaced.
- **The page rail now appears for a mock paper with a cover and one page** — the cover
  counts as a page, and its card lights up while you are on it.

## 0.3.0 — 2026-09-24

### Added
- **Export dialog**: question paper, a separate **answer key** `.docx`, or both, in any
  language, with **include/omit the cover page and the answer space** toggles.
- **Paper versions A–D**: seeded MCQ option shuffles with a per-version key and a
  version map in the answer key.
- **Export for other apps**: ZipGrade key, plain key CSV, Kahoot `.xlsx`, Blooket CSV.
- **Pre-print paper check**: marks, timing, missing answers and translations, shown
  before export.
- **Backup all as one zip** and restore (never overwrites); **Trash** with 30-day restore.
- **File dashboard**: saved documents as first-page thumbnails or a list, with search,
  kind filter and ordering. Desktop dialogs start in `~/Documents/Econ Worksheets` and
  exported files can be revealed in Finder/Explorer.
- **In-app feedback**: a prefilled GitHub issue, an email, or copy to clipboard.
- **Paste-anywhere download widget** for other websites, always pointing at the latest
  release.

### Changed
- Start-screen sidebar decluttered; version shown with a manual "Check for updates".
- Updates download silently and show the banner only when ready; one check per launch.
  Pending edits are saved before the restart.

## 0.2.0 — 2026-09-23

### Added
- **Desktop app for macOS and Windows** (Tauri 2). Documents become files under the app
  data folder, saving uses the native dialog, and the app updates itself from GitHub
  Releases. The web app is unchanged and stays the primary target.

### Changed
- The sidebar is an inspector: excerpt rows and a mark-scheme grid, no dead ends.
- Contextual tools dock over the page: table and figure rows, right-click menus.
- MCQ options with figures lay out two per row.

## Earlier (web app, July–September 2026)

The web editor before it was versioned: bilingual on-page authoring of HKDSE-format
papers with click-to-edit on the paginated preview; MCQ and structured questions with
derived numbering and marks; sections, headings, stimuli, labelled sources and tables;
supply–demand, business-cycle, pie and flow-chart diagrams with a drawing canvas; cover
page and Paper 2 answer booklet (LQ mode) with dotted answer space; headers and
footers with a separate first page; faithful `.docx` export, print-to-PDF and
copy-for-Word, all built in the browser; autosave with undo/redo; the warm studio
theme.
