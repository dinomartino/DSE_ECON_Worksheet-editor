import { describe, expect, it, vi } from 'vitest';
import type { AiErrorInfo } from '@/ai/types';
import type { ReviewItem } from '@/assist/types';
import { openExternal } from '@/platform';
import { errorActions, errorNote, runErrorAction } from './errorActions';

vi.mock('@/platform', async (actual) => ({ ...(await actual<object>()), openExternal: vi.fn(async () => {}) }));
import { markTones } from './pageMarks';

const error = (over: Partial<AiErrorInfo>): AiErrorInfo => ({
  kind: 'quota',
  provider: 'gemini',
  message: 'Out of quota',
  fatal: true,
  actions: [],
  ...over,
});
const labels = (e: AiErrorInfo) => errorActions(e).map((a) => a.label);

describe('errorActions', () => {
  it('region: Try again first (primary), then the Hong Kong providers and Settings, with the VPN note', () => {
    const region = error({ kind: 'region', actions: ['retry', 'switchProvider', 'openSettings'] });
    expect(labels(region)).toEqual(['Try again', 'Use DeepSeek', 'Use Qwen', 'Open Settings']);
    expect(errorActions(region)[0]).toMatchObject({ kind: 'retry' });
    expect(errorNote(region)).toBe('Keep the VPN on while you use Gemini. DeepSeek and Qwen work in Hong Kong without a VPN.');
    expect(labels(error({ kind: 'region', provider: 'deepseek', actions: [] }))).toEqual(['Use Qwen', 'Open Settings']);
  });

  it('Gemini that cannot be reached says it needs a VPN in Hong Kong (k-0499); other errors and providers say nothing', () => {
    const vpn = 'In Hong Kong, Gemini needs a VPN. Turn it on, then try again. DeepSeek and Qwen work in Hong Kong without a VPN.';
    for (const kind of ['network', 'networkOrKey', 'timeout'] as const) expect(errorNote(error({ kind }))).toBe(vpn);
    for (const kind of ['quota', 'badKey', 'server', 'badRequest', 'model'] as const) expect(errorNote(error({ kind }))).toBeUndefined();
    expect(errorNote(error({ kind: 'network', provider: 'deepseek' }))).toBeUndefined();
    expect(errorNote(error({ kind: 'timeout', provider: 'qwen' }))).toBeUndefined();
  });

  it('shows only the actions the error names', () => {
    expect(labels(error({ actions: ['useFallbackModel', 'retry'] }))).toEqual(['Switch to Gemini 3.5 Flash-Lite', 'Try again']);
    expect(labels(error({ kind: 'badKey', actions: ['openKeyPage', 'openSettings'] }))).toEqual(['Get a new key', 'Open Settings']);
    expect(labels(error({ kind: 'model', actions: ['chooseModel'] }))).toEqual(['Choose a model…']);
    expect(labels(error({ actions: [] }))).toEqual([]);
    expect(errorNote(error({}))).toBeUndefined();
  });
});

describe('billing', () => {
  const billing = (provider: AiErrorInfo['provider']) => error({ kind: 'billing', provider, actions: ['openBilling', 'switchProvider'] });
  const open = (provider: AiErrorInfo['provider']) => {
    vi.mocked(openExternal).mockClear();
    const e = billing(provider);
    const action = errorActions(e).find((a) => a.kind === 'billingPage')!;
    runErrorAction(action, e, { retry: () => {}, dismiss: () => {} });
    return vi.mocked(openExternal).mock.calls.map(([url]) => url);
  };

  it("opens the provider's billing page, not the key page", () => {
    expect(labels(billing('deepseek'))).toEqual(['Open DeepSeek', 'Switch provider…']);
    expect(open('deepseek')).toEqual(['https://platform.deepseek.com/top_up']);
    expect(open('openrouter')).toEqual(['https://openrouter.ai/settings/credits']);
  });

  it('falls back to the key page where there is no billing page (Qwen)', () => {
    expect(open('qwen')).toEqual(['https://modelstudio.console.alibabacloud.com/']);
  });
});

describe('markTones', () => {
  it('one mark per page text, the strongest tone winning; failed items mark nothing', () => {
    const item = (id: string, tone: ReviewItem['tone'], targetKey?: string): ReviewItem => ({ id, tone, where: '', notes: [], ...(targetKey ? { targetKey } : {}) });
    const marks = markTones([
      item('a', 'inserted', 'k1'),
      item('b', 'look', 'k1'),
      item('c', 'inserted', 'k2'),
      item('d', 'failed', 'k3'),
      item('e', 'finding', 'k4'),
      item('f', 'look'),
    ]);
    expect([...marks]).toEqual([['k1', 'look'], ['k2', 'inserted'], ['k4', 'finding']]);
  });

  it('a resolved finding marks as changed text', () => {
    const fixed: ReviewItem = { id: 'a', tone: 'finding', where: '', notes: [], targetKey: 'k1', resolved: true };
    expect([...markTones([fixed])]).toEqual([['k1', 'inserted']]);
  });
});

describe('Not enough credits → Use my own key (k-0527)', () => {
  const noCredits = error({ kind: 'noCredits', provider: 'mentor', actions: ['buyCredits', 'useOwnKey'] });

  it('with an own key saved: names it, switches the choice to it and runs the job again', async () => {
    const { appSettings } = await import('@/settings/store');
    const { AI_SETTINGS } = await import('@/settings/aiSettings');
    const { writeSecret, deleteSecret } = await import('@/platform/secrets');
    appSettings.write(AI_SETTINGS, { provider: 'mentor' });
    await writeSecret('ai:gemini', 'AIzaSyTESTKEY000000000000007Qx4', { remember: false });
    try {
      expect(labels(noCredits)).toEqual(['Buy credits', 'Use my own key (Gemini)']);
      const retry = vi.fn();
      const dismiss = vi.fn();
      runErrorAction(errorActions(noCredits).find((a) => a.kind === 'useOwnKey')!, noCredits, { retry, dismiss });
      expect(appSettings.read(AI_SETTINGS).provider).toBe('gemini');
      expect(retry).toHaveBeenCalledTimes(1);
    } finally {
      await deleteSecret('ai:gemini');
      appSettings.write(AI_SETTINGS, { provider: 'gemini' });
    }
  });

  it('with no own key: opens Settings → AI to add one, the choice stays on Mentor', async () => {
    const { appSettings } = await import('@/settings/store');
    const { AI_SETTINGS } = await import('@/settings/aiSettings');
    const { useAppDialogs } = await import('@/store/appDialogs');
    appSettings.write(AI_SETTINGS, { provider: 'mentor' });
    const openSettings = vi.spyOn(useAppDialogs.getState(), 'openSettings').mockImplementation(() => {});
    try {
      expect(labels(noCredits)).toEqual(['Buy credits', 'Use my own key…']);
      const retry = vi.fn();
      runErrorAction(errorActions(noCredits).find((a) => a.kind === 'useOwnKey')!, noCredits, { retry, dismiss: () => {} });
      expect(appSettings.read(AI_SETTINGS).provider).toBe('mentor');
      expect(retry).not.toHaveBeenCalled();
      expect(openSettings).toHaveBeenCalledWith(expect.objectContaining({ section: 'ai', focus: 'ownKey' }));
    } finally {
      openSettings.mockRestore();
      appSettings.write(AI_SETTINGS, { provider: 'gemini' });
    }
  });
});
