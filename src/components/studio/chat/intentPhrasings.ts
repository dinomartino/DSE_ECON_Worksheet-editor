import type { DraftBrief } from '@/questionStudio/understand';
import type { IntentKind } from './intent';

/**
 * Real phrasings of a teacher's message once drafts are on the page (k-0535, u-yu7s), with
 * what each should do. `intent.test.ts` runs every row through the computer's rules and, where
 * those are not sure, through the AI's recorded answer (`intentPhrasings.recorded.json`, made
 * with the live prompt by `scripts/intent.record.test.ts`).
 */

/** Three drafts: 1 plain, 2 with a table, 3 with a diagram and statements. */
export const PAGE: DraftBrief[] = [
  {
    no: 1,
    stem: 'The price of good X rises from $10 to $12 and the quantity demanded falls from 100 to 90 units. The demand for X is',
    statements: [],
    options: ['elastic.', 'inelastic.', 'unitarily elastic.', 'perfectly inelastic.'],
    answer: 'B',
    table: false,
    diagram: false,
    state: 'open',
  },
  {
    no: 2,
    stem: 'The table shows the supply schedule of good Y.\n| Price ($) | 4 | 6 | 8 |\n| Quantity supplied | 20 | 30 | 40 |\nThe price elasticity of supply between $4 and $6 is',
    statements: [],
    options: ['0.5.', '1.', '1.5.', '2.'],
    answer: 'B',
    table: true,
    diagram: false,
    state: 'open',
  },
  {
    no: 3,
    stem: 'Refer to the diagram. The government imposes a unit tax on good Z. Which of the following are correct?',
    statements: ['The supply curve shifts upwards.', 'Consumers bear the whole tax.', 'The quantity transacted falls.'],
    options: ['(1) and (2) only', '(1) and (3) only', '(2) and (3) only', '(1), (2) and (3)'],
    answer: 'B',
    table: false,
    diagram: true,
    state: 'open',
  },
];

export interface Phrasing {
  id: string;
  text: string;
  /** Draft numbers the last reply wrote or changed. */
  recent: number[];
  /** The composer's chip, when set. */
  chip?: number;
  want: { kind: IntentKind; drafts?: number[] };
  /** Clear enough for the computer alone: no reading request. */
  fast?: boolean;
}

const ALL3 = [1, 2, 3];

