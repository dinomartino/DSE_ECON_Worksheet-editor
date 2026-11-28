import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';
import { clearDialectCache, createClient } from '@/ai/client';
import { MENTOR_MODEL, PRESETS, presetFor } from '@/ai/providers';
import type { AiClient, ProviderConfig } from '@/ai/types';
import { evaluateReply, generateDiagram } from '@/diagramGen/run';
import { diagramSvg } from '@/render/diagram';
import { GRAPH_CASES } from './graphs/cases';

/**
 * The studio's diagram step on the frozen graph set (k-0577), live against Mentor: the same
 * `generateDiagram` call the studio makes for a draft (question in English, key, the writer's
 * note, the MCQ for the key check, paper EN + 中文). Writes per case the spec, the checks, the
 * credits charged and the figure as SVG in English and 中文, then `summary.json`.
 *
 *   EVAL_MENTOR_API=http://localhost:3124/api/app/v1 EVAL_MENTOR_TOKEN=… EVAL_OUT=Outbox/k-0577/before
 *   EVAL_ONLY=e-tax-dwl,e-quota (or EVAL_ALL=1 for the whole set, ~1,000 credits) npx vitest run --config vitest.eval.config.ts evals/graphs.eval.ts
 *
 * Each case is one or two requests (a repair turn when the first reply fails a check).
 */

import { inputOf, printedLabels } from './graphs/shared';

export { inputOf, printedLabels };

const norm = (s: string) => s.replace(/[\s_{}]/g, '').replace(/[₀-₉]/g, (ch) => String(ch.charCodeAt(0) - 0x2080)).replace(/\*/g, '*').toUpperCase();

// The whole set costs ~1,000 credits: it runs only when asked for by name (EVAL_ONLY) or in full (EVAL_ALL=1), k-0601.
const asked = Boolean(process.env.EVAL_ONLY?.trim()) || process.env.EVAL_ALL === '1';

describe.skipIf(!process.env.EVAL_MENTOR_TOKEN || !asked)('graph set, live (k-0577)', () => {
  it('draws every case', async () => {
    clearDialectCache();
    const config: ProviderConfig = {
      provider: 'mentor',
      apiKey: process.env.EVAL_MENTOR_TOKEN ?? '',
      model: MENTOR_MODEL,
      baseUrl: process.env.EVAL_MENTOR_API ? `${process.env.EVAL_MENTOR_API.replace(/\/+$/, '').replace(/\/ai$/, '')}/ai` : PRESETS.mentor.baseUrl,
    };
    const preset = presetFor(config.provider);
    const base = createClient(config);
    const out = path.resolve(process.env.EVAL_OUT ?? '/tmp/k0577-graphs');
    mkdirSync(path.join(out, 'svg'), { recursive: true });
    const only = (process.env.EVAL_ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const cases = GRAPH_CASES.filter((c) => !only.length || only.includes(c.id));
    const rows: unknown[] = [];
    let total = 0;
    // k-0584 (the independent review): each case run EVAL_REPEAT times, and the first reply's issues saved when a repair ran.
    const repeat = Math.max(1, Number(process.env.EVAL_REPEAT ?? 1) || 1);
    for (const c of cases.flatMap((k) => Array.from({ length: repeat }, (_, r) => ({ ...k, run: r + 1 })))) {
      let charged = 0;
      let calls = 0;
      const replies: string[] = [];
      const tokens = { input: 0, output: 0, thinking: 0, cached: 0 };
      const client: AiClient = {
        listModels: (s) => base.listModels(s),
        complete: async (req) => {
          const res = await base.complete(req);
          replies.push(res.text);
          calls += 1;
          charged += res.charged ?? 0;
          tokens.input += res.usage?.input ?? 0;
          tokens.output += res.usage?.output ?? 0;
          tokens.thinking += res.usage?.thinking ?? 0;
          tokens.cached += res.usage?.cached ?? 0;
          return res;
        },
      };
      const started = Date.now();
      const outcome = await generateDiagram(inputOf(c), { client, preset }, new AbortController().signal);
      total += charged;
      const id = repeat > 1 ? `${c.id}-r${c.run}` : c.id;
      const row: Record<string, unknown> = { id, type: c.type, family: c.family, charged: Math.round(charged * 100) / 100, calls, tokens, ms: Date.now() - started };
      if (calls > 1 && replies[0]) {
        const first = evaluateReply(replies[0], inputOf(c));
        row.firstIssues = first ? first.issues.filter((i) => i.level === 'error').map((i) => `${i.code}: ${i.text}`) : ['(first reply was not a spec)'];
        if (first) row.firstKind = first.spec.kind;
      }
      if (!outcome.ok) {
        row.status = 'error';
        row.error = outcome.error;
      } else {
        row.status = outcome.status;
        row.attempt = outcome.attempt;
        row.issues = outcome.issues.map((i) => `${i.level} ${i.code}: ${i.text}`);
        row.solved = outcome.solved;
        row.kind = outcome.spec.kind;
        row.template = outcome.spec.template;
        writeFileSync(path.join(out, `${id}.spec.json`), JSON.stringify(outcome.spec, null, 2));
        if (outcome.block) {
          const printed = printedLabels(outcome.block.diagram);
          const have = new Set(printed.map(norm));
          row.missingLabels = c.labels.filter((l) => !have.has(norm(l)));
          for (const language of ['en', 'zh'] as const) {
            const svg = diagramSvg(outcome.block.diagram, { widthPx: outcome.block.widthPx, heightPx: outcome.block.heightPx, language, scale: 2, answers: 'show' });
            writeFileSync(path.join(out, 'svg', `${id}.${language}.svg`), svg);
          }
          writeFileSync(path.join(out, `${id}.block.json`), JSON.stringify(outcome.block, null, 2));
        }
      }
      rows.push(row);
      console.log(JSON.stringify(row));
      // Saved after every case, so a crash later in the run keeps what was paid for.
      writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ at: new Date().toISOString(), total: Math.round(total * 100) / 100, rows }, null, 2));
    }
    writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ at: new Date().toISOString(), total: Math.round(total * 100) / 100, rows }, null, 2));
    console.log(`TOTAL credits ${total.toFixed(2)}`);
  });
});
