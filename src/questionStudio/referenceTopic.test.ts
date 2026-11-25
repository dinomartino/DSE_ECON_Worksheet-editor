import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import type { CompletionRequest } from '@/ai/types';
import { liveEngine } from '@/components/studio/chat/engine';
import { createChatStore } from '@/components/studio/chat/chatStore';
import { localChatStorage, readChat } from '@/components/studio/chat/chatStorage';
import type { Chat } from '@/components/studio/chat/chatTypes';
import type { PickInput, StudioEngine } from '@/components/studio/chat/engine';
import { applyEdit, richOf, type DraftEdit } from '@/questionStudio/edit';
import type { McqQuestion } from '@/model/types';
import { scriptedClient } from '@/translate/testKit';
import CE from './ceReferences.fixture.json';
import { okOutcome, studioDraft } from './fixtures';
import { EMPTY_CORPUS } from './nearCopy';
import { buildPickRequest, parsePicks, pickKeyPoints } from './pick';
import { parseConcept } from './concept';
import { buildSolveRequest, STUDIO_SYSTEM_PROMPT, SOLVE_SYSTEM_PROMPT, SOLVE_TASK_MARKER, WRITE_TASK_MARKER } from './prompt';
import { briefPayload, makeBrief, normalizeRequest } from './brief';
import { writeDrafts } from './run';
import { sourceFromQuestion } from './source';
import { buildUnderstandRequest, understandTurn } from './understand';
import { hasWarning } from './validate';
import type { SourceQuestion, StudioDeps, StudioDraft, StudioRequest } from './types';

/**
 * k-0554 (u-lzuk): "when I give a question about tax structure (HKCEE 1990 Paper 2 Q47) the
 * drafted question is not about it but in AD-AS". The reference maps to a broad key point
 * (Fiscal policy, or Policy concerns), whose points include "effect of fiscal policy on output
 * and price"; the writer wrote anything on the key point, rule 7 pushed drafts apart, and no
 * check compared a draft's topic with its reference ("No problems found"). Now step 1 reads the
 * exact concept, the writer must stay on it, and the blind solve flags a draft that leaves it
 * (a red Concept row and one rewrite). Held here on four real HKCEE picture questions.
 */

const preset = presetFor('gemini');
const live = () => new AbortController().signal;
const bankQuestions = (CE as { questions: McqQuestion[] }).questions;
const refOf = (tag: string): SourceQuestion => {
  const q = bankQuestions.find((x) => x.tags?.includes(tag));
  if (!q) throw new Error(tag);
  return sourceFromQuestion(q, { id: tag, label: q.provenance?.en.map((r) => r.text).join('') ?? tag });
};

const TAX = { en: 'the structure of a tax (progressive, proportional or regressive) read from how the average tax rate changes with income', zh: '從平均稅率隨收入的變化判斷稅制結構（累進、比例或累退）' };

/** Each reference: its tag, the key point a pick may choose, the concept, an on-concept draft stem. */
const CASES = [
  { tag: 'CE1990/P2/Q47', keyPoint: 'I.fiscal', concept: TAX, on: 'Which of the following diagrams best shows the average tax rate of a tax with a tax-free allowance and rising marginal rates in Country Y?' },
  { tag: 'CE1995/P2/Q48', keyPoint: 'E.policy', concept: TAX, on: 'Refer to the following diagram of the average tax rate of Tax Z. Tax Z is ______ within the income range 0Y1, and ______ within Y1Y2.' },
  { tag: 'CE1993/P2/Q25', keyPoint: 'C.ped', concept: { en: 'unitary price elasticity of demand: total revenue (price × quantity areas) unchanged along the curve', zh: '單一需求價格彈性：沿曲線總收益不變' }, on: 'If the demand for good K is unitarily elastic along the curve shown, how does area A compare with area B?' },
  { tag: 'CE1992/P2/Q23', keyPoint: 'C.equilibrium', concept: { en: 'a surplus when supply increases and the price is held above equilibrium', zh: '供應增加而價格高於均衡時出現過剩' }, on: 'Rice is piling up in warehouses after a bumper crop. Which of the following diagrams explains this?' },
] as const;

