import type { AiErrorKind } from '@/ai/types';
import { defineMessages, type Messages, type TextKey } from '@/i18n/catalogue';
import { GLOSSARY_ATTRIBUTION } from '@/glossary/attribution';
import type { SecretStore } from '@/platform/secrets';

/** Settings → AI & translation, and the provider badges the menu's SetupCard shares. */
export const AI_SECTION_MESSAGES = defineMessages({
  unsavedKey: { en: "You haven't saved this key.", zh: '你還未儲存這個 API key。' },
  saveAndTest: { en: 'Save & test', zh: '儲存並測試' },
  moreProviders: { en: 'More providers', zh: '更多供應商' },
  providerGroup: { en: 'AI provider', zh: 'AI 供應商' },
  moreProviderGroup: { en: 'More AI providers', zh: '更多 AI 供應商' },
  includeTeacher: {
    en: 'Include answers and mark schemes when translating',
    zh: '翻譯時包括答案和評卷參考',
  },
  privacyAndTerms: { en: 'Privacy and terminology', zh: '私隱與用詞' },

  yourKeys: { en: 'Your keys', zh: '你的 API key' },
  savedCount: { en: (n: number) => `${n} saved`, zh: (n: number) => `已儲存 ${n} 個` },
  forgetAllAsk: { en: 'Forget every AI key saved here?', zh: '要移除這裏儲存的所有 AI key 嗎？' },
  forgetAll: { en: 'Forget all', zh: '全部移除' },
  forgetOneAsk: { en: 'Forget this key?', zh: '要移除這個 API key 嗎？' },
  forget: { en: 'Forget', zh: '移除' },
  cancel: { en: 'Cancel', zh: '取消' },
  /** Where a key is kept, inside a sentence (`storeLabel`). */
  storeKeychain: { en: 'your Keychain', zh: '你的鑰匙圈' },
  storeCredentialManager: { en: 'Windows Credential Manager', zh: 'Windows 認證管理員' },
  storeBrowser: { en: 'this browser', zh: '這個瀏覽器' },
  storeTab: { en: 'this tab only', zh: '只限這個分頁' },
  storeSession: { en: 'this session only', zh: '只限這次使用' },
  inStore: { en: (store: string) => `in ${store}`, zh: (store: string) => `存於${store}` },
  savedIn: { en: (store: string) => `Saved in ${store}`, zh: (store: string) => `儲存在${store}` },
  inUse: { en: 'In use', zh: '使用中' },

  test: { en: 'Test', zh: '測試' },
  testing: { en: 'Testing…', zh: '測試中…' },
  connected: { en: '✓ Connected', zh: '✓ 已連線' },
  notTested: { en: 'Not tested', zh: '未測試' },
  testFailed: { en: 'Test failed', zh: '測試失敗' },
  errRegion: { en: 'Not available here', zh: '此地區不可用' },
  errBadKey: { en: 'Key not accepted', zh: 'API key 不獲接受' },
  errKeyBlocked: { en: 'Key blocked', zh: 'API key 已被封鎖' },
  errNetworkOrKey: { en: 'No answer', zh: '沒有回應' },
  errNetwork: { en: 'No connection', zh: '未能連線' },
  errQuota: { en: 'Limit reached', zh: '已達用量上限' },
  errBilling: { en: 'No balance', zh: '餘額不足' },
  errModel: { en: 'Model not found', zh: '找不到模型' },
  errTimeout: { en: 'Timed out', zh: '逾時' },
  errServer: { en: 'Provider trouble', zh: '供應商出現問題' },
  errNotConfigured: { en: 'Not set up', zh: '未設定' },

  apiKey: { en: 'API key', zh: 'API key' },
  apiKeyFor: { en: (provider: string) => `${provider} API key`, zh: (provider: string) => `${provider} API key` },
  hide: { en: 'Hide', zh: '隱藏' },
  show: { en: 'Show', zh: '顯示' },
  pasteFirst: { en: 'Paste a key first', zh: '請先貼上 API key' },
  getKey: { en: 'Get a key ↗', zh: '取得 API key ↗' },
  testConnection: { en: 'Test connection', zh: '測試連線' },
  saveWithoutTesting: { en: 'Save without testing', zh: '不測試，直接儲存' },
  useWithoutTesting: { en: 'Use without testing', zh: '不測試，直接使用' },
  testAnyway: { en: 'Test anyway', zh: '仍然測試' },
  keychainDenied: {
    en: (os: string, store: string) => `${os} didn’t allow access to ${store}.`,
    zh: (os: string, store: string) => `${os} 不允許存取${store}。`,
  },
  keychainFailed: {
    en: (store: string) => `The key couldn’t be saved in ${store}.`,
    zh: (store: string) => `未能把 API key 儲存在${store}。`,
  },
  sessionOnlyAsk: { en: 'Use this key for this session only?', zh: '只在這次使用這個 API key？' },
  useForSession: { en: 'Use for this session', zh: '只用於這次' },
  tryAgain: { en: 'Try again', zh: '再試一次' },
  connectedLine: {
    en: (seconds: string, sample: string) => ` Connected · ${seconds} s · ${sample}`,
    zh: (seconds: string, sample: string) => ` 已連線 · ${seconds} 秒 · ${sample}`,
  },
  skippedGlossary: { en: ' · didn’t use the glossary term', zh: ' · 沒有採用詞彙表的用詞' },
  useDeepSeek: { en: 'Use DeepSeek', zh: '改用 DeepSeek' },
  useQwen: { en: 'Use Qwen', zh: '改用 Qwen' },

  rememberBrowser: { en: 'Remember this key in this browser', zh: '在這個瀏覽器記住這個 API key' },
  rememberWindows: { en: 'Remember in Windows Credential Manager', zh: '記住在 Windows 認證管理員' },
  rememberMac: { en: "Remember in your Mac's Keychain", zh: '記住在你 Mac 的鑰匙圈' },
  rememberOffTitle: {
    en: 'Left off, the key is forgotten when you close the tab.',
    zh: '不剔選的話，關閉分頁後便會忘記這個 API key。',
  },
  sharedComputer: { en: 'Leave off on a shared computer.', zh: '共用電腦請不要剔選。' },

  model: { en: 'Model', zh: '模型' },
  suggested: { en: 'Suggested', zh: '建議' },
  accountModels: { en: 'Models from your account', zh: '你帳戶中的模型' },
  otherModel: { en: 'Other…', zh: '其他…' },
  listModels: { en: '↻ List my models', zh: '↻ 列出我的模型' },
  modelId: { en: 'Model id', zh: '模型 ID' },
  modelIdPlaceholder: { en: 'Model id, e.g. qwen3:8b', zh: '模型 ID，例如 qwen3:8b' },
  modelIdChars: { en: 'Letters, digits and . _ : / @ - only.', zh: '只可使用英文字母、數字和 . _ : / @ -' },
  noModels: { en: 'No models were listed for this key.', zh: '這個 API key 沒有列出任何模型。' },
  keyInModel: {
    en: 'That looks like an API key. Paste it into the key field.',
    zh: '這看來是 API key，請貼到 API key 欄。',
  },

  workspaceHint: {
    en: 'Model Studio → Workspace Management → copy the API Host',
    zh: 'Model Studio → Workspace Management → 複製 API Host',
  },
  region: { en: 'Region', zh: '地區' },
  workspace: { en: 'Workspace', zh: 'Workspace' },
  workspacePlaceholder: { en: 'Workspace API Host or id', zh: 'Workspace API Host 或 ID' },
  notWorkspace: {
    en: (hint: string) => `That isn't a workspace for this region. ${hint}.`,
    zh: (hint: string) => `這不是此地區的 Workspace。${hint}。`,
  },
  serverAddress: { en: 'Server address', zh: '伺服器位址' },
  badAddress: {
    en: 'Use an https:// address, or http:// on this computer only.',
    zh: '請使用 https:// 位址；http:// 只限這部電腦。',
  },

  whatIsSent: { en: 'What is sent', zh: '會傳送甚麼' },
  sentBody: {
    en: (desktop: boolean, provider: string, privacy: string) =>
      `When you translate, the texts you choose (and nearby translated lines from the same question, for context) go straight from this ${desktop ? 'computer' : 'browser'} to ${provider} with your key. Nothing is sent until you press Translate, Fill, Test, Save & test or List my models. ${privacy}`,
    zh: (desktop: boolean, provider: string, privacy: string) =>
      `翻譯時，你選擇的文字（以及同一題目中附近已翻譯的句子，作為上下文）會連同你的 API key，由這部${desktop ? '電腦' : '瀏覽器'}直接傳送到 ${provider}。在你按下「翻譯」、「填寫」、「測試」、「儲存並測試」或「列出我的模型」之前，不會傳送任何內容。${privacy}`,
  },
  terminology: { en: 'Terminology', zh: '用詞' },
  termsBody: {
    en: (title: string, publisher: string, year: number, notice: string, licence: string) =>
      `Economics terms follow “${title}” (${publisher}, ${year}). ${notice}. ${licence}`,
    zh: (title: string, publisher: string, year: number, notice: string, licence: string) =>
      `經濟科用詞依照 “${title}”（${publisher}，${year}）。${notice}。${licence}`,
  },
  licence: { en: GLOSSARY_ATTRIBUTION.licence, zh: '僅供參考，不屬本 app 的 MIT 授權範圍。' },
  pasteNewKey: { en: 'Paste a new key to replace', zh: '貼上新的 API key 以取代' },
  pasteKey: { en: 'Paste your key', zh: '貼上你的 API key' },

  recommended: { en: 'Recommended', zh: '推薦' },
  availableInHk: { en: 'Available in Hong Kong', zh: '香港可用' },
  keySaved: { en: 'Key saved', zh: '已儲存 API key' },
  noKeyNeeded: { en: 'No key needed', zh: '毋須 API key' },

  refusedTry: {
    en: (provider: string) => `${provider} refused a request from your location. Try DeepSeek or Qwen.`,
    zh: (provider: string) => `${provider} 拒絕了來自你所在地區的要求。請試用 DeepSeek 或 Qwen。`,
  },
  refusedHk: {
    en: (provider: string) => `${provider} refused a request from your location. DeepSeek and Qwen work from Hong Kong.`,
    zh: (provider: string) => `${provider} 拒絕了來自你所在地區的要求。DeepSeek 和 Qwen 在香港可以使用。`,
  },

  noSavedKey: { en: 'No key is saved for this provider.', zh: '這個供應商沒有已儲存的 API key。' },
  chooseModel: { en: 'Choose a model first.', zh: '請先選擇模型。' },
  enterAddress: { en: 'Enter the server address first.', zh: '請先輸入伺服器位址。' },
});

/** A failed test's status, short enough for a key row; the full message sits under it. */
export const SHORT_ERROR_KEYS: Partial<Record<AiErrorKind, TextKey<typeof AI_SECTION_MESSAGES>>> = {
  region: 'errRegion',
  badKey: 'errBadKey',
  keyBlocked: 'errKeyBlocked',
  networkOrKey: 'errNetworkOrKey',
  network: 'errNetwork',
  quota: 'errQuota',
  billing: 'errBilling',
  model: 'errModel',
  timeout: 'errTimeout',
  server: 'errServer',
  notConfigured: 'errNotConfigured',
};

/** Same words as `secretStoreLabel`, in the interface language. */
export function storeLabel(
  m: Messages<typeof AI_SECTION_MESSAGES>,
  store: SecretStore,
  where: 'mac' | 'windows' | 'web',
): string {
  switch (store) {
    case 'keychain':
      return where === 'windows' ? m.storeCredentialManager : m.storeKeychain;
    case 'browser':
      return m.storeBrowser;
    case 'session':
      return m.storeTab;
    case 'memory':
      return where === 'web' ? m.storeTab : m.storeSession;
  }
}
