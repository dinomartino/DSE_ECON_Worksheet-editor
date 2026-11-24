import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * A canned OpenAI-compatible provider for `scripts/ai-verify.mjs` (§I.4), so the browser
 * run needs no real key and production code needs no test hooks. Point the app's Custom
 * provider at `http://localhost:8787/v1`.
 *
 * Replies per item of the app's JSON payload (the last user turn), keyed by the source:
 *   - a phrase in PHRASES → its translation (supply → 供給, which the deny list auto-fixes;
 *     "elastic demand" → 低彈性需求, a conflict row, unticked);
 *   - a `<blank/>` → dropped (the repair pass drops it again → failed row);
 *   - a source holding "(long)" in a request of more than one item → finish_reason
 *     "length" (the run bisects);
 *   - anything else → the source with a 譯： / EN: prefix, tags kept.
 * A system prompt naming "questions-from-source" (E3) gets canned, valid questions instead.
 * The question studio (k-0499): a "question-studio-write" request gets that many invented
 * MC questions on price elasticity (the key placed where `make.keys` says; a rewrite or
 * redo gets fresh ones; a teacherNote holding "!look" makes the solver disagree with them),
 * and a "question-studio-solve" request is answered from what the writer wrote.
 * A request whose system prompt is the answer writer's (E1) gets a valid canned answer,
 * a scheme of 1-mark points totalling the marks, and a rationale per asked option.
 * A quality-check request (E4) gets canned findings instead (`qualityReply`); a syllabus
 * coverage request (k-0317) gets canned codes by keyword (`coverageReply`); a wording
 * enhancement request (k-0549) gets canned rewordings (`polishReply`).
 * Base-URL prefixes: `/region/v1` answers Gemini's FAILED_PRECONDITION location error,
 * `/401/v1` rejects the key, `/slow/v1` answers after 4 s (Stop and the scrim question). `GET /__count` and `POST /__reset` expose the request count.
 *
 *   node scripts/ai-mock-server.mjs [--port=8787]
 */

export const MOCK_MODEL = 'mock-translator';

const PHRASES = [
  ['Explain why the demand curve slopes downward.', '解釋為何需求曲線向右下傾斜。'],
  ['Supply falls, so the price rises.', '供給減少，因此價格上升。'],
  ['State one reason why elastic demand lowers total revenue.', '寫出一個低彈性需求令總收入下降的原因。'],
  ['Price ($)', '價格（元）'],
  ['Quantity', '數量'],
  ['Price level', '物價水平'],
  ['解釋何謂機會成本。', 'Explain what is meant by opportunity cost.'],
];

const CJK = /[㐀-鿿]/;

function translate(text) {
  for (const [en, zh] of PHRASES) {
    if (text === en) return zh;
    if (text === zh) return en;
  }
  if (text.includes('<blank/>')) return text.replaceAll('<blank/>', '').trim();
  return CJK.test(text) ? `EN: ${text}` : `譯：${text}`;
}

function payloadOf(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const content = typeof last?.content === 'string' ? last.content : '';
  try {
    return JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1));
  } catch {
    return { groups: [] };
  }
}

function completion(content, finishReason = 'stop') {
  return {
    id: 'mock',
    object: 'chat.completion',
    model: MOCK_MODEL,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  };
}

/** Every `{key, text}` item in the payload, wherever it sits (groups, or a bare test item). */
function itemsOf(payload) {
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (typeof node.key === 'string' && typeof node.text === 'string') out.push(node);
    else Object.values(node).forEach(walk);
  };
  walk(payload?.groups ?? payload);
  return out;
}