/** What the rewrite brings back on the concept: a new scenario, so it is no near-copy of the first draft. */
const REWRITTEN: Record<string, string> = {
  'CE1990/P2/Q47': 'Country W charges no tax on the first $100 000 of a salary and a flat 15% on the rest. Which diagram shows its average tax rate against income?',
  'CE1995/P2/Q48': 'Sales tax S takes $50 from every household whatever its income. Over all incomes, how does its average tax rate behave, and what kind of tax is it?',
  'CE1993/P2/Q25': 'Bus fares rise by 10% and passenger trips fall by 10%, so the fare revenue of the bus company stays the same. What is the demand for its trips?',
  'CE1992/P2/Q23': 'Unsold milk piles up after dairy farms raise output while the government holds the milk price above its market level. What does this show?',
};

/** The draft the user got: AD-AS from a tax-structure reference. */
const OFF = 'Suppose the government increases its expenditure on infrastructure. Which of the following shows the short-run effect on the price level and real output?';
const bi = (en: string) => ({ en, zh: '' });
const entry = (stem: string, answer = 0) => ({
  stem: bi(stem),
  statements: [],
  options: [bi('rises … rises'), bi('rises … falls'), bi('falls … rises'), bi('falls … falls')],
  answer,
  explanation: bi('Worked out from the question.'),
  angle: 'new context',
  figures: [],
  changes: [],
});
const writeReply = (...stems: string[]) => JSON.stringify({ questions: stems.map((s, i) => entry(s, i % 4)) });
const questionsOf = (req: CompletionRequest) => (JSON.parse(req.turns.at(-1)!.content) as { questions: Array<{ id: string; stem: string; concept?: string }> }).questions;
/** A solver that answers each draft's key and, given a concept, says a draft about government spending is off it. */
const solver = (req: CompletionRequest) =>
  JSON.stringify({
    answers: questionsOf(req).map((q, i) => {
      const off = /infrastructure/.test(q.stem);
      return { id: q.id, working: 'read it', answer: i % 4, ambiguous: false, tests: q.concept ? (off ? 'the effect of government spending on output and the price level' : 'the same concept') : '', onTopic: !off };
    }),
  });
const deps = (client: StudioDeps['client']): StudioDeps => ({ client, preset, glossary: null, corpus: EMPTY_CORPUS, random: () => 0.3 });
const request = (ref: SourceQuestion, over: Partial<StudioRequest> = {}): StudioRequest => ({
  keyPoint: 'I.fiscal',
  points: [],
  examples: [ref],
  strict: true,
  count: 2,
  level: 'same',
  shape: 'any',
  sides: ['en'],
  note: '',
  ...over,
});
const writes = (client: { requests: CompletionRequest[] }) => client.requests.filter((r) => r.system.startsWith(WRITE_TASK_MARKER));
const solves = (client: { requests: CompletionRequest[] }) => client.requests.filter((r) => r.system.startsWith(SOLVE_TASK_MARKER));
const topicOf = (d: StudioDraft) => d.checks.find((c) => c.id === 'topic');

describe('the reference question the user gave (HKCEE 1990 Paper 2 Q47)', () => {
  it('reaches the AI with its words: the tax-structure question line, four option pictures', () => {
    const ref = refOf('CE1990/P2/Q47');
    expect(ref.stem.en).toBe('Which of the following diagrams approximates the structure of salaries tax in Hong Kong?');
    expect(ref.stem.zh).toContain('薪俸稅的結構');
    expect(ref.hasFigure).toBe(true);
    expect(ref.figurePlaces).toEqual(['option A', 'option B', 'option C', 'option D']);
  });
});

