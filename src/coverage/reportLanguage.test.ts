import { afterEach, describe, expect, it, vi } from 'vitest';
import { presetFor } from '@/ai/providers';
import type { CompletionRequest } from '@/ai/types';
import { isPaused, setPausedForTest } from '@/assist/paused';
import { coverageQuestions } from '@/assist/verbs/coverage';
import type { VerbContext } from '@/assist/types';
import { packBlocks } from '@/components/ai/CoverageReportSheets';
import { createParagraphBlock, createPart, createStructuredQuestion, createWorksheet } from '@/model/factories';
import { bi } from '@/model/text';
import type { Worksheet } from '@/model/types';
import { withFlow } from '@/test/fixtures';
import { scriptedClient } from '@/translate/testKit';
import { reportLanguage } from './language';
import { insights } from './insights';
import { gaps } from './report';
import { reportText, reportFileName } from './reportText';
import { coverageFromSaved, paperNumbers, setResult, titleIn } from './result';
import type { QuestionResult } from './types';

/** A paper of one structured question per text, each part worth 2 marks. */
function paperOf(title: string, texts: Array<[string, string]>, partWords = true): Worksheet {
  const questions = texts.map(([en, zh]) => {
    const q = createStructuredQuestion();
    q.blocks = [createParagraphBlock(bi(en, zh))];
    q.parts = [{ ...createPart(), blocks: [createParagraphBlock(partWords ? bi(en ? 'Explain.' : '', zh ? '解釋。' : '') : bi('(1)', ''))], marks: 2 }];
    return q;
  });
  return { ...withFlow(createWorksheet(), questions), title: bi(title, '') };
}

const EN = 'Explain how a rise in the price of pork affects the demand for beef in Hong Kong.';
const ZH = '試解釋豬肉價格上升如何影響香港牛肉的需求。';
const qs = (worksheet: Worksheet) => coverageQuestions({ worksheet, scope: { kind: 'paper' } });