/** "Questions from a source" (E3): canned, valid items for what the payload's `make` asks. */
function sourceReply(body) {
  const payload = payloadOf(body);
  const langs = Array.isArray(payload.languages) ? payload.languages : ['en'];
  const t = (en, zh) => ({ en: langs.includes('en') ? en : '', zh: langs.includes('zh') ? zh : '' });
  const questions = [];
  const mcq = payload.make?.mcq?.count ?? 0;
  for (let i = 0; i < mcq; i += 1) {
    if (i === 0) {
      questions.push({
        kind: 'mcq',
        stem: t('Which of the following about the market in the source is/are correct?', '根據資料，以下有關該市場的描述，何者正確？'),
        statements: [t('Demand for the good increased.', '該物品的需求增加。'), t('The price of the good rose.', '該物品的價格上升。'), t('Supply of the good fell.', '該物品的供應減少。')],
        options: [t('(1) and (2) only', '只有(1)及(2)'), t('(1) and (3) only', '只有(1)及(3)'), t('(2) and (3) only', '只有(2)及(3)'), t('(1), (2) and (3)', '(1)、(2)及(3)')],
        answer: 0,
        explanation: t('The source reports higher demand and a higher price.', '資料指出需求增加及價格上升。'),
        parts: [],
      });
      continue;
    }
    const letter = ['A', 'B', 'C', 'D', 'E', 'F'][i] ?? String(i);
    questions.push({
      kind: 'mcq',
      stem: t(`Question ${letter} about the source: which change best explains the price movement?`, `有關資料的問題${letter}：以下哪項變化最能解釋價格變動？`),
      statements: [],
      options: [t('An increase in demand', '需求增加'), t('A decrease in demand', '需求減少'), t('An increase in supply', '供應增加'), t('A price ceiling', '價格上限')],
      answer: 0,
      explanation: t('Higher demand raises the equilibrium price.', '需求增加令均衡價格上升。'),
      parts: [],
    });
  }
  if (payload.make?.structured) {
    const long = /(\d+)\D+(\d+)/.exec(String(payload.make.structured.totalMarks ?? ''));
    const marks = long && Number(long[2]) >= 8 ? [2, 4, 4] : [2, 3];
    const stems = [
      ['Identify **ONE** change in the market described in the source.', '指出資料所述市場的**一項**變化。'],
      ['With reference to the source, explain the change in price.', '參考資料，解釋價格的變化。'],
      ['Discuss whether the government should intervene in this market.', '討論政府應否干預這個市場。'],
    ];
    questions.push({
      kind: 'structured',
      stem: t('Read the source below and answer the questions.', '細閱以下資料，然後回答問題。'),
      statements: [],
      options: [],
      answer: 0,
      explanation: t('', ''),
      parts: marks.map((m, i) => ({
        stem: t(stems[i][0], stems[i][1]),
        marks: m,
        answer: t('A model answer drawn from the source.', '根據資料的參考答案。'),
        points: Array.from({ length: m }, (_, k) => ({ text: t(`Point ${k + 1}`, `要點${k + 1}`), marks: 1 })),
      })),
    });
  }
  return completion(JSON.stringify({ questions }));
}

/** The answer writer's system prompt (`src/answers/promptText.ts`) opens with this. */
const ANSWERS_MARKER = 'You write HKDSE Economics model answers';

/** E1: a model answer, 1-mark points totalling the marks, a rationale per asked letter. */
function answersReply(payload) {
  const zh = (payload.languages ?? []).includes('zh');
  const items = (payload.questions ?? []).flatMap((q) =>
    (q.items ?? []).map((item) => {
      const write = item.write ?? [];
      if (item.type === 'choice') {
        const rationales = write.map((letter) => ({
          option: letter,
          en: letter === item.correct ? 'Correct: street lighting is non-rival and non-excludable.' : `Incorrect: option ${letter} is rival and excludable.`,
          zh: zh ? (letter === item.correct ? '正確：街燈具非競爭性及非排他性。' : `錯誤：選項${letter}具競爭性及排他性。`) : '',
        }));
        return { key: item.key, answerEn: '', answerZh: '', points: [], rationales };
      }
      const answer = write.includes('answer');
      const points = write.includes('scheme')
        ? Array.from({ length: item.marks ?? 0 }, (_, n) => ({
            en: n === 0 ? 'The tax raises the cost of production.' : `Supply decreases, so the price rises (${n + 1}).`,
            zh: zh ? (n === 0 ? '稅項令生產成本上升。' : `供應減少，因此價格上升（${n + 1}）。`) : '',
            marks: 1,
          }))
        : [];
      return {
        key: item.key,
        answerEn: answer ? 'The tax raises the cost of production.\nSupply decreases, so the equilibrium price rises.' : '',
        answerZh: answer && zh ? '稅項令生產成本上升。\n供應減少，因此均衡價格上升。' : '',
        points,
        rationales: [],
      };
    }),
  );
  return completion(JSON.stringify({ items }));
}

