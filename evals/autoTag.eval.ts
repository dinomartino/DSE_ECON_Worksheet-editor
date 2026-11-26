import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { clearDialectCache, createClient } from '@/ai/client';
import { MENTOR_MODEL, PRESETS, presetFor } from '@/ai/providers';
import type { AiClient, AiFeature, ProviderConfig } from '@/ai/types';
import { runTagging, tagQuestionOf, type TagQuestion } from '@/autoTag';
import { migrate } from '@/model/migrations';
import { mcqTopic } from '@/model/topicSchemes';
import { viewSectionOf } from '@/model/mcqView';
import type { Worksheet } from '@/model/types';

/**
 * AI tagging's hit rate (k-0560; k-0569: against the exact MCQ topic): past-paper questions
 * whose topic the bank already knows, sent with their tags hidden (the request carries the
 * words only), the AI's main topic compared with the bank topic file(s) each question sits
 * in. Those files are the teacher's MCQ topics, so the gold is exact: `@mcq:<topic id>`.
 * EVAL_ARM=prompt drops the client's `decide`, so a Mentor-credits run goes through the
 * prompt (the Gemini light model) instead of Jev. Through Mentor, so the model is the one Mentor routes `tag` to;
 * EVAL_FEATURE sends the calls under another feature name to reach the main model instead
 * (a Mentor dev with HOSTED_AI_LIGHT_FEATURES=translate,test,tag routes `tag` to Flash-Lite
 * and, say, `coverage` to the main model).
 *
 *   EVAL_MENTOR_API=http://localhost:3124/api/app/v1 EVAL_MENTOR_TOKEN=… PASTPAPER_BANK=<clone>
 *   EVAL_COUNT=100 EVAL_FEATURE=tag EVAL_OUT=Outbox/k-0560/eval-light
 *   (or EVAL_PAPERS=DSE2024/P1,DSE2023/P1 for whole papers instead of EVAL_COUNT's spread)
 *   npx vitest run --config vitest.eval.config.ts evals/autoTag.eval.ts
 *
 * Real calls cost credits (about 3 per 10 questions on Flash-Lite, 15 on the main model).
 */

const BANK = process.env.PASTPAPER_BANK;
const COUNT = Number(process.env.EVAL_COUNT ?? 100);
const SEED = Number(process.env.EVAL_SEED ?? 560);
const FEATURE = (process.env.EVAL_FEATURE ?? 'tag') as AiFeature;
/** Whole papers instead of a spread (u-sqrx's blind test): `DSE2024/P1,DSE2023/P1`, every question of each, in paper order. */
const PAPERS = (process.env.EVAL_PAPERS ?? '').split(',').map((p) => p.trim()).filter(Boolean);
/** `jev` (default on Mentor credits) or `prompt`. */
const ARM = process.env.EVAL_ARM === 'prompt' ? 'prompt' : 'jev';

interface Gold {
  q: TagQuestion;
  source: string;
  gold: string[];
  file: string;
}