describe('the report language follows the paper (k-0489)', () => {
  it('a Chinese paper reads Chinese and an English one English, whatever the view', () => {
    expect(reportLanguage([qs(paperOf('P', [['', ZH], ['', ZH]]))], 'en', 'en')).toBe('zh');
    expect(reportLanguage([qs(paperOf('P', [[EN, ''], [EN, '']]))], 'zh', 'zh')).toBe('en');
  });

  it('a few English terms in a Chinese paper do not make it English', () => {
    expect(reportLanguage([qs(paperOf('P', [['GDP', ZH], ['CPI', ZH]]))], 'en', 'en')).toBe('zh');
  });

  it('a Chinese paper typed into the English slots is still Chinese', () => {
    expect(reportLanguage([qs(paperOf('P', [[ZH, '']]))], 'en', 'en')).toBe('zh');
  });

  it('a translated paper follows the view; the bilingual view leads with English (topicNamesFor)', () => {
    const both = [qs(paperOf('P', [[EN, ZH]]))];
    expect(reportLanguage(both, 'zh', 'en')).toBe('zh');
    expect(reportLanguage(both, 'en', 'zh')).toBe('en');
    expect(reportLanguage(both, 'bilingual', 'zh')).toBe('en');
    expect(reportLanguage([qs(paperOf('P', [['', ZH]]))], 'bilingual', 'en')).toBe('zh');
  });

  it('words in neither language fall back to the app', () => {
    expect(reportLanguage([qs(paperOf('P', [['2024 40', '']], false))], 'en', 'zh')).toBe('zh');
  });

  it('the AI is asked for its reasons in the paper language, and the result says which', async () => {
    vi.resetModules();
    const client = scriptedClient([
      (req: CompletionRequest) => {
        const { questions } = JSON.parse(req.turns[req.turns.length - 1].content) as { questions: Array<{ units: Array<{ key: string }> }> };
        const items = questions.flatMap((q) => q.units.map((u) => ({ key: u.key, code: 'C.ped', weight: 'main', band: 'apply', conf: 'high', why: '因為。', outside: '' })));
        return JSON.stringify({ items });
      },
    ]);
    vi.doMock('@/translate/deps', () => ({
      createRunDeps: async () => ({ ok: true, deps: { client, preset: { ...presetFor('openai'), concurrency: 1 }, model: 'fake' } }),
    }));
    const { coverageVerb, coverageSetVerb } = await import('@/assist/verbs/coverage');
    const zhPaper = { ...paperOf('', [['', ZH]]), title: bi('', '模擬試卷') };
    const ctx: VerbContext = { worksheet: zhPaper, mode: { language: 'en', version: 'student' }, scope: { kind: 'paper' }, scopeLabel: 'Whole paper' };
    const outcome = await coverageVerb.run(ctx, { signal: new AbortController().signal, progress: () => {} });
    expect(client.requests[0].system).toMatch(/Traditional Chinese/);
    expect(outcome.kind).toBe('report');
    if (outcome.kind !== 'report') return;
    expect(outcome.record).toMatchObject({ v: 1, language: 'zh', title: '模擬試卷', scope: 'paper' });
    expect(coverageFromSaved(outcome.record).language).toBe('zh');

    // The whole set: hidden without a set, then one report over both papers.
    expect(coverageSetVerb.available(ctx)).toBeNull();
    const p1 = paperOf('Paper 1', [[EN, ''], [EN, '']]);
    const p2 = paperOf('Paper 2', [[EN, '']]);
    const setCtx: VerbContext = { ...ctx, worksheet: p1, paperSet: { name: 'S6 Mock', papers: [p1, p2] } };
    expect(coverageSetVerb.available(setCtx)).toMatchObject({ count: 2 });
    const progress: number[] = [];
    const set = await coverageSetVerb.run(setCtx, { signal: new AbortController().signal, progress: (done) => progress.push(done) });
    expect(set.kind).toBe('report');
    if (set.kind !== 'report') return;
    const coverage = coverageFromSaved(set.record);
    expect(coverage).toMatchObject({ language: 'en', title: 'S6 Mock', scope: 'set', id: set.record.id });
    expect(set.record.runs.map((run) => [run.worksheetId, run.paper])).toEqual([[p1.id, 1], [p2.id, 2]]);
    expect(coverage.papers?.map((p) => [p.paper, p.title, p.report.questions])).toEqual([[1, 'Paper 1', 2], [2, 'Paper 2', 1]]);
    expect(coverage.report.questions).toBe(3);
    expect(coverage.report.units.map((u) => u.where.paper)).toEqual([1, 1, 2]);
    expect(Math.max(...progress)).toBe(3);
    expect(set.summary).toMatch(/^Whole set: 1 of 49 key points/);
    expect(coverageFromSaved(set.record, 'EL1').papers).toHaveLength(2);
    vi.doUnmock('@/translate/deps');
  });
});

