/**
 * Test-only: invented price-elasticity questions (not from any past paper) and canned
 * replies for the question studio's writer and solver. Never imported by app code.
 */
import type { BiDraft } from '@/generate/types';
import type { CompletionRequest } from '@/ai/types';
import { buildCorpusIndex, type CorpusDoc } from './nearCopy';
import type { CheckRow, Finding, SourceQuestion, StudioDraft, StudioOutcome, StudioRequest, Usage } from './types';

const bi = (en: string, zh: string): BiDraft => ({ en, zh });

export interface Invented {
  stem: BiDraft;
  statements: BiDraft[];
  options: BiDraft[];
  answer: number;
  explanation: BiDraft;
  angle: string;
}

/** Six different questions on C.ped, each clean under every local check. */
export const INVENTED: Invented[] = [
  {
    stem: bi(
      'A cafe raises the price of a milk tea from $20 to $25, and the cups sold each day fall from 400 to 300. Over this range, demand for the milk tea is',
      '一間茶餐廳把奶茶的價格由 $20 提高至 $25，每日售出的杯數由 400 杯減至 300 杯。在這個範圍內，奶茶的需求',
    ),
    statements: [],
    options: [bi('price elastic.', '富有價格彈性。'), bi('price inelastic.', '缺乏價格彈性。'), bi('unit elastic.', '屬單一價格彈性。'), bi('perfectly inelastic.', '完全缺乏價格彈性。')],
    answer: 2,
    explanation: bi(
      'Price rises by 25% and quantity falls by 25%, so the elasticity is 1. A and B need a different ratio; D needs no change in quantity.',
      '價格上升 25%，需求量下降 25%，彈性為 1。A 和 B 需要不同的比率；D 要求需求量不變。',
    ),
    angle: 'unit elasticity from a table of prices',
  },
  {
    stem: bi(
      'A ferry operator lowers its fares by 10% and finds that its total revenue falls. Which of the following must be true?',
      '一間渡輪公司把船票價格調低 10%，總收入隨之下降。下列哪項必定正確？',
    ),
    statements: [],
    options: [
      bi('Demand for the ferry service is price elastic.', '渡輪服務的需求富有價格彈性。'),
      bi('Demand for the ferry service is price inelastic.', '渡輪服務的需求缺乏價格彈性。'),
      bi('Demand for the ferry service is unit elastic.', '渡輪服務的需求屬單一價格彈性。'),
      bi('The number of passengers did not change.', '乘客人數沒有改變。'),
    ],
    answer: 1,
    explanation: bi(
      'Revenue falls when price falls only if quantity rises by a smaller percentage, which means inelastic demand.',
      '價格下降而收入下降，只在需求量上升的百分比較小時出現，即需求缺乏彈性。',
    ),
    angle: 'total revenue test',
  },
  {
    stem: bi(
      'Which of the following would make the demand for a good more price elastic?',
      '以下哪些因素會令一種物品的需求更富價格彈性？',
    ),
    statements: [
      bi('There are many close substitutes for the good.', '該物品有很多相近的替代品。'),
      bi('The good is a necessity for most buyers.', '大多數買家都視該物品為必需品。'),
      bi('Buyers have a longer time to adjust.', '買家有較長時間作出調整。'),
    ],
    options: [bi('(1) and (2) only', '只有(1)及(2)'), bi('(1) and (3) only', '只有(1)及(3)'), bi('(2) and (3) only', '只有(2)及(3)'), bi('(1), (2) and (3)', '(1)、(2)及(3)')],
    answer: 1,
    explanation: bi(
      'Close substitutes and more time raise elasticity; a necessity lowers it.',
      '相近替代品及較長的調整時間令彈性增加；必需品則令彈性減少。',
    ),
    angle: 'determinants as a combination item',
  },
  {
    stem: bi(
      'A bookshop raises the price of a textbook by 8% and the quantity demanded falls by 20%. The price elasticity of demand for the textbook is',
      '一間書店把一本課本的價格提高 8%，需求量減少 20%。這本課本的需求價格彈性為',
    ),
    statements: [],
    options: [bi('0.4', '0.4'), bi('2.5', '2.5'), bi('8', '8'), bi('12', '12')],
    answer: 1,
    explanation: bi(
      'Elasticity is 20% ÷ 8% = 2.5. 0.4 inverts the ratio; 8 and 12 use a single percentage.',
      '彈性為 20% ÷ 8% = 2.5。0.4 把比率倒轉；8 和 12 只用了單一的百分比。',
    ),
    angle: 'calculation from two percentages',
  },
  {
    stem: bi(
      'If the demand for a good is perfectly inelastic, its demand curve is',
      '若一種物品的需求完全缺乏彈性，它的需求曲線是',
    ),
    statements: [],
    options: [bi('horizontal.', '水平的。'), bi('vertical.', '垂直的。'), bi('a downward-sloping straight line.', '一條向右下傾斜的直線。'), bi('an upward-sloping curve.', '一條向右上傾斜的曲線。')],
    answer: 1,
    explanation: bi(
      'Quantity demanded stays the same at every price, so the curve is vertical.',
      '無論價格如何，需求量都不變，所以曲線是垂直的。',
    ),
    angle: 'shape of the demand curve',
  },
  {
    stem: bi(
      'Moving down a straight-line demand curve, price elasticity of demand',
      '沿著一條向右下傾斜的直線需求曲線向下移動，需求價格彈性',
    ),
    statements: [],
    options: [bi('stays constant.', '保持不變。'), bi('becomes smaller.', '變小。'), bi('becomes larger.', '變大。'), bi('first rises, then falls.', '先上升，後下降。')],
    answer: 1,
    explanation: bi(
      'Price falls and quantity rises, so the ratio of price to quantity falls and elasticity gets smaller.',
      '價格下降、需求量上升，價格與數量的比率下降，所以彈性變小。',
    ),
    angle: 'elasticity along a line',
  },
];

