/**
 * Kind "flow" (k-0588, audit k-0583 D1/D2): the AI's boxes-and-arrows figures, compiled to
 * the editor's own flow chart and checked against the question. The HKDSE examples are the
 * audit's: 2021 P1 Q23 (value-added chain), 2026 P1 Q5 (circular flow), 2014 P1 Q10 (stages).
 */
import { describe, expect, it } from 'vitest';
import { compileSpec } from './compile';
import { describeDiagram } from './describe';
import { checkFlow, flowLetters } from './flow';
import { evaluateSpec } from './run';
import { DIAGRAM_SPEC_SCHEMA, emptySpec, parseSpec } from './schema';
import { systemPrompt } from './prompt';
import type { DiagramSpec, SpecFlow, SpecText } from './types';
import { serializeWorksheet } from '@/model/migrations';
import { createDiagramBlock, createMcqQuestion, createWorksheet } from '@/model/factories';
import { flowChartLayout } from '@/render/diagram';
import { dse2021q23 } from '@/test/flowFixtures';
import { plain } from '@/model/text';

const t = (en: string, zh = en): SpecText => ({ en, zh });
const none = t('', '');
const node = (id: string, en: string, zh: string, col: number, row: number, boxed = true) => ({ id, label: t(en, zh), col, row, boxed });
const arrow = (from: string, to: string, label = none, extra: Partial<SpecFlow['arrows'][number]> = {}) => ({
  from,
  to,
  label,
  labelBelow: none,
  dashed: false,
  route: 'straight' as const,
  ...extra,
});
const flowSpec = (flow: Partial<SpecFlow>): DiagramSpec => ({
  ...emptySpec('flow'),
  reason: 'test',
  flow: { layout: 'columns', nodes: [], arrows: [], key: { dashed: none, solid: none }, ...flow },
});

/** HKDSE 2021 P1 Q23 as the model would write it. */
const chain2021 = () =>
  flowSpec({
    nodes: [
      node('imp', 'Local importers', '本地進口商', 0, 0),
      node('farm', 'Local farmers', '本地農民', 0, 1),
      node('inv', 'increase in inventory\n$50', '存貨增加\n$50', 0, 2, false),
      node('sup', 'Local supermarkets', '本地超級市場', 1, 0),
      node('con', 'Local consumers', '本地消費者', 2, 0),
      node('tour', 'Foreign tourists', '外國遊客', 2, 1),
    ],
    arrows: [
      { ...arrow('', 'imp', t('$200')), labelBelow: t('raw materials', '原料') },
      arrow('imp', 'sup', t('$400')),
      { ...arrow('farm', 'sup'), labelBelow: t('$600') },
      arrow('farm', 'inv'),
      arrow('sup', 'con', t('$1 200\n($100 sales tax inclusive)', '$1 200\n（包括 $100 銷售稅）')),
      { ...arrow('sup', 'tour'), labelBelow: t('$500') },
    ],
  });

const circular = () =>
  flowSpec({
    nodes: [node('h', 'Households', '住戶', 0, 0), node('f', 'Firms', '廠商', 1, 0)],
    arrows: [
      arrow('f', 'h', none, { route: 'above', labelBelow: t('Flow Y', '流量 Y') }),
      arrow('h', 'f', t('Flow X', '流量 X'), { route: 'above', dashed: true }),
      arrow('h', 'f', none, { route: 'below' }),
      arrow('f', 'h', none, { route: 'below', dashed: true }),
    ],
    key: { dashed: t('Money flow', '貨幣流程'), solid: t('Real flow', '實質流程') },
  });

const stages = (labelF = true) =>
  flowSpec({
    layout: 'grid',
    nodes: [node('p', 'Primary production', '一級生產', 1, 0), node('s', 'Secondary production', '二級生產', 0, 1), node('t', 'Tertiary production', '三級生產', 2, 1)],
    arrows: [
      arrow('s', 'p', t('E')),
      arrow('p', 's'),
      arrow('p', 't', labelF ? t('F') : none),
      arrow('t', 'p'),
      arrow('s', 't'),
      arrow('t', 's'),
    ],
  });

const mcq = (stem: string, options: string[]) => ({ stem, statements: [], options, answer: 0 });
const errors = (issues: Array<{ level: string; code: string }>) => issues.filter((i) => i.level === 'error').map((i) => i.code);

