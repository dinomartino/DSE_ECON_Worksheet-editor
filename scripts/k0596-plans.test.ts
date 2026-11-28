/**
 * k-0596 proof (not a unit test): the plan-path reference figures drawn offline, with their
 * checks. Run: `PROOF_OUT=<dir> npx vitest run scripts/k0596-plans.test.ts`, then
 * `node scripts/k0577-sheet.mjs <dir> "k-0596 plans"`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { it } from 'vitest';
import { blockOf, evaluateSpec } from '@/diagramGen/run';
import { compoundPlan, P, q21Plan, q22Plan } from '@/diagramGen/planFixtures';
import { Q21_KEY, Q21_MCQ } from '@/diagramGen/q21.fixture';
import { Q22_KEY, Q22_MCQ } from '@/diagramGen/q22.fixture';
import { diagramSvg } from '@/render/diagram';
import { parseSpec } from '@/diagramGen/schema';
import { GRAPH_CASES } from '../evals/graphs/cases';
import { inputOf } from '../evals/graphs/shared';

const OUT = process.env.PROOF_OUT ?? '/tmp/k0596-plans';
const compound = compoundPlan();
const CASES = [
  { id: 'q21-plan', type: 'HKDSE 2023 P1 Q21 as a plan', spec: q21Plan(), mcq: Q21_MCQ, key: Q21_KEY },
  { id: 'q21-swapped', type: 'Q21, c and f swapped (passed before k-0596)', spec: q21Plan([P('D1', 'S', 'a'), P('D2', 'a', 'b'), P('D2', 'P1', 'c'), P('D2', 'S', 'f')]), mcq: Q21_MCQ, key: Q21_KEY },
  { id: 'q22-plan', type: 'HKDSE 2018 P1 Q22 as a plan (change in DWL)', spec: q22Plan(), mcq: Q22_MCQ, key: Q22_KEY },
  { id: 'tax-floor', type: 'unit tax under a price floor, lettered bands', spec: compound.spec, mcq: compound.mcq, key: compound.key },
];

// A live run's specs drawn again with this build (LIVE_DIR=<run dir>): the model's own plans.
const LIVE = process.env.LIVE_DIR;
if (LIVE) {
  for (const c of GRAPH_CASES.filter((k) => existsSync(path.join(LIVE, `${k.id}.spec.json`)))) {
    const spec = parseSpec(readFileSync(path.join(LIVE, `${c.id}.spec.json`), 'utf8'))!.spec;
    const input = inputOf(c);
    CASES.push({ id: `live-${c.id}`, type: `live spec, redrawn: ${c.type}`, spec, mcq: input.mcq!, key: input.key });
  }
}

it('draws the plans', () => {
  mkdirSync(path.join(OUT, 'svg'), { recursive: true });
  const rows: unknown[] = [];
  for (const c of CASES) {
    const e = evaluateSpec(c.spec, { sides: ['en', 'zh'], key: c.key, mcq: c.mcq });
    const errors = e.issues.filter((i) => i.level === 'error');
    // A failing figure is still drawn here, to show what the check refused.
    const b = blockOf(e, ['en', 'zh']);
    if (b) for (const language of ['en', 'zh'] as const) writeFileSync(path.join(OUT, 'svg', `${c.id}.${language}.svg`), diagramSvg(b.diagram, { widthPx: b.widthPx, heightPx: b.heightPx, language, scale: 2, answers: 'show' }));
    rows.push({ id: c.id, type: c.type, kind: 'curves', status: errors.length ? 'failed' : e.issues.length ? 'look' : 'ok', issues: [...e.issues.map((i) => `${i.level} ${i.code}: ${i.text}`), `solved: ${JSON.stringify(e.solved)}`] });
  }
  writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ rows }, null, 2));
});
