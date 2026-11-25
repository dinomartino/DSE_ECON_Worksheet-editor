import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { LocalCheckContext } from './edit';
import { aiErrorInfo } from '@/ai/errors';
import type { AiErrorInfo } from '@/ai/types';
import type { Side } from '@/model/textSlots';
import type { LanguageMode } from '@/model/types';
import { lookupCode } from '@/syllabus';
import { normalizeRequest } from './brief';
import { figureLang } from './figures';
import { needsPick, pickKeyPoints, type KeyPick } from './pick';
import { applyEvent, emptyLive } from './stream';
import { emptyUsage, refine as refineDraft, writeDrafts, type RunHooks, type Stage } from './run';
import {
  BATCH_SIZES,
  MAX_EXAMPLES,
  type Finding,
  type Level,
  type LiveState,
  type StudioEvent,
  type Refinement,
  type Shape,
  type SourceQuestion,
  type StudioDeps,
  type StudioDraft,
  type StudioOutcome,
  type StudioRequest,
  type Usage,
} from './types';

/**
 * The Question studio's session: what the teacher asked for, the drafts on the sheet, the
 * run in progress. In memory only (nothing here is saved: a draft becomes a question only
 * when the teacher presses Add, `deliver.ts`), and kept while the app is open, so leaving
 * to the Past paper bank for an example and coming back loses nothing. The engine
 * (`run.ts`) does the work; this holds its state and the one run at a time.
 */

export interface StudioForm {
  /** A syllabus key point code (`C.ped`) the teacher set by hand; '' = the AI picks it (step 1, `pick.ts`), the normal case. */
  keyPoint: string;
  /** Narrow it to some of its points (`C.ped#arc`); none = the whole key point. */
  points: string[];
  /** Up to `MAX_EXAMPLES` bank questions to write like. */
  examples: SourceQuestion[];
  /** With picked examples: write close to each on purpose (strict mode); false = a style reference only. */
  strict: boolean;
  count: (typeof BATCH_SIZES)[number];
  level: Level;
  shape: Shape;
  language: LanguageMode;
  note: string;
  /** Key point code(s) the chat is on (main first): step 1 keeps them for a follow-up. Not part of the request. */
  current?: string[];
}

/** A draft on the sheet with the request it was written for (refining it asks the same thing again). */
export interface SheetDraft {
  draft: StudioDraft;
  request: StudioRequest;
}

export type StudioPhase =
  | { kind: 'idle' }
  | { kind: 'running'; done: number; total: number; stage: Stage; /** Set when one draft is being changed. */ target?: string }
  | { kind: 'error'; error: AiErrorInfo };

/** What the run compared drafts with (the near-copy check), for the checks column's foot. */
export interface Compared {
  /** Past paper bank questions; null = the bank was not available, so it was not compared. */
  past: number | null;
  mine: number;
}

export type Resolved = { ok: true; deps: StudioDeps; compared: Compared } | { ok: false; error: AiErrorInfo };

/** Everything outside the engine a run needs; tests inject a fake. */
export interface StudioEnv {
  /** The provider, glossary and corpus for a run, from Settings and the libraries. Never throws. */
  resolve(): Promise<Resolved>;
  /**
   * Real questions to write like when the teacher picked none (decision of u-7jvk: by default),
   * [] when there are none or the teacher turned it off. Never throws.
   */
  references?(request: StudioRequest, signal: AbortSignal): Promise<SourceQuestion[]>;
  /** Reads the pictures of examples that carry `figureBlocks` (draws diagrams: browser only). Never throws; absent = words only. */
  figures?(examples: readonly SourceQuestion[], lang?: Side): Promise<SourceQuestion[]>;
  /**
   * What the local checks read after the teacher's own edit (k-0530): the glossary and the
   * corpus, with no provider and no AI. Never throws; a part it cannot read is null (that
   * check then says "check again"). Absent: both null.
   */
  localChecks?(): Promise<LocalCheckContext>;
}

export interface StudioState {
  form: StudioForm;
  /** Newest batch first. */
  entries: SheetDraft[];
  /** The latest run's events folded for the screen (k-0514): stage, picks, each draft's words as they stream, its checks, its figure. Reset when a run starts; kept until the next. */
  live: LiveState;
  /** The key points step 1 picked for the latest write, with its reasons ([] = the teacher set one, or nothing written yet). */
  picks: KeyPick[];
  /** Notes about the latest run (fewer drafts than asked, a key letter used too often…). */
  notes: Finding[];
  /** Ticked draft ids, in the order ticked. */
  picked: string[];
  /** The draft the checks column describes. */
  focus?: string;
  phase: StudioPhase;
  compared?: Compared;
  model?: string;
  /** Provider counts summed over this session: the trial's cost evidence. */
  usage: Usage;

