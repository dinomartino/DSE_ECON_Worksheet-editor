import type { StoreApi, UseBoundStore } from 'zustand';
import { presetFor } from '@/ai/providers';
import type { AiErrorInfo, ProviderId } from '@/ai/types';
import type { ApplyReport, Side, TextSlot, TranslationWrite } from '@/model/textSlots';
import type { OutputMode, Worksheet } from '@/model/types';
import type { AiStatus } from '@/settings/aiSettings';
import type { AppNotice, SettingsRequest, TranslateRequest } from '@/store/appDialogs';
import { defaultTranslateOptions, type planTranslation } from '@/translate/plan';
import type { runTranslation, writesFor } from '@/translate/run';
import type { termFixWrites } from '@/translate/termCheck';
import type { createRunDeps } from '@/translate/deps';
import type { RunDepsResult, RunOutcome, TermRow, TranslateOptions, TranslateScope, TranslationPlan } from '@/translate/types';
import {
  UNDO_ACTION,
  filledFlash,
  noBaseUrlError,
  noKeyError,
  noModelError,
  replacedTermsFlash,
  viewSideAction,
} from './copy';
import {
  acceptedKeys,
  acceptedTermFixes,
  closeIntent,
  insertTally,
  pendingKeys,
  probeOptions,
  restrictPlan,
  sameRequest,
  type RunRecord,
  type SessionAction,
  type SessionMode,
  type SessionStore,
  type ReviewFilter,
} from './translateSession';

/**
 * The Translate dialog's effects: planning, the run and its abort, Insert, and the
 * hand-offs to Settings. Everything outside the session is injected, so a node test
 * drives plan → run → review → insert with fakes.
 */

export interface ControllerDeps {
  store: UseBoundStore<StoreApi<SessionStore>>;
  getWorksheet: () => Worksheet;
  getMode: () => OutputMode;
  readStatus: () => AiStatus;
  includeTeacherText: () => boolean;
  /** Writes `ai.includeTeacherText`: the teacher-text box is a remembered setting. */
  rememberIncludeTeacher: (on: boolean) => void;
  desktop: () => boolean;
  plan: typeof planTranslation;
  createRunDeps: typeof createRunDeps;
  run: typeof runTranslation;
  writesFor: typeof writesFor;
  termFixWrites: typeof termFixWrites;
  apply: (writes: readonly TranslationWrite[], opts: { worksheetId: string }) => ApplyReport;
  /** appDialogs.close(). */
  closeDialog: () => void;
  openSettings: (request: SettingsRequest, returnTo?: TranslateRequest) => void;
  notify: (message: string, action?: AppNotice['action']) => void;
  undo: () => void;
  /** Switch the editor to the side just filled. */
  showSide: (side: Side) => void;
  /** A key for this provider is saved (web storage peek, or the desktop presence flag). */
  keySaved: (provider: ProviderId) => boolean;
  setProvider: (provider: ProviderId) => void;
  setModel: (provider: ProviderId, model: string) => void;
  openExternal: (url: string) => void;
  showOnPage: (slot: TextSlot) => void;
}

/** A texts count this small from a page or field action skips Setup (the click was the send). */
const AUTO_START_MAX = 3;

