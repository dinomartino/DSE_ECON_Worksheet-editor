import { defineMessages } from '@/i18n/catalogue';

/**
 * What each provider preset says about itself (`src/ai/providers.ts`, which may not import
 * from here). The `en` side repeats the preset's text; `providerCopy.test.ts` keeps them equal.
 */
export const PROVIDER_COPY_MESSAGES = defineMessages({
  geminiBlurb: {
    en: 'Free key from Google AI Studio. Fast, good Chinese.',
    zh: '可向 Google AI Studio 免費取得 API key。速度快，中文表現好。',
  },
  geminiPrivacy: {
    en: "Free keys: Google may use them to improve its products, and people may read them. With billing on, it doesn't. Google's terms only cover use from places where it offers Gemini.",
    zh: '免費 API key：Google 可能會用這些內容改進其產品，亦可能有人閱讀。啟用付費後則不會。Google 的條款只涵蓋在其提供 Gemini 的地區使用。',
  },
  geminiHk: {
    en: 'In Hong Kong, turn on a VPN before you open the Gemini key page, and keep it on while you use Gemini.',
    zh: '在香港，開啟 Gemini 的 API key 頁面前，請先開啟 VPN，並在使用 Gemini 期間保持開啟。',
  },
  geminiKeyHint: { en: 'Turn on your VPN first.', zh: '請先開啟 VPN。' },
  geminiFlashLiteNote: {
    en: 'Fast; large free quota; Google lists it for translation',
    zh: '速度快；免費用量多；Google 建議用於翻譯',
  },
  geminiFlashNote: { en: 'Higher quality; smaller free quota', zh: '質素較高；免費用量較少' },

  deepseekBlurb: { en: 'Low cost, pay as you go.', zh: '費用低，按用量付費。' },
  deepseekPrivacy: {
    en: 'DeepSeek processes and stores them in mainland China.',
    zh: 'DeepSeek 會在中國內地處理並儲存這些內容。',
  },
  deepseekHk: { en: 'Available in Hong Kong.', zh: '香港可用。' },

  qwenBlurb: { en: 'Alibaba Cloud Model Studio. Pay as you go.', zh: 'Alibaba Cloud Model Studio。按用量付費。' },
  qwenPrivacy: {
    en: "See Alibaba Cloud's terms for how they are kept.",
    zh: '儲存方式請參閱 Alibaba Cloud 的條款。',
  },
  qwenHk: {
    en: 'Available in Hong Kong (Alibaba Cloud Model Studio has a Hong Kong region).',
    zh: '香港可用（Alibaba Cloud Model Studio 設有香港區域）。',
  },
  qwenSingapore: { en: 'Singapore (international)', zh: '新加坡（國際）' },
  qwenHkWorkspace: { en: 'Hong Kong workspace', zh: '香港 Workspace' },
  qwenSingaporeWorkspace: { en: 'Singapore workspace', zh: '新加坡 Workspace' },

  openrouterBlurb: { en: 'One key for many models.', zh: '一個 API key 可使用多個模型。' },
  openrouterPrivacy: { en: 'Sent with data collection denied.', zh: '傳送時已拒絕資料收集。' },
  openrouterHk: {
    en: 'One key for many models. Some models may be unavailable for Hong Kong accounts.',
    zh: '一個 API key 可使用多個模型。部分模型可能不適用於香港帳戶。',
  },

  openaiBlurb: { en: 'GPT models, with your OpenAI API key.', zh: '使用你的 OpenAI API key 來使用 GPT 模型。' },
  openaiPrivacy: { en: 'Sent to OpenAI with your key.', zh: '連同你的 API key 傳送到 OpenAI。' },
  openaiHk: {
    en: 'Not available in Hong Kong. A wrong key shows up as a network error in the browser.',
    zh: '香港不可用。API key 錯誤時，瀏覽器會顯示為網絡錯誤。',
  },

  anthropicBlurb: { en: 'Claude models, with your Anthropic API key.', zh: '使用你的 Anthropic API key 來使用 Claude 模型。' },
  anthropicPrivacy: { en: 'Sent to Anthropic with your key.', zh: '連同你的 API key 傳送到 Anthropic。' },
  anthropicHk: { en: 'Not available in Hong Kong.', zh: '香港不可用。' },

  customBlurb: { en: 'Your own OpenAI-compatible endpoint.', zh: '你自己的 OpenAI 相容端點。' },
  customPrivacy: { en: 'Sent to the server you entered.', zh: '傳送到你輸入的伺服器。' },
  customHk: {
    en: 'Any OpenAI-compatible server that allows browser requests (CORS).',
    zh: '任何允許瀏覽器要求（CORS）的 OpenAI 相容伺服器。',
  },

  ollamaBlurb: { en: 'Models running on this computer.', zh: '在這部電腦上運行的模型。' },
  ollamaPrivacy: { en: 'Nothing leaves this computer.', zh: '內容不會離開這部電腦。' },
  ollamaHk: {
    en: 'Runs on this computer. Nothing leaves it. Web and Windows need OLLAMA_ORIGINS; Safari blocks it.',
    zh: '在這部電腦上運行，內容不會外傳。網頁版和 Windows 需要設定 OLLAMA_ORIGINS；Safari 會封鎖它。',
  },
});