describe('step 1 reads the concept, not only the key point (k-0554)', () => {
  it('the pick request asks for a concept in the schema and the rules, and sends the chat\'s current one', () => {
    const req = buildPickRequest({ text: '', examples: [refOf('CE1990/P2/Q47')], current: ['I.fiscal'], currentConcept: TAX }, preset, live());
    expect(JSON.stringify(req.schema)).toContain('"concept"');
    expect(req.system).toContain('"concept" says exactly which economic idea');
    const payload = JSON.parse(req.turns[0].content) as { currentConcept: unknown; examples: Array<{ stem: { en: string } }> };
    expect(payload.currentConcept).toEqual(TAX);
    expect(payload.examples[0].stem.en).toContain('structure of salaries tax');
  });

  it('reads the concept from the reply (trimmed, capped), and nothing from a reply without one', async () => {
    const reply = JSON.stringify({ concept: { en: `  ${TAX.en}  `, zh: TAX.zh }, picks: [{ code: 'I.fiscal', reason: 'tax', reasonZh: '稅' }] });
    expect(parseConcept(reply)).toEqual(TAX);
    expect(parsePicks(reply)?.[0].code).toBe('I.fiscal');
    expect(parseConcept(JSON.stringify({ picks: [] }))).toBeUndefined();
    expect(parseConcept(JSON.stringify({ concept: { en: ' ', zh: '' } }))).toBeUndefined();
    const client = scriptedClient([reply]);
    const out = await pickKeyPoints({ text: '', examples: [refOf('CE1990/P2/Q47')] }, { client, preset }, live());
    expect(out.ok && out.concept).toEqual(TAX);
  });

  it('the turn reader (drafts on the page) answers a concept with a new request, and the chat engine passes it on', async () => {
    const turn = buildUnderstandRequest({ text: 'another like the reference', examples: [refOf('CE1990/P2/Q47')], drafts: [], recent: [], picks: true, currentConcept: TAX }, preset, live());
    expect((turn.schema as { required: string[] }).required).toContain('concept');
    expect(JSON.parse(turn.turns[0].content).currentConcept).toEqual(TAX);
    const reply = JSON.stringify({ intent: 'new', drafts: [], how: 'change', parts: [], reply: '', concept: TAX, picks: [{ code: 'I.fiscal', reason: 'tax', reasonZh: '稅' }] });
    const read = await understandTurn({ text: 'one more', examples: [], drafts: [], recent: [], picks: true }, { client: scriptedClient([reply]), preset }, live());
    expect(read.ok && read.concept).toEqual(TAX);
    const picked = await liveEngine.pick({ text: '', examples: [refOf('CE1990/P2/Q47')] }, deps(scriptedClient([JSON.stringify({ concept: TAX, picks: [{ code: 'E.policy', reason: 'r', reasonZh: 'r' }] })])), live());
    expect(picked.ok && picked.concept).toEqual(TAX);
  });
});

describe('the writer is held to the concept (k-0554)', () => {
  it('the brief carries it under the syllabus, and the rules put it above "any of its points" and above variety', () => {
    const brief = makeBrief(request(refOf('CE1990/P2/Q47'), { concept: TAX }));
    if ('error' in brief) throw new Error(brief.error);
    const payload = briefPayload(brief, null, false) as { syllabus: { concept?: unknown; keyPoint: { en: string } } };
    expect(payload.syllabus.keyPoint.en).toBe('Fiscal policy');
    expect(payload.syllabus.concept).toEqual(TAX);
    expect(STUDIO_SYSTEM_PROMPT).toContain('If "syllabus.concept" is given');
    expect(STUDIO_SYSTEM_PROMPT).toContain('never their concept');
    expect(STUDIO_SYSTEM_PROMPT).toContain('test the same concept as the examples');
    // Kept clean: no empty concept is sent.
    expect(normalizeRequest(request(refOf('CE1990/P2/Q47'), { concept: { en: '', zh: '' } }))).not.toHaveProperty('concept');
  });

  it('the solve rules ask whether a draft tests its concept, not only its broad topic', () => {
    expect(SOLVE_SYSTEM_PROMPT).toContain('"onTopic"');
    const req = buildSolveRequest([{ id: 'd1', stem: OFF, statements: [], options: ['a', 'b', 'c', 'd'], concept: TAX.en }], 'en', preset, live());
    expect(JSON.stringify(req.schema)).toContain('onTopic');
    expect(questionsOf(req)[0].concept).toBe(TAX.en);
  });
});

