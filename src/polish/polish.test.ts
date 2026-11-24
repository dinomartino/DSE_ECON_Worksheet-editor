import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import { polishJob, POLISH_CHUNK } from '@/ai/credits';
import { DSE_STYLE_PROFILE } from '@/dseStyle';
import { plain } from '@/model/text';
import { collectTexts } from '@/model/textWalk';
import { scriptedClient } from '@/translate/testKit';
import { applyPolishEdits } from './apply';
import { polishQuestions } from './collect';
import { diffText } from './diff';
import { numbersMoved, orderMoved } from './guard';
import { buildRequest, parsePolishReply, POLISH_MARKER, SYSTEM_POLISH } from './prompt';
import { changesOf, runPolish } from './run';
import { bi, paperOf, polishPayload, polishReplyOf } from './testKit';

const preset = { ...presetFor('openai'), concurrency: 1 };
const signal = new AbortController().signal;

const ELASTIC = {
  stem: ['Suppose the price of Good X rises. Which one of the following will not happen?', '假設物品 X 的價格上升, 下面哪一個不會出現?'] as [string, string],
  options: [
    ['Its quantity demanded falls.', '其需求量下降。'],
    ['Its demand falls.', '其需求下降。'],
    ['Its supply rises.', '其供應上升。'],
    ['Its total revenue may rise.', '其總收入可能上升。'],
  ] as Array<[string, string]>,
  answer: 1,
};

describe('the request', () => {
  it('opens with the HKDSE style block, byte for byte, then the task rules; tagged polish', () => {
    expect(SYSTEM_POLISH.startsWith(`${DSE_STYLE_PROFILE}\n\n${POLISH_MARKER}`)).toBe(true);
    const ws = paperOf(ELASTIC);
    const [q] = polishQuestions(ws, { kind: 'paper' });
    const { request } = buildRequest([q], preset, signal);
    expect(request.system).toBe(SYSTEM_POLISH);
    expect(request.feature).toBe('polish');
    const payload = polishPayload(request);
    expect(payload.questions[0]).toMatchObject({ q: 'q1', answer: 'B', languages: ['en', 'zh'] });
    expect(payload.questions[0].fields.map((f) => f.id)).toEqual(['q1.stem1', 'q1.A', 'q1.B', 'q1.C', 'q1.D']);
  });

  it('sends bold as <b> and a table as read-only context, never as a field', () => {
    const ws = paperOf({
      stem: [['The table shows the output of a firm.', '下表顯示一家公司的產量。'], ['Which of the following is **NOT** correct?', '下列哪項**不**正確？']],
      table: [['Labour', 'Output'], ['1', '10']],
      options: ELASTIC.options,
    });
    const [q] = polishQuestions(ws, { kind: 'paper' });
    const payload = polishPayload(buildRequest([q], preset, signal).request);
    const fields = payload.questions[0].fields;
    expect(fields.map((f) => f.id)).toEqual(['q1.stem1', 'q1.stem2', 'q1.A', 'q1.B', 'q1.C', 'q1.D']);
    expect(fields[1].en).toBe('Which of the following is <b>NOT</b> correct?');
    expect(payload.questions[0].table?.en).toEqual(['Labour | Output', '1 | 10']);
  });

  it('offers MC questions only, and the questions in scope only', () => {
    const ws = paperOf(ELASTIC, { ...ELASTIC, stem: ['Which of the following is a public good?', '下列哪項是公共財品？'] });
    expect(polishQuestions(ws, { kind: 'paper' })).toHaveLength(2);
    const second = ws.questions[1].id;
    expect(polishQuestions(ws, { kind: 'questions', ids: [second] }).map((q) => q.questionId)).toEqual([second]);
    expect(polishQuestions(ws, { kind: 'questions', ids: [ws.questions[2].id] })).toEqual([]);
  });

  it('estimates per chunk of questions, priced as polish', () => {
    const one = polishJob(1, 'x'.repeat(400));
    const six = polishJob(POLISH_CHUNK + 1, 'x'.repeat(2400));
    expect(one.feature).toBe('polish');
    expect(one.inputTokens).toBeGreaterThan(1600);
    // Two requests: the style block twice.
    expect(six.inputTokens - one.inputTokens).toBeGreaterThan(1600);
  });
});

