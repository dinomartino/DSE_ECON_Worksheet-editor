import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { creditsFor, importCheckJob, roundCredits, studioJob, textTokens, translateJob, usdFor } from '@/ai/credits';
import { aiErrorInfo } from '@/ai/errors';
import { CreditEstimateLine } from '@/components/ai/CreditEstimate';
import { AI_UI_MESSAGES } from '@/components/ai/messages';
import { errorActions } from '@/components/ai/errorActions';
import { resolveMessages } from '@/i18n/catalogue';
import { UiLanguageOverride } from '@/i18n/language';
import { assistMessages } from '@/assist/text';
import type { MentorState } from '@/settings/mentorAccount';
import { AI_SETTINGS } from '@/settings/aiSettings';
import { AiSectionView } from './AiSectionView';
import { initialAiSetup } from './aiSetup';
import { MentorAccountCard, formatCredits, type MentorCardActions } from './MentorAccountCard';
import type { AiSectionActions } from './AiSection';

/** The DSEcon Mentor account in Settings → AI, the credit line and its errors' buttons (k-0519). */

const actions = new Proxy({}, { get: () => () => undefined }) as MentorCardActions;
const zh = (el: ReactElement) => renderToStaticMarkup(createElement(UiLanguageOverride.Provider, { value: 'zh-HK' }, el));
const card = (state: MentorState, inUse = true) => createElement(MentorAccountCard, { state, inUse, actions });
const SIGNED_IN: Extract<MentorState, { kind: 'signedIn' }> = {
  kind: 'signedIn',
  loading: false,
  account: {
    credits: 3456.7,
    status: 'on',
    rates: { inputPerM: 1170, outputPerM: 5850 },
    trialCredits: 900,
    buyUrl: 'https://dseconmentor.com/account#ai-credits',
    pricingUrl: 'https://dseconmentor.com/pricing#ai-credits',
  },
};

describe('MentorAccountCard', () => {
  it('signed out: what it is, Sign in, Prices, and where the text goes', () => {
    const html = renderToStaticMarkup(card({ kind: 'signedOut' }));
    expect(html).toContain('data-mentor-account="signedOut"');
    expect(html).toContain('Sign in with DSEcon Mentor');
    expect(html).toContain('free trial credits');
    expect(html).toContain('never your text');
  });

  it('signing in: the code to check, Open the page again and Cancel', () => {
    const html = renderToStaticMarkup(card({ kind: 'linking', code: 'ABCD-1234', verifyUrl: 'https://www.dseconmentor.com/link?code=ABCD-1234' }));
    expect(html).toContain('the code is ABCD-1234');
    expect(html).toContain('Open the page again');
    expect(html).toContain('Cancel');
  });

  it('signed in and in use: credits left (rounded down), Buy credits, Sign out', () => {
    const html = renderToStaticMarkup(card(SIGNED_IN));
    expect(html).toContain('3,456 credits left');
    expect(html).toContain('Gemini 4 Hydrogen');
    expect(html).toContain('Buy credits');
    expect(html).toContain('Sign out');
    expect(html).not.toContain('Use my DSEcon Mentor account');
  });

  it('signed in but an own key in use: offers to switch back', () => {
    const html = renderToStaticMarkup(card(SIGNED_IN, false));
    expect(html).toContain('AI uses your own key now.');
    expect(html).toContain('Use my DSEcon Mentor account');
  });

  it('a paused or switched-off service says so', () => {
    expect(renderToStaticMarkup(card({ ...SIGNED_IN, account: { ...SIGNED_IN.account!, status: 'paused' } }))).toContain('paused for today');
    expect(renderToStaticMarkup(card({ ...SIGNED_IN, account: { ...SIGNED_IN.account!, status: 'off' } }))).toContain('switched off');
  });

  it('a denied sign-in and a failed credits read say so', () => {
    expect(renderToStaticMarkup(card({ kind: 'signedOut', reason: 'denied' }))).toContain('Sign-in was not allowed.');
    const failed = renderToStaticMarkup(card({ ...SIGNED_IN, error: aiErrorInfo('serviceDown', 'mentor') }));
    expect(failed).toContain('paused or switched off');
    expect(failed).toContain('Refresh');
  });

  it('中文', () => {
    expect(zh(card({ kind: 'signedOut' }))).toContain('以 DSEcon Mentor 登入');
    const html = zh(card(SIGNED_IN));
    expect(html).toContain('尚餘 3,456 點');
    expect(html).toContain('購買點數');
    expect(html).toContain('登出');
  });

  it('formats credits whole, never 0 for a fraction left', () => {
    expect(formatCredits(0.4, 'en')).toBe('<1');
    expect(formatCredits(12345.9, 'en')).toBe('12,345');
    expect(formatCredits(0, 'en')).toBe('0');
  });
});

