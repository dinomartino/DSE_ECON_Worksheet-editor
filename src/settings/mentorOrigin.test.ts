import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UiLanguageOverride } from '@/i18n/language';
import { MentorAccountCard, type MentorCardActions } from '@/components/settings/sections/aiSection/MentorAccountCard';
import { AI_SETTINGS, providerChoice } from './aiSettings';
import { MENTOR, MENTOR_PRODUCTION_ORIGIN, checkMentorOrigin, mentorEndpoints, resolveMentorOrigin } from '@/ai/mentorOrigin';
import { MENTOR_API, PRESETS } from '@/ai/providers';

/** Which Mentor a build talks to: production, or a develop build's NEXT_PUBLIC_MENTOR_ORIGIN (k-0519). */

const PREVIEW = 'https://dse-mentor-git-development-example.vercel.app';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** The app's Mentor modules as a build with these variables would have them. */
async function buildWith(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const [origin, providers, mentor] = await Promise.all([import('@/ai/mentorOrigin'), import('@/ai/providers'), import('@/ai/mentor')]);
  return { ...origin, ...providers, ...mentor };
}

describe('NEXT_PUBLIC_MENTOR_ORIGIN', () => {
  it('unset: production, for the API, the pages and the links', () => {
    expect(MENTOR.production).toBe(true);
    expect(MENTOR_API).toBe('https://dseconmentor.com/api/app/v1');
    expect(PRESETS.mentor.baseUrl).toBe('https://dseconmentor.com/api/app/v1/ai');
    expect(PRESETS.mentor.billingUrl).toBe('https://dseconmentor.com/account#ai-credits');
    expect([...MENTOR.hosts]).toEqual(['dseconmentor.com', 'www.dseconmentor.com']);
  });

  it('takes a bare https origin (or localhost over http), and nothing else', () => {
    expect(checkMentorOrigin(undefined)).toEqual({ ok: true, origin: MENTOR_PRODUCTION_ORIGIN });
    expect(checkMentorOrigin('  ')).toEqual({ ok: true, origin: MENTOR_PRODUCTION_ORIGIN });
    expect(checkMentorOrigin(PREVIEW)).toEqual({ ok: true, origin: PREVIEW });
    expect(checkMentorOrigin(`${PREVIEW}/`)).toEqual({ ok: true, origin: PREVIEW });
    expect(checkMentorOrigin('http://localhost:3001')).toEqual({ ok: true, origin: 'http://localhost:3001' });
    expect(checkMentorOrigin('http://127.0.0.1:3001')).toEqual({ ok: true, origin: 'http://127.0.0.1:3001' });
    for (const bad of [
      'dse-mentor.vercel.app',
      `http://dse-mentor.vercel.app`,
      `${PREVIEW}/api/app/v1`,
      `${PREVIEW}?x-vercel-protection-bypass=1`,
      `${PREVIEW}#x`,
      'https://user:pw@dse-mentor.vercel.app',
      'javascript:alert(1)',
      'ftp://dseconmentor.com',
    ]) {
      expect(checkMentorOrigin(bad).ok, bad).toBe(false);
    }
  });

  it('a bad value never reaches the app (the build stops)', () => {
    expect(resolveMentorOrigin(PREVIEW)).toBe(PREVIEW);
    expect(resolveMentorOrigin(undefined)).toBe(MENTOR_PRODUCTION_ORIGIN);
    expect(() => resolveMentorOrigin('https://x.example/path')).toThrow(/NEXT_PUBLIC_MENTOR_ORIGIN/);
  });

  it('a release always uses production: the Release workflow empties the variable, next.config refuses it', () => {
    const read = (file: string) => readFileSync(join(__dirname, '../..', file), 'utf8');
    expect(read('.github/workflows/release.yml')).toMatch(/^\s+NEXT_PUBLIC_MENTOR_ORIGIN: ''\s*$/m);
    const config = read('next.config.ts');
    expect(config).toMatch(/if \(RELEASE_BUILD\) \{\s*throw new Error\('NEXT_PUBLIC_MENTOR_ORIGIN is set in a release build/);
    expect(config).toContain('checkMentorOrigin(mentorOrigin)');
    for (const file of ['.github/workflows/ci.yml', '.github/workflows/desktop-preview.yml', 'package.json', 'src-tauri/tauri.conf.json']) {
      expect(read(file), file).not.toContain('NEXT_PUBLIC_MENTOR_ORIGIN');
    }
  });

  it('one origin sets the API, the pricing and Account pages, and the only host links may open', () => {
    const e = mentorEndpoints(PREVIEW);
    expect(e).toMatchObject({
      production: false,
      api: `${PREVIEW}/api/app/v1`,
      pricingUrl: `${PREVIEW}/pricing#ai-credits`,
      buyUrl: `${PREVIEW}/account#ai-credits`,
      label: 'dse-mentor-git-development-example.vercel.app',
    });
    expect([...e.hosts]).toEqual(['dse-mentor-git-development-example.vercel.app']);
  });

  it('a develop build pointed at a Preview: relay, links and buy link all on the Preview, production links refused', async () => {
    const b = await buildWith({ NEXT_PUBLIC_MENTOR_ORIGIN: PREVIEW });
    expect(b.MENTOR_API).toBe(`${PREVIEW}/api/app/v1`);
    expect(b.PRESETS.mentor.baseUrl).toBe(`${PREVIEW}/api/app/v1/ai`);
    expect(b.MENTOR_BUY_URL).toBe(`${PREVIEW}/account#ai-credits`);
    expect(b.MENTOR_PRICING_URL).toBe(`${PREVIEW}/pricing#ai-credits`);
    expect(b.safeMentorUrl(`${PREVIEW}/account?amount=75#ai-credits`, b.MENTOR_API)).toBe(`${PREVIEW}/account?amount=75#ai-credits`);
    expect(b.safeMentorUrl('https://dseconmentor.com/account#ai-credits', b.MENTOR_API)).toBeUndefined();
    expect(b.safeMentorUrl('https://evil.example/account', b.MENTOR_API)).toBeUndefined();
    // Mentor's /ai/credits from the Preview: its buy template is kept, a production one is not.
    const body = (urlTemplate: string) => ({
      balance: 500,
      extraPct: 10,
      buy: { minHkd: 50, maxHkd: 1000, quickPicks: [], urlTemplate, stripeFee: { pct: 3.4, fixedHkd: 2.35 } },
      buyUrl: 'https://dseconmentor.com/account#ai-credits',
    });
    const preview = b.readAccount(body(`${PREVIEW}/account?amount={hkd}#ai-credits`), b.MENTOR_API);
    expect(preview?.buy?.urlTemplate).toBe(`${PREVIEW}/account?amount={hkd}#ai-credits`);
    expect(preview?.buyUrl).toBe(`${PREVIEW}/account#ai-credits`);
    expect(b.readAccount(body('https://dseconmentor.com/account?amount={hkd}'), b.MENTOR_API)?.buy).toBeUndefined();
    // The relay calls the Preview.
    const seen: string[] = [];
    const fetch = (async (u: RequestInfo | URL) => (seen.push(String(u)), new Response(JSON.stringify({ balance: 1 }), { status: 200 }))) as typeof globalThis.fetch;
    await b.createMentorRelay({ deps: { fetch, now: () => 0, sleep: async () => undefined } }).account('dsm_test_token_0123456789abcdef', new AbortController().signal);
    expect(seen).toEqual([`${PREVIEW}/api/app/v1/ai/credits`]);
  });

  it('nothing stored at runtime can move the account elsewhere', () => {
    const settings = { ...AI_SETTINGS.defaults({ desktop: false }), baseUrls: { mentor: 'https://evil.example/api/app/v1/ai' } };
    expect(providerChoice(settings, 'mentor').baseUrl).toBe('https://dseconmentor.com/api/app/v1/ai');
  });

  it('a test build says so on the account card (EN/中); production says nothing', () => {
    const actions = new Proxy({}, { get: () => () => undefined }) as MentorCardActions;
    const el = (server?: string) => createElement(MentorAccountCard, { state: { kind: 'signedOut' }, inUse: false, server, actions });
    expect(renderToStaticMarkup(el())).not.toContain('data-mentor-server');
    const en = renderToStaticMarkup(el('dse-mentor-git-development-example.vercel.app'));
    expect(en).toContain('Test build: uses the DSEcon Mentor at dse-mentor-git-development-example.vercel.app, not dseconmentor.com.');
    const zh = renderToStaticMarkup(createElement(UiLanguageOverride.Provider, { value: 'zh-HK' }, el('x.vercel.app')));
    expect(zh).toContain('測試版本：使用 x.vercel.app 的 DSEcon Mentor，而不是 dseconmentor.com。');
  });
});
