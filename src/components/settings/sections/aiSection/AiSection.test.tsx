import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_SETTINGS, type AiSettings } from '@/settings/aiSettings';
import type { SettingsSectionProps } from '@/settings/sections';
import AiSection, { type AiSectionActions } from './AiSection';
import { AiSectionView } from './AiSectionView';
import { initialAiSetup, type AiSetupState } from './aiSetup';

const web = { desktop: false };
const KEY = 'AIzaSyTESTKEY000000000000007Qx4';

function render(params?: Record<string, string>, env = web) {
  const props: SettingsSectionProps = { env, params, setResumeReady: () => {}, setCloseGuard: () => {} };
  return renderToStaticMarkup(createElement(AiSection, props));
}

const noop = () => {};
const actions: AiSectionActions = {
  selectProvider: noop, draft: noop, saveAndTest: noop, testAnyway: noop, saveWithoutTesting: noop,
  useForSession: noop, retryKeychain: noop, remember: noop, forgetAsked: noop, cancelForget: noop,
  forget: async () => {}, model: noop, baseUrl: () => true, workspace: noop, listModels: async () => {},
  includeTeacher: noop, getKey: noop,
};
function view(patch: Partial<AiSetupState>, settings: Partial<AiSettings> = {}, env = web, platform: 'mac' | 'windows' | 'web' = 'web') {
  const s = { ...AI_SETTINGS.defaults(env), ...settings };
  const state = { ...initialAiSetup(s, env, undefined, () => null), ...patch };
  return renderToStaticMarkup(
    createElement(AiSectionView, { env, state, settings: s, configured: false, listed: null, platform, actions }),
  );
}

/** The markup of one provider's card. */
const cardOf = (html: string, id: string) => html.split(`data-provider="${id}"`)[1]?.split('data-provider=')[0] ?? '';

afterEach(() => vi.unstubAllGlobals());

describe('the AI section', () => {
  it('preselects Gemini, recommended, with its Hong Kong limit in warn ink', () => {
    const html = render();
    const gemini = cardOf(html, 'gemini');
    expect(gemini).toMatch(/role="radio" aria-checked="true"/);
    expect(gemini).toContain('Recommended');
    expect(gemini).toMatch(/class="[^"]*text-warn-ink[^"]*">⚠ Google doesn(’|&#x27;)t offer AI Studio or the Gemini API in Hong Kong/);
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

  it('shows only the last 4 characters and the store of a saved key', () => {
    const session = new Map([['econgen.secret.ai:gemini', KEY]]);
    vi.stubGlobal('window', { sessionStorage: { getItem: (k: string) => session.get(k) ?? null }, localStorage: { getItem: () => null } });
    const html = render();
    expect(html).toContain('Saved in this tab only · ends in 7Qx4');
    expect(html).not.toContain(KEY);
    expect(html).not.toContain(KEY.slice(0, 12));
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
    expect(html).toContain('Google Gemini refused a request from your location. DeepSeek and Qwen work from Hong Kong.');
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
    expect(html).toContain('Google Gemini refused a request from your location.');
    expect(html).not.toContain('DeepSeek refused');
  });

  it('confirms Forget inline, without a second dialog', () => {
    const html = view({ key: { kind: 'saved', store: 'browser', last4: 'abcd' }, confirmForget: 'one' });
    expect(html).toContain('Forget the Google Gemini key?');
    expect(html).not.toContain('role="dialog"');
    expect(view({ confirmForget: 'all' })).toContain('Forget every AI key saved here?');
  });

  it('shows a shape warning with "Test anyway"', () => {
    const html = view({ key: { kind: 'editing', draft: 'sk-abc', shape: { likely: 'deepseek', message: 'This looks like a DeepSeek key.' } } });
    expect(html).toContain('This looks like a DeepSeek key.');
    expect(html).toContain('Test anyway');
  });

  it('shows a region error with one-click Hong Kong providers', () => {
    const html = view({
      test: { kind: 'error', error: { kind: 'region', provider: 'gemini', message: "Google Gemini's API doesn't serve your location.", fatal: true, actions: [] } },
    });
    expect(html).toContain('serve your location.');
    expect(html).toContain('Use DeepSeek');
    expect(html).toContain('Use Qwen');
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