describe('Settings → AI with the account', () => {
  const noop = () => {};
  const sectionActions = new Proxy({}, { get: () => noop }) as unknown as AiSectionActions;
  const view = (mentor: MentorState, provider: 'mentor' | 'gemini') => {
    const settings = { ...AI_SETTINGS.defaults({ desktop: false }), provider };
    const state = initialAiSetup(settings, { desktop: false }, undefined, () => null);
    return renderToStaticMarkup(
      createElement(AiSectionView, { env: { desktop: false }, state, settings, keys: [], configured: true, listed: null, platform: 'web', actions: sectionActions, mentor, mentorActions: actions }),
    );
  };

  it('signed out: the account card first, the own-key providers as before', () => {
    const html = view({ kind: 'signedOut' }, 'gemini');
    expect(html.indexOf('data-mentor-account')).toBeLessThan(html.indexOf('data-provider="gemini"'));
    expect(html).not.toContain('Advanced: use your own API key');
  });

  it('signed in and in use: own keys move under Advanced, closed', () => {
    const html = view(SIGNED_IN, 'mentor');
    expect(html).toContain('Advanced: use your own API key');
    expect(html).not.toContain('data-provider="gemini"');
  });

  it('signed in with an own key in use: Advanced is open', () => {
    const html = view(SIGNED_IN, 'gemini');
    expect(html).toContain('Advanced: use your own API key');
    expect(html).toContain('data-provider="gemini"');
  });

  it('the account is never a provider card or a saved key', () => {
    const html = view(SIGNED_IN, 'gemini');
    expect(html).not.toContain('data-provider="mentor"');
    expect(html).not.toContain('data-key-row="mentor"');
  });
});

describe('credit estimates', () => {
  it('counts 中文 per character and other text by four', () => {
    expect(textTokens('物價水平')).toBe(4);
    expect(textTokens('price level!')).toBe(3);
  });

  it('prices at the account’s rates (credits per million tokens); no rates, no estimate', () => {
    const job = { inputTokens: 1_000_000, outputTokens: 100_000 };
    expect(usdFor(job)).toBeCloseTo(2.25);
    // CONTRACT §2: 100 credits = HK$1, so US$2.25 × 7.8 × 100.
    expect(creditsFor(job, { rates: { inputPerM: 1170, outputPerM: 5850 } })).toBeCloseTo(1755);
    expect(creditsFor(job, {})).toBeNull();
    expect(creditsFor(job, null)).toBeNull();
  });

  it("a studio worksheet lands near Mentor's own estimate (280 credits)", () => {
    const credits = creditsFor(studioJob({ questions: 10, sides: 2, diagrams: 4, images: 1 }), { rates: { inputPerM: 1170, outputPerM: 5850 } }) ?? 0;
    expect(credits).toBeGreaterThan(200);
    expect(credits).toBeLessThan(400);
  });

  it('rounds to "about": whole, two figures from 100, at least 1', () => {
    expect(roundCredits(0.2)).toBe(1);
    expect(roundCredits(12.1)).toBe(13);
    expect(roundCredits(1234)).toBe(1300);
  });

  it('a studio worksheet of 10 MC with diagrams costs about what the proposal measured (US$0.3–0.5)', () => {
    const usd = usdFor(studioJob({ questions: 10, sides: 2, diagrams: 4, images: 1 }));
    expect(usd).toBeGreaterThan(0.3);
    expect(usd).toBeLessThan(0.5);
  });

  it('translate and import check scale with the text', () => {
    expect(usdFor(translateJob(['x'.repeat(8000)], 4))).toBeLessThan(0.05);
    expect(importCheckJob(20, 'y'.repeat(20000)).outputTokens).toBe(7100);
  });

  it('the line: about N · left, and warn words when short', () => {
    const m = resolveMessages(AI_UI_MESSAGES, 'en');
    const ok = renderToStaticMarkup(createElement(CreditEstimateLine, { credits: 40, left: 3456, lang: 'en', m }));
    expect(ok).toContain('Uses about 40 credits · 3,456 left');
    const short = renderToStaticMarkup(createElement(CreditEstimateLine, { credits: 40, left: 10, lang: 'en', m }));
    expect(short).toContain('More than your credits left');
    expect(short).toContain('text-warn-ink');
    const one = renderToStaticMarkup(createElement(CreditEstimateLine, { credits: 1, left: 10, lang: 'en', m }));
    expect(one).toContain('Uses about 1 credit ·');
  });
});

describe("the account's errors and words", () => {
  it('each error offers what to do', () => {
    const kinds = (kind: 'signedOut' | 'noCredits' | 'serviceDown') => errorActions(aiErrorInfo(kind, 'mentor')).map((a) => a.kind);
    expect(kinds('signedOut')).toEqual(['signIn']);
    expect(kinds('noCredits')).toEqual(['buyCredits', 'useOwnKey']);
    expect(kinds('serviceDown')).toEqual(['retry', 'useOwnKey']);
  });

  it('menu lines say "through your account", never "with your key"', () => {
    const m = assistMessages();
    expect(m.sendsTexts(52, 'DSEcon Mentor')).toBe('Sends 52 texts through your DSEcon Mentor account');
    expect(m.sendsTexts(52, 'Google Gemini')).toBe('Sends 52 texts to Google Gemini with your key');
  });
});
