import type { Adapter } from './adapters/adapter';
import { anthropicAdapter } from './adapters/anthropic';
import { geminiAdapter } from './adapters/gemini';
import { mentorAdapter } from './adapters/mentor';
import { openaiCompatAdapter } from './adapters/openaiCompat';
import { aiErrorInfo, describeHttpError, isSchemaRejection, keyLikeModel, mapThrown } from './errors';
import { COMPLETION_TIMEOUT_MS, PROBE_TIMEOUT_MS, RELAY_TIMEOUT_MS, defaultHttpDeps, send, sendStream, type HttpResponse } from './http';
import { presetFor, supportsImages } from './providers';
import { ITEMS_SCHEMA, parseItemsPayload } from './schema';
import {
  AiError,
  isAiError,
  type AiClient,
  type AiErrorInfo,
  type ApiFamily,
  type CompletionResult,
  type ConnectionTest,
  type HttpDeps,
  type OutputDialect,
  type ProviderConfig,
} from './types';

/**
 * The one client every provider goes through: the structured-output ladder, transport
 * retries and error mapping. Throws `AiError` only; `console` sees `{kind, status}` only.
 */

const ADAPTERS: Record<ApiFamily, Adapter> = {
  gemini: geminiAdapter,
  openai: openaiCompatAdapter,
  anthropic: anthropicAdapter,
};

/** Also keeps the Gemini path segment safe. */
const MODEL_ID = /^[A-Za-z0-9._:/@-]{1,128}$/;

/** The rung that last worked, per `provider|model|baseUrl`, for this session. */
const workingRung = new Map<string, OutputDialect>();

/** For tests: forget every cached rung. */
export function clearDialectCache(): void {
  workingRung.clear();
}

/** https anywhere; http only on this computer; never credentials in the URL. */
function safeBaseUrl(url: string): URL | null {
  try {
    const u = new URL(url);
    // An unfilled `{WorkspaceId}` template parses as a host; it is not one.
    if (u.username || u.password || /[{}]/.test(url)) return null;
    if (u.protocol === 'https:') return u;
    return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) ? u : null;
  } catch {
    return null;
  }
}

