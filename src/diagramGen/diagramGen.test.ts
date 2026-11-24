import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import { AiError } from '@/ai/types';
import { aiErrorInfo } from '@/ai/errors';
import { migrate } from '@/model/migrations';
import { buildFromTemplate } from '@/model/diagramTemplates';
import { diagramSvg } from '@/render/diagram';
import { scriptedClient } from '@/translate/testKit';
import { compileSpec } from './compile';
import { describeDiagram } from './describe';
import { CASES, caseById, replyOf } from './fixtures';
import { DIAGRAM_SPEC_SCHEMA, parseSpec } from './schema';
import { labelBase, symbolRuns } from './text';
import { checkAgainstKey, diagramChanges, keyClaims } from './validate';
import { evaluateReply, generateDiagram } from './run';
import type { DiagramGenDeps, DiagramGenInput, DiagramSpec } from './types';

const preset = presetFor('gemini');
const signal = () => new AbortController().signal;
const deps = (replies: Parameters<typeof scriptedClient>[0], extra: Partial<DiagramGenDeps> = {}) => {
  const client = scriptedClient(replies);
  return { client, deps: { client, preset, ...extra } satisfies DiagramGenDeps };
};
const inputOf = (id: string, sides: DiagramGenInput['sides'] = ['en', 'zh']): DiagramGenInput => {
  const c = caseById(id);
  return { question: c.question, key: c.key, sides };
};
const clone = (s: DiagramSpec): DiagramSpec => structuredClone(s);

describe('labels: the model writes symbols, the editor prints subscripts', () => {
  it('_x, _{xy}, Unicode subscripts and a trailing digit', () => {
    expect(symbolRuns('S_1 = S_0 + t')).toEqual([
      { text: 'S' },
      { text: '1', vertAlign: 'subscript' },
      { text: ' = S' },
      { text: '0', vertAlign: 'subscript' },
      { text: ' + t' },
    ]);
    expect(symbolRuns('P_{c}')).toEqual([{ text: 'P' }, { text: 'c', vertAlign: 'subscript' }]);
    expect(symbolRuns('D₁')).toEqual([{ text: 'D' }, { text: '1', vertAlign: 'subscript' }]);
    expect(symbolRuns('E0')).toEqual([{ text: 'E' }, { text: '0', vertAlign: 'subscript' }]);
    expect(symbolRuns('PPC')).toEqual([{ text: 'PPC' }]);
  });
  it('a label base drops numbering and what follows "="', () => {
    const lab = (s: string) => ({ en: symbolRuns(s), zh: symbolRuns(s) });
    expect(labelBase(lab('S_0 = MC_0'))).toBe('S');
    expect(labelBase(lab('SRAS_1'))).toBe('SRAS');
    expect(labelBase(lab("D'"))).toBe('D');
  });
});

describe('every DSE-style case compiles to an editable diagram that passes its checks', () => {
  for (const c of CASES) {
    it(c.id, () => {
      const out = evaluateReply(replyOf(c.spec), { sides: ['en', 'zh'], key: c.key });
      expect(out).not.toBeNull();
      const errors = out!.issues.filter((i) => i.level === 'error');
      expect(errors).toEqual([]);
      const diagram = out!.compiled.diagram!;
      expect(diagram).toBeTruthy();
      // It draws in both languages without throwing, and survives the document migration.
      expect(diagramSvg(diagram, { widthPx: 400, heightPx: 320, language: 'bilingual' })).toContain('<svg');
      const doc = migrate({
        schemaVersion: 3,
        id: 'w',
        title: { en: [], zh: [] },
        instructions: { en: [], zh: [] },
        questions: [{ id: 'q', type: 'structured', blocks: [{ kind: 'diagram', id: 'b', diagram, widthPx: 400, heightPx: 300, altText: { en: [], zh: [] } }], parts: [] }],
        layout: [],
        flow: [{ type: 'question', id: 'q' }],
      });
      expect(doc.questions[0].blocks[0]).toMatchObject({ kind: 'diagram' });
    });
  }
});

