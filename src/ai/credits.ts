import type { CreditRates, MentorAccount } from './mentor';
import type { AiFeature } from './types';

/**
 * "Uses about N credits" before a run on the DSEcon Mentor account (k-0519, E4). An estimate,
 * not a quote: tokens are guessed from the text (a 中文 character ≈ 1 token, other text ≈ 4
 * characters a token), thinking is counted as output (Gemini bills it so), and the rates are
 * the account's, for the model the job's `feature` runs on (`/ai/credits` → `models`, v1.6;
 * an older Mentor's single `rates` otherwise; credits per million tokens). The server keeps the
 * real cost from Gemini's own counts.
 */

export interface CreditJob {
  inputTokens: number;
  outputTokens: number;
  /** The `feature` tag its calls send: the server picks the model, so the rates, by it (v1.6). */
  feature?: AiFeature;
}

/** Gemini 4 Hydrogen, paid tier, US$ per million tokens (aistudio.google.com/docs/pricing, 2026-11-23). */
export const HYDROGEN_PRICE = { inputUsdPerM: 1.5, outputUsdPerM: 7.5 } as const;

/** One picture sent to Gemini, in input tokens (a page-sized image is about 1,100). */
export const IMAGE_TOKENS = 1100;

const CJK = /[㐀-鿿豈-﫿　-〿＀-￯]/g;

/** A text's tokens, roughly. */
export function textTokens(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0;
  return Math.ceil(cjk + (text.length - cjk) / 4);
}

/** Jobs summed; the feature is kept only when they all share it (else the main model prices the lot). */
export function addJobs(...jobs: CreditJob[]): CreditJob {
  const sum: CreditJob = jobs.reduce<CreditJob>((a, b) => ({ inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens }), { inputTokens: 0, outputTokens: 0 });
  const feature = jobs[0]?.feature;
  return feature && jobs.every((j) => j.feature === feature) ? { ...sum, feature } : sum;
}

/** US$ for a job at Google's list price (the proposal's sums and the tests). */
export function usdFor(job: CreditJob, price: { inputUsdPerM: number; outputUsdPerM: number } = HYDROGEN_PRICE): number {
  return (job.inputTokens * price.inputUsdPerM + job.outputTokens * price.outputUsdPerM) / 1e6;
}

/**
 * The rates a call tagged `feature` is charged at: `models.rates[models.byFeature[feature] ??
 * models.default]` (CONTRACT v1.6), else the main model's `rates` (an older Mentor, or a model
 * it named no rates for: the dearer guess).
 */
export function ratesFor(account: Pick<MentorAccount, 'rates' | 'models'> | null, feature?: AiFeature): CreditRates | undefined {
  const models = account?.models;
  if (models) {
    const model = feature && Object.hasOwn(models.byFeature, feature) ? models.byFeature[feature] : models.default;
    if (Object.hasOwn(models.rates, model)) return models.rates[model];
  }
  return account?.rates;
}

/** Credits for a job at the rates of the model it runs on, or null when the account gives none. */
export function creditsFor(job: CreditJob, account: Pick<MentorAccount, 'rates' | 'models'> | null): number | null {
  const rates = ratesFor(account, job.feature);
  if (!rates) return null;
  return (job.inputTokens * rates.inputPerM + job.outputTokens * rates.outputPerM) / 1e6;
}

/** "About" a number: whole credits, two significant figures from 100 (1,234 → 1,200), never 0. */
export function roundCredits(n: number): number {
  if (n <= 1) return 1;
  if (n < 100) return Math.ceil(n);
  const step = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.ceil(n / step) * step;
}

// ── Per feature (the shapes of their prompts, k-0519) ─────────────────────

/** Translate: the system prompt and glossary pins per request, the texts in, about as much back (+ JSON keys, + thinking). */
export function translateJob(sources: readonly string[], requests: number): CreditJob {
  const text = sources.reduce((n, s) => n + textTokens(s), 0);
  return { inputTokens: requests * 1800 + Math.ceil(text * 1.2), outputTokens: Math.ceil(text * 1.6) + requests * 300, feature: 'translate' };
}

/** Import check: the paper's text against the source's, one finding list back. */
export function importCheckJob(questions: number, paperText: string, images = 0): CreditJob {
  return {
    inputTokens: 2500 + Math.ceil(textTokens(paperText) * 2.2) + images * IMAGE_TOKENS,
    outputTokens: 600 + 250 * questions + 1500,
    feature: 'importCheck',
  };
}

