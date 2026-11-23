import { defineMessages } from '@/i18n/catalogue';

/**
 * The chat studio's words (k-0516): the chat on the left, the live paper on the right, the
 * saved chats. English and Hong Kong 繁體中文. Shared words (Key, Harder, Add to…) stay in
 * `../messages.ts`; what the checks found is `../findings.messages.ts`. Syllabus names are
 * paper words and follow the drafts' language, never these.
 */
export const STUDIO_CHAT_MESSAGES = defineMessages({
  // header
  chats: { en: 'Chats', zh: '對話' },
  chatsLabel: { en: 'Saved chats', zh: '已儲存的對話' },
  chatsEmpty: { en: 'No saved chats yet. Chats are kept on this computer.', zh: '暫時未有已儲存的對話。對話只會儲存在這部電腦。' },
  chatsNote: { en: 'Kept on this computer.', zh: '只儲存在這部電腦。' },
  newChat: { en: 'New chat', zh: '新對話' },
  untitled: { en: 'New chat', zh: '新對話' },
  likeTitle: { en: (label: string) => `Like ${label}`, zh: (label: string) => `仿照 ${label}` },
  chatMeta: {
    en: (drafts: number, added: number) => `${drafts} draft${drafts === 1 ? '' : 's'}${added ? `, ${added} added` : ''}`,
    zh: (drafts: number, added: number) => `${drafts} 份草稿${added ? `，已加入 ${added} 題` : ''}`,
  },
  deleteChat: { en: 'Delete this chat', zh: '刪除這個對話' },
  deleteChatAsk: { en: 'Delete this chat and its drafts? Questions you already added stay in your papers.', zh: '刪除這個對話及其草稿？已加入試卷的題目會保留。' },

  // welcome
  studio: { en: 'Studio', zh: '擬題' },
  welcomeTitle: { en: 'What shall we write?', zh: '想擬甚麼題目？' },
  welcomeBody: {
    en: 'Pick any past-paper question, or just say what you need. I read the question and its diagram, and pick the syllabus key point myself.',
    zh: '揀選任何一條歷屆試題，或直接說出你的需要。我會閱讀題目及其圖表，並自行選取課程的學習要點。',
  },
  startPick: { en: 'Pick a past-paper question', zh: '揀選歷屆試題' },
  startPickHint: { en: 'Browse the Past paper bank by topic or year', zh: '按課題或年份瀏覽歷屆試題庫' },
  startDescribe: { en: 'Describe what you need', zh: '說出你的需要' },
  startDescribeHint: { en: '“3 MC on unit tax with a diagram, harder than DSE”', zh: '「3 條有圖的從量稅 MC，比 DSE 難」' },
  describeExample: { en: '3 MC on unit tax with a diagram, a bit harder than DSE', zh: '3 條有圖的從量稅 MC，比 DSE 稍難' },

  // composer
  placeholder: { en: 'Ask for questions, or say what to change…', zh: '要求擬題，或說明要修改甚麼…' },
  placeholderDraft: { en: (n: number) => `What should change in draft ${n}?`, zh: (n: number) => `草稿 ${n} 要怎樣修改？` },
  message: { en: 'Message', zh: '訊息' },
  addReference: { en: 'Reference', zh: '參考題' },
  addReferenceTitle: { en: 'Add a past-paper question to write like (up to 3)', zh: '加入一條歷屆試題作參考（最多 3 條）' },
  removeReference: { en: (label: string) => `Remove ${label}`, zh: (label: string) => `移除 ${label}` },
  withDiagram: { en: 'with its diagram', zh: '連圖表' },
  draftChip: { en: (n: number) => `Draft ${n}`, zh: (n: number) => `草稿 ${n}` },
  removeDraftChip: { en: 'Not about this draft', zh: '不是關於這份草稿' },
  settings: { en: 'How many, level, language', zh: '數量、程度、語言' },
  settingsSummary: { en: (count: number, level: string, language: string) => `${count} · ${level} · ${language}`, zh: (count: number, level: string, language: string) => `${count} 題 · ${level} · ${language}` },
  levelSameLong: { en: 'Same level', zh: '相同程度' },
  settingsNote: { en: 'None of this is required: you can also say it (“make 5, in Chinese”).', zh: '以上都不是必須的：你也可以直接說（「擬 5 題，用中文」）。' },
  send: { en: 'Send', zh: '傳送' },
  stop: { en: 'Stop', zh: '停止' },
  likeThis: { en: (n: number) => `Write ${n} like this.`, zh: (n: number) => `仿照這題擬 ${n} 題。` },
  full: { en: 'You can use up to 3 reference questions.', zh: '最多可用 3 條參考題。' },

  // the AI's steps
  stepRead: { en: (labels: string) => `Read ${labels}: its words and its diagram`, zh: (labels: string) => `已閱讀 ${labels}：文字及圖表` },
  stepPicking: { en: 'Picking the syllabus key point…', zh: '正在選取學習要點…' },
  stepPicked: { en: 'Picked', zh: '已選取' },
  stepKeyPoint: { en: 'Key point', zh: '學習要點' },
  byYou: { en: 'you chose it', zh: '由你選取' },
  byComputer: { en: 'matched on this computer', zh: '在這部電腦配對' },
  because: { en: 'Why:', zh: '原因：' },
  basisTag: { en: (label: string) => `it is what ${label} tests (its tag in the Past paper bank).`, zh: (label: string) => `這是 ${label} 所考的內容（歷屆試題庫的標籤）。` },
  basisWords: { en: (hit: string) => `your request mentions “${hit}”.`, zh: (hit: string) => `你的要求提到「${hit}」。` },
  basisExample: { en: (hit: string) => `the reference question is about “${hit}”.`, zh: (hit: string) => `參考題是關於「${hit}」。` },
  sameAsDraft: { en: 'the draft’s own key point', zh: '沿用草稿的學習要點' },
  alsoTouches: { en: 'also touches', zh: '亦涉及' },
  change: { en: 'Change', zh: '更改' },
  changeTitle: { en: 'Choose another key point (never required)', zh: '選取另一個學習要點（不是必須的）' },
  pickMenuTitle: { en: 'Write on another key point', zh: '改用另一個學習要點' },
  pickSearch: { en: 'Search key points…', zh: '搜尋學習要點…' },
  pickMenuNote: { en: 'Changing it rewrites nothing until you ask.', zh: '更改後不會自動重寫，除非你要求。' },
  stepRefsRun: { en: 'Finding real HKDSE questions to write like…', zh: '正在找真實 HKDSE 試題作參考…' },
  stepRefsDone: {
    en: (n: number, labels: string) => (n === 0 ? 'Writing from the key point alone' : `Chose ${n} real HKDSE question${n === 1 ? '' : 's'} to write like: ${labels}`),
    zh: (n: number, labels: string) => (n === 0 ? '只按學習要點擬題' : `選了 ${n} 條真實 HKDSE 試題作參考：${labels}`),
  },
  stepWriteRun: { en: (n: number) => `Writing ${n}…`, zh: (n: number) => `正在擬 ${n} 題…` },
  stepWriteDone: { en: (n: number) => `Wrote ${n}`, zh: (n: number) => `已擬 ${n} 題` },
  stepCheckRun: { en: 'Checking: solving each again without the key…', zh: '檢查中：不看答案重新作答…' },
  stepCheckDone: { en: 'Checked: solved again without the key', zh: '已檢查：不看答案重新作答' },
  stepDiagramRun: { en: 'Drawing the diagrams…', zh: '正在繪畫圖表…' },
  stepDiagramDone: { en: 'Drew the diagrams', zh: '已繪畫圖表' },
  drawing: { en: 'drawing the diagram…', zh: '正在繪畫圖表…' },
  diagramLook: { en: 'Read the diagram', zh: '請細閱圖表' },
  stepChangeRun: {
    en: (n: number, how: string) => (how === 'another' ? `Writing another like draft ${n}…` : `Changing draft ${n}…`),
    zh: (n: number, how: string) => (how === 'another' ? `正在仿照草稿 ${n} 再擬一題…` : `正在修改草稿 ${n}…`),
  },
  stepChangeDone: {
    en: (n: number, how: string) => (how === 'another' ? `Wrote another like draft ${n}` : how === 'harder' ? `Made draft ${n} harder` : how === 'easier' ? `Made draft ${n} easier` : `Changed draft ${n}`),
    zh: (n: number, how: string) => (how === 'another' ? `已仿照草稿 ${n} 再擬一題` : how === 'harder' ? `已把草稿 ${n} 改難` : how === 'easier' ? `已把草稿 ${n} 改易` : `已修改草稿 ${n}`),
  },

  // what the AI says
  noteWritten: {
    en: (ok: number, look: number, failed: number) =>
      `${ok + look} draft${ok + look === 1 ? ' is' : 's are'} ready.${look ? ` ${look} need${look === 1 ? 's' : ''} a read: see its checks.` : ''}${failed ? ` ${failed} failed a check and ${failed === 1 ? 'was' : 'were'} left out.` : ''}`,
    zh: (ok: number, look: number, failed: number) => `${ok + look} 份草稿已完成。${look ? `其中 ${look} 份請細閱：見其檢查結果。` : ''}${failed ? `${failed} 份未通過檢查，已剔除。` : ''}`,
  },
  noteChanged: { en: (n: number, v: number) => `Draft ${n} is now v${v}. Older versions are kept.`, zh: (n: number, v: number) => `草稿 ${n} 現為第 ${v} 版，舊版本已保留。` },
  noteAnother: { en: (n: number) => `Added draft ${n}.`, zh: (n: number) => `已加入草稿 ${n}。` },
  noteStopped: { en: 'Stopped. Nothing was kept from this request.', zh: '已停止。這次要求沒有保留任何內容。' },
  noteNoPick: { en: 'I couldn’t tell which key point this is. Say a little more, or choose one with Change.', zh: '我未能判斷這是哪個學習要點。請多說一點，或按「更改」選取。' },
  notePickChanged: { en: (name: string) => `Key point changed to ${name}.`, zh: (name: string) => `學習要點已改為 ${name}。` },
  askRewrite: { en: 'The drafts here were written on the old key point.', zh: '這裏的草稿是按原來的學習要點擬寫的。' },
  rewriteThem: { en: 'Rewrite them', zh: '重寫' },
  keepThem: { en: 'Keep them', zh: '保留' },
  answeredRewrite: { en: 'Rewriting them on the new key point.', zh: '按新的學習要點重寫。' },
  answeredKeep: { en: 'Kept them as they are.', zh: '保留原有草稿。' },
  retry: { en: 'Try again', zh: '再試一次' },
  jump: { en: (n: number) => `Draft ${n}`, zh: (n: number) => `草稿 ${n}` },
  jumpTitle: { en: 'Show this draft on the paper', zh: '在試卷上顯示這份草稿' },
  userHarder: { en: (n: number) => `Make draft ${n} harder`, zh: (n: number) => `把草稿 ${n} 改難` },
  userEasier: { en: (n: number) => `Make draft ${n} easier`, zh: (n: number) => `把草稿 ${n} 改易` },
  userAnother: { en: (n: number) => `Another like draft ${n}`, zh: (n: number) => `仿照草稿 ${n} 再擬一題` },
  aboutDraft: { en: (n: number) => `About draft ${n}`, zh: (n: number) => `關於草稿 ${n}` },
  sugHarder: { en: (n: number) => `Make draft ${n} harder`, zh: (n: number) => `把草稿 ${n} 改難` },
  sugMore: { en: 'Write 2 more with numbers', zh: '再擬 2 題，要有數字' },
  sugChinese: { en: 'The same in Chinese', zh: '同樣的題目，用中文' },

  // the paper
  viewLabel: { en: 'View', zh: '檢視' },
  viewPaper: { en: 'Paper', zh: '試卷' },
  viewCompare: { en: 'Side by side with reference', zh: '與參考題並排' },
  counts: {
    en: (drafts: number, accepted: number) => `${drafts} draft${drafts === 1 ? '' : 's'} · ${accepted} accepted`,
    zh: (drafts: number, accepted: number) => `${drafts} 份草稿 · 已接受 ${accepted} 份`,
  },
  canvasEmpty: {
    en: 'Your questions appear here as they are written, exactly as they will print.',
    zh: '題目會在這裏邊寫邊顯示，與印出來的一樣。',
  },
  canvasEmptyNote: { en: 'Nothing goes into a paper until you accept it and press Add.', zh: '你接受並按「加入」之前，不會有任何題目加入試卷。' },
  placeholderDraft2: { en: (n: number) => `Draft ${n} will appear here`, zh: (n: number) => `草稿 ${n} 會在這裏出現` },
  writing: { en: 'writing…', zh: '擬寫中…' },
  checking: { en: 'checking…', zh: '檢查中…' },
  writtenLike: { en: 'Written like', zh: '仿照' },
  yourReference: { en: 'Your reference', zh: '你的參考題' },
  aiChose: { en: 'The AI chose these as the style to follow', zh: 'AI 選了這些作文風參考' },
  showReference: { en: 'Show it', zh: '顯示' },
  noReference: { en: 'No reference question: the AI wrote from the key point alone.', zh: '沒有參考題：AI 只按學習要點擬題。' },
  referenceWords: { en: 'Its picture is not kept with a saved chat; open the question again to see it.', zh: '已儲存的對話不保留圖片；請再次開啟該題查看。' },
  varies: { en: 'What changed', zh: '改了甚麼' },

  changedTitle: { en: 'What changed from the reference', zh: '與參考題的分別' },
  changedVaries: { en: 'Varies', zh: '變化' },
  changedFormat: { en: 'Format', zh: '格式' },
  changedNumbers: { en: 'Numbers', zh: '數字' },
  changedKey: { en: 'Key', zh: '答案' },
  same: { en: 'same', zh: '相同' },
  newNumbers: { en: (to: string) => `new: ${to}`, zh: (to: string) => `新數字：${to}` },
  noNumbers: { en: 'none', zh: '沒有' },
  referencePick: { en: 'Reference to compare with', zh: '用作比較的參考題' },

  // a draft
  accept: { en: 'Accept', zh: '接受' },
  accepted: { en: 'Accepted', zh: '已接受' },
  reject: { en: 'Reject', zh: '不要' },
  rejected: { en: 'Rejected', zh: '已不要' },
  bringBack: { en: 'Bring back', zh: '取回' },
  added: { en: 'Added', zh: '已加入' },
  askAbout: { en: 'Ask about this', zh: '就這題提問' },
  askAboutTitle: { en: 'Talk about this draft in the chat', zh: '在對話中討論這份草稿' },
  version: { en: (v: number) => `v${v}`, zh: (v: number) => `第 ${v} 版` },
  versionsLabel: { en: 'Versions of this draft', zh: '這份草稿的版本' },
  backTo: { en: (v: number) => `Back to v${v}`, zh: (v: number) => `回到第 ${v} 版` },
  checkDetails: { en: 'What was checked', zh: '檢查了甚麼' },
  leftOut: { en: 'Left out: it failed a check', zh: '已剔除：未通過檢查' },

  // tray
  acceptedCount: { en: (n: number) => `${n} accepted`, zh: (n: number) => `已接受 ${n} 份` },
  trayNote: { en: 'AI-made questions keep their label until you mark them Checked.', zh: 'AI 擬寫的題目會保留標示，直至你標示為已檢查。' },
});
