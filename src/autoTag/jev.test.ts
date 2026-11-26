import { describe, expect, it } from 'vitest';
import { creditsFor, tagJob } from '@/ai/credits';
import type { MentorAccount } from '@/ai/mentor';
import { presetFor } from '@/ai/providers';
import { AiError, type AiClient, type CompletionRequest, type DecideAnswer, type DecideRequest, type DecideResult } from '@/ai/types';
import { TOPICS } from '@/model/topics';
import { scriptedClient } from '@/translate/testKit';
import { buildDecide, questionLanguage, suggestionsFromDecide, syllabusLine, topicCriteria, topicsOf } from './jev';
import { runTagging } from './run';
import type { TagQuestion } from './types';

/** k-0567: AI tagging on Jev through Mentor's `/ai/decide`, for teachers on Mentor credits. */

const preset = { ...presetFor('mentor'), concurrency: 4 };
const signal = new AbortController().signal;

const question = (n: number, over: Partial<TagQuestion> = {}): TagQuestion => ({
  key: `q${n}`,
  rootId: `root-${n}`,
  format: 'multiple-choice question',
  entries: [{ role: 'stem', text: `Question ${n}: a fall in price raises total revenue.` }],
  ...over,
});
const parted: TagQuestion = {
  key: 'q1',
  rootId: 'root-p',
  format: 'structured',
  entries: [
    { role: 'stem', text: 'The government sets a maximum rent below the equilibrium rent.' },
    { role: 'part', label: '(a)', text: 'Explain why a shortage results.' },
    { role: 'part', label: '(b)(ii)', text: 'Explain whether there is a deadweight loss.' },
  ],
  parts: [
    { label: '(a)', slot: 's-a' },
    { label: '(b)(ii)', slot: 's-bii' },
  ],
};

const choice = (choice: string, probabilities: Record<string, number>): DecideAnswer => ({ type: 'choice', choice, confidence: 0.8, probabilities });

/** A fake hosted client: `decide` answers by a function of the request; `complete` is the prompt path. */
function jevClient(answer: (req: DecideRequest) => DecideResult | null | Error, completeReplies: string[] = []) {
  const decides: DecideRequest[] = [];
  const base = scriptedClient(completeReplies.length ? completeReplies : ['{"items":[]}']);
  let open = 0;
  let peak = 0;
  const client: AiClient & { requests: CompletionRequest[] } = {
    ...base,
    async decide(req) {
      decides.push(req);
      open++;
      peak = Math.max(peak, open);
      await new Promise((r) => setTimeout(r, 2));
      open--;
      const out = answer(req);
      if (out instanceof Error) throw out;
      return out;
    },
  };
  return { client, decides, peak: () => peak };
}
const allPed = (req: DecideRequest): DecideResult => ({
  model: 'jev-1.14.0',
  fallback: false,
  ms: 300,
  answers: Object.fromEntries(Object.entries(req.questions).filter(([, q]) => q.type === 'choice').map(([name]) => [name, choice('C.ped', { 'C.ped': 0.8, 'C.pes': 0.16, 'C.surplus': 0.04 })])),
});

describe('the request (k-0567)', () => {
  it('one Choice per question over the same 53 topics the prompt lists; the questions sit in the state, words only', () => {
    const req = buildDecide([question(1), question(2)], signal);
    expect(req.feature).toBe('tag');
    expect(Object.keys(req.questions)).toEqual(['q1', 'q2']);
    const criteria = topicCriteria();
    expect(Object.keys(criteria)).toHaveLength(TOPICS.reduce((n, p) => n + p.children.length, 0));
    expect(criteria['C.ped']).toMatch(/^Price elasticity of demand: .*\[syllabus part C Market and Price\]$/);
    expect(req.questions.q1).toMatchObject({ type: 'choice', criteria });
    expect(JSON.stringify(req.questions.q2.instructions)).toContain('`questions.q2`');
    const state = req.state as { questions: Record<string, { entries: unknown[]; key?: string }> };
    expect(Object.keys(state.questions)).toEqual(['q1', 'q2']);
    expect(state.questions.q1.key).toBeUndefined();
    expect(state.questions.q1.entries).toEqual([{ role: 'stem', text: 'Question 1: a fall in price raises total revenue.' }]);
  });

  it('a question with parts asks one Choice per part, named as Mentor accepts', () => {
    const req = buildDecide([parted], signal);
    expect(Object.keys(req.questions)).toEqual(['q1_(a)', 'q1_(b)(ii)']);
    for (const name of Object.keys(req.questions)) expect(name).toMatch(/^[A-Za-z0-9_.:()-]{1,80}$/);
    expect(JSON.stringify(req.questions['q1_(b)(ii)'].instructions)).toContain('part (b)(ii) of `questions.q1`');
  });

  it('the teacher’s 題型: a Choice over their names (topic::name) and a companion Noul; one name → the Noul alone', () => {
    const two = buildDecide([question(1, { patterns: { 'C.ped': ['Total revenue test', 'Arc elasticity'] } })], signal);
    expect(Object.keys(two.questions)).toEqual(['q1', 'q1__fits', 'q1__kind']);
    expect(two.questions.q1__fits.type).toBe('noul');
    expect(Object.keys(two.questions.q1__kind.criteria as object)).toEqual(['C.ped::Total revenue test', 'C.ped::Arc elasticity']);
    const one = buildDecide([question(1, { patterns: { 'C.ped': ['Total revenue test'] } })], signal);
    expect(Object.keys(one.questions)).toEqual(['q1', 'q1__fits']);
  });
});

