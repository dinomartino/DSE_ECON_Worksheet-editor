/**
 * The provider layer's contract. `src/ai/` imports nothing from React, the store,
 * `src/model`, `src/settings`, `@/platform` or Tauri: it is plain transport.
 */

export const PROVIDER_IDS = ['gemini', 'deepseek', 'qwen', 'openrouter', 'openai', 'anthropic', 'custom', 'ollama', 'mentor'] as const;
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
  /** 'hosted': the DSEcon Mentor account (k-0519), never a card among the own-key providers. */
  group: 'top' | 'more' | 'hosted';
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
  /** https only; where a billing error sends the teacher to add credit. Absent = `keyUrl`. */
  billingUrl?: string;
  /** A few words beside the key-page link (Gemini: turn on a VPN first). */
  keyHint?: string;
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
  /**
   * 'mentor': Gemini's request, wrapped for DSEcon Mentor's relay (`src/ai/adapters/mentor.ts`,
   * `Outbox/k-0518/CONTRACT.md`); the secret is the sign-in token, sent as a bearer (k-0519).
   */
  relay?: 'mentor';
}
export interface ProviderConfig { provider: ProviderId; apiKey: string | null; model: string; baseUrl: string }
export interface ChatTurn { role: 'user' | 'assistant'; content: string }
/** A picture sent with a request: `data:image/png|jpeg|webp|gif;base64,…`. Never a remote URL. */
export interface ImagePart { dataUrl: string }
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
  /**
   * Pictures sent with the last user turn (k-0514), in order. A provider that cannot read
   * pictures (`supportsImages`) never gets them: the client drops them, so a caller that
   * wants to tell the model "a figure is attached" must ask `supportsImages(preset)` first.
   */
  images?: readonly ImagePart[];
  /** Default 120 000. */
  timeoutMs?: number;
  /** Which feature asked; sent to the hosted relay for its usage record only (k-0519). */
  feature?: AiFeature;
  /**
   * The hosted relay's `Idempotency-Key` (k-0521 F10): one per logical request, the same on
   * every transport retry, so Mentor charges a repeat once. The client makes one when absent
   * (and a new one for each different body it sends); a caller that asks again for the same
   * thing after a timeout passes the key it used before.
   */
  requestKey?: string;
}
/** The relay's `feature` (CONTRACT §3): recorded with the usage, never sent to Google. */
export type AiFeature =
  | 'translate' | 'importCheck' | 'studio' | 'studio.write' | 'studio.solve' | 'studio.quality' | 'studio.diagram'
  | 'answers' | 'quality' | 'coverage' | 'assist' | 'test' | 'other';
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
  | 'timeout' | 'cancelled' | 'safety' | 'truncated' | 'badOutput'
  /** The hosted relay (k-0519): sign in again · not enough credits · the month's limit · paused or off. */
  | 'signedOut' | 'noCredits' | 'monthlyCap' | 'serviceDown';
export type AiAction =
  | 'retry' | 'openSettings' | 'chooseModel' | 'switchProvider' | 'openKeyPage' | 'openBilling' | 'useFallbackModel'
  | 'signIn' | 'buyCredits' | 'useOwnKey';
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
  /**
   * `complete`, streamed (k-0514): `onText` gets the whole reply so far each time more arrives.
   * Same result, same errors, same output-dialect ladder. Absent on a client that cannot
   * stream (tests' fakes): callers use `complete`. A failure before the first text is an
   * ordinary `AiError`; after it, the error is thrown too and the caller keeps what it had.
   */
  stream?(req: CompletionRequest, onText: (reply: string) => void): Promise<CompletionResult>;
  /** [] on failure. */
  listModels(signal: AbortSignal): Promise<ModelInfo[]>;
}
export type ConnectionTest =
  | { ok: true; ms: number; model: string; sample: string; followedGlossary: boolean }
  | { ok: false; error: AiErrorInfo };
