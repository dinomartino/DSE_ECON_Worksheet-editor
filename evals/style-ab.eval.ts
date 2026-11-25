import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { clearDialectCache, createClient } from '@/ai/client';
import { fakeMentor } from '@/ai/fakeMentor';
import { createMentorRelay } from '@/ai/mentor';
import { MENTOR_MODEL, PRESETS, presetFor } from '@/ai/providers';
import type { AiClient, CompletionRequest, ProviderConfig } from '@/ai/types';
import { clearUsageLog, usageByJob, usageLog } from '@/ai/usage';
import { checkDseStyle, DSE_STYLE_PROFILE, STYLE_FINDING_IDS } from '@/dseStyle';
import { loadGlossary } from '@/glossary/load';
import { EMPTY_CORPUS } from '@/questionStudio/nearCopy';
import { WRITE_TASK_MARKER } from '@/questionStudio/prompt';
import { writeDrafts } from '@/questionStudio/run';
import { TRIAL_EXAMPLES } from '@/questionStudio/trialBriefs';
import type { StudioRequest } from '@/questionStudio/types';

/**
 * The HKDSE style profile, before and after (k-0548 follow-up, report `Outbox/k-0548/AB.md`):
 * the same ten one-question studio requests (the studio's default count), written once with the
 * write prompt as it is (rule 15 + `DSE_STYLE_PROFILE`) and once with the prompt as it was before
 * k-0548 (no rule 15, no profile, rules 4/9/11 in their old words). Same key point, shape, level,
 * languages (both), key position (seeded) and model; no key-point pick, no diagrams. Each run goes
 * through the real write → checks → rewrite → blind solve, and the draft is scored by the studio's
 * own check rows (the HKDSE style row included). The arms alternate, A then B per question.
 *
 *   EVAL_AB=mentor EVAL_MENTOR_API=http://localhost:3124/api/app/v1 EVAL_MENTOR_TOKEN=dsm_… \
 *     [EVAL_AB_FROM=0] [EVAL_AB_TO=10] [EVAL_AB_ARMS=with|without] npx vitest run --config vitest.eval.config.ts evals/style-ab.eval.ts
 *   EVAL_AB=fake …   (the harness itself, no network)
 *
 * Writes EVAL_REPORT_DIR/style-ab/pair-NN.json, one file per question. About 20 credits a pair.
 */

const MODE = process.env.EVAL_AB as 'mentor' | 'fake' | undefined;

const QUESTIONS: ReadonlyArray<Omit<StudioRequest, 'sides' | 'count' | 'examples'> & { example?: keyof typeof TRIAL_EXAMPLES }> = [
  { keyPoint: 'C.ped', points: ['C.ped#arc'], level: 'same', shape: 'plain', note: '' },
  { keyPoint: 'J.trade', points: ['J.trade#advantage'], level: 'same', shape: 'combination', note: '' },
  { keyPoint: 'F.national-income', points: ['F.national-income#gni'], level: 'harder', shape: 'plain', note: '' },
  { keyPoint: 'G.ad', points: ['G.ad#determinants'], level: 'same', shape: 'combination', note: '' },
  { keyPoint: 'I.inflation', points: ['I.inflation#real-interest'], level: 'harder', shape: 'plain', note: '' },
  { keyPoint: 'H.money-supply', points: ['H.money-supply#credit-creation'], level: 'same', shape: 'plain', note: '' },
  { keyPoint: 'C.intervention', points: ['C.intervention#tax-subsidy'], level: 'same', shape: 'plain', note: 'Name the market and the size of the tax or subsidy.', example: 'tax' },
  { keyPoint: 'E.efficiency', points: ['E.efficiency#externalities'], level: 'harder', shape: 'combination', note: '' },
  { keyPoint: 'B.ownership', points: [], level: 'easier', shape: 'any', note: '' },
  { keyPoint: 'C.market-demand', points: [], level: 'easier', shape: 'any', note: 'No calculations. Every option is a full sentence.' },
];

/** The write prompt's words before k-0548 (c4979538), for the arm without the profile. */
const BEFORE: ReadonlyArray<[RegExp, string]> = [
  [/ — in Chinese "只有 \(1\)、\(2\)", "\(1\)、\(2\) 及 \(3\)" \(house style C below\)\./, ' — in Chinese "只有(1)及(2)", "(1)、(2)及(3)".'],
  [/Use Hong Kong contexts where natural; money as "\$" \(HK\$ only beside another currency\)\./, 'Use Hong Kong contexts and HK$ where natural.'],
  [/use it for the negative word of a negative stem \(\*\*NOT\*\*, \*\*LEAST\*\*, \*\*INCORRECT\*\*; 中文 \*\*不\*\*, \*\*最不\*\*, \*\*不正確\*\*\), as HKEAA papers do/, 'use it for **NOT** in a negative stem, as HKEAA papers do'],
  [/\n15\. Write every question in the HKDSE house style below[^\n]*\n/, '\n'],
];

export function withoutProfile(system: string): string {
  let out = system.replace(`\n${DSE_STYLE_PROFILE}\n`, '');
  for (const [from, to] of BEFORE) {
    if (!from.test(out)) throw new Error(`style-ab: the write prompt changed, ${from} no longer matches`);
    out = out.replace(from, to);
  }
  if (out.includes(DSE_STYLE_PROFILE.slice(0, 80))) throw new Error('style-ab: the profile is still in the prompt');
  return out;
}

