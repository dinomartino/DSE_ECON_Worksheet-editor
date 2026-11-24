import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { aiErrorInfo } from '@/ai/errors';
import type { AiErrorInfo } from '@/ai/types';
import type { Side } from '@/model/textSlots';
import type { LanguageMode } from '@/model/types';
import { figureLang } from '@/questionStudio/figures';
import type { PastPaperItem } from '@/pastpapers/pack';
import { sidesOf, withReferences, type Compared, type RunInfo, type StudioEnv } from '@/questionStudio/session';
import { MAX_EXAMPLES, type Refinement, type SourceQuestion, type StudioDeps, type StudioDraft, type StudioOutcome, type StudioRequest } from '@/questionStudio/types';
import type { ChatStorage } from './chatStorage';
import type { AiTurn, Chat, ChatDraft, ChatRef, ChatSettings, ChangeHow, Note, Step, Turn } from './chatTypes';
import { applyEvent, emptyLive } from '@/questionStudio/stream';
import { hasWarning } from '@/questionStudio/validate';
import { applyEdit, type DraftEdit } from '@/questionStudio/edit';
import { firstVersion, showing, undoEdit, withAiVersion, withEdit } from './versions';
import type { LiveState, SourceQuestion as Source, StudioEvent } from '@/questionStudio/types';
import type { KeyPick, PickOutcome, StudioEngine } from './engine';
import { briefsOf, decide, editable, readLocally, recentOf, type IntentKind, type LocalRead, type TurnIntent } from './intent';

/**
 * The chat studio's one store (k-0516): every chat, the open one, and the run in progress.
 * A request is: read the reference (if any) → the AI picks the key point (step 1, u-lm1c) →
 * write on it (step 2, streamed when the engine can) → checks. Once drafts exist, every
 * message is read with them (k-0535, `intent.ts`): edit one draft, several or all, one more
 * like a draft, a question about a draft, or new ones, from any wording. Clear words and the
 * composer's chip act at once; anything else is read by the AI in the same step-1 request;
 * when it cannot tell which draft, the reply asks (draft buttons) instead of guessing. An
 * edit is a new version of its card (undo = an older version), never a new card. Nothing
 * reaches a paper here: Add in the tray does that (`deliver.ts`).
 */

export interface RunState {
  chatId: string;
  turnId: string;
  /** What the running write has shown so far (streamed words, checked drafts, figures; not saved). */
  live: LiveState;
  /** The request the running write asked (the drafts shown while it streams are drawn with it). */
  request?: StudioRequest;
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
  /**
   * The ✦ Write panel's paper (a worksheet id): its newest chat, else a new one for it. New
   * chats started from there (`newChat`) stay that paper's.
   */
  openPaper(paper: string): void;
  deleteChat(id: string): void;
  setSettings(patch: Partial<ChatSettings>): void;
  /** False when already there or `MAX_EXAMPLES` reached. */
  addReference(source: SourceQuestion, keyPoint?: string, item?: PastPaperItem): boolean;
  removeReference(id: string): void;
  /**
   * The teacher's message. `draftId`: about that draft (the composer's chip). `asNew`: the
   * teacher took the composer's guess away: write new ones, no reading.
   */
  send(text: string, draftId?: string, opts?: { asNew?: boolean }): Promise<void>;
  /** The answer to "Which draft do you mean?": a draft number, every draft offered, or new ones. */
  answerWhich(turnId: string, choice: number | 'all' | 'new'): Promise<void>;
  /** A quick change on one draft (the card's Harder / Easier / Another). */
  change(draftId: string, how: Exclude<ChangeHow, 'change'>): Promise<void>;
  /** The teacher changes the AI's pick (never required). Asks before rewriting existing drafts. */
  changePick(code: string): void;
  answerRewrite(turnId: string, answer: 'rewrite' | 'keep'): Promise<void>;
  setDraftState(draftId: string, state: 'open' | 'accepted' | 'rejected'): void;
  /** Back to an older version of a draft (the current one becomes the newest older one). */
  restoreVersion(draftId: string, index: number): void;
  /** Show this version of a draft (by its id, from the version list): Add, the page and the AI use it. Nothing renumbers (k-0530). */
  showVersion(draftId: string, versionId: string): void;
  /**
   * The teacher's own edit of the version shown (k-0530): no AI, no credits. The local checks
   * run again; on an AI version it makes a new 「你修改」 version, on their own it updates it.
   */
  editDraft(draftId: string, edit: DraftEdit): Promise<void>;
  /** Back to the version the shown edit came from. */
  undoEdit(draftId: string): void;
  delivered(draftIds: readonly string[]): void;
  /** Added drafts back to open (their question was undone in the paper: the ✦ Write panel). */
  undelivered(draftIds: readonly string[]): void;
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
  /** Starting settings for a new chat (tests); the count defaults to 1. */
  initialSettings?: Partial<Pick<ChatSettings, 'count'>>;
  now?: () => Date;
  newId?: () => string;
  /** After every run that reached the provider (the Trial kit records the teacher's own requests). A throw is ignored. */
  onRun?: (info: RunInfo) => void;
}