  setForm(patch: Partial<StudioForm>): void;
  /** True when added (false: already there, or `MAX_EXAMPLES` reached). */
  addExample(source: SourceQuestion): boolean;
  removeExample(id: string): void;
  write(): Promise<void>;
  refine(id: string, refinement: Refinement): Promise<void>;
  stop(): void;
  toggle(id: string): void;
  discard(id: string): void;
  /** Drafts that became questions (Add, Keep) leave the sheet. */
  delivered(ids: readonly string[]): void;
  clearDrafts(): void;
  setFocus(id: string | undefined): void;
  dismissError(): void;
  /** Runs the last action again (the error bar's Try again). */
  retry(): Promise<void>;
}

export const sidesOf = (language: LanguageMode): Side[] => (language === 'en' ? ['en'] : language === 'zh' ? ['zh'] : ['en', 'zh']);

export const defaultForm = (language: LanguageMode): StudioForm => ({
  keyPoint: '',
  points: [],
  examples: [],
  strict: true,
  count: 1,
  level: 'same',
  shape: 'any',
  language,
  note: '',
});

/** The request a form makes (not yet normalized: the engine does that). */
export const requestOf = (form: StudioForm): StudioRequest => ({
  keyPoint: form.keyPoint,
  points: form.points,
  examples: form.examples,
  strict: form.strict,
  count: form.count,
  level: form.level,
  shape: form.shape,
  sides: sidesOf(form.language),
  note: form.note,
});

/**
 * Whether the form can be written: something to go on. A request typed in words, a picked
 * question to write like, or a key point set by hand (never required: the AI picks the key
 * point, step 1). Nothing running is checked by the caller.
 */
export const canWrite = (form: StudioForm): boolean => {
  const hit = lookupCode(form.keyPoint);
  return Boolean((hit && !hit.point) || form.examples.length > 0 || form.note.trim() !== '');
};

const addUsage = (a: Usage, b: Usage): Usage => ({
  requests: a.requests + b.requests,
  input: a.input + b.input,
  output: a.output + b.output,
  thinking: a.thinking + b.thinking,
  ms: a.ms + b.ms,
});

type Action = () => Promise<void>;

/**
 * The request with real questions to write like, when none was picked and the environment has
 * some for its key point (the stage shown meanwhile is "Finding real questions…").
 */
export async function withReferences(request: StudioRequest, env: Pick<StudioEnv, 'references'>, hooks: Pick<RunHooks, 'signal' | 'progress' | 'onEvent'>): Promise<StudioRequest> {
  if (request.examples.length > 0 || !env.references) return request;
  hooks.progress?.(0, 2, 'references');
  hooks.onEvent?.({ type: 'stage', stage: 'references' });
  try {
    const found = await env.references(request, hooks.signal);
    hooks.onEvent?.({ type: 'references', count: found.length });
    return found.length > 0 ? normalizeRequest({ ...request, examples: found }) : request;
  } catch {
    return request;
  }
}

/** The request's examples with their pictures read, so the model gets them with the request (k-0514). */
export async function withExampleFigures(request: StudioRequest, env: Pick<StudioEnv, 'figures'>): Promise<StudioRequest> {
  const lang = figureLang(request.sides);
  if (!env.figures || !request.examples.some((e) => e.figureBlocks?.length && (!e.figures || (e.figuresLang ?? 'en') !== lang))) return request;
  try {
    return { ...request, examples: await env.figures(request.examples, lang) };
  } catch {
    return request;
  }
}

export type KeyPointsResult =
  | { ok: true; request: StudioRequest; picks: KeyPick[]; usage: Usage; model?: string }
  | { ok: false; error: AiErrorInfo; usage: Usage };

/**
 * Step 1 (u-lm1c): a request with no key point of its own gets one from the model: the same
 * provider reads the typed request and the picked question and names the key point(s) from
 * the syllabus, with a reason. A request that already names one (set by hand, or a refine of
 * a draft) goes through untouched, with no call.
 */