describe('kind "flow" compiles to the editor’s flow chart', () => {
  it('the HKDSE 2021 P1 Q23 value-added chain: the same chart a teacher draws by hand', () => {
    const { diagram, issues } = compileSpec(chain2021());
    expect(issues).toEqual([]);
    const drawn = diagram!.flow!;
    const hand = dse2021q23().flow!;
    const label = (id: string | undefined, nodes = drawn.nodes) => plain(nodes.find((n) => n.id === id)?.label.en ?? []);
    expect(drawn.nodes.map((n) => [plain(n.label.en), n.col, n.row, n.boxed ?? true])).toEqual(
      hand.nodes.map((n) => [plain(n.label.en), n.col, n.row, n.boxed ?? true]),
    );
    expect(drawn.arrows.map((a) => [label(a.from), label(a.to), plain(a.label?.en ?? []), plain(a.labelBelow?.en ?? [])])).toEqual(
      hand.arrows.map((a) => [label(a.from, hand.nodes), label(a.to, hand.nodes), plain(a.label?.en ?? []), plain(a.labelBelow?.en ?? [])]),
    );
    // Nothing the columns layout lacks: no v4 field, so every release since v0.8.7 edits it.
    expect(drawn.layout).toBeUndefined();
    expect(drawn.key).toBeUndefined();
    expect(drawn.arrows.some((a) => a.dashed || a.route)).toBe(false);
  });

  it('passes the checks for its own question, in English and Chinese', () => {
    const evaluated = evaluateSpec(chain2021(), {
      sides: ['en', 'zh'],
      key: 'A. Value added = 1 200 − 100 + 500 + 50 − 200 = $1 450.',
      mcq: mcq('Refer to the diagram. What is the total value added of the economy?', ['$1 450', '$1 550', '$1 650', '$1 750']),
    });
    expect(errors(evaluated.issues)).toEqual([]);
    expect(evaluated.issues.filter((i) => i.code.startsWith('flow.'))).toEqual([]);
  });

  it('the circular flow (2026 P1 Q5): loops, dashes and the key reach the editor, written at 4', () => {
    const { diagram, issues } = compileSpec(circular());
    expect(issues).toEqual([]);
    const flow = diagram!.flow!;
    expect(flow.arrows.map((a) => [a.route, a.dashed ?? false])).toEqual([
      ['above', false],
      ['above', true],
      ['below', false],
      ['below', true],
    ]);
    expect(plain(flow.key!.dashed!.zh)).toBe('貨幣流程');
    const worksheet = createWorksheet();
    const question = createMcqQuestion();
    question.blocks = [{ ...createDiagramBlock('flow'), diagram: diagram! }];
    expect(serializeWorksheet({ ...worksheet, questions: [question] }).schemaVersion).toBe(4);
    const evaluated = evaluateSpec(circular(), {
      sides: ['en', 'zh'],
      key: 'B',
      mcq: mcq('The diagram shows the circular flow of a two-sector economy. Which of the following correctly describes Flow X and Flow Y?', [
        'X: factor payments; Y: goods and services',
        'X: consumption expenditure; Y: goods and services',
        'X: factor payments; Y: factor services',
        'X: consumption expenditure; Y: factor services',
      ]),
    });
    expect(errors(evaluated.issues)).toEqual([]);
  });

  it('the stage triangle (2014 P1 Q10): grid layout, pairs side by side, and E and F must be on it', () => {
    const question = mcq('Which of the following correctly describes the flows E and F?', ['E only', 'F only', 'Both E and F', 'Neither']);
    const ok = evaluateSpec(stages(), { sides: ['en'], key: 'C', mcq: question });
    expect(errors(ok.issues)).toEqual([]);
    expect(ok.compiled.diagram!.flow!.layout).toBe('grid');
    const layout = flowChartLayout(ok.compiled.diagram!, ok.compiled.diagram!.flow!, 'en');
    const [first, second] = layout.arrows;
    expect(Math.hypot(first.x1 - second.x2, first.y1 - second.y2)).toBeGreaterThan(5);
    const missing = evaluateSpec(stages(false), { sides: ['en'], key: 'C', mcq: question });
    expect(missing.issues.find((i) => i.code === 'label.missing')?.text).toContain('F');
  });
});

