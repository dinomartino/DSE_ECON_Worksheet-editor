'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import {
  chooseSaveTarget,
  exportsFolder,
  isDesktop,
  openFolder,
  pickFile,
  readDroppedFile,
  revealFile,
  revealLabel,
  subscribeToFileDrops,
  ZIP_FILTERS,
} from '@/platform';
import { Dialog } from '@/components/ui/Dialog';
import { useNotices } from '@/components/ui/NoticeLayer';
import { useNoticeStore } from '@/store/notices';
import { AppMark } from '@/components/ui/AppMark';
import { ScrollEdgeHints } from '@/components/ui/ScrollEdgeHints';
import { useScrollEdges } from '@/components/ui/scrollEdges';
import { ArchiveIcon, BankIcon, DiagramIcon, FolderIcon, FolderOpenIcon, PlusIcon, SheetIcon } from '@/components/ui/icons';
import type { MenuItem } from '@/components/ui/Menu';
import { VersionLine } from '@/components/editor/UpdateBanner';
import { FeedbackDialog } from '@/components/feedback/FeedbackDialog';
import { WhatsNewDialog, WhatsNewOnLaunch } from '@/components/whatsNew/WhatsNewDialog';
import { describeDocument } from '@/feedback/feedback';
import { uiLanguage, useMessages } from '@/i18n/language';
import { FileDashboard, type DocumentActions, type FolderActions } from './FileDashboard';
import { readDashboardFolder, writeDashboardFolder } from './dashboard';
import { START_PANEL_MESSAGES } from './messages';
import { START_SCREEN_MESSAGES } from './screen.messages';
import { restoreNotice } from './restoreNotice';
import {
  DROP_REJECTED_MS,
  droppedKind,
  fileNameOf,
  importSummary,
  overlayFor,
  planDrop,
  type DropOverlay,
  type ImportCounts,
} from './fileDrop';
import { NEW_WORKSHEET_FORM_ID, NewWorksheetForm } from './NewWorksheetForm';
import { useBankReturn } from '@/components/bank/page/bankReturn';
import { QuestionBankScreen } from '@/components/bank/page/QuestionBankScreen';
import { GraphsScreen, useGraphCount } from '@/components/graphs/GraphsScreen';
import { placeGraphInOpenDocument } from '@/components/graphs/placeGraph';
import { useBank } from '@/library/useBank';
import { reloadPatterns } from '@/library/usePatterns';
import { RenameDialog, renameWorksheet } from './RenameDialog';
import { TrashList } from './TrashList';
import { readLastKind } from './startKinds';
import { WelcomeDesk } from './WelcomeDesk';
import { newId } from '@/model/factories';
import type { DocumentType } from '@/model/newWorksheet';
import type { LanguageMode, Worksheet } from '@/model/types';
import {
  downloadWorksheetFile,
  duplicateWorksheet,
  parseWorksheet,
  readWorksheetFile,
  savedWorksheetPath,
  savedWorksheetsFolder,
  TRASH_RETENTION_DAYS,
  worksheetStore,
  patternStorage,
  graphStore,
  EMPTY_FOLDERS,
  FOLDER_NAME_MAX,
  folderCounts,
  folderNameProblem,
  folderOf,
  sortedFolders,
  updateFolders,
  type Folder,
  type FolderState,
  type TrashedSummary,
  type WorksheetSummary,
} from '@/storage';
import { backupFileName } from '@/storage/backupName';
import { whileSyncPaused } from '@/sync/syncPause';
import {
  copyAssignment,
  createFolder,
  deleteFolder,
  moveToFolder,
  renameFolder,
} from '@/storage/folders';
import { SettingsButton } from '@/components/settings/SettingsButton';

/** A dropped file from either source: a browser `File`, or a desktop path. */
type Dropped = { name: string; type?: string; read: () => Promise<Uint8Array | Blob> };

async function textOf(data: Uint8Array | Blob): Promise<string> {
  return data instanceof Blob ? data.text() : new TextDecoder().decode(data);
}

/** The folder-name dialog: a new folder (optionally filing one document into it), or a rename. */
type Naming = { folder?: Folder; fileDoc?: WorksheetSummary };

/** The start screen's one result notice and one failure notice: each new one replaces its own. */
const START_RESULT = 'start-result';
const START_ERROR = 'start-error';

/** A result worth reading: backup written, backup restored, document restored. */
type Result = {
  message: string;
  /** Per-file lines — what was unreadable or did not fit. */
  details?: string[];
  action?: { label: string; run: () => void };
};

/**
 * The screen the app opens on: start something, or resume something.
 *
 * It exists because the editor had no answer to "where is my other worksheet?". Storage
 * has held many documents since it shipped, but the only way to reach one was to be the
 * most recently saved — the editor restores that one on load and offered no list — so
 * every document but the newest was effectively lost the moment a second one was
 * started. `New worksheet` was, in practice, an archive button.
 *
 * A full screen rather than a dialog over the editor: a dialog would have a blank
 * document rendering behind the choice of which document to open, which reads as though
 * the choice has already been made. Reached again later from the toolbar's
 * "Worksheets" crumb, and always the same home page: no "Back", so
 * the document just left reopens only from its own card, like any other.
 */
