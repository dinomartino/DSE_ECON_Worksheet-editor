import { describe, expect, it } from 'vitest';
import type { MentorAccount } from '@/ai/mentor';
import { presetFor } from '@/ai/providers';
import type { ProviderId } from '@/ai/types';
import { resolveMessages } from '@/i18n/catalogue';
import type { MentorState } from '@/settings/mentorAccount';
import { LOW_FALLBACK, aiChipState, lowCreditsLine } from './aiChip';
import { chipLabel, placeChoiceMenu } from './AiStatusChip';
import { AI_UI_MESSAGES } from './messages';

/** The AI status chip's states (k-0524, u-fs5v). */

const status = (provider: ProviderId, configured = true) => ({ provider, preset: presetFor(provider), configured });
const account = (credits: number, patch: Partial<MentorAccount> = {}): MentorAccount => ({
  credits,
  status: 'on',
  rates: { inputPerM: 1170, outputPerM: 5850 },
  buyUrl: 'https://dseconmentor.com/account#ai-credits',
  pricingUrl: 'https://dseconmentor.com/pricing#ai-credits',
  ...patch,
});
const signedIn = (a: MentorAccount | null): MentorState => ({ kind: 'signedIn', account: a, loading: false });
const en = resolveMessages(AI_UI_MESSAGES, 'en');
const zh = resolveMessages(AI_UI_MESSAGES, 'zh-HK');

describe('aiChipState', () => {
  it('the account in use: its credits, amber under one studio run, red at 0 or below', () => {
    const low = lowCreditsLine(account(0));
    expect(aiChipState(status('mentor'), signedIn(account(9003.7)))).toMatchObject({ kind: 'credits', credits: 9003.7, tone: 'normal' });
    expect(aiChipState(status('mentor'), signedIn(account(low - 1)))).toMatchObject({ tone: 'low' });
    expect(aiChipState(status('mentor'), signedIn(account(low)))).toMatchObject({ tone: 'normal' });
    expect(aiChipState(status('mentor'), signedIn(account(0)))).toMatchObject({ tone: 'out' });
    expect(aiChipState(status('mentor'), signedIn(account(-12)))).toMatchObject({ tone: 'out' });
    expect(aiChipState(status('mentor'), signedIn(null))).toMatchObject({ kind: 'credits', credits: null, tone: 'normal' });
  });

  it("paused or switched off: amber, whatever's left", () => {
    expect(aiChipState(status('mentor'), signedIn(account(9000, { status: 'paused' })))).toMatchObject({ tone: 'low', stopped: 'paused' });
    expect(aiChipState(status('mentor'), signedIn(account(9000, { status: 'off' })))).toMatchObject({ tone: 'low', stopped: 'off' });
  });

  it('an own key names its provider; Ollama is on this computer; nothing set up says so', () => {
    expect(aiChipState(status('gemini'), signedIn(account(500)))).toEqual({ kind: 'ownKey', provider: 'gemini', name: 'Gemini', local: false });
    expect(aiChipState(status('anthropic'), { kind: 'signedOut' })).toMatchObject({ name: 'Claude' });
    expect(aiChipState(status('deepseek'), { kind: 'signedOut' })).toMatchObject({ name: 'DeepSeek' });
    expect(aiChipState(status('ollama'), { kind: 'signedOut' })).toMatchObject({ local: true });
    expect(aiChipState(status('gemini', false), { kind: 'signedOut' })).toEqual({ kind: 'setup' });
    expect(aiChipState(status('mentor', false), { kind: 'signedOut' })).toEqual({ kind: 'setup' });
    expect(aiChipState(status('mentor', false), { kind: 'linking', code: null, verifyUrl: null })).toEqual({ kind: 'setup' });
  });
});

describe('lowCreditsLine', () => {
  it("Mentor's own studio figure first, then ours at its rates, then the fallback", () => {
    expect(lowCreditsLine(account(0, { buy: { minHkd: 50, maxHkd: 1000, quickPicks: [], urlTemplate: 'x{hkd}', studioWorksheet: 280 } }))).toBe(280);
    const ours = lowCreditsLine(account(0));
    expect(ours).toBeGreaterThan(50);
    expect(ours).toBeLessThan(1000);
    expect(lowCreditsLine(account(0, { rates: undefined }))).toBe(LOW_FALLBACK);
    expect(lowCreditsLine(null)).toBe(LOW_FALLBACK);
  });
});

describe('chipLabel', () => {
  it('reads the same in English and 中文', () => {
    const credits = aiChipState(status('mentor'), signedIn(account(9003.7)));
    expect(chipLabel(credits, en, 'en')).toBe('AI credits 9,003');
    expect(chipLabel(credits, zh, 'zh-HK')).toBe('AI 點數 9,003');
    const own = aiChipState(status('gemini'), { kind: 'signedOut' });
    expect(chipLabel(own, en, 'en')).toBe('AI: own key (Gemini)');
    expect(chipLabel(own, zh, 'zh-HK')).toBe('AI：自己的 API key（Gemini）');
    expect(chipLabel({ kind: 'setup' }, en, 'en')).toBe('Set up AI');
    expect(chipLabel({ kind: 'setup' }, zh, 'zh-HK')).toBe('設定 AI');
    expect(chipLabel(aiChipState(status('mentor'), signedIn(null)), en, 'en')).toBe('AI credits …');
  });
});

/** The chip's menu stays inside the window wherever the chip is (k-0541, u-14xb). */
describe('placeChoiceMenu', () => {
  const view = { width: 1280, height: 800 };
  const menu = { width: 240, height: 130 };
  const chip = (left: number, top: number, width = 110, height = 24) => ({ left, top, right: left + width, bottom: top + height });
  const inside = (at: { top: number; left: number }) => {
    expect(at.left).toBeGreaterThanOrEqual(8);
    expect(at.left + menu.width).toBeLessThanOrEqual(view.width - 8);
    expect(at.top).toBeGreaterThanOrEqual(8);
    expect(at.top + menu.height).toBeLessThanOrEqual(view.height - 8);
  };

  it('the studio sidebar: chip at the far left and low, menu opens up from its left edge, not off-screen', () => {
    const anchor = chip(10, 760);
    const at = placeChoiceMenu(anchor, menu, view);
    expect(at).toMatchObject({ side: 'up', align: 'left', left: 10 });
    expect(at.top + menu.height).toBeLessThanOrEqual(anchor.top);
    inside(at);
  });

  it('the studio header: chip at the right and high, menu opens down from its right edge', () => {
    const anchor = chip(1150, 12);
    const at = placeChoiceMenu(anchor, menu, view);
    expect(at).toMatchObject({ side: 'down', align: 'right', left: anchor.right - menu.width, top: anchor.bottom + 6 });
    inside(at);
  });

  it('never covers the chip when either side has room, and is pushed back in at the window edges', () => {
    for (const [left, top] of [[0, 0], [1270, 0], [0, 776], [1270, 776], [600, 400], [-30, 300]]) {
      const anchor = chip(left, top);
      const at = placeChoiceMenu(anchor, menu, view);
      inside(at);
      expect(at.top >= anchor.bottom || at.top + menu.height <= anchor.top).toBe(true);
    }
  });

  it('a window too short for either side: the side with more room, still inside', () => {
    const short = { width: 400, height: 200 };
    const at = placeChoiceMenu(chip(20, 120), menu, short);
    expect(at.side).toBe('up');
    expect(at.top).toBeGreaterThanOrEqual(8);
  });
});
