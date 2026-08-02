'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { StartScreen } from '@/components/start/StartScreen';
import type { LanguageMode, Worksheet } from '@/model/types';
import { worksheetStore } from '@/storage';
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
 */
export function EditorHost() {
  const [chosen, setChosen] = useState(false);
  const [showingFiles, setShowingFiles] = useState(false);
  const replaceWorksheet = useWorksheetStore((s) => s.replaceWorksheet);
  const setMode = useWorksheetStore((s) => s.setMode);

  /**
   * Leave the editor for the file list, saving first.
   *
   * Autosave is a 1.2s debounce living in an effect *inside* `EditorApp`, so unmounting
   * it cancels a pending save — up to 1.2 seconds of typing would be dropped by the act
   * of going to look at the file list, and the list would then show a stale
   * "updated" time for the very document just edited. Flushing here is what makes
   * leaving safe.
   *
   * Saved by value and marked clean in one step, matching `open` below — the store's
   * own `save()` would do the same thing here, but the two departure paths reading state
   * differently is exactly how one of them would later be given the wrong document.
   */
  const leaveForFiles = () => {
    const { worksheet, dirty, markSaved } = useWorksheetStore.getState();
    if (dirty) void worksheetStore.save(worksheet).then(markSaved);
    setShowingFiles(true);
  };

  const open = (worksheet: Worksheet, language?: LanguageMode) => {
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
    void worksheetStore.save(worksheet);
    // Only the new-document form reports a language; opening a saved worksheet leaves
    // the current view mode alone, since the document does not store one.
    if (language) setMode({ language });
    setChosen(true);
    setShowingFiles(false);
  };

  if (!chosen || showingFiles) {
    return (
      <StartScreen
        onOpen={open}
        // No way back before a document exists — there is no editor behind the screen
        // yet, so a Cancel would dismiss to nothing.
        onClose={chosen ? () => setShowingFiles(false) : undefined}
      />
    );
  }

  return <EditorApp onOpenFiles={leaveForFiles} />;
}