/** A message being read with the drafts (k-0535): the computer's read, and the chip's draft. */
interface Reading {
  local: LocalRead;
  chip?: number;
}

/** The refinement an edit asks for: Harder / Easier for a short difficulty-only message, else the teacher's words. */
export function refinementFor(intent: Pick<TurnIntent, 'how' | 'parts'>, text: string): Refinement {
  const words = text.trim();
  const cjk = words.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const latin = words.replace(/[\u3400-\u9fff]/g, ' ').split(/\s+/).filter(Boolean).length;
  const short = latin + Math.ceil(cjk / 3) <= 6;
  if (intent.how !== 'change' && (short || !words)) return { kind: intent.how };
  return { kind: 'change', text: words, ...(intent.parts.length ? { parts: intent.parts } : {}) };
}

export function createChatStore(deps: ChatDeps): UseBoundStore<StoreApi<ChatState>> {
  const now = () => (deps.now ? deps.now() : new Date()).toISOString();
  let seq = 0;
  const newId = deps.newId ?? (() => `c${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`);

  const blank = (paper?: string): Chat => ({
    v: 1,
    id: newId(),
    createdAt: now(),
    updatedAt: now(),
    refs: [],
    turns: [],
    drafts: [],
    picks: [],
    settings: { count: 1, level: 'same', language: deps.language(), ...deps.initialSettings },
    lastText: '',
    ...(paper ? { paper } : {}),
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

    /** The examples with their pictures read (the engine sends them to a provider that reads pictures). Never throws. */
    const withPictures = async (examples: readonly Source[], sides: readonly Side[]): Promise<Source[]> => {
      if (!deps.env.figures || examples.length === 0) return [...examples];
      try {
        // A paper in Chinese only gets the Chinese pictures where a question has them (k-0544).
        return await deps.env.figures(examples, figureLang(sides));
      } catch {
        return [...examples];
      }
    };

    const aiTurn = (): AiTurn => ({ id: newId(), role: 'ai', steps: [], notes: [], draftIds: [] });

    const requestFor = (chat: Chat, text: string, picks: KeyPick[]): StudioRequest => {
      const mine = chat.refs.filter((r) => r.who === 'you').map((r) => r.source);
      return {
        keyPoint: picks[0]?.code ?? '',
        ...(picks[1] ? { alsoKeyPoints: [picks[1].code] } : {}),
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
      set({ run: { chatId, turnId, live: emptyLive(), count, ...(target ? { target } : {}) } });
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
      onEvent: (event: StudioEvent) => {
        const run = get().run;
        if (!run || run.turnId !== turnId) return;
        if (event.type === 'stage' && event.stage === 'diagram') {
          // Figures are drawn before the check (k-0534): writing is done once they start.
          if (!change) setStep(chatId, turnId, { kind: 'write', state: 'done', count });
          setStep(chatId, turnId, { kind: 'diagram', state: 'run' });
        }
        set({ run: { ...run, live: applyEvent(run.live, event) } });
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
      // The reference's pictures go with it (read now: they are never saved with the chat).
      request = { ...request, examples: await withPictures(request.examples, request.sides) };
      if (signal.aborted) return;
      const count = request.count;
      setStep(chatId, turnId, { kind: 'write', state: 'run', count });
      const run = get().run;
      if (run?.turnId === turnId) set({ run: { ...run, request } });
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
        const fresh = outcome.drafts.map((draft): ChatDraft => ({ id: newId(), no: ++no, entry: { draft: firstVersion(draft, now()), request }, older: [], state: 'open', turnId }));
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
        look: made.filter((d) => d.status === 'look' && !hasWarning(d)).length,
        // Warned drafts (a failed check): shown like the rest (k-0531). The saved field keeps its old name.
        failed: made.filter((d) => hasWarning(d)).length,
      });
      // The teacher's reference has a form the studio cannot write yet (k-0544): say so, once.
      const gap = outcome.notes.find((n) => n.id === 'run.referenceShape')?.params;
      if (gap) addNote(chatId, turnId, { kind: 'refShape', pictures: Number(gap.pictures) || 0, optionPictures: Number(gap.optionPictures) || 0, optionTables: Number(gap.optionTables) || 0 });
    }

    /** Sets fields of the running run, when it is this turn's. */
    const patchRun = (turnId: string, patch: Partial<RunState>) => {
      const run = get().run;
      if (run?.turnId === turnId) set({ run: { ...run, ...patch } });
    };

    /** Step 1 then 2 of a new request, inside a reply: the AI picks the key point, then writes on it. */
    async function pickAndWrite(chatId: string, turnId: string, text: string, signal: AbortSignal) {
      const mine = (get().chats.find((c) => c.id === chatId)?.refs ?? []).filter((r) => r.who === 'you');
      setStep(chatId, turnId, { kind: 'pick', state: 'run', picks: [], by: 'ai' });
      const ready = await resolve(chatId, turnId, signal);
      if (!ready) return;
      const tagged = Object.fromEntries(mine.filter((r) => r.keyPoint).map((r) => [r.source.id, r.keyPoint as string]));
      const current = (get().chats.find((c) => c.id === chatId)?.picks ?? []).map((p) => p.code);
      const picked = await deps.engine.pick({ text, examples: await withPictures(mine.map((r) => r.source), sidesOf(get().chats.find((c) => c.id === chatId)?.settings.language ?? 'en')), tagged, ...(current.length ? { current } : {}) }, ready.deps, signal);
      if (!picked.ok) {
        failTurn(chatId, turnId, picked.error);
        return;
      }
      await writeWith(chatId, turnId, text, picked, signal);
    }

    /** Step 2 with step 1's answer: keep the picks (or the chat's, for a follow-up), then write. */
    async function writeWith(chatId: string, turnId: string, text: string, picked: Extract<PickOutcome, { ok: true }>, signal: AbortSignal) {
      // Nothing to go on in a follow-up ("the same in Chinese"): the chat's key point stands.
      const picks = picked.picks.length ? picked.picks : get().chats.find((c) => c.id === chatId)?.picks ?? [];
      setStep(chatId, turnId, { kind: 'pick', state: 'done', picks, by: picked.local ? 'computer' : 'ai' });
      edit(chatId, (c) => ({ ...c, picks, lastText: text }));
      if (!picks.length) {
        addNote(chatId, turnId, { kind: 'noPick' });
        return;
      }
      await writeOn(chatId, turnId, text, signal);
    }

    /**
     * A message once drafts exist (k-0535): the same step-1 request also reads what it wants
     * and which draft(s), then the reply edits, answers, asks which draft, or writes new ones.
     */
    async function readAndAct(chatId: string, turnId: string, text: string, reading: Reading, signal: AbortSignal) {
      const chat = get().chats.find((c) => c.id === chatId);
      if (!chat) return;
      const mine = chat.refs.filter((r) => r.who === 'you');
      // The draft is known (the chip): only an answer is wanted, no key point, no syllabus.
      const onlyRead = reading.chip !== undefined;
      setStep(chatId, turnId, { kind: 'understand', state: 'run' });
      const ready = await resolve(chatId, turnId, signal);
      if (!ready) return;
      const tagged = Object.fromEntries(mine.filter((r) => r.keyPoint).map((r) => [r.source.id, r.keyPoint as string]));
      const current = chat.picks.map((p) => p.code);
      const picked = await deps.engine.pick(
        {
          text,
          examples: onlyRead ? [] : await withPictures(mine.map((r) => r.source), sidesOf(chat.settings.language)),
          tagged,
          ...(current.length ? { current } : {}),
          drafts: briefsOf(chat, reading.chip),
          recent: recentOf(chat),
          ...(reading.chip !== undefined ? { target: reading.chip } : {}),
          picks: !onlyRead,
        },
        ready.deps,
        signal,
      );
      if (!picked.ok) {
        failTurn(chatId, turnId, picked.error);
        return;
      }
      const intent = decide(reading.local, picked.turn);
      setStep(chatId, turnId, { kind: 'understand', state: 'done', intent: intent.kind, drafts: intent.drafts, by: picked.turn ? 'ai' : 'computer' });
      if (intent.kind !== 'new') return act(chatId, turnId, intent, text, reading.local.kind, signal);
      patchRun(turnId, { count: chat.settings.count });
      if (mine.length) setStep(chatId, turnId, { kind: 'read', state: 'done', labels: mine.map((r) => r.source.label) });
      await writeWith(chatId, turnId, text, picked, signal);
    }

    /** What the read said, done in this reply: edit, one more like a draft, an answer, or a question back. */
    async function act(chatId: string, turnId: string, intent: TurnIntent, text: string, wanted: IntentKind, signal: AbortSignal) {
      const chat = get().chats.find((c) => c.id === chatId);
      if (!chat) return;
      const targets = intent.drafts.map((n) => chat.drafts.find((d) => d.no === n && editable(d))).filter((d): d is ChatDraft => d !== undefined);
      if (intent.kind === 'unsure' || targets.length === 0) {
        const options = (intent.drafts.length ? intent.drafts : chat.drafts.filter(editable).map((d) => d.no)).filter((n) => chat.drafts.some((d) => d.no === n && editable(d)));
        const kind = wanted === 'ask' || wanted === 'another' ? wanted : 'edit';
        editTurn(chatId, turnId, (t) => ({ ...t, ask: { kind: 'which', text, wanted: kind, options, how: intent.how, parts: intent.parts } }));
        settle(chatId, turnId);
        return;
      }
      if (intent.kind === 'ask') {
        settle(chatId, turnId);
        if (intent.reply) addNote(chatId, turnId, { kind: 'reply', text: intent.reply, draftNo: targets[0].no });
        else addNote(chatId, turnId, { kind: 'noReply', draftNo: targets[0].no });
        editTurn(chatId, turnId, (t) => ({ ...t, draftIds: targets.map((d) => d.id) }));
        return;
      }
      if (intent.kind === 'another') return changeIn(chatId, turnId, [targets[0].id], { kind: 'another' }, signal);
      await changeIn(chatId, turnId, targets.map((d) => d.id), refinementFor(intent, text), signal);
    }

    /** Draft(s) changed (or one more like it) in this reply: each a new version of its own card, never a new card (but Another). */
    async function changeIn(chatId: string, turnId: string, ids: readonly string[], refinement: Refinement, signal: AbortSignal) {
      const how: ChangeHow = refinement.kind;
      const first = get().chats.find((c) => c.id === chatId)?.drafts.find((d) => d.id === ids[0]);
      if (!first) return;
      // A change stays on the draft's own key point (whatever the chat's pick is now).
      setStep(chatId, turnId, { kind: 'pick', state: 'done', picks: [{ code: first.entry.request.keyPoint, reason: '' }], by: 'draft' });
      const ready = await resolve(chatId, turnId, signal);
      if (!ready) return;
      const done: string[] = [];
      for (const draftId of ids) {
        if (signal.aborted) break;
        const chat = get().chats.find((c) => c.id === chatId);
        const target = chat?.drafts.find((d) => d.id === draftId);
        if (!chat || !target) continue;
        patchRun(turnId, { target: draftId, count: 1, live: emptyLive() });
        setStep(chatId, turnId, { kind: 'change', state: 'run', draftNo: target.no, how });
        // The current version is what changes (an older one the teacher picked back, too).
        const others = chat.drafts.filter((d) => d.id !== draftId && d.state !== 'rejected').map((d) => d.entry.draft);
        let outcome: StudioOutcome;
        try {
          outcome = await deps.engine.refine(target.entry.request, target.entry.draft, refinement, others, ready.deps, hooksFor(chatId, turnId, 1, signal, true));
        } catch {
          failTurn(chatId, turnId, aiErrorInfo('badOutput', ready.deps.preset.id));
          return;
        }
        record({ kind: 'refine', request: target.entry.request, outcome, compared: ready.compared });
        if (!outcome.ok) {
          if (outcome.error.kind === 'cancelled') {
            editTurn(chatId, turnId, (t) => ({ ...t, steps: t.steps.map((s) => (s.state === 'run' ? { ...s, state: 'fail' } : s)) }));
            addNote(chatId, turnId, { kind: 'stopped' });
          } else failTurn(chatId, turnId, outcome.error);
          break;
        }
        const made = outcome.drafts[0];
        setStep(chatId, turnId, { kind: 'change', state: 'done', draftNo: target.no, how });
        if (!made) continue;
        if (how === 'another') {
          let no = 0;
          let freshId = '';
          edit(chatId, (c) => {
            no = c.drafts.reduce((max, d) => Math.max(max, d.no), 0) + 1;
            const fresh: ChatDraft = { id: newId(), no, entry: { draft: firstVersion(made, now(), 'another'), request: target.entry.request }, older: [], state: 'open', turnId };
            freshId = fresh.id;
            const at = c.drafts.findIndex((d) => d.id === draftId);
            return { ...c, drafts: [...c.drafts.slice(0, at + 1), fresh, ...c.drafts.slice(at + 1)] };
          });
          done.push(freshId);
          addNote(chatId, turnId, { kind: 'another', draftNo: no });
        } else {
          let version = 1;
          edit(chatId, (c) => ({
            ...c,
            drafts: c.drafts.map((d) => {
              if (d.id !== draftId) return d;
              // A new version on top of the one shown (k-0530: numbered once, never renumbered).
              const next = withAiVersion(d, made, how, refinement.kind === 'change' ? refinement.text : '', now());
              version = next.entry.draft.version ?? next.older.length + 1;
              // Changed: read it again, so it is open (not accepted) until the teacher says.
              return { ...next, state: 'open' };
            }),
          }));
          done.push(draftId);
          addNote(chatId, turnId, { kind: 'changed', draftNo: target.no, version });
        }
      }
      settle(chatId, turnId);
      if (done.length) editTurn(chatId, turnId, (t) => ({ ...t, draftIds: done }));
    }

    /** A new message: its turns, then pick → write (no drafts yet, or "write new ones"), or read → act. */
    async function request(text: string, reading?: Reading) {
      const chat = active();
      const chatId = chat.id;
      const mine = chat.refs.filter((r) => r.who === 'you');
      const user: Turn = { id: newId(), role: 'user', text, refs: mine.map((r) => r.source.label), ...(reading?.chip !== undefined ? { draftNo: reading.chip } : {}) };
      const ai = aiTurn();
      pushTurns(chatId, user, ai);
      lastAction.set(ai.id, () => request(text, reading));
      // While the message is read nothing is drawn as new: the placeholders come once it says "new".
      await exclusive(chatId, ai.id, reading ? 0 : chat.settings.count, async (signal) => {
        // A message being read shows the reference only once it turns out to be a new request.
        if (mine.length && !reading) setStep(chatId, ai.id, { kind: 'read', state: 'done', labels: mine.map((r) => r.source.label) });
        if (reading) await readAndAct(chatId, ai.id, text, reading, signal);
        else await pickAndWrite(chatId, ai.id, text, signal);
      });
    }

    /** Draft(s) changed with no reading request (the card's buttons, the chip, clear words), as one exchange. */
    async function changeDrafts(draftIds: readonly string[], refinement: Refinement, said: string) {
      const chat = active();
      const chatId = chat.id;
      const targets = draftIds.map((id) => chat.drafts.find((d) => d.id === id)).filter((d): d is ChatDraft => d !== undefined);
      if (!targets.length) return;
      const how: ChangeHow = refinement.kind;
      const user: Turn = {
        id: newId(),
        role: 'user',
        text: said,
        refs: [],
        draftNo: targets[0].no,
        ...(targets.length > 1 ? { draftNos: targets.map((d) => d.no) } : {}),
        ...(said ? {} : { how }),
      };
      const ai = aiTurn();
      pushTurns(chatId, user, ai);
      lastAction.set(ai.id, () => changeDrafts(draftIds, refinement, said));
      await exclusive(chatId, ai.id, 1, (signal) => changeIn(chatId, ai.id, targets.map((d) => d.id), refinement, signal), targets[0].id);
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
        const chat = blank(current?.paper);
        set({ chats: [chat, ...get().chats.filter((c) => c.turns.length > 0 || c.refs.length > 0)], activeId: chat.id });
      },
      openPaper: (paper) => {
        const current = active();
        if (current?.paper === paper) return;
        const kept = get().chats.filter((c) => c.turns.length > 0 || c.refs.length > 0);
        const newest = kept.filter((c) => c.paper === paper).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        if (newest) {
          set({ chats: kept, activeId: newest.id });
          return;
        }
        const chat = blank(paper);
        set({ chats: [chat, ...kept], activeId: chat.id });
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

      send: async (text, draftId, opts) => {
        const words = text.trim();
        if (running()) return;
        const chat = active();
        const chip = draftId ? chat.drafts.find((d) => d.id === draftId && editable(d)) : undefined;
        if (!words) {
          // An empty message with a reference: "N more like this".
          if (chip || !chat.refs.some((r) => r.who === 'you')) return;
          return request(words);
        }
        if (opts?.asNew || chat.drafts.length === 0) return request(words);
        const local = readLocally(words, briefsOf(chat), { ...(chip ? { chip: chip.no } : {}), recent: recentOf(chat) });
        // Clear: act now, no reading request.
        if (local.sure && (local.kind === 'edit' || local.kind === 'another')) {
          const ids = local.drafts.map((n) => chat.drafts.find((d) => d.no === n && editable(d))?.id).filter((id): id is string => id !== undefined);
          if (ids.length) return changeDrafts(local.kind === 'another' ? ids.slice(0, 1) : ids, local.kind === 'another' ? { kind: 'another' } : refinementFor(local, words), words);
        }
        // A clear question about one draft needs only the answer: asked as if the chip were set.
        const about = chip?.no ?? (local.sure && local.kind === 'ask' && local.drafts.length === 1 ? local.drafts[0] : undefined);
        return request(words, { local, ...(about !== undefined ? { chip: about } : {}) });
      },

      answerWhich: async (turnId, choice) => {
        const chat = active();
        const turn = chat.turns.find((t): t is AiTurn => t.id === turnId && t.role === 'ai');
        const ask = turn?.ask;
        if (!ask || ask.kind !== 'which' || ask.answer !== undefined || running()) return;
        editTurn(chat.id, turnId, (t) => (t.ask?.kind === 'which' ? { ...t, ask: { ...t.ask, answer: choice } } : t));
        const ai = aiTurn();
        pushTurns(chat.id, ai);
        lastAction.set(ai.id, async () => {
          editTurn(chat.id, turnId, (t) => (t.ask?.kind === 'which' ? { ...t, ask: { ...t.ask, answer: undefined } } : t));
          await get().answerWhich(turnId, choice);
        });
        if (choice === 'new') {
          await exclusive(chat.id, ai.id, chat.settings.count, (signal) => pickAndWrite(chat.id, ai.id, ask.text, signal));
          return;
        }
        const nos = choice === 'all' ? ask.options : [choice];
        const first = chat.drafts.find((d) => d.no === nos[0]);
        await exclusive(
          chat.id,
          ai.id,
          ask.wanted === 'ask' ? 0 : 1,
          async (signal) => {
            if (ask.wanted === 'ask') {
              const local: LocalRead = { kind: 'ask', drafts: [nos[0]], how: ask.how, parts: ask.parts, sure: true };
              await readAndAct(chat.id, ai.id, ask.text, { local, chip: nos[0] }, signal);
              return;
            }
            const intent: TurnIntent = { kind: ask.wanted === 'another' ? 'another' : 'edit', drafts: nos, how: ask.how, parts: ask.parts };
            await act(chat.id, ai.id, intent, ask.text, intent.kind, signal);
          },
          ask.wanted === 'ask' ? undefined : first?.id,
        );
      },

      change: async (draftId, how) => {
        const target = active().drafts.find((d) => d.id === draftId);
        if (!target || running()) return;
        // The words are what the chat log shows; the request is the code.
        await changeDrafts([draftId], { kind: how }, '');
      },

      changePick: (code) => {
        const chat = active();
        if (chat.picks[0]?.code === code) return;
        const pick: KeyPick = { code, reason: '' };
        const openDrafts = chat.drafts.some((d) => d.state === 'open');
        edit(chat.id, (c) => ({ ...c, picks: [pick] }));
        const turn: AiTurn = { ...aiTurn(), notes: [{ kind: 'pickChanged', code }], ...(openDrafts ? { ask: { kind: 'rewrite', code } } : {}) };
        pushTurns(chat.id, turn);
      },

      answerRewrite: async (turnId, answer) => {
        const chat = active();
        editTurn(chat.id, turnId, (t) => (t.ask?.kind === 'rewrite' ? { ...t, ask: { ...t.ask, answer } } : t));
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
        edit(active().id, (c) => ({ ...c, drafts: c.drafts.map((d) => (d.id === draftId && d.state !== 'added' ? { ...d, state } : d)) })),

      restoreVersion: (draftId, index) =>
        edit(active().id, (c) => ({
          ...c,
          drafts: c.drafts.map((d) => (d.id === draftId && d.older[index] ? { ...showing(d, d.older[index].id), state: 'open' } : d)),
        })),

      showVersion: (draftId, versionId) =>
        edit(active().id, (c) => ({ ...c, drafts: c.drafts.map((d) => (d.id === draftId && d.state !== 'added' ? showing(d, versionId) : d)) })),

      editDraft: async (draftId, change) => {
        const chatId = active().id;
        const found = (await deps.env.localChecks?.().catch(() => undefined)) ?? { glossary: null, corpus: null };
        edit(chatId, (c) => ({
          ...c,
          drafts: c.drafts.map((d) => {
            if (d.id !== draftId || d.state === 'added') return d;
            const others = c.drafts.filter((o) => o.id !== draftId && o.state !== 'rejected').map((o) => o.entry.draft);
            const edited = applyEdit(d.entry.draft, change, d.entry.request, others, found, newId());
            return withEdit(d, edited, now());
          }),
        }));
      },

      undoEdit: (draftId) => edit(active().id, (c) => ({ ...c, drafts: c.drafts.map((d) => (d.id === draftId && d.state !== 'added' ? undoEdit(d) : d)) })),

      delivered: (ids) => {
        const gone = new Set(ids);
        edit(active().id, (c) => ({ ...c, drafts: c.drafts.map((d) => (gone.has(d.id) ? { ...d, state: 'added' } : d)) }));
      },

      undelivered: (ids) => {
        const back = new Set(ids);
        // Any chat: the panel's paper chat may not be the open one by then.
        set({ chats: get().chats.map((c) => (c.drafts.some((d) => back.has(d.id) && d.state === 'added') ? { ...c, updatedAt: now(), drafts: c.drafts.map((d) => (back.has(d.id) && d.state === 'added' ? { ...d, state: 'open' } : d)) } : c)) });
        save();
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
