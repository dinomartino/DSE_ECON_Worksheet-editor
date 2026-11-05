import { describe, expect, it, vi } from 'vitest';
import { presetFor } from '@/ai/providers';
import { AiError, type CompletionRequest } from '@/ai/types';
import { coverageQuestions } from '@/assist/verbs/coverage';
import { openScratch, type ScratchRun } from '@/platform/scratch';
import { qualityWorksheet } from '@/quality/testKit';
import { scriptedClient } from '@/translate/testKit';
import { buildPayload, COVERAGE_SCHEMA, leadSide, parsePicks } from './prompt';
import { COVERAGE_MARKER, syllabusList } from './promptText';
import { buildReport, marksText, percent } from './report';
import { chunkQuestions, fileName, runCoverage, validatePicks } from './run';
import type { CoverageDeps, QuestionResult } from './types';

const preset = { ...presetFor('openai'), concurrency: 1 };
const deps = (client: CoverageDeps['client']): CoverageDeps => ({ client, preset, model: 'fake' });
const paper = () => coverageQuestions({ worksheet: qualityWorksheet(), scope: { kind: 'paper' } });
const payload = (req: CompletionRequest) =>
  JSON.parse(req.turns[req.turns.length - 1].content) as ReturnType<typeof buildPayload>;
const item = (key: string, code: string, extra: Record<string, string> = {}) => ({
  key, code, weight: 'main', band: 'apply', conf: 'high', why: 'Because.', outside: '', ...extra,
});
const reply = (items: object[]) => JSON.stringify({ items });

/** A scratch run that records what was written and whether it was disposed. */
async function watchedScratch() {
  const inner = await openScratch('coverage-test');
  const writes: string[] = [];
  let disposed = 0;
  const run: ScratchRun = {
    medium: inner.medium,
    write: async (name, text) => {
      writes.push(name);
      await inner.write(name, text);
    },
    readAll: () => inner.readAll(),
    dispose: async () => {
      disposed += 1;
      await inner.dispose();
    },
  };
  return { run, writes, disposed: () => disposed };
}

describe('marked units', () => {
  it('an MC question is one unit worth its marks; parts and marked sub-parts are their own units', () => {
    const qs = paper();
    // Q4 is blank and is not sent.
    expect(qs.map((q) => q.number)).toEqual(['1', '2', '3']);
    expect(qs[0].units).toEqual([{ key: 'q1', label: '', marks: 1 }]);
    expect(qs[2].units.map((u) => [u.key, u.label, u.marks])).toEqual([
      ['q3.(a)', '(a)', 1], ['q3.(b)', '(b)', 4], ['q3.(c)(i)', '(c)(i)', 1], ['q3.(c)(ii)', '(c)(ii)', 2],
    ]);
  });

  it('sub-parts that share one marks label are one unit with their part', () => {
    const ws = qualityWorksheet();
    const q3 = ws.questions[2] as Extract<typeof ws.questions[number], { type: 'structured' }>;
    const c = q3.parts[2];
    c.marks = 3;
    for (const sub of c.subParts ?? []) delete sub.marks;
    const qs = coverageQuestions({ worksheet: ws, scope: { kind: 'paper' } });
    expect(qs[2].units.map((u) => [u.key, u.marks])).toEqual([['q3.(a)', 1], ['q3.(b)', 4], ['q3.(c)', 3]]);
  });
});

