import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import { AiError } from '@/ai/types';
import { aiErrorInfo } from '@/ai/errors';
import { createStructuredQuestion, createWorksheet } from '@/model/factories';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { withFlow } from '@/test/fixtures';
import { fakeGlossary } from '@/translate/fakeGlossary';
import { scriptedClient } from '@/translate/testKit';
import { SOURCE_EN, SOURCE_ZH, mcqReply, replyText, structuredReply } from './fixtures';
import { SOURCE_QUESTIONS_SCHEMA, SOURCE_SHAPE_HINT, SOURCE_TASK_MARKER } from './prompt';
import { recipeFor, sidesFor, sourceSideOf } from './recipe';
import { generateFromSource } from './run';
import type { GenerateDeps, GenerateInput, McqDraft, StructuredDraft } from './types';

const preset = presetFor('gemini');
const deps = (replies: Parameters<typeof scriptedClient>[0], glossary = false) => {
  const client = scriptedClient(replies);
  return { client, deps: { client, preset, glossary: glossary ? fakeGlossary() : null } satisfies GenerateDeps };
};
const signal = () => new AbortController().signal;
const paper1 = recipeFor(createWorksheetFrom({ documentType: 'paper1' }));
const lqMock = recipeFor(createWorksheetFrom({ documentType: 'lqMock' }));
const classroom = recipeFor(createWorksheet());
const input = (recipe = paper1, sides: GenerateInput['sides'] = ['en'], source = SOURCE_EN): GenerateInput => ({ source, recipe, sides });

describe('recipeFor: only what the paper can contain', () => {
  it('Paper 1 → 4 MCQs, one a combination item, the source as a shared stimulus', () => {
    expect(paper1).toMatchObject({ paper: 'paper1', mcq: 4, structured: 0, combination: 1, sourceAs: 'stimulus', answerSpace: false });
  });
  it('a Question-Answer Book → one structured question of 8–12 marks with answer space', () => {
    expect(lqMock).toMatchObject({ paper: 'lqMock', mcq: 0, structured: 1, marks: { min: 8, max: 12 }, sourceAs: 'sourceBlock', answerSpace: true });
  });
  it('an LQ worksheet (dotted answer space in its questions) is treated as Paper 2', () => {
    expect(recipeFor(createWorksheetFrom({ documentType: 'lqWorksheet' }))).toMatchObject({ paper: 'lqWorksheet', structured: 1, mcq: 0 });
    // Without the seeded sample it has nothing to tell it from a classroom worksheet.
    expect(recipeFor(createWorksheetFrom({ documentType: 'lqWorksheet', seedSample: false })).paper).toBe('classroom');
  });
  it('a classroom worksheet → 3 MCQs and a short structured question', () => {
    expect(classroom).toMatchObject({ paper: 'classroom', mcq: 3, structured: 1, combination: 1, sourceAs: 'stimulus' });
    expect(recipeFor(withFlow(createWorksheet(), [createStructuredQuestion()])).paper).toBe('classroom');
  });
  it('languages follow what the edition prints; the source side is detected', () => {
    expect(sidesFor('en')).toEqual(['en']);
    expect(sidesFor('zh')).toEqual(['zh']);
    expect(sidesFor('bilingual')).toEqual(['en', 'zh']);
    expect(sourceSideOf(SOURCE_EN)).toBe('en');
    expect(sourceSideOf(SOURCE_ZH)).toBe('zh');
  });
});

