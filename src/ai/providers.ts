import type { ProviderId, ProviderPreset } from './types';
import { MENTOR } from './mentorOrigin';

/**
 * Provider presets: data only. Model ids are hypotheses until the eval gate confirms
 * them; every model field also accepts a typed id, so a wrong default is a one-line fix.
 * Temperature is sent for no provider. († = confirm with a live key before release.)
 */

const GEMINI_HK_NOTE =
  'In Hong Kong, turn on a VPN before you open the Gemini key page, and keep it on while you use Gemini.';

const gemini: ProviderPreset = {
  id: 'gemini',
  label: 'Google Gemini',
  group: 'top',
  recommended: true,
  hk: { status: 'notOfficial', note: GEMINI_HK_NOTE },
  blurb: 'Free key from Google AI Studio. Fast, good Chinese.',
  privacy:
    "Free keys: Google may use them to improve its products, and people may read them. With billing on, it doesn't. Google's terms only cover use from places where it offers Gemini.",
  family: 'gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  baseUrlEditable: false,
  keyRequired: true,
  keyUrl: 'https://aistudio.google.com/apikey',
  billingUrl: 'https://console.cloud.google.com/billing',
  keyHint: 'Turn on your VPN first.',
  models: [
    {
      id: 'gemini-3.5-flash-lite',
      label: 'Gemini 3.5 Flash-Lite',
      note: 'Fast; large free quota; Google lists it for translation',
      extra: { thinkingLevel: 'minimal' },
    },
    {
      id: 'gemini-3.8-flash',
      label: 'Gemini 3.8 Flash',
      note: 'Higher quality; smaller free quota',
      extra: { thinkingLevel: 'low' },
    },
    {
      id: 'gemini-4-hydrogen',
      label: 'Gemini 4 Hydrogen',
      note: 'Newest Gemini 4; fast and low cost',
      extra: { thinkingLevel: 'low' },
    },
  ],
  structured: 'gemini',
  outputCap: 65536,
  concurrency: 2,
  denyHintsInPrompt: true,
  quotaFallbackModel: 'gemini-3.5-flash-lite',
};