export async function withKeyPoints(request: StudioRequest, deps: Pick<StudioDeps, 'client' | 'preset'>, hooks: Pick<RunHooks, 'signal' | 'progress' | 'onEvent'>, current?: readonly string[]): Promise<KeyPointsResult> {
  if (!needsPick(request)) return { ok: true, request, picks: [], usage: emptyUsage() };
  hooks.progress?.(0, 3, 'pick');
  hooks.onEvent?.({ type: 'stage', stage: 'pick' });
  const picked = await pickKeyPoints({ text: request.note, examples: request.examples, ...(current?.length ? { current } : {}) }, deps, hooks.signal);
  if (!picked.ok) return { ok: false, error: picked.error, usage: picked.usage };
  hooks.onEvent?.({ type: 'pick', picks: picked.picks });
  const [main, ...rest] = picked.picks;
  return {
    ok: true,
    request: normalizeRequest({ ...request, keyPoint: main.code, points: [], alsoKeyPoints: rest.map((p) => p.code), ...(picked.concept ? { concept: picked.concept } : {}) }),
    picks: picked.picks,
    usage: picked.usage,
    model: picked.model,
  };
}

/** What a run that reached the provider asked and got (the trial's record is built from it). */
export interface RunInfo {
  kind: 'write' | 'refine';
  request: StudioRequest;
  outcome: StudioOutcome;
  compared: Compared;
}

export interface SessionHooks {
  /** After every run that reached the provider, written, changed, failed or stopped. A throw here never breaks the run. */
  onRun?: (info: RunInfo) => void;
  /** Every event of every run as it happens (`StudioEvent`), for a screen that wants more than `live`. A throw here never breaks the run. */
  onEvent?: (event: StudioEvent) => void;
}

