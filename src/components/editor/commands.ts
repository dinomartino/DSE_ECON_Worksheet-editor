import { openAi } from '@/assist/menuStore';
import { isMacPlatform } from '@/components/settings/shortcut';
import { resolveMessages, sideOf, type Catalogue, type Messages } from '@/i18n/catalogue';
import { uiLanguage } from '@/i18n/language';
import type { UiLanguage } from '@/settings/language';
import type { LanguageMode, Worksheet } from '@/model/types';
import { useAppDialogs } from '@/store/appDialogs';
import { useWorksheetStore } from '@/store/worksheetStore';
import { ADD_RAIL_MESSAGES } from './AddRail.messages';
import { COMMAND_PALETTE_MESSAGES } from './CommandPalette.messages';
import { DOCUMENT_SETTINGS_MESSAGES } from './DocumentSettings.messages';
import { EXPORT_MESSAGES } from './ExportDialog.messages';
import { TOOLBAR_MESSAGES } from './Toolbar.messages';
import type { Bilingual, SearchableCommand } from './commandSearch';
import { requestExport, requestFeedback, requestSetup, requestWhatsNew, type SetupTab } from './editorRequests';
import { buildInsertEntries, type InsertEntry } from './insertEntries';
import { requestTableGrid } from './railRequest';

/**
 * Every command ⌘K finds (k-0201): the Question and Insert menus' entries (the rail's own,
 * `buildInsertEntries`), every Setup setting (`SETUP_INDEX`, guarded against the dialog by
 * `commands.test.ts`), every export, and the views. Names come from the catalogues in both
 * languages, so a translated or renamed entry is found by its new words.
 */

export interface Command extends SearchableCommand {
  /** Which menu it belongs to, shown beside it. */
  where: Bilingual;
  shortcut?: string;
  run: () => void;
}

type SettingKey = keyof typeof DOCUMENT_SETTINGS_MESSAGES;

/** Each Setup setting a teacher looks for, the tab it is on, and Word's words for it. */
export const SETUP_INDEX: ReadonlyArray<{ tab: SetupTab; key: SettingKey; keywords?: string }> = [
  { tab: 'document', key: 'title', keywords: 'title name 標題 名稱' },
  { tab: 'document', key: 'instructions', keywords: 'instructions rubric answer all questions 指示' },
  { tab: 'document', key: 'fonts', keywords: 'font fonts typeface times new roman 新細明體 標楷體 字型 字體' },
  { tab: 'document', key: 'textSize', keywords: 'font size text size points pt 字號 字體大小' },
  { tab: 'document', key: 'justifyText', keywords: 'justify justified align alignment 對齊 左右對齊' },
  { tab: 'document', key: 'optionLayoutAll', keywords: 'options layout columns mc abcd 選項 排列' },
  { tab: 'document', key: 'versions', keywords: 'versions shuffle version a b 版本 亂序' },
  { tab: 'document', key: 'target', keywords: 'target marks time minutes 分數 時間' },
  { tab: 'document', key: 'classes', keywords: 'class classes 班別' },
  { tab: 'document', key: 'satOn', keywords: 'date exam date sat 日期' },
  { tab: 'document', key: 'hideFromBank', keywords: 'bank hide 題庫 隱藏' },
  { tab: 'page', key: 'paperSize', keywords: 'paper size page size a4 a3 letter 紙張' },
  { tab: 'page', key: 'orientation', keywords: 'orientation landscape portrait 橫向 直向' },
  { tab: 'page', key: 'margins', keywords: 'margin margins 邊界' },
  { tab: 'page', key: 'betweenQuestions', keywords: 'space between questions spacing gap 空位 行距' },
  { tab: 'page', key: 'startEveryQuestion', keywords: 'page break new page every question 分頁 新頁' },
  { tab: 'furniture', key: 'tabFurniture', keywords: 'header footer page number page numbers 頁首 頁尾 頁碼' },
  { tab: 'furniture', key: 'ruleLine', keywords: 'rule line header line border 分隔線' },
  { tab: 'cover', key: 'coverHeading', keywords: 'cover mock exam cover page 封面' },
  { tab: 'cover', key: 'paperStyle', keywords: 'cover paper style 試卷 類型' },
  { tab: 'cover', key: 'instructionNumbers', keywords: 'instructions numbers 指示 編號' },
  { tab: 'cover', key: 'writeInBoxes', keywords: 'candidate number boxes write in 方格' },
  { tab: 'cover', key: 'examinerGrid', keywords: 'examiner marks grid 閱卷 評分' },
  { tab: 'cover', key: 'titleSection', keywords: 'title page 1 標題' },
];

