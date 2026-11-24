import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { creditsFor, importCheckJob, roundCredits, studioJob, translateJob } from '@/ai/credits';
import type { MentorAccount } from '@/ai/mentor';
import { resolveMessages } from '@/i18n/catalogue';
import { CreditEstimateLine } from './CreditEstimate';
import { AI_UI_MESSAGES } from './messages';

/**
 * The "約用 N 點" lines once Mentor prices each job at its own model (CONTRACT v1.6, k-0543):
 * translate and the bank's fill on Flash-Lite drop; the studio and import check don't move.
 */

const MAIN = { inputPerM: 1170, outputPerM: 5850 };
const LITE = { inputPerM: 234, outputPerM: 1950 };
const V16: Pick<MentorAccount, 'rates' | 'models'> = {
  rates: MAIN,
  models: { default: 'gemini-4-hydrogen', byFeature: { translate: 'gemini-3.5-flash-lite', test: 'gemini-3.5-flash-lite' }, rates: { 'gemini-4-hydrogen': MAIN, 'gemini-3.5-flash-lite': LITE } },
};
const OLD: Pick<MentorAccount, 'rates' | 'models'> = { rates: MAIN };

describe('what the teacher sees (約用 N 點)', () => {
  const zh = resolveMessages(AI_UI_MESSAGES, 'zh-HK');
  const line = (job: Parameters<typeof creditsFor>[0], account: typeof V16) =>
    renderToStaticMarkup(createElement(CreditEstimateLine, { credits: roundCredits(creditsFor(job, account) ?? 0), left: 3456, lang: 'zh-HK', m: zh, showLeft: false }));
  const before = (job: Parameters<typeof creditsFor>[0]) => roundCredits(creditsFor(job, OLD) ?? 0);
  const after = (job: Parameters<typeof creditsFor>[0]) => roundCredits(creditsFor(job, V16) ?? 0);

  // A 20-question Paper 1 to 中文 in two requests (about 6k tokens in).
  const paper = Array.from({ length: 20 }, (_, i) => `Question ${i + 1}. A cafe raises the price of a milk tea from $20 to $25, and the cups sold each day fall from 400 to 300. Which of the following statements about the price elasticity of demand is correct? `.repeat(2));
  const translate = translateJob(paper, 2);
  // The bank's Fill missing 中文, one field: one request with the fixed instructions.
  const bankField = translateJob(['Which of the following would make the demand for a good more price elastic?'], 1);
  const studio = studioJob({ questions: 10, sides: 2 });

  // Rates alone: input ÷ 5, output ÷ 3. The estimate still counts Hydrogen-sized thinking, so it
  // sits above Mentor's measured 1/7 (k-0539): an over-estimate, the safe side.
  it('translate drops to under a third (Flash-Lite)', () => {
    expect(before(translate)).toBe(30);
    expect(after(translate)).toBe(9);
    expect(line(translate, V16)).toContain('約用 9 點');
  });

  it('bank fill, one field, drops from about 5 credits to about 2', () => {
    expect(before(bankField)).toBe(5);
    expect(after(bankField)).toBe(2);
    expect(line(bankField, V16)).toContain('約用 2 點');
  });

  it("the studio's line (pick and writing stay on Hydrogen) and the import check don't change", () => {
    expect(after(studio)).toBe(before(studio));
    expect(line(studio, V16)).toContain(`約用 ${before(studio)} 點`);
    const check = importCheckJob(20, 'y'.repeat(20000));
    expect(after(check)).toBe(before(check));
  });

  it("an older Mentor's estimates stay as they were", () => {
    expect(creditsFor(translate, OLD)).toBeCloseTo(creditsFor({ inputTokens: translate.inputTokens, outputTokens: translate.outputTokens }, OLD) ?? 0, 9);
  });
});
