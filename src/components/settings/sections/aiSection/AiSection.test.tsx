import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiErrorInfo } from '@/ai/errors';
import { AI_SETTINGS, type AiSettings } from '@/settings/aiSettings';
import type { SettingsSectionProps } from '@/settings/sections';
import AiSection, { type AiSectionActions } from './AiSection';
import { AiSectionView } from './AiSectionView';
import { initialAiSetup, type AiSetupState, type SavedKeyRow } from './aiSetup';

const web = { desktop: false };
const KEY = 'AIzaSyTESTKEY000000000000007Qx4';

function render(params?: Record<string, string>, env = web) {
  const props: SettingsSectionProps = { env, params, setCloseGuard: () => {} };
  return renderToStaticMarkup(createElement(AiSection, props));
}

const noop = () => {};
const actions: AiSectionActions = {
  selectProvider: noop, draft: noop, saveAndTest: noop, testAnyway: noop, testSaved: noop, saveWithoutTesting: noop,
  useForSession: noop, retryKeychain: noop, remember: noop, forgetAsked: noop, cancelForget: noop,
  forget: async () => {}, model: noop, baseUrl: () => true, workspace: noop, listModels: async () => {},
  includeTeacher: noop, getKey: noop,
};
function view(
  patch: Partial<AiSetupState>,
  settings: Partial<AiSettings> = {},
  env = web,
  platform: 'mac' | 'windows' | 'web' = 'web',
  keys: SavedKeyRow[] = [],
) {
  const s = { ...AI_SETTINGS.defaults(env), ...settings };
  const state = { ...initialAiSetup(s, env, undefined, () => null), ...patch };
  return renderToStaticMarkup(
    createElement(AiSectionView, { env, state, settings: s, keys, configured: false, listed: null, platform, actions }),
  );
}

/** The markup of one "Your keys" row. */
const keyRowOf = (html: string, id: string) => html.split(`data-key-row="${id}"`)[1]?.split('</li>')[0] ?? '';
/** The open card's primary button. */
const primaryOf = (html: string) => /<button[^>]*>(Test|Save &amp; test|Testing…)<\/button>/.exec(html);
const GEMINI_SAVED: SavedKeyRow = { provider: 'gemini', store: 'browser', last4: 'abcd' };
const DEEPSEEK_SAVED: SavedKeyRow = { provider: 'deepseek', store: 'browser', last4: 'wxyz' };

/** The markup of one provider's card. */
const cardOf = (html: string, id: string) => html.split(`data-provider="${id}"`)[1]?.split('data-provider=')[0] ?? '';

afterEach(() => vi.unstubAllGlobals());

