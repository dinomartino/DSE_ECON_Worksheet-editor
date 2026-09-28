'use client';

import { useEffect, useMemo, useState } from 'react';
import { scrollPageTo } from '@/components/editor/panelRows';
import { loadGlossary } from '@/glossary/load';
import type { Glossary } from '@/glossary/types';
import { editTargetKey } from '@/model/edits';
import { collectTexts } from '@/model/textWalk';
import { isDesktop, openExternal } from '@/platform';
import { peekSecret } from '@/platform/secrets';
import { AI_SETTINGS, readAiStatus, useAiStatus } from '@/settings/aiSettings';
import { appSettings } from '@/settings/store';
import { useAppDialogs } from '@/store/appDialogs';
import { useWorksheetStore } from '@/store/worksheetStore';
import { createRunDeps } from '@/translate/deps';
import { planTranslation } from '@/translate/plan';
import { runTranslation, writesFor } from '@/translate/run';
import { buildTermCheck, termFixWrites } from '@/translate/termCheck';
import { scopeChoices } from './SetupPanel';
import { TranslateDialog } from './TranslateDialog';
import { createTranslateController } from './translateController';
import { hostAction, probeOptions, sameRequest, useTranslateSession, type TranslateSession } from './translateSession';

const worksheetState = () => useWorksheetStore.getState();
const aiSettings = () => appSettings.read(AI_SETTINGS);

/** The one controller, bound to the real stores; tests build their own with fakes. */
const controller = createTranslateController({
  store: useTranslateSession,
  getWorksheet: () => worksheetState().worksheet,
  getMode: () => worksheetState().mode,
  readStatus: readAiStatus,
  includeTeacherText: () => aiSettings().includeTeacherText,
  desktop: isDesktop,
  plan: planTranslation,
  createRunDeps,
  run: runTranslation,
  writesFor,
  termFixWrites,
  apply: (writes, opts) => worksheetState().applyTranslations(writes, opts),
  closeDialog: () => useAppDialogs.getState().close(),
  openSettings: (request, returnTo) => useAppDialogs.getState().openSettings(request, returnTo),
  notify: (message, action) => useAppDialogs.getState().notify(message, action),
  undo: () => worksheetState().undo(),
  showSide: (side) => worksheetState().setMode({ language: side }),
  keySaved: (provider) => peekSecret(`ai:${provider}`) !== null || aiSettings().keychainSaved[provider] === true,
  setProvider: (provider) => appSettings.write(AI_SETTINGS, { provider }),
  setModel: (provider, model) => appSettings.write(AI_SETTINGS, { models: { ...aiSettings().models, [provider]: model } }),
  openExternal: (url) => void openExternal(url),
  showOnPage: (slot) => {
    const store = worksheetState();
    if (slot.questionId) store.select(slot.questionId);
    else if (slot.flowId) store.selectElement(slot.flowId);
    const target = slot.target;
    if (target) requestAnimationFrame(() => scrollPageTo(editTargetKey(target)));
  },
});

/**
 * Mounted once in `EditorApp`, the only place a document exists. Shows the Translate
 * dialog while the app dialog is a translate request for the open, editable document;
 * closes a stale one; keeps the session while Settings holds it as `returnTo`.
 */
export function TranslateHost() {
  const open = useAppDialogs((s) => s.open);
  const worksheetId = useWorksheetStore((s) => s.worksheet.id);
  const readOnly = useWorksheetStore((s) => s.readOnly);
  const session = useTranslateSession((s) => s.session);

  useEffect(() => {
    const action = hostAction(open, useTranslateSession.getState().session, { worksheetId, readOnly });
    if (action === 'open' && open?.kind === 'translate') controller.open(open.request);
    else if (action === 'closeStale') {
      controller.reset();
      useAppDialogs.getState().close();
    } else if (action === 'reset') controller.reset();
  }, [open, worksheetId, readOnly]);

  if (open?.kind !== 'translate' || open.request.worksheetId !== worksheetId || readOnly) return null;
  if (!sameRequest(session.request, open.request)) return null;
  return <TranslateRoot session={session} />;
}

/** Loaded when the dialog opens; a failure leaves translation working without terms. */
function useDialogGlossary(): { glossary: Glossary | null; failed: boolean } {
  const [state, setState] = useState<{ glossary: Glossary | null; failed: boolean }>({ glossary: null, failed: false });
  useEffect(() => {
    let live = true;
    loadGlossary().then(
      (glossary) => {
        if (live) setState({ glossary, failed: false });
      },
      () => {
        if (live) setState({ glossary: null, failed: true });
      },
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}

function TranslateRoot({ session }: { session: TranslateSession }) {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const selectedQuestionId = useWorksheetStore((s) => s.selectedQuestionId);
  const selectedElementId = useWorksheetStore((s) => s.selectedElementId);
  const status = useAiStatus();
  const { glossary, failed } = useDialogGlossary();
  const { request, scope, options, phase, mode } = session;
  const setup = phase === 'setup' && mode === 'translate';

  // Plans are live only in Setup: the counts and the button follow every option change.
  const plan = useMemo(
    () => (setup && options ? planTranslation(worksheet, scope, options) : null),
    [setup, worksheet, scope, options],
  );
  const probe = useMemo(
    () => (setup && options ? planTranslation(worksheet, scope, probeOptions(options)) : null),
    [setup, worksheet, scope, options],
  );
  // The pill and the ⋯ menu send the whole paper; the editor's selection adds the narrower scopes.
  const choices = useMemo(() => {
    if (!request) return [];
    const selection = {
      questionId: worksheet.questions.some((q) => q.id === selectedQuestionId) ? selectedQuestionId : undefined,
      elementId: worksheet.layout.some((l) => l.id === selectedElementId) ? selectedElementId : undefined,
    };
    return scopeChoices(request.scope, collectTexts(worksheet), selection);
  }, [request, worksheet, selectedQuestionId, selectedElementId]);
  const termRows = useMemo(
    () => (mode === 'check' && glossary ? buildTermCheck(worksheet, glossary, scope) : null),
    [mode, glossary, worksheet, scope],
  );

  return (
    <TranslateDialog
      session={session}
      view={{ status, desktop: isDesktop(), plan, probe, scopeChoices: choices, glossary, glossaryFailed: failed }}
      actions={controller}
      termRows={termRows}
    />
  );
}