describe('what kind "flow" refuses', () => {
  it.each([
    ['no boxes', flowSpec({}), 'flow.empty'],
    ['an arrow to a box not on the chart', flowSpec({ nodes: [node('a', 'A', 'A', 0, 0)], arrows: [arrow('a', 'b')] }), 'flow.endpoint'],
    ['an arrow with both ends open', flowSpec({ nodes: [node('a', 'A', 'A', 0, 0)], arrows: [arrow('', '')] }), 'flow.endpoint'],
    ['an arrow from a box to itself', flowSpec({ nodes: [node('a', 'A', 'A', 0, 0)], arrows: [arrow('a', 'a')] }), 'flow.endpoint'],
    ['two boxes with one id', flowSpec({ nodes: [node('a', 'A', 'A', 0, 0), node('a', 'B', 'B', 1, 0)] }), 'flow.id'],
    ['two boxes in one place', flowSpec({ nodes: [node('a', 'A', 'A', 0, 0), node('b', 'B', 'B', 0, 0)] }), 'flow.cell'],
    ['a box with no words', flowSpec({ nodes: [node('a', '', '', 0, 0)] }), 'flow.unnamed'],
  ])('%s', (_name, spec, code) => {
    expect(errors(compileSpec(spec).issues)).toContain(code);
  });

  it('a route on an open end is dropped: a stub is always straight', () => {
    const { diagram } = compileSpec(flowSpec({ nodes: [node('a', 'A', 'A', 0, 0)], arrows: [arrow('', 'a', t('$200'), { route: 'above' })] }));
    expect(diagram!.flow!.arrows[0].route).toBeUndefined();
  });

  it('an amount the stem gives but the chart does not print asks the teacher to look', () => {
    const { diagram } = compileSpec(chain2021());
    const issues = checkFlow(diagram!, mcq('Local importers pay $300 for transport. What is the value added?', ['$1', '$2', '$3', '$4']), ['en']);
    expect(issues).toEqual([expect.objectContaining({ level: 'look', code: 'flow.amount' })]);
    expect(checkFlow(diagram!, mcq('A sales tax of $100 is included. What is the value added?', ['$1', '$2', '$3', '$4']), ['en'])).toEqual([]);
  });

  it('a box missing a language the paper prints asks the teacher to look', () => {
    const { diagram } = compileSpec(flowSpec({ nodes: [node('a', 'Firms', '', 0, 0)] }));
    // `phrase` copies the other side across, so read the spec's own words: the box had no Chinese.
    expect(diagram!.flow!.nodes[0].label.zh[0].text).toBe('Firms');
    const bare = { ...diagram!, flow: { ...diagram!.flow!, nodes: [{ ...diagram!.flow!.nodes[0], label: { en: diagram!.flow!.nodes[0].label.en, zh: [] } }] } };
    expect(checkFlow(bare, undefined, ['en', 'zh']).map((i) => i.code)).toEqual(['flow.side']);
  });
});

describe('the reply, the prompt and the reference', () => {
  it('reads the letters a flow question names, not the capitals of its prose', () => {
    expect(flowLetters(mcq('Which of the following correctly describes Flow X and Flow Y?', ['X: a; Y: b', 'X: c; Y: d']))).toEqual(['X', 'Y']);
    expect(flowLetters(mcq('Refer to the diagram. Which of the following could be P and Q?', ['(1) only', '(2) only']))).toEqual(['P', 'Q']);
    expect(flowLetters(mcq('下圖顯示流量 E 和 F。', ['只有 E']))).toEqual(['E', 'F']);
    expect(flowLetters(mcq('What is the GDP of Hong Kong?', ['$1', '$2']))).toEqual([]);
  });

  it('the schema requires the flow key and every key inside it (strict structured output)', () => {
    const props = DIAGRAM_SPEC_SCHEMA.properties as Record<string, { required?: string[]; properties?: Record<string, unknown> }>;
    expect((DIAGRAM_SPEC_SCHEMA.required as string[])).toContain('flow');
    expect(props.flow.required).toEqual(['layout', 'nodes', 'arrows', 'key']);
  });

  it('a reply saved before kind "flow" still reads, with an empty chart', () => {
    const parsed = parseSpec(JSON.stringify({ ...emptySpec('curves'), flow: undefined }))!;
    expect(parsed.spec.flow).toEqual({ layout: 'columns', nodes: [], arrows: [], key: { dashed: none, solid: none } });
    const odd = parseSpec(JSON.stringify(circular()).replace('"above"', '"sideways"'))!;
    expect(odd.spec.flow!.arrows[0].route).toBe('straight');
    expect(odd.issues.map((i) => i.code)).toContain('spec.value');
  });

  it('the prompt offers kind "flow" and keeps the stock flow template off the menu', () => {
    const text = systemPrompt();
    expect(text).toContain('KIND "flow"');
    expect(text).toContain('Never template "flow"');
    expect(text).not.toMatch(/^- flow: Flow chart/m);
  });

  it('a reference chain is described box by box and arrow by arrow, amounts included', () => {
    const text = describeDiagram(dse2021q23());
    expect(text).toContain('"Local supermarkets" at column 1, row 0');
    expect(text).toContain('Arrow (open end) → "Local importers": "$200" / "raw materials".');
    expect(text).toContain('"increase in inventory $50" at column 0, row 2 (no box)');
  });
});