describe('a whole set’s report (k-0489)', () => {
  const result = (number: string, code: string): QuestionResult => ({
    questionId: `Q${number}`,
    number,
    ok: true,
    units: [{ key: `q${number}`, label: '', marks: 2, outside: '', picks: [{ code, w: 2, band: 'apply', conf: 'high', why: '' }] }],
  });
  const base = { language: 'en' as const, title: 'Mock', scope: 'set' as const, at: '2026-11-22T00:00:00Z', pageSize: 'A4' as const };

  it('combines the papers, counting a key point once and saying which paper each place is on', () => {
    const out = setResult(base, [
      { paper: 1, title: 'P1', results: [result('1', 'C.ped'), result('2', 'B.factors')], sent: 2 },
      { paper: 2, title: 'P2', results: [result('1', 'C.ped')], sent: 1 },
    ]);
    expect(out.report.breadth.keyPoints.hit).toBe(2);
    expect(out.report.marks.total).toBe(6);
    const ped = out.report.topics.flatMap((t) => t.keyPoints).find((k) => k.code === 'C.ped')!;
    expect(ped.where).toEqual([{ paper: 1, at: '1' }, { paper: 2, at: '1' }]);
    expect(out.papers!.map((p) => p.report.breadth.keyPoints.hit)).toEqual([2, 1]);
    expect(out.papers![1].report.units[0].where).toEqual({ at: '1' });
    expect(gaps(out.report).flatMap((g) => g.keyPoints).length).toBe(out.report.breadth.keyPoints.of - 2);
  });

  it('numbers the papers by what they are, else by place', () => {
    expect(paperNumbers(['paper2', 'paper1'])).toEqual([2, 1]);
    expect(paperNumbers(['paper2', 'paper2'])).toEqual([1, 2]);
    expect(paperNumbers([undefined, 'paper2'])).toEqual([1, 2]);
  });

  it('names and places read in the report language', () => {
    expect(reportText('zh').where({ paper: 2, at: '3(b)' })).toBe('卷二第 3(b) 題');
    expect(reportText('en').where({ paper: 2, at: '3(b)' })).toBe('P2 Q3(b)');
    expect(reportText('en').where({ at: '7' })).toBe('Q7');
    expect(reportText('zh').date(new Date(2026, 10, 22))).toBe('2026年11月22日');
    expect(reportFileName('Mock: P1/P2', 'en')).toBe('Mock- P1-P2 - Syllabus coverage.pdf');
    expect(titleIn({ title: bi('Mock', '模擬試') }, 'zh')).toBe('模擬試');
    expect(titleIn({ name: 'File', title: bi('Mock', '模擬試') }, 'zh')).toBe('File');
  });

  it('every printed word exists in both languages', () => {
    expect(Object.keys(reportText('zh')).sort()).toEqual(Object.keys(reportText('en')).sort());
  });
});

describe('printed report pagination (k-0489)', () => {
  const heads = { papers: 10, topics: 20 };
  it('repeats a table header on each sheet it runs onto, and keeps a heading with what follows', () => {
    const blocks = [{ keepWithNext: true }, { table: 'topics' as const }, { table: 'topics' as const }, { table: 'topics' as const }, {}];
    const pages = packBlocks(blocks, [30, 40, 40, 40, 10], heads, 140);
    expect(pages).toEqual([
      [{ block: 0 }, { head: 'topics' }, { block: 1 }, { block: 2 }],
      [{ head: 'topics' }, { block: 3 }, { block: 4 }],
    ]);
  });

  it('moves a heading that would end a sheet to the next one', () => {
    const pages = packBlocks([{}, { keepWithNext: true }, {}], [80, 10, 30], heads, 100);
    expect(pages).toEqual([[{ block: 0 }], [{ block: 1 }, { block: 2 }]]);
  });

  it('starts a major section on a fresh sheet (k-0489 v2)', () => {
    expect(packBlocks([{}, { breakBefore: true }, {}], [10, 10, 10], heads, 100)).toEqual([[{ block: 0 }], [{ block: 1 }, { block: 2 }]]);
    expect(packBlocks([{ breakBefore: true }], [10], heads, 100)).toEqual([[{ block: 0 }]]);
    // Soft: only when less than the share is left.
    expect(packBlocks([{}, { breakUnless: 0.4 }], [50, 10], heads, 100)).toEqual([[{ block: 0 }, { block: 1 }]]);
    expect(packBlocks([{}, { breakUnless: 0.4 }], [70, 10], heads, 100)).toEqual([[{ block: 0 }], [{ block: 1 }]]);
  });

  it('puts a block taller than a sheet on its own', () => {
    expect(packBlocks([{}, {}, {}], [10, 500, 10], heads, 100)).toEqual([[{ block: 0 }], [{ block: 1 }], [{ block: 2 }]]);
  });
});

