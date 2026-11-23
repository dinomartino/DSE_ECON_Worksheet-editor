import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { aiErrorInfo } from '@/ai/errors';
import type { AiErrorInfo } from '@/ai/types';
import type { LanguageMode } from '@/model/types';
import type { PastPaperItem } from '@/pastpapers/pack';
import { sidesOf, withReferences, type Compared, type RunInfo, type StudioEnv } from '@/questionStudio/session';
import { MAX_EXAMPLES, type Refinement, type SourceQuestion, type StudioDeps, type StudioDraft, type StudioOutcome, type StudioRequest } from '@/questionStudio/types';
import type { ChatStorage } from './chatStorage';
import type { AiTurn, Chat, ChatDraft, ChatRef, ChatSettings, ChangeHow, Note, Step, Turn } from './chatTypes';
import type { KeyPick, PartialDraft, StudioEngine } from './engine';

/**
 * The chat studio's one store (k-0516): every chat, the open one, and the run in progress.
 * A request is: read the reference (if any) → the AI picks the key point (step 1, u-lm1c) →
 * write on it (step 2, streamed when the engine can) → checks. The teacher's own words after
 * drafts exist change one draft ("draft 2 …", or the draft chip from "Ask about this") or ask
 * for new ones. Nothing reaches a paper here: Add in the tray does that (`deliver.ts`).
 */

export interface RunState {
  chatId: string;
  turnId: string;
  /** Streaming drafts of the running write, by batch index (not saved). */
  partial: PartialDraft[];
  /** How many drafts this run writes (the placeholders before words arrive). */
  count: number;
  /** The draft being changed, when one is. */
  target?: string;
}

export interface ChatState {
  chats: Chat[];
  activeId: string;
  run?: RunState;
  /** The picked bank questions as they print (with their diagram), by source id, for this session's compare view. */
  items: Record<string, PastPaperItem>;

  newChat(): void;
  openChat(id: string): void;
  deleteChat(id: string): void;
  setSettings(patch: Partial<ChatSettings>): void;
  /** False when already there or `MAX_EXAMPLES` reached. */
  addReference(source: SourceQuestion, keyPoint?: string, item?: PastPaperItem): boolean;
  removeReference(id: string): void;
  /** The teacher's message. `draftId`: about that draft (the composer's draft chip). */
  send(text: string, draftId?: string): Promise<void>;
  /** A quick change on one draft (the card's Harder / Easier / Another). */
  change(draftId: string, how: Exclude<ChangeHow, 'change'>): Promise<void>;
  /** The teacher changes the AI's pick (never required). Asks before rewriting existing drafts. */
  changePick(code: string): void;
  answerRewrite(turnId: string, answer: 'rewrite' | 'keep'): Promise<void>;
  setDraftState(draftId: string, state: 'open' | 'accepted' | 'rejected'): void;
  /** Back to an older version of a draft (the current one becomes the newest older one). */
  restoreVersion(draftId: string, index: number): void;
  delivered(draftIds: readonly string[]): void;
  stop(): void;
  retry(turnId: string): Promise<void>;
  /** The error notice closed: the reply keeps its line, the notice is not raised again. */
  dismissError(turnId: string): void;
}

export interface ChatDeps {
  env: StudioEnv;
  engine: StudioEngine;
  storage: ChatStorage;
  language: () => LanguageMode;
  now?: () => Date;
  newId?: () => string;
  /** After every run that reached the provider (the Trial kit records the teacher's own requests). A throw is ignored. */
  onRun?: (info: RunInfo) => void;
}

const DRAFT_REF = /(?:draft|草稿)\s*(\d+)|\bQ\s*(\d+)\b/i;

