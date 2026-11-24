import { beforeEach, describe, expect, it } from 'vitest';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { resolveFlow } from '@/model/flow';
import { studioDraft } from '@/questionStudio/fixtures';
import { useWorksheetStore } from '@/store/worksheetStore';
import { buildsOf } from '@/questionStudio/deliver';
import type { Chat, ChatDraft } from '../chat/chatTypes';
import type { RunState } from '../chat/chatStore';
import { emptyLive } from '@/questionStudio/stream';
import { GHOST_PREFIX, ghostNumbers, ghostsOf, withGhosts } from './ghosts';
import { MIN_TAGGED, paperCoverage } from './coverage';

const store = () => useWorksheetStore.getState();

function chatWith(drafts: ChatDraft[], paper = 'p'): Chat {
  return { v: 1, id: 'c1', createdAt: 'a', updatedAt: 'a', refs: [], turns: [], drafts, picks: [], settings: { count: 3, level: 'same', language: 'en' }, lastText: '', paper };
}
const request = { keyPoint: 'C.ped', points: [], examples: [], strict: false, count: 3, level: 'same', shape: 'any', sides: ['en'], note: '' } as const;
const draft = (id: string, no: number, state: ChatDraft['state'] = 'open', status?: 'ok' | 'look' | 'failed'): ChatDraft => ({
  id,
  no,
  entry: { draft: studioDraft(`s-${id}`, status === 'failed' ? { rows: [{ id: 'key', state: 'fail', findings: [] }] } : status === 'look' ? { rows: [{ id: 'key', state: 'look', findings: [] }] } : {}), request: { ...request, sides: ['en'] } },
  older: [],
  state,
  turnId: 't',
});
const order = (w: ReturnType<typeof store>['worksheet']) => resolveFlow(w).map((item) => item.id);

describe('the ✦ Write panel’s drafts on the page (k-0516 B)', () => {
  beforeEach(() => {
    store().replaceWorksheet(createWorksheetFrom({ documentType: 'classroom', seedSample: false }));
    for (let i = 0; i < 4; i += 1) store().addQuestion('mcq');
  });

  it('open drafts only, in draft order, a warned (or pre-k-0531 failed) one too in red; rejected and added ones stay off the page', () => {
    const chat = chatWith([draft('b', 2), draft('a', 1), draft('x', 3, 'rejected'), draft('y', 4, 'added'), draft('z', 5, 'open', 'failed'), draft('l', 6, 'open', 'look')]);
    const ghosts = ghostsOf(chat, undefined);
    expect(ghosts.map((g) => g.draftId)).toEqual(['a', 'b', 'z', 'l']);
    expect(ghosts.map((g) => g.status)).toEqual(['ok', 'ok', 'warn', 'look']);
    expect(ghosts[0].id).toBe(`${GHOST_PREFIX}a`);
    expect(ghosts[0].question.id).toBe(ghosts[0].id);
    expect(ghosts[0].question.aiMade).toBe(true);
  });

  it('draws them exactly where Accept puts them: after the anchor, numbered as they would be', () => {
    const anchor = store().worksheet.questions[1].id;
    store().setInsertAnchor(anchor);
    const chat = chatWith([draft('a', 1), draft('b', 2)]);
    const ghosts = ghostsOf(chat, undefined);
    const shown = withGhosts(store().worksheet, ghosts, anchor);
    const numbers = ghostNumbers(shown, ghosts);
    expect([...numbers.values()]).toEqual(['3', '4']);
    // The real insert of the same builds lands in the same slots.
    const before = order(store().worksheet);
    const report = store().insertQuestionBatch(buildsOf(chat.drafts.map((d) => d.entry)), { worksheetId: store().worksheet.id });
    if (!report.ok) throw new Error('refused');
    const real = order(store().worksheet);
    const drawn = order(shown).map((id) => (id === ghosts[0].id ? report.questionIds[0] : id === ghosts[1].id ? report.questionIds[1] : id));
    expect(drawn).toEqual(real);
    expect(real.length).toBe(before.length + 2);
  });

  it('with no anchor (or a stale one) they take the unanchored insert’s place', () => {
    const chat = chatWith([draft('a', 1)]);
    const ghosts = ghostsOf(chat, undefined);
    store().setInsertAnchor(undefined);
    const unanchored = order(withGhosts(store().worksheet, ghosts, undefined));
    expect(order(withGhosts(store().worksheet, ghosts, 'gone'))).toEqual(unanchored);
    const report = store().insertQuestionBatch(buildsOf(chat.drafts.map((d) => d.entry)), { worksheetId: store().worksheet.id });
    if (!report.ok) throw new Error('refused');
    expect(unanchored.indexOf(ghosts[0].id)).toBe(order(store().worksheet).indexOf(report.questionIds[0]));
  });

  it('while the AI writes, the words so far show as a draft being written; a change marks its draft', () => {
    const chat = chatWith([draft('a', 1)]);
    const live = { ...emptyLive(), drafts: [{ index: 0, attempt: 1 as const, partial: { index: 0, stem: { en: 'A unit tax on', zh: '' }, statements: [], options: [{ en: 'g', zh: '' }], explanation: { en: '', zh: '' }, angle: '', complete: false } }, { index: 1, attempt: 1 as const }] };
    const writing: RunState = { chatId: 'c1', turnId: 't2', live, count: 2 };
    const ghosts = ghostsOf(chat, writing);
    expect(ghosts.map((g) => g.status)).toEqual(['ok', 'writing']);
    const changing: RunState = { chatId: 'c1', turnId: 't3', live: emptyLive(), count: 1, target: 'a' };
    expect(ghostsOf(chat, changing).map((g) => g.status)).toEqual(['changing']);
    // Another chat's run never shows on this paper.
    expect(ghostsOf(chat, { ...writing, chatId: 'other' })).toHaveLength(1);
  });
});

describe('the opener’s topics (from the paper’s tags, nothing sent)', () => {
  const q = (tags: string[]) => ({ ...store().worksheet.questions[0], tags });
  beforeEach(() => {
    store().replaceWorksheet(createWorksheetFrom({ documentType: 'classroom', seedSample: false }));
    store().addQuestion('mcq');
  });

  it('counts each compulsory topic once per question and offers the first one with none', () => {
    const c = paperCoverage({ questions: [q(['A.scarcity']), q(['B', 'B.firms']), q(['D.gdp', 'A']), q(['free tag'])] });
    expect(c.tagged).toBe(3);
    expect(c.topics.find((t) => t.topic.code === 'A')?.count).toBe(2);
    expect(c.topics.find((t) => t.topic.code === 'B')?.count).toBe(1);
    expect(c.gap?.code).toBe('C');
    expect(c.topics.every((t) => t.topic.part === 'compulsory')).toBe(true);
  });

  it('says nothing about gaps in a paper too little tagged', () => {
    const c = paperCoverage({ questions: Array.from({ length: MIN_TAGGED - 1 }, () => q(['A'])) });
    expect(c.gap).toBeUndefined();
  });
});