export function createTranslateController(deps: ControllerDeps) {
  const { store } = deps;
  const session = () => store.getState().session;
  const dispatch = (action: SessionAction) => store.getState().dispatch(action);
  let runId = 0;
  let abort: AbortController | null = null;

  const finish = () => {
    runId += 1;
    abort?.abort();
    abort = null;
    dispatch({ type: 'reset' });
    deps.closeDialog();
  };

  async function execute(plan: TranslationPlan) {
    runId += 1;
    const id = runId;
    const controller = new AbortController();
    abort = controller;
    const current = () => id === runId;
    const resolved = await deps.createRunDeps({ glossary: true });
    if (!current()) return;
    if (controller.signal.aborted) {
      dispatch({ type: 'runFinished', outcome: { results: new Map(), stopped: true, model: '', ms: 0 } });
      return;
    }
    if (!resolved.ok) {
      dispatch({ type: 'runFailed', error: depsError(resolved, deps.desktop()) });
      return;
    }
    let outcome: RunOutcome;
    try {
      outcome = await deps.run(plan, resolved.deps, controller.signal, (progress) => {
        if (current()) dispatch({ type: 'progress', progress });
      });
    } catch {
      // `runTranslation` never rejects; a bug must still not strand the dialog on Running.
      outcome = { results: new Map(), stopped: true, model: '', ms: 0 };
    }
    if (current()) {
      abort = null;
      dispatch({ type: 'runFinished', outcome });
    }
  }

  function stop() {
    abort?.abort();
    dispatch({ type: 'confirm', confirm: null });
  }

  function translate() {
    const { scope, options, phase } = session();
    if (!options || phase !== 'setup') return;
    const plan = deps.plan(deps.getWorksheet(), scope, options);
    dispatch({ type: 'runStarted', plan });
    void execute(plan);
  }

  /** Re-sends only the jobs without a usable result; finished rows stay. */
  function retry() {
    const run = session().run;
    if (!run) return translateFromError();
    dispatch({ type: 'runStarted' });
    void execute(restrictPlan(run.plan, pendingKeys(run)));
  }

  function translateFromError() {
    // A dependency failure before any run record: back to Setup's plan, sent again.
    dispatch({ type: 'discard' });
    translate();
  }

  function report(result: ApplyReport, message: string, action?: AppNotice['action']) {
    if (result.refused) return finish();
    if (result.applied === 0) return dispatch({ type: 'nothingInserted' });
    finish();
    deps.notify(message, action);
  }

  /** `View 中文` when the filled side is hidden in the editor's mode, else Undo. */
  function flashAction(writes: readonly TranslationWrite[]): AppNotice['action'] {
    const shown = deps.getMode().language;
    const hidden = shown === 'bilingual' ? undefined : writes.find((w) => w.side !== shown)?.side;
    return hidden
      ? { label: viewSideAction(hidden), run: () => deps.showSide(hidden) }
      : { label: UNDO_ACTION, run: deps.undo };
  }

  function apply(writes: readonly TranslationWrite[]): ApplyReport | null {
    const request = session().request;
    if (!request || writes.length === 0) return null;
    return deps.apply(writes, { worksheetId: request.worksheetId });
  }

  return {
    /** Opens `request`, or resumes it after a Settings round trip. */
    open(request: TranslateRequest) {
      if (sameRequest(session().request, request)) {
        dispatch({ type: 'open', request, options: session().options ?? defaultOptions(request), mode: session().mode });
        return;
      }
      const options = defaultOptions(request);
      const worksheet = deps.getWorksheet();
      const probe = deps.plan(worksheet, request.scope, probeOptions(options)).counts;
      const planned = deps.plan(worksheet, request.scope, options).counts;
      // A symbol gap is something to fill only where this edition copies it (never in EN+中).
      const nothing = probe.toZh + probe.toEn === 0 && planned.copied === 0;
      const mode: SessionMode = request.mode === 'check' || nothing ? 'check' : 'translate';
      dispatch({ type: 'open', request, options, mode });
      if (!request.autoStart || mode !== 'translate' || !deps.readStatus().configured) return;
      const texts = planned.toZh + planned.toEn;
      if (texts > 0 && texts <= AUTO_START_MAX) translate();
    },
    /** Drops the session (and any run) without touching the app dialog. */
    reset() {
      runId += 1;
      abort?.abort();
      abort = null;
      dispatch({ type: 'reset' });
    },
    translate,
    retry,
    stop,
    /** Escape, ✕ and the scrim. Methods never use `this`: they are passed as handlers. */
    requestClose() {
      switch (closeIntent(session())) {
        case 'close':
        case 'discard':
          return finish();
        case 'stop':
          return stop();
        case 'askStop':
          return dispatch({ type: 'confirm', confirm: { kind: 'stop' } });
        case 'askDiscard':
          return dispatch({ type: 'confirm', confirm: { kind: 'discard', then: 'close' } });
      }
    },
    keepGoing() {
      dispatch({ type: 'confirm', confirm: null });
    },
    back() {
      if (closeIntent(session()) === 'close') return dispatch({ type: 'discard' });
      dispatch({ type: 'confirm', confirm: { kind: 'discard', then: 'setup' } });
    },
    discard() {
      const confirm = session().confirm;
      if (confirm?.kind === 'discard' && confirm.then === 'setup') return dispatch({ type: 'discard' });
      finish();
    },
    close: finish,
    insert() {
      const s = session();
      if (!s.run) return;
      const writes = deps.writesFor(s.run.plan, outcomeOf(s.run), acceptedKeys(s), s.acceptCopies);
      const result = apply(writes);
      if (!result) return;
      const tally = insertTally(s, new Set(result.skipped.map((skip) => skip.path)));
      report(result, filledFlash(tally.filled, tally.skipped), flashAction(writes));
    },
    /** "Only symbols to fill": the copies the options write (per edition), one commit, no model. */
    copySymbols() {
      const { scope, options } = session();
      if (!options) return;
      const writes = deps.plan(deps.getWorksheet(), scope, options).copies;
      const result = apply(writes);
      if (result) report(result, filledFlash(result.applied, result.skipped.length), flashAction(writes));
    },
    replaceTerms(rows: readonly TermRow[]) {
      const accepted = acceptedTermFixes(session(), rows);
      const writes = deps.termFixWrites(rows, accepted);
      const result = apply(writes);
      if (!result) return;
      const skipped = new Set(result.skipped.map((s) => s.path));
      let terms = 0;
      for (const write of writes) if (!skipped.has(write.path)) terms += accepted.get(write.path)?.size ?? 0;
      report(result, replacedTermsFlash(terms), { label: UNDO_ACTION, run: deps.undo });
    },
    showOnPage(slot: TextSlot) {
      finish();
      deps.showOnPage(slot);
    },

    // ---- hand-offs (Setup and Error only; never while a request is in flight) ----
    setUp(provider: ProviderId) {
      deps.openSettings({ section: 'ai', focus: 'key', params: { provider } }, session().request ?? undefined);
    },
    openSettings(focus: 'key' | 'model' = 'key') {
      deps.openSettings({ section: 'ai', focus }, session().request ?? undefined);
    },
    /** Region error: switch and retry when a key is saved, else set that provider up. */
    useProvider(provider: ProviderId) {
      if (!deps.keySaved(provider)) {
        deps.openSettings(
          { section: 'ai', focus: 'key', params: { provider, reason: 'region' } },
          session().request ?? undefined,
        );
        return;
      }
      deps.setProvider(provider);
      retry();
    },
    useFallbackModel() {
      const { provider, preset } = deps.readStatus();
      if (!preset.quotaFallbackModel) return;
      deps.setModel(provider, preset.quotaFallbackModel);
      retry();
    },
    openKeyPage() {
      const url = deps.readStatus().preset.keyUrl;
      if (url) deps.openExternal(url);
    },

    // ---- plain state ----
    setMode: (mode: SessionMode) => dispatch({ type: 'setMode', mode }),
    setScope: (scope: TranslateScope) => dispatch({ type: 'setScope', scope }),
    setOptions(patch: Partial<TranslateOptions>) {
      if (patch.includeTeacher !== undefined && session().phase === 'setup') {
        deps.rememberIncludeTeacher(patch.includeTeacher);
      }
      dispatch({ type: 'setOptions', patch });
    },
    tick: (keys: readonly string[], value: boolean) => dispatch({ type: 'tick', keys, value }),
    toggleCopies: () => dispatch({ type: 'toggleCopies' }),
    setFilter: (filter: ReviewFilter) => dispatch({ type: 'setFilter', filter }),
    review: () => dispatch({ type: 'review' }),
    toggleTerm: (key: string, value: boolean) => dispatch({ type: 'toggleTerm', key, value }),
  };

  function defaultOptions(request: TranslateRequest): TranslateOptions {
    return defaultTranslateOptions(deps.getMode(), deps.includeTeacherText(), request.retranslate);
  }
}

export type TranslateController = ReturnType<typeof createTranslateController>;

function outcomeOf(run: RunRecord): RunOutcome {
  return { results: run.results, stopped: run.stopped, model: run.model, ms: run.ms };
}

/** A run that could not start: the provider's settings are incomplete or the key unreadable. */
export function depsError(result: Extract<RunDepsResult, { ok: false }>, desktop: boolean): AiErrorInfo {
  const label = presetFor(result.provider).label;
  const base = { provider: result.provider, fatal: true } as const;
  switch (result.reason) {
    case 'noModel':
      return { ...base, kind: 'model', message: noModelError(label), actions: ['chooseModel'] };
    case 'noBaseUrl':
      return { ...base, kind: 'notConfigured', message: noBaseUrlError(label), actions: ['openSettings'] };
    case 'secretError':
      return {
        ...base,
        kind: 'notConfigured',
        message: result.error?.message ?? noKeyError(label, desktop),
        actions: ['retry', 'openSettings'],
      };
    case 'noKey':
      return { ...base, kind: 'notConfigured', message: noKeyError(label, desktop), actions: ['openSettings'] };
  }
}