describe('compile: relations, not frozen geometry', () => {
  it('a shift is a shift copy of its curve with an arrow that follows it; equilibria are anchored', () => {
    const { diagram, curveIds } = compileSpec(caseById('demand-increase').spec);
    const d1 = diagram!.curves.find((c) => c.id === curveIds.get('D1'))!;
    expect(d1.derive).toMatchObject({ kind: 'shift', of: curveIds.get('D0'), by: { x: 0.18, y: 0 } });
    expect(diagram!.arrows[0].follows).toBe(d1.id);
    expect(diagram!.points.every((p) => p.anchor && 'cross' in p.anchor)).toBe(true);
    // P and Q change arrows along both axes.
    expect(diagram!.spans!.map((s) => s.along).sort()).toEqual(['x', 'y']);
  });
  it('a unit tax moves supply up; the shades are the Shade menu presets', () => {
    const { diagram } = compileSpec(caseById('unit-tax').spec);
    expect(diagram!.curves.find((c) => c.derive?.kind === 'shift')!.derive).toMatchObject({ by: { x: 0, y: 0.24 } });
    expect(diagram!.areas!.length).toBeGreaterThanOrEqual(2);
  });
  it('a ceiling reads Qd and Qs off the curves and brackets the gap between them', () => {
    const { diagram } = compileSpec(caseById('rent-ceiling').spec);
    const readings = diagram!.points.filter((p) => p.dot === false);
    expect(readings).toHaveLength(2);
    expect(diagram!.spans![0]).toMatchObject({ style: 'bracket' });
    const [a, b] = readings.map((p) => p.at.y);
    expect(a).toBeCloseTo(b, 6);
  });
  it('a frontier shifts outward as a larger frontier, both ends', () => {
    const { diagram } = compileSpec(caseById('ppc-growth').spec);
    const [p0, p1] = diagram!.curves;
    const maxX = (c: typeof p0) => Math.max(...c.points.map((p) => p.x));
    const maxY = (c: typeof p0) => Math.max(...c.points.map((p) => p.y));
    expect(maxX(p1)).toBeGreaterThan(maxX(p0));
    expect(maxY(p1)).toBeGreaterThan(maxY(p0));
    expect(diagram!.points).toHaveLength(1);
  });
  it('a chart is a data chart; a template is the editor template', () => {
    expect(compileSpec(caseById('visitor-chart').spec).diagram!.chart!.series).toHaveLength(2);
    const tariff = compileSpec(caseById('tariff-template').spec).diagram!;
    expect(tariff.curves.length).toBe(buildFromTemplate('tariff-welfare').curves.length);
  });
  it('broken references are errors, not crashes', () => {
    const s = clone(caseById('demand-increase').spec);
    s.shifts[0].of = 'Dx';
    s.points.push({ a: 'D0', b: 'nothing', name: '', yTick: '', xTick: '', dot: false });
    const out = compileSpec(s);
    expect(out.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['shift.of', 'eq.ref']));
  });
});

describe('checks', () => {
  it('axes must be titled on the paper\'s sides', () => {
    const s = clone(caseById('demand-increase').spec);
    s.xAxis = { en: '', zh: '' };
    const out = evaluateReply(replyOf(s), { sides: ['en'], key: caseById('demand-increase').key })!;
    expect(out.issues.find((i) => i.code === 'axes.x')?.level).toBe('error');
  });
  it('curves must be named, and not twice the same', () => {
    const s = clone(caseById('demand-increase').spec);
    s.curves[1].label = '';
    s.shifts[0].label = 'D_0';
    const codes = evaluateReply(replyOf(s), { sides: ['en'], key: '' })!.issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['curve.unnamed', 'curve.duplicate']));
  });
  it('a gap called a surplus where demand exceeds supply fails', () => {
    const s = clone(caseById('rent-ceiling').spec);
    s.gaps[0].label = { en: 'surplus', zh: '過剩' };
    const out = evaluateReply(replyOf(s), { sides: ['en'], key: '' })!;
    expect(out.issues.find((i) => i.code === 'gap.kind')?.level).toBe('error');
  });
  it('a ceiling above equilibrium is a look, unless the key says it is ineffective', () => {
    const s = clone(caseById('rent-ceiling').spec);
    s.levels[0].side = 'above';
    s.gaps = [];
    expect(evaluateReply(replyOf(s), { sides: ['en'], key: '' })!.issues.map((i) => i.code)).toContain('level.nonbinding');
    expect(evaluateReply(replyOf(s), { sides: ['en'], key: 'The ceiling is ineffective.' })!.issues.map((i) => i.code)).not.toContain('level.nonbinding');
  });
});