/** The quality check (E4), recognised by its system prompt's marker (`src/quality/promptText.ts`). */
const QUALITY_MARKER = 'HKDSE Economics co-marker';

function systemOf(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const system = messages.find((m) => m.role === 'system');
  return typeof system?.content === 'string' ? system.content : '';
}

/**
 * Canned co-marker findings: an unemphasised "not"/"except" in a stem, "Explain" for
 * 1 mark, and English "rise/rose" against 中文 下跌. Anything else is fine: `{"items":[]}`.
 */
export function qualityReply(payload) {
  const items = [];
  for (const question of payload?.questions ?? []) {
    for (const entry of question.entries ?? []) {
      const en = entry.en ?? '';
      const zh = entry.zh ?? '';
      if (entry.role === 'stem' && /\b(not|except)\b/.test(en.replace(/<b>.*?<\/b>/g, ''))) {
        items.push({ key: entry.key, issue: 'negativeStem', severity: 'look', text: 'The word “not” in the stem is not emphasised, so candidates may miss it.', suggestion: en.replace(/\bnot\b/, '<b>NOT</b>') });
      }
      if (entry.role === 'part' && entry.marks === 1 && /^Explain\b/.test(en)) {
        items.push({ key: entry.key, issue: 'commandMarks', severity: 'look', text: '“Explain” asks for a chain of reasoning, which 1 mark cannot reward.', suggestion: en.replace(/^Explain/, 'State') });
      }
      if (/\b(rise|rose)\b/.test(en) && zh.includes('下跌')) {
        items.push({ key: entry.key, issue: 'bilingual', severity: 'fix', text: 'The English says the price rose; the Chinese says it fell (下跌).', suggestion: '' });
      }
    }
  }
  return completion(JSON.stringify({ items }));
}

/** The syllabus coverage check (k-0317), recognised by `src/coverage/promptText.ts`'s marker. */
const COVERAGE_MARKER = 'HKDSE Economics syllabus tagger';

/** Words in a question → a code, first match wins; nothing matched → the scarcity point, low confidence. */
const COVERAGE_RULES = [
  [/elastic|revenue|彈性/i, 'C.ped#revenue', 'apply'],
  [/demand|需求/i, 'C.individual-demand#factors', 'apply'],
  [/supply|供應|供給/i, 'C.individual-supply#factors', 'apply'],
  [/production|factor|生產/i, 'B.factors#natural', 'know'],
  [/gdp|national income|國民收入/i, 'F.national-income#gdp', 'apply'],
  [/inflation|price level|物價/i, 'I.inflation#definitions', 'apply'],
  [/money|bank|貨幣|銀行/i, 'H.money#functions', 'know'],
  [/trade|export|import|貿易/i, 'J.trade#advantage', 'apply'],
  [/government|tax|政府|稅/i, 'C.intervention#tax-subsidy', 'evaluate'],
  [/monopol|壟斷/i, 'EL1.pricing#simple-monopoly', 'apply'],
];

export function coverageReply(payload) {
  const items = [];
  for (const question of payload?.questions ?? []) {
    const words = (question.entries ?? []).map((e) => e.text ?? '').join(' ');
    for (const unit of question.units ?? []) {
      const rule = COVERAGE_RULES.find(([pattern]) => pattern.test(words));
      const [, code, band] = rule ?? [null, 'A.scarcity#scarcity', 'know'];
      items.push({ key: unit.key, code, weight: 'main', band, conf: rule ? 'high' : 'low', why: 'Canned by the mock provider.', outside: '' });
      if (rule && unit.marks >= 4) {
        items.push({ key: unit.key, code: 'A.scarcity#choice-cost', weight: 'also', band, conf: 'medium', why: 'Canned second point.', outside: '' });
      }
    }
  }
  return completion(JSON.stringify({ items }));
}