describe('reading the reply', () => {
  const setup = (spec = ELASTIC) => {
    const ws = paperOf(spec);
    const [q] = polishQuestions(ws, { kind: 'paper' });
    const { codecs } = buildRequest([q], preset, signal);
    return { ws, q, codecs };
  };

  it('decodes the tags back to bold, tidies 中文 punctuation and strips printed labels', () => {
    const { q, codecs } = setup();
    const [item] = parsePolishReply(polishReplyOf([{ q: 'q1', answer: 'B', fields: [
      { id: 'q1.stem1', en: 'Suppose the price of Good X rises. Which of the following will <b>NOT</b> happen?', zh: '假設物品 X 的價格上升,下列哪項<b>不會</b>出現?' },
      { id: 'q1.A', en: '(A) Its quantity demanded will fall.', zh: '' },
    ] }]))!;
    const [stem, a] = changesOf(q, item, codecs);
    expect(stem.blocked).toBeUndefined();
    expect(stem.sides).toEqual(['en', 'zh']);
    expect(stem.after.en.find((r) => r.bold)?.text).toBe('NOT');
    expect(plain(stem.after.zh)).toBe('假設物品 X 的價格上升，下列哪項不會出現？');
    expect(stem.why).toEqual({ en: 'House style.', zh: '依 HKDSE 風格。' });
    expect(plain(a.after.en)).toBe('Its quantity demanded will fall.');
    // The empty 中文 keeps the teacher's text.
    expect(a.sides).toEqual(['en']);
    expect(a.after.zh).toBe(q.fields[1].text.zh);
  });

  it('drops a text that comes back the same, an unknown id, and a language the text lacks', () => {
    const { q, codecs } = setup({ ...ELASTIC, options: [['Its quantity demanded falls.', ''], ...ELASTIC.options.slice(1)] });
    const [item] = parsePolishReply(polishReplyOf([{ q: 'q1', answer: 'B', fields: [
      { id: 'q1.B', en: 'Its demand falls.', zh: '其需求下降。' },
      { id: 'q9.X', en: 'Anything.' },
      { id: 'q1.A', zh: '其需求量下降。' },
    ] }]))!;
    expect(changesOf(q, item, codecs)).toEqual([]);
  });

  it('refuses a change that moves a number, but not one that only respaces thousands', () => {
    const { q, codecs } = setup({ ...ELASTIC, options: [['$1,000', '$1,000'], ['$1,500', '$1,500'], ['$2,000', '$2,000'], ['$2,500', '$2,500']] });
    const [item] = parsePolishReply(polishReplyOf([{ q: 'q1', answer: 'B', fields: [
      { id: 'q1.A', en: '$1 000', zh: '$1 000' },
      { id: 'q1.B', en: '$1 600', zh: '$1 500' },
    ] }]))!;
    const [a, b] = changesOf(q, item, codecs);
    expect(a.blocked).toBeUndefined();
    expect(b.blocked).toEqual({ reason: 'numbers', detail: '−1500 +1600' });
    expect(numbersMoved(bi('$10 000 million').en, bi('$10,000 million').en)).toBeNull();
  });

  it('refuses option changes that reorder the options, and every change when the key moves', () => {
    const { q, codecs } = setup();
    const [swapped] = parsePolishReply(polishReplyOf([{ q: 'q1', answer: 'B', fields: [
      { id: 'q1.stem1', en: 'Suppose the price of Good X rises. Which of the following will <b>NOT</b> happen?' },
      { id: 'q1.A', en: 'Its demand falls.', zh: '其需求下降。' },
      { id: 'q1.B', en: 'Its quantity demanded falls.', zh: '其需求量下降。' },
    ] }]))!;
    const changes = changesOf(q, swapped, codecs);
    expect(changes.map((c) => c.blocked?.reason)).toEqual([undefined, 'order', 'order']);

    const [key] = parsePolishReply(polishReplyOf([{ q: 'q1', answer: 'C', fields: [
      { id: 'q1.stem1', en: 'Suppose the price of Good X rises. Which of the following will <b>NOT</b> happen?' },
    ] }]))!;
    expect(changesOf(q, key, codecs)[0].blocked).toEqual({ reason: 'key', detail: 'B → C' });
  });

  it('reads a reworded option as kept in place, and a swap as moved', () => {
    const before = ELASTIC.options.map(([en, zh]) => bi(en, zh));
    const reworded = [bi('Its quantity demanded will fall.', '其需求量會下降。'), ...before.slice(1)];
    expect(orderMoved(before, reworded, ['en', 'zh'])).toBe(false);
    expect(orderMoved(before, [before[1], before[0], ...before.slice(2)], ['en'])).toBe(true);
  });
});