describe('reading the answers', () => {
  it('main = the choice; up to two more at 15% or more; how sure from its probability', () => {
    expect(topicsOf(choice('C.ped', { 'C.ped': 0.75, 'C.pes': 0.2, 'C.surplus': 0.05 }))).toEqual({ topics: ['C.ped', 'C.pes'], conf: 'high' });
    expect(topicsOf(choice('C.ped', { 'C.ped': 0.5, 'C.pes': 0.3, 'C.surplus': 0.18, 'C.equilibrium': 0.02 }))).toEqual({ topics: ['C.ped', 'C.pes', 'C.surplus'], conf: 'medium' });
    expect(topicsOf(choice('C.ped', { 'C.ped': 0.3, 'C.pes': 0.29 }))?.conf).toBe('low');
    expect(topicsOf(choice('Z.made-up', { 'Z.made-up': 1 }))).toBeUndefined();
    expect(topicsOf({ type: 'noul', noul: 1 })).toBeUndefined();
  });

  it('the reason line is the topic’s syllabus points, in the question’s own language', () => {
    const en = suggestionsFromDecide([question(1)], allPed(buildDecide([question(1)], signal))).get('root-1')!;
    expect(en.why).toBe(syllabusLine('C.ped', 'en'));
    expect(en.why).toMatch(/total revenue/i);
    const zhQ = question(2, { entries: [{ role: 'stem', text: '價格下降令總收入上升，需求是' }] });
    expect(questionLanguage(zhQ)).toBe('zh');
    const zh = suggestionsFromDecide([zhQ], allPed(buildDecide([zhQ], signal))).get('root-2')!;
    expect(zh.why).toBe(syllabusLine('C.ped', 'zh'));
    expect(zh.why).toMatch(/[㐀-鿿]/);
  });

  it('parts: one suggestion per part, the question’s topics all parts’ together, how sure the least sure part', () => {
    const req = buildDecide([parted], signal);
    const s = suggestionsFromDecide([parted], {
      answers: {
        'q1_(a)': choice('C.intervention', { 'C.intervention': 0.9, 'C.equilibrium': 0.1 }),
        'q1_(b)(ii)': choice('E.efficiency', { 'E.efficiency': 0.55, 'C.intervention': 0.4 }),
      },
    }).get('root-p')!;
    expect(Object.keys(req.questions)).toHaveLength(2);
    expect(s.parts?.map((p) => [p.label, p.slot, p.topics, p.conf])).toEqual([
      ['(a)', 's-a', ['C.intervention'], 'high'],
      ['(b)(ii)', 's-bii', ['E.efficiency', 'C.intervention'], 'medium'],
    ]);
    expect(s.topics).toEqual(['C.intervention', 'E.efficiency']);
    expect([s.conf, s.why]).toEqual(['medium', '']);
  });

  it('a 題型 only when the Noul says one fits, the pick is likely enough, and it sits under the main topic', () => {
    const q = question(1, { patterns: { 'C.ped': ['Total revenue test', 'Arc elasticity'], 'C.pes': ['PES from a table'] } });
    const base = { q1: choice('C.ped', { 'C.ped': 0.9 }) };
    const read = (extra: Record<string, DecideAnswer>) => suggestionsFromDecide([q], { answers: { ...base, ...extra } }).get('root-1')!.pattern;
    expect(read({ q1__fits: { type: 'noul', noul: 0.8 }, q1__kind: choice('C.ped::Total revenue test', { 'C.ped::Total revenue test': 0.7 }) })).toEqual({ topic: 'C.ped', name: 'Total revenue test' });
    expect(read({ q1__fits: { type: 'noul', noul: 0.3 }, q1__kind: choice('C.ped::Total revenue test', { 'C.ped::Total revenue test': 0.9 }) })).toBeUndefined();
    expect(read({ q1__fits: { type: 'noul', noul: 0.9 }, q1__kind: choice('C.ped::Arc elasticity', { 'C.ped::Arc elasticity': 0.3 }) })).toBeUndefined();
    // Under another topic than the main one: never.
    expect(read({ q1__fits: { type: 'noul', noul: 0.9 }, q1__kind: choice('C.pes::PES from a table', { 'C.pes::PES from a table': 0.9 }) })).toBeUndefined();
  });
});

