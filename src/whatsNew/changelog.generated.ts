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
- **Import a paper from Word or PDF.** On the home screen, choose Import from Word or PDF… (or
  drop a .docx or .pdf file there). Econ Studio reads the file, works out which lines are
  questions, parts, options and marks, and shows them beside the questions as they will print.
  Fix any line with one click or one key, and the fix spreads to every line like it. Click an
  option to make it the answer. Pictures in a Word file come with it, and graphs in a PDF are
  cropped from the page. Where a picture is still missing (a chart Word drew, or a line such as
  "Figure 1" with nothing after it), select the place and paste a screenshot (⌘V). Then save it
  as a new Classroom worksheet, LQ worksheet, Paper 1 mock or Paper 2 mock, which opens ready to
  edit, or add the questions to 題庫 only, where questions it already has are skipped. A scanned
  PDF, an older .doc file or a file with a password says what to do instead. Choose or drop
  several files at once when the answers are in another file: Econ Studio tells the papers from
  the answer keys and marking schemes, pairs them by name, and lets you relink any of them. Each
  paper is then checked in turn with its MC answers and marking schemes already in place, shown
  as they will print in the teacher copy, with a list of anything to check (a missing answer, or
  an answer that differs from the paper). Save them all as new papers in one go, or add them to
  題庫.
  <!-- zh: **從 Word 或 PDF 匯入試卷。** 在主頁選擇「從 Word 或 PDF 匯入…」（或把 .docx 或 .pdf 檔案拖放到主頁）。
  Econ Studio 會讀取檔案，判斷哪些行是題目、分題、選項和分數，並在旁邊顯示列印效果。按一下或按一個鍵即可修正任何一行，
  修正亦會套用到所有相似的行。按一下選項即可設為答案。Word 檔案中的圖片會一併匯入，PDF 中的圖表會從頁面裁剪出來。
  如仍缺少圖片（例如 Word 繪製的圖表，或「圖一」之後沒有圖片），選取該位置後貼上截圖（⌘V）即可。然後把它儲存為新的
  課堂工作紙、LQ 工作紙、Paper 1 Mock 或 Paper 2 Mock，並直接開啟編輯，或只把題目加入題庫，題庫已有的題目會略過。
  掃描的 PDF、舊版 .doc 檔案或設有密碼的檔案，會說明應怎樣做。答案在另一個檔案？可一次選擇或拖放多個檔案：
  Econ Studio 會分辨哪些是試卷、哪些是答案或評卷參考，按檔名配對，你亦可重新配對。之後逐份檢查試卷，MC 答案和評卷參考
  已經放好，並以教師版的列印效果顯示，另列出需要檢查的地方（例如欠缺答案，或答案與試卷不同）。最後可一次把全部儲存為
  新試卷，或加入題庫。 -->
- **Desktop: your second computer finds your synced folder.** When Econ Studio starts on a
  computer with no folder chosen yet, and your Econ Studio folder is already in OneDrive, Google
  Drive, iCloud Drive or Dropbox, it asks once whether to use it here too. Choose it, and the
  folder picker opens right beside it. With nothing saved yet, the start screen also points to
  Storage location.
  <!-- zh: **桌面版：第二部電腦會找到你的同步資料夾。** Econ Studio 在未選擇資料夾的電腦上啟動時，如果你的
  Econ Studio 資料夾已在 OneDrive、Google Drive、iCloud Drive 或 Dropbox 內，會詢問一次是否也在這部電腦使用。
  按「選擇資料夾…」，選擇資料夾的視窗便會在它旁邊打開。未有儲存任何工作紙時，開始畫面亦會提示前往「儲存位置」。 -->
- **Choose the language of your papers apart from the app's.** Settings → Language now has two
  choices: UI language, for buttons and menus, and Paper language, the language a new paper starts
  in (EN, 中文 or EN+中). New worksheets, 題庫 and new graphs open in it, and each paper can still be
  switched on its own.
  <!-- zh: **試卷語言可與程式介面分開設定。** 「設定 → 語言」現有兩個選項：「介面語言」決定按鈕和選單的語言，「試卷語言」決定
  新試卷的起始語言（EN、中文或 EN+中）。新工作紙、題庫和新圖表都會以此語言開啟，每份試卷仍可個別切換。 -->
- **Even out rows and columns in a table, as in Word.** Drag across some cells, then choose
  ⇕ Same height to give those rows the height of the tallest one, or ⇔ Same width to share
  those columns' width equally. Only the cells you selected change; the rest of the table stays
  where it is.
  <!-- zh: **表格可平均分配列高和欄寬，與 Word 一樣。** 拖曳選取一些儲存格，再按「⇕ 平均列高」令這些列與最高的一列同高，
  或按「⇔ 平均欄寬」令這些欄平分它們的總寬度。只有所選的儲存格會改變，表格其餘部分保持不變。 -->
- **Importing a paper also brings its header, footer and title block.** The running header and
  footer come in with their page numbers, including a different header on page 1, and the lines
  above the first question (school, title, Name and Class blanks, full marks, time allowed) become
  the paper's title block, or fill the cover of a Paper 1 or Paper 2 mock. The file's header and
  footer replace the paper type's own; tick "Keep the preset header and footer instead" to keep
  them. Anything that cannot be brought in, such as a logo or a header laid out as a table, is
  listed with a Copy button so you can type it in yourself.
  <!-- zh: **匯入試卷時一併匯入頁首、頁尾及標題區。** 每頁的頁首和頁尾連同頁碼一併匯入，包括第 1 頁不同的頁首；第一題之前的
  各行（學校、標題、姓名和班別空格、總分、時間）會成為試卷的標題區，或填入 Paper 1 或 Paper 2 Mock 的封面。檔案的頁首和頁尾
  會取代試卷類型本身的；如要保留後者，請剔選「改用預設的頁首和頁尾」。未能匯入的部分（例如標誌，或以表格排版的頁首）會連同
  「複製」按鈕列出，方便你自行輸入。 -->

### Changed
- **Topic names and question previews follow the language of your questions.** In 題庫, topic
  and sub-topic names and each question's preview line read in the language the questions are
  shown in (EN, 中文 or both with EN+中), not the app's, and a new worksheet made from your picks
  is named in it too. In a paper, the side panel does the same. Buttons and counts stay in the
  app's language.
  <!-- zh: **課題名稱和題目預覽跟隨題目的語言。** 在題庫中，課題及分課題名稱和每條題目的預覽文字會以題目顯示的語言呈現
  （EN、中文，或 EN+中 時兩者並列），而非程式介面的語言；以所選題目建立的新工作紙亦以此語言命名。在試卷中，側欄亦然。按鈕和數目仍跟隨介面語言。 -->

### Fixed
- **Headers, footers and title blocks are laid out on the page as Word prints them.** A long
  line such as "DBS Economics G11 Enhancement Class (2025-26) Assessment 1" now stays on one
  line on the page and in the PDF instead of wrapping into a narrow column, and a centred title
  stays centred beside a Name line. In the Word file, a title block line that starts in the
  middle or on the right now prints there rather than at the left margin, a line with text on
  the left and the right keeps both on one line, and two items in the same place have a space
  between them.
  <!-- zh: **頁首、頁尾和標題區在頁面上的排版與 Word 列印的一致。** 較長的一行（例如「DBS Economics G11 Enhancement
  Class (2025-26) Assessment 1」）在頁面和 PDF 中會保持在同一行，不再擠成窄窄的一欄；置中的標題在「姓名」欄旁邊仍會置中。
  在 Word 檔案中，標題區內由中間或右邊開始的一行會印在該處，不再印在左邊界；左右兩邊都有文字的一行會保持在同一行；同一位置的兩項之間會有空格。 -->