/** A small deterministic shuffle (mulberry32), so every run sends the same questions. */
function shuffled<T>(items: T[], seed: number): T[] {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function sample(): Gold[] {
  return PAPERS.length > 0 ? wholePapers() : spread();
}

/** Every topic file's questions with their tags (a question filed under two topics appears in both). */
function bankQuestions(): Gold[][] {
  const manifest = JSON.parse(readFileSync(path.join(BANK!, 'manifest.json'), 'utf8')) as { topics: Array<{ id: string; file: string }> };
  const perFile: Gold[][] = [];
  for (const topic of manifest.topics) {
    const file = topic.file.startsWith('topics/') ? topic.file : path.join('topics', topic.file);
    const raw = JSON.parse(readFileSync(path.join(BANK!, file), 'utf8'));
    const worksheet: Worksheet = migrate(raw);
    const golds: Gold[] = [];
    // The topic file is one MCQ topic: every question in it is gold for exactly that topic.
    if (!mcqTopic(topic.id)) continue;
    const gold = [`@mcq:${topic.id}`];
    for (const question of worksheet.questions) {
      const tags = (question.tags ?? []).filter((t): t is string => typeof t === 'string');
      const source = tags.find((t) => /\//.test(t)) ?? question.id;
      // The tags never reach the request: the payload is built from the printed words only.
      const q = tagQuestionOf(worksheet, question.id, question.id, 'q', undefined);
      if (q) golds.push({ q, source, gold, file });
    }
    perFile.push(golds);
  }
  return perFile;
}

/** The named papers whole: one row a question, its real tags the union over every topic file it sits in. */
function wholePapers(): Gold[] {
  const bySource = new Map<string, Gold>();
  for (const g of bankQuestions().flat()) {
    if (!PAPERS.some((p) => g.source.startsWith(`${p}/Q`))) continue;
    const seen = bySource.get(g.source);
    if (seen) seen.gold = [...new Set([...seen.gold, ...g.gold])];
    else bySource.set(g.source, { ...g, gold: [...g.gold] });
  }
  const order = (source: string) => {
    const [, paper, n] = /^(.*)\/Q(\d+)$/.exec(source) ?? [];
    return [PAPERS.indexOf(paper ?? ''), Number(n)];
  };
  const out = [...bySource.values()].sort((a, b) => {
    const [pa, na] = order(a.source);
    const [pb, nb] = order(b.source);
    return pa - pb || na - nb;
  });
  return out.map((g, i) => ({ ...g, q: { ...g.q, key: `q${i + 1}` } }));
}

/** Round-robin over the topic files after a shuffle each: a spread over the syllabus. */
function spread(): Gold[] {
  const perFile = bankQuestions().map((golds, i) => shuffled(golds, SEED + i));
  const out: Gold[] = [];
  for (let round = 0; out.length < COUNT && perFile.some((f) => f.length > round); round++) {
    for (const file of shuffled(perFile, SEED + round)) {
      if (out.length >= COUNT) break;
      if (file[round]) out.push(file[round]);
    }
  }
  return out.map((g, i) => ({ ...g, q: { ...g.q, key: `q${i + 1}` } }));
}

const partOf = (code: string) => viewSectionOf(code) ?? code;

/** The calls, under EVAL_FEATURE, with what Mentor charged. */
function counting(client: AiClient) {
  const calls: Array<{ model: string; input?: number; output?: number; thinking?: number; charged?: number; ms: number }> = [];
  const wrapped: AiClient = {
    ...client,
    complete: async (request) => {
      const result = await client.complete({ ...request, feature: FEATURE });
      calls.push({ model: result.model, input: result.usage?.input, output: result.usage?.output, thinking: result.usage?.thinking, charged: result.charged, ms: result.ms });
      return result;
    },
    ...(client.decide
      ? {
          decide: async (request) => {
            const result = await client.decide!(request);
            if (result) calls.push({ model: `${result.model}${result.fallback ? ' (fallback)' : ''}`, input: result.usage?.input, output: result.usage?.output, charged: result.charged, ms: result.ms });
            return result;
          },
        }
      : {}),
  };
  return { client: wrapped, calls };
}

describe.skipIf(!process.env.EVAL_MENTOR_TOKEN || !BANK)('AI tagging hit rate, live (k-0560)', () => {
  it('tags past-paper questions with their tags hidden', async () => {
    clearDialectCache();
    const config: ProviderConfig = {
      provider: 'mentor',
      apiKey: process.env.EVAL_MENTOR_TOKEN ?? '',
      model: MENTOR_MODEL,
      baseUrl: process.env.EVAL_MENTOR_API ? `${process.env.EVAL_MENTOR_API.replace(/\/+$/, '').replace(/\/ai$/, '')}/ai` : PRESETS.mentor.baseUrl,
    };
    const preset = presetFor(config.provider);
    const base = createClient(config);
    if (ARM === 'prompt') delete (base as { decide?: unknown }).decide;
    const { client, calls } = counting(base);
    const golds = sample();
    const started = Date.now();
    const outcome = await runTagging(
      golds.map((g) => g.q),
      { client, preset },
      { whyLanguage: (process.env.EVAL_WHY as 'en' | 'zh') ?? 'en', signal: new AbortController().signal },
    );
    const byRoot = new Map(outcome.suggestions.map((s) => [s.rootId, s]));
    const rows = golds.map((g) => {
      const s = byRoot.get(g.q.rootId);
      const main = s?.topics[0];
      const goldFine = g.gold;
      const goldParts = [...new Set(g.gold.map(partOf))];
      return {
        source: g.source,
        file: g.file,
        gold: g.gold,
        topics: s?.topics ?? [],
        conf: s?.conf,
        why: s?.why,
        partHit: main ? goldParts.includes(partOf(main)) : false,
        fineGold: goldFine.length > 0,
        mainHit: main ? goldFine.includes(main) : false,
        anyHit: (s?.topics ?? []).some((c) => goldFine.includes(c)),
      };
    });
    const n = rows.length;
    const fine = rows.filter((r) => r.fineGold);
    const pct = (k: number, of: number) => (of ? Math.round((1000 * k) / of) / 10 : 0);
    const byConf = (['high', 'medium', 'low'] as const).map((conf) => {
      const these = fine.filter((r) => r.conf === conf);
      return { conf, n: these.length, mainHit: pct(these.filter((r) => r.mainHit).length, these.length) };
    });
    // The relay answers with the editor's model name; the model Mentor ran is its routing for the feature.
    const account = (await fetch(config.baseUrl.replace(/\/ai$/, '/ai/credits'), { headers: { Authorization: `Bearer ${config.apiKey}` } }).then((r) => r.json())) as {
      models?: { default: string; byFeature: Record<string, string> };
    };
    const summary = {
      arm: ARM,
      gold: 'exact MCQ topic (bank topic file)',
      feature: FEATURE,
      model: account.models ? (account.models.byFeature[FEATURE] ?? account.models.default) : 'unknown',
      questions: n,
      answered: outcome.suggestions.length,
      failed: outcome.failed.length,
      partHit: pct(rows.filter((r) => r.partHit).length, n),
      fineQuestions: fine.length,
      mainHit: pct(fine.filter((r) => r.mainHit).length, fine.length),
      anyHit: pct(fine.filter((r) => r.anyHit).length, fine.length),
      byConf,
      calls: calls.length,
      credits: Math.round(calls.reduce((s, c) => s + (c.charged ?? 0), 0) * 100) / 100,
      inputTokens: calls.reduce((s, c) => s + (c.input ?? 0), 0),
      outputTokens: calls.reduce((s, c) => s + (c.output ?? 0), 0),
      thinkingTokens: calls.reduce((s, c) => s + (c.thinking ?? 0), 0),
      seconds: Math.round((Date.now() - started) / 1000),
    };
    const out = process.env.EVAL_OUT;
    if (out) {
      mkdirSync(out, { recursive: true });
      writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
      writeFileSync(path.join(out, 'rows.json'), JSON.stringify(rows, null, 2));
      writeFileSync(path.join(out, 'calls.json'), JSON.stringify(calls, null, 2));
    }
    console.log(JSON.stringify(summary, null, 2));
    expect(outcome.fatal).toBeUndefined();
  }, 900_000);
});
