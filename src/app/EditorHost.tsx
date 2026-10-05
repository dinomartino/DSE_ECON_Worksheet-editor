'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { UpdateBanner } from '@/components/editor/UpdateBanner';
import { AppSettingsHost } from '@/components/settings/AppSettingsHost';
import { NoticeLayer } from '@/components/ui/NoticeLayer';
import { setBeforeRestart } from '@/desktop/updateStore';
import { useBankReturn, useKeptTarget } from '@/components/bank/page/bankReturn';
import { StartScreen } from '@/components/start/StartScreen';
import type { LanguageMode, Worksheet } from '@/model/types';
import { NewerDocumentError, worksheetStore } from '@/storage';
import { useWorksheetStore } from '@/store/worksheetStore';

/**
 * Client-only host for the editor.
 *
 * The editor's initial state is a blank worksheet built by the factories, whose ids
 * come from `nanoid()` — so the server and the client each generate a *different*
 * document, React reports a hydration mismatch and then discards the server tree and
 * re-renders the entire editor. Seeding those ids to make the two agree would be the
 * wrong fix: this page has nothing worth server-rendering. It reads saved worksheets
 * from localStorage on mount, builds its .docx in the browser, and prints its PDF
 * through the browser's own engine.
 *
 * `ssr: false` therefore states the truth about the page rather than papering over a
 * symptom. It skips prerendering, not the static export target — no server runtime is
 * introduced, so the Vercel static deploy is unaffected.
 *
 * `ssr: false` is only legal from a Client Component in the App Router, which is why
 * this thin wrapper exists rather than the call living in `page.tsx`.
 */
const EditorApp = dynamic(
  () => import('@/components/EditorApp').then((m) => m.EditorApp),
  { ssr: false },
);

/**
 * Save the open document before the editor unmounts: autosave's 1.2s debounce dies with
 * `EditorApp`. By **value**, as `open` does, and awaited, so the start screen reads the
 * new summary. Only a value that was itself written is marked clean — typing, or a
 * document swapped in, during the write is saved in turn. Leaving clean means nothing
 * writes the document back if it is then trashed. Rejects on a failed write, so the
 * caller stays in the editor.
 */
export async function flushBeforeLeaving(save = (w: Worksheet) => worksheetStore.save(w)): Promise<void> {
  for (let state = useWorksheetStore.getState(); state.dirty; state = useWorksheetStore.getState()) {
    await save(state.worksheet);
    if (useWorksheetStore.getState().worksheet === state.worksheet) state.markSaved();
  }
}

/**
 * "Clear saved documents": the open document goes with the rest. Marked clean *before*
 * the clear, so neither a due autosave nor a flush writes it back; the caller then
 * leaves without `flushBeforeLeaving`. A failed clear restores `dirty`.
 */
export async function clearSavedDocuments(clear = () => worksheetStore.clear()): Promise<void> {
  const { dirty } = useWorksheetStore.getState();
  useWorksheetStore.setState({ dirty: false });
  try {
    await clear();
  } catch (error) {
    if (dirty) useWorksheetStore.setState({ dirty: true });
    throw error;
  }
}

/**
 * Start screen or editor — the one place that decides which.
 *
 * The gate lives *outside* the editor rather than as an overlay inside it, because the
 * editor is expensive and its whole reason to exist is a document to work on: mounting
 * it behind the screen would run the paginator over a blank worksheet nobody asked for,
 * and — since the preview measures real boxes — would do it on every visit to the file
 * list.
 *
 * `chosen` is deliberately **session state, not a stored preference**. It answers "has
 * a document been picked in this tab", which is exactly the question, and it resets on
 * reload — so opening the app always starts at the list. The alternative, reopening the
 * most recently saved document automatically, is what this screen replaces: it made
 * every worksheet but the newest unreachable, and it meant the app decided what you
 * were working on before you did.
 *
 * Leaving the editor clears `chosen` too: the start screen is one home page, never a
 * detour with a way back to the document just left.
 */
const noSubscribe = () => () => {};

