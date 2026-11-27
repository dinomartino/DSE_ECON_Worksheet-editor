import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import { scriptedClient } from '@/translate/testKit';
import { diagramSvg } from '@/render/diagram';
import fixtureFile from './setFixtures.json';
import k0554 from './k0554Fixture.json';
import { blockOf, evaluateSpec } from '.';
import { systemPrompt } from './prompt';
import {
  buildSetRequest,
  checkGraphNote,
  DIAGRAM_SET_SCHEMA,
  generateDiagrams,
  noteShape,
  parseSet,
  sameFigures,
  solveSet,
  taxKind,
  type DiagramSetInput,
  type FigureAt,
} from './set';
import { parseSpec } from './schema';
import { figureWords } from './words';
import type { DiagramSpec } from './types';

/**
 * Several figures in one request (k-0545): the HKDSE "which of the following diagrams" grid
 * (2023 Q36, 2026 Q38) and a diagram under every option (2024 Q11, Q29), remade as synthetic
 * questions in `setFixtures.json` (no bank text). The same replies feed the browser proof.
 */

type Fixture = (typeof fixtureFile.fixtures)[number];
const FIXTURES = fixtureFile.fixtures as Fixture[];
const fixture = (id: string) => FIXTURES.find((f) => f.id === id)!;
const preset = presetFor('gemini');
const signal = () => new AbortController().signal;

function inputOf(f: Fixture): DiagramSetInput {
  const q = f.question;
  const options = q.options.map((o) => o.en);
  return {
    question: [q.stem.en, ...options.map((o, i) => `${'ABCD'[i]}. ${o}`)].join('\n'),
    key: `${'ABCD'[q.answer]}. ${q.explanation.en}`,
    sides: ['en', 'zh'],
    figures: q.figures.map((x) => ({ at: x.at as FigureAt, note: x.note })),
    mcq: { stem: q.stem.en, statements: [], options, answer: q.answer },
  };
}
const replyText = (f: Fixture) => JSON.stringify(f.reply);
const specOf = (f: Fixture, at: string): DiagramSpec => parseSpec(JSON.stringify(f.reply.figures.find((x) => x.at === at)))!.spec;

describe('the batched reply: one request, every figure', () => {
  for (const f of FIXTURES) {
    it(`${f.id} (like ${f.like}): one request, every figure drawn and checked, the key worked out where it can be`, async () => {
      const client = scriptedClient([replyText(f)]);
      const out = await generateDiagrams(inputOf(f), { client, preset }, signal());
      expect(client.requests).toHaveLength(1);
      if (!out.ok) throw new Error(JSON.stringify(out.error));
      expect(out.figures.map((x) => x.at)).toEqual(f.question.figures.map((x) => x.at));
      for (const fig of out.figures) {
        // How the figure prints at its width is checked on its own (layoutCheck.test.ts); options-adas A's LRAS₁ name is pushed off its line by LRAS₀'s.
        expect(fig.issues.filter((i) => !i.code.startsWith('layout.')), `${f.id} ${fig.at}`).toEqual([]);
        expect(fig.block).not.toBeNull();
        // Half the text column: a grid cell or an option's figure.
        expect(fig.block!.widthPx).toBeLessThanOrEqual(300);
        expect(diagramSvg(fig.block!.diagram, { widthPx: fig.block!.widthPx, heightPx: fig.block!.heightPx, language: 'zh' })).toContain('<svg');
      }
      expect(out.issues).toEqual([]);
      if (f.reply.gridAsks !== 'none') expect(out.solved?.option).toBe(f.question.answer);
      else expect(out.solved).toBeNull();
    });
  }

  it('sends the same fixed system prompt as one diagram (cached), the figures in the payload', () => {
    const req = buildSetRequest(inputOf(fixture('grid-regressive')), preset, signal(), false);
    expect(req.system).toBe(systemPrompt());
    expect(req.schema).toBe(DIAGRAM_SET_SCHEMA);
    const payload = JSON.parse(req.turns[0].content as string);
    expect(payload.task).toBe('diagram-set');
    expect(payload.figures.map((x: { at: string }) => x.at)).toEqual(['(1)', '(2)', '(3)', '(4)']);
    // Room for four specs, about 1.5k tokens each, beyond one diagram's.
    expect(req.maxOutputTokens).toBeGreaterThan(3000 + 4096);
  });

  it('repairs only the figure that failed, in one more request', async () => {
    const f = fixture('grid-regressive');
    const broken = structuredClone(f.reply);
    // (2) drawn rising: the note asks for a falling line, and the set no longer gives the key.
    (broken.figures[1].curves[0] as { rise: string }).rise = 'rising';
    const fixed = { gridAsks: f.reply.gridAsks, figures: [f.reply.figures[1]] };
    const client = scriptedClient([JSON.stringify(broken), JSON.stringify(fixed)]);
    const out = await generateDiagrams(inputOf(f), { client, preset }, signal());
    expect(client.requests).toHaveLength(2);
    const repair = client.requests[1].turns.at(-1)!.content as string;
    expect(repair).toContain('Figure (2)');
    expect(repair).not.toContain('Figure (1)');
    if (!out.ok) throw new Error('failed');
    expect(out.attempt).toBe(2);
    expect(out.figures.every((x) => x.status === 'ok')).toBe(true);
    expect(out.solved?.option).toBe(0);
  });

  it('keeps the figures it has when the repair does not help, the failed one marked failed', async () => {
    const f = fixture('options-labour');
    const missing = { gridAsks: 'none', figures: f.reply.figures.slice(0, 3) };
    const client = scriptedClient([JSON.stringify(missing), '{"figures": [], "gridAsks": "none"}']);
    const out = await generateDiagrams(inputOf(f), { client, preset }, signal());
    if (!out.ok) throw new Error('failed');
    expect(out.figures.map((x) => x.status)).toEqual(['ok', 'ok', 'ok', 'failed']);
    expect(out.figures[3].issues[0].code).toBe('set.missing');
  });

  it('parses a looser reply: unknown places dropped, a missing gridAsks read as none', () => {
    const parsed = parseSet('```json\n{"figures":[{"at":"(9)","kind":"none"},{"at":"(1)","kind":"none"}]}\n```');
    expect(parsed?.entries.map((e) => e.at)).toEqual(['(1)']);
    expect(parsed?.gridAsks).toBe('none');
    expect(parseSet('no json')).toBeNull();
  });
});

