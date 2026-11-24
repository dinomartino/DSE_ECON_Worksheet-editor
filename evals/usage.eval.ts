import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { clearDialectCache, createClient } from '@/ai/client';
import { fakeMentor } from '@/ai/fakeMentor';
import { MENTOR_MODEL, PRESETS, presetFor } from '@/ai/providers';
import type { AiClient, ProviderConfig } from '@/ai/types';
import { clearUsageLog, usageByJob, usageLog, type UsageRecord } from '@/ai/usage';
import { loadGlossary } from '@/glossary/load';
import { pickKeyPoints } from '@/questionStudio/pick';
import { EMPTY_CORPUS } from '@/questionStudio/nearCopy';
import { writeDrafts } from '@/questionStudio/run';
import { briefById, requestOfBrief } from '@/questionStudio/trialBriefs';
import { translateOne } from '@/translate/run';

/**
 * What real AI jobs cost (k-0537, report `Outbox/k-0536/REPORT.md`): ten scripted studio
 * worksheets (five with diagrams, English, 中文 and both), each preceded by the chat's key-point
 * pick, then a few one-field translations (the bank-fill pattern), through the real client, prompts
 * and checks. Every call lands in the usage log (`src/ai/usage.ts`); the report sums it per job
 * and per feature into EVAL_REPORT_DIR/usage/.
 *
 *   EVAL_USAGE=mentor EVAL_MENTOR_API=http://localhost:3124/api/app/v1 EVAL_MENTOR_TOKEN=dsm_… npm run eval:usage
 *   EVAL_USAGE=gemini EVAL_GEMINI_KEY=… [EVAL_GEMINI_MODEL=gemini-4-hydrogen] npm run eval:usage
 *   EVAL_USAGE=fake npm run eval:usage     (the harness itself, against the fake relay; no network)
 *
 * EVAL_MENTOR_API is the app API root (`…/api/app/v1`); the relay is its `/ai` (as `MENTOR_API` in `src/ai/providers.ts`).
 *
 * Real calls cost real money: about 15–25 HK$ of Gemini for the whole set.
 */

const MODE = process.env.EVAL_USAGE as 'mentor' | 'gemini' | 'fake' | undefined;

/** Brief id → diagrams on. Counts are the briefs' own (3 or 5); the report scales to 10 questions. */
const WORKSHEETS: ReadonlyArray<[string, boolean]> = [
  ['B07', true], ['B11', false], ['B22', true], ['B30', false], ['B01', true],
  ['B02', false], ['B08', true], ['B13', false], ['B17', true], ['B23', false],
];
const TRANSLATIONS = 4;

function setUp(): { client: () => AiClient; config: ProviderConfig } {
  if (MODE === 'mentor') {
    const config: ProviderConfig = { provider: 'mentor', apiKey: process.env.EVAL_MENTOR_TOKEN ?? '', model: MENTOR_MODEL, baseUrl: process.env.EVAL_MENTOR_API ? `${process.env.EVAL_MENTOR_API.replace(/\/+$/, '').replace(/\/ai$/, '')}/ai` : PRESETS.mentor.baseUrl };
    return { config, client: () => createClient(config) };
  }
  if (MODE === 'gemini') {
    const config: ProviderConfig = { provider: 'gemini', apiKey: process.env.EVAL_GEMINI_KEY ?? '', model: process.env.EVAL_GEMINI_MODEL ?? 'gemini-4-hydrogen', baseUrl: '' };
    return { config, client: () => createClient(config) };
  }
  const server = fakeMentor({ credits: 1e6 });
  const config: ProviderConfig = { provider: 'mentor', apiKey: server.token, model: MENTOR_MODEL, baseUrl: PRESETS.mentor.baseUrl };
  return { config, client: () => createClient(config, server.deps) };
}

interface FeatureRow { feature: string; calls: number; input: number; cached: number; output: number; thinking: number; credits: number }

function byFeature(log: readonly UsageRecord[]): FeatureRow[] {
  const rows = new Map<string, FeatureRow>();
  for (const r of log) {
    const row = rows.get(r.feature) ?? { feature: r.feature, calls: 0, input: 0, cached: 0, output: 0, thinking: 0, credits: 0 };
    row.calls += 1;
    row.input += r.input;
    row.cached += r.cached;
    row.output += r.output;
    row.thinking += r.thinking;
    row.credits += r.credits ?? 0;
    rows.set(r.feature, row);
  }
  return [...rows.values()];
}

const n = (x: number) => Math.round(x).toLocaleString('en');
const c = (x: number) => x.toFixed(1);