export function EditorHost() {
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [chosen, setChosen] = useState(false);
  const replaceWorksheet = useWorksheetStore((s) => s.replaceWorksheet);

  // Restarting into an update kills the autosave debounce; write pending edits first.
  useEffect(
    () =>
      setBeforeRestart(async () => {
        const { worksheet, dirty, markSaved } = useWorksheetStore.getState();
        if (!dirty) return;
        await worksheetStore.save(worksheet);
        markSaved();
      }),
    [],
  );
  const setMode = useWorksheetStore((s) => s.setMode);

  const cameFromBank = useBankReturn((s) => s.saved !== null);
  const leave = async () => {
    await flushBeforeLeaving();
    // Home the normal way forgets where the bank was.
    useBankReturn.getState().clear();
    setChosen(false);
  };
  // Back to the question bank: same flush, and the bank reads where it left off.
  const backToBank = async () => {
    await flushBeforeLeaving();
    setChosen(false);
  };
  // The one leave that must not flush: the document on screen was just deleted.
  const clearAndLeave = async () => {
    await clearSavedDocuments();
    useBankReturn.getState().clear();
    setChosen(false);
  };

  const open = (worksheet: Worksheet, language?: LanguageMode) => {
    // Any open forgets the way back and the kept Add-to target; the bank's "open in
    // worksheet" sets both again after.
    useBankReturn.getState().clear();
    useKeptTarget.getState().forget();
    /*
     * Flush the outgoing document, for the reason above — but by **value**, not through
     * `store.save()`.
     *
     * That method saves `getState().worksheet`, and the `replaceWorksheet` on the next
     * line has already swapped it by the time the awaited write runs: the outgoing
     * document would be skipped and the incoming one written twice. Capturing the
     * worksheet here and handing it to the storage layer directly is what makes the
     * order unambiguous.
     */
    const outgoing = useWorksheetStore.getState();
    if (chosen && outgoing.dirty) void worksheetStore.save(outgoing.worksheet);
    replaceWorksheet(worksheet);

    /*
     * Save the incoming document immediately, before a single edit.
     *
     * `replaceWorksheet` marks the store **clean** — correctly, since nothing has been
     * changed yet — and autosave only fires on `dirty`. So a worksheet created and then
     * left alone was never written anywhere: answer the new-document form, go straight
     * back to the file list, and the document is simply not there. That is the exact
     * shape of "the app lost my work", and it was reachable in about four seconds.
     *
     * Writing it here also means the list is never missing a document the teacher has
     * seen on screen, which is the property the file manager has to have to be trusted.
     */
    void worksheetStore.save(worksheet).catch((error: unknown) => {
      // A newer build's document already stored is shown read-only, never rewritten.
      if (!(error instanceof NewerDocumentError)) throw error;
    });
    // Only the new-document form reports a language; opening a saved worksheet leaves
    // the current view mode alone, since the document does not store one.
    if (language) setMode({ language });
    setChosen(true);
  };

  // The start screen reads the platform and localStorage while rendering, which the
  // static prerender (a web build, no storage) cannot know — so it renders only on the
  // client. Hydrating it against the prerender made the desktop app rebuild the tree.
  // `data-app-booting` tells the launch splash the start screen is not up yet.
  if (!hydrated) return <div data-app-booting className="h-screen bg-desk" />;

  return (
    <div className="flex h-screen flex-col">
      {/* Raises the desktop "update ready" notice; draws nothing itself. */}
      <UpdateBanner />
      {/* App Settings: the start screen and the editor both reach it. */}
      <AppSettingsHost />
      <div className="min-h-0 flex-1">
        {!chosen ? (
          <StartScreen onOpen={open} />
        ) : (
          <EditorApp onOpenFiles={() => void leave()} onBackToBank={cameFromBank ? () => void backToBank() : undefined} onClearAll={clearAndLeave} onOpenDocument={open} />
        )}
      </div>
      {/* The one app notice stack: start screen, 題庫, Graphs and the editor all share it. */}
      <NoticeLayer />
    </div>
  );
}