- **A page number in the title block prints the page number in the Word file, not "#".**
  It now updates with the page, as the header and footer page numbers do. Copying a worksheet
  to paste into Word now brings the title block as lines spaced with tabs, as in the Word file,
  instead of a table.
  <!-- zh: **標題區內的頁碼在 Word 檔案中會印出頁碼，不再印出「#」。** 頁碼會隨頁面更新，與頁首和頁尾的頁碼一樣。
  複製工作紙再貼到 Word 時，標題區會以 Tab 對齊的文字行貼上，與 Word 檔案一致，不再變成表格。 -->
- **Long header, footer and title block lines now break where Word breaks them.** When a line
  is too long to fit, the page shows the same words on the same lines as the printed Word file:
  a centred title stays centred, and text that no longer fits beside it moves to the next line,
  as in Word. Header and footer text is shown at the size Word prints it, not smaller. The + for
  adding words before or after a page number, a total or a fill-in line now appears only when
  you point at it, and never sits in the page margin or over other text.
  <!-- zh: **較長的頁首、頁尾和標題區行，換行位置與 Word 一致。** 一行太長放不下時，頁面上每行的字與列印出來的 Word
  檔案相同：置中的標題保持置中，旁邊放不下的文字如 Word 一樣移到下一行。頁首和頁尾的文字以 Word 列印的字號顯示，不再較小。
  在頁碼、總分或填寫橫線前後加字的「+」只會在滑鼠指向時出現，亦不會再出現在頁邊或蓋住其他文字。 -->
- **MC options side by side and label lists now paste into Word as tabbed lines, not tables.**
  When you copy a worksheet to paste into Word, options printed in one row or two columns, and
  label lists such as numbered instructions, arrive as lines lined up with tabs at the same
  places as in the Word file, so they edit like the rest of the paper.
  <!-- zh: **並排的 MC 選項和標籤列表貼到 Word 時會以 Tab 對齊的文字行出現，不再變成表格。** 複製工作紙再貼到 Word 時，
  排成一行或兩欄的選項，以及編號指示等標籤列表，會以 Tab 對齊，位置與 Word 檔案相同，編輯起來與試卷其他部分一樣。 -->
- **Title block page numbers, and header and footer spacing, now match the Word file.** A page
  number in the title block shows its real number on the page and in the PDF, counting the
  cover, instead of "#". Copying or searching a PDF no longer finds stray "+" signs from the
  editing buttons. A header with a long line that wraps now pushes the questions down on every
  page by as much as Word does, and a large-print header or title line no longer has its tops
  cut off in Word.
  <!-- zh: **標題區頁碼和頁首、頁尾的間距與 Word 檔案一致。** 標題區內的頁碼在頁面和 PDF 上會顯示實際頁碼（連封面計算），
  不再顯示「#」。在 PDF 中複製或搜尋文字時，不會再找到編輯按鈕留下的「+」。頁首有較長的一行需要換行時，每一頁的題目都會
  像 Word 一樣向下移；較大字號的頁首或標題行在 Word 中亦不會再被切去頂部。 -->

## 0.7.0 — 2026-10-08

### Added
- **Desktop: use the same worksheets on two computers.** In Settings → Storage location,
  choose a folder inside OneDrive, Google Drive, iCloud Drive or Dropbox, then choose the same
  folder on your other computer. Your worksheets stay on each computer and are copied through
  the folder; if one was changed on both, both versions are kept and listed under Needs attention.
  <!-- zh: **桌面版：在兩部電腦使用相同的工作紙。** 在「設定 → 儲存位置」選擇 OneDrive、Google Drive、
  iCloud Drive 或 Dropbox 內的一個資料夾，再在另一部電腦選擇同一個資料夾。工作紙會保留在每部電腦，並透過該資料夾
  互相複製；如果同一份在兩邊都有修改，兩個版本都會保留，並列於「需要處理」。 -->
- **Storage location shows the cloud folders on your computer.** Before you choose, it lists
  the ones it finds, such as OneDrive or iCloud Drive; click one to start choosing there. If
  Google Drive is missing, it tells you to install Google Drive for desktop: the website alone
  gives no folder on your computer. If you pick a folder it can't use, such as a whole drive or
  your home folder, it says why so you can choose another.
  <!-- zh: **儲存位置會顯示電腦上的雲端資料夾。** 選擇之前，會列出找到的資料夾，例如 OneDrive 或
  iCloud Drive；按一下便可從該處開始選擇。如果未有 Google Drive，會提示你安裝 Google Drive for desktop
  （電腦版）：只用網頁版不會在電腦上有資料夾。如果所選的資料夾無法使用，例如整個磁碟或個人資料夾，
  會說明原因，讓你另選一個。 -->
- **A model answer diagram now has alt text and a title.** They sit under the diagram in the
  question's panel, as they do for a question's own diagram. Choosing another template
  updates the alt text, unless you typed your own.
  <!-- zh: **參考圖表現在可設定替代文字及標題。** 兩者位於題目面板中的圖表下方，與題目本身的圖表相同。
  選擇另一個範本時，替代文字會隨之更新，除非你已自行輸入。 -->
- **Graph space: any height, set on the page.** Type any height from 6 to 40 lines beside
  the four sizes, or click the graph space on the page and drag its bottom edge. Delete
  removes it.
  <!-- zh: **作圖空間：任何高度，可直接在頁面上調整。** 除四個預設高度外，可輸入 6 至 40 行的任何高度，
  或在頁面上按一下作圖空間，再拖曳其底邊。按 Delete 可移除。 -->

### Changed
- **Messages now float in the bottom-right corner instead of pushing the page around.**
  Results such as "Copied", a restored backup, an export error or a new version to install
  appear as small cards that never move your worksheet, list or dialog. Plain results fade
  after a few seconds, and a saved file's "Show in Finder" after ten; warnings, errors and
  other buttons stay until you close them. A message inside a dialog never hides a setting:
  scroll down to reach it. An Undo leaves with its worksheet when you go Home.
  In 題庫, Clear now closes your list at once and offers Undo in the corner.
  <!-- zh: **訊息改為浮現在右下角，不再推動頁面。** 「已複製」、還原備份的結果、匯出錯誤或新版本
  提示等，會以小卡片顯示，不會移動工作紙、清單或對話框。一般結果數秒後自動消失，已儲存檔案的「在 Finder
  中顯示」則十秒後消失；警告、錯誤及其他附有按鈕的訊息會保留，直至你關閉為止。對話框內的訊息不會遮住任何
  設定，向下捲動便可看到。返回主頁時，該工作紙的「復原」會一併消失。在題庫按「清除」會即時收起清單，並在
  角落提供「復原」。 -->

### Fixed
- **The editor no longer scrolls up to leave an empty space at the bottom of the window.**
  With a long paper or marking scheme, scrolling could push the whole editor up; now only the
  page and the side panel scroll.
  <!-- zh: **編輯器不會再向上捲動，在視窗底部留下一片空白。** 試卷或評卷參考較長時，捲動可能把整個編輯器推上去；
  現在只有頁面及側欄會捲動。 -->
- **A ✦ Fill made in 題庫 in another tab is no longer lost to this tab's autosave.** If you
  had nothing unsaved here, the paper now updates to the filled version. If you did, its
  topics are kept and a message offers Reload to see the other tab's version.
  <!-- zh: **在另一分頁的題庫使用 ✦ 填寫後，不會再被此分頁的自動儲存蓋掉。** 如果此分頁沒有未儲存的修改，
  試卷會更新為已填寫的版本；如有，則保留課題，並顯示訊息讓你按「重新載入」查看另一分頁的版本。 -->
