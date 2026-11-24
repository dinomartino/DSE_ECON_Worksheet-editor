import { describe, expect, it } from 'vitest';
import '@/registry';
import { presetFor } from '@/ai/providers';
import { buildsOf, materialize } from '@/questionStudio/deliver';
import { richOf } from '@/questionStudio/edit';
import { EXAMPLE, okOutcome, studioDraft } from '@/questionStudio/fixtures';
import { EMPTY_CORPUS } from '@/questionStudio/nearCopy';
import type { StudioEnv } from '@/questionStudio/session';
import type { McqQuestion } from '@/model/types';
import type { Refinement, StudioDraft } from '@/questionStudio/types';
import { localChatStorage } from './chatStorage';
import { createChatStore } from './chatStore';
import type { Chat, ChatDraft } from './chatTypes';
import { computerPick, type StudioEngine } from './engine';
import { currentNumber, numbered, versionsOf } from './versions';

/** k-0530 (u-xjpd, u-hyt5): the teacher edits a draft by hand, and every version is kept in a list. */

function setup() {
  const calls = { picks: 0, writes: 0, refines: [] as Array<{ refinement: Refinement; target: StudioDraft }>, resolves: 0, localChecks: 0 };
  let n = 0;
  const engine: StudioEngine = {
    pick: async (input) => {
      calls.picks += 1;
      return computerPick(input);
    },
    write: async (request) => {
      calls.writes += 1;
      return okOutcome(Array.from({ length: request.count }, () => studioDraft(`d${++n}`)));
    },
    refine: async (_request, target, refinement) => {
      calls.refines.push({ refinement, target });
      return okOutcome([studioDraft(`r${++n}`)]);
    },
  };
  const env: StudioEnv = {
    resolve: async () => {
      calls.resolves += 1;
      return { ok: true, deps: { client: {} as never, preset: presetFor('gemini'), glossary: null, corpus: EMPTY_CORPUS }, compared: { past: 1, mine: 0 } };
    },
    references: async () => [],
    localChecks: async () => {
      calls.localChecks += 1;
      return { glossary: null, corpus: EMPTY_CORPUS };
    },
  };
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  const useChat = createChatStore({ env, engine, storage: localChatStorage(storage), language: () => 'en' });
  const chat = () => useChat.getState().chats.find((c) => c.id === useChat.getState().activeId) as Chat;
  const first = () => chat().drafts[0] as ChatDraft;
  return { useChat, chat, first, calls, storage };
}

async function written() {
  const s = setup();
  s.useChat.getState().addReference(EXAMPLE, 'C.ped');
  await s.useChat.getState().send('');
  return s;
}

const withStem = (draft: StudioDraft, en: string) => ({ rich: { ...richOf(draft), stem: { en: [{ text: en }], zh: richOf(draft).stem.zh } }, answerIndex: draft.draft.answerIndex });

