import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UiLanguageOverride } from '@/i18n/language';
import type { MentorState } from '@/settings/mentorAccount';
import { AiChoiceField } from './AiChoiceField';
import { MentorAccountCard, type MentorCardActions } from './MentorAccountCard';

/** Settings → AI's "Use for AI" choice (k-0527, u-ypm9). */

const zh = (el: ReactElement) => renderToStaticMarkup(createElement(UiLanguageOverride.Provider, { value: 'zh-HK' }, el));
const field = (using: 'mentor' | 'own', credits: string | null = '9,003') => createElement(AiChoiceField, { using, own: 'Gemini', credits, onChoose: () => {} });

describe('the "Use for AI" choice', () => {
  it('two radios, the chosen one checked, each saying who pays (EN)', () => {
    const html = renderToStaticMarkup(field('mentor'));
    expect(html).toContain('Use for AI');
    expect(html).toMatch(/role="radio" aria-checked="true" data-ai-choice="mentor"/);
    expect(html).toMatch(/role="radio" aria-checked="false" data-ai-choice="own"/);
    expect(html).toContain('DSEcon Mentor credits');
    expect(html).toContain('9,003 credits left. No VPN needed.');
    expect(html).toContain('My own key (Gemini)');
    expect(html).toContain('Gemini bills your own account. No credits are used.');
    expect(renderToStaticMarkup(field('own', null))).toMatch(/aria-checked="true" data-ai-choice="own"/);
    expect(renderToStaticMarkup(field('own', null))).toContain('Pay as you go with credits.');
  });

  it('in 中文', () => {
    const html = zh(field('own'));
    expect(html).toContain('AI 使用');
    expect(html).toContain('DSEcon Mentor 點數');
    expect(html).toContain('我自己的 API key（Gemini）');
    expect(html).toContain('尚餘 9,003 點，毋須 VPN。');
    expect(html).toContain('由 Gemini 向你自己的帳戶收費，不會用點數。');
  });

  it('with the choice shown, the account card drops its own "in use" line and Use button', () => {
    const actions = new Proxy({}, { get: () => () => undefined }) as MentorCardActions;
    const state: MentorState = { kind: 'signedIn', loading: false, account: null };
    const card = (choiceShown: boolean) => renderToStaticMarkup(createElement(MentorAccountCard, { state, inUse: false, choiceShown, actions }));
    expect(card(false)).toContain('Use my DSEcon Mentor account');
    expect(card(false)).toContain('AI uses your own key now.');
    expect(card(true)).not.toContain('Use my DSEcon Mentor account');
    expect(card(true)).not.toContain('AI uses your own key now.');
    expect(card(true)).toContain('Sign out');
  });
});