describe('a draft that leaves its reference\'s concept is flagged and written again (four HKCEE picture questions)', () => {
  for (const c of CASES) {
    it(`${c.tag}: the AD-AS-style draft is caught, rewritten on the concept, and the result checked`, async () => {
      const ref = refOf(c.tag);
      const client = scriptedClient([writeReply(c.on, OFF), solver, writeReply(REWRITTEN[c.tag]), solver]);
      const out = await writeDrafts(request(ref, { keyPoint: c.keyPoint, concept: c.concept }), deps(client), { signal: live() });
      if (!out.ok) throw new Error(out.error.kind);
      // The first write saw the reference and the concept.
      const first = JSON.parse(writes(client)[0].turns[0].content) as { examples: Array<{ stem: { en: string } }>; syllabus: { concept: unknown } };
      expect(first.examples[0].stem.en).toBe(ref.stem.en);
      expect(first.syllabus.concept).toEqual(c.concept);
      // Every draft went to the solve with the concept to compare with.
      expect(questionsOf(solves(client)[0]).map((q) => q.concept)).toEqual([c.concept.en, c.concept.en]);
      // The off-concept draft went back once, told what to test.
      const redo = JSON.parse(writes(client)[1].turns[0].content) as { redo: Array<{ problem: string; draft: { stem: { en: string } } }> };
      expect(redo.redo).toHaveLength(1);
      expect(redo.redo[0].draft.stem.en).toBe(OFF);
      expect(redo.redo[0].problem).toContain(c.concept.en);
      expect(redo.redo[0].problem).toContain('government spending');
      // Both drafts now stand on the concept, the row says so.
      expect(out.drafts.map((d) => topicOf(d)?.state)).toEqual(['pass', 'pass']);
      expect(out.drafts.map((d) => d.draft.stem.en).some((s) => /infrastructure/.test(s))).toBe(false);
    });
  }

  it('a draft still off its concept after the rewrite keeps a red Concept row: never "No problems found"', async () => {
    const ref = refOf('CE1990/P2/Q47');
    const client = scriptedClient([writeReply(OFF), solver, writeReply(OFF.replace('infrastructure', 'infrastructure and hospitals')), solver]);
    const out = await writeDrafts(request(ref, { count: 1, concept: TAX }), deps(client), { signal: live() });
    if (!out.ok) throw new Error(out.error.kind);
    const [d] = out.drafts;
    expect(topicOf(d)).toEqual({ id: 'topic', state: 'fail', findings: [{ id: 'topic.off', params: { tests: 'the effect of government spending on output and the price level', conceptEn: TAX.en, conceptZh: TAX.zh } }] });
    expect(d.status).toBe('look');
    expect(hasWarning(d)).toBe(true);
    // The Concept row sits right after the key's.
    expect(d.checks.map((r) => r.id).slice(0, 3)).toEqual(['shape', 'key', 'topic']);
  });

  it('with no concept read (the computer\'s own pick), the reference\'s own words are the concept to compare with', async () => {
    const ref = refOf('CE1990/P2/Q47');
    const client = scriptedClient([writeReply(CASES[0].on), solver]);
    const out = await writeDrafts(request(ref, { count: 1 }), deps(client), { signal: live() });
    if (!out.ok) throw new Error(out.error.kind);
    expect(questionsOf(solves(client)[0])[0].concept).toContain('structure of salaries tax');
    expect(topicOf(out.drafts[0])?.state).toBe('pass');
  });

  it('no reference and no concept: no Concept row and no concept sent (a plain key-point request)', async () => {
    const client = scriptedClient([writeReply('A question on fiscal policy.'), solver]);
    const out = await writeDrafts(request(refOf('CE1990/P2/Q47'), { examples: [], strict: false, count: 1 }), deps(client), { signal: live() });
    if (!out.ok) throw new Error(out.error.kind);
    expect(questionsOf(solves(client)[0])[0].concept).toBeUndefined();
    expect(topicOf(out.drafts[0])).toBeUndefined();
  });

  it('the teacher\'s own words with no concept read: no comparison with the reference (they may ask for another idea)', async () => {
    const client = scriptedClient([writeReply(OFF), solver]);
    const out = await writeDrafts(request(refOf('CE1990/P2/Q47'), { count: 1, note: 'same style but about AD-AS' }), deps(client), { signal: live() });
    if (!out.ok) throw new Error(out.error.kind);
    expect(topicOf(out.drafts[0])).toBeUndefined();
  });

  it('a solve that fails leaves the Concept row "not checked", not passed', async () => {
    const client = scriptedClient([writeReply(CASES[0].on), 'not json']);
    const out = await writeDrafts(request(refOf('CE1990/P2/Q47'), { count: 1, concept: TAX }), deps(client), { signal: live() });
    if (!out.ok) throw new Error(out.error.kind);
    expect(topicOf(out.drafts[0])).toEqual({ id: 'topic', state: 'skipped', findings: [{ id: 'topic.notChecked' }] });
  });

  it('a hand edit keeps the row for the same question and asks to check again once the question changed', async () => {
    const client = scriptedClient([writeReply(CASES[0].on), solver]);
    const req = request(refOf('CE1990/P2/Q47'), { count: 1, concept: TAX });
    const out = await writeDrafts(req, deps(client), { signal: live() });
    if (!out.ok) throw new Error(out.error.kind);
    const d = out.drafts[0];
    const found = { glossary: null, corpus: EMPTY_CORPUS };
    const editOf = (change: (e: DraftEdit) => DraftEdit): DraftEdit => change({ rich: richOf(d), answerIndex: d.draft.answerIndex });
    const same = applyEdit(d, editOf((e) => ({ ...e, rich: { ...e.rich, explanation: { en: [{ text: 'A better explanation.' }], zh: [] } } })), req, [], found, 'e1');
    expect(topicOf(same)?.state).toBe('pass');
    const changed = applyEdit(d, editOf((e) => ({ ...e, rich: { ...e.rich, stem: { en: [{ text: 'A different question about income tax.' }], zh: [] } } })), req, [], found, 'e2');
    expect(topicOf(changed)).toEqual({ id: 'topic', state: 'skipped', findings: [{ id: 'check.edited' }] });
  });
});