describe.skipIf(!MODE)('AI usage per job (k-0537)', () => {
  it('runs the scripted jobs and writes the usage report', async () => {
    clearDialectCache();
    clearUsageLog();
    const { client, config } = setUp();
    const preset = presetFor(config.provider);
    const glossary = await loadGlossary();
    const worksheets: Array<{ brief: string; count: number; sides: string; diagrams: boolean; ok: boolean; drafts: number; figures: number; job: string; error?: string }> = [];

    for (const [id, diagrams] of WORKSHEETS) {
      const brief = briefById(id);
      if (!brief) throw new Error(`no brief ${id}`);
      const request = requestOfBrief(brief);
      // One client per worksheet, as the studio makes one per run: pick + write + solve + diagrams = one job.
      const c1 = client();
      const signal = new AbortController().signal;
      const picked = await pickKeyPoints({ text: `${brief.count} questions on ${brief.keyPoint}${brief.note ? `. ${brief.note}` : ''}`, examples: request.examples }, { client: c1, preset }, signal);
      const out = await writeDrafts(request, { client: c1, preset, glossary, corpus: EMPTY_CORPUS, diagrams }, { signal });
      const job = usageLog().at(-1)?.job ?? '';
      worksheets.push({
        brief: id, count: brief.count, sides: request.sides.join('+'), diagrams, job,
        ok: out.ok, drafts: out.ok ? out.drafts.length : 0,
        figures: out.ok ? out.drafts.filter((d) => d.diagram?.block).length : 0,
        ...(out.ok ? {} : { error: out.error.kind }),
        ...(picked.ok ? {} : { error: `pick ${picked.error.kind}` }),
      });
    }

    // The bank-fill pattern: one field per request, the fixed translate instructions each time.
    const tc = client();
    const stems = ['A cafe raises the price of a milk tea from $20 to $25, and the cups sold each day fall from 400 to 300.', 'Which of the following would make the demand for a good more price elastic?', 'A ferry operator lowers its fares by 10% and finds that its total revenue falls.', 'The government imposes a unit tax of $2 on each packet of cigarettes.'];
    for (const stem of stems.slice(0, TRANSLATIONS)) {
      await translateOne({ en: [{ text: stem }], zh: [] }, 'toZh', { kind: 'stem' }, { client: tc, preset, model: config.model, glossary, sleep: async () => {} }, new AbortController().signal);
    }

    const log = usageLog();
    const jobs = usageByJob(log);
    const features = byFeature(log);
    const dir = path.join(process.env.EVAL_REPORT_DIR ?? path.join(tmpdir(), 'econgen-eval'), 'usage');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `usage-${MODE}.json`), JSON.stringify({ mode: MODE, model: config.model, at: new Date().toISOString(), worksheets, jobs, features, log }, null, 2));

    const lines = [
      `# AI usage, ${MODE} (${config.model}), ${new Date().toISOString().slice(0, 16)}`,
      '',
      '| Worksheet | Qs | Sides | Diagrams | Calls | Input | Cached | Output | Thinking | Credits | Credits / 10 Qs |',
      '|---|---|---|---|---|---|---|---|---|---|---|',
      ...worksheets.map((w) => {
        const j = jobs.find((x) => x.job === w.job);
        if (!j) return `| ${w.brief} | ${w.count} | ${w.sides} | ${w.diagrams ? `on (${w.figures})` : 'off'} | – | – | – | – | – | – | ${w.error ?? ''} |`;
        return `| ${w.brief} | ${w.count} | ${w.sides} | ${w.diagrams ? `on (${w.figures} drawn)` : 'off'} | ${j.calls} | ${n(j.input)} | ${n(j.cached)} | ${n(j.output)} | ${n(j.thinking)} | ${c(j.credits ?? 0)}${j.estimated ? ' ≈' : ''} | ${c(((j.credits ?? 0) * 10) / w.count)}${w.error ? ` (${w.error})` : ''} |`;
      }),
      '',
      '| Feature | Calls | Input / call | Cached share | Output / call | Thinking / call | Credits / call | Thinking share of credits |',
      '|---|---|---|---|---|---|---|---|',
      ...features.map((f) => {
        const thinkCredits = (f.thinking * 5850) / 1e6;
        return `| ${f.feature} | ${f.calls} | ${n(f.input / f.calls)} | ${f.input ? Math.round((100 * f.cached) / f.input) : 0}% | ${n(f.output / f.calls)} | ${n(f.thinking / f.calls)} | ${c(f.credits / f.calls)} | ${f.credits ? Math.round((100 * thinkCredits) / f.credits) : 0}% |`;
      }),
    ];
    writeFileSync(path.join(dir, `usage-${MODE}.md`), `${lines.join('\n')}\n`);
    console.log(lines.join('\n'));

    expect(log.length).toBeGreaterThan(WORKSHEETS.length);
    expect(log.every((r) => r.feature !== 'other')).toBe(true);
  });
});