/** A fresh `Idempotency-Key` (k-0521 F10): random, never derived from the request. */
export function newRequestKey(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The key for the `n`th body one logical request sends (a step down the rungs is a different request). */
const keyFor = (base: string, n: number) => (n === 0 ? base : `${base}-${n}`);

function log(info: AiErrorInfo): void {
  if (info.kind !== 'cancelled') console.warn('AI request failed', { kind: info.kind, status: info.status });
}

export function createClient(config: ProviderConfig, deps?: Partial<HttpDeps>): AiClient {
  const preset = presetFor(config.provider);
  // Mentor's relay wraps Gemini's request (k-0519); the family stays 'gemini' for every budget.
  const adapter = preset.relay === 'mentor' ? mentorAdapter : ADAPTERS[preset.family];
  // Field by field: a caller passing `{ sleep: undefined }` still gets the real sleep.
  const d = defaultHttpDeps();
  const http: HttpDeps = { fetch: deps?.fetch ?? d.fetch, now: deps?.now ?? d.now, sleep: deps?.sleep ?? d.sleep };
  // An empty base URL or model means the preset's default.
  const cfg: ProviderConfig = {
    ...config,
    baseUrl: config.baseUrl || preset.baseUrl,
    model: config.model || preset.models[0]?.id || '',
  };
  const { provider, apiKey: key, model } = cfg;
  const base = safeBaseUrl(cfg.baseUrl);
  const cacheKey = `${provider}|${model}|${cfg.baseUrl}`;
  const timeoutFor = (req: { timeoutMs?: number }) => req.timeoutMs ?? (preset.relay ? RELAY_TIMEOUT_MS : COMPLETION_TIMEOUT_MS);

  /** Why nothing can be sent, or null. */
  const blocked = (needsModel: boolean): AiErrorInfo | null => {
    if ((preset.keyRequired && !key) || !base) return aiErrorInfo('notConfigured', provider);
    if (needsModel && (!MODEL_ID.test(model) || keyLikeModel(model, key))) return aiErrorInfo('model', provider, { model, key });
    return null;
  };

  /** `send`, with a network failure naming the host it couldn't reach. */
  const request = async (wire: { url: string; headers: Record<string, string>; body?: string }, signal: AbortSignal, timeoutMs: number): Promise<HttpResponse> => {
    try {
      return await send(http, { provider, url: wire.url, method: wire.body === undefined ? 'GET' : 'POST', headers: wire.headers, body: wire.body, signal, timeoutMs });
    } catch (error) {
      const info = mapThrown(provider, error, null);
      if (info.kind !== 'network') throw error;
      throw new AiError(aiErrorInfo('network', provider, { host: base?.host, detail: info.detail, key }));
    }
  };

  const httpFailure = (res: HttpResponse): AiError => {
    const info = describeHttpError(provider, res.status, res.body, res.headers, { key, model });
    if (info.kind === 'quota' && model === preset.quotaFallbackModel) {
      info.actions = info.actions.filter((a) => a !== 'useFallbackModel');
    }
    return new AiError(info);
  };

  async function complete(asked: Parameters<AiClient['complete']>[0]) {
    // A provider that cannot read pictures is never sent one (the caller asks `supportsImages` to word its prompt).
    const req = asked.images?.length && !supportsImages(preset) ? { ...asked, images: undefined } : asked;
    const problem = blocked(true);
    if (problem) throw new AiError(problem);
    const started = http.now();
    const rungs = adapter.rungs(preset);
    let i = Math.max(0, rungs.indexOf(workingRung.get(cacheKey) ?? rungs[0]));
    let steppedForOutput = false;
    const baseKey = req.requestKey ?? newRequestKey();
    for (let n = 0; ; n++) {
      const dialect = rungs[i];
      const res = await request(adapter.build(preset, cfg, { ...req, requestKey: keyFor(baseKey, n) }, dialect), req.signal, timeoutFor(req));
      if (res.status < 200 || res.status >= 300) {
        if (isSchemaRejection(provider, res.status, res.body) && i < rungs.length - 1) {
          i++;
          continue;
        }
        throw httpFailure(res);
      }
      const out = adapter.extract(res.body);
      if (!out) throw new AiError(aiErrorInfo('badOutput', provider, { status: res.status }));
      // An unreadable reply steps down once, uncached (DeepSeek sometimes returns empty content).
      const unreadable = req.schema === ITEMS_SCHEMA && out.finish === 'stop' && parseItemsPayload(out.text) === null;
      if (unreadable && !steppedForOutput && i < rungs.length - 1) {
        steppedForOutput = true;
        i++;
        continue;
      }
      if (!unreadable && !steppedForOutput) workingRung.set(cacheKey, dialect);
      return { ...out, dialect, model, ms: http.now() - started };
    }
  }

  /** `complete`, read as a stream: same rungs, same errors; `onText` gets the reply so far. */
  async function stream(asked: Parameters<AiClient['complete']>[0], onText: (reply: string) => void) {
    const problem = blocked(true);
    if (problem) throw new AiError(problem);
    const req = asked.images?.length && !supportsImages(preset) ? { ...asked, images: undefined } : asked;
    const started = http.now();
    const rungs = adapter.rungs(preset);
    let i = Math.max(0, rungs.indexOf(workingRung.get(cacheKey) ?? rungs[0]));
    const baseKey = req.requestKey ?? newRequestKey();
    for (let n = 0; ; n++) {
      const dialect = rungs[i];
      const wire = adapter.buildStream(preset, cfg, { ...req, requestKey: keyFor(baseKey, n) }, dialect);
      let text = '';
      let finish: CompletionResult['finish'] | undefined;
      let usage: CompletionResult['usage'];
      let failed: string | undefined;
      let settled = false;
      let res: Awaited<ReturnType<typeof sendStream>>;
      try {
        res = await sendStream(http, { provider, url: wire.url, method: 'POST', headers: wire.headers, body: wire.body, signal: req.signal, timeoutMs: timeoutFor(req) }, (data) => {
          if (data === '[DONE]' || data === '') return;
          let event: unknown;
          try {
            event = JSON.parse(data);
          } catch {
            return;
          }
          const piece = adapter.streamPiece(event);
          if (!piece) return;
          if (piece.error) failed = piece.error;
          if (piece.settled) settled = true;
          if (piece.text) {
            text += piece.text;
            onText(text);
          }
          if (piece.finish) finish = piece.finish;
          if (piece.usage) usage = { ...usage, ...Object.fromEntries(Object.entries(piece.usage).filter(([, v]) => v !== undefined)) };
        });
      } catch (error) {
        const info = mapThrown(provider, error, null);
        if (info.kind !== 'network') throw error;
        throw new AiError(aiErrorInfo('network', provider, { host: base?.host, detail: info.detail, key }));
      }
      if (res.status < 200 || res.status >= 300) {
        if (isSchemaRejection(provider, res.status, res.body) && i < rungs.length - 1) {
          i++;
          continue;
        }
        throw httpFailure(res as HttpResponse);
      }
      if (failed !== undefined) throw new AiError(aiErrorInfo('server', provider, { status: res.status, detail: failed }));
      // A relay stream closed without its receipt was cut off: nothing it said can be trusted as whole.
      if (adapter.mustSettle && !settled) throw new AiError(aiErrorInfo('server', provider, { status: res.status, detail: 'stream ended early' }));
      workingRung.set(cacheKey, dialect);
      return { text, finish: finish ?? 'stop', dialect, model, ms: http.now() - started, ...(usage ? { usage } : {}) } satisfies CompletionResult;
    }
  }

  return {
    async stream(req, onText) {
      try {
        return await stream(req, onText);
      } catch (error) {
        const info = mapThrown(provider, error, null);
        log(info);
        throw isAiError(error) ? error : new AiError(info);
      }
    },

    async complete(req) {
      try {
        return await complete(req);
      } catch (error) {
        const info = mapThrown(provider, error, null);
        log(info);
        throw isAiError(error) ? error : new AiError(info);
      }
    },

    async listModels(signal) {
      if (blocked(false) || preset.relay) return [];
      try {
        const res = await request(adapter.models(preset, cfg), signal, PROBE_TIMEOUT_MS);
        return res.status >= 200 && res.status < 300 ? adapter.parseModels(res.body) : [];
      } catch {
        return [];
      }
    },
  };
}

const TEST_SYSTEM = [
  'Translate the text of each item from English into Traditional Chinese as used in Hong Kong secondary-school Economics.',
  'Use this glossary term exactly: price level → 物價水平',
  'Return every item with the same key.',
].join('\n');
const TEST_PAYLOAD = JSON.stringify({ items: [{ key: 't1', text: 'Price level' }] });
const TEST_TERM = '物價水平';

/**
 * One real item through the same client (key, region, CORS, model and output dialect in one
 * call; the working rung is cached). Any reply counts as connected; `followedGlossary` says
 * whether it used the pinned term.
 */
export async function testConnection(
  config: ProviderConfig,
  signal: AbortSignal,
  deps?: Partial<HttpDeps>,
): Promise<ConnectionTest> {
  const preset = presetFor(config.provider);
  const thinks = preset.models.some((m) => m.id === config.model && m.extra?.thinkingLevel && m.extra.thinkingLevel !== 'minimal');
  try {
    const res = await createClient(config, deps).complete({
      system: TEST_SYSTEM,
      turns: [{ role: 'user', content: TEST_PAYLOAD }],
      schema: ITEMS_SCHEMA,
      maxOutputTokens: Math.min(preset.outputCap, 2048 + (thinks ? 4096 : 0)),
      feature: 'test',
      signal,
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    const sample = (parseItemsPayload(res.text)?.[0]?.text ?? res.text).trim().slice(0, 120);
    return { ok: true, ms: res.ms, model: res.model, sample, followedGlossary: sample.includes(TEST_TERM) };
  } catch (error) {
    return { ok: false, error: mapThrown(config.provider, error, null) };
  }
}