describe('a plain graph (role "graph")', () => {
  it('draws each shape, unnamed, and says it in words for the blind solve', () => {
    const f = fixture('grid-regressive');
    const words = ['(1)', '(2)', '(3)', '(4)'].map((at) => figureWords(specOf(f, at), { x: {}, y: {}, curves: [], points: [], labels: [], arrows: [] }));
    expect(words[0]).toContain('rising at a decreasing rate');
    expect(words[1]).toContain('falling');
    expect(words[2]).toContain('straight line from the origin');
    expect(words[0]).toContain('Tax payment');
  });

  it('reads what kind of tax a graph shows', () => {
    const g = (y: string, shape: string, rise = 'rising') =>
      parseSpec(JSON.stringify({ kind: 'curves', xAxis: { en: 'Taxable Income ($)', zh: '' }, yAxis: { en: y, zh: '' }, curves: [{ id: 'L', role: 'graph', shape, rise, label: '' }] }))!.spec;
    // HKDSE 2023 Q36's four graphs: (2) and (4) are progressive.
    expect([g('Tax payment ($)', 'origin'), g('Average tax rate (%)', 'origin'), g('Tax payment ($)', 'concave'), g('Average tax rate (%)', 'concave')].map(taxKind)).toEqual([
      'proportional', 'progressive', 'regressive', 'progressive',
    ]);
    // HKDSE 2026 Q38's: (2) and (3) are proportional.
    expect([g('Tax payment ($)', 'flat'), g('Tax payment ($)', 'origin'), g('Tax rate (%)', 'flat'), g('Tax rate (%)', 'origin')].map(taxKind)).toEqual([
      'regressive', 'proportional', 'proportional', 'progressive',
    ]);
    expect(taxKind(g('Price', 'origin'))).toBeNull();
  });

  it('solves "which of (1)-(4) show X" against the options, and fails a key the drawings disagree with', () => {
    const f = fixture('grid-proportional');
    const figures = f.reply.figures.map((x) => ({ at: x.at as FigureAt, spec: specOf(f, x.at) }));
    const mcq = inputOf(f).mcq!;
    expect(solveSet(figures, 'proportionalTax', mcq).solved?.option).toBe(1);
    const wrong = solveSet(figures, 'proportionalTax', { ...mcq, answer: 2 });
    expect(wrong.issues[0].code).toBe('key.geometry');
    expect(wrong.issues[0].text).toContain('option B');
    expect(solveSet(figures, 'none', mcq).solved).toBeNull();
  });

  it('holds the drawn shape to the writer\'s note', () => {
    expect(noteShape('a curve from the origin, concave, rising at a decreasing rate')).toEqual({ shape: 'concave', rise: 'rising' });
    expect(noteShape('Average tax rate against income: a straight line, falling')).toEqual({ rise: 'falling' });
    expect(noteShape('horizontal, a lump sum')).toEqual({ shape: 'flat' });
    const spec = specOf(fixture('grid-regressive'), '(1)');
    expect(checkGraphNote(spec, 'concave, rising')).toEqual([]);
    expect(checkGraphNote(spec, 'convex, rising at an increasing rate').map((i) => i.code)).toEqual(['graph.shape']);
    expect(checkGraphNote(spec, 'a falling line').map((i) => i.code)).toEqual(['graph.rise']);
  });
});