describe('generateFromSource', () => {
  it('sends one request: its own schema, shape hint and marker, the source and what to make', async () => {
    const { client, deps: d } = deps([replyText([mcqReply('en', { combination: true }), mcqReply('en'), mcqReply('en'), mcqReply('en')])]);
    const out = await generateFromSource(input(), d, signal());
    expect(client.requests).toHaveLength(1);
    const req = client.requests[0];
    expect(req.schema).toBe(SOURCE_QUESTIONS_SCHEMA);
    expect(req.shapeHint).toBe(SOURCE_SHAPE_HINT);
    expect(req.system.startsWith(SOURCE_TASK_MARKER)).toBe(true);
    const payload = JSON.parse(req.turns.at(-1)!.content);
    expect(payload).toMatchObject({ source: SOURCE_EN, languages: ['en'], make: { mcq: { count: 4, combinationItemsAtLeast: 1 } } });
    expect(payload.make.structured).toBeUndefined();
    expect(out.ok && out.items.map((i) => i.status)).toEqual(['ok', 'ok', 'ok', 'ok']);
    expect(out.ok && out.notes).toEqual([]);
  });

  it('keeps the combination shape and strips labels the paper derives', async () => {
    const { deps: d } = deps([replyText([mcqReply('en', { combination: true }), mcqReply('en')])]);
    const out = await generateFromSource(input(), d, signal());
    if (!out.ok) throw new Error('expected ok');
    const combo = out.items[0].draft as McqDraft;
    expect(combo.statements.map((s) => s.en)).toEqual(['The price of cigarettes rose.', 'Sales fell.', 'Cross-border purchases rose.']);
    expect(combo.options.map((o) => o.en)).toEqual(['(1) and (2) only', '(1) and (3) only', '(2) and (3) only', '(1), (2) and (3)']);
    const plainMcq = out.items[1].draft as McqDraft;
    expect(plainMcq.options.map((o) => o.en)).toEqual(['price elastic.', 'price inelastic.', 'perfectly elastic.', 'unitary elastic.']);
    expect(plainMcq.answerIndex).toBe(1);
    // Two items back for four asked.
    expect(out.notes).toContain('Asked for 4 MCQs; the reply had 2.');
  });

  it('notes a batch with no combination item', async () => {
    const { deps: d } = deps([replyText([mcqReply('en'), mcqReply('en'), mcqReply('en'), mcqReply('en')])]);
    const out = await generateFromSource(input(), d, signal());
    expect(out.ok && out.notes).toContain('No combination-statement item came back.');
  });

  it('fails invalid items, never passing them on', async () => {
    const three = { ...mcqReply('en'), options: mcqReply('en').options.slice(0, 3) };
    const key = { ...mcqReply('en'), answer: 4 };
    const dup = { ...mcqReply('en'), options: [...mcqReply('en').options.slice(0, 3), mcqReply('en').options[0]] };
    const empty = { ...mcqReply('en'), stem: { en: '  ', zh: '' } };
    const combo = mcqReply('en', { combination: true });
    const badCombo = { ...combo, options: [...combo.options.slice(0, 3), { en: '(1), (2) and (4)', zh: '' }] };
    const oneStatement = { ...combo, statements: combo.statements.slice(0, 1) };
    const { deps: d } = deps([replyText([three, key, dup, empty, badCombo, oneStatement])]);
    const out = await generateFromSource(input({ ...paper1, mcq: 6 }), d, signal());
    if (!out.ok) throw new Error('expected ok');
    expect(out.items.map((i) => i.status)).toEqual(['failed', 'failed', 'failed', 'failed', 'failed', 'failed']);
    expect(out.items.every((i) => i.draft === undefined)).toBe(true);
    expect(out.items.map((i) => i.notes[0])).toEqual([
      'It has 3 options, not 4',
      'Its answer is not one of A–D',
      'Two options are the same (English)',
      'The stem is empty (English)',
      "Its options don't combine the statements (English)",
      'It has 1 statement; a combination item needs 2–4',
    ]);
  });

  it('fails a structured question whose marks are not positive integers; notes a total off the range', async () => {
    const zero = structuredReply('en', [2, 0, 4]);
    const fraction = structuredReply('en', [2, 1.5, 4]);
    const long = structuredReply('en', [4, 6, 6]);
    for (const [reply, status, note] of [
      [zero, 'failed', 'Part (b) marks are not a whole number above 0'],
      [fraction, 'failed', 'Part (b) marks are not a whole number above 0'],
      [long, 'look', 'Totals 16 marks (asked for 8–12)'],
    ] as const) {
      const { deps: d } = deps([replyText([reply])]);
      const out = await generateFromSource(input(lqMock), d, signal());
      if (!out.ok) throw new Error('expected ok');
      expect(out.items[0].status).toBe(status);
      expect(out.items[0].notes).toContain(note);
    }
  });

  it('keeps a mark scheme only when its points total the part', async () => {
    const reply = structuredReply('en', [2, 4, 4]);
    reply.parts[1].points = reply.parts[1].points.slice(0, 3);
    const { deps: d } = deps([replyText([reply])]);
    const out = await generateFromSource(input(lqMock), d, signal());
    const draft = out.ok ? (out.items[0].draft as StructuredDraft) : null;
    expect(draft?.parts.map((p) => p.points.length)).toEqual([2, 0, 4]);
    expect(draft?.parts.map((p) => p.stem.en)).toEqual([
      'State **ONE** effect of the tax on retailers.',
      'With reference to the source, explain the change in sales.',
      'Discuss whether the tax will raise government revenue.',
    ]);
    expect(out.ok && out.items[0].status).toBe('ok');
  });

  it('flags a number in a stem the source never states', async () => {
    const { deps: d } = deps([replyText([mcqReply('en', { stemEn: 'After the tax rose by 40%, demand for cigarettes is' })])]);
    const out = await generateFromSource(input(), d, signal());
    expect(out.ok && out.items[0]).toMatchObject({ status: 'look', notes: ['Number not in the source: 40%'] });
  });

  it('writes both languages in EN+中 and holds 中文 to the glossary', async () => {
    const reply = mcqReply('both', { stemEn: 'Which statement about the price level is correct?' });
    reply.stem.zh = '以下有關價格水平的描述，何者正確？';
    reply.explanation = { en: 'Consumer surplus falls.', zh: '消費者剩餘減少。' };
    const { client, deps: d } = deps([replyText([reply])], true);
    const out = await generateFromSource(input(paper1, ['en', 'zh']), d, signal());
    if (!out.ok) throw new Error('expected ok');
    const draft = out.items[0].draft as McqDraft;
    // Deny forms are fixed in place.
    expect(draft.stem.zh).toBe('以下有關物價水平的描述，何者正確？');
    expect(draft.explanation.zh).toBe('消費者盈餘減少。');
    expect(draft.options.every((o) => o.en && o.zh)).toBe(true);
    const payload = JSON.parse(client.requests[0].turns.at(-1)!.content);
    expect(payload.languages).toEqual(['en', 'zh']);
    expect(payload.glossary.length).toBeGreaterThan(0);
  });

  it('notes a 中文 term the glossary does not accept', async () => {
    const reply = { ...mcqReply('both'), stem: { en: 'After the tax, consumer surplus fell. Demand for cigarettes is', zh: '稅項提高後，消費者得益減少。香煙的需求' } };
    const { deps: d } = deps([replyText([reply])], true);
    const out = await generateFromSource(input(paper1, ['en', 'zh']), d, signal());
    expect(out.ok && out.items[0].status).toBe('look');
    expect(out.ok && out.items[0].notes).toEqual(['EDB: 消費者盈餘']);
  });

  it('writes only 中文 for a 中文 paper and drops a side it does not print', async () => {
    const { client, deps: d } = deps([replyText([mcqReply('both')])]);
    const out = await generateFromSource(input(paper1, ['zh'], SOURCE_ZH), d, signal());
    const draft = out.ok ? (out.items[0].draft as McqDraft) : null;
    expect(draft?.stem.en).toBe('');
    expect(draft?.stem.zh).toContain('香煙的需求');
    expect(out.ok && out.sourceSide).toBe('zh');
    expect(JSON.parse(client.requests[0].turns.at(-1)!.content).languages).toEqual(['zh']);
  });

  it('fails an item missing a language the paper prints', async () => {
    const { deps: d } = deps([replyText([mcqReply('en')])]);
    const out = await generateFromSource(input(paper1, ['en', 'zh']), d, signal());
    expect(out.ok && out.items[0]).toMatchObject({ status: 'failed', notes: expect.arrayContaining(['The stem is empty (中文)']) });
  });

  it('returns errors instead of rejecting: truncated, unreadable, provider failure', async () => {
    const truncated = deps([{ text: '{"questions":[', finish: 'length', dialect: 'prompt', model: 'm', ms: 1 }]);
    expect(await generateFromSource(input(), truncated.deps, signal())).toMatchObject({ ok: false, error: { kind: 'truncated' } });
    const junk = deps(['not json']);
    expect(await generateFromSource(input(), junk.deps, signal())).toMatchObject({ ok: false, error: { kind: 'badOutput' } });
    const quota = deps([new AiError(aiErrorInfo('quota', 'gemini'))]);
    expect(await generateFromSource(input(), quota.deps, signal())).toMatchObject({ ok: false, error: { kind: 'quota' } });
  });

  it('honours the abort signal', async () => {
    const controller = new AbortController();
    const { client, deps: d } = deps([
      (req) => {
        expect(req.signal).toBe(controller.signal);
        controller.abort();
        return replyText([mcqReply('en')]);
      },
    ]);
    const out = await generateFromSource(input(), d, controller.signal);
    expect(out).toMatchObject({ ok: false, error: { kind: 'cancelled' } });
    expect(client.requests).toHaveLength(1);
  });
});
