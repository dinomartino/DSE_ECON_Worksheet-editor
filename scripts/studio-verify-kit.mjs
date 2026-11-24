import { createServer } from 'node:http';
import { MOCK_MODEL } from './ai-mock-server.mjs';

/**
 * Shared by the Question studio's browser runs (`studio-chat-verify.mjs`, the studio screen;
 * `studio-panel-verify.mjs`, the editor's ✦ Write panel; k-0516): an invented Past paper bank
 * served from here, the check log, and a page wired to the mock AI with every real provider
 * blocked. `configure({ mock, bank })` first.
 */

let MOCK = 'http://localhost:8821';
let BANK = 'http://localhost:8822/';
export function configure(urls) {
  MOCK = urls.mock;
  BANK = urls.bank;
}

// ---- an invented Past paper bank: three questions, one with a demand-curve diagram ----

const DIAGRAM = `<svg xmlns="http://www.w3.org/2000/svg" width="330" height="250" viewBox="0 0 330 250" font-family="Times New Roman" font-size="13">
<polyline points="50,12 50,220 318,220" fill="none" stroke="#111" stroke-width="1.2"/>
<text x="44" y="8">Price ($)</text><text x="318" y="246" text-anchor="end">Quantity</text><text x="42" y="234" text-anchor="end">0</text>
<line x1="76" y1="40" x2="284" y2="200" stroke="#111" stroke-width="1.6"/><text x="288" y="210">D</text>
<polyline points="50,80 128,80 128,220" fill="none" stroke="#555" stroke-dasharray="3 3"/><polyline points="50,120 180,120 180,220" fill="none" stroke="#555" stroke-dasharray="3 3"/>
<circle cx="128" cy="80" r="3"/><circle cx="180" cy="120" r="3"/><text x="134" y="74">A</text><text x="186" y="114">B</text>
<text x="44" y="84" text-anchor="end">12</text><text x="44" y="124" text-anchor="end">10</text><text x="128" y="234" text-anchor="middle">400</text><text x="180" y="234" text-anchor="middle">600</text></svg>`;
const IMAGE = `data:image/svg+xml;base64,${Buffer.from(DIAGRAM).toString('base64')}`;

const bi = (en, zh = '') => ({ en: en ? [{ text: en }] : [], zh: zh ? [{ text: zh }] : [] });
const question = (n, tag, en, zh, options, key, image) => ({
  id: `pp-q${n}`,
  type: 'mcq',
  blocks: [
    { kind: 'paragraph', id: `pp-q${n}-b`, text: bi(en, zh) },
    ...(image ? [{ kind: 'image', id: `pp-q${n}-img`, src: image, widthPx: 300, heightPx: 227, naturalWidthPx: 330, naturalHeightPx: 250, align: 'center', altText: bi('Demand curve D with points A and B', '需求曲線 D 及 A、B 兩點') }] : []),
  ],
  marks: 1,
  options: options.map(([oe, oz], i) => ({ id: `pp-q${n}-o${i}`, text: bi(oe, oz) })),
  answerIndex: key,
  tags: ['C.ped', tag],
  lineage: { rootId: `pp:${tag}` },
});
const QUESTIONS = [
  question(1, 'DSE2099/P1/Q12', 'The diagram below shows the demand curve for concert tickets. When the price falls from $12 to $10, the quantity demanded rises from 400 to 600. Over this price range, the demand for tickets is', '下圖顯示演唱會門票的需求曲線。當價格由 $12 跌至 $10，需求量由 400 增至 600。在這個價格範圍內，門票的需求', [['price elastic.', '富有價格彈性。'], ['price inelastic.', '缺乏價格彈性。'], ['unitarily elastic.', '屬單一價格彈性。'], ['perfectly inelastic.', '完全缺乏價格彈性。']], 0, IMAGE),
  question(2, 'DSE2099/P1/Q2', 'A taxi company raises its fares by 6% and the number of trips falls by 3%. The price elasticity of demand for its trips is', '一間的士公司把車資提高 6%，載客次數減少 3%。其載客服務的需求價格彈性為', [['0.5', '0.5'], ['2', '2'], ['3', '3'], ['9', '9']], 0),
  question(3, 'CE2099/P2/Q3', 'The demand for table salt is price inelastic mainly because salt', '食用鹽的需求缺乏價格彈性，主要是因為鹽', [['has many close substitutes', '有很多相近的替代品'], ['takes up a very small share of income', '只佔收入很小的比例'], ['is a luxury', '是奢侈品'], ['can be stored for years', '可以儲存多年']], 1),
];
const doc = { v: 3, id: 'pp-bank-C', kind: 'bank', name: 'Demand and elasticity', title: bi('Demand and elasticity'), questions: QUESTIONS, layout: [], flow: QUESTIONS.map((q) => ({ type: 'question', id: q.id })), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const plain = (q, side) => [q.blocks[0].text[side], ...q.options.map((o) => o.text[side])].map((runs) => runs.map((r) => r.text).join('')).join(' ');
const MANIFEST = {
  version: 1,
  enabled: true,
  questions: QUESTIONS.length,
  topics: [{ id: 'C', title: { en: 'Demand and elasticity', zh: '需求與彈性' }, file: 'topics/C.json', questions: QUESTIONS.length, syllabus: ['C.ped'] }],
  search: { version: 1, questions: QUESTIONS.map((q) => ({ topic: 'C', source: q.tags[1], en: plain(q, 'en'), zh: plain(q, 'zh'), pictures: q.blocks.length > 1 ? 1 : 0 })) },
};
/**
 * A long bank under `/big/` (u-na4k): forty topics over parts A to J and many sittings, so the
 * picker's topic and year lists run past a short window. The questions are the three above.
 */
const LETTERS = 'ABCDEFGHIJ'.split('');
const FILLERS = LETTERS.flatMap((letter) => [1, 2, 3, 4].map((i) => ({ id: `${letter}-t${i}`, title: { en: `Topic ${letter}${i}`, zh: `課題 ${letter}${i}` }, file: `topics/${letter}-t${i}.json`, questions: 3, syllabus: [`${letter}.x${i}`] })));
const BIG = {
  ...MANIFEST,
  topics: [MANIFEST.topics[0], ...FILLERS],
  search: {
    version: 1,
    questions: [
      ...MANIFEST.search.questions,
      ...FILLERS.flatMap((t, n) => [0, 1].map((k) => ({ topic: t.id, source: `DSE${2030 + n * 2 + k}/P1/Q${k + 1}`, en: `Filler ${t.id} ${k}`, zh: '', pictures: 0 }))),
    ],
  },
};
const emptyTopic = (id) => ({ ...doc, id: `pp-bank-${id}`, questions: [], flow: [] });
export function startBankServer(port) {
  const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    let path = new URL(req.url, BANK).pathname;
    const big = path.startsWith('/big/');
    if (big) path = path.slice(4);
    if (path === '/manifest.json') return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(big ? BIG : MANIFEST));
    if (path === '/topics/C.json') return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(doc));
    const filler = big && path.match(/^\/topics\/([A-J]-t\d)\.json$/);
    if (filler) return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(emptyTopic(filler[1])));
    res.writeHead(404).end('not found');
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

