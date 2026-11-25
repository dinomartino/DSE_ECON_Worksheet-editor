import { defineMessages } from '@/i18n/catalogue';

/** Settings → Past paper bank → past-paper questions in my bank (k-0559). */
export const OLD_COPIES_MESSAGES = defineMessages({
  heading: { en: 'Past paper questions in my bank', zh: '我的題庫中的歷屆試題' },
  intro: {
    en: 'Questions you add from the past paper bank stay out of your question bank until you change them. Worksheets made before this update may still show some there.',
    zh: '從歷屆試題庫加入的題目，在你修改之前不會進入你的題庫。此更新之前製作的工作紙，可能仍有部分在題庫中顯示。',
  },
  find: { en: 'Find them', zh: '尋找' },
  finding: { en: 'Checking your worksheets…', zh: '正在檢查你的工作紙…' },
  none: {
    en: (papers: number) => `None found in your ${papers} ${papers === 1 ? 'worksheet' : 'worksheets'}.`,
    zh: (papers: number) => `在你的 ${papers} 份工作紙中沒有找到。`,
  },
  found: {
    en: (count: number, papers: number) =>
      `${count} unchanged past paper ${count === 1 ? 'question' : 'questions'} from ${papers} ${papers === 1 ? 'worksheet is' : 'worksheets are'} in your question bank:`,
    zh: (count: number, papers: number) => `你的題庫中有 ${count} 條未修改的歷屆試題，來自 ${papers} 份工作紙：`,
  },
  changed: {
    en: (count: number) => `${count} you have changed ${count === 1 ? 'stays' : 'stay'} in your question bank as your own.`,
    zh: (count: number) => `${count} 條你已修改的題目會作為你自己的題目留在題庫中。`,
  },
  notInBank: {
    en: (count: number) =>
      `${count} with a past paper source could not be compared: the past paper bank no longer has ${count === 1 ? 'it' : 'them'}. Left as ${count === 1 ? 'it is' : 'they are'}.`,
    zh: (count: number) => `${count} 條附有歷屆試題出處的題目無法比對：歷屆試題庫已沒有這些題目。保持不變。`,
  },
  keepNote: {
    en: 'Taking them out changes nothing in your worksheets: each question stays where it is and prints the same. Edit one later and it joins your question bank as your own.',
    zh: '移出題庫不會改動你的工作紙：每條題目都留在原處，列印效果不變。日後修改其中一條，它便會作為你自己的題目加入題庫。',
  },
  takeOut: {
    en: (count: number) => `Take ${count === 1 ? 'it' : `all ${count}`} out of my bank`,
    zh: (count: number) => `把 ${count === 1 ? '這條' : `全部 ${count} 條`}移出我的題庫`,
  },
  confirm: {
    en: (count: number) => `Take ${count} ${count === 1 ? 'question' : 'questions'} out of your question bank? Your worksheets stay as they are.`,
    zh: (count: number) => `把 ${count} 條題目移出你的題庫？你的工作紙會保持不變。`,
  },
  confirmYes: { en: 'Take out', zh: '移出' },
  cancel: { en: 'Cancel', zh: '取消' },
  working: { en: 'Taking them out…', zh: '正在移出…' },
  done: {
    en: (count: number) => `Done: ${count} ${count === 1 ? 'question' : 'questions'} taken out of your question bank.`,
    zh: (count: number) => `完成：已把 ${count} 條題目移出你的題庫。`,
  },
  skipped: {
    en: (count: number) => `${count} changed since, or could not be saved, and ${count === 1 ? 'was' : 'were'} left in.`,
    zh: (count: number) => `${count} 條其後已修改或無法儲存，已保留在題庫中。`,
  },
  bankOff: {
    en: 'The past paper bank is off on this computer. Turn it on above to compare your questions with it.',
    zh: '此電腦已關閉歷屆試題庫。請在上方開啟，才能與它比對你的題目。',
  },
  bankUnavailable: {
    en: 'The past paper bank could not be read. Check your connection and try again.',
    zh: '無法讀取歷屆試題庫。請檢查網絡連線後再試。',
  },
  failed: { en: 'Something went wrong. Nothing was changed.', zh: '出現問題，沒有作出任何改動。' },
  more: { en: (count: number) => `and ${count} more`, zh: (count: number) => `及另外 ${count} 條` },
  number: { en: (n: number) => `Q${n}`, zh: (n: number) => `第 ${n} 題` },
});