- **Tagging the questions that have no topic in 題庫 no longer shifts the topic buttons
  after your first save.** The line that shows what was saved, with Undo, now has its own
  space from the start.
  <!-- zh: **在題庫為未有課題的題目加課題時，首次儲存後課題按鈕不再移位。** 顯示已儲存內容及
  「復原」的一行，一開始便預留位置。 -->
- **The minimum wage diagram's "surplus (unemployment)" label no longer touches the
  supply curve.** A newly inserted minimum wage diagram now places the label clear of both
  curves. Diagrams already in your papers keep their labels where they are.
  <!-- zh: **最低工資圖的「過剩（失業）」標籤不再碰到供應曲線。** 新插入的最低工資圖，標籤會與
  兩條曲線保持距離。工作紙內已有的圖，標籤位置保持不變。 -->
- **Typing while your work is being saved no longer loses those last keystrokes.** An edit
  made at the very moment of an automatic save, or of Save, used to be counted as saved
  without being written. It is now saved a moment later, like any other edit.
  <!-- zh: **在自動儲存期間輸入，最後幾個字不會再遺失。** 以往在自動儲存或按「儲存」的一刻所作的
  修改，會被當作已儲存但其實未寫入。現在會在稍後一併儲存，與其他修改一樣。 -->
- **Dragging a shifted curve in a new template diagram now moves its arrow too.** In a
  diagram such as a demand shift, the arrow from D₀ to D₁ now follows when you drag either
  curve or change the size of the shift. Diagrams already in your papers keep their arrows
  where they are.
  <!-- zh: **在新插入的範本圖中拖動已移動的曲線，箭咀亦會一併移動。** 例如需求移動圖，拖動任何一條
  曲線或改變移動幅度時，由 D₀ 指向 D₁ 的箭咀會跟隨移動。工作紙內已有的圖，箭咀位置保持不變。 -->
- **Shading and marked points on a curved line now sit exactly on it, whatever the graph's
  shape.** An area or point measured along a curved line, such as a U-shaped MC, could sit
  slightly off the line, most visibly on a tall or wide graph. It now follows the line as drawn.
  <!-- zh: **無論圖表形狀如何，沿弧形曲線的陰影及標示點都會準確貼着曲線。** 沿弧形曲線（例如 U 形
  的 MC）量度的陰影或標示點，以往可能稍為偏離曲線，在較高或較闊的圖表中尤其明顯，現在會緊貼畫出的曲線。 -->

## 0.6.0 — 2026-10-04

### Added
- **Give an essay question its own answer and marking scheme.** A structured question with
  no parts, such as a long essay, now takes a teacher answer and marking points, level
  descriptors and effective communication, as a part does. They print in the teacher
  version and the marking scheme, never in the student paper, and you can type them on
  the page in either.
  <!-- zh: **論述題可加入答案及評分方案。** 沒有分題的結構題（例如長篇論述題）現在可以像分題
  一樣加入教師答案、評分要點、等級描述及有效溝通。這些內容會印在教師版和評卷參考，不會出現在
  學生版，並可在任何一個版本的頁面上直接輸入。 -->
- **Lay out the marking scheme your way, or like an HKEAA one.** In the Marking scheme view,
  the Layout tab offers two styles: Classic (as before) and HKEAA style, with the MC key as a
  Question No. and Key table, a Marks column headed on every page, the notation legend and a
  note for markers. You can then switch the MC and long-question layouts, show question
  stems, MC explanations and totals for each question, section or the whole paper, and type
  your own title and subtitle on the page. The layout is saved with the paper, and Word, PDF
  and Copy for Word all follow it. Papers you have already made keep their key exactly as
  it was.
  <!-- zh: **按你的需要或仿照 HKEAA 編排評卷參考。** 在評卷參考檢視中，「版面」分頁提供兩種樣式：
  經典（與以往相同）和 HKEAA 評卷參考：MC 答案以「題號、答案」表格列出，每頁有分數欄，並附評分
  符號說明及閱卷聲明。你可再切換 MC 和長題目的版面，顯示題幹、MC 解說，以及每題、每部分或全卷
  的總分，並可直接在頁面上輸入自己的標題和副標題。版面會隨工作紙儲存，Word、PDF 和「複製到
  Word」都會跟從。已製作的工作紙，評卷參考保持原樣。 -->
- **Hand out suggested answers, or mark from a detailed table.** The Layout tab has two more
  styles. Suggested answers is a handout for students after the test: the answers, model
  diagrams and your marking points as plain bullets, with no marking notation, levels or
  notes for markers, and its Word file is named "Suggested answers". Detailed table lays out
  each long question as a Question, Answer, Marks and Guidance table that repeats its
  heading on every page, with levels in a table of their own, and MC answers with why the
  other options are wrong.
  <!-- zh: **派發參考答案，或以詳細表格評卷。** 「版面」分頁新增兩種樣式。「參考答案」供測驗後派發
  給學生：只列出答案、示範圖表及以要點列出的評分要點，不含評分符號、等級描述或閱卷備註，Word
  檔案名稱為「參考答案」。「詳細表格」以「題號、答案、分數、評分指引」表格列出每道長題目，每頁
  重複表頭，等級描述另列一表，MC 答案附其他選項錯誤的原因。 -->
- **Choose your own wording for terms the EDB glossary lists more than one way.** In
  Settings, Translation terms lists every such term, for example 本地生產總值 or
  國內生產總值 for GDP, and 總支出 or 總開支. Pick the one you write: AI translation and
  Check terms follow it, and the other listed wordings still count as correct. A choice
  can also apply to related terms, such as real GDP.
  <!-- zh: **為 EDB 詞彙表列出多於一種譯法的用語選擇你慣用的寫法。** 在「設定」的「翻譯用語」
  中列出所有這類用語，例如 GDP 的本地生產總值或國內生產總值，以及總支出或總開支。選擇你慣用的
  一種，AI 翻譯和檢查用詞就會跟從，其他列出的譯法仍然算作正確。你亦可把選擇同時用於相關用語，
  例如實質本地生產總值。 -->
- **Add your own translations and terms.** On any term in Settings, Translation terms,
  "Add my own…" adds a wording the EDB glossary does not list, and "Add a term" adds a term
  it does not have (with its abbreviation, such as ESG). Translation and Check terms use
  them like EDB terms. Export CSV keeps a copy or shares a department list, Import CSV shows
  what will change before you merge or replace, and backups include them.
  <!-- zh: **加入你自己的譯法和用語。** 在「設定」的「翻譯用語」中，任何用語都可按「加入我的譯法…」
  加入 EDB 詞彙表沒有列出的譯法；「加入用語」則可加入詞彙表沒有的用語（連縮寫，例如 ESG）。
  翻譯和檢查用詞會像使用 EDB 用語一樣使用它們。「匯出 CSV」可保留副本或分享科組的用語表；
  「匯入 CSV」會先顯示將有的改動，讓你選擇合併或取代。備份亦會包括這些用語。 -->
- **See, edit and print the marking scheme on screen.** Marking scheme now sits beside
  Student and Teacher. It shows the answer key on its own pages: the MC grids (one per
  version), every answer, model diagram and marking point. Click any answer or marking
  point and type, here or in the Teacher version; both show the same text. Export opens on
  the answer key from this view, and PDF now prints it.
  <!-- zh: **在畫面上查看、編輯和列印評卷參考。** 「學生版」和「教師版」旁新增「評卷參考」，
  把答案頁獨立成頁顯示：MC 答案表（每個版本一個）、所有答案、參考答案圖表和評分要點。按任何
  答案或評分要點即可輸入，在這裡或教師版修改都一樣，兩邊顯示同一段文字。在此畫面按「匯出」
  會預設評卷參考，亦可列印為 PDF。 -->