export function StartScreen({
  onOpen,
}: {
  onOpen: (worksheet: Worksheet, language?: LanguageMode) => void;
}) {
  const m = useMessages(START_PANEL_MESSAGES);
  const t = useMessages(START_SCREEN_MESSAGES);
  const [summaries, setSummaries] = useState<WorksheetSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState<DocumentType | undefined>();
  const [renaming, setRenaming] = useState<WorksheetSummary | undefined>();
  const [renameError, setRenameError] = useState<string | undefined>();
  const [confirmingDelete, setConfirmingDelete] = useState<WorksheetSummary | undefined>();
  const [trashRows, setTrashRows] = useState<TrashedSummary[]>([]);
  const [showingTrash, setShowingTrash] = useState(false);
  const [confirmingPurge, setConfirmingPurge] = useState<TrashedSummary | undefined>();
  const [confirmingEmpty, setConfirmingEmpty] = useState(false);
  // Results and failures go to the app's notice stack, never into the screen's flow.
  const notices = useNotices();
  // The graph count re-reads after each result (a restore may have brought graphs).
  const [lastResult, setLastResult] = useState('');
  const setNotice = useCallback(
    (result?: Result) => {
      if (!result) {
        notices.dismiss(START_RESULT);
        return;
      }
      const details = result.details ?? [];
      setLastResult(result.message);
      notices.notify({
        id: START_RESULT,
        // A list of what was skipped stays until closed: it may be the only record of it.
        tone: details.length > 0 ? 'warning' : 'success',
        body: result.message,
        details: details.length > 8 ? [...details.slice(0, 8), t.andMore(details.length - 8)] : details,
        actions: result.action ? [result.action] : undefined,
      });
    },
    [notices, t],
  );
  const setError = useCallback(
    (message?: string) => {
      if (message === undefined) notices.dismiss(START_ERROR);
      else notices.notify({ id: START_ERROR, tone: 'error', body: message });
    },
    [notices],
  );
  const [busy, setBusy] = useState<'backup' | 'restore' | undefined>();
  const [dropOverlay, setDropOverlay] = useState<DropOverlay>();
  const [feedback, setFeedback] = useState(false);
  const [folders, setFolders] = useState<FolderState>(EMPTY_FOLDERS);
  // Lazy: the start screen renders only after hydration (`EditorHost`).
  const [folderId, setFolderId] = useState<string | undefined>(readDashboardFolder);
  const [naming, setNaming] = useState<Naming | undefined>();
  const [moving, setMoving] = useState<WorksheetSummary | undefined>();
  const [deletingFolder, setDeletingFolder] = useState<Folder | undefined>();
  // The Question bank replaces this screen's view the way opening a document replaces
  // it; ← Home comes back. Session state: the app always opens on the documents.
  // Back from a worksheet opened from a bank question: straight into the bank.
  const [view, setView] = useState<'home' | 'bank' | 'graphs'>(() => (useBankReturn.getState().saved ? 'bank' : 'home'));
  const { groups: bankGroups } = useBank();
  const graphTotal = useGraphCount(`${view}:${lastResult}`);
  const closeFeedback = useCallback(() => setFeedback(false), []);
  // First launch, or everything deleted: the desk welcomes instead of listing. Never
  // while storage is still being read, so a returning teacher sees no flash of it.
  const empty = loaded && summaries.length === 0;
  // A plain result ("Topics saved.") is done once the teacher moves on. One listing files
  // stays until dismissed, like an error: it may be the only record of what was skipped.
  const clearPassingNotice = useCallback(() => {
    const current = useNoticeStore.getState().notices.find((n) => n.id === START_RESULT);
    if (current && !current.details?.length) notices.dismiss(START_RESULT);
  }, [notices]);
  const showView = (next: 'home' | 'bank' | 'graphs') => {
    clearPassingNotice();
    setView(next);
  };
  const [whatsNew, setWhatsNew] = useState(false);
  const closeWhatsNew = useCallback(() => setWhatsNew(false), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const { ref: asideRef, edges: asideEdges } = useScrollEdges<HTMLElement>();
  const rejectTimer = useRef<number | undefined>(undefined);
  const handleDropRef = useRef<(files: Dropped[]) => Promise<void>>(async () => undefined);

  // Desktop: files from Finder/Explorer arrive as the shell's native drag event, never as
  // HTML5 `drop` (§Desktop shell, `dragDropEnabled`). Only while this screen is up — the
  // editor ignores a dropped file, as it does on the web.
  useEffect(() => {
    if (!isDesktop()) return;
    return subscribeToFileDrops((event) => {
      if (event.type === 'drop') {
        void handleDropRef.current(
          event.paths.map((path) => ({ name: fileNameOf(path), read: () => readDroppedFile(path) })),
        );
        return;
      }
      if (event.type === 'enter') window.clearTimeout(rejectTimer.current);
      setDropOverlay((current) => overlayFor(event, current));
    });
  }, []);

  // One after the other, not in parallel: `listTrash` purges expired documents and
  // may write, and the two lists must describe the same moment.
  const refresh = useCallback(async () => {
    const next = await worksheetStore.list();
    const trash = await worksheetStore.listTrash();
    const filed = await worksheetStore.readFolders();
    setSummaries(next);
    setTrashRows(trash);
    setFolders(filed);
    setLoaded(true);
  }, []);

  // Read the index once on mount, and again after anything that changes it. Guarded
  // against a resolve arriving after unmount — the screen is dismissed by opening a
  // document, which is exactly when a slow `list()` would still be in flight.
  useEffect(() => {
    let live = true;
    void (async () => {
      const next = await worksheetStore.list();
      const trash = await worksheetStore.listTrash();
      const filed = await worksheetStore.readFolders();
      if (!live) return;
      setSummaries(next);
      setTrashRows(trash);
      setFolders(filed);
      setLoaded(true);
    })();
    return () => {
      live = false;
    };
  }, []);

  /** Open a saved document; `then` runs once it is the editor's document (the bank's inserts). */
  const openSaved = async (id: string, then?: () => void) => {
    setError(undefined);
    try {
      // Read and opened with sync held: a download between the two would be saved over.
      const worksheet = await whileSyncPaused(async () => {
        const loaded = await worksheetStore.load(id);
        if (loaded) onOpen(loaded);
        return loaded;
      });
      if (!worksheet) {
        // The index and the documents are separate keys, so an entry can outlive what it
        // names — a half-finished `clear`, or storage evicted under quota pressure.
        // Saying so and dropping the row beats an open button that silently does nothing.
        setError(t.notFound(isDesktop()));
        await worksheetStore.remove(id);
        await refresh();
        return;
      }
      then?.();
    } catch {
      setError(t.couldNotOpen);
    }
  };

  const openFile = async (file: File) => {
    setError(undefined);
    try {
      onOpen(await readWorksheetFile(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.couldNotOpenFile);
    }
  };

  const duplicate = async (summary: WorksheetSummary) => {
    const worksheet = await worksheetStore.load(summary.id);
    if (!worksheet) return;
    // Saved, not opened. Duplicating is a filing action — the teacher is looking at a
    // list and making a copy to work on *later*; opening it would take the screen away
    // from the list they are still using.
    const copy = duplicateWorksheet(worksheet, newId());
    await worksheetStore.save(copy);
    // The copy sits beside its original, folder included.
    await refile((state) => copyAssignment(state, summary.id, copy.id));
    await refresh();
  };

  /** Every folder change reads what is stored now, changes it, writes it back. */
  const refile = async (recipe: (state: FolderState) => FolderState): Promise<boolean> => {
    try {
      setFolders(await updateFolders(worksheetStore, recipe));
      return true;
    } catch {
      setError(t.folderChangeFailed);
      return false;
    }
  };

  const enterFolder = (id: string | undefined) => {
    setFolderId(id);
    writeDashboardFolder(id);
  };

  const folderActions: FolderActions = {
    create: () => setNaming({}),
    rename: (folder) => setNaming({ folder }),
    remove: (folder) => {
      // An empty folder goes at once; one with documents asks first.
      const count = folderCounts(folders, summaries.map((row) => row.id)).get(folder.id) ?? 0;
      if (count > 0) setDeletingFolder(folder);
      else void removeFolder(folder);
    },
    drop: (docId, target) => void refile((state) => moveToFolder(state, [docId], target)),
  };

  const removeFolder = async (folder: Folder) => {
    if (await refile((state) => deleteFolder(state, folder.id))) {
      if (folderId === folder.id) enterFolder(undefined);
    }
  };

  const nameFolder = async ({ folder, fileDoc }: Naming, name: string) => {
    if (folder) {
      await refile((state) => renameFolder(state, folder.id, name));
      return;
    }
    const id = newId();
    const done = await refile((state) => {
      const made = createFolder(state, name, id);
      return fileDoc ? moveToFolder(made, [fileDoc.id], id) : made;
    });
    // A folder made from the list opens; one made while filing a document leaves the
    // teacher where they were.
    if (done && !fileDoc) enterFolder(id);
  };

  /**
   * "Open a file…": a .json opens, a backup .zip restores — the same rule as a drop.
   * The native open sheet on desktop, the hidden file input on the web.
   */
  const importFile = async () => {
    if (!isDesktop()) {
      fileInput.current?.click();
      return;
    }
    setError(undefined);
    try {
      const picked = await pickFile([{ name: t.openFilterName, extensions: ['json', 'zip'] }]);
      if (!picked) return;
      if (picked.name.toLowerCase().endsWith('.zip')) await restoreFrom(picked.bytes);
      else onOpen(parseWorksheet(new TextDecoder().decode(picked.bytes)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.couldNotOpenFile);
    }
  };

  const moveToTrash = async (summary: WorksheetSummary) => {
    setError(undefined);
    try {
      await worksheetStore.trash(summary.id);
    } catch {
      setError(t.trashFailed);
    }
    await refresh();
  };

  const restoreFromTrash = async (row: TrashedSummary) => {
    setError(undefined);
    try {
      const id = await worksheetStore.restore(row.id);
      if (id) setNotice({ message: t.restored(row.title) });
      else setError(t.notInTrash);
    } catch {
      setError(t.couldNotRestore);
    }
    await refresh();
  };

  /**
   * Every saved document as one .zip. The backup module (and JSZip) is loaded on click:
   * this is the screen the app opens on, and it must not pay for a deflater up front.
   */
  const backUpAll = async () => {
    setError(undefined);
    setNotice(undefined);
    setBusy('backup');
    try {
      const summaries = await worksheetStore.list();
      const { graphs } = await graphStore.list();
      if (summaries.length === 0 && graphs.length === 0) {
        setError(t.nothingToBackUp);
        return;
      }
      // Where first, inside the click: a browser's Save As needs it, and the zip takes a while.
      const target = await chooseSaveTarget(backupFileName(), ZIP_FILTERS);
      // A cancelled sheet or picker wrote nothing, so there is nothing to report.
      if (!target) return;
      const { buildBackup } = await import('@/storage/backup');
      const { readPatternRegistry } = await import('@/storage/patterns');
      const worksheets: Worksheet[] = [];
      let unreadable = 0;
      for (const summary of summaries) {
        const worksheet = await worksheetStore.load(summary.id).catch(() => undefined);
        if (worksheet) worksheets.push(worksheet);
        else unreadable += 1;
      }
      if (worksheets.length === 0 && graphs.length === 0) {
        setError(t.nothingToBackUp);
        return;
      }
      const filed = await worksheetStore.readFolders();
      const { backupTermsCsv } = await import('@/components/settings/sections/termsSection/termsBackup');
      const { path } = await target.write(
        await buildBackup(worksheets, undefined, filed, await readPatternRegistry(patternStorage), graphs, backupTermsCsv()),
      );
      setNotice({
        message: t.backedUp(worksheets.length, graphs.length, unreadable),
        action: path
          ? { label: revealLabel(), run: () => void revealFile(path).catch(() => undefined) }
          : undefined,
      });
    } catch {
      setError(t.couldNotWriteBackup);
    } finally {
      setBusy(undefined);
    }
  };

  /** Restore never overwrites; each unreadable or unsaved file is listed by name. */
  const restoreFrom = async (data: Uint8Array | Blob) => {
    setError(undefined);
    setNotice(undefined);
    setBusy('restore');
    try {
      const { readBackup, restoreBackup, restorePatterns } = await import('@/storage/backup');
      const { restoreGraphs } = await import('@/storage/graphs');
      const { worksheets, failures, folders: filed, patterns, graphs, terms } = await readBackup(data);
      const report = await restoreBackup(worksheetStore, worksheets, undefined, filed);
      await restorePatterns(patternStorage, patterns);
      reloadPatterns();
      const graphReport = graphs.length > 0 ? await restoreGraphs(graphStore, graphs) : undefined;
      const termsAdded = terms ? await restoreTerms(terms) : 0;
      setNotice({
        message: restoreNotice(report, failures.length, graphReport, undefined, termsAdded),
        details: [...failures, ...report.failed].map((f) => `${f.name}: ${f.reason}`),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.couldNotReadBackup);
    } finally {
      setBusy(undefined);
      await refresh();
    }
  };

  const pickBackup = async () => {
    if (!isDesktop()) {
      backupInput.current?.click();
      return;
    }
    try {
      const picked = await pickFile(ZIP_FILTERS);
      if (picked) await restoreFrom(picked.bytes);
    } catch {
      setError(t.couldNotOpenFile);
    }
  };

  /** Shows the rejection over the screen for a moment, then clears it. */
  const flashRejected = () => {
    setDropOverlay('rejected');
    window.clearTimeout(rejectTimer.current);
    rejectTimer.current = window.setTimeout(() => setDropOverlay(undefined), DROP_REJECTED_MS);
  };

  /**
   * One drop, from the page (web) or the shell (desktop): a single `.json` opens, a single
   * `.zip` restores, several are imported into saved documents without opening any.
   */
  const handleDrop = async (files: Dropped[]) => {
    const plan = planDrop(files, (file) => droppedKind(file.name, file.type));
    if (plan.kind === 'reject') {
      flashRejected();
      return;
    }
    setDropOverlay(undefined);
    if (plan.kind === 'import') {
      await importDropped(plan.worksheets, plan.backups, plan.ignored);
      return;
    }
    setError(undefined);
    let data: Uint8Array | Blob;
    try {
      data = await plan.file.read();
    } catch (cause) {
      setError(t.couldNotReadFile(plan.file.name, cause instanceof Error ? cause.message : ''));
      return;
    }
    if (plan.kind === 'restore') {
      await restoreFrom(data);
      return;
    }
    try {
      onOpen(parseWorksheet(await textOf(data)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.couldNotOpenFile);
    }
  };

  /** Several files: each saved beside what is here — restore never overwrites. */
  const importDropped = async (worksheets: Dropped[], backups: Dropped[], ignored: number) => {
    setError(undefined);
    setNotice(undefined);
    setBusy('restore');
    try {
      const { entryFailure, readBackup, restoreBackup, restorePatterns, worksheetEntry } = await import(
        '@/storage/backup'
      );
      const counts: ImportCounts = {
        imported: 0,
        copied: 0,
        skipped: 0,
        unreadable: 0,
        failed: 0,
        ignored,
      };
      const details: string[] = [];
      const tally = (report: Awaited<ReturnType<typeof restoreBackup>>) => {
        counts.imported += report.restored.length;
        counts.copied += report.copied.length;
        counts.skipped += report.skipped.length;
        counts.failed += report.failed.length;
        details.push(...report.failed.map((f) => `${f.name}: ${f.reason}`));
      };
      const unreadable = (name: string, reason: string) => {
        counts.unreadable += 1;
        details.push(`${name}: ${reason}`);
      };

      const entries = [];
      for (const file of worksheets) {
        let text: string;
        try {
          text = await textOf(await file.read());
        } catch (cause) {
          unreadable(file.name, cause instanceof Error ? cause.message : t.couldNotBeRead);
          continue;
        }
        try {
          entries.push(worksheetEntry(file.name, text));
        } catch (cause) {
          unreadable(file.name, entryFailure(cause));
        }
      }
      if (entries.length > 0) tally(await restoreBackup(worksheetStore, entries));

      for (const file of backups) {
        try {
          const { worksheets: inside, failures, folders: filed, patterns, graphs, terms } = await readBackup(await file.read());
          tally(await restoreBackup(worksheetStore, inside, undefined, filed));
          await restorePatterns(patternStorage, patterns);
          if (terms) await restoreTerms(terms);
          if (graphs.length > 0) await (await import('@/storage/graphs')).restoreGraphs(graphStore, graphs);
          reloadPatterns();
          for (const failure of failures) unreadable(`${file.name}: ${failure.name}`, failure.reason);
        } catch (cause) {
          unreadable(file.name, cause instanceof Error ? cause.message : t.couldNotBeRead);
        }
      }
      setNotice({ message: importSummary(counts, uiLanguage()), details });
    } catch {
      setError(t.couldNotImport);
    } finally {
      setBusy(undefined);
      await refresh();
    }
  };

  // The effect below subscribes once; it reaches this render's handler through the ref.
  useEffect(() => {
    handleDropRef.current = handleDrop;
  });

  const showFolder = (failure: string, locate: () => Promise<string | undefined>) => () =>
    void (async () => {
      try {
        const path = await locate();
        if (path) await openFolder(path);
      } catch {
        setError(failure);
      }
    })();

  /** Backup, restore and (desktop) the folders on disk: the ⋯ beside the document count. */
  const backupItems: MenuItem[] = [
    {
      label: busy === 'backup' ? t.backingUp : t.backUpAll,
      hint: '.zip', // i18n-ignore: brand and file extension
      icon: <ArchiveIcon />,
      disabled: busy !== undefined,
      onSelect: () => void backUpAll(),
    },
    {
      label: busy === 'restore' ? t.restoring : t.restoreFromBackup,
      icon: <FolderOpenIcon />,
      disabled: busy !== undefined,
      onSelect: () => void pickBackup(),
    },
    ...(isDesktop()
      ? [
          {
            label: t.showSaved,
            icon: <FolderIcon />,
            separated: true,
            onSelect: showFolder(t.couldNotOpenSavedFolder, savedWorksheetsFolder),
          },
          {
            label: t.showExports,
            icon: <FolderIcon />,
            onSelect: showFolder(t.couldNotOpenExportsFolder, exportsFolder),
          },
        ]
      : []),
  ];

  const actions: DocumentActions = {
    open: (summary) => void openSaved(summary.id),
    rename: setRenaming,
    duplicate: (summary) => void duplicate(summary),
    download: (summary) =>
      void (async () => {
        const worksheet = await worksheetStore.load(summary.id);
        if (worksheet) await downloadWorksheetFile(worksheet);
      })(),
    reveal: isDesktop()
      ? (summary) =>
          void (async () => {
            try {
              const path = await savedWorksheetPath(summary.id);
              if (path) await revealFile(path);
            } catch {
              setError(t.couldNotShowFile);
            }
          })()
      : undefined,
    move: setMoving,
    remove: setConfirmingDelete,
  };

  return (
    <div
      className="zone-dark flex h-full flex-col overflow-hidden bg-desk lg:flex-row"
      onDragOver={(event) => {
        // A .json worksheet dropped anywhere on this screen opens it. The whole surface
        // is the target rather than a marked-out zone: this screen has nothing else a
        // drop could mean, and a small rectangle is a thing to aim at for no reason.
        // Web only: the desktop webview delivers no HTML5 file drags (the effect above).
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        if (dropOverlay !== 'hint') {
          window.clearTimeout(rejectTimer.current);
          setDropOverlay('hint');
        }
      }}
      onDragLeave={(event) => {
        // Only when the pointer leaves the screen itself — `dragleave` also fires when
        // it crosses onto a child, which would flicker the overlay on every row.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDropOverlay(undefined);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDropOverlay(undefined);
        void handleDrop(
          Array.from(event.dataTransfer.files, (file) => ({
            name: file.name,
            type: file.type,
            read: async () => file,
          })),
        );
      }}
    >
      {/*
        An editorial split rather than a floating card column: the lit index panel on
        the left holds everything that *starts* work, the desk on the right holds the
        documents already on it. The panel runs the full height like the editor's own
        rail, so the screen reads as the same room as the tool it opens.
      */}
      {view === 'graphs' ? (
        <div className="min-h-0 min-w-0 flex-1">
          <GraphsScreen
            onHome={() => showView('home')}
            settings={<SettingsButton separated />}
            // Opened the start screen's way, then placed through the store and saved.
            onUseInWorksheet={(graph, worksheetId, questionId) =>
              void openSaved(worksheetId, () => placeGraphInOpenDocument(graph, questionId))
            }
          />
        </div>
      ) : view === 'bank' ? (
        <div className="min-h-0 min-w-0 flex-1">
          <QuestionBankScreen
            summaries={summaries}
            loaded={loaded}
            settings={<SettingsButton separated />}
            onHome={() => {
              useBankReturn.getState().clear();
              showView('home');
            }}
            onOpenDocument={(id, then) => void openSaved(id, then)}
            onOpenWorksheet={(worksheet) => onOpen(worksheet)}
            onDocumentsChanged={() => void refresh()}
            onNotice={(message) => {
              setError(undefined);
              setNotice({ message });
            }}
            onError={(message) => {
              setNotice(undefined);
              setError(message);
            }}
            onLeaveLevel={clearPassingNotice}
            onStartNew={() => {
              showView('home');
              setCreating(readLastKind());
            }}
          />
        </div>
      ) : (
      <>
      {/* The panel's box: the scroller (with its edge hints) above the pinned footer. */}
      <div className="zone-light relative flex shrink-0 flex-col border-b border-line bg-surface lg:h-full lg:w-[400px] lg:border-b-0 lg:border-r">
      {/* The scroller and its edge hints share a box that stops above the footer, so the
          bottom fade can never sit over the footer's links. */}
      <div className="relative flex min-h-0 flex-1 flex-col bg-surface">
      {/* A short window (1024×768) tightens the vertical rhythm so the Question bank row,
          the last way in, still shows without scrolling. */}
      <aside ref={asideRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-9 pb-6 pt-9 [@media(max-height:820px)]:pb-4 [@media(max-height:820px)]:pt-7">
        <header className="flex items-center gap-2.5">
          {/* The launch splash's mark lands here (`src/launch/splash.ts`). */}
          <span data-launch-target className="flex shrink-0 text-ink">
            <AppMark size={22} />
          </span>
          {/* i18n-ignore: brand */}
          <span className="text-[13px] font-semibold text-ink">Econ Studio</span>
          <span lang="zh-HK" className="text-[11px] text-ink-subtle">
            經濟備課室
          </span>
          {/* Stacked below `lg`, this row is the screen's top edge, so the gear sits here;
              from `lg` up it moves to the desk's header, the top-right corner. */}
          <SettingsButton className="-my-1 ml-auto lg:hidden" />
        </header>

        {/* The screen's one display moment: the chrome's serif voice (design/icons/design.md §
            Typography). Everything below it stays on the UI grotesque. `break-keep`: Chinese
            wraps at its punctuation, never mid-phrase. */}
        <h1 className="font-display mt-10 text-balance break-keep text-[32px] font-normal leading-[1.15] tracking-[-0.015em] text-ink [@media(max-height:820px)]:mt-7 [@media(max-height:820px)]:text-[28px]">
          {empty ? m.greetingFirst : m.greeting}
        </h1>

        <StartNewSection
          empty={empty}
          onCreate={() => setCreating(readLastKind())}
          onOpenFile={() => void importFile()}
        />

        {/* What is already written, as ways *in*: each its own screen, like a document,
            with ← Home to come back. One `StartRow` per library. */}
        <section className="mt-9 [@media(max-height:820px)]:mt-7">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-subtle">
            {m.library}
          </h2>
          <div className="mt-3 flex flex-col border-t border-line">
            <StartRow
              icon={<BankIcon size={16} />}
              title={m.bank}
              trailing={bankGroups.length > 0 ? m.bankCount(bankGroups.length) : undefined}
              // Nothing saved yet: say what fills it, rather than promise questions.
              hint={
                empty && bankGroups.length === 0 ? m.bankHintEmpty : m.bankHint
              }
              onClick={() => showView('bank')}
            />
            <StartRow
              icon={<DiagramIcon size={16} />}
              title={m.graphs}
              trailing={graphTotal ? m.graphCount(graphTotal) : undefined}
              hint={m.graphsHint}
              onClick={() => showView('graphs')}
            />
          </div>
        </section>

      </aside>
      <ScrollEdgeHints edges={asideEdges} />
      </div>

      {/* Pinned below the scroller: one quiet line about where work lives, the build, and
          the links, always at full ink. Backup, restore, folders and Trash sit with the
          saved documents, on the right. */}
      <footer className="shrink-0 space-y-1.5 border-t border-line px-9 pb-5 pt-3.5 text-[11px] leading-relaxed text-ink-muted [@media(max-height:820px)]:pb-4 [@media(max-height:820px)]:pt-3">
        {isDesktop() ? (
          <p>{m.storedDesktop}</p>
        ) : (
          <p>{m.storedWeb}</p>
        )}
        {/* Desktop only; its own line, as the links row cannot also hold it at 400px. */}
        <VersionLine />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {/* Nothing saved (no documents, no graphs) means nothing to back up. */}
          {!isDesktop() && (!empty || (graphTotal ?? 0) > 0) && (
            <TextLink onClick={() => void backUpAll()} disabled={busy !== undefined}>
              {busy === 'backup' ? m.backingUp : m.backUpNow}
            </TextLink>
          )}
          <TextLink onClick={() => setWhatsNew(true)}>{m.whatsNew}</TextLink>
          <TextLink onClick={() => setFeedback(true)}>{m.sendFeedback}</TextLink>
        </div>
      </footer>
      </div>

      {/* The desk side: every document already on the desk, as its first page. */}
      <main className="min-h-0 flex-1 overflow-y-auto px-9 py-9 lg:py-12 xl:px-14">
        {showingTrash ? (
          <TrashList
            rows={trashRows}
            onBack={() => setShowingTrash(false)}
            onRestore={(row) => void restoreFromTrash(row)}
            onPurge={setConfirmingPurge}
            onEmpty={() => setConfirmingEmpty(true)}
            // No rule here: the Trash's top row has no tools of its own to set it apart from.
            settings={
              <span className="hidden lg:flex">
                <SettingsButton />
              </span>
            }
          />
        ) : (
          <FileDashboard
            summaries={summaries}
            loaded={loaded}
            actions={actions}
            trashCount={trashRows.length}
            onShowTrash={() => setShowingTrash(true)}
            backupItems={backupItems}
            folders={folders}
            folderId={folderId}
            onFolderChange={enterFolder}
            folderActions={folderActions}
            settings={<SettingsButton separated className="hidden lg:flex" />}
            welcome={
              <WelcomeDesk
                onCreate={setCreating}
                onOpenFile={() => void importFile()}
                onRestore={() => void pickBackup()}
                restoring={busy === 'restore'}
              />
            }
          />
        )}
      </main>
      </>
      )}

      <input
        ref={backupInput}
        type="file"
        accept="application/zip,.zip"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void restoreFrom(file);
          event.target.value = '';
        }}
      />

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json,application/zip,.zip"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && isZip(file)) void restoreFrom(file);
          else if (file) void openFile(file);
          event.target.value = '';
        }}
      />

      {dropOverlay && (
        <div className="pointer-events-none fixed inset-0 z-40 flex animate-scrim-in items-center justify-center bg-accent/10 backdrop-blur-[1px]">
          <span
            role="status"
            // Keyed by state, so a rejection pops in afresh rather than recolouring.
            key={dropOverlay}
            className={
              dropOverlay === 'rejected'
                ? 'animate-pop-in rounded-xl border-2 border-dashed border-danger bg-surface px-5 py-3 text-[13px] font-medium text-danger-ink'
                : 'animate-pop-in rounded-xl border-2 border-dashed border-accent bg-surface px-5 py-3 text-[13px] font-medium text-accent-ink'
            }
          >
            {dropOverlay === 'rejected' ? t.dropRejected : t.dropHint}
          </span>
        </div>
      )}

      {creating && (
        <Dialog
          title={t.newTitle}
          description={t.newDescription}
          width={640}
          onClose={() => setCreating(undefined)}
          // Pinned outside the scrolling body, so Create stays reachable at any window
          // height. In the body it scrolled with the fields and was sliced by the panel
          // edge on a laptop screen.
          footer={
            <>
              <Button variant="subtle" onClick={() => setCreating(undefined)}>
                {t.cancel}
              </Button>
              {/* `form=` submits the form in the dialog's body across the DOM boundary,
                  so this button and Enter in any field take the identical path. */}
              <Button variant="primary" type="submit" form={NEW_WORKSHEET_FORM_ID}>
                {t.createWorksheet}
              </Button>
            </>
          }
        >
          {/* The dialog body has no padding of its own — `DialogTabs` supplies its own
              `p-5`, so an untabbed dialog must. Without it the first label sits on the
              header's rule and the hints run into the panel edge. */}
          <div className="px-5 py-5">
            <NewWorksheetForm
              initialType={creating}
              onCreate={(worksheet, language) => {
                setCreating(undefined);
                // Started inside a folder, it is filed there. Written before the document
                // itself: an assignment naming nothing yet is harmless, and it is in
                // place by the time the host saves the document.
                const target = folderId && folders.folders.some((f) => f.id === folderId);
                if (target) {
                  void updateFolders(worksheetStore, (state) =>
                    moveToFolder(state, [worksheet.id], folderId),
                  ).catch(() => undefined);
                }
                onOpen(worksheet, language);
              }}
            />
          </div>
        </Dialog>
      )}

      {renaming && (
        <RenameDialog
          summary={renaming}
          error={renameError}
          onClose={() => {
            setRenaming(undefined);
            setRenameError(undefined);
          }}
          onDone={async (title) => {
            const problem = await renameWorksheet(worksheetStore, renaming.id, title);
            setRenameError(problem);
            if (problem) return;
            setRenaming(undefined);
            await refresh();
          }}
        />
      )}

      {naming && (
        <FolderNameDialog
          folders={folders}
          folder={naming.folder}
          filing={naming.fileDoc}
          onClose={() => setNaming(undefined)}
          onDone={(name) => {
            const request = naming;
            setNaming(undefined);
            void nameFolder(request, name);
          }}
        />
      )}

      {moving && (
        <MoveDialog
          summary={moving}
          folders={folders}
          onClose={() => setMoving(undefined)}
          onMove={(target) => {
            const docId = moving.id;
            setMoving(undefined);
            void refile((state) => moveToFolder(state, [docId], target));
          }}
          onNewFolder={() => {
            const fileDoc = moving;
            setMoving(undefined);
            setNaming({ fileDoc });
          }}
        />
      )}

      {deletingFolder && (
        <Dialog
          title={t.deleteFolderTitle(deletingFolder.name || t.untitledFolder)}
          width={420}
          onClose={() => setDeletingFolder(undefined)}
          footer={
            <>
              <Button variant="subtle" onClick={() => setDeletingFolder(undefined)}>
                {t.cancel}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const folder = deletingFolder;
                  setDeletingFolder(undefined);
                  void removeFolder(folder);
                }}
              >
                {t.deleteFolder}
              </Button>
            </>
          }
        >
          <p className="px-5 py-5 text-[13px] leading-relaxed text-ink-subtle">
            {(() => {
              const count =
                folderCounts(folders, summaries.map((row) => row.id)).get(deletingFolder.id) ?? 0;
              return t.folderDocsMove(count);
            })()}
          </p>
        </Dialog>
      )}

      {confirmingDelete && (
        <Dialog
          title={t.trashTitle(confirmingDelete.title)}
          width={420}
          onClose={() => setConfirmingDelete(undefined)}
          footer={
            <>
              <Button variant="subtle" onClick={() => setConfirmingDelete(undefined)}>
                {t.cancel}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const summary = confirmingDelete;
                  setConfirmingDelete(undefined);
                  void moveToTrash(summary);
                }}
              >
                {t.moveToTrash}
              </Button>
            </>
          }
        >
          <p className="px-5 py-5 text-[13px] leading-relaxed text-ink-subtle">
            {t.trashBody(TRASH_RETENTION_DAYS)}
          </p>
        </Dialog>
      )}

      {confirmingPurge && (
        <Dialog
          title={t.purgeTitle(confirmingPurge.title)}
          width={420}
          onClose={() => setConfirmingPurge(undefined)}
          footer={
            <>
              <Button variant="subtle" onClick={() => setConfirmingPurge(undefined)}>
                {t.cancel}
              </Button>
              <DangerButton
                onClick={() => {
                  const id = confirmingPurge.id;
                  setConfirmingPurge(undefined);
                  void worksheetStore.purge(id).then(refresh);
                }}
              >
                {t.deleteForever}
              </DangerButton>
            </>
          }
        >
          <p className="px-5 py-5 text-[13px] leading-relaxed text-ink-subtle">
            {t.purgeBody(isDesktop())}
          </p>
        </Dialog>
      )}

      {confirmingEmpty && (
        <Dialog
          title={t.emptyTitle}
          width={420}
          onClose={() => setConfirmingEmpty(false)}
          footer={
            <>
              <Button variant="subtle" onClick={() => setConfirmingEmpty(false)}>
                {t.cancel}
              </Button>
              <DangerButton
                onClick={() => {
                  setConfirmingEmpty(false);
                  void worksheetStore.emptyTrash().then(refresh);
                }}
              >
                {t.emptyTrash}
              </DangerButton>
            </>
          }
        >
          <p className="px-5 py-5 text-[13px] leading-relaxed text-ink-subtle">
            {t.emptyBody(trashRows.length)}
          </p>
        </Dialog>
      )}

      {feedback && <FeedbackDialog onClose={closeFeedback} document={describeDocument(undefined)} />}
      {whatsNew && <WhatsNewDialog onClose={closeWhatsNew} />}
      <WhatsNewOnLaunch ready={loaded} returningUser={summaries.length + trashRows.length > 0} />
    </div>
  );
}