export const PHRASINGS: Phrasing[] = [
  // English
  { id: 'en-01', text: 'make draft 2 harder', recent: ALL3, want: { kind: 'edit', drafts: [2] }, fast: true },
  { id: 'en-02', text: 'Draft 3: the numbers are wrong', recent: ALL3, want: { kind: 'edit', drafts: [3] }, fast: true },
  { id: 'en-03', text: 'Q1 is too easy', recent: ALL3, want: { kind: 'edit', drafts: [1] }, fast: true },
  { id: 'en-04', text: 'the second one is too wordy', recent: ALL3, want: { kind: 'edit', drafts: [2] } },
  { id: 'en-05', text: 'make the last question harder', recent: ALL3, want: { kind: 'edit', drafts: [3] }, fast: true },
  { id: 'en-06', text: 'the one with the table: use bigger numbers', recent: ALL3, want: { kind: 'edit', drafts: [2] }, fast: true },
  { id: 'en-07', text: 'the one with the diagram should shift supply, not demand', recent: ALL3, want: { kind: 'edit', drafts: [3] }, fast: true },
  { id: 'en-08', text: 'make them all easier', recent: ALL3, want: { kind: 'edit', drafts: ALL3 }, fast: true },
  { id: 'en-09', text: 'change the options in the first one', recent: ALL3, want: { kind: 'edit', drafts: [1] }, fast: true },
  { id: 'en-10', text: 'why is B wrong in draft 1?', recent: ALL3, want: { kind: 'ask', drafts: [1] } },
  { id: 'en-11', text: 'is Q2 at DSE level?', recent: ALL3, want: { kind: 'ask', drafts: [2] } },
  { id: 'en-12', text: 'another like draft 2', recent: ALL3, want: { kind: 'another', drafts: [2] }, fast: true },
  { id: 'en-13', text: 'write 3 more on price ceilings', recent: ALL3, want: { kind: 'new' } },
  { id: 'en-14', text: 'now do the same on unit tax', recent: ALL3, want: { kind: 'new' } },
  { id: 'en-15', text: 'make it harder', recent: ALL3, want: { kind: 'unsure' } },
  { id: 'en-16', text: 'make it harder', recent: [2], want: { kind: 'edit', drafts: [2] }, fast: true },
  { id: 'en-17', text: 'draft 5 harder', recent: ALL3, want: { kind: 'unsure' } },
  { id: 'en-18', text: 'can you explain the answer to the third one', recent: ALL3, want: { kind: 'ask', drafts: [3] } },
  { id: 'en-19', text: 'use a table instead in Q3', recent: ALL3, want: { kind: 'edit', drafts: [3] }, fast: true },
  { id: 'en-20', text: 'translate the explanation of draft 2 into simpler English', recent: ALL3, want: { kind: 'edit', drafts: [2] }, fast: true },
  { id: 'en-21', text: 'give me two more like the first one', recent: ALL3, want: { kind: 'another', drafts: [1] }, fast: true },
  { id: 'en-22', text: 'price elasticity of supply with a diagram', recent: ALL3, want: { kind: 'new' } },
  { id: 'en-23', text: 'the one with the table, is the answer right?', recent: ALL3, want: { kind: 'ask', drafts: [2] } },
  { id: 'en-24', text: 'the stem is too long', recent: [2], want: { kind: 'edit', drafts: [2] } },
  { id: 'en-25', text: 'use property prices', recent: ALL3, chip: 1, want: { kind: 'edit', drafts: [1] }, fast: true },
  { id: 'en-26', text: 'why is (2) wrong?', recent: ALL3, chip: 3, want: { kind: 'ask', drafts: [3] } },
  // 中文 / 粵語
  { id: 'zh-01', text: 'Q2 太易', recent: ALL3, want: { kind: 'edit', drafts: [2] }, fast: true },
  { id: 'zh-02', text: '上面嗰題難啲', recent: [2], want: { kind: 'edit', drafts: [2] }, fast: true },
  { id: 'zh-03', text: '上面嗰題難啲', recent: ALL3, want: { kind: 'unsure' } },
  { id: 'zh-04', text: '改返啲選項', recent: [2], want: { kind: 'edit', drafts: [2] } },
  { id: 'zh-05', text: '第三題嘅數字唔啱', recent: ALL3, want: { kind: 'edit', drafts: [3] }, fast: true },
  { id: 'zh-06', text: '第一題點解答案係B？', recent: ALL3, want: { kind: 'ask', drafts: [1] } },
  { id: 'zh-07', text: '全部都改難啲', recent: ALL3, want: { kind: 'edit', drafts: ALL3 }, fast: true },
  { id: 'zh-08', text: '有表格嗰題用大啲嘅數字', recent: ALL3, want: { kind: 'edit', drafts: [2] }, fast: true },
  { id: 'zh-09', text: '再出三題關於最低工資', recent: ALL3, want: { kind: 'new' } },
  { id: 'zh-10', text: '仿照第二題再擬一題', recent: ALL3, want: { kind: 'another', drafts: [2] }, fast: true },
  { id: 'zh-11', text: '最後一題太難', recent: ALL3, want: { kind: 'edit', drafts: [3] }, fast: true },
  { id: 'zh-12', text: '草稿 1 改用中文情境', recent: ALL3, want: { kind: 'edit', drafts: [1] }, fast: true },
  { id: 'zh-13', text: '幫我出兩題 MC 關於外部成本', recent: ALL3, want: { kind: 'new' } },
  { id: 'zh-14', text: '呢題係咪太長？', recent: [2], want: { kind: 'ask', drafts: [2] } },
  // mixed
  { id: 'mx-01', text: 'Q3 的 diagram 要 shift supply', recent: ALL3, want: { kind: 'edit', drafts: [3] }, fast: true },
  { id: 'mx-02', text: 'make 第二題 harder', recent: ALL3, want: { kind: 'edit', drafts: [2] }, fast: true },
  { id: 'mx-03', text: '第一題 options 太相似', recent: ALL3, want: { kind: 'edit', drafts: [1] }, fast: true },
  { id: 'mx-04', text: '可唔可以 explain 下 draft 2 個答案', recent: ALL3, want: { kind: 'ask', drafts: [2] } },
];
