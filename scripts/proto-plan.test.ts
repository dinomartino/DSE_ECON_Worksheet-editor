/**
 * Prototype only (k-0577 round 3, u-1mk8): the "AI plans, code lays out" path with no scene,
 * on four HKDSE reference figures. Each plan is what a model would write in kind "curves"
 * (relations only: crossings, shifts, a price line through a crossing, a point above another);
 * code places everything, letters by the scene placer, and the checks run. Not a unit test.
 * Run: `PROTO_OUT=<dir> npx vitest run scripts/proto-plan.test.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { it } from 'vitest';
import { blockOf, evaluateSpec } from '@/diagramGen/run';
import { emptySpec } from '@/diagramGen/schema';
import { Q21_KEY, Q21_MCQ } from '@/diagramGen/q21.fixture';
import { Q22_KEY, Q22_MCQ } from '@/diagramGen/q22.fixture';
import { diagramSvg } from '@/render/diagram';

const OUT = process.env.PROTO_OUT ?? '/tmp/proto-plan';
const C = (id: string, role: string, label: string, slope = 'normal') => ({ id, role, slope, place: 'mid', label, shape: 'none', rise: 'rising' });
const P = (a: string, b: string, name = '', xTick = '', yTick = '', dot = true) => ({ a, b, name, xTick, yTick, dot });
function plan(parts: Record<string, unknown>, axes: [string, string, string, string] = ['Quantity', '數量', 'Price', '價格']) {
  const spec = emptySpec('curves');
  Object.assign(spec, { xAxis: { en: axes[0], zh: axes[1] }, yAxis: { en: axes[2], zh: axes[3] }, ...parts });
  return spec;
}

const SHORTAGE = { stem: 'The government sets a maximum price of P_1 for good X. Refer to the diagram. What is the shortage?', statements: [], options: ['Q_1Q_2', 'Q_1Q_3', 'Q_2Q_3', 'Q_3Q_4'], answer: 1 };
const ADAS = { stem: 'Which of the following diagrams shows the effect of a fall in exports on the economy in the short run?', statements: [], options: ['(1)', '(2)', '(3)', '(4)'], answer: 3 };

const CASES = [
  {
    id: 'q21-2023-p1',
    mcq: Q21_MCQ,
    key: Q21_KEY,
    spec: plan({
      curves: [C('D1', 'demand', 'D_1'), C('S', 'supply', 'S')],
      shifts: [{ of: 'D1', id: 'D2', direction: 'right', size: 'normal', label: 'D_2' }],
      levels: [{ id: 'P1', kind: 'ceiling', above: ['D1', 'S'], below: [], side: 'at', style: 'line', label: 'P_1' }],
      points: [P('D1', 'S', 'a'), P('D2', 'a', 'b'), P('D2', 'S', 'c'), P('D2', 'P1', 'f')],
    }),
  },
  {
    id: 'q22-2018-p1',
    mcq: Q22_MCQ,
    key: Q22_KEY,
    spec: plan({
      curves: [C('D', 'demand', 'D'), C('S0', 'supply', 'S_0')],
      shifts: [
        { of: 'S0', id: 'S1', direction: 'up', size: 'small', label: 'S_1' },
        { of: 'S1', id: 'S2', direction: 'up', size: 'small', label: 'S_2' },
      ],
      points: [P('D', 'S0', 'e'), P('D', 'S1', 'f'), P('D', 'S2', 'g'), P('S0', 'f', 'j'), P('S0', 'g', 'm'), P('S1', 'g', 'k'), P('S2', 'e', 'n')],
    }),
  },
  {
    id: 'shortage-q4',
    mcq: SHORTAGE,
    key: 'At P_1 quantity supplied is Q_1 and quantity demanded is Q_3: the shortage is Q_1Q_3.',
    spec: plan({
      curves: [C('D', 'demand', 'D'), C('S', 'supply', 'S')],
      levels: [
        { id: 'P1', kind: 'ceiling', above: [], below: [], side: 'below', style: 'line', label: 'P_1' },
        { id: 'Plow', kind: 'fixed', above: [], below: ['D', 'P1'], side: 'below', style: 'guide', label: '' },
      ],
      points: [P('S', 'P1', '', 'Q_1', '', false), P('D', 'S', '', 'Q_2', '', false), P('D', 'P1', '', 'Q_3', '', false), P('D', 'Plow', '', 'Q_4', '', false)],
      asks: { what: 'shortage', state: 'before' },
    }),
  },
  {
    id: 'adas-2024-p1-q29-option',
    mcq: ADAS,
    key: 'A fall in exports shifts AD to the left from AD_0 to AD_1.',
    width: 260,
    spec: plan(
      {
        curves: [C('AD0', 'ad', 'AD_0'), C('SRAS', 'sras', 'SRAS'), C('LRAS', 'lras', 'LRAS')],
        shifts: [{ of: 'AD0', id: 'AD1', direction: 'left', size: 'normal', label: 'AD_1' }],
      },
      ['Aggregate output', '總產出', 'General price level', '一般物價水平'],
    ),
  },
];

it('draws the reference plans', () => {
  mkdirSync(path.join(OUT, 'svg'), { recursive: true });
  const rows: unknown[] = [];
  for (const c of CASES) {
    const e = evaluateSpec(c.spec, { sides: ['en', 'zh'], key: c.key, mcq: c.mcq, widthPx: c.width });
    const b = blockOf(e, ['en', 'zh']);
    if (b) for (const language of ['en', 'zh'] as const) writeFileSync(path.join(OUT, 'svg', `${c.id}.${language}.svg`), diagramSvg(b.diagram, { widthPx: c.width ?? b.widthPx, heightPx: b.heightPx, language, scale: 2, answers: 'show' }));
    const issues = e.issues.map((i) => `${i.level} ${i.code}: ${i.text}`);
    rows.push({ id: c.id, type: 'plan (kind curves, no scene)', status: e.issues.some((i) => i.level === 'error') ? 'failed' : issues.length ? 'look' : 'ok', issues: [...issues, `solved: ${JSON.stringify(e.solved)}`] });
  }
  writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ rows }, null, 2));
});