const deepseek: ProviderPreset = {
  id: 'deepseek',
  label: 'DeepSeek',
  group: 'top',
  hk: { status: 'available', note: 'Available in Hong Kong.' },
  blurb: 'Low cost, pay as you go.',
  privacy: 'DeepSeek processes and stores them in mainland China.',
  family: 'openai',
  baseUrl: 'https://api.deepseek.com',
  baseUrlEditable: false,
  keyRequired: true,
  keyUrl: 'https://platform.deepseek.com/api_keys',
  billingUrl: 'https://platform.deepseek.com/top_up',
  keyPrefix: /^sk-/,
  models: [
    { id: 'deepseek-flash', label: 'DeepSeek Flash' },
    { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  ],
  structured: 'json_object',
  maxTokensParam: 'max_tokens',
  outputCap: 8192,
  extraBody: { thinking: { type: 'disabled' } },
  concurrency: 3,
  denyHintsInPrompt: true,
};

const qwen: ProviderPreset = {
  id: 'qwen',
  label: 'Qwen · Alibaba Cloud',
  group: 'top',
  hk: {
    status: 'available',
    note: 'Available in Hong Kong (Alibaba Cloud Model Studio has a Hong Kong region).',
  },
  blurb: 'Alibaba Cloud Model Studio. Pay as you go.',
  privacy: "See Alibaba Cloud's terms for how they are kept.",
  family: 'openai',
  // The DashScope domain gets no new features after 2026-09-30; the HK workspace URL
  // becomes the default once the live checks pass. Never `cn-hongkong.dashscope…`
  // (fails preflight).
  baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  baseUrlChoices: [
    { label: 'Singapore (international)', url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' },
    {
      label: 'Hong Kong workspace',
      url: 'https://{WorkspaceId}.cn-hongkong.maas.aliyuncs.com/compatible-mode/v1',
      template: true,
    },
    {
      label: 'Singapore workspace',
      url: 'https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
      template: true,
    },
  ],
  baseUrlEditable: false,
  keyRequired: true,
  keyUrl: 'https://modelstudio.console.alibabacloud.com/',
  // No billingUrl: a billing error opens the Model Studio console (keyUrl).
  keyPrefix: /^sk-/,
  models: [
    { id: 'qwen3.8-flash', label: 'Qwen 3.8 Flash' }, // †
    { id: 'qwen3.7-plus', label: 'Qwen 3.7 Plus' }, // †
    { id: 'qwen4-max', label: 'Qwen 4 Max' }, // †
  ],
  structured: 'json_schema',
  maxTokensParam: 'max_tokens',
  outputCap: 16384,
  extraBody: { enable_thinking: false },
  concurrency: 3,
  denyHintsInPrompt: true,
};

const openrouter: ProviderPreset = {
  id: 'openrouter',
  label: 'OpenRouter',
  group: 'more',
  hk: { status: 'unknown', note: 'One key for many models. Some models may be unavailable for Hong Kong accounts.' },
  blurb: 'One key for many models.',
  privacy: 'Sent with data collection denied.',
  family: 'openai',
  baseUrl: 'https://openrouter.ai/api/v1',
  baseUrlEditable: false,
  keyRequired: true,
  keyUrl: 'https://openrouter.ai/keys',
  billingUrl: 'https://openrouter.ai/settings/credits',
  keyPrefix: /^sk-or-/,
  models: [
    { id: 'qwen/qwen3.8-flash', label: 'Qwen 3.8 Flash' },
    { id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
    { id: 'google/gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
    { id: 'google/gemini-4-hydrogen', label: 'Gemini 4 Hydrogen' },
    { id: 'google/gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    { id: 'deepseek/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash' },
    { id: 'anthropic/claude-haiku-5.5', label: 'Claude Haiku 5.5' },
    { id: 'openai/gpt-6-luna', label: 'GPT-6 Luna' },
  ],
  structured: 'json_schema',
  maxTokensParam: 'max_tokens',
  outputCap: 16384,
  extraBody: { provider: { require_parameters: true, data_collection: 'deny' } },
  extraHeaders: {
    'HTTP-Referer': 'https://github.com/dinomartino/DSE_ECON_Worksheet-editor',
    'X-Title': 'Econ Studio',
  },
  concurrency: 3,
  denyHintsInPrompt: true,
};

const openai: ProviderPreset = {
  id: 'openai',
  label: 'OpenAI',
  group: 'more',
  hk: {
    status: 'unavailable',
    note: 'Not available in Hong Kong. A wrong key shows up as a network error in the browser.',
  },
  blurb: 'GPT models, with your OpenAI API key.',
  privacy: 'Sent to OpenAI with your key.',
  family: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  baseUrlEditable: false,
  keyRequired: true,
  keyUrl: 'https://platform.openai.com/api-keys',
  billingUrl: 'https://platform.openai.com/settings/organization/billing/overview',
  keyPrefix: /^sk-/,
  models: [
    { id: 'gpt-6-luna', label: 'GPT-6 Luna' },
    { id: 'gpt-6.1-terra', label: 'GPT-6.1 Terra' },
    { id: 'gpt-6.2-sol', label: 'GPT-6.2 Sol' },
  ],
  structured: 'json_schema',
  maxTokensParam: 'max_completion_tokens',
  outputCap: 32768,
  concurrency: 3,
  denyHintsInPrompt: true,
};

const anthropic: ProviderPreset = {
  id: 'anthropic',
  label: 'Anthropic Claude',
  group: 'more',
  hk: { status: 'unavailable', note: 'Not available in Hong Kong.' },
  blurb: 'Claude models, with your Anthropic API key.',
  privacy: 'Sent to Anthropic with your key.',
  family: 'anthropic',
  baseUrl: 'https://api.anthropic.com/v1',
  baseUrlEditable: false,
  keyRequired: true,
  keyUrl: 'https://console.anthropic.com/settings/keys',
  billingUrl: 'https://console.anthropic.com/settings/billing',
  keyPrefix: /^sk-ant-/,
  models: [
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
  ],
  structured: 'anthropic',
  maxTokensParam: 'max_tokens',
  outputCap: 32000,
  // Without the direct-browser header the error carries no ACAO and reads as a network failure.
  extraHeaders: { 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
  concurrency: 2,
  denyHintsInPrompt: true,
};

const custom: ProviderPreset = {
  id: 'custom',
  label: 'Custom (OpenAI-compatible)',
  group: 'more',
  hk: { status: 'unknown', note: 'Any OpenAI-compatible server that allows browser requests (CORS).' },
  blurb: 'Your own OpenAI-compatible endpoint.',
  privacy: 'Sent to the server you entered.',
  family: 'openai',
  // Typed by the teacher; the settings validator allows https, or http on localhost only.
  baseUrl: '',
  baseUrlEditable: true,
  keyRequired: true,
  models: [],
  structured: 'json_schema',
  maxTokensParam: 'max_tokens',
  outputCap: 8192,
  concurrency: 2,
  denyHintsInPrompt: true,
};

const ollama: ProviderPreset = {
  id: 'ollama',
  label: 'Ollama',
  group: 'more',
  hk: {
    status: 'local',
    note: 'Runs on this computer. Nothing leaves it. Web and Windows need OLLAMA_ORIGINS; Safari blocks it.',
  },
  blurb: 'Models running on this computer.',
  privacy: 'Nothing leaves this computer.',
  family: 'openai',
  baseUrl: 'http://localhost:11434/v1',
  baseUrlEditable: true,
  keyRequired: false,
  models: [],
  structured: 'json_schema',
  maxTokensParam: 'max_tokens',
  outputCap: 8192,
  concurrency: 1,
  denyHintsInPrompt: true,
};

/**
 * Mentor's app API root; the relay is `${MENTOR_API}/ai` (k-0519, `Outbox/k-0518/CONTRACT.md`).
 * Production, or a develop build's `NEXT_PUBLIC_MENTOR_ORIGIN` (`mentorOrigin.ts`).
 */
export const MENTOR_API = MENTOR.api;
/** The only model the hosted relay runs (the user, u-x8td). */
export const MENTOR_MODEL = 'gemini-4-hydrogen';

/**
 * The DSEcon Mentor account (k-0519): no key. The teacher signs in (link code), and the editor
 * sends Gemini's own request, wrapped, to Mentor's relay with the sign-in token as a bearer;
 * Mentor holds the Gemini key and the model (Gemini 4 Hydrogen), holds the credits a call may
 * cost and keeps its real cost. `family: 'gemini'` keeps every Gemini budget (thinking) as it
 * is. Never a provider card: Settings → AI shows it as the account at the top.
 */
const mentor: ProviderPreset = {
  id: 'mentor',
  label: 'DSEcon Mentor',
  group: 'hosted',
  hk: { status: 'available', note: 'Works in Hong Kong without a VPN.' },
  blurb: 'No key needed: sign in and pay for what you use.',
  privacy:
    "Sent to DSEcon Mentor's server, which passes them to Google Gemini (paid service: not used to improve Google's products). Questions you ask it to tag by topic also go to TypeSafe (in the US), which doesn't train on them. Mentor keeps a usage record (when, which feature, cost), never the text.",
  family: 'gemini',
  baseUrl: `${MENTOR_API}/ai`,
  baseUrlEditable: false,
  keyRequired: true,
  billingUrl: MENTOR.buyUrl,
  models: [{ id: MENTOR_MODEL, label: 'Gemini 4 Hydrogen', extra: { thinkingLevel: 'low' } }],
  structured: 'gemini',
  outputCap: 65536,
  concurrency: 3,
  denyHintsInPrompt: true,
  relay: 'mentor',
};

export const PRESETS: Readonly<Record<ProviderId, ProviderPreset>> = {
  gemini,
  deepseek,
  qwen,
  openrouter,
  openai,
  anthropic,
  custom,
  ollama,
  mentor,
};

/** The preset for `id`; an unknown id (a newer build's provider) reads as Gemini. */
export function presetFor(id: ProviderId): ProviderPreset {
  return PRESETS[id] ?? PRESETS.gemini;
}

/**
 * Whether the provider reads pictures sent with a request (k-0514). Gemini, Claude and the
 * two big OpenAI-style gateways do; DeepSeek's chat models, Qwen's text models, a custom
 * server and Ollama (whatever model the teacher pulled) are not assumed to.
 */
export function supportsImages(preset: Pick<ProviderPreset, 'id' | 'family'>): boolean {
  return preset.family === 'gemini' || preset.family === 'anthropic' || preset.id === 'openai' || preset.id === 'openrouter';
}

/**
 * Whether the question studio asks the provider for a server-sent-event stream (k-0514) so the
 * draft can be shown as it is written. Gemini, Claude and the OpenAI-style hosted gateways
 * stream structured output; a custom server or Ollama (unknown servers, an unknown model) is
 * asked for the whole reply, and any stream that fails before its first text falls back to
 * the whole reply too.
 */
export function supportsStreaming(preset: Pick<ProviderPreset, 'id' | 'family'>): boolean {
  return preset.id !== 'custom' && preset.id !== 'ollama';
}