/** Invented price-elasticity questions for the question studio (no past-paper text). Each: stem, the key, three wrong options, why. */
const STUDIO_POOL = [
  {
    stem: ['A cafe raises the price of a milk tea from $20 to $25, and the cups sold each day fall from 400 to 300. Over this range, demand for the milk tea is', '一間茶餐廳把奶茶的價格由 $20 提高至 $25，每日售出的杯數由 400 杯減至 300 杯。在這個範圍內，奶茶的需求'],
    key: ['unit elastic.', '屬單一價格彈性。'],
    wrong: [['price elastic.', '富有價格彈性。'], ['price inelastic.', '缺乏價格彈性。'], ['perfectly inelastic.', '完全缺乏價格彈性。']],
    why: ['Price rises by 25% and quantity falls by 25%, so the elasticity is 1.', '價格上升 25%，需求量下降 25%，彈性為 1。'],
    angle: 'unit elasticity from a price and quantity change',
  },
  {
    stem: ['A ferry operator lowers its fares by 10% and finds that its total revenue falls. Which of the following must be true?', '一間渡輪公司把船票價格調低 10%，總收入隨之下降。下列哪項必定正確？'],
    key: ['Demand for the ferry service is price inelastic.', '渡輪服務的需求缺乏價格彈性。'],
    wrong: [['Demand for the ferry service is price elastic.', '渡輪服務的需求富有價格彈性。'], ['Demand for the ferry service is unit elastic.', '渡輪服務的需求屬單一價格彈性。'], ['The number of passengers did not change.', '乘客人數沒有改變。']],
    why: ['Revenue falls with a lower price only if demand is inelastic.', '價格下降而收入下降，表示需求缺乏彈性。'],
    angle: 'total revenue test',
  },
  {
    stem: ['A bookshop raises the price of a textbook by 8% and the quantity demanded falls by 20%. The price elasticity of demand for the textbook is', '一間書店把一本課本的價格提高 8%，需求量減少 20%。這本課本的需求價格彈性為'],
    // Numbers: options ascending (the HKDSE house style, k-0548), the key where the plan puts it.
    ladder: ['0.4', '0.8', '1.6', '2.5', '8', '12', '28'],
    why: ['Elasticity is 20% ÷ 8% = 2.5.', '彈性為 20% ÷ 8% = 2.5。'],
    angle: 'calculation from two percentages',
  },
  {
    stem: ['If the demand for a good is perfectly inelastic, its demand curve is', '若一種物品的需求完全缺乏彈性，它的需求曲線是'],
    key: ['vertical.', '垂直的。'],
    wrong: [['horizontal.', '水平的。'], ['a downward-sloping straight line.', '一條向右下傾斜的直線。'], ['an upward-sloping curve.', '一條向右上傾斜的曲線。']],
    why: ['Quantity demanded stays the same at every price.', '無論價格如何，需求量都不變。'],
    angle: 'shape of the demand curve',
  },
  {
    stem: ['Moving down a straight-line demand curve, price elasticity of demand', '沿著一條向右下傾斜的直線需求曲線向下移動，需求價格彈性'],
    key: ['becomes smaller.', '變小。'],
    wrong: [['stays constant.', '保持不變。'], ['becomes larger.', '變大。'], ['first rises, then falls.', '先上升，後下降。']],
    why: ['Price falls and quantity rises, so elasticity gets smaller.', '價格下降、需求量上升，所以彈性變小。'],
    angle: 'elasticity along a line',
  },
  {
    stem: ['A phone shop cuts the price of a charger from $120 to $90 and sells 50% more. Its total revenue', '一間手機店把充電器的價格由 $120 減至 $90，銷量增加 50%。它的總收入'],
    key: ['rises, because demand is price elastic.', '上升，因為需求富有價格彈性。'],
    wrong: [['falls, because demand is price inelastic.', '下降，因為需求缺乏價格彈性。'], ['stays the same.', '保持不變。'], ['falls, because price is lower.', '下降，因為價格較低。']],
    why: ['Price falls 25% while quantity rises 50%, so revenue rises.', '價格下降 25%，銷量上升 50%，所以收入上升。'],
    angle: 'revenue after a price cut',
  },
  {
    stem: ['Demand for which of the following goods is most likely to be price elastic?', '下列哪種物品的需求最可能富有價格彈性？'],
    key: ['a brand of bottled water sold in many shops', '在很多商店發售的某個牌子樽裝水'],
    wrong: [['rice for daily meals', '日常膳食所需的白米'], ['insulin for diabetics', '糖尿病患者所需的胰島素'], ['electricity at home', '家居用電']],
    why: ['Many close substitutes make demand more elastic.', '有很多相近的替代品令需求更富彈性。'],
    angle: 'close substitutes',
  },
  {
    stem: ['A tunnel company raises its toll from $30 to $36. The number of vehicles per day falls from 5 000 to 4 000. Along this range, the price elasticity of demand is', '一條隧道的通行費由 $30 提高至 $36，每日車輛數目由 5 000 輛減至 4 000 輛。在這個範圍內，需求價格彈性為'],
    ladder: ['0.2', '0.5', '0.8', '1', '1.2', '2', '5'],
    why: ['Price rises 20% and quantity falls 20%, so the elasticity is 1.', '價格上升 20%，數量下降 20%，所以彈性為 1。'],
    angle: 'two changes of 20%',
  },
];
/**
 * k-0531: a real model's table draft (Claude Sonnet standing in for Gemini, to the studio's real
 * write request), its lead-in and last sentence in its own words. A teacherNote holding "!table"
 * makes it the first question of a write.
 */