/** Quality check (`quality`) and answer drafts (`answers`): the questions in; a few hundred tokens a question back. */
export function questionsJob(questions: number, text: string, outPerQuestion: number, feature: 'quality' | 'answers'): CreditJob {
  return { inputTokens: 2000 + Math.ceil(textTokens(text) * 1.1), outputTokens: 1000 + outPerQuestion * questions + 1500, feature };
}

/**
 * Wording enhancement (k-0549, `polish`): the questions' texts (stem, statements, options) in
 * chunks of up to 5, each request led by the HKDSE style block and the task's rules; back, the
 * texts that change (often most of them, in every language the question has), a reason each,
 * and the model's thinking.
 */
export const POLISH_CHUNK = 5;
export function polishJob(questions: number, text: string): CreditJob {
  const requests = Math.max(1, Math.ceil(questions / POLISH_CHUNK));
  const tokens = textTokens(text);
  return {
    inputTokens: requests * (STYLE_BLOCK_TOKENS + 900) + Math.ceil(tokens * 1.3),
    outputTokens: requests * 900 + Math.ceil(tokens * 1.2) + 120 * questions,
    feature: 'polish',
  };
}

/**
 * Question studio: per question, writing (both languages), solving and checking, a diagram
 * where asked, and the reference pictures. From the k-0517 proposal's measured shape:
 * 10 MC with diagrams ≈ 52k in / 37k out. Priced as `studio.write`, the bulk of it (its solve,
 * diagram and pick calls run on the same model today).
 */
/**
 * The HKDSE house-style block in every studio write call's system prompt (k-0548,
 * `dseStyle/profile.ts`, ≈ 1,550 tokens; `dseStyle/check.test.ts` keeps this at or above it).
 * One write call writes the whole request.
 */
export const STYLE_BLOCK_TOKENS = 1600;

export function studioJob(opts: { questions: number; sides: number; diagrams?: number; images?: number }): CreditJob {
  const sides = Math.max(1, opts.sides);
  return {
    inputTokens: 3000 + STYLE_BLOCK_TOKENS + opts.questions * (3400 + 600 * sides) + (opts.diagrams ?? 0) * 2000 + (opts.images ?? 0) * IMAGE_TOKENS,
    outputTokens: 2000 + opts.questions * (1500 + 1100 * sides) + (opts.diagrams ?? 0) * 1000,
    feature: 'studio.write',
  };
}

// ── Buying credits (CONTRACT v1.4, u-1zca): any whole HK$ amount ─────────────────────────

/** The fee figures a credits payment is worked out from (`/ai/credits` → `buy`, `extraPct`, `rates`). */
export interface PaymentTerms {
  stripeFee: { pct: number; fixedHkd: number };
  extraPct: number;
  creditsPerHkd: number;
}

/**
 * Credits a payment of `hkd` gives: Mentor's own formula (CONTRACT §2, `creditsForPayment` in
 * Mentor's `src/lib/ai-credits-config.ts`), so the preview is the number the server grants.
 * Stripe's fee comes off, the rest is Google cost + `extraPct`% of it, rounded down to 10 credits
 * (`1e-9`: float noise never loses 10 credits).
 */
export function creditsForPayment(hkd: number, terms: PaymentTerms): number {
  if (!Number.isFinite(hkd) || hkd <= 0) return 0;
  const net = hkd - (hkd * (terms.stripeFee.pct / 100) + terms.stripeFee.fixedHkd);
  const googleHkd = net / (1 + terms.extraPct / 100);
  return Math.max(0, Math.floor((googleHkd * terms.creditsPerHkd) / 10 + 1e-9) * 10);
}

/** About how many studio questions `credits` make (a 10-question worksheet ≈ `studioWorksheet`), down to 5 from 10 up (Mentor's `studioQuestions`). */
export function studioQuestions(credits: number, studioWorksheet: number): number {
  if (!(studioWorksheet > 0)) return 0;
  const q = Math.max(0, Math.floor(credits / (studioWorksheet / 10)));
  return q >= 10 ? Math.floor(q / 5) * 5 : q;
}

/** A typed amount: a whole number of HK$ from `min` to `max`, else null (Mentor's `cleanBuyHkd`). */
export function cleanBuyHkd(text: string, range: { minHkd: number; maxHkd: number }): number | null {
  if (!/^\s*\d+\s*$/.test(text)) return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= range.minHkd && n <= range.maxHkd ? n : null;
}