describe('the key check: shifts drawn the way the answer key says', () => {
  it('reads English claims, nouns before the market, curve letters and shift words', () => {
    expect(keyClaims('As income rises, the demand for package tours increases.')).toEqual([expect.objectContaining({ market: 'demand', change: 'increase' })]);
    expect(keyClaims('There is an increase in supply.')).toEqual([expect.objectContaining({ market: 'supply', change: 'increase' })]);
    expect(keyClaims('D shifts to the left.')).toEqual([expect.objectContaining({ market: 'demand', change: 'decrease' })]);
    expect(keyClaims('The supply curve shifts upward by the tax.')).toEqual([expect.objectContaining({ market: 'supply', change: 'decrease' })]);
    expect(keyClaims('Short-run aggregate supply decreases.')).toEqual([expect.objectContaining({ market: 'sras', change: 'decrease' })]);
    expect(keyClaims('The PPC shifts outward.')).toEqual([expect.objectContaining({ market: 'ppc', change: 'increase' })]);
  });
  it('reads Chinese claims', () => {
    expect(keyClaims('對酒店房間的需求減少，需求曲線向左移。').map((c) => [c.market, c.change])).toEqual([
      ['demand', 'decrease'],
      ['demand', 'decrease'],
    ]);
    expect(keyClaims('供應增加')).toEqual([expect.objectContaining({ market: 'supply', change: 'increase' })]);
    expect(keyClaims('總需求上升')).toEqual([expect.objectContaining({ market: 'ad', change: 'increase' })]);
  });
  it('ignores what is not a curve move: quantity demanded, excess demand, negated sentences', () => {
    expect(keyClaims('The quantity demanded increases.')).toEqual([]);
    expect(keyClaims('There is an excess demand.')).toEqual([]);
    expect(keyClaims('Option B is wrong because demand would not increase.')).toEqual([]);
    expect(keyClaims('需求量增加。')).toEqual([]);
  });
  it('a diagram shifting demand left against "demand increases" fails', () => {
    const s = clone(caseById('demand-increase').spec);
    s.shifts[0].direction = 'left';
    const out = evaluateReply(replyOf(s), { sides: ['en'], key: caseById('demand-increase').key })!;
    expect(out.issues.find((i) => i.code === 'key.opposite')?.level).toBe('error');
  });
  it('a tax drawn as supply moving down fails', () => {
    const s = clone(caseById('unit-tax').spec);
    s.shifts[0].direction = 'down';
    s.shades = [];
    const out = evaluateReply(replyOf(s), { sides: ['en'], key: caseById('unit-tax').key })!;
    expect(out.issues.map((i) => i.code)).toContain('key.opposite');
  });
  it('covers template diagrams too (read from labels and geometry)', () => {
    const changes = diagramChanges(buildFromTemplate('demand-shift'));
    expect(changes.length).toBeGreaterThan(0);
    const way = changes[0].change;
    const say = way === 'increase' ? 'decreases' : 'increases';
    expect(checkAgainstKey(buildFromTemplate('demand-shift'), `Demand ${say}.`).map((i) => i.code)).toContain('key.opposite');
  });
  it('a key that names no move says nothing; a missing shift is a look', () => {
    const d = compileSpec(caseById('demand-increase').spec).diagram!;
    expect(checkAgainstKey(d, 'Price rises.')).toEqual([]);
    expect(checkAgainstKey(d, 'Demand increases and supply decreases.').map((i) => [i.code, i.level])).toContainEqual(['key.missing', 'look']);
  });
});

describe('parseSpec', () => {
  it('takes a fenced reply, fills what is missing and reports a bad enum as a look', () => {
    const out = parseSpec('```json\n{"kind":"curves","curves":[{"id":"D","role":"demmand","slope":"normal","place":"mid","label":"D"}]}\n```')!;
    expect(out.spec.curves[0].role).toBe('demand');
    expect(out.spec.shifts).toEqual([]);
    expect(out.issues[0]).toMatchObject({ level: 'look', code: 'spec.value' });
    expect(parseSpec('no json here')).toBeNull();
  });
  it('the schema requires every key (strict structured output)', () => {
    const props = Object.keys((DIAGRAM_SPEC_SCHEMA as { properties: object }).properties);
    expect((DIAGRAM_SPEC_SCHEMA as { required: string[] }).required).toEqual(props);
  });
});

describe('describeDiagram: a reference figure in words', () => {
  it('names the axes, the curves, the shift and the equilibria', () => {
    const text = describeDiagram(compileSpec(caseById('demand-increase').spec).diagram!);
    expect(text).toContain('x = "Quantity"');
    expect(text).toContain('D1 = D0 shifted right');
    expect(text).toContain('where D0 meets S');
  });
  it('a chart lists its figures', () => {
    expect(describeDiagram(compileSpec(caseById('visitor-chart').spec).diagram!)).toContain('All visitors');
  });
});

