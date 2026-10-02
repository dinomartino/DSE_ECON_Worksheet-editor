// Generated from CHANGELOG.md by scripts/sync-changelog.mjs — do not edit.
// Run `npm run changelog` after changing CHANGELOG.md.
export const CHANGELOG_MD = `# Changelog

What each release of Econ Studio contains, newest first. Written for teachers: name
the thing they can now do, not the file that changed.

Rules: every feature or fix that lands on \`develop\` adds a line under **Unreleased** in
the same commit, with its 繁體中文 as an indented \`<!-- zh: … -->\` line under it (What's
new shows it in 中文; the release body leaves it out). At release, that section is
renamed to the version and date, and its text becomes the GitHub release body (see
\`RELEASING.md\`). Sections are grouped as **Added**, **Changed**, **Fixed**. Nothing below
a version heading is edited afterwards.

## Unreleased

### Added
- **Draw the answer on the question's own diagram.** In the drawing canvas, turn on Draw
  answer and draw the model answer (a PPF, a new curve, a labelled point) on the same axes
  the students get. It prints in red in the Teacher version and the answer key, and the
  Student version shows the blank diagram. Any element can be switched with Answer
  (teacher only).
  <!-- zh: **直接在題目的圖表上繪製答案。** 在繪圖畫布開啟「繪製答案」，便可在學生所用的
  同一組座標軸上畫出參考答案（例如生產可能曲線、新曲線或標示點）。答案會以紅色印在教師版
  和答案頁，學生版則只顯示空白圖表。任何元素都可用「答案（只限教師版）」切換。 -->
- **What's new in 繁體中文.** With the interface in 繁體中文, What's new shows every
  release's notes in Hong Kong Chinese, with its headings and dates in Chinese too.
  <!-- zh: **最新功能有繁體中文版。** 介面設定為繁體中文時，「最新功能」會以香港中文
  顯示每個版本的更新說明，標題和日期亦會以中文顯示。 -->
- **Settings → Language 語言: use Econ Studio in 繁體中文.** Choose English or 繁體中文
  for buttons, menus and dialogs, in the words Hong Kong teachers use (PDF, MCQ and
  Paper 1 stay in English). Worksheets print exactly as you wrote them in either
  language. The whole interface is translated, What's new included; only error text
  from an AI service stays in English.
  <!-- zh: **設定 → 語言：以繁體中文使用 Econ Studio。** 按鈕、選單和對話框可選英文或繁體中文，
  用語貼近香港教師慣用的說法（PDF、MCQ 和 Paper 1 保留英文）。不論用哪種語言，
  工作紙的列印效果都與你所寫的完全一致。整個介面均已翻譯，包括「最新功能」；只有 AI 服務
  傳回的錯誤訊息保留英文。 -->
- **Graphs 圖表庫: draw a graph once and keep it.** Open Graphs from the start screen,
  start from a template or blank axes, and draw on the full page. Graphs save as you work,
  sit in your backups, and copy straight into Word at their printed size, or download as
  a PNG.
  <!-- zh: **圖表庫：圖表畫一次便可保留。** 在開始畫面開啟圖表庫，由範本或空白座標軸開始，
  在整頁上繪圖。圖表會隨你操作自動儲存，包含在備份內，可按列印大小直接複製到 Word，
  也可下載為 PNG。 -->
- **Put your saved graphs into questions.** Diagram ▾ has a My graphs tab beside the
  templates: pick one and a copy goes into the question. From a graph, Use in a worksheet…
  adds it to any question (or a new one) and opens the worksheet there. A diagram's panel
  has Save to Graphs to keep it for later. Each copy is independent, so changing one
  never changes another.
  <!-- zh: **把儲存的圖表放進題目。** 圖表 ▾ 在範本旁多了「我的圖表」分頁：選一個，副本便會放進
  題目。在圖表頁按「用於工作紙…」，可把它加到任何題目（或新題目），並直接在該處開啟
  工作紙。圖表的面板有「儲存到圖表庫」，方便日後再用。每個副本互相獨立，改動其中一個
  不會影響其他。 -->
- **Pie charts, flow charts and forum figures in Graphs too.** New graph offers every
  template, and each is edited on the Graphs page the way it is in a worksheet: slices,
  boxes and arrows, speech bubbles. Save to Graphs, My graphs and Download PNG work for
  all of them. ⌘Z no longer changes the graph while Use in a worksheet… is open.
  <!-- zh: **圖表庫也支援圓形圖、流程圖和論壇圖。** 「新增圖表」提供所有範本，編輯方式與在工作紙
  中相同：扇形、方框和箭頭、對話氣泡。「儲存到圖表庫」、「我的圖表」和「下載 PNG」
  均適用於全部圖表。開啟「用於工作紙…」時，⌘Z 不再改動圖表。 -->
- **A proper welcome on first launch.** With nothing saved yet, the start screen shows
  the four kinds of paper as pictures of the page each one prints. Click one to name it
  and start, or open a file or restore a backup you already have.
  <!-- zh: **首次啟動有親切的歡迎畫面。** 尚未儲存任何內容時，開始畫面會以圖片顯示四種試卷
  各自列印出來的頁面。按一下其中一種，為它命名即可開始；也可開啟現有檔案或還原備份。 -->
- **Econ Studio opens with a short animation of its mark**: the axes, demand and supply
  draw in and meet at the equilibrium, then the mark settles into its place on the start
  screen. Click or press any key to skip it. It plays once per session and respects
  Reduce motion.
  <!-- zh: **Econ Studio 啟動時有一段標誌短動畫**：座標軸、需求線和供給線逐一畫出，相交於均衡點，
  然後標誌就位於開始畫面。按一下或按任何鍵可略過。每次使用只播放一次，並會遵從
  「減少動態效果」設定。 -->
- **Tag questions with DSE topics.** Pick a topic (A–J and the electives, or your own
  free tag) in the Edit panel. Tags never print. A free tag can't look like a topic code
  (such as "K" or "C.ped"), contain "::" or start with "@"; those are kept for topics.
  <!-- zh: **以 DSE 課題標記題目。** 在編輯面板選擇課題（A 至 J 及選修單元），或自訂標籤。
  標記不會列印。自訂標籤不可與課題代碼相似（例如「K」或「C.ped」），不可包含「::」，
  也不可以「@」開頭，這些保留給課題使用。 -->
- **Tag each part of a long question with its own topic and 題型.** Click a part on the
  page to tag it; a sub-part can follow its part or have its own. Click the stem to see
  every part's topics at once, which parts have none yet, and "Add to every part". With a
  topic chosen in the 題庫 tab, a long question says which part tests it.
  <!-- zh: **長題目的每個分題可各自標記課題和題型。** 在頁面上按一下分題即可標記；子分題可跟隨
  所屬分題，也可自行標記。按一下題幹，可一覽各分題的課題、尚未標記的分題，以及
  「加入所有分題」。在題庫分頁揀選課題後，長題目會指出哪個分題考核該課題。 -->
- **Say which classes sat a paper, and when.** In Setup, add the classes (type 5A and press
  Enter or a comma after each) and the date it was sat. The question bank counts a paper as used only once it names a
  class, and knows that 4A last year and 5A this year are the same students, so "not used
  with" follows a year group up the school (shown as DSE 2027 and so on). Tagging or
  correcting an old paper no longer makes it look used this year.
  <!-- zh: **記錄哪些班別考過試卷及考試日期。** 在頁面設定中加入班別（輸入 5A 後按 Enter 或逗號，
  逐個加入）和考試日期。題庫只會把已註明班別的試卷計作已使用，並明白去年的 4A 與
  今年的 5A 是同一班學生，因此「未曾用於」會隨年級升上去計算（顯示為 DSE 2027 等）。
  為舊試卷加標記或更正，也不會再令它看似今年已使用。 -->
- **Copy questions to a question bank from the outline.** Use a question's ⋯ menu to copy it to a bank (or start a new one); after you improve a question, "Update bank copy" refreshes the bank's version, and "Treat as a new question" cuts a copy loose from its origin (it explains what that means before it does anything, and one Undo reverses it). A new bank asks for its name, and the list of banks tells two alike apart. A bank that already has the question says so instead of taking a second copy, and offers "Update bank copy" when your version differs.
  <!-- zh: **從大綱把題目複製到題庫。** 用題目的 ⋯ 選單把它複製到題庫（或建立新題庫）；改良題目後，
  「更新題庫副本」會刷新題庫中的版本，而「視為新題目」會使副本脫離原題（動手前會先解釋
  其意思，一次復原即可還原）。新題庫會先詢問名稱，題庫清單也會分辨相似的題庫。
  題庫已有該題時，會直接告知而不重複收錄；若你的版本有分別，則提供「更新題庫副本」。 -->
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
  <!-- zh: **題庫：獨立的畫面**，從開始畫面開啟，即可看到你所有工作紙的題目，以課題卡片顯示
  （每個課題有多少題、哪些課題偏少），課題上方有覆蓋率長條。開啟課題後，可按列印
  大小逐題細閱，語言可選英文、中文或雙語，亦可切換學生版或教師版；清單按子課題分組
  （可收起以騰出空間；按 Tab 可進入清單，以方向鍵移動）。每題會顯示它在試卷中的
  題號，「篩選」按鈕會顯示已啟用的篩選數目。勾選題目即可建立新工作紙，或加到你上次
  開啟的工作紙（若你尚未開啟過，則只提供新工作紙）。加入時會略過該工作紙已有的題目
  （「已略過 1 條已在這份工作紙內的題目」），並在新題目處開啟、加上高亮，一次復原即可
  全部撤回。所選題目會保留在清單中，可重新排序（拖曳，或按 Alt+↑ ↓）、一鍵把 MCQ 排在
  LQ 之前，或刪減，同時顯示題數、分數及 MCQ／LQ 比例。你開啟某題所屬的工作紙、返回
  主頁或重新載入頁面時，清單都會保留；題目放進工作紙後，清單才會清空。
  課題以名稱顯示，附英文和中文（「Law of demand 需求定律」），不會只顯示代碼。
  清單中每題都會註明所屬工作紙和題號，因此副本和開頭相近的題目也能分辨；經編輯的版本
  會說明改了甚麼。搜尋也可按工作紙名稱找題目（輸入「Mock 2026」）。每張課題卡片的長條
  按比例繪畫，所以只有一題的課題看起來就只有一題。
  未標記的題目有快速標記模式：按 1 至 6 選擇建議的課題，按 Enter 儲存並看下一題。
  按錯鍵？按 Backspace、⌘Z 或「復原」，即可取回上一題並取消它的課題。可直接在工作紙
  中該題所在位置開啟任何題目，之後返回題庫的同一位置。按 ← 主頁即可返回。
  長題目會顯示哪個分題考核你正在瀏覽的課題（「分題 (b) 考核此課題」），該分題在試卷上
  亦會高亮。涉及兩個子課題的題目會在兩處都列出，並各自註明另一處；其課題也會逐分題顯示。 -->
- **題庫 tab in the editor**: find questions from your other worksheets by words, topic,
  type or marks and drag copies onto the page, or Fill a set by topic after the question
  you click, preferring ones your class has not seen. The list and Fill start on what your
  paper takes (MCQs on a Paper 1, LQs on a booklet or LQ worksheet, both on a classroom
  worksheet); add another type anyway and a short note says so. The new questions are
  highlighted on the page, and one Undo takes the whole set back out. Each question shows
  the worksheet it comes from on a line of its own, and two worksheets with the same name
  are told apart by date.
  <!-- zh: **編輯器中的題庫分頁**：按文字、課題、類型或分數，從其他工作紙找題目，並拖曳副本到
  頁面上；或在你按著的題目之後，按課題「填入」一組題目，並優先選擇班別未見過的。
  清單和「填入」會按你的試卷類型預設（Paper 1 用 MCQ，試題答題簿或 LQ 工作紙用 LQ，
  課堂工作紙兩者皆用）；仍可加入其他類型，並有簡短提示。新題目會在頁面上高亮，
  一次復原即可整組移除。每題會在獨立一行顯示來源工作紙，同名的工作紙以日期區分。 -->
- **Drag a question from the 題庫 tab onto the page.** While you drag, the page shows the
  result before you let go: the question sits where it would land, the questions after it
  renumber and the pages re-flow. Let go to insert it (one Undo takes it out); press Esc or
  let go off the page and nothing changes. Dragging replaces the Insert button; from the
  keyboard, Tab to the list, move with the arrow keys and press Enter to add a question after
  the one you clicked. On a small screen (1024 wide) the page now sits beside the sidebar
  instead of under it, so all of it takes the drop, and the page thumbnails show where the
  question will land.
  <!-- zh: **把題庫分頁的題目拖到頁面上。** 拖曳時，頁面會在你放開前預覽結果：題目放在落點位置，
  之後的題目重新編號，頁面重新編排。放開即插入（一次復原可撤回）；按 Esc 或在頁面外放開
  則不會有任何改變。拖曳取代了「插入」按鈕；用鍵盤時，按 Tab 進入清單，以方向鍵移動，
  再按 Enter，即可在你按著的題目之後加入題目。在小屏幕（1024 闊）上，頁面現在位於
  側邊欄旁而非下方，整頁都可接收拖放，頁面縮圖亦會顯示題目將放在哪裡。 -->

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
  <!-- zh: **在題庫自訂題型。** 在子課題內，按你設定的題目種類歸類題目，例如「由總收益變化
  計算 PED」。設定題目課題時（在題庫或編輯面板），可揀選現有題型或輸入新名稱；MCQ 和 LQ
  各有獨立清單。輸入部分名稱後按 Enter 會選用現有題型（用方向鍵選其他項目，或選
  「新增」），與現有名稱相近的會提示，即使你取消對話框，新題型也會保留。「設定課題…」
  亦可清除題型，或只移除題型而保留子課題，適用於任何類型的題目。題庫會按題型為
  每個子課題的題目分組、按題型篩選，並在課題卡片上計算數目。「題型」頁面列出全部題型，
  並可一次過在所有工作紙重新命名、合併或刪除。題型會包含在備份內，不會列印。 -->
- **✦ AI in the question bank.** On a topic's page, ✦ AI fills in missing 中文 or English
  for the question on screen, the questions in your list, or every question shown. Check
  terms (free, no key needed) finds terms that differ from the EDB glossary and replaces
  them. A question used in several worksheets changes in every copy that says the same
  thing, so the bank still shows it once; a copy you have edited, a paper hidden from the
  bank and a paper in Trash are left as they are. Up to 20 questions start straight away;
  more asks first and says roughly how long it takes, and Stop keeps what is done. What
  changed is highlighted in the list and on the paper, ‹ › steps through it, and Undo all
  puts it back. The Filter has a new Language choice: Missing 中文 or Missing English.
  <!-- zh: **題庫內的 ✦ AI。** 在課題頁面，✦ AI 可為畫面上的題目、清單中的題目或所有顯示的題目
  補上缺少的中文或英文。「按 EDB 詞彙表檢查用詞」（免費，無需 API key）會找出與 EDB
  詞彙表不同的用詞並加以替換。多份工作紙共用的題目，會在每個內容相同的副本中一併更改，
  因此題庫仍只顯示一次；你已編輯的副本、題庫中隱藏的試卷和垃圾桶中的試卷則維持不變。
  最多 20 條題目會立即開始；更多則會先詢問，並說明大約需時，按「停止」會保留已完成的部分。
  更改的內容會在清單和試卷上高亮，‹ › 可逐項查看，「全部復原」可還原。篩選新增「語言」
  選項：缺少中文或缺少英文。 -->
- **Choose where your export is saved.** In Chrome and Edge, exporting a worksheet, the
  worksheet file or a backup now asks where to save it, as the desktop app does. Exporting
  several files at once (Student and Teacher, versions A, B and C, or the answer key too)
  asks for one folder instead of once per file, and never replaces a file already there.
  Firefox and Safari still save to your Downloads folder.
  <!-- zh: **自選匯出檔案的儲存位置。** 在 Chrome 和 Edge 中，匯出工作紙、工作紙檔案或備份時，
  現在會詢問儲存位置，與桌面版相同。一次匯出多個檔案（學生版和教師版、A、B、C 卷，
  或連同答案頁）時，只需選一次資料夾，不用逐個檔案詢問，也不會覆蓋已有的檔案。
  Firefox 和 Safari 仍會儲存到「下載」資料夾。 -->

### Changed
- **One New worksheet button on the start screen.** It opens a gallery of the four kinds
  of paper, drawn as the page each one prints, with the kind you made last already
  chosen. The Question bank now sits under Library, with room to spare on a small screen.
  <!-- zh: **開始畫面只有一個「新增工作紙」按鈕。** 按下後會開啟圖庫，顯示四種試卷，每
  種都畫成印出來的頁面樣子，並已預先選好你上次建立的類型。題庫現在放在資源庫之
  下，小屏幕上也有足夠空間。 -->
- **The Edit panel shows which row matches what you clicked.** Click a stem, a statement,
  an option, a table cell, a picture or a part of a long question on the page, and its row
  in the Edit panel lights up in blue with a brief glow, so you can see where to change
  its settings.
  <!-- zh: **編輯面板會標示你點選的是哪一行。** 在頁面上點選題幹、陳述、選項、表格儲存
  格、圖片或長題目的某一分題，編輯面板中對應的一行會以藍色亮起並短暫發光，讓你
  知道在哪裏更改設定。 -->
- **The "Double-click text to edit" tip is a small pop-up over the page.** It no longer
  takes a whole row under the page or covers the zoom control, and the page does not
  move when it goes. On a smaller screen it stays on two lines. Scrolling to the end of a
  document also no longer runs on past the last page.
  <!-- zh: **「按兩下文字即可編輯」的提示變成浮在頁面上的小提示框。** 它不再在頁面下方
  佔用一整行，也不會蓋住縮放控制，提示消失時頁面亦不會移動。在較小的屏幕上，提示會分
  兩行顯示。捲動到文件末端時也不會再多捲過最後一頁。 -->
- **The Add Question menu says where each type goes**: "in Section A" or "in Section B",
  instead of a heading cut off mid-word.
  <!-- zh: **「插入題目」選單會說明每種題型放在哪裏**：「在 Section A」或「在 Section B
  」，不再出現被截斷的標題。 -->
- **A tidier question panel.** The Add row (Text, Table, Image, Diagram, Source) fits on
  one line, and empty paragraphs simply say "Empty".
  <!-- zh: **更整潔的題目面板。** 新增一行（文字、表格、圖片、圖表、來源）可排在同一行
  ，空白段落只顯示「空白」。 -->
- **HKEAA wording on new exam papers.** New Paper 1 and Paper 2 mock papers end with
  試卷完 and say 選答一題, and AI translation writes END OF PAPER as 試卷完. Papers you
  already saved keep their own wording.
  <!-- zh: **新的試卷採用 HKEAA 用語。** 新建的 Paper 1 和 Paper 2 Mock 試卷以「試卷完
  」作結，並標示「選答一題」；AI 翻譯會把 END OF PAPER 譯作「試卷完」。已儲存
  的舊試卷保持原有用語。 -->
- **A new question looks calmer on the page.** Only the question text keeps the blue
  "Double-click to add" prompt; empty options, parts and captions show a short grey
  "Add English" or "Add 中文" instead. Prompts still never print or export.
  <!-- zh: **新題目在頁面上更清爽。** 只有題目文字保留藍色的「按兩下以加入」提示；空的
  選項、分題和圖說則改為較短的灰色「加入英文」或「加入中文」。這些提示一律不會
  列印或匯出。 -->
- **A tidier top bar with more room for the worksheet's name.** The summary chip shows
  marks and pages (point at it for the full count of each question type), and saving is
  a small dot: point at it to see when your changes were saved. It only says something
  in words if your changes could not be saved.
  <!-- zh: **更整潔的頂部列，工作紙名稱有更多空間。** 摘要標籤顯示分數和頁數（指向它可
  查看各題型的題數），儲存狀態改為一個小圓點：指向它可查看上次儲存修改的時間。
  只有在修改無法儲存時，才會用文字提示。 -->
- **Dialogs say when there is more below.** Export, Settings, Setup and New worksheet
  show "More below" when a setting is out of view; click it to scroll. In Export, the two
  version choices are now "Student or teacher copy" and "Shuffled versions". In AI
  settings, the model list shows each model's name in full with its details underneath.
  <!-- zh: **對話框會提示下方還有內容。** 匯出、設定、頁面設定和新增工作紙的對話框，在
  有設定不在視野內時會顯示「下方還有內容」，按一下即可捲動。在匯出中，兩個版本
  選項現在叫「學生版或教師版」和「選項亂序版本」。在 AI 設定中，模型清單會完整
  顯示每個模型的名稱，細節放在下方。 -->
- **A tidier start screen on smaller laptops.** Worksheet previews are one steady size
  however many you have, the search, filter, order and view controls fit on one line at
  1024 pixels wide, and What's new, Send feedback and Back up now stay easy to read at
  the bottom of the left panel.
  <!-- zh: **較小的手提電腦上，開始畫面更整齊。** 無論有多少份工作紙，預覽大小都一致；
  搜尋、篩選、排序和檢視控制項在 1024 px 闊度下可排在同一行；左側面板底部的「
  最新功能」、「意見回饋」和「立即備份」也保持清晰易讀。 -->
- **A new worksheet asks for its name first**, so it no longer appears as Untitled in
  your list. The name is for filing and the file name, and does not print on the paper.
  A duplicated worksheet is now listed as "(copy)" of that name.
  <!-- zh: **新增工作紙時先輸入名稱**，所以不會再在清單中顯示為「未命名」。名稱用於歸檔
  和檔案名稱，不會印在試卷上。建立副本的工作紙會顯示為該名稱的「（副本）」。 -->
- **A worksheet made from the question bank is named after its topic** (or "Questions
  from bank" when the questions cover several topics) instead of Untitled. Like any new
  worksheet, it prints no title until you type one.
  <!-- zh: **由題庫建立的工作紙以課題命名**（題目涵蓋多個課題時，則命名為「Questions fr
  om bank」），不再是「未命名」。與其他新工作紙一樣，在你輸入標題前不會印出標
  題。 -->
- **The app is now called Econ Studio (經濟備課室).** Your worksheets, settings and saved
  keys carry over unchanged. On Windows, updating replaces Econ Worksheet with Econ Studio
  in the Start menu; pin it to the taskbar again if you had pinned it. On a Mac, the app
  renames itself from Econ Worksheet to Econ Studio the first time it opens after the
  update, so Finder, Launchpad and Spotlight show the new name. If you already have both,
  they are the same app with the same worksheets: move Econ Worksheet to the Bin.
  <!-- zh: **本應用程式現在叫 Econ Studio（經濟備課室）。** 你的工作紙、設定和已儲存的 
  API key 原封不動地保留。在 Windows 上，更新後「開始」功能表中的 Econ Workshe
  et 會換成 Econ Studio；如果你曾把它釘選在工作列，請重新釘選。在 Mac 上，更新
  後第一次開啟時，應用程式會自行由 Econ Worksheet 改名為 Econ Studio，Finder、
  Launchpad 和 Spotlight 都會顯示新名稱。如果兩個都有，它們其實是同一個應用程
  式，工作紙也相同：把 Econ Worksheet 移到垃圾桶即可。 -->
- **The ⋯ menu no longer has "Worksheets…".** Click the app mark at the top left to go back to your worksheets.
  <!-- zh: **「⋯」選單不再有「工作紙…」。** 按左上角的應用程式標誌即可返回你的工作紙
  。 -->
- **Settings is easier to find.** Its gear now sits in the top-right corner of the start
  screen and the question bank. In a worksheet, Settings is still in the ⋯ menu.
  <!-- zh: **設定更容易找到。** 設定的齒輪圖示現在位於開始畫面和題庫的右上角。在工作紙
  中，設定仍在「⋯」選單內。 -->
- Start screen rows and saved worksheets now highlight on hover without the blue side bar.
  <!-- zh: 開始畫面的列和已儲存的工作紙，指向時會變色，不再出現藍色側邊條。 -->
- **See and test your saved AI keys.** Settings › AI & translation now starts with "Your
  keys": each saved key with its provider, only its last 4 characters shown, which one is
  in use, and a Test button that checks it any time. Providers with a key say "Key saved",
  and the key panel is shorter.
  <!-- zh: **查看並測試已儲存的 AI key。** 設定 › AI 與翻譯現在以「你的 API key」開始
  ：列出每個已儲存的 key 及其供應商，只顯示最後 4 個字元，並標明正在使用的一個
  ，另有「測試」按鈕，隨時可檢查。已有 key 的供應商顯示「已儲存 API key」，key
   面板也縮短了。 -->
- **Plainer wording in messages and hints.** Hints, notices and error messages now use
  short sentences instead of long dashes.
  <!-- zh: **訊息和提示的用字更簡潔。** 提示、通知和錯誤訊息現在用短句，不再用長破折號
  。 -->
- **Question bank: one action per question.** Reading a question, you now see only "Open
  in worksheet". To add questions to your last worksheet, tick them and use the bar at the
  bottom.
  <!-- zh: **題庫：每條題目只有一個操作。** 閱讀題目時，現在只會看到「在工作紙中開啟」
  。要把題目加入你最近的工作紙，請剔選題目，再使用底部的操作列。 -->
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
  <!-- zh: **題庫：每條題目只有一組課題。** 在題庫或工作紙的編輯面板更改題目的課題，現
  在會同步更改它在你其他工作紙中的所有副本（「同時已更新 2 份其他工作紙」），
  題庫在各處顯示的課題也一致。移除課題同樣會在各處移除，而且不會回來，即使日後
  從垃圾桶還原工作紙也一樣：一律以最新的更改為準。從題庫加入的題目會連同其課題
  一併加入。「為已剔選題目設定課題」現在可以新增、移除或取代課題。在題庫中，長
  題目可整題或逐個分題標記課題：「編輯課題」會列出它的各個分題，你可以先為整題
  剔選課題，再單獨更改某一分題（或子分題）。邊看邊標記也一樣：在你選取分題之前
  （按一下它，或按 [ 和 ]），快捷鍵會為整題標記，頁面上會標示你所選的分題。「
  為已剔選題目設定課題」會為每個分題加上該課題。 -->
- **Question bank: easier to read.** "Used in" puts each paper's full title on its own
  line, and the Class filter shows a short name ("Not used with DSE 2027") with the
  classes it covers listed underneath.
  <!-- zh: **題庫：更易閱讀。** 「使用於」把每份試卷的完整標題各佔一行；班別篩選顯示簡
  短名稱（「Not used with DSE 2027」），所涵蓋的班別列在其下。 -->
- **MCQ and LQ, the same words everywhere.** Setup's Target now counts MCQ and LQ, as the
  question bank does; the Edit panel says "1 mark", not "1 marks"; and the 題庫 tab's topic
  lists group each topic's sub-topics under it.
  <!-- zh: **MCQ 和 LQ，用語處處一致。** 頁面設定的「目標」現在像題庫一樣統計 MCQ 和 LQ
  ；編輯面板顯示「1 mark」而非「1 marks」；題庫分頁的課題清單會把每個課題的子
  課題歸入其下。 -->
- **The start screen shows when there's more to scroll.** Its left column fades at the
  bottom while more is below, and shows a thin line at the top once you have scrolled down.
  <!-- zh: **開始畫面會提示還有內容可捲動。** 還有內容在下方時，左欄底部會淡出；捲動後
  頂部會出現一條細線。 -->
- **Header & footer settings are organised by page.** In Setup, pick Page 1 or Pages 2
  onward, then choose whether page 1's header and footer are the same as later pages, its
  own, or nothing. Page 1's title settings sit with them.
  <!-- zh: **頁首和頁尾設定按頁面整理。** 在頁面設定中，先選「第 1 頁」或「第 2 頁起」
  ，再選擇第 1 頁的頁首和頁尾與其後頁面相同、自成一套，或不設。第 1 頁的標題設
  定也放在這裏。 -->

### Fixed
- **A diagram's y-axis label in English and 中文 no longer sits on the arrow.** With labels
  in both languages, "價格" printed on top of the y-axis arrowhead; both lines now sit
  above it, on screen, in the Graphs editor, in the PDF and in Word.
  <!-- zh: **圖表的 y 軸標示，在英文和中文並列時，不再壓在箭頭上。** 兩種語言並列時，「
  價格」曾印在 y 軸箭頭上；現在兩行都在箭頭上方，在屏幕、圖表庫編輯器、PDF 和 
  Word 中都一樣。 -->
- **Back up now shows when you have graphs but no worksheets yet**, and the graph
  editor's tools fit on one row on a 13-inch screen.
  <!-- zh: **只有圖表、沒有工作紙時，也會顯示「立即備份」**，圖表編輯器的工具在 13 吋屏
  幕上也可排成一行。 -->
- **Bilingual papers no longer print the footer twice.** A paper code or page number that
  reads the same in English and 中文 now prints once, on screen, in the PDF and in Word.
  Cover instruction numbers such as (1) print once too.
  <!-- zh: **雙語試卷不再重複列印頁尾。** 中英文相同的試卷編號或頁碼，現在在屏幕、PDF 
  和 Word 中都只印一次。封面說明的編號如 (1) 也只印一次。 -->
- **A new question goes to the section made for its type.** With nothing selected, a
  Multiple Choice question lands in Section A and a Structured question in Section B,
  including questions added from 題庫. It used to land after the last heading whatever its
  type. Select a question or heading first to put it right after that instead.
  <!-- zh: **新題目會放進適合其題型的部分。** 沒有選取任何項目時，MC 題會放進 Section A
  ，結構題放進 Section B，從題庫加入的題目也一樣。以往不論題型，都會放在最後一
  個標題之後。若想放在某處之後，請先選取該題目或標題。 -->
- **A mislabelled button no longer deletes page 1's own header.** "Same as page 1" kept
  the later pages' header and removed page 1's. The new page choices replace it.
  <!-- zh: **標示錯誤的按鈕不再刪掉第 1 頁自己的頁首。** 「與第 1 頁相同」曾保留其後頁
  面的頁首，卻移除第 1 頁的頁首。新的頁面選項已取代它。 -->
- **PDF export on Mac (and in Safari) no longer shrinks the pages or runs them into each
  other.** Each sheet prints full size on its own page.
  <!-- zh: **在 Mac（及 Safari）匯出 PDF 時，頁面不再縮小或互相重疊。** 每一頁都以原尺
  寸印在自己的一頁上。 -->
- **A row added on page 1 stays on page 1.** When page 1 was set to no header or footer,
  adding a row there put it on every later page instead. Page 1 now gets its own rows.
  <!-- zh: **加在第 1 頁的列會留在第 1 頁。** 當第 1 頁設為沒有頁首或頁尾時，在該處加入
  的列曾出現在其後每一頁。現在第 1 頁有自己的列。 -->
- **Typing on the page is lighter.** The page no longer redraws twice for every key you
  press, which on a busy computer could stop the editor with an error mid-sentence.
  <!-- zh: **在頁面上打字更流暢。** 每按一個鍵，頁面不再重繪兩次；在繁忙的電腦上，這曾
  可能令編輯器在輸入途中出錯而停頓。 -->
- **Editing a duplicated question no longer changes the original.** Worksheets where a
  duplicate and its original were stuck together are separated when you open them.
  <!-- zh: **編輯重複的題目不再改動原題。** 以往複製出來的題目與原題連在一起，現在開啟
  這些工作紙時會把它們分開。 -->
- **Right-clicking anywhere inside a question now opens its menu**, including ✦ AI: the
  space beside a diagram, the question number, option letters and marks no longer bring
  up the browser's own menu.
  <!-- zh: **在題目內任何位置按右鍵，現在都會開啟其選單**，包括 ✦ AI：圖表旁的空位、題
  號、選項字母和分數，不再彈出瀏覽器自己的選單。 -->
- **Undo waits while you drag from the 題庫 tab.** Pressing ⌘Z (or Ctrl+Z) mid-drag used
  to change the worksheet under the question in your hand. Now it does nothing until you
  let go; after the drop, one Undo takes the new question out.
  <!-- zh: **從題庫分頁拖曳時，復原會暫停。** 拖曳途中按 ⌘Z（或 Ctrl+Z），以往會在你手
  上的題目下方改動工作紙。現在放手之前不會有任何動作；放下後，按一次復原便會把
  新題目移走。 -->

## 0.5.0 — 2026-09-28

### Added
- **Light or dark, your choice**: Settings → Appearance picks Light, Dark or System (follows
  your computer, as before). Worksheets still print black on white.
  <!-- zh: **淺色或深色，隨你選**：設定 → 外觀可選擇淺色、深色或跟隨系統（跟隨電腦設定，
  一如以往）。工作紙仍然是白底黑字列印。 -->
- **✦ AI**: one button (or ⌘J, Ctrl+J on Windows) holds every AI tool, for the whole
  paper or whatever you have selected — right-click any text, table or question for AI on
  just that part. The number on the button is how many texts still need translating. It
  uses your own AI account (Gemini, DeepSeek, Qwen and others): the first time, pick a
  provider and paste your key right in the menu, and the action you chose runs once the
  key works.
  <!-- zh: **✦ AI**：一個按鈕（或 ⌘J，Windows 用 Ctrl+J）集合所有 AI 工具，可用於整份
  試卷或你選取的部分。在任何文字、表格或題目上按右鍵，即可只對該部分使用 AI。按鈕上的
  數字是仍未翻譯的文字數目。它使用你自己的 AI 帳戶（Gemini、DeepSeek、Qwen 等）：首次
  使用時，直接在選單中選擇供應商並貼上 API key，key 生效後便會執行你剛才選的功能。 -->
- **Fill missing 中文 or English** with AI. Economics terms follow the Education Bureau
  glossary; a single field fills in place.
  <!-- zh: **用 AI 補上缺少的中文或英文**。經濟學用語依照教育局詞彙表；單一欄位會就地
  填寫。 -->
- **AI results go straight onto the page**, highlighted: walk through them with ‹ ›, and
  take them all back with **Undo all** or one ⌘Z. Anything worth a second look is marked
  in amber; a text that couldn't be translated safely is left as it was and listed.
  <!-- zh: **AI 結果直接放到頁面上**並以醒目標示：可用 ‹ › 逐項查看，亦可按**全部復原*
  *或按一下 ⌘Z 全部取消。值得再看一遍的內容會以琥珀色標記；無法安全翻譯的文字會保持原
  樣並列出。 -->
- **Check terms**: compare the Chinese with the EDB glossary — no key needed. Findings are
  underlined on the page; replace them one by one or all at once.
  <!-- zh: **檢查用詞**：將中文與教育局詞彙表比對，毋須 API key。問題會在頁面上加底線，
  可逐項或一次過替換。 -->
- **Settings** (⋯ → Settings…): app-wide preferences for this browser or computer,
  starting with AI & translation. The per-document dialog is now called **Setup**
  everywhere.
  <!-- zh: **設定**（⋯ → 設定…）：此瀏覽器或電腦的整體偏好，首先加入 AI 與翻譯。每份文
  件各自的對話框，現在統一稱為**頁面設定**。 -->
- New font choice **Times New Roman / 標楷體** (Setup → Fonts, or when creating a
  worksheet): Chinese text prints and exports in 標楷體. The default stays 新細明體.
  <!-- zh: 新增字型選擇 **Times New Roman / 標楷體**（頁面設定 → 字型，或新增工作紙時
  選擇）：中文會以標楷體列印和匯出。預設仍為新細明體。 -->

### Changed
- New diagrams and the sample paper now use the Education Bureau glossary's Chinese
  terms (物價水平, 總收入, 生產可能曲線, 洛倫茨曲線 …), and 效率損失 for deadweight loss,
  物品X and 廠商A as in HKDSE papers; the sample Paper 2 question now reads as an HKDSE
  paper would (寫出…, **一個**). Worksheets you already made keep their wording.
  <!-- zh: 新建的圖表和範例試卷現在採用教育局詞彙表的中文用語（物價水平、總收入、生產
  可能曲線、洛倫茨曲線 …），deadweight loss 用「效率損失」，並沿用 HKDSE 試卷的「物品X」
  和「廠商A」寫法；範例 Paper 2 題目的措辭也更貼近 HKDSE 試卷（寫出…、**一個**）。你已
  建立的工作紙用語不變。 -->
- The ‘untranslated’ count now covers the whole paper — cover, header and footer, tables
  and diagram labels — and shows in 中文 mode too.
  <!-- zh: 「未翻譯」數目現在涵蓋整份試卷，包括封面、頁首和頁尾、表格及圖表標示，在中
  文模式下也會顯示。 -->
- Status messages such as "Exported .pdf" float under the toolbar instead of pushing the
  page down, and "Saved" shows its time when you point at it.
  <!-- zh: 狀態訊息（例如「已匯出 .pdf」）改為浮在工具列下方，不再把頁面推低；將游標移
  到「已儲存」上會顯示儲存時間。 -->
- Getting around is easier: click **Worksheets** at the top-left of the editor to return
  to your home page of worksheets — your work is saved first — and click any worksheet
  there to open it. On the home page, Settings is the gear in the bottom-left corner.
  <!-- zh: 瀏覽更方便：按編輯器左上角的**工作紙**即可回到工作紙主頁（會先儲存你的工作），
  再按主頁上任何一份工作紙便可開啟。在主頁上，設定是左下角的齒輪。 -->

### Fixed
- **Clear saved documents** now clears the worksheet you have open too, even with
  unsaved changes — it no longer reappears on the home page afterwards.
  <!-- zh: **清除已儲存的工作紙**現在連你正開啟的工作紙也會清除，即使有未儲存的改動也
  一樣，之後不會再在主頁重新出現。 -->
- The toolbar stays on one line on smaller laptop screens: a long worksheet name is
  shortened with "…" (point at it for the full name), Setup shows as its icon, and
  "Saved" becomes a small dot until the window is wider.
  <!-- zh: 在較小的手提電腦屏幕上，工具列保持單行：過長的工作紙名稱會以「…」縮短（指向
  它可看到全名），頁面設定顯示為圖示，而「已儲存」在視窗未夠闊前會變成一個小圓點。 -->

## 0.4.0 — 2026-09-27

### Added
- **Paper summary with a target**: the toolbar shows what the paper holds — "38 MCQ ·
  2 structured · 52 marks · ~65 min · 5 pages". Set a target in Setup (questions per
  type, marks, minutes) and it reads "38/45 MCQ · 52/50 marks", tinted when you are over;
  the export check lists anything over or under. The time estimate now uses the DSE
  Paper 2 pace of 150 minutes for 120 marks.
  <!-- zh: **帶目標的試卷摘要**：工具列顯示試卷內容，例如「38 MCQ · 2 structured · 52 分 · 約 65 分
  鐘 · 5 頁」。在頁面設定中訂下目標（各題型題數、分數、時間），便會顯示「38/45 MCQ · 52/50 分」，
  超出時變色；匯出檢查會列出超出或不足的項目。時間估算改用 DSE Paper 2 的步速：
  120 分用 150 分鐘。 -->
- **Diagram templates follow your drags**: move a curve and the equilibria, dashed
  drops, P and Q arrows, shortage and import brackets, the tax wedge, output gaps and
  shaded areas move with it; D₁ or S + t keeps its shift, MR stays twice as steep as D,
  and the CPF stays tangent to the PPF. Shade ▾ now adds areas on a template without
  asking which curve is which.
  <!-- zh: **圖表範本跟隨你的拖曳**：移動一條曲線，均衡點、虛線垂線、P 和 Q 箭頭、短缺和進
  口括號、稅楔、產出缺口和陰影區域都會一同移動；D₁ 或 S + t 保持其平移幅度，MR 維
  持 D 的兩倍斜度，CPF 保持與 PPF 相切。在範本上按陰影 ▾ 加入區域時，不再追
  問哪條是哪條曲線。 -->
- **22 more diagram templates**, one for each scheme item that had none: the MCQ
  double-shift grid, shortage before and after, a lowered ceiling, CS change under a
  ceiling, an ineffective ceiling, revenue at a fixed price, the minimum-wage bill, quota
  G / L and a demand rise under a quota, subsidy overproduction (MC > MB), TSS loss when
  MC rises, AD and SRAS both shifting left, AD at full capacity, gap₀ and gap₁, the
  inflationary self-adjustment, the substitute-good exchange-rate case, a demand rise
  under an import quota with quota rent, monopoly with rising MC, MC rising, a lump-sum
  tax, "same P and Q after MC falls", and two countries' PPFs on one figure.
  <!-- zh: **再多 22 個圖表範本**，補上評卷參考中尚未有範本的每一項：MCQ 雙重平移格、平
  移前後的短缺、下調的價格上限、價格上限下的消費者剩餘變化、無效的價格上限、固定價格下的收
  益、最低工資總額、配額 G / L 與配額下的需求上升、補貼過度生產（MC > MB）、
  MC 上升時的 TSS 損失、AD 與 SRAS 同時左移、AD 處於全部產能、gap₀ 與 gap
  ₁、通脹的自我調整、替代品匯率個案、進口配額下需求上升與配額租金、MC 上升的壟斷、MC 上
  升、一次性總額稅、「MC 下降後 P 和 Q 不變」，以及兩個國家的 PPF 並列於同一
  圖。 -->
- **Every welfare area the marking schemes name, one click from Shade ▾**: buyers' and
  sellers' burden, CS loss under a tax, consumer and producer benefit of a subsidy, DWL of
  a tax, subsidy, price control, tariff or monopoly, TSS loss, revenue or wage bill at a
  fixed price, CS + / − under a ceiling, tariff revenue, PS gain, CS loss and quota rent.
  Each is hatched apart from its neighbours, labelled in both languages, and follows the
  curves when you drag them. The menu is grouped, asks which curve is which when it
  cannot tell, and "Between two edges…" shades any region between two curves or levels.
  <!-- zh: **評卷參考提到的每種福利區域，在陰影 ▾ 一按即得**：買家和賣家的負擔、徵稅下的消費
  者剩餘損失、補貼的消費者和生產者利益、稅項、補貼、價格管制、關稅或壟斷的 DWL、TSS 損
  失、固定價格下的收益或工資總額、價格上限下的消費者剩餘增減、關稅收入、生產者剩餘增加、消
  費者剩餘損失和配額租金。各區域紋理互不相同，附有雙語標示，拖曳曲線時會跟隨移動。選單已分
  組，分不清哪條是哪條曲線時會詢問；「兩邊之間…」可為兩條曲線或水平之間的任何區域加上陰影。
   -->
- **Marking scheme in HKEAA notation** on structured question parts: marking points with
  marks, \`/\` alternatives, "any N @ 1", \`max: N\`, "mark the FIRST N only", OR routes,
  level descriptors and Effective Communication marks. Prints in the teacher version
  and the answer key; the student paper is unchanged.
  <!-- zh: **以 HKEAA 格式撰寫評卷參考**，用於結構題的分題：得分點及分數、\`/\` 代替答
  案、「any N @ 1」、\`max: N\`、「只評前 N 項」、OR 路徑、等級描述和 Effective Communication 分。
  教師版和答案頁會列印；學生試卷不變。 -->
- **MCQ rationale and source note**: per option, why it is right or wrong, and a
  "Source:" line such as "modelled on DSE 2023 Q1". Teacher version and answer key only;
  rationale follows its option when paper versions shuffle.
  <!-- zh: **MCQ 解釋和出處註**：逐個選項說明為何正確或錯誤，另有「Source:」一行，例
  如「modelled on DSE 2023 Q1」。只見於教師版和答案頁；試卷版本洗牌
  時，解釋跟隨其選項。 -->
- **Shaded areas on diagrams**: consumer surplus, producer surplus, deadweight loss and
  tax revenue presets, plus a free shape; grey shade or hatch, draggable label. Areas
  follow the curves they are built on.
  <!-- zh: **圖表上的陰影區域**：消費者剩餘、生產者剩餘、無謂損失和稅收的預設區域，另有自由形狀；
  可選灰色陰影或紋理，標示可拖曳。區域跟隨其所依據的曲線。 -->
- **Hatch patterns for shaded areas**, so areas still tell apart on a black-and-white
  photocopy: diagonal, reverse diagonal, cross-hatch, horizontal, vertical or dots, at
  normal or dense spacing. New CS, PS, DWL and tax revenue areas each start in their own
  pattern; areas you already drew keep their look.
  <!-- zh: **陰影區域的紋理圖案**，黑白影印後仍分辨得出各區域：斜線、反斜線、交叉線、橫線、直線
  或點，疏密各有普通和密集。新增的消費者剩餘、生產者剩餘、無謂損失和稅收區域各自採用不同圖
  案；已畫好的區域外觀不變。 -->
- **Revenue areas on diagrams**: total revenue (P × Q) at an equilibrium, and the revenue
  gain and loss between E₀ and E₁ after a shift — even when the gain or loss is an
  L-shape. Pick which points they measure; they follow the points when you drag them.
  <!-- zh: **圖表上的收益區域**：均衡點的總收益（P × Q），以及平移後 E₀ 與 E₁ 之間
  的收益增減，即使增減呈 L 形也可。自選量度哪些點；拖曳點時，區域隨之移動。 -->
- **Shift a curve**: shift D or S left/right/up/down by a percentage to get D₁ (or S₁),
  the shift arrow and the new equilibrium E₁ with guide lines and P₁/Q₁ labels.
  <!-- zh: **平移曲線**：將 D 或 S 向左、右、上、下按百分比平移，得出 D₁（或 S₁）、
  平移箭頭和新均衡點 E₁，並附輔助線和 P₁/Q₁ 標示。 -->
- **Model answer diagrams on long questions**: attach a diagram to a part's answer
  from its ⋯ menu ("Add model diagram") and draw it with the same diagram tools. It
  prints in the teacher version and the answer key; the student paper is unchanged.
  <!-- zh: **長題目的參考答案圖表**：從分題的 ⋯ 選單選擇「加入參考圖表」，並以同一套圖表工具
  繪畫。教師版和答案頁會列印；學生試卷不變。 -->
- **Graph answer space**: a blank-axes box (optional grid, axis labels, 12/16/20/24
  lines, half or full width) that students draw on, in any part or sub-part.
  <!-- zh: **圖表答題空間**：空白座標軸方格（可選格線、座標軸標示、12/16/20/24 行、
  半幅或全幅），供學生在任何分題或子分題中繪圖。 -->
- **Folders on the start screen**: create, rename and delete folders; move documents in
  from the menu or by dragging; search and filter inside a folder. Folders are kept in
  backups.
  <!-- zh: **開始畫面的資料夾**：建立、重新命名和刪除資料夾；從選單或拖曳將文件移入；在資料夾內
  搜尋和篩選。備份已包括資料夾。 -->
- **One Export button** for \`.docx\`, PDF and \`.json\`, chosen inside the dialog; options
  that do not apply to a format are greyed with a reason.
  <!-- zh: **單一匯出按鈕**，在對話框內選擇 \`.docx\`、PDF 或 \`.json\`；不適用
  於該格式的選項會變灰並說明原因。 -->
- **What's new**: the first time a new version opens, a short note lists what it adds,
  once. "What's new" beside Send feedback on the start screen, and in the editor's ⋯
  menu, lists every release.
  <!-- zh: **最新功能**：新版本首次開啟時，會顯示簡短說明列出新增項目，只顯示一次。開始畫面意見
  回饋旁的「最新功能」，以及編輯器 ⋯ 選單內的同名項目，會列出每個版本。 -->
- **Worksheets from a newer version open safely**: a file saved by a newer Econ Worksheet
  opens read-only with a note to update, and is never overwritten. "Duplicate as editable
  copy" makes a copy you can edit now.
  <!-- zh: **較新版本的工作紙可安全開啟**：較新版 Econ Worksheet 儲存的檔案會以
  唯讀方式開啟，並提示更新，絕不會被覆寫。「建立可編輯的副本」可立即產生能編輯的副本。 -->
- **Diagrams that stay connected**: an equilibrium placed on a crossing follows its
  curves, so shifting S₁ moves E₁ with it. Add MR (same intercept, twice as steep),
  a line parallel or tangent to another (CPF, terms of trade), price-level and vertical
  lines, and brackets or arrows between two points: shortage, the tax wedge "t",
  P₁→P₂ on the axis. They follow what they measure.
  <!-- zh: **互相連動的圖表**：放在交叉點上的均衡點會跟隨其曲線，所以移動 S₁，E₁ 便隨之移
  動。可加入 MR（截距相同、斜度兩倍）、與另一線平行或相切的線（CPF、貿易條件）、價格
  水平線和垂直線，以及兩點之間的括號或箭頭：短缺、稅楔「t」、座標軸上的 P₁→P₂。它們
  跟隨所量度的對象。 -->
- **Axis scales for diagrams**: give an axis a maximum (30 wheat, 60 cloth) and type a
  point's position as values; empty tick labels print their value.
  <!-- zh: **圖表座標軸刻度**：可為座標軸訂下最大值（30 小麥、60 布），並以數值輸入點的位
  置；空白刻度標示會印出其數值。 -->
- **Diagram templates for every diagram the marking schemes ask for**, grouped by topic
  with a search box: supply and demand shifts (one curve or both), elastic and inelastic
  revenue boxes, fixed supply, labour importation, surplus; price ceiling, minimum wage,
  quotas and deadweight loss; per-unit tax and subsidy burdens, Lorenz curve; AD–AS shifts,
  output gaps, self-adjustment, LRAS growth; money supply and demand shifts;
  exchange-rate revenue, tariff, import quota; monopoly (MC constant, MC = 0, MC falls)
  and PPF trade. Each ships the after-state — both curves, both equilibria, the arrows.
  <!-- zh: **評卷參考要求的每個圖表都有範本**，按課題分組，附搜尋框：供求平移（一條或兩條曲線）、
  彈性和無彈性的收益方格、固定供應、輸入勞工、剩餘；價格上限、最低工資、配額和無謂損失；從
  量稅和補貼的負擔、Lorenz 曲線；AD-AS 平移、產出缺口、自我調整、LRAS 增
  長；貨幣供應和需求平移；匯率收益、關稅、進口配額；壟斷（MC 不變、MC = 0、MC 下
  降）及 PPF 貿易。每個範本都附有變動後的狀態：兩條曲線、兩個均衡點和箭頭。 -->

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
  <!-- zh: **圖表上的 P 和 Q 變動箭頭，畫法與評卷參考一致**：位於座標軸外，在 Q₀ Q₁ 標
  示之下、P₀ P₁ 之左，刻度標示亦緊貼座標軸。座標軸上的括號和間距也在該處；拖曳可將它
  移遠或移回。S₀ 與 S₁ 之間的稅項 t 和補貼 s 一律是指向 S₁ 的箭頭：稅項向
  上，補貼向下；將 S₁ 拖過 S₀ 時會掉轉方向。均衡點不再自動附帶 E₀ / E₁ 名
  稱，與評卷參考的一般畫法相同；選取點後按 **Label E₀**（會建議下一個空號）即
  可加上，標示會置於點的右側，避開曲線。已有的圖表保留原有名稱。 -->
- **Desktop: Export → PDF saves a file directly, no print sheet.** Choose where in the
  save dialog (it starts in your exports folder, like \`.docx\`); the status line then
  offers Show in Finder / Explorer. In a browser, PDF still goes through the print
  dialog's Save as PDF.
  <!-- zh: **桌面版：匯出 → PDF 直接儲存檔案，不再出現列印頁。** 在儲存對話框選擇位置（
  預設為匯出資料夾，與 \`.docx\` 一樣）；完成後狀態列提供「在 Finder 中顯示」
  （Windows 為 Explorer）。在瀏覽器中，PDF 仍經列印對話框的「另存為 PDF」。
   -->
- **Smoother buttons, menus and dialogs**: buttons press in and ease their colours,
  menus grow out of the button that opened them, and dialogs fade in instead of
  appearing all at once. Quick enough never to slow you down.
  <!-- zh: **更流暢的按鈕、選單和對話框**：按鈕有按下效果並平滑轉色，選單從開啟它的按鈕展開，對
  話框淡入而非突然出現。速度夠快，絕不拖慢操作。 -->

- **The inflationary and deflationary gap templates mark the gap just above the output
  axis**, between Y₀ and Yf, with its name above the arrow. It still follows AD, SRAS
  and LRAS when you drag them.
  <!-- zh: **通脹缺口和緊縮缺口範本把缺口標在產出軸之上**，位於 Y₀ 與 Yf 之間，名稱在箭
  頭上方。拖曳 AD、SRAS 和 LRAS 時，缺口仍會跟隨。 -->
### Fixed
- **Shift a copy in an English-only worksheet named the copy S₅₀** (and its ticks P₅₀
  and Q₅₀). It is now S₁, with P₁ and Q₁.
  <!-- zh: **在純英文工作紙中平移副本，副本被命名為 S₅₀**（刻度為 P₅₀ 和 Q₅₀）。現
  在改為 S₁，刻度為 P₁ 和 Q₁。 -->
- **The import-tariff template had no imports**: Pw + t sat above the market's own
  equilibrium. It now sits between Pw and it, with Q₁, Q₂ and the imports QM marked. The
  old four-quantity figure is still there as "Tariff: welfare areas".
  <!-- zh: **進口關稅範本沒有進口量**：Pw + t 位於市場本身的均衡點之上。現在位於 Pw 與
  均衡點之間，並標示 Q₁、Q₂ 和進口量 QM。舊有的四數量圖仍保留為「Tariff: welfare areas」。
   -->
- **PDF printed every marks label twice** ("(4 marks)" after the text and again at the
  right margin). It now prints once, at the right.
  <!-- zh: **PDF 的分數標示列印了兩次**（文字後印一次「(4 marks)」，右邊界再印一次）。
  現在只在右邊印一次。 -->
- **Desktop PDF: the cover's corner box printed solid black.** Its diagonal now prints
  as a line.
  <!-- zh: **桌面版 PDF：封面角落的方格印成全黑。** 現在其對角線會印成一條線。 -->
- **Desktop: Export → PDF opens the print sheet** instead of failing silently.
  <!-- zh: **桌面版：匯出 → PDF 會開啟列印頁**，而不是無聲失敗。 -->
- **Print PDF lost every arrowhead and pie hatching** (axis arrows, shift arrows,
  flow-chart arrows, hatched and dotted pie slices). All now print.
  <!-- zh: **列印 PDF 時所有箭頭和圓餅圖紋理消失**（座標軸箭頭、平移箭頭、流程圖箭頭、有紋
  理和點狀的圓餅圖扇形）。現已全部列印。 -->
- **Dragging a document onto a folder now works in the desktop app.**
  <!-- zh: **現在可在桌面版把文件拖到資料夾上。** -->
- **Desktop: dropping a worksheet file onto the start screen imports it.** Drop several
  \`.json\` files at once to add them all to your list; nothing already there is replaced.
  <!-- zh: **桌面版：把工作紙檔案拖到開始畫面即可匯入。** 一次拖入多個 \`.json\` 檔案，
  可全部加到列表；原有文件不會被取代。 -->
- **The page rail now appears for a mock paper with a cover and one page** — the cover
  counts as a page, and its card lights up while you are on it.
  <!-- zh: **有封面和單頁的 Mock 試卷現在會顯示頁面列**：封面算作一頁，在封面上時其卡片會
  亮起。 -->

## 0.3.0 — 2026-09-24

### Added
- **Export dialog**: question paper, a separate **answer key** \`.docx\`, or both, in any
  language, with **include/omit the cover page and the answer space** toggles.
  <!-- zh: **匯出對話框**：可匯出試卷、獨立的**答案頁** \`.docx\`，或兩者皆有，並可選擇
  任何語言，亦可切換**包含或不包含封面和答題空間**。 -->
- **Paper versions A–D**: seeded MCQ option shuffles with a per-version key and a
  version map in the answer key.
  <!-- zh: **試卷版本 A 至 D**：MCQ 選項按種子隨機排序，每個版本有各自的答案，答案頁附有
  版本對照表。 -->
- **Export for other apps**: ZipGrade key, plain key CSV, Kahoot \`.xlsx\`, Blooket CSV.
  <!-- zh: **匯出給其他應用程式**：ZipGrade 答案、純答案 CSV、Kahoot \`.xlsx\`、Blooket 
  CSV。 -->
- **Pre-print paper check**: marks, timing, missing answers and translations, shown
  before export.
  <!-- zh: **列印前試卷檢查**：匯出前顯示分數、時間、缺少的答案和缺少的翻譯。 -->
- **Backup all as one zip** and restore (never overwrites); **Trash** with 30-day restore.
  <!-- zh: **全部備份為一個 zip** 及還原（不會覆蓋現有檔案）；**垃圾桶**可在 30 日內還
  原。 -->
- **File dashboard**: saved documents as first-page thumbnails or a list, with search,
  kind filter and ordering. Desktop dialogs start in \`~/Documents/Econ Worksheets\` and
  exported files can be revealed in Finder/Explorer.
  <!-- zh: **檔案總覽**：已儲存的文件可用第一頁縮圖或清單顯示，並可搜尋、按類別篩選和
  排序。桌面版的對話框預設在 \`~/Documents/Econ Worksheets\` 開啟，匯出的檔案可在 Finder
  /檔案總管中顯示。 -->
- **In-app feedback**: a prefilled GitHub issue, an email, or copy to clipboard.
  <!-- zh: **應用程式內意見回饋**：預先填寫好的 GitHub issue、電郵，或複製到剪貼簿。 -->
- **Paste-anywhere download widget** for other websites, always pointing at the latest
  release.
  <!-- zh: **可貼到任何網站的下載小工具**，永遠連到最新版本。 -->

### Changed
- Start-screen sidebar decluttered; version shown with a manual "Check for updates".
  <!-- zh: 開始畫面的側欄更簡潔；會顯示版本，並提供手動「檢查更新」。 -->
- Updates download silently and show the banner only when ready; one check per launch.
  Pending edits are saved before the restart.
  <!-- zh: 更新會在背景下載，準備好才顯示通知列；每次啟動只檢查一次。重新啟動前會先儲
  存未儲存的改動。 -->

## 0.2.0 — 2026-09-23

### Added
- **Desktop app for macOS and Windows** (Tauri 2). Documents become files under the app
  data folder, saving uses the native dialog, and the app updates itself from GitHub
  Releases. The web app is unchanged and stays the primary target.
  <!-- zh: **macOS 和 Windows 桌面版**（Tauri 2）。文件會成為應用程式資料夾內的檔案，
  儲存時使用系統對話框，並會從 GitHub Releases 自動更新。網頁版不變，仍是主要版本。 -->

### Changed
- The sidebar is an inspector: excerpt rows and a mark-scheme grid, no dead ends.
  <!-- zh: 側欄改為檢視面板：以摘要列和評卷參考格顯示，不再有死胡同。 -->
- Contextual tools dock over the page: table and figure rows, right-click menus.
  <!-- zh: 相關工具浮在頁面上：表格和圖片的工具列，以及右鍵選單。 -->
- MCQ options with figures lay out two per row.
  <!-- zh: 附圖的 MCQ 選項改為每行兩個。 -->

## Earlier (web app, July–September 2026)

The web editor before it was versioned: bilingual on-page authoring of HKDSE-format
papers with click-to-edit on the paginated preview; MCQ and structured questions with
derived numbering and marks; sections, headings, stimuli, labelled sources and tables;
supply–demand, business-cycle, pie and flow-chart diagrams with a drawing canvas; cover
page and Paper 2 answer booklet (LQ mode) with dotted answer space; headers and
footers with a separate first page; faithful \`.docx\` export, print-to-PDF and
copy-for-Word, all built in the browser; autosave with undo/redo; the warm studio
theme.
<!-- zh: 版本編號之前的網頁編輯器：以中英雙語直接在頁面上撰寫 HKDSE 格式的試卷，並可在
分頁預覽上按一下即編輯；MCQ 和結構題，編號及分數自動計算；部分、標題、資料、附來源的圖
片和表格；供求、經濟周期、圓形圖和流程圖，並附繪圖畫布；封面及 Paper 2 答題簿（LQ 模式），
附點線答題空間；可設不同首頁的頁首和頁尾；忠實的 \`.docx\` 匯出、列印成 PDF 及複製到
Word，全部在瀏覽器內完成；自動儲存及復原／重做；暖色工作室主題。 -->
`;
