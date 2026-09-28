import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import { AiError, type CompletionResult } from '@/ai/types';
import { scriptedClient } from '@/translate/testKit';
import { deterministicFindings } from './checks';
import { anchorText, qualityQuestions, runsText } from './collect';
import { FINDINGS_SCHEMA, PROMPT_VERSION, parseFindings } from './prompt';
import { QUALITY_MARKER } from './promptText';
import { chunkQuestions, runQuality, validateFindings } from './run';
import { findingsReply, payloadOf, qualityWorksheet } from './testKit';
import type { QualityDeps } from './types';

const preset = { ...presetFor('openai'), concurrency: 1 };
const deps = (client: QualityDeps['client']): QualityDeps => ({ client, preset, model: 'fake' });
const paper = () => qualityQuestions(qualityWorksheet(), { kind: 'paper' });

describe('collecting questions', () => {
  it('reads every question in print order through the registry, with anchors and targets', () => {
    const ws = qualityWorksheet();
    const questions = qualityQuestions(ws, { kind: 'paper' });
    expect(questions.map((q) => q.where)).toEqual(['Question 1', 'Question 2', 'Question 3', 'Question 4']);
    const q1 = questions[0];
    expect(q1.format).toBe('multiple choice');
    expect(q1.anchors.map((a) => a.ref)).toEqual(['stem', 'A', 'B', 'C', 'D']);
    expect(q1.anchors.find((a) => a.keyed)?.ref).toBe('C');
    expect(q1.anchors[0].target).toEqual({ kind: 'blockText', blockId: ws.questions[0].blocks[0].id });
    expect(q1.anchors[3].target).toEqual({ kind: 'mcqOption', questionId: 'Q1', optionId: 'Q1o2' });
    const q3 = questions[2];
    expect(q3.anchors.map((a) => [a.ref, a.marks, a.marksTotal])).toEqual([
      ['stem', undefined, undefined], ['(a)', 1, undefined], ['(b)', 4, undefined],
      ['(c)', 3, true], ['(c)(i)', 1, undefined], ['(c)(ii)', 2, undefined],
    ]);
  });

  it('narrows to the scope: questions, and a text path inside one', () => {
    const ws = qualityWorksheet();
    expect(qualityQuestions(ws, { kind: 'questions', ids: ['Q3', 'Q1'] }).map((q) => q.questionId)).toEqual(['Q1', 'Q3']);
    const optionPath = 'q:Q2/option:Q2o1/text';
    expect(qualityQuestions(ws, { kind: 'paths', paths: [optionPath] }).map((q) => q.questionId)).toEqual(['Q2']);
  });

  it('keeps bold and underline as tags and lays a table out in rows', () => {
    expect(runsText([{ text: 'Which is ' }, { text: 'NOT', bold: true }, { text: ' a ' }, { text: 'cost', underline: true }]))
      .toBe('Which is <b>NOT</b> a <u>cost</u>');
    const stem = paper()[2].anchors[0];
    expect(anchorText(stem, 'en')).toBe('The table shows the price of a good.\n| Year | Price |\n| 2024 | 40 |');
    expect(anchorText(stem, 'zh')).toContain('| 年份 | 價格 |');
  });
});

describe('deterministic checks', () => {
  it('flags a scheme that totals differently from the printed marks, and a statement that is not there', () => {
    const [, q2, q3] = paper();
    expect(deterministicFindings(q3)).toEqual([expect.objectContaining({
      issue: 'schemeMarks', severity: 'fix', from: 'check', where: 'Question 3 (b)',
      message: 'The marking scheme awards 3 marks, but the paper prints 4 marks.',
    })]);
    expect(deterministicFindings(q2)).toEqual([expect.objectContaining({
      issue: 'statementRange', where: 'Question 2 · Option C',
      message: 'This option names statement (4), but the question has only 3.',
    })]);
  });

  it('run without a call when every question is blank, and still report the checks', async () => {
    const client = scriptedClient([findingsReply([])]);
    const blankOnly = paper().slice(3);
    const outcome = await runQuality(blankOnly, deps(client), new AbortController().signal);
    expect(client.requests).toHaveLength(0);
    expect(outcome).toMatchObject({ findings: [], total: 0, reviewed: 0, stopped: false });
  });
});

describe('the request', () => {
  it('sends whole questions with request-local keys, marks and the key, never app ids', async () => {
    const client = scriptedClient([findingsReply([])]);
    await runQuality(paper(), deps(client), new AbortController().signal);
    expect(client.requests).toHaveLength(1);
    const req = client.requests[0];
    expect(req.system).toContain(QUALITY_MARKER);
    expect(req.schema).toBe(FINDINGS_SCHEMA);
    const payload = payloadOf(req);
    // The blank Q4 costs nothing.
    expect(payload.questions.map((q) => q.key)).toEqual(['q1', 'q2', 'q3']);
    expect(payload.questions[0].entries.find((e) => e.keyed)).toMatchObject({ key: 'q1.C', en: 'Money', zh: '貨幣' });
    expect(payload.questions[2].entries.find((e) => e.key === 'q3.(c)')).toMatchObject({ marks: 3, marksTotal: true });
    expect(req.turns.at(-1)!.content).not.toMatch(/Q1o|Q3a|W1/);
    expect(PROMPT_VERSION).toMatch(/^e4\./);
  });

  it('chunks by whole question under the question budget', () => {
    const q = paper()[0];
    const items = Array.from({ length: 13 }, (_, i) => ({ question: { ...q, questionId: `x${i}` }, key: `q${i + 1}` }));
    expect(chunkQuestions(items).map((chunk) => chunk.length)).toEqual([6, 6, 1]);
  });
});