describe('the chat keeps the concept with its pick (k-0554)', () => {
  function setup() {
    const picks: PickInput[] = [];
    const writes: StudioRequest[] = [];
    let n = 0;
    const engine: StudioEngine = {
      pick: async (input) => {
        picks.push(input);
        // A follow-up with nothing new (the AI kept the chat's key point) gives no new pick.
        return picks.length === 1 ? { ok: true, picks: [{ code: 'I.fiscal', reason: 'tax structure' }], concept: TAX, usage: { requests: 1, input: 0, output: 0, thinking: 0, ms: 0 }, model: 'fake' } : { ok: true, picks: [], usage: { requests: 1, input: 0, output: 0, thinking: 0, ms: 0 }, model: 'fake' };
      },
      write: async (request) => {
        writes.push(request);
        return okOutcome(Array.from({ length: request.count }, () => studioDraft(`d${++n}`)));
      },
      refine: async () => okOutcome([studioDraft(`r${++n}`)]),
    };
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    const useChat = createChatStore({
      env: { resolve: async () => ({ ok: true, deps: { client: {} as never, preset, glossary: null, corpus: EMPTY_CORPUS }, compared: { past: 0, mine: 0 } }), references: async () => [] },
      engine,
      storage: localChatStorage(storage),
      language: () => 'en',
      initialSettings: { count: 1 },
    });
    const chat = () => useChat.getState().chats.find((c) => c.id === useChat.getState().activeId) as Chat;
    return { useChat, chat, picks, writes };
  }

  it('a reference alone: the write gets the concept; a follow-up sends and keeps it; the teacher\'s own key point drops it; a saved chat keeps it', async () => {
    const { useChat, chat, picks, writes } = setup();
    useChat.getState().addReference(refOf('CE1990/P2/Q47'), 'I.fiscal');
    await useChat.getState().send('');
    expect(writes[0].concept).toEqual(TAX);
    expect(chat().concept).toEqual(TAX);
    expect(readChat(JSON.parse(JSON.stringify(chat())))?.concept).toEqual(TAX);
    await useChat.getState().send('write 1 more in the same way');
    expect(picks[1].currentConcept).toEqual(TAX);
    expect(writes.at(-1)?.concept).toEqual(TAX);
    useChat.getState().changePick('C.ped');
    expect(chat().concept).toBeUndefined();
  });
});