describe('the run on Jev', () => {
  it('a hosted client tags through decide, ten questions a request, one request at a time; no prompt is sent', async () => {
    const { client, decides, peak } = jevClient(allPed);
    const qs = Array.from({ length: 23 }, (_, i) => question(i + 1));
    const outcome = await runTagging(qs, { client, preset }, { whyLanguage: 'en', signal });
    expect(decides.map((d) => Object.keys(d.questions).length)).toEqual([10, 10, 3]);
    expect(peak()).toBe(1);
    expect(client.requests).toHaveLength(0);
    expect(outcome.suggestions).toHaveLength(23);
    expect(outcome.suggestions[0]).toMatchObject({ topics: ['C.ped', 'C.pes'], conf: 'high' });
    expect(outcome.failed).toEqual([]);
  });

  it('a question left unanswered is asked once more on its own', async () => {
    let first = true;
    const { client, decides } = jevClient((req) => {
      const res = allPed(req);
      if (first) {
        first = false;
        delete res.answers.q2;
      }
      return res;
    });
    const outcome = await runTagging([question(1), question(2), question(3)], { client, preset }, { whyLanguage: 'en', signal });
    expect(decides.map((d) => Object.keys(d.questions))).toEqual([['q1', 'q2', 'q3'], ['q2']]);
    expect(outcome.suggestions.map((s) => s.rootId).sort()).toEqual(['root-1', 'root-2', 'root-3']);
  });

  it('Mentor not offering it (null) → the rest of the run goes through the prompt, as before', async () => {
    const reply = (keys: string[]) => JSON.stringify({ items: keys.map((key) => ({ key, main: 'C.pes', also: '', pattern: '', conf: 'high', why: 'Reads PES.' })) });
    const { client, decides } = jevClient(() => null, [reply(['q1', 'q2'])]);
    const outcome = await runTagging([question(1), question(2)], { client, preset }, { whyLanguage: 'en', signal });
    expect(decides).toHaveLength(1);
    expect(client.requests).toHaveLength(1);
    expect(outcome.suggestions.map((s) => [s.topics[0], s.why])).toEqual([['C.pes', 'Reads PES.'], ['C.pes', 'Reads PES.']]);
  });

  it('a run-ending error (no credits) stops the run like the prompt path', async () => {
    const noCredits = new AiError({ kind: 'noCredits', provider: 'mentor', message: 'Out of credits.', fatal: true, actions: ['buyCredits'] });
    const { client } = jevClient(() => noCredits);
    const outcome = await runTagging([question(1)], { client, preset }, { whyLanguage: 'en', signal });
    expect(outcome.fatal?.kind).toBe('noCredits');
    expect(outcome.suggestions).toEqual([]);
  });
});

describe('the estimate on Jev', () => {
  const account = (tagModel: string): Pick<MentorAccount, 'rates' | 'models'> => ({
    rates: { inputPerM: 1170, outputPerM: 5850 },
    models: {
      default: 'gemini-4-hydrogen',
      byFeature: { tag: tagModel },
      rates: { 'gemini-4-hydrogen': { inputPerM: 1170, outputPerM: 5850 }, 'gemini-3.5-flash-lite': { inputPerM: 234, outputPerM: 1950 }, 'jev-1.14.0': { inputPerM: 32.76, outputPerM: 0 } },
    },
  });

  it('prices Jev by its own shape (every question with the 53 options, no output): about 0.11 credits a question', () => {
    const job = tagJob(100, 'x'.repeat(100 * 200));
    const jev = creditsFor(job, account('jev-1.14.0'))!;
    expect(jev).toBeGreaterThan(10);
    expect(jev).toBeLessThan(14);
    // On Flash-Lite the prompt's shape, as before.
    const light = creditsFor(job, account('gemini-3.5-flash-lite'))!;
    expect(light).toBeCloseTo((job.inputTokens * 234 + job.outputTokens * 1950) / 1e6, 6);
  });
});