/**
 * The panel's ways to start: one New worksheet button (the dialog's gallery picks the
 * type), then "Open a file…". The button stays on an empty desk; the file row does not,
 * since the welcome carries its own file routes.
 */
export function StartNewSection({
  empty,
  onCreate,
  onOpenFile,
}: {
  empty: boolean;
  onCreate: () => void;
  onOpenFile: () => void;
}) {
  const m = useMessages(START_PANEL_MESSAGES);
  return (
    <section className="mt-9 [@media(max-height:820px)]:mt-6">
      <Button variant="primary" size="lg" className="w-full" onClick={onCreate}>
        <PlusIcon size={16} />
        {m.newWorksheet}
      </Button>
      {!empty && (
        // Quieter than the button: one line, colour-only hover.
        <button
          type="button"
          onClick={onOpenFile}
          className="group mt-2 flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors duration-150 ease-out-soft hover:bg-surface-sunken active:bg-surface-hover active:duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          <span className="text-ink-subtle transition-colors duration-150 ease-out-soft group-hover:text-accent-ink">
            <FolderOpenIcon size={15} />
          </span>
          <span className="text-[13px] font-medium text-ink transition-colors duration-150 ease-out-soft group-hover:text-accent-ink">
            {m.openFile}
          </span>
          <span className="ml-auto truncate text-[11px] text-ink-subtle">{m.openFileHint}</span>
        </button>
      )}
    </section>
  );
}