- **Preview a diagram while you draw it.** The drawing canvas has its own Edit | Preview
  switch, like the worksheet's. Preview shows the whole diagram exactly as it prints, with
  no handles, rings or hints over it, and Edit brings your tool and selection back. If the
  diagram has an answer drawn on it, switch between Student and Teacher to see each
  version; the page keeps its own setting.
  <!-- zh: **繪圖時可預覽圖表。** 繪圖畫布現有自己的「編輯 | 預覽」切換，與工作紙的一樣。
  預覽會顯示與列印完全相同的整幅圖表，不會有控點、圓圈或提示；按「編輯」即可回到原來的
  工具和所選項目。如圖表上已繪製答案，可在學生版和教師版之間切換，查看兩個版本；頁面本身
  的設定不會改變。 -->
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
- **Sections where students answer any ONE question.** Select a section and set Candidates
  answer to "Any 1 of 2" (or any number). The section's marks, the paper's full marks, the
  time estimate, the paper check and the answer key total then count only the questions a
  student can choose, not all of them. A section can also have its own target marks, which
  the paper check compares against.
  <!-- zh: **可設定「任選一題」的部分。** 選取一個部分，把「考生須作答」設為「2 題中任選 1 題」
  （或任何題數）。該部分的分數、全卷總分、估計時間、試卷檢查和答案頁的總分，便只計算學生
  可選作答的題目，而不是全部題目。每個部分亦可設定自己的目標分數，試卷檢查會加以比較。 -->
- **Choose where your list goes in the question bank.** Above the list of questions,
  "Adding to" names the paper your list will go into, and you can switch it to any of your
  worksheets, or to a new classroom worksheet, Paper 1 or Paper 2. Questions that paper
  already holds read "Already in this paper", with their number. A new Paper 1 or Paper 2
  puts each question in the section for its type, before END OF PAPER.
  <!-- zh: **在題庫中選擇清單要加到哪裏。** 題目清單上方的「加入至」會列出清單將加到的試卷，
  你可以改為任何一份工作紙，或新增課堂工作紙、Paper 1 或 Paper 2。該試卷已有的題目會標示
  「已在此工作紙」及題號。新增的 Paper 1 或 Paper 2 會把每條題目放到其題型所屬的部分，並放在
  END OF PAPER 之前。 -->
- **Topic suggestions from the question's own words.** When you tag questions one at a
  time in the question bank, the first suggestions now come from economics terms in the
  question itself, in English or 中文 (a price ceiling suggests Market intervention), read
  with the EDB glossary on your computer, no AI key needed. They are underlined with dots,
  and pointing at one shows the terms that found it.
  <!-- zh: **按題目字詞建議課題。** 在題庫逐題標記課題時，最先的建議現在來自題目本身的經濟學
  詞語，英文或中文皆可（例如「價格上限」會建議「市場干預」）。建議以本機的教育局詞彙表判斷，
  毋須 AI 金鑰。這些建議以虛線底線標示，將游標移到上面便會顯示找到的詞語。 -->
- **Seven more diagram templates, so every diagram the marking schemes ask for starts from
  one.** Monopoly with a U-shaped MC, unitary elastic demand (a curved D where the revenue
  gain equals the loss), a tax's underproduction (MB above MC at Q₁), revenue net of a tax,
  an interest rate change as a movement along Md, a smaller ceiling DWL after demand falls,
  and growth with trade, where the CPF moves out with the PPF. In the PPF trade templates,
  consumption C now sits above A (the same amount of X as before trade) and the gain from
  trade is marked. Points on a curved line now sit exactly on the line you see.
  <!-- zh: **新增七個圖表範本，評分參考要求的每種圖表都有範本可用。** U 形邊際成本的壟斷、單一
  彈性需求（曲線 D，收入增加等於減少）、稅項引致的生產不足（在 Q₁ MB 高於 MC）、扣除稅款後的
  收入、利率變動即沿 Md 移動、需求下降後較小的價格上限效率損失，以及經濟增長與貿易（CPF 隨 PPF
  外移）。在 PPF 貿易範本中，消費點 C 現位於 A 的正上方（X 的數量與貿易前相同），並標示貿易得益。
  位於曲線的點現在與你看到的曲線完全吻合。 -->

### Changed
- **The paper check now warns when a marking scheme does not add up.** Before you export,
  it lists the questions whose marking scheme awards a different total from the marks
  printed on the paper. Before, you only saw this in the question's marking scheme panel.
  <!-- zh: **試卷檢查現會提示評分方案總分不符。** 匯出前，試卷檢查會列出評分方案總分與試卷印出
  分數不同的題目。以往只在該題的評分方案面板才看得到。 -->
- **A larger Settings window.** Settings now fills most of your screen, so Translation
  terms shows far more terms at once and the import preview has room to breathe. On a
  big monitor it stops growing at a comfortable size.
  <!-- zh: **「設定」視窗更大。** 「設定」現在佔用大部分屏幕，「翻譯用語」可一次顯示更多
  用語，匯入預覽亦更寬裕。在大屏幕上，視窗到了合適大小便不再放大。 -->
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
- **Looking at a question keeps your "Add to" paper.** In the question bank, opening a
  question in its worksheet just to look at it no longer changes the paper that "Add to"
  puts your picks in. Come back, and "Add to" still names the paper you chose.
  <!-- zh: **查看題目不會改變「加到」的工作紙。** 在題庫中開啟題目所在的工作紙查看，不會再改變
  「加到」放入所選題目的工作紙。返回題庫後，「加到」仍是你原先選定的工作紙。 -->
- **A large question bank stays quick to save on the desktop app.** Each worksheet's share
  of the question bank is kept in a small file of its own, so saving one paper writes only
  that file.
  <!-- zh: **桌面版中，大型題庫亦能快速儲存。** 每份工作紙在題庫中的資料各自存放在一個小檔案，
  儲存一份工作紙只會寫入該檔案。 -->
- **Check terms says how many terms already match.** The bar now reads, for example,
  "1 to fix · 12 match", and "12 terms match the EDB glossary" when nothing needs fixing.
  If the text uses no glossary term at all, it says so.
  <!-- zh: **「檢查用詞」會顯示有多少用詞已經一致。** 工具列現在會顯示例如「1 個需修正 · 12 個
  相符」；沒有需要修正的用詞時，會顯示「12 個用詞與 EDB 詞彙表一致」。如文字沒有用上詞彙表
  的任何用詞，也會說明。 -->

### Fixed
- **Consumer and producer surplus shade right up to the price axis.** In the "Consumer and
  producer surplus" graph and the TSS loss graph, the curves stopped just short of the price
  axis, so a thin unshaded strip was left beside it. The curves now start on the axis
  and the shading reaches it. Graphs you have already added keep their shape.
  <!-- zh: **消費者及生產者盈餘的陰影伸展至價格軸。** 在「消費者及生產者盈餘」圖表和總社會盈餘損失
  圖表中，曲線在價格軸前停下，軸旁留有一條沒有陰影的窄帶。現在曲線由價格軸開始，
  陰影亦伸展至軸上。已加入的圖表保持原狀。 -->
- **Q_A on the import quota diagram stays on the quota.** It is now a ←→ arrow under the
  flat step at the world price, so it moves and stretches with S, Pw and the size of the
  quota instead of staying where it was first drawn.
  <!-- zh: **進口配額圖中的 Q_A 會跟隨配額。** Q_A 現在是世界價格水平段下方的 ←→ 箭頭，會隨 S、Pw
  及配額大小移動和伸縮，不再停留在原來的位置。 -->
