import type { MentorAccount } from './mentor';

/**
 * "Uses about N credits" before a run on the DSEcon Mentor account (k-0519, E4). An estimate,
 * not a quote: tokens are guessed from the text (a 中文 character ≈ 1 token, other text ≈ 4
 * characters a token), thinking is counted as output (Gemini bills it so), and the rates are
 * the account's (`/ai/credits` → `rates`, credits per million tokens). The server keeps the
 * real cost from Gemini's own counts.
 */

export interface CreditJob {
  inputTokens: number;
  outputTokens: number;
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

export const addJobs = (...jobs: CreditJob[]): CreditJob =>
  jobs.reduce((a, b) => ({ inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens }), { inputTokens: 0, outputTokens: 0 });

/** US$ for a job at Google's list price (the proposal's sums and the tests). */
export function usdFor(job: CreditJob, price: { inputUsdPerM: number; outputUsdPerM: number } = HYDROGEN_PRICE): number {
  return (job.inputTokens * price.inputUsdPerM + job.outputTokens * price.outputUsdPerM) / 1e6;
}

/** Credits for a job at the account's rates, or null when the account gives none. */
export function creditsFor(job: CreditJob, account: Pick<MentorAccount, 'rates'> | null): number | null {
  const rates = account?.rates;
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
  return { inputTokens: requests * 1800 + Math.ceil(text * 1.2), outputTokens: Math.ceil(text * 1.6) + requests * 300 };
}

/** Import check: the paper's text against the source's, one finding list back. */
export function importCheckJob(questions: number, paperText: string, images = 0): CreditJob {
  return {
    inputTokens: 2500 + Math.ceil(textTokens(paperText) * 2.2) + images * IMAGE_TOKENS,
    outputTokens: 600 + 250 * questions + 1500,
  };
}

/** Quality check and answer drafts: the questions in; a few hundred tokens a question back. */
export function questionsJob(questions: number, text: string, outPerQuestion: number): CreditJob {
  return { inputTokens: 2000 + Math.ceil(textTokens(text) * 1.1), outputTokens: 1000 + outPerQuestion * questions + 1500 };
}

/**
 * Question studio: per question, writing (both languages), solving and checking, a diagram
 * where asked, and the reference pictures. From the k-0517 proposal's measured shape:
 * 10 MC with diagrams ≈ 52k in / 37k out.
 */
export function studioJob(opts: { questions: number; sides: number; diagrams?: number; images?: number }): CreditJob {
  const sides = Math.max(1, opts.sides);
  return {
    inputTokens: 3000 + opts.questions * (3400 + 600 * sides) + (opts.diagrams ?? 0) * 2000 + (opts.images ?? 0) * IMAGE_TOKENS,
    outputTokens: 2000 + opts.questions * (1500 + 1100 * sides) + (opts.diagrams ?? 0) * 1000,
  };
}
