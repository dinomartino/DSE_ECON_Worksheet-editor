// Generated from CHANGELOG.md by scripts/sync-changelog.mjs — do not edit.
// Run `npm run changelog` after changing CHANGELOG.md.
export const CHANGELOG_MD = `# Changelog

What each release of Econ Worksheet contains, newest first. Written for teachers: name
the thing they can now do, not the file that changed.

Rules: every feature or fix that lands on \`develop\` adds a line under **Unreleased** in
the same commit. At release, that section is renamed to the version and date, and its
text becomes the GitHub release body (see \`RELEASING.md\`). Sections are grouped as
**Added**, **Changed**, **Fixed**. Nothing below a version heading is edited afterwards.

## Unreleased

### Added
- **Tag questions with DSE topics.** Pick a topic (A–J and the electives, or your own
  free tag) in the Edit panel, and set the class in Setup. Tags never print.
- **Copy questions to a question bank from the outline.** Use a question's ⋯ menu to copy it to a bank (or start a new one); after you improve a question, "Update bank copy" refreshes the bank's version, and "Treat as a new question" cuts a copy loose from its origin. Banks show as "Question bank" in your list of documents.
- **Question bank 題庫, its own screen**: open it from the start screen to see every
  question from your worksheets as topic cards (how many of each, and which topics are
  thin) under a coverage bar across the topics. Open a topic to read its questions one by one at print size, in English, 中文 or
  both, Student or Teacher version, with the list grouped by sub-topic (hide it for more
  room). Tick questions to make a new worksheet from them or add them to your last one.
  Untagged questions get a quick tagging mode: press 1 to 6 to pick a suggested topic,
  Enter to save and see the next. Open any question right where it sits in its worksheet,
  and come back to the same place in the bank. ← Home takes you back.
- **題庫 tab in the editor**: find questions from your other worksheets by words, topic,
  type or marks and insert copies after the question you click, in one click, or Fill a
  set by topic, preferring ones your class has not seen. The new questions are highlighted
  on the page, and one Undo takes the whole set back out.

### Changed
- **Plainer wording in messages and hints.** Hints, notices and error messages now use
  short sentences instead of long dashes.
- **Question bank: one action per question.** Reading a question, you now see only "Open
  in worksheet". To add questions to your last worksheet, tick them and use the bar at the
  bottom.

### Fixed
- **Typing on the page is lighter.** The page no longer redraws twice for every key you
  press, which on a busy computer could stop the editor with an error mid-sentence.
- **Editing a duplicated question no longer changes the original.** Worksheets where a
  duplicate and its original were stuck together are separated when you open them.

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
  marks, \`/\` alternatives, "any N @ 1", \`max: N\`, "mark the FIRST N only", OR routes,
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
- **One Export button** for \`.docx\`, PDF and \`.json\`, chosen inside the dialog; options
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
  save dialog (it starts in your exports folder, like \`.docx\`); the status line then
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
  \`.json\` files at once to add them all to your list; nothing already there is replaced.
- **The page rail now appears for a mock paper with a cover and one page** — the cover
  counts as a page, and its card lights up while you are on it.

## 0.3.0 — 2026-09-24

### Added
- **Export dialog**: question paper, a separate **answer key** \`.docx\`, or both, in any
  language, with **include/omit the cover page and the answer space** toggles.
- **Paper versions A–D**: seeded MCQ option shuffles with a per-version key and a
  version map in the answer key.
- **Export for other apps**: ZipGrade key, plain key CSV, Kahoot \`.xlsx\`, Blooket CSV.
- **Pre-print paper check**: marks, timing, missing answers and translations, shown
  before export.
- **Backup all as one zip** and restore (never overwrites); **Trash** with 30-day restore.
- **File dashboard**: saved documents as first-page thumbnails or a list, with search,
  kind filter and ordering. Desktop dialogs start in \`~/Documents/Econ Worksheets\` and
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
footers with a separate first page; faithful \`.docx\` export, print-to-PDF and
copy-for-Word, all built in the browser; autosave with undo/redo; the warm studio
theme.
`;