// ---- helpers ----

export const results = [];
export async function check(name, fn) {
  // STUDIO_ONLY=<words>: run only the checks whose name holds them (a self-contained one, like k-0530's), for a quick re-run.
  if (process.env.STUDIO_ONLY && !name.includes(process.env.STUDIO_ONLY)) return;
  try {
    const detail = await fn();
    results.push({ name, ok: true });
    console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`  FAIL ${name} — ${e.message.split('\n')[0]}`);
  }
}
export const expect = (cond, message) => {
  if (!cond) throw new Error(message);
};
const PROVIDER_HOSTS = ['generativelanguage.googleapis.com', 'api.deepseek.com', 'dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com', 'openrouter.ai', 'api.openai.com', 'api.anthropic.com'];

export async function newPage(browser, { ui = 'en', slow = 0, seed, viewport = { width: 1440, height: 900 }, bank } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  context.setDefaultTimeout(20_000);
  const ai = { v: 1, provider: 'custom', models: { custom: MOCK_MODEL }, baseUrls: { custom: `${MOCK}/v1` } };
  await context.addInitScript(
    ([aiJson, bank, lang, extra]) => {
      if (sessionStorage.getItem('chat-seeded')) return;
      sessionStorage.setItem('chat-seeded', '1');
      localStorage.clear();
      for (const [key, value] of Object.entries(extra)) localStorage.setItem(key, value);
      localStorage.setItem('econgen.settings.ai', aiJson);
      sessionStorage.setItem('econgen.secret.ai:custom', 'sk-mock-verify-0000');
      localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: lang, paper: 'en' }));
      localStorage.setItem('econgen.settings.pastPapers', JSON.stringify({ v: 1, mode: 'custom', url: bank }));
    },
    [JSON.stringify(ai), bank ?? BANK, ui, seed ?? {}],
  );
  const leaks = [];
  await context.route((url) => PROVIDER_HOSTS.includes(url.hostname), (r) => {
    leaks.push(r.request().url());
    return r.fulfill({ status: 599, body: 'blocked' });
  });
  const state = { slow };
  // The mock answers at once; a delay lets the screen be seen while the AI works.
  await context.route(`${MOCK}/**`, async (r) => {
    if (state.slow) await new Promise((res) => setTimeout(res, state.slow));
    return r.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && errors.push(m.text()));
  return { context, page, leaks, errors, state };
}
