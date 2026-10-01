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
    zh: (n: number) => `只評閱首 ${n} 個`,
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
  addMarkingPoints: { en: '+ Marking points', zh: '+ 評分要點' },
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