describe('editing a draft in the studio (k-0530)', () => {
  it('Save asks no AI: no pick, write, change or provider; only the local checks', async () => {
    const { useChat, first, calls } = await written();
    const before = { ...calls, refines: calls.refines.length };
    await useChat.getState().editDraft(first().id, withStem(first().entry.draft, 'A milk tea shop raises its price from $20 to $24.'));
    expect({ picks: calls.picks, writes: calls.writes, refines: calls.refines.length, resolves: calls.resolves }).toEqual({ picks: before.picks, writes: before.writes, refines: before.refines, resolves: before.resolves });
    expect(calls.localChecks).toBe(1);
    expect(first().entry.draft.draft.stem.en).toBe('A milk tea shop raises its price from $20 to $24.');
  });

  it('the first Save on an AI version makes 「第 2 版 · 你修改」; a second Save updates it in place; nothing is lost', async () => {
    const { useChat, first } = await written();
    const ai = first().entry.draft;
    expect(ai).toMatchObject({ version: 1, made: { by: 'ai', how: 'write' } });
    await useChat.getState().editDraft(first().id, withStem(ai, 'Edited once.'));
    expect(first().entry.draft).toMatchObject({ version: 2, edited: true, made: { by: 'you', from: 1 } });
    await useChat.getState().editDraft(first().id, withStem(first().entry.draft, 'Edited twice.'));
    expect(versionsOf(first()).map((v) => [v.no, v.version.made?.by, v.version.draft.stem.en])).toEqual([
      [2, 'you', 'Edited twice.'],
      [1, 'ai', ai.draft.stem.en],
    ]);
  });

  it('the AI’s next change works from the edited version, and makes a new version on top', async () => {
    const { useChat, first, calls } = await written();
    await useChat.getState().editDraft(first().id, withStem(first().entry.draft, 'My own stem.'));
    await useChat.getState().change(first().id, 'harder');
    expect(calls.refines.at(-1)?.target.draft.stem.en).toBe('My own stem.');
    expect(first().entry.draft).toMatchObject({ version: 3, made: { by: 'ai', how: 'harder' } });
    expect(versionsOf(first()).map((v) => v.no)).toEqual([3, 2, 1]);
  });

  it('showing an older version renumbers nothing; Accept and Add take the version shown', async () => {
    const { useChat, first } = await written();
    await useChat.getState().editDraft(first().id, withStem(first().entry.draft, 'Edited stem.'));
    const v1 = versionsOf(first()).find((v) => v.no === 1)!.version;
    useChat.getState().showVersion(first().id, v1.id);
    expect(currentNumber(first())).toBe(1);
    expect(versionsOf(first()).map((v) => v.no)).toEqual([2, 1]);
    const back = versionsOf(first()).find((v) => v.no === 2)!.version;
    useChat.getState().showVersion(first().id, back.id);
    const question = materialize(buildsOf([first().entry])[0]) as McqQuestion;
    expect(JSON.stringify(question.blocks)).toContain('Edited stem.');
  });

  it('Undo edit shows the version it came from; the edit stays in the list', async () => {
    const { useChat, first } = await written();
    await useChat.getState().editDraft(first().id, withStem(first().entry.draft, 'Edited stem.'));
    useChat.getState().undoEdit(first().id);
    expect(currentNumber(first())).toBe(1);
    expect(versionsOf(first())).toHaveLength(2);
  });

  it('Add prints the teacher’s formatting (a subscript) from the edited version', async () => {
    const { useChat, first } = await written();
    const d = first().entry.draft;
    const rich = richOf(d);
    await useChat.getState().editDraft(first().id, { rich: { ...rich, options: rich.options.map((o, i) => (i === 0 ? { en: [{ text: 'Q' }, { text: '1', sub: true }], zh: o.zh } : o)) }, answerIndex: d.draft.answerIndex });
    const question = materialize(buildsOf([first().entry])[0]) as McqQuestion;
    expect(question.options[0].text.en).toEqual([{ text: 'Q' }, { text: '1', sub: true }]);
  });

  it('a diagram changed in the diagram editor comes back to the draft and goes into the paper with it', async () => {
    const { useChat, first } = await written();
    const block = { kind: 'diagram', id: 'fig', widthPx: 300, heightPx: 200, diagram: { curves: [], points: [], labels: [], arrows: [] } } as never;
    useChat.setState({ chats: useChat.getState().chats.map((c) => ({ ...c, drafts: c.drafts.map((x, i) => (i === 0 ? { ...x, entry: { ...x.entry, draft: { ...x.entry.draft, diagram: { status: 'ok', block, placement: 'question', issues: [] } } } } : x)) })) });
    const drawn = { ...(block as object), id: 'fig2', widthPx: 360 } as never;
    await useChat.getState().editDraft(first().id, { rich: richOf(first().entry.draft), answerIndex: first().entry.draft.draft.answerIndex, diagram: drawn });
    expect(first().entry.draft.diagram).toMatchObject({ block: drawn, edited: true });
    const question = materialize(buildsOf([first().entry])[0]) as McqQuestion;
    expect(question.blocks.at(-1)).toMatchObject({ kind: 'diagram', widthPx: 360 });
  });

  it('edits are saved with the chat and come back after a reload', async () => {
    const { useChat, first, storage } = await written();
    await useChat.getState().editDraft(first().id, withStem(first().entry.draft, 'Kept after reload.'));
    const loaded = localChatStorage(storage).load()[0];
    expect(loaded.drafts[0].entry.draft).toMatchObject({ version: 2, edited: true, made: { by: 'you' } });
    expect(loaded.drafts[0].entry.draft.draft.stem.en).toBe('Kept after reload.');
  });

  it('a draft saved before k-0530 (no numbers) is numbered by its place', () => {
    const v1 = studioDraft('a');
    const v2 = studioDraft('b');
    const old = { id: 'x', no: 1, entry: { draft: v2, request: {} as never }, older: [v1], state: 'open', turnId: 't' } as ChatDraft;
    const fixed = numbered(old);
    expect([fixed.older[0].version, fixed.entry.draft.version]).toEqual([1, 2]);
  });
});
