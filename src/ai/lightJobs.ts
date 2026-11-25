import type { AiFeature } from './types';

/**
 * Own Gemini key: the cheaper model for the easy jobs, when the teacher turns it on (u-zso2).
 * Settings → AI "Use the cheaper Gemini Flash-Lite for simple jobs" (`AiSettings.geminiLight`)
 * puts `lightModel` on the config (`settings/aiSettings.ts:resolveAiConfig`); the client sends
 * a light job there (`client.ts`) and every other job to the teacher's chosen model.
 *
 * The job list is DSEcon Mentor's own (`DSE_Mentor/src/lib/ai-credits/models.ts`
 * `DEFAULT_LIGHT_FEATURES`, k-0539): the two jobs that passed its side-by-side quality check.
 * `translate` covers the bank's "fill missing 中文" too (the same engine). The key-point pick
 * (`studio.pick`) and the import check failed that check and never move. `lightJobs.test.ts`
 * compares this list with Mentor's when the Mentor repo sits beside this one.
 */

/** Gemini 3.5 Flash-Lite; its preset runs it at `thinkingLevel: 'minimal'` (`providers.ts`). */
export const GEMINI_LIGHT_MODEL = 'gemini-3.5-flash-lite';

export const LIGHT_FEATURES: readonly AiFeature[] = ['translate', 'test'];

/** The model a job runs on: the light one for a light job when it is set, else the chosen one. */
export function modelForJob(model: string, lightModel: string | undefined, feature: AiFeature | undefined): string {
  return lightModel && feature !== undefined && LIGHT_FEATURES.includes(feature) ? lightModel : model;
}

/**
 * Light models Google refused this session (not on the key's project: 404, or 403 on the
 * model), per key, so the rest of a run goes straight to the chosen model.
 */
const refused = new Set<string>();
const refusalKey = (lightModel: string, apiKey: string | null) => `${lightModel}|${(apiKey ?? '').slice(-8)}`;

export const lightRefused = (lightModel: string, apiKey: string | null) => refused.has(refusalKey(lightModel, apiKey));

const listeners = new Set<(model: string) => void>();

/** A light call was refused and ran on the chosen model instead. Plain pub-sub, like `relayOutcome.ts`. */
export function reportLightFallback(lightModel: string, apiKey: string | null): void {
  refused.add(refusalKey(lightModel, apiKey));
  for (const l of [...listeners]) {
    try {
      l(lightModel);
    } catch (error) {
      console.warn('light fallback listener failed', error);
    }
  }
}

export function onLightFallback(listener: (model: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** For tests: forget every refusal. */
export function clearLightRefusals(): void {
  refused.clear();
}