/** A reply entry as the model would send it. */
export const replyEntry = (item: Invented) => ({
  stem: item.stem,
  statements: item.statements,
  options: item.options,
  answer: item.answer,
  explanation: item.explanation,
  angle: item.angle,
});

export const writeReply = (items: Invented[]) => JSON.stringify({ questions: items.map(replyEntry) });

/** The ids and texts of a solve request's questions. */
export function solveQuestions(req: CompletionRequest): Array<{ id: string; stem: string; statements: string[]; options: string[] }> {
  return (JSON.parse(req.turns.at(-1)!.content) as { questions: Array<{ id: string; stem: string; statements: string[]; options: string[] }> }).questions;
}

/**
 * A solver that answers every question by looking its stem up: `keys` maps the English
 * stem to the index it picks (default: the invented key). `ambiguous` lists stems it flags.
 */
export function solver(override: Record<string, number> = {}, ambiguous: string[] = []) {
  return (req: CompletionRequest) => {
    const answers = solveQuestions(req).map((q) => {
      const known = INVENTED.find((i) => i.stem.en === q.stem || i.stem.zh === q.stem);
      return {
        id: q.id,
        working: 'worked out',
        answer: override[q.stem] ?? known?.answer ?? 0,
        ambiguous: ambiguous.includes(q.stem),
      };
    });
    return JSON.stringify({ answers });
  };
}

export const REQUEST: StudioRequest = {
  keyPoint: 'C.ped',
  points: [],
  examples: [],
  count: 3,
  level: 'same',
  shape: 'any',
  sides: ['en', 'zh'],
  note: '',
};

/** An invented example (the stem is the sort a teacher might pick from a bank). */
export const EXAMPLE: SourceQuestion = {
  id: 'BANK/ex1',
  label: 'EXAMPLE-LABEL-2099 Paper 1 Q99',
  stem: bi('When the price of a pen rises from $5 to $6, demand for pens falls from 200 to 190. The price elasticity of demand is closest to', '當筆的價格由 $5 升至 $6，筆的需求由 200 減至 190。需求價格彈性最接近'),
  statements: [],
  options: [bi('0.25', '0.25'), bi('0.5', '0.5'), bi('2', '2'), bi('4', '4')],
  answerIndex: 1,
  hasFigure: false,
};

/** A small corpus of invented docs, for the near-copy check. */
export const corpusOf = (docs: Array<Partial<CorpusDoc> & { en: string }>) =>
  buildCorpusIndex(docs.map((d, i) => ({ id: d.id ?? `c${i}`, kind: d.kind ?? 'bank', en: d.en, zh: d.zh ?? '' })));

// ---- the trial's record (trialLog, trialScore, trialRun) ----

/** A usage as a provider reports it. */
export const usageOf = (over: Partial<Usage> = {}): Usage => ({ requests: 2, input: 3000, output: 1500, thinking: 0, ms: 12000, ...over });

const row = (id: CheckRow['id'], state: CheckRow['state'], findings: CheckRow['findings'] = [], value?: number): CheckRow => ({ id, state, findings, ...(value === undefined ? {} : { value }) });

/** The eight rows of a draft every check passed (the key solved and agreeing, near-copy 4%). */
export const cleanRows = (): CheckRow[] => [row('shape', 'pass'), row('key', 'pass'), row('numbers', 'pass'), row('terms', 'pass'), row('syllabus', 'pass'), row('lint', 'pass'), row('style', 'pass'), row('copy', 'pass', [], 4)];

/** A draft of the invented question `from`, with the rows a test wants changed. */
export function studioDraft(id: string, over: { from?: Invented; status?: StudioDraft['status']; rows?: CheckRow[]; keyIndex?: number } = {}): StudioDraft {
  const from = over.from ?? INVENTED[0];
  const rows = cleanRows().map((r) => over.rows?.find((o) => o.id === r.id) ?? r);
  return {
    id,
    draft: { kind: 'mcq', stem: from.stem, statements: from.statements, options: from.options, answerIndex: over.keyIndex ?? from.answer, explanation: from.explanation },
    angle: from.angle,
    // As the engine sets it since k-0531: a failed check is a warning (look), never left out. Pass `status: 'failed'` for a draft saved before.
    status: over.status ?? (rows.some((r) => r.state === 'fail' || r.state === 'look') ? 'look' : 'ok'),
    checks: rows,
    attempt: 1,
  };
}

/** A write that came back with these drafts. */
export const okOutcome = (drafts: StudioDraft[], over: { usage?: Usage; notes?: Finding[] } = {}): StudioOutcome => ({
  ok: true,
  drafts,
  notes: over.notes ?? [],
  model: 'fake-model',
  usage: over.usage ?? usageOf(),
});