const STUDIO_TABLE = {
  stem: [
    'Good Y is sold in a competitive market. Its demand and supply schedules are given below.\nPrice ($) | Quantity demanded (units) | Quantity supplied (units)\n20 | 100 | 40\n25 | 85 | 55\n30 | 70 | 70\n35 | 55 | 85\nWhat happens in the market when a minimum price of $35 is imposed? There is a',
    '物品 Y 在競爭市場出售，其需求及供應表如下。\n價格（$）| 需求量（單位）| 供應量（單位）\n20 | 100 | 40\n25 | 85 | 55\n30 | 70 | 70\n35 | 55 | 85\n當政府實施 $35 的最低價格時，市場上會有',
  ],
  key: ['surplus of 30 units.', '過剩 30 單位。'],
  wrong: [['shortage of 30 units.', '短缺 30 單位。'], ['surplus of 15 units.', '過剩 15 單位。'], ['surplus of 85 units.', '過剩 85 單位。']],
  why: ['At $35, quantity supplied is 85 and quantity demanded is 55: a surplus of 30 units.', '價格為 $35 時，供應量為 85，需求量為 55，過剩 30 單位。'],
  angle: 'price floor read from a table',
};
/**
 * k-0548: a draft off the HKDSE house style, so the style row has something to say: an asking
 * "not" in lower case, "1,000" with a comma, a half-width comma in the 中文. A teacherNote
 * holding "!style" makes it the first question of a write.
 */
const STUDIO_STYLE = {
  stem: [
    'A firm raises its output from 1,000 units to 1,500 units. Which of the following is not a possible reason?',
    '一間廠商把產量由 1,000 單位增至 1,500 單位,下列哪項不是可能的原因？',
  ],
  key: ['The price of its product falls.', '其產品的價格下降。'],
  wrong: [['The price of its product rises.', '其產品的價格上升。'], ['The wage rate it pays falls.', '它支付的工資率下降。'], ['Its production technology improves.', '它的生產技術改善。']],
  why: ['A lower price makes a firm produce less, not more; the other three raise output.', '價格下降會令廠商減產而非增產；其餘三項都會令產量上升。'],
  angle: 'off the house style on purpose',
};
/** studio-verify-kit.mjs's bank question DSE2099/P1/Q2, word for word: what "!copy" writes (k-0531). */
const STUDIO_BANK_COPY = {
  stem: ['A taxi company raises its fares by 6% and the number of trips falls by 3%. The price elasticity of demand for its trips is', '一間的士公司把車資提高 6%，載客次數減少 3%。其載客服務的需求價格彈性為'],
  options: [['0.5', '0.5'], ['2', '2'], ['3', '3'], ['9', '9']],
};
let studioNext = 0;
/** Written stems and their keys, so the blind solver can answer them (and disagree on request). */
const studioKeys = new Map();
const studioNorm = (text) => String(text).replace(/\*\*/g, '').replace(/[\s$,.，。：:()（）]/g, '').toLowerCase();

