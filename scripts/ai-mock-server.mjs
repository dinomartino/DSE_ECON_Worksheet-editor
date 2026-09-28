import { createServer } from 'node:http';
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
 * A request whose system prompt is the answer writer's (E1) gets a valid canned answer,
 * a scheme of 1-mark points totalling the marks, and a rationale per asked option.
 * A quality-check request (E4) gets canned findings instead (`qualityReply`).
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

export function reply(body) {
  if (systemOf(body).includes(ANSWERS_MARKER)) return answersReply(payloadOf(body));
  if (systemOf(body).includes(QUALITY_MARKER)) return qualityReply(payloadOf(body));
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