- **The arrow from "Shift a copy" follows the curves.** Move the original curve and the
  arrow moves with it and its copy; move the copy further and the arrow stretches. You can
  still drag the whole arrow somewhere clearer, and dragging one of its ends places it by
  hand.
  <!-- zh: **「平移副本」的箭頭會跟隨曲線。** 移動原曲線時，箭頭會隨它和副本一起移動；把副本移得更遠，
  箭頭亦會伸長。你仍可把整支箭頭拖到較清楚的位置；拖曳箭頭的一端則改為自行擺放。 -->
- **The CPF label no longer lands on the y-axis.** Dragging production point B up a curved
  PPF used to push the CPF's name onto the axis. It now sits just inside the graph, above
  the line.
  <!-- zh: **CPF 標示不再壓在 y 軸上。** 以往把生產點 B 沿弧形 PPF 向上拖，CPF 的名稱會被推到軸上。
  現在它會放在圖內、線的上方。 -->
- **The diagram drawing toolbar fits on one row on a laptop screen.** On narrower windows,
  Copy, Paste, Duplicate and Delete sit in one ⋯ menu, the tools show their icons with the
  names in the tooltip, and the Span tool's style and position choices appear over the
  drawing. Every control is still there.
  <!-- zh: **圖表繪製工具列在手提電腦的畫面上可放在同一行。** 視窗較窄時，複製、貼上、建立副本和刪除
  會收進一個 ⋯ 選單，工具只顯示圖示（名稱見提示），跨距工具的樣式和位置選項則顯示在圖上方。所有
  控制項仍然可用。 -->
- **A question now starts on the page it starts on in Word.** When a question did not fit the
  rest of a page, the page on screen and the PDF moved all of it to the next page, while Word
  started it where it was and carried on overleaf. They now break it at the same place as
  Word, and a heading or a last part that Word keeps with the next question moves with it.
  A Paper 1 question too long for one page no longer runs off the bottom of the page.
  <!-- zh: **題目現在與 Word 在同一頁開始。** 以往題目放不進該頁餘下的位置時，畫面和 PDF 會把整題移到下一頁，
  而 Word 則在原頁開始、再續到下一頁。現在兩者在同一位置分頁；Word 會與下一題連在一起的標題或最後一個分題，
  亦會一同移頁。Paper 1 中長過一頁的題目，不再超出頁底。 -->
- **On a paper with a cover, the page-1 header shows where Word prints it.** With the page 1
  header or footer set to Nothing or Its own, Word applies it to the first page after the
  cover, but the screen and the PDF showed the usual header there. They now match Word, a
  blank page 1 no longer prints a line across the top, and the setting says which page it
  means.
  <!-- zh: **設有封面的試卷，第 1 頁頁首的位置與 Word 一致。** 第 1 頁頁首或頁尾設為「不印」或「獨立設定」時，
  Word 會套用於封面後的第一頁，但畫面和 PDF 在該頁仍顯示一般頁首。現在兩者與 Word 一致；第 1 頁不印頁首時，
  頂部不再印出橫線；設定亦會註明所指的是哪一頁。 -->
- **Empty header and footer rows no longer print blank lines in Word.** A row you added and
  left empty shows nothing on the page, but the Word file printed it as a blank line, so a
  teacher version could open with two or more empty lines above "Teacher Version". Word now
  leaves such rows out, as the page and the PDF do.
  <!-- zh: **空白的頁首及頁尾行不再在 Word 印出空行。** 加入後留空的行在頁面上不會顯示，但 Word 檔案會把它印成空行，
  教師版因此可能在「Teacher Version」上方多出兩行或以上的空行。現在 Word 與頁面及 PDF 一樣略去這些行。 -->
- **Undo after changing a question's topics undoes it in every worksheet.** A topic change
  in the Topics row also updates the same question in your other worksheets. ⌘Z used to
  take it back in the open paper only, so the bank kept showing the change. Now ⌘Z takes
  it back everywhere, and ⇧⌘Z puts it back everywhere. A copy whose topics you changed
  again in the meantime keeps your newer topics, and the Topics row names it.
  <!-- zh: **更改題目課題後按復原，所有工作紙都會一併復原。** 在「課題」列更改課題，會同時更新
  其他工作紙中的同一題目。以往按 ⌘Z 只會復原目前開啟的工作紙，題庫仍顯示更改後的課題。現在
  ⌘Z 會在所有工作紙復原，⇧⌘Z 會在所有工作紙重做。期間再次更改過課題的副本會保留較新的課題，
  「課題」列會列出該工作紙。 -->
- **Topics set in one browser tab are no longer lost to a paper open in another.** If you
  tag questions in the 題庫 while the same paper is open in a second tab, that tab now
  picks up the new topics and keeps them when it saves, and a tag change no longer saves
  over an edit the other tab made a moment before.
  <!-- zh: **在一個瀏覽器分頁設定的課題，不會再被另一分頁開啟的同一工作紙覆蓋。** 在題庫為題目
  加上課題時，如同一份工作紙在另一分頁開啟，該分頁現在會接收新課題並在儲存時保留；更改課題
  亦不會再覆蓋另一分頁剛作出的修改。 -->
- **The question bank stays quick with thousands of questions.** The list beside a question
  scrolls and moves with the arrow keys smoothly however long it is. The desktop app opens
  the 題庫 from one saved file instead of reading a file for every worksheet, and changing
  topics across many worksheets, or typing in a long paper, no longer makes the bank
  refresh again and again.
  <!-- zh: **題庫有數千條題目時仍然流暢。** 題目旁的清單無論多長，捲動及用方向鍵移動都很順暢。
  桌面版開啟題庫時只需讀取一個已儲存的檔案，不必逐份工作紙讀取；在多份工作紙更改課題，
  或在長篇試卷中輸入內容，題庫亦不會再反覆重新整理。 -->
- **The teacher version says so at the top of every page, on screen and in the PDF.** Word
  already printed "Teacher Version / 教師版" in the header of each page. The page and the
  PDF now print it there too, after your own header text, and leave page 1 without it when
  page 1 has no header or its own. The questions stay where they were. A teacher version
  whose header is switched off no longer prints that header's hidden text in Word.
  <!-- zh: **教師版每頁頂部都會註明，畫面和 PDF 亦然。** Word 一向在每頁頁首印上「Teacher Version / 教師版」。
  現在頁面和 PDF 亦會在頁首、你自己的頁首文字之後印出；如第 1 頁沒有頁首或另有頁首，第 1 頁便不印。
  題目位置不變。關閉了頁首的教師版，Word 檔案不再印出該頁首隱藏的文字。 -->
- **Fill missing no longer translates image descriptions.** With "Include answers and mark
  schemes" on, Fill missing 中文 or English also sent the alt text of pictures and
  diagrams, so it counted more texts than the ✦ AI badge. It now covers answers and
  marking schemes only, and the two counts match. You can still fill a picture's
  description from its own field.
  <!-- zh: **「補上缺少的中文／英文」不再翻譯圖片描述。** 開啟「翻譯時包括答案和評卷參考」後，
  補上語言時亦會一併送出圖片和圖表的替代文字，因此數目比 ✦ AI 標記多。現在只包括答案和評卷
  參考，兩個數目一致。圖片描述仍可在它自己的欄位補上。 -->
