/**
 * The provider layer's contract. `src/ai/` imports nothing from React, the store,
 * `src/model`, `src/settings`, `@/platform` or Tauri: it is plain transport.
 */

export const PROVIDER_IDS = ['gemini', 'deepseek', 'qwen', 'openrouter', 'openai', 'anthropic', 'custom', 'ollama'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];
export type ApiFamily = 'gemini' | 'openai' | 'anthropic';
export type OutputDialect =
  | 'gemini-jsonSchema' | 'gemini-responseFormat' | 'gemini-mime'
  | 'openai-jsonSchema' | 'openai-jsonObject' | 'anthropic-jsonSchema' | 'prompt';
export type JsonSchema = Readonly<Record<string, unknown>>;

export interface ProviderPreset {
  id: ProviderId;
  /** "Google Gemini". */
  label: string;
  group: 'top' | 'more';
  /** Gemini only. */
  recommended?: true;
  hk: { status: 'available' | 'notOfficial' | 'unavailable' | 'local' | 'unknown'; note: string };
  /** One line under the name. */
  blurb: string;
  /** Verified facts only; the Translate privacy line and Settings "What is sent". */
  privacy: string;
  family: ApiFamily;
  /** '' for custom. */
  baseUrl: string;
  /** Qwen regions. A `template` URL holds `{WorkspaceId}`, filled from the Workspace field. */
  baseUrlChoices?: ReadonlyArray<{ label: string; url: string; template?: boolean }>;
  baseUrlEditable: boolean;
  /** false: ollama. */
  keyRequired: boolean;
  /** https only; opened with platform openExternal. */
  keyUrl?: string;
  /** Key-shape check. */
  keyPrefix?: RegExp;
  /** [0] = default. */
  models: ReadonlyArray<{ id: string; label: string; note?: string; extra?: Record<string, unknown> }>;
  structured: 'gemini' | 'json_schema' | 'json_object' | 'anthropic';
  maxTokensParam?: 'max_tokens' | 'max_completion_tokens';
  outputCap: number;
  extraBody?: Record<string, unknown>;
  extraHeaders?: Record<string, string>;
  concurrency: number;
  /** Append "(not X)" deny hints to glossary pins (an A/B switch for the eval). */
  denyHintsInPrompt: boolean;
  /** Offered on 429. */
  quotaFallbackModel?: string;
}
export interface ProviderConfig { provider: ProviderId; apiKey: string | null; model: string; baseUrl: string }
export interface ChatTurn { role: 'user' | 'assistant'; content: string }
export interface CompletionRequest {
  system: string;
  /** Few-shot pair(s), then the real payload last. */
  turns: ChatTurn[];
  /** ITEMS_SCHEMA, or a caller's own flat schema with its `shapeHint`. */
  schema: JsonSchema;
  /** Appended to `system` on a rung that doesn't enforce `schema`; absent = the items shape. */
  shapeHint?: string;
  maxOutputTokens: number;
  signal: AbortSignal;
  /** Default 120 000. */
  timeoutMs?: number;
}
export interface CompletionResult {
  text: string;
  finish: 'stop' | 'length' | 'safety' | 'other';
  dialect: OutputDialect;
  model: string;
  ms: number;
  usage?: { input?: number; output?: number; thinking?: number };
}
export type AiErrorKind =
  | 'notConfigured' | 'region' | 'badKey' | 'keyBlocked' | 'networkOrKey' | 'network'
  | 'quota' | 'billing' | 'model' | 'policy' | 'badRequest' | 'server'
  | 'timeout' | 'cancelled' | 'safety' | 'truncated' | 'badOutput';
export type AiAction =
  | 'retry' | 'openSettings' | 'chooseModel' | 'switchProvider' | 'openKeyPage' | 'openBilling' | 'useFallbackModel';
export interface AiErrorInfo {
  kind: AiErrorKind;
  provider: ProviderId;
  status?: number;
  retryAfterMs?: number;
  /** Teacher-facing, already mapped. */
  message: string;
  /** Provider text, key-redacted, ≤ 300 chars, shown as text. */
  detail?: string;
  /** Stops a run: region, badKey, keyBlocked, quota, billing, model, policy, notConfigured. */
  fatal: boolean;
  actions: AiAction[];
}
export class AiError extends Error {
  constructor(readonly info: AiErrorInfo) {
    super(info.message);
    this.name = 'AiError';
  }
}
export const isAiError = (x: unknown): x is AiError => x instanceof AiError;
export interface ModelInfo { id: string; label?: string }
export interface HttpDeps { fetch: typeof fetch; now: () => number; sleep: (ms: number, signal: AbortSignal) => Promise<void> }
export interface AiClient {
  /** Throws AiError. Runs the structured-output ladder and transport retries. */
  complete(req: CompletionRequest): Promise<CompletionResult>;
  /** [] on failure. */
  listModels(signal: AbortSignal): Promise<ModelInfo[]>;
}
export type ConnectionTest =
  | { ok: true; ms: number; model: string; sample: string; followedGlossary: boolean }
  | { ok: false; error: AiErrorInfo };