const TAB_KEY: Record<SetupTab, SettingKey> = {
  document: 'tabWorksheet',
  page: 'tabPage',
  furniture: 'tabFurniture',
  cover: 'tabCover',
};

/** Word's words for the Question and Insert menus' entries, by entry id. */
const INSERT_KEYWORDS: Record<string, string> = {
  mcq: 'multiple choice mc mcq 多項選擇題 選擇題',
  structured: 'structured long question lq parts 結構題 長題目 分題',
  fromBank: 'bank reuse copy 題庫',
  table: 'insert table grid cells 表格 插入表格',
  picture: 'insert picture image photo screenshot 圖片 相片 截圖',
  section: 'section restart numbering 部分 重新編號',
  partHeader: 'part header marks 分部',
  questionCount: 'question count there are 題目數量',
  stimulus: 'source passage shared data case 共用資料',
  heading: 'heading title 標題',
  text: 'text paragraph note instructions 文字 備註 段落',
  labelList: 'label list 列表',
  answerLines: 'ruled lines writing lines answer lines 橫線 答題線',
  answerSpace: 'dotted lines answer space qab 點線 答題空間',
  answerSpaceFill: 'dotted lines fill page end answer space 點線 頁尾',
  spacer: 'blank space gap spacer 留白 空白',
  divider: 'divider line rule horizontal line separator 分隔線',
  pageBreak: 'page break new page ctrl enter 分頁 新頁',
};

const both = <C extends Catalogue>(catalogue: C) => ({
  en: resolveMessages(catalogue, 'en'),
  zh: resolveMessages(catalogue, 'zh-HK'),
});
const pick = <C extends Catalogue>(m: { en: Messages<C>; zh: Messages<C> }, key: keyof C): Bilingual => ({
  en: m.en[key] as string,
  zh: m.zh[key] as string,
});

export interface CommandContext {
  worksheet: Worksheet;
  readOnly: boolean;
  afterId?: string;
  labelFor: (id: string | undefined) => string | undefined;
}