- **A bilingual paper with one language missing is as long on screen as in Word.** When a
  title, question or option has English but no 中文 (or the other way round), the "Add 中文"
  prompt now sits at the end of the line instead of on a line of its own. The page and the
  PDF no longer gain a blank line there, so they break where Word does. Click the prompt to
  add the missing language, as before.
  <!-- zh: **缺少一種語言的雙語試卷，在畫面上與 Word 一樣長。** 若標題、題目或選項只有英文而沒有
  中文（或相反），「加入中文」提示現在會放在該行末端，而不再自佔一行。頁面和 PDF 不再因此多出
  空行，分頁位置與 Word 一致。按提示即可如常加入缺少的語言。 -->
- **A question bank saved in version 0.5.0 lists as a bank again.** If a bank was last
  saved with 0.5.0, the start screen showed it as a worksheet. It now shows as a bank
  straight away, without opening or saving it.
  <!-- zh: **以 0.5.0 版儲存的題庫會再次顯示為題庫。** 若題庫最後是以 0.5.0 版儲存，開始畫面會
  把它顯示為工作紙。現在無須開啟或儲存，它會即時顯示為題庫。 -->
- **The version letter prints once at the top of page 1.** With versions on, "Version B"
  above question 1 repeated the header's "Version B" on the same page. It now prints above
  question 1 only when "Header on page 1" is set to Nothing or Its own, so page 1's header
  does not show it. The page, the PDF and Word agree. Copy for Word still includes it.
  <!-- zh: **版本字母在第 1 頁頂部只印一次。** 開啟版本後，第 1 題上方的「版本 B」與同頁頁首的
  「版本 B」重複。現在只在「第 1 頁頁首」設為「不印」或「獨立設定」、第 1 頁頁首沒有版本時，才在第 1 題
  上方印出；畫面、PDF 和 Word 一致。「複製到 Word」仍會包括它。 -->
- **Every page of a paper version says which version it is.** With versions on, "Version B"
  now prints in the header of every page, not only above question 1, so a loose sheet
  still shows its version. It sits under your own header, or on its own if the paper has
  none. Papers without versions are unchanged.
  <!-- zh: **試卷每個版本的每一頁都標明版本。** 開啟版本後，「版本 B」會印在每頁的頁首，而不只
  在第 1 題上方，即使散頁也能看出屬哪個版本。它位於你自訂的頁首之下；若試卷沒有頁首，則
  單獨列出。沒有版本的試卷不受影響。 -->
- **The MCQ panel lists options in the order the page shows.** Viewing Version B, the
  options, the correct answer and the rationale rows in the side panel now follow Version
  B's order and letters, so A on the panel is A on the page.
  <!-- zh: **MCQ 面板的選項次序與頁面相同。** 檢視版本 B 時，側面板的選項、正確答案和解說
  列，現在都按版本 B 的次序和字母排列，面板上的 A 就是頁面上的 A。 -->
- **Export counts the pages of the paper you are about to export.** The paper check at the
  top of Export now adds the page count, and it follows the language, copy and version you
  choose there. Editing in EN+中 and exporting English, it says how long the English paper
  is, not the bilingual one on screen. The check of one-language text follows that choice
  too.
  <!-- zh: **匯出時會計算你即將匯出的試卷頁數。** 匯出視窗頂部的試卷檢查現在會列出頁數，並按你在
  該處選擇的語言、學生或教師版及版本計算。以 EN+中 編輯而匯出英文版時，顯示的是英文試卷的
  頁數，而不是畫面上雙語版的頁數。檢查只有一種語言的文字，亦按該選擇進行。 -->
- **A versioned answer key letters each explanation as that version prints it.** When
  options are shuffled, the key now gives every version its own explanations, with each
  option's rationale under the letter it has in that version, instead of one list in
  Version A's letters.
  <!-- zh: **有版本的答案頁，解說按各版本的字母列出。** 選項打亂後，答案頁現在為每個版本分別
  列出解說，每個選項的解說都用它在該版本的字母，而不是只按版本 A 的字母列一次。 -->
- **A Teacher Word file with no header text no longer starts its header with a stray
  dash.** It now prints "Teacher Version" on its own. A header with your own text still
  shows that text, then the dash, then "Teacher Version".
  <!-- zh: **沒有頁首文字的教師版 Word 檔案，頁首不再以多餘的破折號開頭。** 現在只印
  「Teacher Version」。有自訂文字的頁首，仍會在你的文字後加上破折號和「Teacher Version」。 -->
- **The margin note on a bilingual booklet now matches on screen and in Word.** "Answers
  written in the margins will not be marked" showed only in English on screen but stacked
  English over 中文 in Word, squeezed into a strip too narrow for both. Both now print
  English and 中文: two lines down each side margin, and one line along the bottom.
  <!-- zh: **雙語答題簿的邊界提示，在屏幕和 Word 中現在一致。** 「寫於邊界以外的答案，將不予
  評閱。」在屏幕上只顯示英文，在 Word 中卻把英文和中文擠在過窄的位置。現在兩者都印出英文和
  中文：左右邊界各兩行，底部一行。 -->
- **A bilingual Paper 2 cover fits on one page.** With English and 中文 stacked, the
  instructions ran off the bottom of the cover on screen and onto a second page in Word.
  A bilingual cover now uses less space between its lines, and the cover's two columns
  always fit inside the page margins, so it fits on one page everywhere, on any margins.
  On margins wider than the booklet's, the name and class panel's column is slightly
  narrower; covers are otherwise unchanged.
  <!-- zh: **雙語 Paper 2 封面可印在一頁內。** 英文和中文並列時，考生須知曾超出封面底部，在 Word
  中更會跑到第二頁。雙語封面現在行與行之間的空位較少，封面的兩欄亦一定在頁邊界之內，因此無論
  邊界大小，在任何地方都能印在一頁內。邊界比答題簿闊時，填寫姓名和班別的一欄會稍窄；封面其他
  部分不變。 -->
- **A page no longer ends one line early.** A page that starts with a heading or a closing
  line, such as Section B or END OF SECTION B, kept room for a gap that never prints at the
  top of a page. On screen and in the PDF, the last line could then move to a page of its
  own while Word fitted it, and a booklet's last page could get one answer line too few.
  <!-- zh: **頁面不再提早一行結束。** 以標題或結束語（例如 Section B 或 END OF SECTION B）開始
  的頁面，曾為一段不會在頁頂印出的空位預留位置。結果在屏幕和 PDF 上，最後一行可能被移到新的
  一頁，Word 卻放得下；答題簿最後一頁的答題線亦可能少一行。 -->

- **The year code in a bilingual cover's corner prints once.** A cover line that reads the
  same in English and 中文, like "2026-27", printed twice on a bilingual paper. It now
  prints once, on screen, in the PDF and in Word, and editing it changes both languages.
  <!-- zh: **雙語封面角落的年份編號只印一次。** 英文和中文相同的封面文字，例如「2026-27」，
  在雙語試卷上曾印兩次；現在在屏幕、PDF 和 Word 中都只印一次，修改時兩種語言一併更新。 -->
- **In the HKEAA marking scheme, a point's marks now sit on its first line.** A point that
  runs onto a second line shows its "(1)" beside where it starts, as HKEAA prints it, on
  screen, in the PDF and in Word.
  <!-- zh: **HKEAA 評卷參考中，評分要點的分數現在列在首行。** 要點跨越兩行時，「(1)」會列在要點
  開首的一行，與 HKEAA 的格式相同，在屏幕、PDF 和 Word 中都一樣。 -->