export function createChatStore(deps: ChatDeps): UseBoundStore<StoreApi<ChatState>> {
  const now = () => (deps.now ? deps.now() : new Date()).toISOString();
  let seq = 0;
  const newId = deps.newId ?? (() => `c${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`);

  const blank = (): Chat => ({
    v: 1,
    id: newId(),
    createdAt: now(),
    updatedAt: now(),
    refs: [],
    turns: [],
    drafts: [],
    picks: [],
    settings: { count: 3, level: 'same', language: deps.language() },
    lastText: '',
  });

  const stored = deps.storage.load();
  const first = blank();

  return create<ChatState>((set, get) => {
    let controller: AbortController | undefined;
    const lastAction = new Map<string, () => Promise<void>>();

    const active = (): Chat => get().chats.find((c) => c.id === get().activeId) ?? get().chats[0];
    const save = () => deps.storage.save(get().chats);
    /** Changes one chat (and saves). */
    const edit = (chatId: string, fn: (chat: Chat) => Chat) => {
      set({ chats: get().chats.map((c) => (c.id === chatId ? { ...fn(c), updatedAt: now() } : c)) });
      save();
    };
    const editTurn = (chatId: string, turnId: string, fn: (turn: AiTurn) => AiTurn) =>
      edit(chatId, (c) => ({ ...c, turns: c.turns.map((t) => (t.id === turnId && t.role === 'ai' ? fn(t) : t)) }));
    const setStep = (chatId: string, turnId: string, step: Step) =>
      editTurn(chatId, turnId, (t) => {
        const at = t.steps.findIndex((s) => s.kind === step.kind && (s.kind !== 'change' || step.kind !== 'change' || s.draftNo === step.draftNo));
        return { ...t, steps: at < 0 ? [...t.steps, step] : t.steps.map((s, i) => (i === at ? step : s)) };
      });
    const addNote = (chatId: string, turnId: string, note: Note) => editTurn(chatId, turnId, (t) => ({ ...t, notes: [...t.notes, note] }));
    const running = () => get().run !== undefined;

    const pushTurns = (chatId: string, ...turns: Turn[]) => edit(chatId, (c) => ({ ...c, turns: [...c.turns, ...turns] }));

    const aiTurn = (): AiTurn => ({ id: newId(), role: 'ai', steps: [], notes: [], draftIds: [] });

    const requestFor = (chat: Chat, text: string, picks: KeyPick[]): StudioRequest => {
      const mine = chat.refs.filter((r) => r.who === 'you').map((r) => r.source);
      return {
        keyPoint: picks[0]?.code ?? '',
        points: [],
        examples: mine,
        strict: mine.length > 0,
        count: chat.settings.count,
        level: chat.settings.level,
        shape: 'any',
        sides: sidesOf(chat.settings.language),
        note: text,
      };
    };

    /** Resolve the provider; an error lands on the turn. */
    async function resolve(chatId: string, turnId: string, signal: AbortSignal): Promise<{ deps: StudioDeps; compared: Compared } | undefined> {
      const resolved = await deps.env.resolve();
      if (signal.aborted) return undefined;
      if (!resolved.ok) {
        editTurn(chatId, turnId, (t) => ({ ...t, error: resolved.error }));
        return undefined;
      }
      return { deps: resolved.deps, compared: resolved.compared };
    }

    const record = (info: RunInfo) => {
      try {
        deps.onRun?.(info);
      } catch {
        // A record that cannot be kept never takes the run down.
      }
    };

    /** A finished reply: nothing left spinning. */
    const settle = (chatId: string, turnId: string) =>
      editTurn(chatId, turnId, (t) => ({ ...t, steps: t.steps.map((s) => (s.state === 'run' ? { ...s, state: 'done' } : s)) }));

    const failTurn = (chatId: string, turnId: string, error: AiErrorInfo) =>
      editTurn(chatId, turnId, (t) => ({ ...t, error, steps: t.steps.map((s) => (s.state === 'run' ? { ...s, state: 'fail' } : s)) }));

    /** Runs `body` as the one run; settles the run state whatever happens. */
    async function exclusive(chatId: string, turnId: string, count: number, body: (signal: AbortSignal) => Promise<void>, target?: string) {
      if (running()) return;
      const mine = new AbortController();
      controller = mine;
      set({ run: { chatId, turnId, partial: [], count, ...(target ? { target } : {}) } });
      try {
        await body(mine.signal);
      } finally {
        if (controller === mine) controller = undefined;
        set({ run: undefined });
      }
    }

    const hooksFor = (chatId: string, turnId: string, count: number, signal: AbortSignal, change = false) => ({
      signal,
      progress: (done: number, total: number, stage: string) => {
        if (stage === 'solve') {
          setStep(chatId, turnId, { kind: 'write', state: 'done', count });
          setStep(chatId, turnId, { kind: 'check', state: 'run' });
        } else if (stage !== 'references' && !change) setStep(chatId, turnId, { kind: 'write', state: 'run', count, done, total });
      },
      partial: (draft: PartialDraft) => {
        const run = get().run;
        if (!run || run.turnId !== turnId) return;
        const partial = [...run.partial];
        partial[draft.index] = draft;
        set({ run: { ...run, partial } });
      },
    });

    /** Writes on the chat's picks; `replace` = the open drafts give way to the new ones (a rewrite). */
    async function writeOn(chatId: string, turnId: string, text: string, signal: AbortSignal, replace = false) {
      const chat = get().chats.find((c) => c.id === chatId);
      if (!chat) return;
      const asked = requestFor(chat, text, chat.picks);
      if (!asked.keyPoint) {
        addNote(chatId, turnId, { kind: 'noPick' });
        return;
      }
      const ready = await resolve(chatId, turnId, signal);
      if (!ready) return;
      let request = asked;
      if (asked.examples.length === 0) {
        setStep(chatId, turnId, { kind: 'refs', state: 'run', labels: [] });
        request = await withReferences(asked, deps.env, { signal });
        const auto = request.examples.filter((e) => e.auto);
        setStep(chatId, turnId, { kind: 'refs', state: 'done', labels: auto.map((e) => e.label) });
        // The real questions the studio chose show in the reference bar (the AI's, not the teacher's).
        edit(chatId, (c) => ({ ...c, refs: [...c.refs.filter((r) => r.who === 'you'), ...auto.map((source): ChatRef => ({ source, who: 'ai' }))] }));
      }
      if (signal.aborted) return;
      const count = request.count;
      setStep(chatId, turnId, { kind: 'write', state: 'run', count });
      const avoid = (get().chats.find((c) => c.id === chatId)?.drafts ?? []).filter((d) => d.state !== 'rejected').map((d) => d.entry.draft);
      let outcome: StudioOutcome;
      try {
        outcome = await deps.engine.write(request, ready.deps, hooksFor(chatId, turnId, count, signal), replace ? [] : avoid);
      } catch {
        failTurn(chatId, turnId, aiErrorInfo('badOutput', ready.deps.preset.id));
        return;
      }
      record({ kind: 'write', request, outcome, compared: ready.compared });
      if (!outcome.ok) {
        if (outcome.error.kind === 'cancelled') {
          editTurn(chatId, turnId, (t) => ({ ...t, steps: t.steps.map((s) => (s.state === 'run' ? { ...s, state: 'fail' } : s)) }));
          addNote(chatId, turnId, { kind: 'stopped' });
        } else failTurn(chatId, turnId, outcome.error);
        return;
      }
      setStep(chatId, turnId, { kind: 'write', state: 'done', count });
      setStep(chatId, turnId, { kind: 'check', state: 'done' });
      settle(chatId, turnId);
      edit(chatId, (c) => {
        const kept = replace ? c.drafts.filter((d) => d.state !== 'open') : c.drafts;
        let no = c.drafts.reduce((max, d) => Math.max(max, d.no), 0);
        const fresh = outcome.drafts.map((draft): ChatDraft => ({ id: newId(), no: ++no, entry: { draft, request }, older: [], state: 'open', turnId }));
        return {
          ...c,
          drafts: [...kept, ...fresh],
          turns: c.turns.map((t) => (t.id === turnId && t.role === 'ai' ? { ...t, draftIds: fresh.map((d) => d.id) } : t)),
        };
      });
      const made = outcome.drafts;
      addNote(chatId, turnId, {
        kind: 'written',
        ok: made.filter((d) => d.status === 'ok').length,
        look: made.filter((d) => d.status === 'look').length,
        failed: made.filter((d) => d.status === 'failed').length,
      });
    }

    /** A new request: read → pick → write. */
    async function request(text: string) {
      const chat = active();
      const chatId = chat.id;
      const mine = chat.refs.filter((r) => r.who === 'you');
      const user: Turn = { id: newId(), role: 'user', text, refs: mine.map((r) => r.source.label) };
      const ai = aiTurn();
      pushTurns(chatId, user, ai);
      edit(chatId, (c) => ({ ...c, lastText: text }));
      const action = () => request(text);
      lastAction.set(ai.id, action);
      await exclusive(chatId, ai.id, chat.settings.count, async (signal) => {
        if (mine.length) setStep(chatId, ai.id, { kind: 'read', state: 'done', labels: mine.map((r) => r.source.label) });
        setStep(chatId, ai.id, { kind: 'pick', state: 'run', picks: [], by: 'ai' });
        const ready = await resolve(chatId, ai.id, signal);
        if (!ready) return;
        const tagged = Object.fromEntries(mine.filter((r) => r.keyPoint).map((r) => [r.source.id, r.keyPoint as string]));
        const picked = await deps.engine.pick({ text, examples: mine.map((r) => r.source), tagged }, ready.deps, signal);
        if (!picked.ok) {
          failTurn(chatId, ai.id, picked.error);
          return;
        }
        // Nothing to go on in a follow-up ("the same in Chinese"): the chat's key point stands.
        const picks = picked.picks.length ? picked.picks : get().chats.find((c) => c.id === chatId)?.picks ?? [];
        setStep(chatId, ai.id, { kind: 'pick', state: 'done', picks, by: picked.local ? 'computer' : 'ai' });
        edit(chatId, (c) => ({ ...c, picks }));
        if (!picks.length) {
          addNote(chatId, ai.id, { kind: 'noPick' });
          return;
        }
        await writeOn(chatId, ai.id, text, signal);
      });
    }

    /** One draft changed (or one more like it), with the teacher's words when there are any. */
    async function changeDraft(draftId: string, refinement: Refinement, said: string) {
      const chat = active();
      const chatId = chat.id;
      const target = chat.drafts.find((d) => d.id === draftId);
      if (!target) return;
      const how: ChangeHow = refinement.kind;
      const user: Turn = { id: newId(), role: 'user', text: said, refs: [], draftNo: target.no, ...(said ? {} : { how }) };
      const ai = aiTurn();
      pushTurns(chatId, user, ai);
      lastAction.set(ai.id, () => changeDraft(draftId, refinement, said));
      await exclusive(
        chatId,
        ai.id,
        1,
        async (signal) => {
          // A change stays on the draft's own key point (whatever the chat's pick is now).
          setStep(chatId, ai.id, { kind: 'pick', state: 'done', picks: [{ code: target.entry.request.keyPoint, reason: '' }], by: 'draft' });
          setStep(chatId, ai.id, { kind: 'change', state: 'run', draftNo: target.no, how });
          const ready = await resolve(chatId, ai.id, signal);
          if (!ready) return;
          const others = chat.drafts.filter((d) => d.id !== draftId && d.state !== 'rejected').map((d) => d.entry.draft);
          let outcome: StudioOutcome;
          try {
            outcome = await deps.engine.refine(target.entry.request, target.entry.draft, refinement, others, ready.deps, hooksFor(chatId, ai.id, 1, signal, true));
          } catch {
            failTurn(chatId, ai.id, aiErrorInfo('badOutput', ready.deps.preset.id));
            return;
          }
          record({ kind: 'refine', request: target.entry.request, outcome, compared: ready.compared });
          if (!outcome.ok) {
            if (outcome.error.kind === 'cancelled') addNote(chatId, ai.id, { kind: 'stopped' });
            else failTurn(chatId, ai.id, outcome.error);
            return;
          }
          const made = outcome.drafts[0];
          setStep(chatId, ai.id, { kind: 'change', state: 'done', draftNo: target.no, how });
          settle(chatId, ai.id);
          if (!made) return;
          if (how === 'another') {
            let no = 0;
            edit(chatId, (c) => {
              no = c.drafts.reduce((max, d) => Math.max(max, d.no), 0) + 1;
              const fresh: ChatDraft = { id: newId(), no, entry: { draft: made, request: target.entry.request }, older: [], state: 'open', turnId: ai.id };
              const at = c.drafts.findIndex((d) => d.id === draftId);
              const drafts = [...c.drafts.slice(0, at + 1), fresh, ...c.drafts.slice(at + 1)];
              return { ...c, drafts, turns: c.turns.map((t) => (t.id === ai.id && t.role === 'ai' ? { ...t, draftIds: [fresh.id] } : t)) };
            });
            addNote(chatId, ai.id, { kind: 'another', draftNo: no });
          } else {
            let version = 1;
            edit(chatId, (c) => ({
              ...c,
              drafts: c.drafts.map((d) => {
                if (d.id !== draftId) return d;
                version = d.older.length + 2;
                // Changed: read it again, so it is open (not accepted) until the teacher says.
                return { ...d, older: [...d.older, d.entry.draft], entry: { ...d.entry, draft: made }, state: 'open' };
              }),
              turns: c.turns.map((t) => (t.id === ai.id && t.role === 'ai' ? { ...t, draftIds: [draftId] } : t)),
            }));
            addNote(chatId, ai.id, { kind: 'changed', draftNo: target.no, version });
          }
        },
        draftId,
      );
    }

    return {
      chats: [first, ...stored],
      activeId: first.id,
      run: undefined,
      items: {},

      newChat: () => {
        const current = active();
        // An empty chat is reused, never stacked.
        if (current && current.turns.length === 0 && current.refs.length === 0) return;
        const chat = blank();
        set({ chats: [chat, ...get().chats.filter((c) => c.turns.length > 0 || c.refs.length > 0)], activeId: chat.id });
      },
      openChat: (id) => {
        if (get().chats.some((c) => c.id === id)) set({ activeId: id, chats: get().chats.filter((c) => c.id === id || c.turns.length > 0 || c.refs.length > 0) });
      },
      deleteChat: (id) => {
        const chats = get().chats.filter((c) => c.id !== id);
        if (chats.length === 0) chats.push(blank());
        set({ chats, activeId: get().activeId === id ? chats[0].id : get().activeId });
        save();
      },
      setSettings: (patch) => edit(active().id, (c) => ({ ...c, settings: { ...c.settings, ...patch } })),

      addReference: (source, keyPoint, item) => {
        const chat = active();
        const mine = chat.refs.filter((r) => r.who === 'you');
        if (mine.some((r) => r.source.id === source.id) || mine.length >= MAX_EXAMPLES) return false;
        if (item) set({ items: { ...get().items, [source.id]: item } });
        edit(chat.id, (c) => ({ ...c, refs: [...c.refs.filter((r) => r.who === 'you'), { source, who: 'you', ...(keyPoint ? { keyPoint } : {}) }] }));
        return true;
      },
      removeReference: (id) => edit(active().id, (c) => ({ ...c, refs: c.refs.filter((r) => r.source.id !== id) })),

      send: async (text, draftId) => {
        const words = text.trim();
        if (running()) return;
        const chat = active();
        if (draftId && words) return changeDraft(draftId, { kind: 'change', text: words }, words);
        if (words && chat.drafts.length > 0) {
          const m = words.match(DRAFT_REF);
          const no = m ? Number(m[1] ?? m[2]) : NaN;
          const target = chat.drafts.find((d) => d.no === no && d.state !== 'added');
          if (target) {
            const how = /^\s*(another|one more)\b|再擬/i.test(words) ? 'another' : /harder|更難|難一點|改難/i.test(words) ? 'harder' : /easier|更易|容易|改易/i.test(words) ? 'easier' : undefined;
            return changeDraft(target.id, how ? { kind: how } : { kind: 'change', text: words }, words);
          }
        }
        if (!words && !chat.refs.some((r) => r.who === 'you')) return;
        return request(words);
      },

      change: async (draftId, how) => {
        const target = active().drafts.find((d) => d.id === draftId);
        if (!target || running()) return;
        // The words are what the chat log shows; the request is the code.
        await changeDraft(draftId, { kind: how }, '');
      },

      changePick: (code) => {
        const chat = active();
        if (chat.picks[0]?.code === code) return;
        const pick: KeyPick = { code, reason: '' };
        const openDrafts = chat.drafts.some((d) => d.state === 'open' && d.entry.draft.status !== 'failed');
        edit(chat.id, (c) => ({ ...c, picks: [pick] }));
        const turn: AiTurn = { ...aiTurn(), notes: [{ kind: 'pickChanged', code }], ...(openDrafts ? { ask: { kind: 'rewrite', code } } : {}) };
        pushTurns(chat.id, turn);
      },

      answerRewrite: async (turnId, answer) => {
        const chat = active();
        editTurn(chat.id, turnId, (t) => (t.ask ? { ...t, ask: { ...t.ask, answer } } : t));
        if (answer === 'keep') return;
        const ai = aiTurn();
        pushTurns(chat.id, ai);
        lastAction.set(ai.id, () => get().answerRewrite(turnId, 'rewrite'));
        await exclusive(chat.id, ai.id, chat.settings.count, async (signal) => {
          setStep(chat.id, ai.id, { kind: 'pick', state: 'done', picks: chat.picks, by: 'you' });
          await writeOn(chat.id, ai.id, chat.lastText, signal, true);
        });
      },

      setDraftState: (draftId, state) =>
        edit(active().id, (c) => ({ ...c, drafts: c.drafts.map((d) => (d.id === draftId && d.state !== 'added' && d.entry.draft.status !== 'failed' ? { ...d, state } : d)) })),

      restoreVersion: (draftId, index) =>
        edit(active().id, (c) => ({
          ...c,
          drafts: c.drafts.map((d) => {
            if (d.id !== draftId || !d.older[index]) return d;
            const older = [...d.older.filter((_, i) => i !== index), d.entry.draft];
            return { ...d, older, entry: { ...d.entry, draft: d.older[index] }, state: 'open' };
          }),
        })),

      delivered: (ids) => {
        const gone = new Set(ids);
        edit(active().id, (c) => ({ ...c, drafts: c.drafts.map((d) => (gone.has(d.id) ? { ...d, state: 'added' } : d)) }));
      },

      stop: () => controller?.abort(),

      dismissError: (turnId) => editTurn(active().id, turnId, (t) => ({ ...t, errorSeen: true })),

      retry: async (turnId) => {
        const again = lastAction.get(turnId);
        if (!again || running()) return;
        edit(active().id, (c) => {
          const at = c.turns.findIndex((t) => t.id === turnId);
          const from = at > 0 && c.turns[at - 1].role === 'user' ? at - 1 : at;
          return { ...c, turns: at < 0 ? c.turns : [...c.turns.slice(0, from), ...c.turns.slice(at + 1)] };
        });
        await again();
      },
    };
  });
}

/** The draft as the engine knows it, for code that only needs that. */
export const studioDraftOf = (d: ChatDraft): StudioDraft => d.entry.draft;
