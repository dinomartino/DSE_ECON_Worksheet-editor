import type { ReportLanguage } from './language';
import type { Band, Confidence } from './types';
import type { Where } from './report';

/**
 * The printed coverage report's words (k-0489). They follow the paper's language, not the
 * interface's, so they live here beside the syllabus names rather than in a UI catalogue
 * (AGENTS.md: printed text stays out of catalogues). Both sides must have every key.
 */

const ZH_NUMERALS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
export const zhNumber = (n: number) => ZH_NUMERALS[n] ?? String(n);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const en = {
  reportTitle: 'Syllabus coverage report',
  syllabus: 'HKDSE Economics · Curriculum and Assessment Guide (2025)',
  checked: 'Checked',
  scope: 'Scope',
  scopePaper: 'Whole paper',
  scopePart: (n: number) => `Part of the paper (${n} ${n === 1 ? 'question' : 'questions'})`,
  scopeSet: (papers: string) => `Whole set: ${papers}`,
  analysed: (analysed: number, sent: number) => `${analysed} of ${sent} ${sent === 1 ? 'question' : 'questions'} analysed`,
  disclaimer:
    'AI estimates of what each question tests: a guide for planning, not an official analysis. Nothing was saved to the paper.',
  keyPoints: 'Key points tested',
  hours: 'Lesson hours touched',
  points: 'Points tested',
  marks: 'Marks analysed',
  ofN: (hit: string, of: string) => `${hit} of ${of}`,
  hoursOf: (hit: string, of: string) => `${hit} of ${of} hours`,
  confidence: (high: string, medium: string, low: string) => `AI confidence by marks: high ${high}, medium ${medium}, low ${low}`,
  electiveNone: 'No Elective Part questions found: Compulsory Part only.',
  electiveCounted: (name: string) => `Counted with the Compulsory Part: ${name}.`,
  electivePart1: 'Elective Part 1',
  electivePart2: 'Elective Part 2',
  untagged: (marks: string) => `${marks} marks not matched to the syllabus.`,
  notAnalysed: (n: number) => `${n} ${n === 1 ? 'question' : 'questions'} not analysed.`,
  paper: (n: number) => `Paper ${n}`,
  paperJoin: ', ',
  byPaper: 'By paper',
  colPaper: 'Paper',
  colQuestions: 'Questions',
  byTopic: 'Coverage by topic',
  colTopic: 'Topic and key point',
  colKnow: 'Know',
  colApply: 'Apply',
  colEvaluate: 'Evaluate',
  colMarks: 'Marks',
  colShare: '% marks',
  colHours: '% hours',
  colWhere: 'Questions',
  notTested: 'not tested',
  notCounted: 'not counted',
  keyPointsOf: (hit: number, of: number) => `${hit} of ${of} key points`,
  pointsLine: (names: string) => `Points: ${names}`,
  gaps: 'Gaps: key points not tested',
  gapsNone: 'Every key point in scope is tested.',
  byQuestion: 'Which questions cover what',
  main: 'main',
  also: 'also',
  bandKnow: 'Know',
  bandApply: 'Apply',
  bandEvaluate: 'Evaluate',
  confHigh: 'high',
  confMedium: 'medium',
  confLow: 'low',
  unitMarks: (marks: string) => `${marks} ${marks === '1' ? 'mark' : 'marks'}`,
  unitFailed: 'not analysed',
  unitNone: 'no syllabus match',
  where: (where: Where) => `${where.paper !== undefined ? `P${where.paper} ` : ''}Q${where.at}`,
  listJoin: ', ',
  pointsJoin: '; ',
  denominators:
    'Key points and points count each item once. Hours spread each topic’s suggested lesson time (guide p. 23) over its key points by their points. A part tagged with more than one point splits its marks, main 2 : also 1. A whole set adds the papers’ marks as printed.',
  page: (n: number, of: number) => `Page ${n} of ${of}`,
  date: (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
  fileName: (title: string) => `${title} - Syllabus coverage.pdf`,
};

type ReportText = typeof en;

const zh: ReportText = {
  reportTitle: '課程覆蓋報告',
  syllabus: 'HKDSE 經濟科 · 課程及評估指引（2025）',
  checked: '檢查日期',
  scope: '範圍',
  scopePaper: '全份試卷',
  scopePart: (n) => `部分試卷（${n} 條題目）`,
  scopeSet: (papers) => `整套試卷：${papers}`,
  analysed: (analysed, sent) => `已分析 ${sent} 條題目中的 ${analysed} 條`,
  disclaimer: '由 AI 估算每條題目考核的內容，只供備課參考，並非官方分析。沒有儲存任何內容到試卷。',
  keyPoints: '已考核的學習要點',
  hours: '涉及的課時',
  points: '已考核的細項',
  marks: '已分析的分數',
  ofN: (hit, of) => `${hit} / ${of}`,
  hoursOf: (hit, of) => `${hit} / ${of} 小時`,
  confidence: (high, medium, low) => `按分數計的 AI 把握：高 ${high}、中 ${medium}、低 ${low}`,
  electiveNone: '沒有找到選修部分的題目：只計必修部分。',
  electiveCounted: (name) => `與必修部分一併計算：${name}。`,
  electivePart1: '選修單元(一)',
  electivePart2: '選修單元(二)',
  untagged: (marks) => `${marks} 分未能對照課程。`,
  notAnalysed: (n) => `${n} 條題目未能分析。`,
  paper: (n) => `卷${zhNumber(n)}`,
  paperJoin: '、',
  byPaper: '按試卷',
  colPaper: '試卷',
  colQuestions: '題目',
  byTopic: '按課題的覆蓋',
  colTopic: '課題及學習要點',
  colKnow: '知識',
  colApply: '應用',
  colEvaluate: '評鑑',
  colMarks: '分數',
  colShare: '佔分數',
  colHours: '佔課時',
  colWhere: '題目',
  notTested: '未考核',
  notCounted: '不計算',
  keyPointsOf: (hit, of) => `${of} 個學習要點中的 ${hit} 個`,
  pointsLine: (names) => `細項：${names}`,
  gaps: '缺口：未考核的學習要點',
  gapsNone: '範圍內每個學習要點都有考核。',
  byQuestion: '各題考核的內容',
  main: '主要',
  also: '其次',
  bandKnow: '知識',
  bandApply: '應用',
  bandEvaluate: '評鑑',
  confHigh: '高',
  confMedium: '中',
  confLow: '低',
  unitMarks: (marks) => `${marks} 分`,
  unitFailed: '未能分析',
  unitNone: '沒有對照到課程',
  where: (where) => `${where.paper !== undefined ? `卷${zhNumber(where.paper)}` : ''}第 ${where.at} 題`,
  listJoin: '、',
  pointsJoin: '；',
  denominators:
    '學習要點及細項每項計一次。課時把每個課題的建議課時（指引第 23 頁）按細項數目分給其學習要點。一部分有多於一個學習要點時，分數按主要 2 : 其次 1 分配。整套試卷按各卷印出的分數相加。',
  page: (n, of) => `第 ${n} 頁，共 ${of} 頁`,
  date: (d) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`,
  fileName: (title) => `${title} 課程覆蓋報告.pdf`,
};

export function reportText(language: ReportLanguage): ReportText {
  return language === 'zh' ? zh : en;
}

export const bandWord = (t: ReportText, band: Band) => (band === 'know' ? t.bandKnow : band === 'apply' ? t.bandApply : t.bandEvaluate);
export const confWord = (t: ReportText, conf: Confidence) => (conf === 'high' ? t.confHigh : conf === 'medium' ? t.confMedium : t.confLow);

/** A syllabus item's name in the report's language. */
export const nameIn = (language: ReportLanguage) => (row: { en: string; zh: string }) => (language === 'zh' ? row.zh : row.en);

/** The report's file name: the title made safe for Windows and macOS. */
export function reportFileName(title: string, language: ReportLanguage): string {
  const safe = title.replace(/[\\/:*?"<>|]/g, '-').trim() || (language === 'zh' ? '試卷' : 'Paper');
  return reportText(language).fileName(safe);
}