describe('the AI section', () => {
  it('preselects Gemini, recommended, with its Hong Kong VPN note in warn ink', () => {
    const html = render();
    const gemini = cardOf(html, 'gemini');
    expect(gemini).toMatch(/role="radio" aria-checked="true"/);
    expect(gemini).toContain('Recommended');
    expect(gemini).toMatch(/class="[^"]*text-warn-ink[^"]*">⚠ In Hong Kong, turn on a VPN before you open the Gemini key page, and keep it on while you use Gemini\./);
    expect(gemini).toMatch(/Get a key ↗<\/button><span[^>]*>Turn on your VPN first\.</);
  });

  it('marks DeepSeek and Qwen as available in Hong Kong, as one-line cards', () => {
    const html = render();
    for (const id of ['deepseek', 'qwen']) {
      const card = cardOf(html, id);
      expect(card).toContain('Available in Hong Kong');
      expect(card).toMatch(/aria-checked="false"/);
      expect(card).not.toContain('API key');
    }
  });

  it('puts the key, Remember and the model inside the selected card', () => {
    const gemini = cardOf(render(), 'gemini');
    expect(gemini).toContain('API key');
    expect(gemini).toContain('Remember this key in this browser');
    expect(gemini).toContain('Leave off on a shared computer');
    expect(gemini).toContain('Gemini 3.5 Flash-Lite');
    expect(gemini).toContain('Save &amp; test');
  });

  it('keeps the key field out of password managers', () => {
    const html = render();
    const input = /<input[^>]*aria-label="Google Gemini API key"[^>]*>/.exec(html)?.[0] ?? '';
    expect(input).toContain('type="password"');
    expect(input).toMatch(/autocomplete="off"/i);
    expect(input).toContain('data-1p-ignore=""');
    expect(input).toContain('data-lpignore="true"');
    expect(input).not.toMatch(/\sname=|\sid=/);
    expect(html).not.toContain('<form');
    expect(html).not.toMatch(/username/i);
  });

  it('keeps More collapsed unless the shown provider is in it', () => {
    expect(render()).toMatch(/aria-expanded="false"[^>]*>(?:(?!<\/button>).)*More providers/);
    const custom = render({ provider: 'custom' });
    expect(custom).toMatch(/aria-expanded="true"[^>]*>(?:(?!<\/button>).)*More providers/);
    expect(cardOf(custom, 'custom')).toContain('Server address');
    expect(cardOf(custom, 'custom')).toContain('Save without testing');
  });

  it('lists saved keys by their last 4 characters and store, never the key', () => {
    const DEEPSEEK = 'sk-deepseek-SECRET-0000wxyz';
    const session = new Map([['econgen.secret.ai:gemini', KEY]]);
    const local = new Map([['econgen.secret.ai:deepseek', DEEPSEEK]]);
    vi.stubGlobal('window', {
      sessionStorage: { getItem: (k: string) => session.get(k) ?? null },
      localStorage: { getItem: (k: string) => local.get(k) ?? null },
    });
    const html = render();
    expect(html).toMatch(/Your keys<\/h4><span[^>]*>2 saved</);
    expect(keyRowOf(html, 'gemini')).toContain('••••••••7Qx4');
    expect(keyRowOf(html, 'gemini')).toContain('in this tab only');
    expect(keyRowOf(html, 'gemini')).toContain('In use');
    expect(keyRowOf(html, 'deepseek')).toContain('••••••••wxyz');
    expect(keyRowOf(html, 'deepseek')).not.toContain('In use');
    for (const key of [KEY, DEEPSEEK]) {
      expect(html).not.toContain(key);
      expect(html).not.toContain(key.slice(0, 12));
      expect(html).not.toContain(key.slice(-8));
    }
  });

  it('states what is sent, per provider', () => {
    expect(render()).toContain('Free keys: Google may use them to improve its products');
    expect(render({ provider: 'deepseek' })).toContain('DeepSeek processes and stores them in mainland China.');
    expect(render({ provider: 'qwen' })).toContain('See Alibaba Cloud');
    expect(render({ provider: 'openrouter' })).toContain('Sent with data collection denied.');
    expect(render({ provider: 'ollama' })).toContain('Nothing leaves this computer.');
    expect(render()).toContain('go straight from this browser to Google Gemini with your key. Nothing is sent until');
    expect(render(undefined, { desktop: true })).toContain('from this computer to Google Gemini');
  });

  it('carries the full EDB glossary attribution', () => {
    const html = render();
    expect(html).toContain(
      'An English-Chinese Glossary of Terms Commonly Used in the Teaching of Economics in Secondary Schools',
    );
    expect(html).toContain('Curriculum Development Institute, Education Bureau, 2020');
    expect(html).toContain('© The Government of the Hong Kong Special Administrative Region');
    expect(html).toContain('not covered by this app’s MIT licence');
  });

  it('opens a region deep link on the named card with the Hong Kong banner', () => {
    const html = render({ provider: 'deepseek', reason: 'region' });
    expect(html).toContain('Gemini can&#x27;t be reached from your location. Turn on a VPN and try again. DeepSeek and Qwen work in Hong Kong without a VPN.');
    expect(cardOf(html, 'deepseek')).toMatch(/aria-checked="true"/);
    expect(cardOf(html, 'qwen')).toContain('bg-ok-soft');
  });

  it('names the desktop keychain for Remember', () => {
    expect(render(undefined, { desktop: true })).toContain('Remember in your Mac&#x27;s Keychain');
  });
});

