import type { RunDepsResult } from './types';

/**
 * Everything a run needs, resolved from Settings: the provider config (reading the key),
 * a client, the preset and model, and the glossary unless `glossary: false`.
 */
export function createRunDeps(opts?: { glossary?: boolean }): Promise<RunDepsResult> {
  // P-ENGINE replaces this body
  void opts;
  return Promise.resolve({ ok: false, provider: 'gemini', reason: 'noKey' });
}
