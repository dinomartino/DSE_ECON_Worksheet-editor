import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { isAiError, type AiErrorInfo, type ProviderId } from '@/ai/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { useAiMenu } from './menuStore';
import { verbById } from './registry';
import { scopeFromSelection, scopeLabel } from './scope';
import type { VerbContext, VerbOutcome } from './types';

export type ReviewOutcome = Extract<VerbOutcome, { kind: 'inserted' | 'findings' | 'nothing' }>;

export type AiRunPhase =
  | { kind: 'idle' }
  | { kind: 'running'; verbId: string; label: string; done: number; total: number }
  | { kind: 'review'; verbId: string; outcome: ReviewOutcome; index: number }
  | { kind: 'error'; verbId: string; error: AiErrorInfo };

export interface AiRunState {
  phase: AiRunPhase;
  /** Builds the context from the worksheet store and the menu's scope (else the selection),
   *  closes the menu and runs. Refused while read-only or while another run is going. */
  startVerb(verbId: string, input?: string): Promise<void>;
  /** Aborts; a verb returns what already finished (inserted) on abort. */
  stop(): void;
  next(): void;
  prev(): void;
  /** Leaves review or error; the inserted text stays. */
  dismiss(): void;
  /** Reverts the run's one commit (when still live) and goes idle. */
  undoAll(): void;
}

/** A throw that is not an AiError: shown as a generic, non-fatal failure. */
export function genericError(err: unknown, provider: ProviderId = 'gemini'): AiErrorInfo {
  return {
    kind: 'badOutput',
    provider,
    message: 'Something went wrong. Nothing more was changed.',
    ...(err instanceof Error && err.message ? { detail: err.message.slice(0, 300) } : {}),
    fatal: false,
    actions: ['retry'],
  };
}

let controller: AbortController | null = null;

/** The context a verb runs in. The menu's scope wins; else the editor's selection. */
export function buildVerbContext(): VerbContext {
  const ws = useWorksheetStore.getState();
  const open = useAiMenu.getState().open;
  const scope = open?.scope ?? scopeFromSelection(ws);
  return {
    worksheet: ws.worksheet,
    mode: ws.mode,
    scope,
    scopeLabel: open?.scopeLabel ?? scopeLabel(ws.worksheet, scope),
  };
}

function applyView(outcome: Extract<VerbOutcome, { kind: 'inserted' }>): void {
  const store = useWorksheetStore.getState();
  const { language, version } = store.mode;
  if (outcome.showSide && language !== 'bilingual' && language !== outcome.showSide) {
    store.setMode({ language: outcome.showSide });
  }
  if (outcome.showTeacher && version !== 'teacher') store.setMode({ version: 'teacher' });
}

const itemCount = (phase: AiRunPhase): number =>
  phase.kind === 'review' && phase.outcome.kind !== 'nothing' ? phase.outcome.items.length : 0;

export const useAiRun: UseBoundStore<StoreApi<AiRunState>> = create<AiRunState>((set, get) => ({
  phase: { kind: 'idle' },

  startVerb: async (verbId, input) => {
    const verb = verbById(verbId);
    if (!verb || controller || get().phase.kind === 'running') return;
    if (useWorksheetStore.getState().readOnly) return;
    const ctx = buildVerbContext();
    useAiMenu.getState().close();
    const own = new AbortController();
    controller = own;
    const label = verb.label(ctx);
    set({ phase: { kind: 'running', verbId, label, done: 0, total: 0 } });
    const io = {
      signal: own.signal,
      progress: (done: number, total: number, progressLabel?: string) => {
        if (controller !== own) return;
        set({ phase: { kind: 'running', verbId, label: progressLabel ?? label, done, total } });
      },
    };
    let outcome: VerbOutcome;
    try {
      outcome = await verb.run(ctx, io, input);
    } catch (err) {
      outcome = { kind: 'error', error: isAiError(err) ? err.info : genericError(err) };
    }
    if (controller !== own) return;
    controller = null;
    if (outcome.kind === 'error') {
      set({ phase: { kind: 'error', verbId, error: outcome.error } });
      return;
    }
    if (outcome.kind === 'inserted') applyView(outcome);
    set({ phase: { kind: 'review', verbId, outcome, index: 0 } });
  },

  stop: () => controller?.abort(),

  next: () => {
    const phase = get().phase;
    const count = itemCount(phase);
    if (phase.kind === 'review' && count > 0) set({ phase: { ...phase, index: (phase.index + 1) % count } });
  },

  prev: () => {
    const phase = get().phase;
    const count = itemCount(phase);
    if (phase.kind === 'review' && count > 0) set({ phase: { ...phase, index: (phase.index - 1 + count) % count } });
  },

  dismiss: () => {
    if (get().phase.kind === 'running') return;
    set({ phase: { kind: 'idle' } });
  },

  undoAll: () => {
    const phase = get().phase;
    if (phase.kind !== 'review') return;
    if (phase.outcome.kind === 'inserted' && phase.outcome.undo?.live()) phase.outcome.undo.run();
    set({ phase: { kind: 'idle' } });
  },
}));

/** Test seam: abandon any run and go idle. */
export function resetAiRunForTest(): void {
  controller?.abort();
  controller = null;
  useAiRun.setState({ phase: { kind: 'idle' } });
}
