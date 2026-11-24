import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { create } from 'zustand';
import { presetFor } from '@/ai/providers';
import { UiLanguageOverride } from '@/i18n/language';
import type { PastPaperState, TopicState } from '@/pastpapers/bank';
import { EXAMPLE, okOutcome, studioDraft } from '@/questionStudio/fixtures';
import { EMPTY_CORPUS } from '@/questionStudio/nearCopy';
import type { StudioEnv } from '@/questionStudio/session';
import type { SourceQuestion } from '@/questionStudio/types';
import { chatReferences, findPastItem, referenceByLabel } from '../referenceItem';
import { localChatStorage } from './chatStorage';
import { createChatStore } from './chatStore';
import type { Chat } from './chatTypes';
import { ChatTurns } from './ChatTurns';
import type { StudioEngine } from './engine';
import { computerPick } from './engine';
import { PaperCanvas } from './PaperCanvas';

/**
 * k-0547 (u-kt78): a chat's reference stays viewable for as long as the chat exists. Before,
 * Side by side read only the chat's current reference list, so removing the composer's chip
 * or a later request that found no reference greyed it out for drafts written from one; and
 * the printed form was only found in bank topics already read this session.
 */

const noop = () => {};
const preset = presetFor('gemini');

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

const AUTO: SourceQuestion = { ...EXAMPLE, id: 'DSE2020/P1/Q23', label: 'HKDSE 2020 Paper 1 Q23', auto: true };

function setup(references: StudioEnv['references']) {
  let n = 0;
  const engine: StudioEngine = {
    pick: async (input) => computerPick(input),
    write: async (request) => okOutcome(Array.from({ length: request.count }, () => studioDraft(`d${++n}`))),
    refine: async () => okOutcome([studioDraft(`r${++n}`)]),
  };
  const env: StudioEnv = {
    resolve: async () => ({ ok: true, deps: { client: {} as never, preset, glossary: null, corpus: EMPTY_CORPUS }, compared: { past: 10, mine: 0 } }),
    references,
  };
  const store = memory();
  const make = () => createChatStore({ env, engine, storage: localChatStorage(store), language: () => 'en', initialSettings: { count: 1 } });
  const useChat = make();
  const chat = () => useChat.getState().chats.find((c) => c.id === useChat.getState().activeId) as Chat;
  return { useChat, chat, make };
}

function canvas(chat: Chat, lang: 'en' | 'zh-HK' = 'en') {
  return renderToStaticMarkup(
    <UiLanguageOverride.Provider value={lang}>
      <PaperCanvas
        chat={chat}
        items={{}}
        language="en"
        onAccept={noop}
        onReject={noop}
        onChange={noop}
        onAsk={noop}
        onShowVersion={noop}
        onEdit={noop}
        onUndoEdit={noop}
        onShowReference={noop}
        footer={null}
      />
    </UiLanguageOverride.Provider>,
  );
}

const compareButton = (html: string) => /<button[^>]*data-view-button="compare"[^>]*>/.exec(html)?.[0] ?? '';

