import { geminiAdapter } from './gemini';
import { isRecord, trimBase, type Adapter } from './adapter';

/**
 * DSEcon Mentor's relay (k-0519, `Outbox/k-0518/CONTRACT.md` §3): Gemini's own request,
 * wrapped as `{ feature, stream, request }` and sent to `POST {base}/generate` with the
 * sign-in token as a bearer. The server picks the model (the URL names none). The whole
 * answer is `{ response: <Gemini's>, mentor: {…} }`; a stream passes Gemini's chunks
 * through and ends with Mentor's receipt (`event: mentor`) or `event: error`, so a stream
 * without the receipt failed (`mustSettle`). `Idempotency-Key` (k-0521 F10, CONTRACT v1.3)
 * carries `req.requestKey`: a repeat with the same key gets the first answer, charged once.
 */

/** A key Mentor accepts: 8–128 of `A–Z a–z 0–9 - _ .`; anything else is not sent. */
const REQUEST_KEY = /^[A-Za-z0-9._-]{8,128}$/;

function wrap(wire: ReturnType<Adapter['build']>, feature: string, stream: boolean, base: string, token: string | null, requestKey: string | undefined) {
  const headers: Record<string, string> = { 'content-type': 'application/json', authorization: `Bearer ${token ?? ''}` };
  if (requestKey && REQUEST_KEY.test(requestKey)) headers['idempotency-key'] = requestKey;
  return {
    url: `${trimBase(base)}/generate`,
    headers,
    body: JSON.stringify({ feature, stream, request: JSON.parse(wire.body ?? '{}') as unknown }),
  };
}

export const mentorAdapter: Adapter = {
  rungs: (preset) => geminiAdapter.rungs(preset),

  build(preset, config, req, dialect) {
    return wrap(geminiAdapter.build(preset, config, req, dialect), req.feature ?? 'other', false, config.baseUrl, config.apiKey, req.requestKey);
  },

  extract(body) {
    return isRecord(body) ? geminiAdapter.extract(body.response) : null;
  },

  buildStream(preset, config, req, dialect) {
    return wrap(geminiAdapter.build(preset, config, req, dialect), req.feature ?? 'other', true, config.baseUrl, config.apiKey, req.requestKey);
  },

  streamPiece(event) {
    if (!isRecord(event)) return null;
    // `event: error` (`{"error":"upstream_error","refunded":true}`) and Gemini's own error chunk.
    if (typeof event.error === 'string') return { error: event.error };
    // `event: mentor`: the receipt that closes a stream that went well.
    if (typeof event.requestId === 'string' && 'charged' in event) return { settled: true };
    return geminiAdapter.streamPiece(event);
  },

  mustSettle: true,

  models() {
    // One server-chosen model: nothing to list.
    return { url: '', headers: {} };
  },

  parseModels: () => [],
};