describe('the request', () => {
  it('names the tagger, carries the whole code list and one language side', () => {
    const qs = paper();
    expect(syllabusList()).toContain('C.ped#');
    expect(syllabusList().split('\n').filter((l) => l.includes('#') && !l.startsWith('#'))).toHaveLength(130);
    expect(leadSide(qs)).toBe('en');
    const body = buildPayload(qs, 'en');
    expect(body.questions[0].entries[0]).toEqual({ role: 'stem', text: 'Which of the following is not a factor of production?' });
    expect(body.questions[0].entries.find((e) => 'keyed' in e)).toMatchObject({ text: 'Money', keyed: true });
    expect(body.questions[2].units).toContainEqual({ key: 'q3.(c)(ii)', label: '(c)(ii)', marks: 2 });
    // Q2 has no Chinese: an entry with nothing on the lead side falls back to the other.
    expect(buildPayload(qs, 'zh').questions[1].entries[0].text).toMatch(/demand curve for beef/);
    expect(Object.keys((COVERAGE_SCHEMA.properties as { items: { items: { properties: object } } }).items.items.properties))
      .toEqual(['key', 'code', 'weight', 'band', 'conf', 'why', 'outside']);
  });

  it('reads a reply defensively', () => {
    expect(parsePicks('nope')).toBeNull();
    expect(parsePicks('{"items": 3}')).toBeNull();
    expect(parsePicks('```json\n{"items":[{"key":"q1","code":"A.scarcity","weight":"x","band":"y","conf":"z"}, {"code":"B"}]}\n```'))
      .toEqual([{ key: 'q1', code: 'A.scarcity', weight: 'also', band: 'apply', conf: 'low', why: '', outside: '' }]);
  });

  it('validates: unknown codes and keys dropped, one main first, at most three, repeats once', () => {
    const q1 = paper()[0];
    const units = validatePicks(
      [
        { ...item('q1', 'A.scarcity#scarcity'), weight: 'also' },
        item('q1', 'NOT.a-code'),
        item('Q1', 'B.factors'),
        item('q1', 'B.factors'),
        { ...item('q1', 'A.scarcity'), weight: 'also' },
        { ...item('q1', 'C.ped'), weight: 'also' },
        item('q9', 'C.ped'),
      ].map((x) => parsePicks(reply([x]))![0]),
      q1,
    );
    expect(units).toHaveLength(1);
    expect(units[0].picks.map((p) => [p.code, p.w])).toEqual([['B.factors', 2], ['A.scarcity#scarcity', 1], ['A.scarcity', 1]]);
  });

  it('chunks MC questions more densely than structured ones', () => {
    const qs = paper();
    const many = Array.from({ length: 13 }, (_, i) => ({ ...qs[0], key: `q${i + 1}` }));
    expect(chunkQuestions(many).map((c) => c.length)).toEqual([12, 1]);
    expect(chunkQuestions([...many.slice(0, 7), qs[2], qs[2]]).map((c) => c.length)).toEqual([7, 2]);
  });
});

describe('the run and its temporary files', () => {
  it('writes one file per question as results come back, reads them back in print order, and leaves disposal to the caller', async () => {
    const client = scriptedClient([
      (req) => {
        expect(req.system).toContain(COVERAGE_MARKER);
        return reply(payload(req).questions.flatMap((q) => q.units.map((u) => item(u.key, q.key === 'q3' ? 'C.ped#revenue' : 'B.factors'))));
      },
    ]);
    const scratch = await watchedScratch();
    const out = await runCoverage(paper(), deps(client), scratch.run, { side: 'en', whyLanguage: 'en', signal: new AbortController().signal });
    expect(scratch.writes).toEqual(['q001.json', 'q002.json', 'q003.json']);
    expect(out.results.map((r) => [r.number, r.ok])).toEqual([['1', true], ['2', true], ['3', true]]);
    expect(out.results[2].units.every((u) => u.picks[0].code === 'C.ped#revenue')).toBe(true);
    expect(scratch.disposed()).toBe(0);
    await scratch.run.dispose();
    expect(await scratch.run.readAll()).toEqual([]);
  });

  it('a failed request marks its questions not analysed and the run goes on; a fatal one stops it', async () => {
    const transport = new AiError({ kind: 'network', provider: 'openai', message: 'down', fatal: false, actions: [] });
    const qs = paper();
    const many = [...Array.from({ length: 6 }, (_, i) => ({ ...qs[2], key: `q${i + 1}`, question: { ...qs[2].question, questionId: `S${i}` } })), qs[0]];
    const scratch = await watchedScratch();
    const out = await runCoverage(many, deps(scriptedClient([transport, reply([item('q1', 'A.scarcity')])])), scratch.run, {
      side: 'en', whyLanguage: 'en', signal: new AbortController().signal,
    });
    expect(out.results.filter((r) => !r.ok)).toHaveLength(6);
    expect(out.results.filter((r) => r.ok)).toHaveLength(1);

    const bad = new AiError({ kind: 'badKey', provider: 'openai', message: 'bad key', fatal: true, actions: [] });
    const stopped = await runCoverage(paper(), deps(scriptedClient([bad])), (await watchedScratch()).run, {
      side: 'en', whyLanguage: 'en', signal: new AbortController().signal,
    });
    expect(stopped.fatal?.kind).toBe('badKey');
    expect(stopped.results).toEqual([]);
  });

  it('names files so they sort in print order', () => {
    expect([fileName(9), fileName(0), fileName(99)].sort()).toEqual(['q001.json', 'q010.json', 'q100.json']);
  });
});

