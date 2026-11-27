import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { clearDialectCache, createClient } from '@/ai/client';
import { MENTOR_MODEL, PRESETS, presetFor } from '@/ai/providers';
import type { AiClient, ProviderConfig } from '@/ai/types';
import { liveEngine } from '@/components/studio/chat/engine';
import { loadGlossary } from '@/glossary/load';
import { EMPTY_CORPUS } from '@/questionStudio/nearCopy';
import type { SourceQuestion, StudioRequest } from '@/questionStudio/types';
import { PICTURE_MARK } from '@/questionStudio/source';
import { Q22_KEY, Q22_MCQ } from '@/diagramGen/q22.fixture';
import { diagramSvg } from '@/render/diagram';

/**
 * The whole studio on typed topic-E requests (k-0577), live against Mentor: step 1 pick, step 2
 * write (EN + 中文) with the diagram, checks and the blind solve, as the chat runs them. Writes
 * each draft's words, checks, credits and figure (SVG, both languages) to EVAL_OUT.
 *
 *   EVAL_MENTOR_API=… EVAL_MENTOR_TOKEN=… EVAL_OUT=Outbox/k-0577/studio
 *   npx vitest run --config vitest.eval.config.ts evals/graphsStudio.eval.ts
 *
 * EVAL_REFERENCE_PNG=<png of the figure> writes "very close to" HKDSE 2018 Paper 1 Q22 instead (k-0577
 * round 2, u-fbsp): the reference's words carry the "[picture]" marker the studio sends, and the
 * picture is attached, as when a teacher picks the question from the bank.
 */

/** HKDSE 2018 Paper 1 Q22 as the studio reads it from the bank: words with the picture's marker, its key and explanation. */
function q22Reference(png: string): SourceQuestion {
  const [first, ...rest] = Q22_MCQ.stem.split('\n');
  return {
    id: 'DSE2018/P1/Q22',
    label: 'HKDSE 2018 Paper 1 Q22',
    stem: { en: [first, PICTURE_MARK, ...rest].join('\n'), zh: '' },
    statements: [],
    options: Q22_MCQ.options.map((en) => ({ en, zh: '' })),
    answerIndex: Q22_MCQ.answer,
    explanation: { en: Q22_KEY.split('\n').slice(1).join(' '), zh: '' },
    hasFigure: true,
    figures: [{ dataUrl: `data:image/png;base64,${readFileSync(png).toString('base64')}` }],
    figureAt: ['stem'],
  } as SourceQuestion;
}

const REQUESTS = (process.env.EVAL_REQUESTS ?? '').split('|').map((s) => s.trim()).filter(Boolean);
const REFERENCE_PNG = process.env.EVAL_REFERENCE_PNG ?? '';
const DEFAULT = [
  'One MC question on the deadweight loss of a per-unit tax, with a supply-demand diagram whose areas are lettered.',
  'One MC question on a negative externality in production (MPC, MSC), asking which area on the diagram is the deadweight loss.',
];

describe.skipIf(!process.env.EVAL_MENTOR_TOKEN)('studio on topic-E requests, live (k-0577)', () => {
  it('picks, writes, draws and checks', async () => {
    clearDialectCache();
    const config: ProviderConfig = {
      provider: 'mentor',
      apiKey: process.env.EVAL_MENTOR_TOKEN ?? '',
      model: MENTOR_MODEL,
      baseUrl: process.env.EVAL_MENTOR_API ? `${process.env.EVAL_MENTOR_API.replace(/\/+$/, '').replace(/\/ai$/, '')}/ai` : PRESETS.mentor.baseUrl,
    };
    const preset = presetFor(config.provider);
    const base = createClient(config);
    let charged = 0;
    const client: AiClient = {
      listModels: (s) => base.listModels(s),
      complete: async (req) => {
        const res = await base.complete(req);
        charged += res.charged ?? 0;
        return res;
      },
    };
    const glossary = await loadGlossary();
    const deps = { client, preset, glossary, corpus: EMPTY_CORPUS, diagrams: true };
    const out = path.resolve(process.env.EVAL_OUT ?? '/tmp/k0577-studio');
    mkdirSync(path.join(out, 'svg'), { recursive: true });
    const rows: unknown[] = [];
    const signal = new AbortController().signal;
    const texts = REQUESTS.length ? REQUESTS : REFERENCE_PNG ? ['Write one question very close to this one: a unit tax raised from t1 to t2, the deadweight loss.'] : DEFAULT;
    for (const [n, text] of texts.entries()) {
      const before = charged;
      const picked = await liveEngine.pick({ text, examples: [], tagged: {} }, deps, signal);
      expect(picked.ok).toBe(true);
      if (!picked.ok) continue;
      const request = {
        keyPoint: picked.picks[0]?.code ?? '',
        ...(picked.concept ? { concept: picked.concept } : {}),
        points: [],
        examples: REFERENCE_PNG ? [q22Reference(REFERENCE_PNG)] : [],
        strict: true,
        count: 1,
        level: 'same',
        shape: 'any',
        sides: ['en', 'zh'],
        note: text,
      } as unknown as StudioRequest;
      const outcome = await liveEngine.write(request, deps, { signal }, []);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) continue;
      outcome.drafts.forEach((d, i) => {
        const id = `r${n + 1}-d${i + 1}`;
        const block = d.diagram?.block;
        if (block) {
          for (const language of ['en', 'zh'] as const) {
            writeFileSync(path.join(out, 'svg', `${id}.${language}.svg`), diagramSvg(block.diagram, { widthPx: block.widthPx, heightPx: block.heightPx, language, scale: 2, answers: 'show' }));
          }
        }
        rows.push({
          id,
          type: text,
          status: d.status,
          charged: Math.round((charged - before) * 100) / 100,
          stem: d.draft.stem,
          options: d.draft.options,
          answer: 'ABCD'[d.draft.answerIndex],
          explanation: d.draft.explanation,
          figure: d.figure ?? '',
          diagram: d.diagram ? { status: d.diagram.status, kind: d.diagram.spec?.kind, scene: d.diagram.spec?.scene, issues: d.diagram.issues.map((x) => `${x.level} ${x.code}: ${x.text}`), solved: d.diagram.solved ?? null } : null,
          checks: d.checks.map((c) => `${c.id}:${c.state}${c.findings.length ? ` [${c.findings.map((f) => f.id).join(', ')}]` : ''}`),
          kind: d.diagram?.spec?.kind,
          scene: d.diagram?.spec?.scene?.type,
          issues: d.diagram?.issues.map((x) => `${x.level} ${x.code}: ${x.text}`) ?? [],
        });
      });
    }
    writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ at: new Date().toISOString(), total: Math.round(charged * 100) / 100, rows }, null, 2));
  });
});