describe('a chat keeps its reference (k-0547)', () => {
  it('the teacher’s reference removed from the composer after drafts: Side by side still sets it beside them, after a reload too', async () => {
    const { useChat, chat, make } = setup(async () => []);
    useChat.getState().addReference(EXAMPLE, 'C.ped');
    await useChat.getState().send('');
    expect(chat().drafts).toHaveLength(1);
    useChat.getState().removeReference(EXAMPLE.id);
    expect(chat().refs).toEqual([]);
    expect(chatReferences(chat()).map((r) => r.source.id)).toEqual([EXAMPLE.id]);
    expect(compareButton(canvas(chat()))).not.toMatch(/ (aria-)?disabled="/);

    // A reload: the chat is read back from storage.
    const again = make();
    const restored = again.getState().chats.find((c) => c.drafts.length > 0) as Chat;
    expect(chatReferences(restored).map((r) => r.source.id)).toEqual([EXAMPLE.id]);
    expect(compareButton(canvas(restored))).not.toMatch(/ (aria-)?disabled="/);
  });

  it('a later request that finds no reference (bank unreachable) does not take the earlier drafts’ reference away', async () => {
    let calls = 0;
    const { useChat, chat } = setup(async () => (calls++ === 0 ? [AUTO] : []));
    await useChat.getState().send('write one on price elasticity');
    expect(chat().refs.map((r) => r.who)).toEqual(['ai']);
    await useChat.getState().send('another on tax incidence', undefined, { asNew: true });
    expect(chat().drafts.length).toBeGreaterThanOrEqual(2);
    // The chat's current list is empty now, as the second request found none …
    expect(chat().refs).toEqual([]);
    // … but the first draft's reference is still there to compare with.
    expect(chatReferences(chat()).map((r) => r.source.id)).toEqual([AUTO.id]);
    expect(compareButton(canvas(chat()))).not.toMatch(/ (aria-)?disabled="/);
  });

  it('the AI’s chosen references in the chat are badges that open the question', async () => {
    const { useChat, chat } = setup(async () => [AUTO]);
    await useChat.getState().send('write one on price elasticity');
    expect(referenceByLabel(chat(), AUTO.label, { auto: true })?.id).toBe(AUTO.id);
    const html = renderToStaticMarkup(<ChatTurns chat={chat()} language="en" onJump={noop} onRetry={noop} onDismiss={noop} onChangePick={noop} onAnswer={noop} />);
    expect(html).toContain(`data-step-ref="${AUTO.id}"`);
    expect(html).toContain(`data-ref-view="${AUTO.id}"`);
    expect(html).toContain('Chose 1 real HKDSE question to write like:');
  });

  it('no reference at all: Side by side is not silently greyed out; it says why, in English and 中文', () => {
    const { chat } = setup(async () => []);
    const bare: Chat = { ...chat(), drafts: [] };
    const button = compareButton(canvas(bare));
    expect(button).toMatch(/aria-disabled="true"/);
    expect(button).not.toMatch(/ disabled="/);
    expect(button).toContain('No reference question: the AI wrote from the key point alone.');
    expect(compareButton(canvas(bare, 'zh-HK'))).toContain('沒有參考題：AI 只按學習要點擬題。');
  });
});

// ---- finding the printed form again by its tag ----

const ITEM = { source: { tag: 'DSE2020/P1/Q23' }, question: { id: 'q23' } };
const DOC = { id: 'topic-doc' };

function bank(over: Partial<PastPaperState> & { topicResult?: TopicState; openTo?: Partial<PastPaperState> } = {}) {
  const topicsRead: string[] = [];
  const useBank = create<PastPaperState>((set, get) => ({
    base: 'https://bank.example/',
    status: 'idle',
    offline: false,
    topics: {},
    open: async () => {
      set({ status: 'ready', manifest: { topics: [{ id: 'C' }], search: [{ topicId: 'C', source: { tag: 'DSE2020/P1/Q23' } }] } as never, ...over.openTo });
    },
    topic: async (id) => {
      topicsRead.push(id);
      const next = over.topicResult ?? ({ state: 'ready', data: { items: [ITEM], doc: DOC }, offline: false } as unknown as TopicState);
      set({ topics: { ...get().topics, [id]: next } });
      return next;
    },
    loadAll: async () => {},
    ...over,
  }));
  return { useBank, topicsRead };
}

describe('the printed reference, found again (k-0547)', () => {
  it('after a reload no topic is read yet: the bank’s search index names the topic, which is read again', async () => {
    const { useBank, topicsRead } = bank();
    const found = await findPastItem(useBank, 'DSE2020/P1/Q23');
    expect(topicsRead).toEqual(['C']);
    expect(found).toMatchObject({ item: ITEM, doc: DOC });
  });

  it('says why when it cannot be found: bank off, unreachable, topic failed, no longer listed', async () => {
    expect(await findPastItem(bank({ openTo: { status: 'off', manifest: undefined } }).useBank, 'DSE2020/P1/Q23')).toEqual({ missing: 'bankOff' });
    expect(await findPastItem(bank({ openTo: { status: 'error', manifest: undefined } }).useBank, 'DSE2020/P1/Q23')).toEqual({ missing: 'bankError' });
    expect(await findPastItem(bank({ topicResult: { state: 'error', reason: 'offline' } as TopicState }).useBank, 'DSE2020/P1/Q23')).toEqual({ missing: 'bankError' });
    expect(await findPastItem(bank().useBank, 'DSE1999/P1/Q1')).toEqual({ missing: 'notInBank' });
  });

  it('waits for a list another screen is already reading', async () => {
    const { useBank } = bank();
    useBank.setState({ status: 'loading', open: async () => {} });
    const pending = findPastItem(useBank, 'DSE2020/P1/Q23');
    await Promise.resolve();
    useBank.setState({ status: 'ready', manifest: { topics: [{ id: 'C' }], search: [{ topicId: 'C', source: { tag: 'DSE2020/P1/Q23' } }] } as never });
    expect(await pending).toMatchObject({ item: ITEM });
  });
});
