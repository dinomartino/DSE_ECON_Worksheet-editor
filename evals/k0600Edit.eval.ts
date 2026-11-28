import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';
import { clearDialectCache, createClient } from '@/ai/client';
import { MENTOR_MODEL, PRESETS, presetFor } from '@/ai/providers';
import type { AiClient, ProviderConfig } from '@/ai/types';
import fixture from '@/diagramGen/k0600Fixture.json';
import { generateDiagram } from '@/diagramGen/run';
import type { DiagramSpec } from '@/diagramGen/types';
import { diagramSvg } from '@/render/diagram';
import { printedLabels } from './graphs/shared';

/**
 * k-0600 follow-up, live: the studio review's third message, "help me regen the graph with the
 * label", as the studio sends it (the draft's stored plan + the teacher's words → one diagram-edit
 * request, a repair when it fails). Writes the outcome, credits and the figure as SVG.
 *
 *   EVAL_MENTOR_API=http://localhost:3124/api/app/v1 EVAL_MENTOR_TOKEN=… EVAL_OUT=Outbox/k-0600/edit
 *   npx vitest run --config vitest.eval.config.ts evals/k0600Edit.eval.ts
 */

describe.skipIf(!process.env.EVAL_MENTOR_TOKEN)('k-0600 "regen the graph with the label", live', () => {
  it('edits the stored figure', async () => {
    clearDialectCache();
    const config: ProviderConfig = {
      provider: 'mentor',
      apiKey: process.env.EVAL_MENTOR_TOKEN ?? '',
      model: MENTOR_MODEL,
      baseUrl: process.env.EVAL_MENTOR_API ? `${process.env.EVAL_MENTOR_API.replace(/\/+$/, '').replace(/\/ai$/, '')}/ai` : PRESETS.mentor.baseUrl,
    };
    const base = createClient(config);
    let charged = 0;
    const replies: string[] = [];
    const client: AiClient = {
      listModels: (s) => base.listModels(s),
      complete: async (req) => {
        // A hard stop (k-0601): no call that could take the run past EVAL_CAP_CREDITS (a diagram call is ≤ ~40).
        const cap = Number(process.env.EVAL_CAP_CREDITS ?? Infinity);
        if (charged + 40 > cap) throw new Error(`cap: ${charged.toFixed(2)} credits charged, the next call could pass ${cap}`);
        const res = await base.complete(req);
        replies.push(res.text);
        charged += res.charged ?? 0;
        return res;
      },
    };
    const { mcq } = fixture;
    const question = [mcq.stem, ...mcq.statements.map((t, i) => `(${i + 1}) ${t}`), ...mcq.options.map((o, i) => `${'ABCD'[i]}. ${o}`)].join('\n');
    const key = `Correct answer: B. ${mcq.options[1]}\n${fixture.key}`;
    const outcome = await generateDiagram(
      { question, key, sides: ['en'], mcq: { ...mcq, statements: [...mcq.statements], options: [...mcq.options] }, edit: { spec: fixture.spec as unknown as DiagramSpec, note: 'help me regen the graph with the label' } },
      { client, preset: presetFor('mentor') },
      new AbortController().signal,
    );
    const out = path.resolve(process.env.EVAL_OUT ?? '/tmp/k0600-edit');
    mkdirSync(out, { recursive: true });
    const row: Record<string, unknown> = { charged: Math.round(charged * 100) / 100, calls: replies.length };
    if (outcome.ok) {
      Object.assign(row, { status: outcome.status, attempt: outcome.attempt, questionChange: outcome.questionChange, issues: outcome.issues.map((i) => `${i.level} ${i.code}: ${i.text}`) });
      writeFileSync(path.join(out, 'spec.json'), JSON.stringify(outcome.spec, null, 2));
      if (outcome.block) {
        row.labels = printedLabels(outcome.block.diagram);
        writeFileSync(path.join(out, 'figure.en.svg'), diagramSvg(outcome.block.diagram, { widthPx: outcome.block.widthPx, heightPx: outcome.block.heightPx, language: 'en', scale: 2 }));
      }
    } else row.error = outcome.error;
    writeFileSync(path.join(out, 'replies.json'), JSON.stringify(replies, null, 2));
    writeFileSync(path.join(out, 'summary.json'), JSON.stringify(row, null, 2));
  }, 300_000);
});