export function createStudioSession(env: StudioEnv, initialLanguage: LanguageMode = 'en', hooks: SessionHooks = {}): UseBoundStore<StoreApi<StudioState>> {
  return create<StudioState>((set, get) => {
    let controller: AbortController | undefined;
    let last: Action | undefined;

    const running = () => get().phase.kind === 'running';

    /** One run at a time: resolve, call `go`, settle the phase. A throw leaves the sheet idle, never stuck on "Writing". */
    async function run(
      meta: Pick<RunInfo, 'kind' | 'request'>,
      action: Action,
      go: (deps: StudioDeps, hooks: RunHooks) => Promise<StudioOutcome>,
      apply: (outcome: Extract<StudioOutcome, { ok: true }>) => void,
      target?: string,
    ) {
      if (running()) return;
      last = action;
      const mine = new AbortController();
      controller = mine;
      const at = (done: number, total: number, stage: Stage): StudioPhase => ({ kind: 'running', done, total, stage, ...(target ? { target } : {}) });
      set({ phase: at(0, 2, 'write'), live: emptyLive() });
      const onEvent = (event: StudioEvent) => {
        set({ live: applyEvent(get().live, event) });
        try {
          hooks.onEvent?.(event);
        } catch {
          // A listener that throws must not take the run down.
        }
      };
      try {
        const resolved = await env.resolve();
        if (mine.signal.aborted) {
          set({ phase: { kind: 'idle' } });
          return;
        }
        if (!resolved.ok) {
          set({ phase: { kind: 'error', error: resolved.error } });
          return;
        }
        const outcome = await go(resolved.deps, { signal: mine.signal, onEvent, progress: (done, total, stage) => set({ phase: at(done, total, stage) }) });
        set({ usage: addUsage(get().usage, outcome.usage), compared: resolved.compared });
        try {
          hooks.onRun?.({ ...meta, outcome, compared: resolved.compared });
        } catch {
          // A record that cannot be kept (storage full) must not take the run down with it.
        }
        if (!outcome.ok) {
          // Stopped before anything was written: nothing to show, and no error.
          set({ phase: outcome.error.kind === 'cancelled' ? { kind: 'idle' } : { kind: 'error', error: outcome.error } });
          return;
        }
        apply(outcome);
        set({ phase: { kind: 'idle' }, model: outcome.model });
      } catch (error) {
        set({ phase: { kind: 'idle' } });
        throw error;
      } finally {
        if (controller === mine) controller = undefined;
      }
    }

    // Every draft can be ticked, a warned one too (k-0531: the teacher decides).
    const tickable = (entry: SheetDraft) => Boolean(entry.draft);

    return {
      form: defaultForm(initialLanguage),
      entries: [],
      live: emptyLive(),
      picks: [],
      notes: [],
      picked: [],
      phase: { kind: 'idle' },
      usage: emptyUsage(),

      setForm: (patch) => {
        const next = { ...get().form, ...patch };
        // Points belong to one key point: a new key point forgets them.
        if (patch.keyPoint !== undefined && patch.keyPoint !== get().form.keyPoint && patch.points === undefined) next.points = [];
        set({ form: next });
      },

      addExample: (source) => {
        const { examples } = get().form;
        if (examples.some((e) => e.id === source.id) || examples.length >= MAX_EXAMPLES) return false;
        set({ form: { ...get().form, examples: [...examples, source] } });
        return true;
      },
      removeExample: (id) => set({ form: { ...get().form, examples: get().form.examples.filter((e) => e.id !== id) } }),

      write: async () => {
        const form = get().form;
        if (!canWrite(form) || running()) return;
        const asked = normalizeRequest(requestOf(form));
        // What was written is what the drafts keep (refining asks the same thing again): that
        // includes the key point step 1 picked, and the real questions the studio chose when
        // none was picked.
        const meta: Pick<RunInfo, 'kind' | 'request'> = { kind: 'write', request: asked };
        let picks: KeyPick[] = [];
        const action: Action = () => get().write();
        await run(
          meta,
          action,
          async (deps, runHooks) => {
            // The pictures of a picked question are read first: step 1 may need them to see what it tests.
            const step1 = await withKeyPoints(await withExampleFigures(asked, env), deps, runHooks, form.current);
            if (!step1.ok) return { ok: false, error: step1.error, usage: step1.usage };
            picks = step1.picks;
            // Step 1 took one of the requests: the bar counts on from there.
            const hooks2: RunHooks = step1.picks.length ? { signal: runHooks.signal, onEvent: runHooks.onEvent, progress: (done, total, stage) => runHooks.progress?.(done + 1, total + 1, stage) } : runHooks;
            const request = await withExampleFigures(await withReferences(step1.request, env, hooks2), env);
            meta.request = request;
            const outcome = await writeDrafts(request, deps, hooks2, { avoid: get().entries.filter((e) => e.request.keyPoint === request.keyPoint).map((e) => e.draft) });
            return { ...outcome, usage: addUsage(step1.usage, outcome.usage) };
          },
          (outcome) => {
            const request = meta.request;
            const fresh = outcome.drafts.map((draft): SheetDraft => ({ draft, request }));
            set({ entries: [...fresh, ...get().entries], picks, notes: outcome.notes, ...(fresh[0] ? { focus: fresh[0].draft.id } : {}) });
          },
        );
      },

      refine: async (id, refinement) => {
        const entry = get().entries.find((e) => e.draft.id === id);
        if (!entry || running()) return;
        const action: Action = () => get().refine(id, refinement);
        await run(
          { kind: 'refine', request: entry.request },
          action,
          (deps, runHooks) => {
            const others = get().entries.filter((e) => e !== entry && e.request.keyPoint === entry.request.keyPoint).map((e) => e.draft);
            return refineDraft(entry.request, entry.draft, refinement, others, deps, runHooks);
          },
          (outcome) => {
            const made = outcome.drafts[0];
            set({ notes: outcome.notes });
            if (!made) return;
            const next: SheetDraft = { draft: made, request: entry.request };
            const entries = get().entries;
            const at = entries.indexOf(entry);
            if (at < 0) return;
            if (refinement.kind === 'another') {
              set({ entries: [...entries.slice(0, at + 1), next, ...entries.slice(at + 1)], focus: made.id });
            } else {
              // Changed in place; the teacher reads the new one again, so it is not ticked.
              set({ entries: entries.map((e) => (e === entry ? next : e)), picked: get().picked.filter((p) => p !== id), focus: made.id });
            }
          },
          id,
        );
      },

      stop: () => controller?.abort(),

      toggle: (id) => {
        const entry = get().entries.find((e) => e.draft.id === id);
        if (!entry || !tickable(entry)) return;
        const { picked } = get();
        set({ picked: picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id] });
      },

      discard: (id) => {
        const entries = get().entries.filter((e) => e.draft.id !== id);
        const { focus } = get();
        set({ entries, picked: get().picked.filter((p) => p !== id), ...(focus === id ? { focus: entries[0]?.draft.id } : {}) });
      },

      delivered: (ids) => {
        const gone = new Set(ids);
        const entries = get().entries.filter((e) => !gone.has(e.draft.id));
        const { focus } = get();
        set({ entries, picked: get().picked.filter((p) => !gone.has(p)), ...(focus && gone.has(focus) ? { focus: entries[0]?.draft.id } : {}) });
      },

      clearDrafts: () => set({ entries: [], picked: [], notes: [], focus: undefined, live: emptyLive() }),

      setFocus: (id) => set({ focus: id }),

      dismissError: () => {
        if (get().phase.kind === 'error') set({ phase: { kind: 'idle' } });
      },

      retry: async () => {
        const again = last;
        if (get().phase.kind === 'error') set({ phase: { kind: 'idle' } });
        await again?.();
      },
    };
  });
}

/** Sentence for an error that has no provider yet: the studio asks Settings, as every ✦ run does. */
export const notConfigured = (provider: Parameters<typeof aiErrorInfo>[1]): AiErrorInfo => aiErrorInfo('notConfigured', provider);
