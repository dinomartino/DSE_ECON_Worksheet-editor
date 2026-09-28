import { createClient } from '@/ai/client';
import { loadGlossary } from '@/glossary/load';
import { resolveAiConfig } from '@/settings/aiSettings';
import { announcedSleep } from './run';
import type { RunDepsResult } from './types';

/**
 * Everything a run needs, resolved from Settings: the provider config (reading the key),
 * a client, the preset and model, and the glossary unless `glossary: false`. A glossary
 * that fails to load degrades to none: no pins, chips or repair, and the run goes on.
 */
export async function createRunDeps(opts?: { glossary?: boolean }): Promise<RunDepsResult> {
  const resolved = await resolveAiConfig();
  if (!resolved.ok) return resolved;
  const glossary = opts?.glossary === false ? null : await loadGlossary().catch(() => null);
  const { config, preset } = resolved;
  // The client's rate-limit wait shows in the run as "Waiting for {Provider}'s rate limit".
  const sleep = announcedSleep();
  return { ok: true, deps: { client: createClient(config, { sleep }), preset, model: config.model, glossary, sleep }, config };
}