describe('pausing check.syllabus pauses the whole set too', () => {
  afterEach(() => setPausedForTest(null));
  it('pauses the family, not the siblings', () => {
    setPausedForTest(['check.syllabus']);
    expect(isPaused('check.syllabus.set')).toBe(true);
    expect(isPaused('check.syllabus.saved')).toBe(true);
    expect(isPaused('check.terms')).toBe(false);
    expect(isPaused('check')).toBe(false);
    setPausedForTest([]);
    expect(isPaused('check.syllabus.set')).toBe(false);
  });
});

describe('the report’s summary (k-0489 v2)', () => {
  const tagged = (number: string, code: string, band: 'know' | 'apply' | 'evaluate', marks = 2): QuestionResult => ({
    questionId: number,
    number,
    ok: true,
    units: [{ key: number, label: '', marks, picks: [{ code, w: 2, band, conf: 'high', why: '' }], outside: '' }],
  });

  it('names the best-covered and untested sections, the top skill and the biggest gaps', () => {
    const report = setResult({ language: 'en', title: 'T', scope: 'paper', at: '2026-11-22T00:00:00Z', pageSize: 'A4' }, [
      { paper: 1, title: 'P', sent: 3, results: [tagged('1', 'C.ped', 'apply', 4), tagged('2', 'C.pes', 'know'), tagged('3', 'A.scarcity', 'apply')] },
    ]).report;
    const facts = insights(report);
    expect(facts.sections.map((s) => s.topic.code).slice(0, 3)).toEqual(['A', 'B', 'C']);
    expect(facts.best[0].topic.code).toMatch(/^[AC]$/);
    expect(facts.untested.map((s) => s.topic.code)).toContain('B');
    expect(facts.untested.map((s) => s.topic.code)).not.toContain('C');
    expect(facts.topSkill).toBe('apply');
    expect(facts.skills!.apply).toBeCloseTo(6 / 8);
    expect(facts.biggestGaps).toHaveLength(5);
    const hours = facts.biggestGaps.map((g) => g.keyPoint.hours);
    expect([...hours].sort((a, b) => b - a)).toEqual(hours);
    expect(facts.gapCount).toBe(gaps(report).reduce((n, g) => n + g.keyPoints.length, 0));
  });
});

describe('past coverage reports (k-0489 v2)', () => {
  it('is offered only with a saved check of this paper, and opens the newest without the AI', async () => {
    const { coverageSavedVerb } = await import('@/assist/verbs/coverage');
    const { coverageRecord } = await import('./result');
    const { withCoverageReport } = await import('@/model/coverageReports');
    const ws = paperOf('Mock', [[EN, '']]);
    const ctx: VerbContext = { worksheet: ws, mode: { language: 'en', version: 'student' }, scope: { kind: 'paper' }, scopeLabel: 'Whole paper' };
    expect(coverageSavedVerb.available(ctx)).toBeNull();
    expect(coverageSavedVerb.needsKey).toBe(false);
    const make = (id: string, at: string) =>
      coverageRecord({ id, language: 'en', title: 'Mock', scope: 'paper', at, pageSize: 'A4' }, [{ worksheetId: ws.id, title: 'Mock', sent: 1, fingerprint: 'x', results: [] }]);
    const saved = withCoverageReport(withCoverageReport(ws, make('old', '2026-11-01T12:00:00Z')), make('new', '2026-11-20T12:00:00Z'));
    const withSaved = { ...ctx, worksheet: saved };
    expect(coverageSavedVerb.available(withSaved)).toMatchObject({ count: 2, unit: 'reports' });
    const outcome = await coverageSavedVerb.run(withSaved, { signal: new AbortController().signal, progress: () => {} });
    expect(outcome).toMatchObject({ kind: 'report', fresh: false, record: { id: 'new' } });
    if (outcome.kind === 'report') expect(outcome.summary).toMatch(/^Saved report, 20 Nov 2026: 0 of 49 key points/);
  });
});