describe('the AI section states', () => {
  it('offers session-only use when the Keychain refuses', () => {
    const html = view({ keychainError: 'denied', key: { kind: 'editing', draft: KEY } }, {}, { desktop: true }, 'mac');
    expect(html).toContain('macOS didn’t allow access to your Keychain. Use this key for this session only?');
    expect(html).toContain('Use for this session');
    expect(html).toContain('Try again');
  });

  it('words any other keychain failure without blaming a refusal', () => {
    const html = view({ keychainError: 'failed', key: { kind: 'editing', draft: KEY } }, {}, { desktop: true }, 'windows');
    expect(html).toContain('The key couldn’t be saved in Windows Credential Manager. Use this key for this session only?');
    expect(html).not.toContain('allow access');
    expect(html).toContain('Use for this session');
  });

  it('keeps naming the provider that refused after switching cards', () => {
    const html = view({ provider: 'deepseek', model: 'deepseek-flash', regionRefusedBy: 'gemini' }, { provider: 'deepseek' });
    expect(html).toContain('Gemini can&#x27;t be reached from your location.');
    expect(html).not.toContain('DeepSeek refused');
  });

  it('confirms Forget inline on its own row, without a second dialog', () => {
    const keys = [GEMINI_SAVED, DEEPSEEK_SAVED];
    const html = view({ key: { kind: 'saved', store: 'browser', last4: 'abcd' }, confirmForget: 'deepseek' }, {}, web, 'web', keys);
    expect(keyRowOf(html, 'deepseek')).toContain('Forget this key?');
    expect(keyRowOf(html, 'gemini')).not.toContain('Forget this key?');
    expect(html).not.toContain('role="dialog"');
    expect(view({ confirmForget: 'all' }, {}, web, 'web', keys)).toContain('Forget every AI key saved here?');
  });

  it('has no "Your keys" until a key is saved', () => {
    const html = view({});
    expect(html).not.toContain('Your keys');
    expect(html).not.toContain('Forget all');
  });

  it('tests a saved key from its card with an empty field, and saves a typed one', () => {
    const saved = view({ key: { kind: 'saved', store: 'browser', last4: 'abcd' } }, {}, web, 'web', [GEMINI_SAVED]);
    const button = primaryOf(cardOf(saved, 'gemini'));
    expect(button?.[1]).toBe('Test');
    expect(button?.[0]).not.toContain('disabled=""');
    expect(cardOf(saved, 'gemini')).toContain('placeholder="Paste a new key to replace"');
    // Saved: no saved line, no VPN hint by the key link, no Remember.
    expect(cardOf(saved, 'gemini')).not.toContain('Saved in');
    expect(cardOf(saved, 'gemini')).not.toContain('Turn on your VPN first.');
    expect(cardOf(saved, 'gemini')).not.toContain('Remember this key');
    expect(cardOf(saved, 'gemini').match(/turn on a VPN/gi)).toHaveLength(1);

    const typing = view({ key: { kind: 'editing', draft: KEY, saved: { store: 'browser', last4: 'abcd' } } }, {}, web, 'web', [GEMINI_SAVED]);
    expect(primaryOf(cardOf(typing, 'gemini'))?.[1]).toBe('Save &amp; test');
    expect(cardOf(typing, 'gemini')).toContain('Remember this key in this browser');
  });

  it('shows each key\'s status: not tested, connected, or the error', () => {
    const ok = { kind: 'ok' as const, sample: '物價水平', ms: 900, followedGlossary: true };
    const failed = { kind: 'error' as const, error: aiErrorInfo('badKey', 'deepseek') };
    const keys = [GEMINI_SAVED, DEEPSEEK_SAVED];
    const html = view({ key: { kind: 'saved', store: 'browser', last4: 'abcd' } }, {}, web, 'web', keys);
    expect(keyRowOf(html, 'gemini')).toContain('Not tested');
    expect(keyRowOf(html, 'deepseek')).toContain('Not tested');
    const tested = view({ key: { kind: 'saved', store: 'browser', last4: 'abcd' }, savedTests: { gemini: ok, deepseek: failed } }, {}, web, 'web', keys);
    expect(keyRowOf(tested, 'gemini')).toMatch(/text-ok[^"]*"[^>]*>✓ Connected/);
    expect(keyRowOf(tested, 'deepseek')).toMatch(/text-danger-ink[^"]*"[^>]*>Key not accepted/);
    expect(keyRowOf(tested, 'deepseek')).toContain('DeepSeek didn&#x27;t accept this key.');
    // The open card shows its own saved key's test in full.
    expect(cardOf(tested, 'gemini')).toContain('Connected · 0.9 s · 物價水平');
    const running = view({ key: { kind: 'saved', store: 'browser', last4: 'abcd' }, savedTests: { gemini: { kind: 'testing' } } }, {}, web, 'web', keys);
    expect(keyRowOf(running, 'gemini')).toMatch(/disabled=""[^>]*>Test</);
    expect(primaryOf(cardOf(running, 'gemini'))?.[1]).toBe('Testing…');
  });

  it('marks provider rows with a saved key, or none needed', () => {
    const html = view({}, {}, web, 'web', [DEEPSEEK_SAVED]);
    const row = (id: string) => /<button[^>]*role="radio"[\s\S]*?<\/button>/.exec(cardOf(html, id))?.[0] ?? '';
    expect(row('deepseek')).toContain('Key saved');
    expect(row('deepseek')).toContain('@max-[26rem]:sr-only">Available in Hong Kong');
    expect(row('qwen')).not.toContain('Key saved');
    expect(row('qwen')).not.toContain('sr-only');
    expect(row('gemini')).not.toMatch(/Key saved|No key needed/);
    // Ollama sits under More, open when it is the shown card.
    const more = view({ provider: 'ollama', model: '' }, {}, web, 'web', [DEEPSEEK_SAVED]);
    expect(/<button[^>]*role="radio"[\s\S]*?<\/button>/.exec(cardOf(more, 'ollama'))?.[0]).toContain('No key needed');
  });

  it('names the Keychain when a desktop key\'s last 4 is not yet known', () => {
    const html = view({}, { keychainSaved: { gemini: true } }, { desktop: true }, 'mac', [{ provider: 'gemini', store: 'keychain' }]);
    expect(keyRowOf(html, 'gemini')).toMatch(/••••••••<\/span><span[^>]*>in your Keychain</);
    const win = view({}, { keychainSaved: { gemini: true } }, { desktop: true }, 'windows', [{ provider: 'gemini', store: 'keychain' }]);
    expect(keyRowOf(win, 'gemini')).toContain('in Windows Credential Manager');
  });

  it('shows a shape warning with "Test anyway"', () => {
    const html = view({ key: { kind: 'editing', draft: 'sk-abc', shape: { likely: 'deepseek', message: 'This looks like a DeepSeek key.' } } });
    expect(html).toContain('This looks like a DeepSeek key.');
    expect(html).toContain('Test anyway');
  });

  it('shows a region error with Try again, then one-click Hong Kong providers', () => {
    const html = view({ test: { kind: 'error', error: aiErrorInfo('region', 'gemini') } });
    expect(html).toMatch(/Gemini can&#x27;t be reached from your location\. Turn on a VPN and try again\.[\s\S]*Try again[\s\S]*Use DeepSeek[\s\S]*Use Qwen/);
  });

  it('shows a Qwen workspace field for a workspace region', () => {
    const html = view({ provider: 'qwen', model: 'qwen3.8-flash' }, {
      baseUrls: { qwen: 'https://llm-abc.cn-hongkong.maas.aliyuncs.com/compatible-mode/v1' },
    });
    expect(html).toMatch(/<option value="1" selected="">Hong Kong workspace/);
    expect(html).toContain('value="llm-abc"');
    expect(html).toContain('Model Studio → Workspace Management → copy the API Host');
  });
});
