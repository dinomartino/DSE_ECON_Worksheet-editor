import { defineMessages } from '@/i18n/catalogue';

export const MARK_SCHEME_MESSAGES = defineMessages({
  addAlternative: { en: 'Add “/” alternative', zh: '加入「/」其他答案' },
  moveUp: { en: 'Move up', zh: '上移' },
  moveDown: { en: 'Move down', zh: '下移' },
  deletePoint: { en: 'Delete point', zh: '刪除要點' },
  eachPointTitle: {
    en: (each: number) => `Each point earns ${each} (${each}@)`,
    zh: (each: number) => `每個要點得 ${each} 分（${each}@）`,
  },
  pointMarks: {
    en: (n: number) => `Point ${n} marks`,
    zh: (n: number) => `要點 ${n} 的分數`,
  },
  markingPoint: {
    en: (n: number) => `Marking point ${n}`,
    zh: (n: number) => `評分要點 ${n}`,
  },
  pointActions: {
    en: (n: number) => `Actions for point ${n}`,
    zh: (n: number) => `要點 ${n} 的操作`,
  },
  alternativeTo: {
    en: (alt: number, point: number) => `Alternative ${alt} to point ${point}`,
    zh: (alt: number, point: number) => `要點 ${point} 的其他答案 ${alt}`,
  },
  removeAlternative: { en: 'Remove alternative', zh: '移除其他答案' },
  any: { en: 'Any', zh: '任取' },
  creditAny: {
    en: (n: number) => `Group ${n}: credit any N points`,
    zh: (n: number) => `組別 ${n}：任取 N 個要點給分`,
  },
  all: { en: 'all', zh: '全部' },
  marksPerPoint: {
    en: (n: number) => `Group ${n}: marks per point (n@)`,
    zh: (n: number) => `組別 ${n}：每個要點的分數（n@）`,
  },
  groupMax: {
    en: (n: number) => `Group ${n}: max marks`,
    zh: (n: number) => `組別 ${n}：最高分數`,
  },
  marksShort: { en: (n: number) => `${n}m`, zh: (n: number) => `${n} 分` },
  deleteGroup: {
    en: (n: number) => `Delete group ${n}`,
    zh: (n: number) => `刪除組別 ${n}`,
  },
  firstOnly: {
    en: (n: number) => `Mark the FIRST ${n} only`,
    zh: (n: number) => `只批閱首 ${n} 項`,
  },
  addPoint: { en: '+ Point', zh: '+ 要點' },
  addGroup: { en: '+ Group', zh: '+ 組別' },
  levelsOfPerformance: { en: 'Levels of performance', zh: '表現等級' },
  removeLevels: { en: 'Remove levels', zh: '移除等級' },
  levelLowest: {
    en: (n: number) => `Level ${n} lowest mark`,
    zh: (n: number) => `等級 ${n} 最低分`,
  },
  levelHighest: {
    en: (n: number) => `Level ${n} highest mark`,
    zh: (n: number) => `等級 ${n} 最高分`,
  },
  deleteLevel: {
    en: (n: number) => `Delete level ${n}`,
    zh: (n: number) => `刪除等級 ${n}`,
  },
  levelDescriptor: {
    en: (n: number) => `Level ${n} descriptor`,
    zh: (n: number) => `等級 ${n} 描述`,
  },
  addLevel: { en: '+ Level', zh: '+ 等級' },
  effectiveCommunication: { en: 'Effective communication', zh: '有效溝通' },
  ecMax: { en: 'EC max marks', zh: '有效溝通最高分' },
  removeEc: { en: 'Remove EC', zh: '移除有效溝通' },
  ecRowMarks: {
    en: (n: number) => `EC row ${n} marks`,
    zh: (n: number) => `有效溝通第 ${n} 行的分數`,
  },
  ecDescriptor: {
    en: (marks: number) => `EC descriptor for ${marks} marks`,
    zh: (marks: number) => `${marks} 分的有效溝通描述`,
  },
  deleteEcRow: {
    en: (n: number) => `Delete EC row ${n}`,
    zh: (n: number) => `刪除有效溝通第 ${n} 行`,
  },
  addEcRow: { en: '+ EC row', zh: '+ 有效溝通行' },
  useStandardEc: { en: 'Use HKEAA standard', zh: '使用考評局標準' },
  useStandardEcHint: {
    en: 'Replace these rows with the EC statements HKEAA marking schemes print (2 / 1 / 0 marks)',
    zh: '以考評局評卷參考的有效溝通描述（2／1／0 分）取代以上各行',
  },
  showAs: { en: 'Show answer as', zh: '答案顯示方式' },
  showAsPoints: { en: 'Points', zh: '逐點' },
  showAsPointsHint: {
    en: 'One line per point, its mark beside it',
    zh: '每個要點一行，分數印在旁邊',
  },
  showAsParagraph: { en: 'Paragraph + total', zh: '一段 + 總分' },
  showAsParagraphHint: {
    en: 'HKEAA style: the points as one paragraph, the total marks beside it',
    zh: '考評局格式：要點連成一段，旁邊只印總分',
  },
  paragraphRulesHidden: {
    en: 'Shown as one paragraph: the group rules (n@, Any N, max) still count but do not print, nor do headings.',
    zh: '以一段顯示：各組規則（n@、任何 N 項、最高分）仍會計分，但規則及標題都不會印出。',
  },
  addMarkingPoints: { en: '+ Marking points', zh: '+ 評分要點' },
  // k-0475: start a part's scheme from the shapes HKEAA's DRQ schemes use.
  startFrom: { en: 'Start from', zh: '由此開始' },
  patternsLabel: { en: 'Marking scheme patterns', zh: '評分方案範本' },
  pattern_points: { en: 'Points', zh: '逐點給分' },
  pattern_pointsHint: {
    en: (n: number) => `${n} marking points, 1 mark each`,
    zh: (n: number) => `${n} 個評分要點，每點 1 分`,
  },
  pattern_reasons: { en: 'Any N reasons', zh: '任取 N 項理由' },
  pattern_reasonsHint: {
    en: (each: number, take: number, max: number) =>
      `“Possible reasons:”, ${each}@, mark the first ${take} only, max ${max}`,
    zh: (each: number, take: number, max: number) =>
      `「可能理由：」，${each}@，只批閱首 ${take} 項，最高 ${max} 分`,
  },
  pattern_paragraph: { en: 'Paragraph + total', zh: '一段 + 總分' },
  pattern_paragraphHint: {
    en: (n: number) => `One paragraph answer with (${n}) beside it`,
    zh: (n: number) => `一段答案，旁邊寫 (${n})`,
  },
  pattern_explainDiagram: { en: 'Explain + diagram', zh: '文字說明 + 圖' },
  pattern_explainDiagramHint: {
    en: (verbal: number, diagram: number) =>
      `“Verbal elaboration:” (${verbal}) and “Indicate in the figure:” ${diagram} × (1)`,
    zh: (verbal: number, diagram: number) => `「文字說明：」(${verbal}) 及「在圖中顯示：」${diagram} × (1)`,
  },
  pattern_essay: { en: 'Essay + EC', zh: '論述 + 有效溝通' },
  pattern_essayHint: {
    en: (content: number, ec: number) =>
      ec > 0
        ? `EC table (max ${ec}), content max ${content}, indicative points under “achieved” and “limits” headings`
        : `Content max ${content}, indicative points under “achieved” and “limits” headings`,
    zh: (content: number, ec: number) =>
      ec > 0
        ? `有效溝通表格（最高 ${ec} 分）、內容最高 ${content} 分，「如何達成」及「限制因素」標題下的參考要點`
        : `內容最高 ${content} 分，「如何達成」及「限制因素」標題下的參考要點`,
  },
  chipNone: { en: 'Scheme', zh: '評分' },
  chipNoneHint: { en: 'No marking scheme yet: open it', zh: '未有評分方案：按此開啟' },
  chipDoneHint: { en: 'The marking scheme matches the marks: open it', zh: '評分方案與分數相符：按此開啟' },
  ecStandardFolded: {
    en: 'HKEAA standard statements for 2, 1 and 0 marks, in English and Chinese.',
    zh: '考評局 2、1、0 分的標準描述（中英對照）。',
  },
  ecEditWording: { en: 'Edit wording', zh: '修改字眼' },
  addHeading: { en: '+ Heading', zh: '+ 標題' },
  groupHeading: {
    en: (n: number) => `Group ${n} heading`,
    zh: (n: number) => `組別 ${n} 標題`,
  },
  removeHeading: { en: 'Remove heading', zh: '移除標題' },
  rules: { en: 'Rules', zh: '規則' },
  rulesHint: {
    en: 'Any N, n@ and max for this group',
    zh: '此組別的「任取 N」、n@ 及最高分',
  },
  addOr: { en: '+ OR answer', zh: '+ OR 解法' },
  addEcTable: { en: '+ EC table', zh: '+ 有效溝通表格' },
  addLevelsShort: { en: '+ Levels', zh: '+ 等級' },
  addContentMax: { en: '+ Content max', zh: '+ 內容最高分' },
  addContentMaxHint: {
    en: 'State the content mark (“The maximum mark for content is N marks”), for indicative points with no mark each',
    zh: '註明內容分數（「內容最高 N 分」），適用於每點不設分數的參考要點',
  },
  contentMax: { en: 'Content max', zh: '內容最高分' },
  removeContentMax: { en: 'Remove content max', zh: '移除內容最高分' },
  indicativeNote: {
    en: 'Indicative content: the points carry no marks; the content max is the mark.',
    zh: '參考要點：各點不設分數，以內容最高分評分。',
  },
  addOrRoute: { en: 'Add OR route', zh: '加入 OR 解法' },
  addLevels: { en: 'Add level descriptors', zh: '加入等級描述' },
  addEc: { en: 'Add effective communication', zh: '加入有效溝通' },
  removeScheme: { en: 'Remove marking scheme', zh: '移除評分方案' },
  markingScheme: { en: 'Marking scheme', zh: '評分方案' },
  teacherVersion: { en: '· teacher version', zh: '· 教師版' },
  mismatch: {
    en: (scheme: number, printed: number) => `The scheme awards ${scheme}, the paper prints ${printed}`,
    zh: (scheme: number, printed: number) => `方案合共給 ${scheme} 分，試卷印出 ${printed} 分`,
  },
  awardsTotal: { en: 'What the scheme awards in total', zh: '方案合共給予的分數' },
  schemeActions: { en: 'Marking scheme actions', zh: '評分方案操作' },
  routesDisagree: { en: 'The OR routes award different totals.', zh: '各 OR 解法的總分不同。' },
  or: { en: 'or', zh: '或' },
  deleteRoute: {
    en: (n: number) => `Delete route ${n}`,
    zh: (n: number) => `刪除解法 ${n}`,
  },
});