describe('generateDiagram', () => {
  it('one good reply → an ok block measured for the paper, one request', async () => {
    const { client, deps: d } = deps([replyOf(caseById('demand-increase').spec)]);
    const out = await generateDiagram(inputOf('demand-increase'), d, signal());
    expect(out.ok && out.status).toBe('ok');
    if (!out.ok) return;
    expect(out.block).toMatchObject({ kind: 'diagram' });
    expect(out.block!.heightPx).toBeGreaterThan(0);
    expect(out.spec.placement).toBe('answer');
    expect(client.requests).toHaveLength(1);
    expect(client.requests[0].schema).toBe(DIAGRAM_SPEC_SCHEMA);
    const payload = JSON.parse(client.requests[0].turns[0].content);
    expect(payload).toMatchObject({ task: 'diagram', languages: ['en', 'zh'] });
  });
  it('a reply against the key gets one repair turn listing the problem; the fixed one wins', async () => {
    const wrong = clone(caseById('demand-increase').spec);
    wrong.shifts[0].direction = 'left';
    const { client, deps: d } = deps([replyOf(wrong), replyOf(caseById('demand-increase').spec)]);
    const out = await generateDiagram(inputOf('demand-increase'), d, signal());
    expect(client.requests).toHaveLength(2);
    const repair = client.requests[1].turns;
    expect(repair).toHaveLength(3);
    expect(repair[2].content).toContain('The key says demand increases');
    expect(out.ok && out.status).toBe('ok');
    expect(out.ok && out.attempt).toBe(2);
  });
  it('still wrong after the repair → failed, no block', async () => {
    const wrong = clone(caseById('demand-increase').spec);
    wrong.shifts[0].direction = 'left';
    const { deps: d } = deps([replyOf(wrong)]);
    const out = await generateDiagram(inputOf('demand-increase'), d, signal());
    expect(out.ok && out.status).toBe('failed');
    expect(out.ok && out.block).toBeNull();
  });
  it('kind none → status none', async () => {
    const { deps: d } = deps([JSON.stringify({ kind: 'none', reason: 'A definition.' })]);
    const out = await generateDiagram({ question: 'Define opportunity cost.', key: 'The highest-valued option forgone.', sides: ['en'] }, d, signal());
    expect(out.ok && out.status).toBe('none');
  });
  it('a reference diagram is described in the payload; a picture goes only through completeWithImages', async () => {
    const reference = { diagram: compileSpec(caseById('unit-tax').spec).diagram!, image: { dataUrl: 'data:image/png;base64,AAAA' } };
    const plain = deps([replyOf(caseById('demand-increase').spec)]);
    const out = await generateDiagram({ ...inputOf('demand-increase'), reference }, plain.deps, signal());
    const payload = JSON.parse(plain.client.requests[0].turns[0].content);
    expect(payload.reference.description).toMatch(/S1 = S0 \+ t = S0 shifted up/);
    expect(payload.reference.image).toBe('not available');
    expect(out.ok && out.imageSkipped).toBe(true);

    const sent: unknown[] = [];
    const withImages = deps([], {
      completeWithImages: async (req, images) => {
        sent.push(...images);
        expect(JSON.parse(req.turns[0].content).reference.image).toBe('attached');
        return { text: replyOf(caseById('demand-increase').spec), finish: 'stop', dialect: 'gemini-jsonSchema', model: 'fake', ms: 1 };
      },
    });
    const out2 = await generateDiagram({ ...inputOf('demand-increase'), reference }, withImages.deps, signal());
    expect(sent).toEqual([reference.image]);
    expect(out2.ok && out2.imageSkipped).toBe(false);
    expect(withImages.client.requests).toHaveLength(0);
  });
  it('a provider error is returned, never thrown; a truncated reply is truncated', async () => {
    const { deps: d } = deps([new AiError(aiErrorInfo('quota', 'gemini'))]);
    const out = await generateDiagram(inputOf('demand-increase'), d, signal());
    expect(out.ok).toBe(false);
    expect(!out.ok && out.error.kind).toBe('quota');
    const cut = deps([{ text: '{', finish: 'length', dialect: 'gemini-jsonSchema', model: 'fake', ms: 1 }]);
    const out2 = await generateDiagram(inputOf('demand-increase'), cut.deps, signal());
    expect(!out2.ok && out2.error.kind).toBe('truncated');
  });
});