- **The HKEAA marking scheme numbers its model answer diagrams.** Each one is captioned
  "Figure 1", "Figure 2" and so on, after its marking points, which are headed "Indicate in
  Figure 1:" as in an HKEAA scheme.
  <!-- zh: **HKEAA 評卷參考為示範答案圖表編號。** 每幅圖表標上「圖1」、「圖2」等，列在評分要點之後，
  要點以「在圖1中顯示：」開首，與 HKEAA 評卷參考相同。 -->
- **A combined answer key prints each paper at its own size.** When Export joins several
  papers' keys in one Word file, each part now keeps its own paper's page size, margins,
  fonts and text size, so a 10pt Paper 2 key stays 10pt after an 11pt worksheet's.
  <!-- zh: **合併的評卷參考，每份試卷按其本身的大小列印。** 匯出時把多份試卷的評卷參考合併成一個
  Word 檔案，每部分現在會保留該試卷的紙張大小、邊界、字型和字體大小，10pt 的 Paper 2 評卷參考
  排在 11pt 的工作紙之後，仍保持 10pt。 -->
- **Pages with diagrams or pictures now break where Word breaks them.** On screen each
  figure took up nearly a line more than in the Word file, most visibly in the Marking
  scheme view, so a page could end two lines early.
  <!-- zh: **含圖表或圖片的頁面，現在與 Word 在同一位置分頁。** 以往每幅圖在屏幕上比 Word 檔多佔
  差不多一行，在評卷參考檢視中尤其明顯，令頁面可能提早兩行分頁。 -->
- **Papers using newer features warn you in an older version of the app.** A paper with
  answers drawn on a diagram, a marking scheme layout other than Classic, a section where
  students answer any ONE question, an essay question with its own answer or marking
  scheme, or an import quota diagram whose step follows Pw now opens read-only in versions 0.4 and 0.5, with a note to update first. Those
  versions cannot hide those answers from the student copy, follow the layout, total such a
  section correctly or print an essay's answer, and can no longer save over the paper. Every
  other paper, including one with topics, classes or a section's own target marks, still
  opens and edits there as before.
  <!-- zh: **使用新功能的工作紙，在舊版程式中會提示你。** 在圖表上繪有答案、評卷參考版面並非
  「經典」、設有「任選一題」的部分，論述題設有自己的答案或評分方案，或含跟隨 Pw 的進口配額圖表的工作紙，在 0.4 和 0.5
  版中會以唯讀方式開啟，並提示先更新。這些版本無法在學生版中隱藏這些答案、跟從評卷參考版面、
  正確計算這類部分的總分，或印出論述題的答案，而且不能再覆寫這份工作紙。其他工作紙（包括設有
  課題、班別或部分自訂目標分數的）在這些版本中照常開啟和編輯。 -->
- **Click an MC answer in the Marking scheme view to select its question**, as you can with
  a long question's answer. The question's number and key are tinted and its settings open
  in the sidebar.
  <!-- zh: **在評卷參考檢視中按一下 MC 答案，即可選取該題**，與長題目的答案一樣。該題的題號和
  答案會以顏色標示，側欄顯示其設定。 -->
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
- **Changing topics in the question bank never brings a paper back from Trash.** A topic
  change that reached a copy in a paper you had just moved to Trash, or hidden from the
  bank, could save into it. Those papers are now left as they are, and the bank says why.
  <!-- zh: **在題庫更改課題，不會再把工作紙從垃圾桶救回。** 若課題更改涉及一份剛移到垃圾桶
  或已在題庫隱藏的工作紙中的副本，以往可能會儲存到該工作紙。現在這些工作紙會保持原樣，
  題庫亦會說明原因。 -->
- **✦ AI in the question bank marks text with bold or italic words inside it.** When you
  review a fill or a term check, the paper now highlights a sentence or term even where
  part of it is formatted differently. It used to stay unmarked.
  <!-- zh: **題庫的 ✦ AI 會標示夾有粗體或斜體字的文字。** 檢視填補或用詞檢查結果時，即使句子或
  用語中有部分格式不同，頁面現在亦會把它標示出來。以往這些文字不會被標示。 -->
- **⌘J (Ctrl+J on Windows) opens ✦ AI in the question bank too.** On a topic's page, the
  shortcut opens the ✦ AI menu, as it does in a worksheet.
  <!-- zh: **在題庫中亦可按 ⌘J（Windows 為 Ctrl+J）開啟 ✦ AI。** 在課題頁面按此快捷鍵，會開啟
  ✦ AI 選單，與在工作紙中一樣。 -->
- **"Update bank copy" keeps newer topics.** If the bank's copy had its topics changed
  after your worksheet's (for example in another tab), updating it now brings in your new
  wording but keeps those newer topics. The parts of a long question also stay matched to
  the bank's, so part-by-part topics still line up.
  <!-- zh: **「更新題庫副本」會保留較新的課題。** 若題庫副本的課題在你的工作紙之後才改動（例如在
  另一個分頁），更新時現在會帶入你的新內容，但保留那些較新的課題。長題目的各部分亦會與題庫
  的保持對應，逐部分設定的課題仍然一致。 -->
- **The 題型 page says when its list can't be saved.** If your 題型 list was saved by a
  newer version of Econ Studio, the 題型 page and the 題型 picker now say that changes to
  the list are not saved here, instead of seeming to save them.
  <!-- zh: **題型清單無法儲存時，題型頁面會說明。** 若你的題型清單由較新版本的 Econ Studio
  儲存，題型頁面和題型選擇器現在會說明在這裏對清單所作的修改不會儲存，而不會看似已經儲存。 -->
- **Tick boxes no longer glare in dark mode.** The tick boxes in the question bank (and
  elsewhere in the app) now draw dark to match the dark panels, with ticked ones in the
  accent colour.
  <!-- zh: **深色模式下的剔選方格不再刺眼。** 題庫（以及程式其他地方）的剔選方格現在以深色顯示，
  與深色面板一致，已剔選的方格則以強調色顯示。 -->
- **Older long questions keep "Set on the whole question".** A long question whose topics
  were set on the whole question, with copies in two or more worksheets, showed each part's
  topics as set on that part. Its Topic row now says they are set on the whole question.
  <!-- zh: **較舊的長題目會保留「已設定於整條題目」。** 課題設定於整條題目、並在兩份或以上工作紙有
  副本的長題目，以往會把每個分題的課題顯示為該分題自己的設定。現在課題列會說明課題設定於整條題目。 -->
- **Edit topics says which sub-parts have their own topics.** In the question bank's Edit
  topics, a sub-part with its own list now reads "Its own" in the part column, as the
  worksheet's Topic row does.
  <!-- zh: **編輯課題時會標明哪些小分題另設課題。** 在題庫編輯題目的課題時，另設課題的小分題現在會在
  分題欄顯示「另設課題」，與工作紙的課題列一致。 -->
- **The question list no longer hides the question you step to.** Moving up the list in
  the question bank with ↑ could leave the chosen question half under a topic's heading at
  the top. It now stops just below the heading.
  <!-- zh: **題目清單不會再遮住你移到的題目。** 以往在題庫按 ↑ 向上移動時，選中的題目可能有一半被
  頂部的課題標題遮住。現在會停在標題之下。 -->
- **Check terms' bar keeps up with your fixes.** After you replace a term from its card,
  the bar's count and its Replace button update straight away, instead of still offering
  the term you just fixed until you pressed Done.
  <!-- zh: **「檢查用詞」的工具列會即時更新。** 在卡片上取代一個用詞後，工具列的數目和「取代」
  按鈕會立即更新，不會再在你按「完成」之前，仍然顯示剛修正的用詞。 -->