/**
 * One way in (a library), as a line in an index rather than an icon card. Hover answers
 * with colour only: the row tints and the title turns accent; nothing moves.
 */
function StartRow({
  title,
  hint,
  icon,
  trailing,
  onClick,
}: {
  title: string;
  hint: string;
  icon?: ReactNode;
  /** Quiet text at the title's far end (a count). */
  trailing?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group cursor-pointer border-b border-line py-3.5 pl-4 pr-2 text-left [@media(max-height:920px)]:py-3 transition-colors duration-150 ease-out-soft hover:bg-surface-sunken active:bg-surface-hover active:duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
    >
      <span className="flex items-center gap-2 text-[13.5px] font-medium text-ink transition-colors duration-150 ease-out-soft group-hover:text-accent-ink">
        {icon && (
          <span className="text-ink-subtle transition-colors duration-150 ease-out-soft group-hover:text-accent-ink">
            {icon}
          </span>
        )}
        {title}
        {trailing && <span className="ml-auto text-[11.5px] font-normal tabular-nums text-ink-subtle">{trailing}</span>}
      </span>
      <span className="mt-0.5 block text-[11px] leading-snug text-ink-muted">{hint}</span>
    </button>
  );
}

/** Name a new folder, or rename one. Names are unique, case-blind. */
function FolderNameDialog({
  folders,
  folder,
  filing,
  onClose,
  onDone,
}: {
  folders: FolderState;
  folder?: Folder;
  /** Filing this document into the new folder once it exists. */
  filing?: WorksheetSummary;
  onClose: () => void;
  onDone: (name: string) => void;
}) {
  const t = useMessages(START_SCREEN_MESSAGES);
  const [name, setName] = useState(folder?.name ?? '');
  const problem = folderNameProblem(folders, name, folder?.id);
  // "Give it a name" is not worth saying before anything is typed.
  const shown = name.trim() ? problem : undefined;
  const formId = 'folder-name-form';
  return (
    <Dialog
      title={folder ? t.renameFolder : t.newFolder}
      description={filing ? t.filedIn(filing.title) : t.folderHelp}
      width={420}
      onClose={onClose}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={!!problem}>
            {folder ? t.rename : filing ? t.createAndMove : t.createFolder}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="px-5 py-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!problem) onDone(name);
        }}
      >
        <input
          type="text"
          value={name}
          autoFocus
          maxLength={FOLDER_NAME_MAX}
          placeholder={t.folderPlaceholder}
          aria-invalid={!!shown}
          onChange={(event) => setName(event.target.value)}
          className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
        {shown && <p className="mt-2 text-xs text-danger-ink">{shown}</p>}
      </form>
    </Dialog>
  );
}