function studioWriteReply(payload) {
  const langs = Array.isArray(payload.languages) ? payload.languages : ['en'];
  const t = (pair) => ({ en: langs.includes('en') ? pair[0] : '', zh: langs.includes('zh') ? pair[1] : '' });
  const count = payload.rewrite ? 1 : (payload.redo?.length || payload.make?.count || 1);
  const keys = Array.isArray(payload.make?.keys) ? payload.make.keys : [];
  const disagree = /!look/.test(String(payload.teacherNote ?? ''));
  // k-0531: "!table" puts the table draft first; "!copy" makes the last question (and its redo) a word-for-word copy of
  // the bank question DSE2099/P1/Q2 in studio-verify-kit.mjs (not the picked reference: a copy of that is allowed), so it stays warned.
  const table = /!table/.test(String(payload.teacherNote ?? '')) && !payload.redo && !payload.rewrite;
  const copy = /!copy/.test(String(payload.teacherNote ?? '')) && !payload.rewrite;
  const style = /!style/.test(String(payload.teacherNote ?? '')) && !payload.redo && !payload.rewrite;
  const questions = [];
  for (let i = 0; i < count; i += 1) {
    if (copy && (payload.redo || i === count - 1)) {
      const written = t(STUDIO_BANK_COPY.stem);
      studioKeys.set(studioNorm(written.en || written.zh), 0);
      questions.push({ stem: written, statements: [], options: STUDIO_BANK_COPY.options.map(t), answer: 0, explanation: t(['Elasticity is 3% ÷ 6% = 0.5.', '彈性為 3% ÷ 6% = 0.5。']), angle: 'a copy of a bank question' });
      continue;
    }
    const item = table && i === 0 ? STUDIO_TABLE : style && i === 0 ? STUDIO_STYLE : STUDIO_POOL[studioNext % STUDIO_POOL.length];
    if (item !== STUDIO_TABLE && item !== STUDIO_STYLE) studioNext += 1;
    const at = Number.isInteger(keys[i]) && keys[i] >= 0 && keys[i] <= 3 ? keys[i] : 0;
    // A number ladder (key in the middle) gives four ascending options with the key at `at`.
    const options = item.ladder ? item.ladder.slice(3 - at, 7 - at).map((n) => [n, n]) : [...item.wrong];
    if (!item.ladder) options.splice(at, 0, item.key);
    const stem = disagree ? [`${item.stem[0]} [look]`, `${item.stem[1]} [look]`] : item.stem;
    const written = t(stem);
    studioKeys.set(studioNorm(written.en || written.zh), at);
    questions.push({ stem: written, statements: [], options: options.map(t), answer: at, explanation: t(item.why), angle: item.angle });
  }
  return completion(JSON.stringify({ questions }));
}

function studioSolveReply(payload) {
  const answers = (payload.questions ?? []).map((q) => {
    const known = studioKeys.get(studioNorm(q.stem));
    const answer = known ?? 0;
    // A question marked [look] is one the solver reads differently from its key.
    return { id: q.id, working: 'Worked out from the numbers in the stem.', answer: /\[look\]/.test(q.stem) ? (answer + 1) % 4 : answer, ambiguous: false };
  });
  return completion(JSON.stringify({ answers }));
}

/** The studio's step 1 (k-0514 `pick.ts`): the key point a request is about, with a reason. */
export function studioPickReply(payload) {
  const words = `${payload?.request ?? ''} ${JSON.stringify(payload?.examples ?? [])}`;
  // A follow-up keeps the chat's key point (k-0520 `currentKeyPoints`) unless it names another.
  const current = payload?.currentKeyPoints?.[0]?.code;
  const named = /unit tax|從量稅|subsid|elastic|彈性/i.test(payload?.request ?? '');
  const pick = current && !named
    ? { code: current, reason: 'The request only changes the question, so the key point stays.', reasonZh: '這個要求只改題目，課題重點不變。' }
    : /unit tax|從量稅|subsid/i.test(payload?.request ?? '')
      ? { code: 'C.intervention', reason: 'The request asks about a unit tax, a market intervention.', reasonZh: '要求問的是從量稅，屬市場干預。' }
      : /elastic|彈性/i.test(words)
        ? { code: 'C.ped', reason: 'It asks how the quantity demanded responds to a change in price.', reasonZh: '題目問需求量對價格變動的反應。' }
        : { code: 'C.equilibrium', reason: 'It asks how demand and supply set the price.', reasonZh: '題目問需求與供應如何決定價格。' };
  return completion(JSON.stringify({ picks: [pick] }));
}