describe('the run', () => {
  it('runs the style check before and after, and chunks five questions to a request', async () => {
    const specs = Array.from({ length: 6 }, () => ELASTIC);
    const ws = paperOf(...specs);
    const questions = polishQuestions(ws, { kind: 'paper' });
    const client = scriptedClient([
      (req) => polishReplyOf(polishPayload(req).questions.map((q) => ({ q: q.q, answer: q.answer, fields: [
        { id: `${q.q}.stem1`, en: 'Suppose the price of Good X rises. Which of the following will <b>NOT</b> happen?', zh: '假設物品 X 的價格上升，下列哪項<b>不會</b>出現？' },
      ] }))),
    ]);
    const outcome = await runPolish(questions, { client, preset }, signal);
    expect(client.requests).toHaveLength(2);
    expect(outcome).toMatchObject({ total: 6, reviewed: 6, failed: 0, stopped: false });
    const [first] = outcome.results;
    const ids = (list: typeof first.styleBefore) => list.map((f) => f.id);
    expect(ids(first.styleBefore)).toEqual(expect.arrayContaining(['style.negativeCase', 'style.zhPunctuation']));
    expect(ids(first.styleAfter)).not.toContain('style.negativeCase');
    expect(ids(first.styleAfter)).not.toContain('style.zhPunctuation');
  });

  it('asks again once for an unreadable reply, then gives the question up', async () => {
    const ws = paperOf(ELASTIC);
    const client = scriptedClient(['not json', 'still not']);
    const outcome = await runPolish(polishQuestions(ws, { kind: 'paper' }), { client, preset }, signal);
    expect(client.requests).toHaveLength(2);
    expect(outcome).toMatchObject({ reviewed: 0, failed: 1, results: [] });
  });
});

describe('applying', () => {
  it('writes both languages of a text at once, and skips a text edited since', () => {
    const ws = paperOf(ELASTIC);
    const [q] = polishQuestions(ws, { kind: 'paper' });
    const stem = q.fields[0];
    const edit = { path: stem.path, before: stem.text, after: bi('Which of the following will **NOT** happen?', '下列哪項**不會**出現？') };
    const { worksheet, applied } = applyPolishEdits(ws, [edit]);
    expect(applied).toBe(1);
    const text = collectTexts(worksheet).find((s) => s.path === stem.path)!.text;
    expect(plain(text.en)).toBe('Which of the following will NOT happen?');
    expect(plain(text.zh)).toBe('下列哪項不會出現？');
    // Applied once: the same edit again finds the text changed and leaves it.
    expect(applyPolishEdits(worksheet, [edit])).toEqual({ worksheet, applied: 0 });
  });
});

describe('the diff', () => {
  it('marks words in English and characters in 中文', () => {
    expect(diffText('Which one of the following will not happen?', 'Which of the following will NOT happen?')).toEqual([
      { text: 'Which ', op: 'same' },
      { text: 'one ', op: 'del' },
      { text: 'of the following will ', op: 'same' },
      { text: 'not ', op: 'del' },
      { text: 'NOT ', op: 'ins' },
      { text: 'happen?', op: 'same' },
    ]);
    const zh = diffText('下面哪一個不會出現?', '下列哪項不會出現？');
    expect(zh.filter((p) => p.op === 'same').map((p) => p.text).join('')).toBe('下哪不會出現');
  });
});
