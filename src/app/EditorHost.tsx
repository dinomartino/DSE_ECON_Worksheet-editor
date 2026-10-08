'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { UpdateBanner } from '@/components/editor/UpdateBanner';
import { AppSettingsHost } from '@/components/settings/AppSettingsHost';
import { NoticeLayer } from '@/components/ui/NoticeLayer';
import { setBeforeRestart } from '@/desktop/updateStore';
import { useBankReturn, useKeptTarget } from '@/components/bank/page/bankReturn';
import { StartScreen } from '@/components/start/StartScreen';
import type { LanguageMode, Worksheet } from '@/model/types';
import { isDesktop } from '@/platform';
import { NewerDocumentError, stringifyWorksheet, worksheetStore, type WorksheetStore } from '@/storage';
import { setSyncPause, whileSyncPaused } from '@/sync/syncPause';
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

/** The store's `clear`; on desktop through sync, which forgets the folder's base first. */
async function clearStore(): Promise<void> {
  if (!isDesktop()) return worksheetStore.clear();
  const { clearSavedLibrary } = await import('@/sync/librarySync');
  return clearSavedLibrary(() => worksheetStore.clear());
}

/**
 * "Clear saved documents": the open document goes with the rest. Marked clean *before*
 * the clear, so neither a due autosave nor a flush writes it back; the caller then
 * leaves without `flushBeforeLeaving`. A failed clear restores `dirty`.
 */
export async function clearSavedDocuments(clear = clearStore): Promise<void> {
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
 * The writes an open makes, with sync held (`whileSyncPaused`): the outgoing document's unsaved
 * edits, by value, then the incoming document, so one created and left alone is in the list.
 * The incoming save is skipped when it is stored as it is (a saved document reopened), or when
 * it is stored and the editor no longer shows this value of it: sync took a newer version in
 * while a run finished, or an edit began (autosave writes that). Writing it then would put the
 * old version back over the new, and the next run would upload it.
 */
export async function saveOnOpen(
  incoming: Worksheet,
  outgoing: Worksheet | undefined,
  store: Pick<WorksheetStore, 'load' | 'save'> = worksheetStore,
): Promise<void> {
  return whileSyncPaused(async () => {
    let failed: { error: unknown } | undefined;
    if (outgoing) await store.save(outgoing).catch((error: unknown) => void (failed = { error }));
    const stored = await store.load(incoming.id).catch(() => undefined);
    const shown = useWorksheetStore.getState().worksheet;
    const current =
      !stored ||
      (stringifyWorksheet(stored) !== stringifyWorksheet(incoming) && (shown.id !== incoming.id || shown === incoming));
    if (current) {
      await store.save(incoming).catch((error: unknown) => {
        // A newer build's document already stored is shown read-only, never rewritten.
        if (!(error instanceof NewerDocumentError)) throw error;
      });
    }
    if (failed) throw failed.error;
  });
}

/**
 * Swap `worksheet` into the editor and write what the open writes (`saveOnOpen`). `markOpen`
 * runs before the swap: from then on sync's guard treats it as the open document, so a
 * download of it is taken in rather than saved over (`src/sync/openEditor.ts`).
 */
export function openDocument(
  worksheet: Worksheet,
  editorShown: boolean,
  markOpen: () => void,
  store?: Pick<WorksheetStore, 'load' | 'save'>,
): Promise<void> {
  const outgoing = useWorksheetStore.getState();
  const unsaved = editorShown && outgoing.dirty ? outgoing.worksheet : undefined;
  markOpen();
  outgoing.replaceWorksheet(worksheet);
  return saveOnOpen(worksheet, unsaved, store);
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

  // Sync's open-editor guard reads it outside React (`src/sync/openEditor.ts`).
  const editorOpen = useRef(false);
  useEffect(() => {
    editorOpen.current = chosen;
  }, [chosen]);

  // Library folder sync: desktop only, and only once a folder is chosen (`librarySync.ts`).
  useEffect(() => {
    if (!isDesktop()) return;
    let stop: (() => void) | undefined;
    let left = false;
    void import('@/sync/librarySync')
      .then(({ startLibrarySync, librarySync }) => {
        if (left) return;
        stop = startLibrarySync({ isEditorOpen: () => editorOpen.current });
        setSyncPause(librarySync);
      })
      // No sync this session; the library itself is untouched.
      .catch(() => undefined);
    return () => {
      left = true;
      setSyncPause(undefined);
      stop?.();
    };
  }, []);

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
     * `store.save()`, which saves `getState().worksheet`: swapped by the time the write
     * runs, so the outgoing document would be skipped and the incoming one written twice.
     *
     * Then save the incoming document immediately, before a single edit:
     * `replaceWorksheet` marks the store clean and autosave only fires on `dirty`, so a
     * worksheet created and left alone was never written anywhere ("the app lost my
     * work", reachable in about four seconds). The list must never miss a document the
     * teacher has seen on screen. Both writes run with sync held (`saveOnOpen`).
     */
    void openDocument(worksheet, chosen, () => {
      editorOpen.current = true;
    });
    // Only a new document (the form, or the 題庫's picks) reports a language; opening a
    // saved worksheet leaves the current view mode alone, since the document stores none.
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