describe('findings from the model', () => {
  it('anchors each finding to its entry, drops what anchors to nothing, and sorts checks first', async () => {
    const client = scriptedClient([findingsReply([
      { key: 'q1.stem', issue: 'negativeStem', text: '“not” is not in bold.', suggestion: 'Which of the following is NOT …' },
      { key: 'q1.C', issue: 'wrongKey', severity: 'fix', text: 'Money is not a factor, so C is right.' },
      { key: 'q1.E', text: 'Option E is odd.' },
      { key: 'q9', text: 'No such question.' },
      { key: 'q3 (b)', issue: 'bilingual', severity: 'fix', text: 'rose vs 下跌.' },
      { key: 'q3.(b)', issue: 'bilingual', text: 'Duplicate.' },
      { key: 'q3.(a)', issue: 'wrongKey', text: 'No options in a structured question.' },
      { key: 'q3.(c)', issue: 'commandMarks', text: 'Fine.' },
      { key: 'q2', issue: 'combination', text: 'Whole question.' },
    ])]);
    const outcome = await runQuality(paper(), deps(client), new AbortController().signal);
    expect(outcome.findings.map((f) => [f.where, f.issue, f.from])).toEqual([
      ['Question 1', 'negativeStem', 'model'],
      ['Question 1 · Option C', 'wrongKey', 'model'],
      ['Question 2', 'combination', 'model'],
      ['Question 2 · Option C', 'statementRange', 'check'],
      ['Question 3 (b)', 'schemeMarks', 'check'],
      ['Question 3 (b)', 'bilingual', 'model'],
      ['Question 3 (c)', 'commandMarks', 'model'],
    ]);
    expect(outcome.findings[0].suggestion).toBe('Which of the following is NOT …');
    expect(outcome.findings[1].severity).toBe('fix');
    expect(outcome).toMatchObject({ total: 3, reviewed: 3, failed: 0, stopped: false });
  });

  it('an empty list is a clean paper', async () => {
    const outcome = await runQuality(paper(), deps(scriptedClient([findingsReply([])])), new AbortController().signal);
    expect(outcome.findings.filter((f) => f.from === 'model')).toEqual([]);
    expect(outcome.reviewed).toBe(3);
  });

  it('reads a bare {key, text} reply and caps a question at four, fix first', () => {
    expect(parseFindings('```json\n{"items":[{"key":"q1","text":"Hm."}]}\n```')).toEqual([
      { key: 'q1', issue: 'other', severity: 'look', text: 'Hm.', suggestion: '' },
    ]);
    expect(parseFindings('no json')).toBeNull();
    const [q1] = paper();
    const raw = ['stem', 'A', 'B', 'C', 'D'].map((ref, i) => ({
      key: `q1.${ref}`, issue: 'other' as const, severity: i === 4 ? 'fix' as const : 'look' as const, text: ref, suggestion: '',
    }));
    const kept = validateFindings(raw, [{ question: q1, key: 'q1' }]);
    expect(kept.map((f) => f.message)).toEqual(['D', 'stem', 'A', 'B']);
  });

  it('retries an unreadable reply once, then splits the chunk', async () => {
    const client = scriptedClient(['nonsense', 'still nonsense', findingsReply([{ key: 'q1.A', text: 'x' }]), findingsReply([])]);
    const outcome = await runQuality(paper(), deps(client), new AbortController().signal);
    expect(client.requests.map((r) => payloadOf(r).questions.length)).toEqual([3, 3, 2, 1]);
    expect(outcome.reviewed).toBe(3);
    expect(outcome.findings.some((f) => f.where === 'Question 1 · Option A')).toBe(true);
  });

  it('a cut-off reply on one question fails that question only', async () => {
    const cut: CompletionResult = { text: '{"items":[', finish: 'length', dialect: 'openai-jsonSchema', model: 'fake', ms: 1 };
    const client = scriptedClient([(req) => (payloadOf(req).questions.some((q) => q.key === 'q2') ? cut : findingsReply([]))]);
    const outcome = await runQuality(paper(), deps(client), new AbortController().signal);
    expect(outcome).toMatchObject({ reviewed: 2, failed: 1 });
  });
});

describe('stopping', () => {
  it('Stop keeps the finished findings and sends nothing more', async () => {
    const controller = new AbortController();
    const many = Array.from({ length: 3 }, () => paper().slice(0, 3)).flat().map((q, i) => ({ ...q, questionId: `${q.questionId}-${i}` }));
    const client = scriptedClient([() => {
      controller.abort();
      return findingsReply([{ key: 'q1.A', text: 'First chunk.' }]);
    }]);
    const outcome = await runQuality(many, deps(client), controller.signal);
    expect(client.requests).toHaveLength(1);
    expect(outcome.stopped).toBe(true);
    expect(outcome.findings.some((f) => f.message === 'First chunk.')).toBe(true);
  });

  it('a fatal error stops the run and keeps the checks', async () => {
    const fatal = new AiError({ kind: 'badKey', provider: 'openai', message: 'Bad key.', fatal: true, actions: [] });
    const outcome = await runQuality(paper(), deps(scriptedClient([fatal])), new AbortController().signal);
    expect(outcome.fatal?.kind).toBe('badKey');
    expect(outcome.findings.map((f) => f.issue)).toEqual(['statementRange', 'schemeMarks']);
  });
});
