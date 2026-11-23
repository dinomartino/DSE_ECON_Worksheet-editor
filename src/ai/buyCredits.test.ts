import { describe, expect, it } from 'vitest';
import { cleanBuyHkd, creditsForPayment, studioQuestions, type PaymentTerms } from './credits';
import { FAKE_BUY, fakeMentor } from './fakeMentor';
import { MENTOR_API } from './providers';
import { buyUrlFor, createMentorRelay, readAccount } from './mentor';

/** Buying credits for any whole HK$ amount (CONTRACT v1.4, u-1zca). */

const TERMS: PaymentTerms = { stripeFee: FAKE_BUY.stripeFee, extraPct: 10, creditsPerHkd: 100 };

/** Mentor's `creditsForPayment` (`src/lib/ai-credits-config.ts`, development 5d94f44), transcribed with its own constants. */
function mentorsFormula(hkd: number): number {
  const net = hkd - (hkd * 0.034 + 2.35);
  const googleHkd = net / (1 + 10 / 100);
  return Math.max(0, Math.floor((googleHkd * 100) / 10 + 1e-9) * 10);
}

describe("credits for an amount: Mentor's formula", () => {
  it("gives Mentor's own quick-pick numbers", () => {
    for (const pick of FAKE_BUY.quickPicks) expect(creditsForPayment(pick.hkd, TERMS), `HK$${pick.hkd}`).toBe(pick.credits);
  });

  it('gives the contract’s price table (§6): HK$250 → 21,740, HK$1,000 → 87,600', () => {
    expect(creditsForPayment(250, TERMS)).toBe(21740);
    expect(creditsForPayment(1000, TERMS)).toBe(87600);
  });

  it('agrees with the server on every whole amount from HK$50 to HK$1,000', () => {
    const off: number[] = [];
    for (let hkd = 50; hkd <= 1000; hkd++) if (creditsForPayment(hkd, TERMS) !== mentorsFormula(hkd)) off.push(hkd);
    expect(off).toEqual([]);
  });

  it('follows the figures it is given (another extra, another fee)', () => {
    expect(creditsForPayment(100, { ...TERMS, extraPct: 0 })).toBe(9420);
    expect(creditsForPayment(100, { ...TERMS, stripeFee: { pct: 0, fixedHkd: 0 } })).toBe(9090);
    expect(creditsForPayment(0, TERMS)).toBe(0);
    expect(creditsForPayment(1, TERMS)).toBe(0);
  });

  it('studio questions: credits ÷ (worksheet ÷ 10), down to 5 from 10 up', () => {
    expect(studioQuestions(4170, 280)).toBe(145);
    expect(studioQuestions(8560, 280)).toBe(305);
    expect(studioQuestions(17350, 280)).toBe(615);
    expect(studioQuestions(200, 280)).toBe(7);
    expect(studioQuestions(0, 280)).toBe(0);
    expect(studioQuestions(4170, 0)).toBe(0);
  });

  it('an amount is a whole number of HK$ in range, else refused', () => {
    const range = { minHkd: 50, maxHkd: 1000 };
    expect(cleanBuyHkd('100', range)).toBe(100);
    expect(cleanBuyHkd(' 75 ', range)).toBe(75);
    expect(cleanBuyHkd('50', range)).toBe(50);
    expect(cleanBuyHkd('1000', range)).toBe(1000);
    for (const bad of ['49', '1001', '12.5', '1e2', '', 'abc', '-60', '100 HKD', '０１００']) expect(cleanBuyHkd(bad, range), bad).toBeNull();
  });
});

describe('/ai/credits → buy', () => {
  const body = (patch: Record<string, unknown> = {}, buy: Record<string, unknown> = {}) => ({
    balance: 500,
    extraPct: 10,
    rates: { creditsPerHkd: 100, inputPerMillionTokens: 1170, outputPerMillionTokens: 5850 },
    estimates: { studioWorksheet: 280 },
    buy: { ...FAKE_BUY, ...buy },
    ...patch,
  });

  it('reads the limits, the quick picks, the fee figures and the link', async () => {
    const server = fakeMentor();
    const account = await createMentorRelay({ deps: server.deps }).account(server.token, new AbortController().signal);
    expect(account.buy).toEqual({
      minHkd: 50,
      maxHkd: 1000,
      quickPicks: FAKE_BUY.quickPicks,
      urlTemplate: FAKE_BUY.urlTemplate,
      terms: TERMS,
      studioWorksheet: 280,
    });
    expect(account.packs).toHaveLength(3);
  });

  it('Buy opens the Account page with the amount filled in', () => {
    expect(buyUrlFor(FAKE_BUY, 75)).toBe('https://dseconmentor.com/account?amount=75#ai-credits');
  });

  it('an older Mentor without buy: none (the card falls back to packs)', async () => {
    const server = fakeMentor({ noBuy: true });
    const account = await createMentorRelay({ deps: server.deps }).account(server.token, new AbortController().signal);
    expect(account.buy).toBeUndefined();
    expect(account.packs?.[0]).toEqual({ priceHkd: 50, credits: 4170 });
  });

  it('refuses a link that is not Mentor’s, or has no {hkd}, and bad limits', () => {
    expect(readAccount(body({}, { urlTemplate: 'https://evil.example/pay?amount={hkd}' }), MENTOR_API)?.buy).toBeUndefined();
    expect(readAccount(body({}, { urlTemplate: 'https://dseconmentor.com/account#ai-credits' }), MENTOR_API)?.buy).toBeUndefined();
    expect(readAccount(body({}, { minHkd: 500, maxHkd: 100 }), MENTOR_API)?.buy).toBeUndefined();
    expect(readAccount(body({}, { minHkd: 'fifty' }), MENTOR_API)?.buy).toBeUndefined();
  });

  it('drops a quick pick out of range; no extraPct or fee: no live line, still buyable', () => {
    const picks = readAccount(body({}, { quickPicks: [{ hkd: 20, credits: 1 }, { hkd: 100, credits: 8560 }, { hkd: 'x' }] }), MENTOR_API)?.buy?.quickPicks;
    expect(picks).toEqual([{ hkd: 100, credits: 8560 }]);
    const noExtra = readAccount(body({ extraPct: undefined }), MENTOR_API)?.buy;
    expect(noExtra?.terms).toBeUndefined();
    expect(noExtra?.minHkd).toBe(50);
    expect(readAccount(body({}, { stripeFee: null }), MENTOR_API)?.buy?.terms).toBeUndefined();
    expect(readAccount(body({ estimates: undefined }), MENTOR_API)?.buy?.studioWorksheet).toBeUndefined();
  });
});