export function buildCommands({ worksheet, readOnly, afterId, labelFor }: CommandContext): Command[] {
  const store = useWorksheetStore.getState();
  const mac = isMacPlatform();
  const key = (letter: string) => (mac ? `⌘${letter}` : `Ctrl+${letter}`);
  const rail = both(ADD_RAIL_MESSAGES);
  const setup = both(DOCUMENT_SETTINGS_MESSAGES);
  const bar = both(TOOLBAR_MESSAGES);
  const own = both(COMMAND_PALETTE_MESSAGES);
  const commands: Command[] = [];

  if (!readOnly) {
    // The rail's entries, built once per language and paired by id.
    const built = (lang: UiLanguage) =>
      buildInsertEntries({
        m: resolveMessages(ADD_RAIL_MESSAGES, lang),
        english: lang === 'en',
        worksheet,
        afterId,
        labelFor,
        addQuestion: store.addQuestion,
        addLayoutElement: store.addLayoutElement,
        insertBlockAtAnchor: store.insertBlockAtAnchor,
      });
    const en = built('en');
    const zh = built('zh-HK');
    const add = (entries: InsertEntry[], zhEntries: InsertEntry[], where: Bilingual) => {
      entries.forEach((entry, index) => {
        const other = zhEntries[index];
        if (entry.choices) {
          add(entry.choices, other.choices ?? [], {
            en: `${where.en} › ${entry.label}`,
            zh: `${where.zh} › ${other.label}`,
          });
          return;
        }
        commands.push({
          id: `insert:${entry.id}`,
          label: { en: entry.label, zh: other.label },
          where,
          keywords: INSERT_KEYWORDS[entry.id],
          run: entry.pickTable ? requestTableGrid : () => entry.run?.(afterId),
        });
      });
    };
    add(en.questions, zh.questions, pick(rail, 'groupQuestion'));
    add(en.layout, zh.layout, pick(rail, 'groupElement'));

    const setupWhere = pick(bar, 'setup');
    for (const { tab, key: settingKey, keywords } of SETUP_INDEX) {
      const tabName = pick(setup, TAB_KEY[tab]);
      const label = pick(setup, settingKey);
      commands.push({
        id: `setup:${settingKey}`,
        label,
        where: { en: `${setupWhere.en} › ${tabName.en}`, zh: `${setupWhere.zh} › ${tabName.zh}` },
        keywords,
        // A tab named for itself opens the tab; a setting is shown inside it.
        run: () =>
          requestSetup(tab, settingKey === TAB_KEY[tab] ? undefined : (setup[sideOf(uiLanguage())][settingKey] as string)),
      });
    }
    commands.push({
      id: 'setup:open',
      label: pick(own, 'setupWhole'),
      where: setupWhere,
      keywords: 'setup page setup document settings 頁面設定',
      run: () => requestSetup('document'),
    });
  }

  const exportWhere = pick(both(EXPORT_MESSAGES), 'title');
  const exportCommand = (id: keyof typeof COMMAND_PALETTE_MESSAGES, keywords: string, run: () => void) =>
    commands.push({ id: `export:${String(id)}`, label: pick(own, id), where: exportWhere, keywords, run });
  exportCommand('exportWord', 'word docx download save as 下載', () => requestExport('docx', 'paper'));
  exportCommand('exportPdf', 'pdf print 列印', () => requestExport('pdf', 'paper'));
  exportCommand('exportKey', 'answer key marking scheme mark scheme 評卷參考 答案', () => requestExport('docx', 'answerKey'));
  exportCommand('exportApps', 'csv kahoot blooket zipgrade 其他應用程式', () => requestExport('docx', 'apps'));
  exportCommand('exportJson', 'json backup save a copy worksheet file 備份', () => requestExport('json'));

  const view = pick(own, 'groupView');
  const more = pick(own, 'groupMore');
  const setLanguage = (language: LanguageMode) => () => store.setMode({ language });
  const viewCommands: Array<[keyof typeof TOOLBAR_MESSAGES, string, () => void, string?]> = [
    ['langEn', 'english 英文', setLanguage('en')],
    ['langZh', 'chinese 中文', setLanguage('zh')],
    ['langBoth', 'bilingual both english chinese 中英 雙語', setLanguage('bilingual')],
    ['student', 'student version hide answers 學生', () => {
      store.setDocumentView('paper');
      store.setMode({ version: 'student' });
    }],
    ['teacher', 'teacher version show answers 教師 答案', () => {
      store.setDocumentView('paper');
      store.setMode({ version: 'teacher' });
    }],
    ['markingScheme', 'marking scheme answer key mark scheme 評卷參考 答案', () => store.setDocumentView('answerKey')],
    ['preview', 'preview print preview 預覽', () => store.setPrintPreview(true)],
    ['edit', 'edit editing 編輯', () => store.setPrintPreview(false)],
  ];
  for (const [id, keywords, run] of viewCommands) {
    commands.push({ id: `view:${String(id)}`, label: pick(bar, id), where: view, keywords, run });
  }

  if (!readOnly) {
    commands.push(
      { id: 'more:save', label: pick(bar, 'saveNow'), where: more, keywords: 'save 儲存', shortcut: key('S'), run: () => void store.save().catch(() => {}) },
      { id: 'more:undo', label: pick(bar, 'undo'), where: more, keywords: 'undo 復原', run: store.undo },
      { id: 'more:redo', label: pick(bar, 'redo'), where: more, keywords: 'redo 重做', run: store.redo },
      { id: 'more:ai', label: pick(own, 'aiTools'), where: more, keywords: 'ai translate generate answers 翻譯', shortcut: key('J'), run: () => openAi() },
    );
  }
  commands.push(
    { id: 'more:settings', label: pick(own, 'settings'), where: more, keywords: 'settings preferences appearance dark language 設定 外觀 語言', shortcut: key(','), run: () => useAppDialogs.getState().openSettings() },
    { id: 'more:whatsNew', label: pick(bar, 'whatsNew'), where: more, keywords: 'whats new changes release notes 最新', run: requestWhatsNew },
    { id: 'more:feedback', label: pick(bar, 'sendFeedback'), where: more, keywords: 'feedback bug report problem 意見 回饋', run: requestFeedback },
  );
  return commands;
}