/**
 * "Move to folder…": one click on a destination files the document and closes. Not a
 * submenu — the overflow menu has none, and a long folder list would outgrow it.
 */
function MoveDialog({
  summary,
  folders,
  onClose,
  onMove,
  onNewFolder,
}: {
  summary: WorksheetSummary;
  folders: FolderState;
  onClose: () => void;
  onMove: (folderId: string | undefined) => void;
  onNewFolder: () => void;
}) {
  const t = useMessages(START_SCREEN_MESSAGES);
  const current = folderOf(folders, summary.id)?.id;
  const destinations: { id: string | undefined; name: string }[] = [
    { id: undefined, name: t.noFolder },
    ...sortedFolders(folders).map((f) => ({ id: f.id, name: f.name || t.untitledFolder })),
  ];
  return (
    <Dialog
      title={t.moveTitle(summary.title)}
      description={t.moveDescription}
      width={420}
      onClose={onClose}
      footer={
        <>
          <Button variant="subtle" className="mr-auto" onClick={onNewFolder}>
            {t.newFolderEllipsis}
          </Button>
          <Button variant="subtle" onClick={onClose}>
            {t.cancel}
          </Button>
        </>
      }
    >
      <ul className="px-3 py-3">
        {destinations.map((destination) => {
          const here = destination.id === current;
          return (
            <li key={destination.id ?? ''}>
              <button
                type="button"
                disabled={here}
                onClick={() => onMove(destination.id)}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink transition-colors duration-150 ease-out-soft hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span className="text-ink-subtle">
                  {destination.id === undefined ? <SheetIcon /> : <FolderIcon />}
                </span>
                <span className="min-w-0 flex-1 truncate">{destination.name}</span>
                {here && <span className="shrink-0 text-[11px] text-ink-subtle">{t.hereNow}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

/**
 * Filled, not the quiet `danger` variant: that one recedes until hovered, which reads as
 * equal weight to Cancel at rest — wrong for the one step that cannot be undone.
 */
function DangerButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-[34px] cursor-pointer items-center justify-center rounded-lg border border-transparent bg-danger px-3 text-[13px] font-medium text-white shadow-sm transition-[background-color,border-color,color,opacity,transform,scale,filter] duration-150 ease-out-soft hover:brightness-95 active:scale-[0.97]"
    >
      {children}
    </button>
  );
}

function TextLink({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer font-medium text-accent-ink underline decoration-line-strong underline-offset-4 transition-[text-decoration-color,opacity] duration-150 ease-out-soft hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function isZip(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith('.zip') ||
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed'
  );
}

/** A backup's translation terms merged into Settings (new rows only); the count added. */
async function restoreTerms(csv: string): Promise<number> {
  const { restoreTermsCsv } = await import('@/components/settings/sections/termsSection/termsBackup');
  return restoreTermsCsv(csv);
}