- **When your AI balance runs out, the button opens the page where you add credit.** For
  Gemini, DeepSeek, OpenRouter, OpenAI and Claude it used to open the API key page. Qwen
  still opens the Model Studio console.
  <!-- zh: **AI 帳戶餘額不足時，按鈕會開啟增值的頁面。** Gemini、DeepSeek、OpenRouter、OpenAI 和
  Claude 以往會開啟 API key 頁面。Qwen 仍會開啟 Model Studio 控制台。 -->
- **DWL and TR on a diagram get their 中文.** A shaded area or a text label that reads just
  DWL or TR used to print in English on the 中文 paper, and Fill missing 中文 skipped it. It
  now fills in 效率損失 or 總收入 from the EDB glossary (or the wording you chose in
  Translation terms), and the ✦ AI count includes it. A new "DWL of a tax" area starts
  with 效率損失, like the other DWL areas. Curve and point letters such as D, S and E stay as
  they are.
  <!-- zh: **圖表上的 DWL 和 TR 會有中文。** 以往只寫著 DWL 或 TR 的陰影區域或文字標示，在中文試
  卷上會印出英文，「補上缺少的中文」也會略過。現在會按 EDB 詞彙表（或你在「翻譯用語」中選用的
  寫法）填上效率損失或總收入，✦ AI 的數目亦會計算在內。新加入的「稅項的效率損失」區域會以效率損
  失開始，與其他效率損失區域一致。D、S、E 等曲線和點的字母則保持不變。 -->
- **Translation terms you edited in Excel import with their Chinese.** Excel on a Hong Kong
  Windows computer saves a plain CSV in Big5, which used to import as garbled characters.
  Import CSV now reads it, and a backup you unzipped and zipped again still restores your
  terms.
  <!-- zh: **在 Excel 編輯過的翻譯用語，匯入時中文不會變亂碼。** 香港 Windows 電腦上的 Excel 以
  Big5 儲存一般 CSV，以往匯入後會變成亂碼。現在「匯入 CSV」可以讀取；解壓後再壓縮的備份，亦能還
  原你的用語。 -->
- **Clicking a row of a label list opens it in the Edit tab.** Clicking "Name:" or its
  value on the page used to leave the sidebar where it was. Now the Edit tab shows the
  list with that row marked, as it does for every other element.
  <!-- zh: **按標籤清單的一行，「編輯」分頁會顯示該清單。** 以往在頁面上按「姓名：」或其內容，
  側欄不會轉變。現在「編輯」分頁會顯示該清單並標示該行，與其他元素一樣。 -->
- **You can see where you are typing in an empty box.** Opening an empty table cell, answer
  or option showed no blinking cursor until the first letter appeared, in Chrome and Safari.
  The cursor now shows straight away, drawn in black so it stands out from the blue outline.
  <!-- zh: **在空白欄位中也看到輸入位置。** 以往開啟空白的表格儲存格、答案或選項時，在 Chrome
  和 Safari 中要輸入第一個字才會出現閃動的游標。現在游標會即時顯示，並以黑色繪畫，與藍色外框
  分得清楚。 -->
- **Undo waits while you resize on the page.** Pressing ⌘Z (or Ctrl+Z) while dragging a
  picture's, diagram's or answer space's handle used to change the paper under the drag.
  Now it does nothing until you let go, and Esc still cancels the resize.
  <!-- zh: **在頁面上調整大小時，復原會暫停。** 拖曳圖片、圖表或答題空間的控點時按 ⌘Z（或
  Ctrl+Z），以往會在拖曳途中改動試卷。現在放手之前不會有任何動作，按 Esc 仍可取消調整。 -->
- **Drawing a diagram, the tools fit on one row on a 13-inch or 14-inch laptop.** Zoom,
  Crop and Done no longer drop to a second row, so the diagram gets that room back. The
  tip for the tool you are using now shows above the diagram, and shortcuts such as ⌘C
  show when you point at Copy, Paste, Duplicate and Delete.
  <!-- zh: **繪製圖表時，工具在 13 吋或 14 吋手提電腦上可排成一行。** 縮放、裁剪和完成不再跌到
  第二行，圖表因此有更多空間。目前所用工具的提示現在顯示在圖表上方；把游標移到複製、貼上、建立
  副本和刪除上，便會顯示 ⌘C 等快捷鍵。 -->
- **"Shift a copy" now makes a curve that follows the original**, as the ready-made
  diagrams do. Move D and D₁ moves with it, and the new equilibrium stays where D₁ meets S.
  Drag D₁ itself to change how far it shifted, or choose "Detach: keep it where it is" to fix it in place.
  <!-- zh: **「平移副本」現在會建立跟隨原曲線的曲線**，與現成圖表一樣。移動 D 時 D₁ 會一起移動，
  新均衡點保持在 D₁ 與 S 的交點。拖曳 D₁ 本身可改變平移幅度，或選擇「分離：保持在原位」把它固定。 -->
- **A point on a PPF stays on it when you drag it.** Drag A or B in the PPF diagrams and it
  slides along the frontier, and the CPF and the export and import brackets follow. Choose
  "Detach: keep it where it is" first to move it off the curve.
  <!-- zh: **拖曳 PPF 上的點時，點不會離開曲線。** 在 PPF 圖表中拖曳 A 或 B，點會沿生產可能
  曲線滑動，CPF 及出口和進口括號亦會跟著移動。如要把點移離曲線，請先選擇「分離：保持在原位」。 -->
- **Arrow keys move a selected point, label or line end by a small step.** They used to send
  it to the bottom-left corner of the diagram.
  <!-- zh: **方向鍵會把選取的點、標示或線段端點移動一小步。** 以往會把它移到圖表的左下角。 -->
- **Stacked gap arrows no longer crowd in English and 中文.** In "Gap narrows", the label
  gap₁ / 缺口₁ takes two lines, and the gap₀ arrow under it used to run through the second.
  An arrow stacked under another now moves down by each extra line, on screen, in the PDF
  and in Word.
  <!-- zh: **中英並列時，上下排列的缺口箭嘴不再擠在一起。** 在「缺口收窄」中，gap₁ / 缺口₁ 標示
  佔兩行，其下的缺口₀ 箭嘴以往會穿過第二行。現在排在另一箭嘴下方的箭嘴，會按每多出的一行向下
  移，在屏幕、PDF 和 Word 中都一樣。 -->
- **Shade a tax on a flat demand curve.** A horizontal line named D (perfectly elastic
  demand) now counts as demand in the Shade menu, so tax revenue, the sellers' burden and
  the deadweight loss shade as they do on a falling D.
  <!-- zh: **需求曲線為水平時，也可為稅項加陰影。** 名為 D 的水平線（完全有彈性的需求）現在在
  「陰影」選單中會被視為需求曲線，稅收、賣方稅負和效率損失都可以與向下傾斜的 D 一樣加上陰影。 -->
- **In the import quota diagrams, the quota step follows Pw.** Move Pw, or S, and "S with
  quota" keeps its step at the new world price, the quota wide, with the domestic price
  following it. Papers with these diagrams open read-only in versions 0.4 and 0.5.
  <!-- zh: **在進口配額圖表中，配額的一段會跟隨 Pw。** 移動 Pw 或 S 時，「有配額的供應」的水平段
  會保持在新的世界價格，長度等於配額，本地價格亦會跟著改變。含這些圖表的工作紙在 0.4 和 0.5 版
  中會以唯讀方式開啟。 -->
- **Pie chart hatching and dots print in solid black in the PDF.** They used to come out
  a faint grey, which a photocopy could lose.
  <!-- zh: **圓形圖的斜線和圓點在 PDF 中以實黑色印出。** 以往會印成淺灰色，影印時可能看不清。 -->

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