const blockOfSpec = (spec: DiagramSpec) => blockOf(evaluateSpec(spec, { sides: ['en'], key: '' }), ['en'])!.diagram;

describe('broken tax lines and figures drawn alike (k-0554)', () => {
  // The live run on HKCEE 1990 P2 Q47: the writer's four notes, and the reply that drew all four as one level line.
  const live = k0554 as unknown as { question: { stem: string; answer: number; explanation: string }; notes: Array<{ at: FigureAt; note: string }>; reply: { gridAsks: string; figures: unknown[] } };
  const input: DiagramSetInput = {
    question: live.question.stem,
    key: `${'ABCD'[live.question.answer]}. ${live.question.explanation}`,
    sides: ['en'],
    figures: live.notes,
    mcq: { stem: live.question.stem, statements: [], options: ['', '', '', ''], answer: live.question.answer },
  };
  const g = (shape: string, y = 'Average Tax Rate') => parseSpec(JSON.stringify({ kind: 'curves', xAxis: { en: 'Income', zh: '' }, yAxis: { en: y, zh: '' }, curves: [{ id: 'G', role: 'graph', shape, rise: 'rising', label: '' }] }))!.spec;

  it('reads each live note part by part: an allowance, a cap, both', () => {
    expect(live.notes.map((n) => noteShape(n.note).shape)).toEqual(['zeroThenRising', 'origin', 'flat', 'zeroRisingFlat']);
    expect(noteShape('a straight line from a positive value on the vertical axis, rising, then becoming horizontal at the standard rate').shape).toBe('linearThenFlat');
    expect(noteShape('rising straight from the origin, then horizontal').shape).toBe('risingThenFlat');
    expect(noteShape('a progressive tax with a tax-free allowance and no standard rate cap: zero up to the allowance, then rising').shape).toBe('zeroThenRising');
    // Before, the "horizontally along the axis at zero" of A and D read as "flat": the level line passed.
    expect(checkGraphNote(g('flat'), live.notes[0].note).map((i) => i.code)).toEqual(['graph.shape']);
    expect(checkGraphNote(g('zeroRisingFlat'), live.notes[3].note)).toEqual([]);
  });

  it('draws the four HKCEE salaries-tax lines apart, says them in words, and knows which are one kind of tax', () => {
    const shapes = ['zeroThenRising', 'risingThenFlat', 'linearThenFlat', 'zeroRisingFlat'];
    const svgs = shapes.map((s) => diagramSvg(blockOfSpec(g(s)), { widthPx: 300, heightPx: 240, language: 'en' }));
    expect(new Set(svgs).size).toBe(4);
    const words = shapes.map((s) => figureWords(g(s), { x: {}, y: {}, curves: [], points: [], labels: [], arrows: [] } as never));
    expect(words[0]).toContain('zero (along the horizontal axis)');
    expect(words[3]).toContain('then horizontal');
    expect(taxKind(g('zeroThenRising'))).toBe('progressive');
    expect(taxKind(g('zeroThenRising', 'Tax payment ($)'))).toBe('progressive');
    expect(taxKind(g('zeroRisingFlat'))).toBeNull();
  });

  it('the live reply (four level lines) fails the set, is asked again, and a reply drawn to the notes stands', async () => {
    expect(sameFigures(live.notes.map((n) => ({ at: n.at, spec: g('flat') }))).map((i) => i.at)).toEqual([['A', 'B'], ['A', 'C'], ['A', 'D']]);
    const fixed = { gridAsks: 'none', figures: (live.reply.figures as Array<{ at: string; curves: Array<{ shape: string }> }>).map((f, i) => ({ ...f, curves: [{ ...f.curves[0], shape: ['zeroThenRising', 'origin', 'flat', 'zeroRisingFlat'][i] }] })) };
    const client = scriptedClient([JSON.stringify(live.reply), JSON.stringify(fixed)]);
    const out = await generateDiagrams(input, { client, preset }, signal());
    expect(client.requests).toHaveLength(2);
    expect(client.requests[1].turns.at(-1)!.content as string).toContain('drawn the same');
    if (!out.ok) throw new Error('failed');
    expect(out.issues.filter((i) => i.code === 'set.same')).toEqual([]);
    expect(out.figures.map((f) => f.spec.curves[0].shape)).toEqual(['zeroThenRising', 'origin', 'flat', 'zeroRisingFlat']);
  });

  it('a repair that still draws them alike leaves the set issue, which the studio shows as a red warning', async () => {
    const client = scriptedClient([JSON.stringify(live.reply), JSON.stringify(live.reply)]);
    const out = await generateDiagrams(input, { client, preset }, signal());
    if (!out.ok) throw new Error('failed');
    expect(out.issues.some((i) => i.code === 'set.same')).toBe(true);
  });
});
