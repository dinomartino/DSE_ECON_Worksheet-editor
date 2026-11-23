import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { aiErrorInfo } from '@/ai/errors';
import type { AiErrorInfo } from '@/ai/types';
import type { Side } from '@/model/textSlots';
import type { LanguageMode } from '@/model/types';
import { lookupCode } from '@/syllabus';
import { normalizeRequest } from './brief';
import { emptyUsage, refine as refineDraft, writeDrafts, type RunHooks, type Stage } from './run';
import {
  BATCH_SIZES,
  MAX_EXAMPLES,
  type Finding,
  type Level,
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
  /** A syllabus key point code (`C.ped`); '' = not chosen yet. */
  keyPoint: string;
  /** Narrow it to some of its points (`C.ped#arc`); none = the whole key point. */
  points: string[];
  /** Up to `MAX_EXAMPLES` bank questions to write like. */
  examples: SourceQuestion[];
  count: (typeof BATCH_SIZES)[number];
  level: Level;
  shape: Shape;
  language: LanguageMode;
  note: string;
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
}

export interface StudioState {
  form: StudioForm;
  /** Newest batch first. */
  entries: SheetDraft[];
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
  count: 3,
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
  count: form.count,
  level: form.level,
  shape: form.shape,
  sides: sidesOf(form.language),
  note: form.note,
});

/** Whether the form can be written: a key point of the syllabus, and nothing running. */
export const canWrite = (form: StudioForm): boolean => {
  const hit = lookupCode(form.keyPoint);
  return Boolean(hit && !hit.point);
};

const addUsage = (a: Usage, b: Usage): Usage => ({
  requests: a.requests + b.requests,
  input: a.input + b.input,
  output: a.output + b.output,
  thinking: a.thinking + b.thinking,
  ms: a.ms + b.ms,
});

type Action = () => Promise<void>;

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
      set({ phase: at(0, 2, 'write') });
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
        const outcome = await go(resolved.deps, { signal: mine.signal, progress: (done, total, stage) => set({ phase: at(done, total, stage) }) });
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

    const tickable = (entry: SheetDraft) => entry.draft.status !== 'failed';

    return {
      form: defaultForm(initialLanguage),
      entries: [],
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
        const request = normalizeRequest(requestOf(form));
        const action: Action = () => get().write();
        await run(
          { kind: 'write', request },
          action,
          (deps, runHooks) =>
            writeDrafts(request, deps, runHooks, { avoid: get().entries.filter((e) => e.request.keyPoint === request.keyPoint).map((e) => e.draft) }),
          (outcome) => {
            const fresh = outcome.drafts.map((draft): SheetDraft => ({ draft, request }));
            set({ entries: [...fresh, ...get().entries], notes: outcome.notes, ...(fresh[0] ? { focus: fresh[0].draft.id } : {}) });
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

      clearDrafts: () => set({ entries: [], picked: [], notes: [], focus: undefined }),

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
