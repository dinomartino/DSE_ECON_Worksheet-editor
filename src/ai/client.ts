import type { Adapter } from './adapters/adapter';
import { anthropicAdapter } from './adapters/anthropic';
import { geminiAdapter } from './adapters/gemini';
import { openaiCompatAdapter } from './adapters/openaiCompat';
import { aiErrorInfo, describeHttpError, isSchemaRejection, mapThrown } from './errors';
import { COMPLETION_TIMEOUT_MS, PROBE_TIMEOUT_MS, defaultHttpDeps, send, type HttpResponse } from './http';
import { presetFor } from './providers';
import { ITEMS_SCHEMA, parseItemsPayload } from './schema';
import {
  AiError,
  isAiError,
  type AiClient,
  type AiErrorInfo,
  type ApiFamily,
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
    if (u.username || u.password) return null;
    if (u.protocol === 'https:') return u;
    return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) ? u : null;
  } catch {
    return null;
  }
}

function log(info: AiErrorInfo): void {
  console.warn('AI request failed', { kind: info.kind, status: info.status });
}

export function createClient(config: ProviderConfig, deps?: Partial<HttpDeps>): AiClient {
  const preset = presetFor(config.provider);
  const adapter = ADAPTERS[preset.family];
  const http: HttpDeps = { ...defaultHttpDeps(), ...deps };
  // An empty base URL or model means the preset's default.
  const cfg: ProviderConfig = {
    ...config,
    baseUrl: config.baseUrl || preset.baseUrl,
    model: config.model || preset.models[0]?.id || '',
  };
  const { provider, apiKey: key, model } = cfg;
  const base = safeBaseUrl(cfg.baseUrl);
  const cacheKey = `${provider}|${model}|${cfg.baseUrl}`;

  /** Why nothing can be sent, or null. */
  const blocked = (needsModel: boolean): AiErrorInfo | null => {
    if ((preset.keyRequired && !key) || !base) return aiErrorInfo('notConfigured', provider);
    if (needsModel && !MODEL_ID.test(model)) return aiErrorInfo('model', provider, { model });
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

  async function complete(req: Parameters<AiClient['complete']>[0]) {
    const problem = blocked(true);
    if (problem) throw new AiError(problem);
    const started = http.now();
    const rungs = adapter.rungs(preset);
    let i = Math.max(0, rungs.indexOf(workingRung.get(cacheKey) ?? rungs[0]));
    let steppedForOutput = false;
    for (;;) {
      const dialect = rungs[i];
      const res = await request(adapter.build(preset, cfg, req, dialect), req.signal, req.timeoutMs ?? COMPLETION_TIMEOUT_MS);
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

  return {
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
      if (blocked(false)) return [];
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
      signal,
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    const sample = (parseItemsPayload(res.text)?.[0]?.text ?? res.text).trim().slice(0, 120);
    return { ok: true, ms: res.ms, model: res.model, sample, followedGlossary: sample.includes(TEST_TERM) };
  } catch (error) {
    return { ok: false, error: mapThrown(config.provider, error, null) };
  }
}
