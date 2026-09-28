import {
  AiError,
  type AiClient,
  type AiErrorInfo,
  type ConnectionTest,
  type HttpDeps,
  type ProviderConfig,
} from './types';

/**
 * The one client every provider goes through: the structured-output ladder, transport
 * retries and error mapping. Throws `AiError` only.
 */

function notConfigured(config: ProviderConfig): AiErrorInfo {
  return {
    kind: 'notConfigured',
    provider: config.provider,
    message: 'AI translation is not available yet.',
    fatal: true,
    actions: [],
  };
}

export function createClient(config: ProviderConfig, deps?: Partial<HttpDeps>): AiClient {
  // P-AI replaces this body
  void deps;
  return {
    complete: () => Promise.reject(new AiError(notConfigured(config))),
    listModels: async () => [],
  };
}

export function testConnection(
  config: ProviderConfig,
  signal: AbortSignal,
  deps?: Partial<HttpDeps>,
): Promise<ConnectionTest> {
  // P-AI replaces this body
  void signal;
  void deps;
  return Promise.resolve({ ok: false, error: notConfigured(config) });
}
