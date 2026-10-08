import { defineMessages } from '@/i18n/catalogue';
import { spaced } from '@/i18n/spacing';

/** The topic pickers: tick topics for one question, a question with parts, or many at once. */
export const TOPIC_PICKER_MESSAGES = defineMessages({
  keepOnly: {
    en: (name: string) => `Keep ${name}, remove only its 題型`,
    zh: (name: string) => spaced`保留${name}，只移除其題型`,
  },
  onCount: { en: (n: number) => `(on ${n})`, zh: (n: number) => `（${n} 條）` },
  noneTicked: { en: 'No topic ticked', zh: '未剔選課題' },
  ticked: { en: (n: number) => `${n} ticked`, zh: (n: number) => `已剔選 ${n} 項` },
  cancel: { en: 'Cancel', zh: '取消' },

  patternsDiffer: {
    en: 'The parts have different 題型 here. Pick one to set it on every part.',
    zh: '各分題在此有不同的題型。選擇一個即可套用到所有分題。',
  },
  everyPartHas: { en: 'Every part has a topic', zh: '每個分題都已有課題' },
  noPartHas: { en: 'No part has a topic yet', zh: '尚未有任何分題有課題' },
  noTopicOn: { en: (list: string) => `No topic yet on ${list}`, zh: (list: string) => `${list} 尚未有課題` },
  whereLabel: { en: 'Where the topics go', zh: '課題的套用位置' },
  whole: { en: 'Whole question', zh: '整條題目' },
  everyPart: { en: 'Every part', zh: '所有分題' },
  sameAs: { en: (label: string) => `Same as ${label}`, zh: (label: string) => `與 ${label} 相同` },
  noTopicYet: { en: 'No topic yet', zh: '尚未有課題' },
  itsOwnPrefix: { en: 'Its own · ', zh: '另設課題 · ' },
  partTitle: { en: (title: string, detail: string) => `${title}: ${detail}`, zh: (title: string, detail: string) => `${title}：${detail}` },

  noteWhole: {
    en: 'Ticks here go on every part. Then pick a part to change it alone.',
    zh: '在這裏剔選會套用到每個分題。之後可選擇某個分題單獨更改。',
  },
  notePart: { en: (name: string) => `Ticks here change ${name} only.`, zh: (name: string) => spaced`在這裏剔選只會更改${name}。` },
  noteInherits: {
    en: (label: string, parent: string) => `${label} has the same topics as ${parent}. Tick or untick one to give it its own.`,
    zh: (label: string, parent: string) => `${label} 的課題與 ${parent} 相同。剔選或取消剔選任何一項，即可讓它有自己的課題。`,
  },
  noteOwn: {
    en: (label: string, parent: string) => `${label} has its own topics, in place of ${parent}’s.`,
    zh: (label: string, parent: string) => `${label} 有自己的課題，取代 ${parent} 的課題。`,
  },

  find: { en: 'Find a topic by name or 中文', zh: '按名稱或英文搜尋課題' },
  hide: { en: 'Hide', zh: '收起' },
  subTopics: { en: (n: number) => `${n} ${n === 1 ? 'sub-topic' : 'sub-topics'}`, zh: (n: number) => `${n} 個子課題` },
  insideTicked: { en: (n: number) => ` · ${n} ticked`, zh: (n: number) => ` · 已剔選 ${n} 項` },
  noMatch: { en: (query: string) => `No topic matches “${query}”.`, zh: (query: string) => `沒有符合「${query}」的課題。` },
  partialTitle: {
    en: (where: string) => `On ${where} only. Tick to put it on every part.`,
    zh: (where: string) => `只在 ${where}。剔選以套用到每個分題。`,
  },
  onSelected: { en: (n: number) => `On ${n} selected`, zh: (n: number) => `已選題目中有 ${n} 條` },
});
