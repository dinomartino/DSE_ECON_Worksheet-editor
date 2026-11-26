import { defineMessages } from '@/i18n/catalogue';

/** AI tagging in the question bank (k-0560): the ✦ menu's verb and scope, and the review panel. */
export const AI_TAG_MESSAGES = defineMessages({
  verb: { en: 'Tag topics', zh: '標記課題' },
  verbAgain: { en: 'Suggest topics again', zh: '重新建議課題' },
  verbHint: {
    en: 'Suggests a syllabus topic for each untagged question. You check each one before it is saved.',
    zh: '為每條未標記的題目建議課程綱要課題。每項都由你確認後才會儲存。',
  },
  verbAgainHint: {
    en: 'This question already has topics. Accepting a suggestion replaces them.',
    zh: '這條題目已有課題。接受建議會取代現有課題。',
  },
  leftAlone: {
    en: (n: number) => `${n} already tagged ${n === 1 ? 'is' : 'are'} left as ${n === 1 ? 'it is' : 'they are'}.`,
    zh: (n: number) => `已標記的 ${n} 條題目不會更改。`,
  },
  scopeUntagged: { en: (n: number) => `All untagged · ${n}`, zh: (n: number) => `所有未標記 · ${n}` },
  tagN: { en: (n: number) => `Tag ${n}`, zh: (n: number) => `標記 ${n} 條` },
  confirm: {
    en: (n: number) => `Suggest topics for ${n} questions? Nothing is saved until you accept.`,
    zh: (n: number) => `為 ${n} 條題目建議課題？接受前不會儲存任何內容。`,
  },

  title: { en: 'AI topic suggestions', zh: 'AI 建議的課題' },
  description: {
    en: 'Nothing is saved until you accept. Topics come from the syllabus list the bank uses.',
    zh: '接受前不會儲存任何內容。課題來自題庫所用的課程綱要。',
  },
  running: { en: (done: number, total: number) => `Suggesting topics… ${done} of ${total}`, zh: (done: number, total: number) => `正在建議課題… ${done}/${total}` },
  reading: { en: 'Reading the questions…', zh: '正在讀取題目…' },
  stop: { en: 'Stop', zh: '停止' },
  stopped: { en: 'Stopped. The suggestions already back are kept.', zh: '已停止。已收到的建議會保留。' },
  finished: {
    en: (n: number, of: number) => `${n} of ${of} questions have a suggestion.`,
    zh: (n: number, of: number) => `${of} 條題目中有 ${n} 條有建議。`,
  },
  tally: {
    en: (saved: number, skipped: number, left: number) => `${saved} saved · ${skipped} skipped · ${left} to review`,
    zh: (saved: number, skipped: number, left: number) => `已儲存 ${saved} · 已略過 ${skipped} · 待查看 ${left}`,
  },
  acceptAll: { en: (n: number) => `Accept all (${n})`, zh: (n: number) => `全部接受（${n}）` },
  acceptAllTitle: { en: 'Save every suggestion still waiting for review', zh: '儲存所有仍待查看的建議' },
  close: { en: 'Close', zh: '關閉' },
  closeTitle: {
    en: 'Close. Suggestions you did not accept are not saved.',
    zh: '關閉。未接受的建議不會儲存。',
  },

  accept: { en: 'Accept', zh: '接受' },
  change: { en: 'Change…', zh: '更改…' },
  skip: { en: 'Skip', zh: '略過' },
  undo: { en: 'Undo', zh: '復原' },
  review: { en: 'Review again', zh: '重新查看' },
  open: { en: 'Open', zh: '開啟' },

  now: { en: 'Now:', zh: '現有：' },
  suggested: { en: 'Suggested', zh: '建議' },
  yourPick: { en: 'Your pick', zh: '你的選擇' },
  replaces: { en: 'Accepting replaces its topics', zh: '接受後會取代現有課題' },
  pattern: { en: '題型', zh: '題型' },
  confHigh: { en: 'Confident', zh: '把握高' },
  confMedium: { en: 'Fairly sure', zh: '把握中' },
  confLow: { en: 'A guess', zh: '把握低' },
  confTitle: { en: "How sure the AI is that this is the topic tested", zh: 'AI 對此為所考課題的把握程度' },

  waiting: { en: 'Waiting…', zh: '等候中…' },
  saving: { en: 'Saving…', zh: '正在儲存…' },
  saved: { en: 'Saved', zh: '已儲存' },
  skipped: { en: 'Skipped', zh: '已略過' },
  noAnswer: { en: 'No suggestion: the AI gave no topic from the list', zh: '沒有建議：AI 未能給出列表中的課題' },
  noWords: { en: 'No words to read: tag it yourself', zh: '沒有可讀的文字，請自行標記' },
  notRead: { en: "Couldn't read this question", zh: '未能讀取這條題目' },
  notSaved: { en: (reason: string) => `Not saved: ${reason}`, zh: (reason: string) => `未能儲存：${reason}` },
  undone: { en: 'Taken back', zh: '已復原' },

  changeTitle: { en: 'Topics for this question', zh: '這條題目的課題' },
  changeDescription: {
    en: 'Tick the topics this question tests. Saving accepts them.',
    zh: '剔選這條題目所考的課題。儲存即接受。',
  },
  saveTopics: { en: 'Accept these topics', zh: '接受這些課題' },

  // Part by part (u-g13t)
  byPart: { en: 'Suggested part by part', zh: '按分題建議' },
  acceptParts: { en: (n: number) => `Accept all parts (${n})`, zh: (n: number) => `接受所有分題（${n}）` },
  acceptPartsTitle: { en: 'Save the suggestion for every part still waiting', zh: '儲存所有仍待查看的分題建議' },
  changePartTitle: { en: (label: string) => `Topics for part ${label}`, zh: (label: string) => `分題 ${label} 的課題` },
  changePartDescription: {
    en: 'Tick the topics this part tests. Saving accepts them for this part only.',
    zh: '剔選這個分題所考的課題。儲存即只為這個分題接受。',
  },
  partNoWords: { en: 'No words to read', zh: '沒有可讀的文字' },
  partNoAnswer: { en: 'No suggestion', zh: '沒有建議' },
  partTitle: { en: (label: string) => `Part ${label}`, zh: (label: string) => `分題 ${label}` },
});
