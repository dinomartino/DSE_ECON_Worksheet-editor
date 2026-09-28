// The ✦ AI film's AI provider: Gemini, answered inside the browser from a fixed table.
//
// The film has no real key. Like `scripts/ai-mock-server.mjs` (which ai-verify drives
// through the Custom provider), this answers the app's own request with canned JSON, but
// in Gemini's native `generateContent` shape, so the app runs its real Gemini path and
// shows "Google Gemini" (the recommended provider), never a test provider or localhost.
// Unlike the mock, it knows only the film's texts: anything else fails the recording
// instead of putting a placeholder on screen.

/** Where the app sends Gemini requests (`src/ai/providers.ts`). */
export const GEMINI_HOST = 'generativelanguage.googleapis.com';

/** Every `{key, text}` item in the app's translate payload (§ src/translate/prompt.ts). */
function itemsOf(payload) {
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (typeof node.key === 'string' && typeof node.text === 'string') out.push(node);
    else Object.values(node).forEach(walk);
  };
  walk(payload?.groups ?? []);
  return out;
}

/** The payload: the last user turn's text, as JSON. */
function payloadOf(body) {
  const turns = Array.isArray(body?.contents) ? body.contents : [];
  const last = [...turns].reverse().find((t) => t.role === 'user');
  const text = (last?.parts ?? []).map((p) => p.text ?? '').join('');
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}

/**
 * A Playwright route handler for the Gemini host: each item's translation from `fills`
 * (English source → 中文). `onError(message)` hears about anything it cannot answer;
 * the app is sent a 500 then, and the film fails rather than show a wrong result.
 */
export function cannedGemini(fills, { onError, onRequest } = {}) {
  return async (route) => {
    const request = route.request();
    const fail = (message) => {
      onError?.(message);
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 500, message } }) });
    };
    if (request.method() !== 'POST' || !request.url().includes(':generateContent')) {
      return fail(`unexpected ${request.method()} ${request.url()}`);
    }
    let items;
    try {
      items = itemsOf(payloadOf(JSON.parse(request.postData() ?? '')));
    } catch (e) {
      return fail(`unreadable request: ${e.message}`);
    }
    const unknown = items.filter((item) => typeof fills[item.text] !== 'string');
    if (!items.length || unknown.length) {
      return fail(`no canned 中文 for: ${unknown.map((i) => JSON.stringify(i.text)).join(', ') || '(no items)'}`);
    }
    onRequest?.(items.map((i) => i.text));
    const reply = { items: items.map((item) => ({ key: item.key, text: fills[item.text] })) };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(reply) }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 120 },
      }),
    });
  };
}