/** A client whose write requests go out without the profile; everything else untouched. */
function arm(client: AiClient, profile: boolean): AiClient {
  if (profile) return client;
  const strip = (req: CompletionRequest): CompletionRequest => (typeof req.system === 'string' && req.system.startsWith(WRITE_TASK_MARKER) ? { ...req, system: withoutProfile(req.system) } : req);
  return {
    ...client,
    complete: (req) => client.complete(strip(req)),
    ...(client.stream ? { stream: (req: CompletionRequest, onText: (t: string) => void) => client.stream!(strip(req), onText) } : {}),
  };
}

/** A seeded random, so both arms put the key at the same option. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function setUp() {
  if (MODE === 'mentor') {
    const config: ProviderConfig = { provider: 'mentor', apiKey: process.env.EVAL_MENTOR_TOKEN ?? '', model: MENTOR_MODEL, baseUrl: `${(process.env.EVAL_MENTOR_API ?? '').replace(/\/+$/, '').replace(/\/ai$/, '')}/ai` };
    return { config, client: () => createClient(config), account: () => createMentorRelay({ relayBase: config.baseUrl }).account(config.apiKey ?? '', new AbortController().signal) };
  }
  const server = fakeMentor({ credits: 1e6 });
  const config: ProviderConfig = { provider: 'mentor', apiKey: server.token, model: MENTOR_MODEL, baseUrl: PRESETS.mentor.baseUrl };
  return { config, client: () => createClient(config, server.deps), account: () => createMentorRelay({ deps: server.deps }).account(server.token, new AbortController().signal) };
}

describe.skipIf(!MODE)('HKDSE style profile, A/B (k-0548)', () => {
  it('writes each question with and without the profile', async () => {
    clearDialectCache();
    const { client, config, account } = setUp();
    const preset = presetFor(config.provider);
    const glossary = await loadGlossary();
    const dir = path.join(process.env.EVAL_REPORT_DIR ?? path.join(tmpdir(), 'econgen-eval'), 'style-ab');
    mkdirSync(dir, { recursive: true });
    const from = Number(process.env.EVAL_AB_FROM ?? 0);
    const to = Number(process.env.EVAL_AB_TO ?? QUESTIONS.length);
    const before = (await account()).credits;
    console.log(`balance before: ${before}`);

    for (let i = from; i < to; i++) {
      const q = QUESTIONS[i];
      const request: StudioRequest = { keyPoint: q.keyPoint, points: q.points, level: q.level, shape: q.shape, note: q.note, count: 1, sides: ['en', 'zh'], examples: q.example ? [TRIAL_EXAMPLES[q.example]] : [] };
      const pair: Record<string, unknown> = { index: i, request: { ...request, examples: q.example ?? null } };
      // EVAL_AB_ARMS=with (or without) runs one arm only, e.g. a profile change against an earlier run.
      const arms = process.env.EVAL_AB_ARMS === 'with' ? [true] : process.env.EVAL_AB_ARMS === 'without' ? [false] : [true, false];
      for (const profile of arms) {
        clearUsageLog();
        const balance = (await account()).credits;
        const out = await writeDrafts(request, { client: arm(client(), profile), preset, glossary, corpus: EMPTY_CORPUS, random: seeded(1000 + i) }, { signal: new AbortController().signal });
        const log = usageLog();
        const job = usageByJob(log)[0];
        const draft = out.ok ? out.drafts[0] : undefined;
        pair[profile ? 'with' : 'without'] = {
          ok: out.ok,
          ...(out.ok ? {} : { error: out.error.kind }),
          balanceBefore: balance,
          credits: job?.credits ?? 0,
          calls: log.map((r) => ({ feature: r.feature, model: r.model, input: r.input, output: r.output, thinking: r.thinking, credits: r.credits })),
          draft: draft?.draft ?? null,
          attempt: draft?.attempt ?? null,
          checks: draft?.checks ?? [],
          solve: draft?.solve ?? null,
          style: draft ? { en: checkDseStyle(draft.draft, ['en']).map((f) => f.id), zh: checkDseStyle(draft.draft, ['zh']).map((f) => f.id) } : null,
          notes: out.ok ? out.notes : [],
        };
        console.log(`Q${i + 1} ${profile ? 'with' : 'without'}: ${out.ok ? 'ok' : 'failed'} ${(job?.credits ?? 0).toFixed(1)} credits, style ${JSON.stringify((pair[profile ? 'with' : 'without'] as { style: unknown }).style)}`);
      }
      writeFileSync(path.join(dir, `pair-${String(i + 1).padStart(2, '0')}${arms.length === 1 ? `-${arms[0] ? 'with' : 'without'}` : ''}.json`), JSON.stringify(pair, null, 2));
    }
    const after = (await account()).credits;
    console.log(`balance after: ${after} (spent ${(before - after).toFixed(1)})`);
    writeFileSync(path.join(dir, `balance-${from}-${to}.json`), JSON.stringify({ before, after, ids: STYLE_FINDING_IDS }, null, 2));
    expect(after).toBeLessThanOrEqual(before);
  });
});