describe('the report', () => {
  const result = (number: string, units: Array<[string, number, Array<[string, 1 | 2, string?]>]>, ok = true): QuestionResult => ({
    questionId: `Q${number}`,
    number,
    ok,
    units: units.map(([label, marks, picks]) => ({
      key: `q${number}${label}`,
      label,
      marks,
      outside: '',
      picks: picks.map(([code, w, band]) => ({ code, w, band: (band ?? 'apply') as 'apply', conf: 'high' as const, why: '' })),
    })),
  });

  it('counts breadth by key points, points and lesson hours over the Compulsory Part, and splits marks 2 : 1', () => {
    const report = buildReport(
      [
        result('1', [['', 1, [['C.ped#revenue', 2]]]]),
        result('2', [['(a)', 3, [['I.fiscal', 2, 'evaluate'], ['G.equilibrium', 1, 'evaluate']]], ['(b)', 2, []]]),
        result('3', [['', 1, []]], false),
      ],
      4,
    );
    expect(report.breadth.keyPoints).toEqual({ hit: 3, of: 49 });
    expect(report.breadth.points).toEqual({ hit: 1, of: 119 });
    expect(report.breadth.hours.of).toBe(194);
    const c = report.topics.find((t) => t.code === 'C')!;
    const ped = c.keyPoints.find((kp) => kp.code === 'C.ped')!;
    expect(ped.hit).toBe(true);
    expect(ped.points.map((p) => p.code)).toEqual(['C.ped#revenue']);
    expect(ped.where).toEqual(['1']);
    const i = report.topics.find((t) => t.code === 'I')!;
    expect(i.marks).toBeCloseTo(2, 9);
    expect(i.bands.evaluate).toBeCloseTo(2, 9);
    expect(report.topics.find((t) => t.code === 'G')!.marks).toBeCloseTo(1, 9);
    expect(report.marks).toEqual({ total: 7, untagged: 3 });
    expect(report.missing).toBe(2);
    expect(report.elective).toEqual({ found: [], counted: null });
    expect(report.topics.some((t) => t.elective)).toBe(false);
    const hours = ['C.ped', 'I.fiscal', 'G.equilibrium'].reduce(
      (n, code) => n + report.topics.flatMap((t) => t.keyPoints).find((kp) => kp.code === code)!.hours, 0);
    expect(report.breadth.hours.hit).toBeCloseTo(hours, 9);
    expect(c.hoursShare).toBeCloseTo(32 / 194, 9);
  });

  it('counts one Elective Part: the one with more marks, or the one chosen', () => {
    const results = [
      result('1', [['', 2, [['EL1.pricing', 2]]]]),
      result('2', [['', 5, [['EL2.growth', 2]]]]),
    ];
    const elective = buildReport(results, 2);
    expect(elective.elective).toEqual({ found: ['EL1', 'EL2'], counted: 'EL2' });
    expect(elective.breadth.keyPoints.of).toBe(51);
    expect(elective.breadth.hours.of).toBe(218);
    expect(elective.topics.find((t) => t.code === 'EL1')?.counted).toBe(false);
    const chosen = buildReport(results, 2, 'EL1');
    expect(chosen.elective.counted).toBe('EL1');
    expect(chosen.breadth.keyPoints.hit).toBe(1);
  });

  it('formats without false precision', () => {
    expect(marksText(2 / 3)).toBe('0.7');
    expect(marksText(2)).toBe('2');
    expect(percent(0.634)).toBe('63%');
    expect(percent(null)).toBe('—');
  });
});

describe('the verb', () => {
  it('builds the report from the temporary files and deletes them, even when the run throws', async () => {
    vi.resetModules();
    const disposed: string[] = [];
    vi.doMock('@/platform/scratch', async (orig) => {
      const real = await orig<typeof import('@/platform/scratch')>();
      return {
        ...real,
        openScratch: async (job: string) => {
          const run = await real.openScratch(job);
          return { ...run, dispose: async () => { disposed.push(job); await run.dispose(); } };
        },
      };
    });
    const client = scriptedClient([(req) => reply(payload(req).questions.flatMap((q) => q.units.map((u) => item(u.key, 'B.factors'))))]);
    vi.doMock('@/translate/deps', () => ({
      createRunDeps: async () => ({ ok: true, deps: { client, preset, model: 'fake' } }),
    }));
    const { coverageVerb } = await import('@/assist/verbs/coverage');
    const ctx = { worksheet: qualityWorksheet(), mode: {} as never, scope: { kind: 'paper' } as const, scopeLabel: 'Whole paper' };
    const outcome = await coverageVerb.run(ctx, { signal: new AbortController().signal, progress: () => {} });
    expect(outcome.kind).toBe('report');
    if (outcome.kind !== 'report') return;
    expect(outcome.report.topics.find((t) => t.code === 'B')!.keyPoints.find((kp) => kp.code === 'B.factors')!.hit).toBe(true);
    expect(outcome.summary).toMatch(/1 of 49 key points/);
    expect(disposed).toEqual(['coverage']);

    client.complete = async () => { throw new Error('boom'); };
    await expect(coverageVerb.run(ctx, { signal: new AbortController().signal, progress: () => {} })).resolves.toBeDefined();
    expect(disposed).toEqual(['coverage', 'coverage']);
    vi.doUnmock('@/platform/scratch');
    vi.doUnmock('@/translate/deps');
  });
});