/** An AI-made diagram for a draft (k-0515 `diagramGen`): a demand curve and a supply curve, demand shifting right. */
export function studioDiagramReply() {
  const t = (en, zh) => ({ en, zh });
  return completion(
    JSON.stringify({
      kind: 'curves',
      reason: 'The question is about demand and price: a demand-supply diagram.',
      placement: 'question',
      template: '',
      title: t('', ''),
      xAxis: t('Quantity', '數量'),
      yAxis: t('Price', '價格'),
      curves: [
        { id: 'D0', role: 'demand', slope: 'normal', place: 'mid', label: 'D_0' },
        { id: 'S', role: 'supply', slope: 'normal', place: 'mid', label: 'S' },
      ],
      shifts: [{ of: 'D0', id: 'D1', direction: 'right', size: 'normal', label: 'D_1' }],
      levels: [],
      equilibria: [
        { a: 'D0', b: 'S', name: '', yTick: 'P_0', xTick: 'Q_0' },
        { a: 'D1', b: 'S', name: '', yTick: 'P_1', xTick: 'Q_1' },
      ],
      gaps: [],
      shades: [],
      marks: [],
      changeArrows: true,
      chart: { type: 'bar', categories: [], series: [], yTitle: t('', ''), xTitle: t('', '') },
    }),
  );
}

/**
 * k-0545: several figures in one request (`diagramGen/set.ts`, task "diagram-set"). A question
 * from `setFixtures.json` (recognised by its first figure's note) gets its recorded reply; any
 * other gets this demand-supply figure at every place asked.
 */
export const SET_FIXTURES = JSON.parse(readFileSync(new URL('../src/diagramGen/setFixtures.json', import.meta.url), 'utf8')).fixtures;

export function studioDiagramSetReply(payload) {
  const asked = Array.isArray(payload.figures) ? payload.figures : [];
  const known = SET_FIXTURES.find((f) => f.question.figures[0]?.note === asked[0]?.note);
  if (known) return completion(JSON.stringify(known.reply));
  const one = JSON.parse(studioDiagramReply().choices[0].message.content);
  return completion(JSON.stringify({ gridAsks: 'none', figures: asked.map((f) => ({ at: f.at, ...one })) }));
}

/** Wording enhancement (k-0549), recognised by `src/polish/prompt.ts`'s marker. */
const POLISH_MARKER = 'Task: question-polish.';

const POLISH_EN = [
  [/\bWhich one of the following\b/g, 'Which of the following'],
  [/\bcan't\b/g, 'cannot'],
  [/\bdon't\b/g, 'do not'],
  [/\bwill not\b/g, 'will <b>NOT</b>'],
  [/\bis not\b/g, 'is <b>NOT</b>'],
  [/(\d),(\d{3})(?!\d)/g, '$1 $2'],
  [/\bIn your opinion, /g, ''],
];
const POLISH_ZH = [
  [/,/g, '，'],
  [/\?/g, '？'],
  [/:/g, '：'],
  [/下面哪一個/g, '下列哪項'],
];

/**
 * Canned rewordings: English contractions spelt out, "not" in the question line in bold
 * capitals, "1,000" → "1 000"; 中文 half-width punctuation made full-width and 「下列哪項」.
 * Markers in a text: "!num" changes a number in it, "!order" swaps options A and B, "!key"
 * answers another letter (the client's guards must refuse all three).
 */
export function polishReply(payload) {
  const items = (payload.questions ?? []).map((q) => {
    const all = JSON.stringify(q.fields);
    const fields = [];
    const options = q.fields.filter((f) => f.role === 'option');
    for (const field of q.fields) {
      const out = { id: field.id, en: '', zh: '', why: { en: '', zh: '' } };
      let changed = false;
      for (const side of ['en', 'zh']) {
        if (typeof field[side] !== 'string') continue;
        let text = field[side];
        for (const [re, to] of side === 'en' ? POLISH_EN : POLISH_ZH) text = text.replace(re, to);
        if (text.includes('!num')) text = text.replace('!num', '').replace(/\d+/, (n) => String(Number(n) + 5)).trim();
        if (all.includes('!order') && field.role === 'option' && options.length >= 2) {
          const swap = field.id === options[0].id ? options[1] : field.id === options[1].id ? options[0] : null;
          if (swap && typeof swap[side] === 'string') text = swap[side];
        }
        out[side] = text;
        if (text !== field[side]) changed = true;
      }
      if (!changed) continue;
      out.why = { en: 'In the HKDSE house style: plain words, the negative in bold capitals.', zh: '依 HKDSE 風格：用字簡潔，否定字以粗體大楷標示。' };
      fields.push(out);
    }
    const letters = 'ABCD';
    const answer = all.includes('!key') ? letters[(letters.indexOf(q.answer) + 1) % 4] : q.answer;
    return { q: q.q, answer, fields };
  });
  return completion(JSON.stringify({ items }));
}

export function reply(body) {
  if (systemOf(body).includes(POLISH_MARKER)) return polishReply(payloadOf(body));
  if (systemOf(body).includes('Task: question-studio-pick.')) return studioPickReply(payloadOf(body));
  if (systemOf(body).includes('You draw diagrams for HKDSE Economics questions')) {
    return payloadOf(body).task === 'diagram-set' ? studioDiagramSetReply(payloadOf(body)) : studioDiagramReply();
  }
  if (systemOf(body).includes(COVERAGE_MARKER)) return coverageReply(payloadOf(body));
  if (systemOf(body).includes(ANSWERS_MARKER)) return answersReply(payloadOf(body));
  if (systemOf(body).includes(QUALITY_MARKER)) return qualityReply(payloadOf(body));
  if (systemOf(body).includes('question-studio-write')) return studioWriteReply(payloadOf(body));
  if (systemOf(body).includes('question-studio-solve')) return studioSolveReply(payloadOf(body));
  if (systemOf(body).includes('questions-from-source')) return sourceReply(body);
  const items = itemsOf(payloadOf(body));
  if (items.length > 1 && items.some((i) => i.text.includes('(long)'))) {
    return completion('{"items":[{"key":"' + items[0].key + '","text":"', 'length');
  }
  const out = items
    .map((i) => ({ key: i.key, text: translate(i.text) }))
    .filter((i, n) => !items[n].text.includes('<blank/>'));
  return completion(JSON.stringify({ items: out }));
}

const REGION = {
  error: {
    code: 400,
    message: 'User location is not supported for the API use.',
    status: 'FAILED_PRECONDITION',
  },
};
const UNAUTHORIZED = {
  error: { message: 'Incorrect API key provided.', type: 'invalid_request_error', code: 'invalid_api_key' },
};

export function startMockServer(port = 8787) {
  let count = 0;
  const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    const send = (status, json) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(json));
    };
    if (req.method === 'OPTIONS') return res.writeHead(204).end();
    if (req.url === '/__count') return send(200, { count });
    if (req.url === '/__reset') {
      count = 0;
      return send(200, { count });
    }
    count += 1;
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      if (req.url.startsWith('/region/')) return send(400, REGION);
      if (req.url.startsWith('/401/')) return send(401, UNAUTHORIZED);
      const slow = req.url.startsWith('/slow/');
      if (req.method === 'GET' && req.url.endsWith('/models')) {
        return send(200, { object: 'list', data: [{ id: MOCK_MODEL, object: 'model' }] });
      }
      let body = null;
      try {
        body = JSON.parse(raw);
      } catch {
        return send(400, { error: { message: 'Body is not JSON.' } });
      }
      // A Stop aborts the request: nothing is sent to a closed socket.
      setTimeout(() => res.destroyed || send(200, reply(body)), slow ? 4000 : 0);
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = process.argv.find((a) => a.startsWith('--port='));
  const port = arg ? Number(arg.slice('--port='.length)) : 8787;
  await startMockServer(port);
  console.log(`ai-mock-server on http://localhost:${port}/v1`);
}
