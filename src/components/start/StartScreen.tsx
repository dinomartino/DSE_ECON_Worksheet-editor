'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import {
  exportsFolder,
  isDesktop,
  openFolder,
  pickFile,
  revealFile,
  revealLabel,
  saveFile,
  ZIP_FILTERS,
} from '@/platform';
import { Dialog } from '@/components/ui/Dialog';
import { AppMark } from '@/components/ui/AppMark';
import { ArchiveIcon, FolderIcon, FolderOpenIcon, SheetIcon } from '@/components/ui/icons';
import type { MenuItem } from '@/components/ui/Menu';
import { VersionLine } from '@/components/editor/UpdateBanner';
import { FeedbackDialog } from '@/components/feedback/FeedbackDialog';
import { WhatsNewDialog, WhatsNewOnLaunch } from '@/components/whatsNew/WhatsNewDialog';
import { describeDocument } from '@/feedback/feedback';
import { FileDashboard, type DocumentActions, type FolderActions } from './FileDashboard';
import { readDashboardFolder, writeDashboardFolder } from './dashboard';
import { NEW_WORKSHEET_FORM_ID, NewWorksheetForm } from './NewWorksheetForm';
import { TrashList } from './TrashList';
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
import {
  copyAssignment,
  createFolder,
  deleteFolder,
  moveToFolder,
  renameFolder,
} from '@/storage/folders';

/** The folder-name dialog: a new folder (optionally filing one document into it), or a rename. */
type Naming = { folder?: Folder; fileDoc?: WorksheetSummary };

/** A result worth reading: backup written, backup restored, document restored. */
type Notice = {
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
 * the choice has already been made. Reached again later from the File menu, where
 * "Open…" now means this rather than a bare file picker.
 */
export function StartScreen({
  onOpen,
  onClose,
  onTrashed,
}: {
  onOpen: (worksheet: Worksheet, language?: LanguageMode) => void;
  /** A document went to Trash — the host drops "Back" if it was the one open. */
  onTrashed?: (id: string) => void;
  /**
   * Leave without opening anything, or `undefined` when there is nothing to go back to.
   *
   * Absent on first load — there is no editor behind the screen yet, so a Cancel would
   * dismiss to nothing. Present when reopened from the File menu, where the document
   * being edited is still there to return to.
   */
  onClose?: () => void;
}) {
  const [summaries, setSummaries] = useState<WorksheetSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState<DocumentType | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [renaming, setRenaming] = useState<WorksheetSummary | undefined>();
  const [confirmingDelete, setConfirmingDelete] = useState<WorksheetSummary | undefined>();
  const [trashRows, setTrashRows] = useState<TrashedSummary[]>([]);
  const [showingTrash, setShowingTrash] = useState(false);
  const [confirmingPurge, setConfirmingPurge] = useState<TrashedSummary | undefined>();
  const [confirmingEmpty, setConfirmingEmpty] = useState(false);
  const [notice, setNotice] = useState<Notice | undefined>();
  const [busy, setBusy] = useState<'backup' | 'restore' | undefined>();
  const [dragging, setDragging] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [folders, setFolders] = useState<FolderState>(EMPTY_FOLDERS);
  // Lazy: the start screen renders only after hydration (`EditorHost`).
  const [folderId, setFolderId] = useState<string | undefined>(readDashboardFolder);
  const [naming, setNaming] = useState<Naming | undefined>();
  const [moving, setMoving] = useState<WorksheetSummary | undefined>();
  const [deletingFolder, setDeletingFolder] = useState<Folder | undefined>();
  const closeFeedback = useCallback(() => setFeedback(false), []);
  const [whatsNew, setWhatsNew] = useState(false);
  const closeWhatsNew = useCallback(() => setWhatsNew(false), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);

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

  const openSaved = async (id: string) => {
    setError(undefined);
    try {
      const worksheet = await worksheetStore.load(id);
      if (!worksheet) {
        // The index and the documents are separate keys, so an entry can outlive what it
        // names — a half-finished `clear`, or storage evicted under quota pressure.
        // Saying so and dropping the row beats an open button that silently does nothing.
        setError(`That worksheet is no longer in this ${isDesktop() ? 'computer' : 'browser'}’s storage.`);
        await worksheetStore.remove(id);
        await refresh();
        return;
      }
      onOpen(worksheet);
    } catch {
      setError('Could not open that worksheet.');
    }
  };

  const openFile = async (file: File) => {
    setError(undefined);
    try {
      onOpen(await readWorksheetFile(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open that file.');
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
      setError('Could not save that folder change.');
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
      const picked = await pickFile(OPEN_FILTERS);
      if (!picked) return;
      if (picked.name.toLowerCase().endsWith('.zip')) await restoreFrom(picked.bytes);
      else onOpen(parseWorksheet(new TextDecoder().decode(picked.bytes)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open that file.');
    }
  };

  const moveToTrash = async (summary: WorksheetSummary) => {
    setError(undefined);
    try {
      await worksheetStore.trash(summary.id);
      onTrashed?.(summary.id);
    } catch {
      setError('Could not move that worksheet to the Trash.');
    }
    await refresh();
  };

  const restoreFromTrash = async (row: TrashedSummary) => {
    setError(undefined);
    try {
      const id = await worksheetStore.restore(row.id);
      if (id) setNotice({ message: `Restored “${row.title}”.` });
      else setError('That worksheet is no longer in the Trash.');
    } catch {
      setError('Could not restore that worksheet.');
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
      const { backupFileName, buildBackup } = await import('@/storage/backup');
      const worksheets: Worksheet[] = [];
      let unreadable = 0;
      for (const summary of await worksheetStore.list()) {
        const worksheet = await worksheetStore.load(summary.id).catch(() => undefined);
        if (worksheet) worksheets.push(worksheet);
        else unreadable += 1;
      }
      if (worksheets.length === 0) {
        setError('There is nothing saved to back up yet.');
        return;
      }
      const filed = await worksheetStore.readFolders();
      const path = await saveFile(
        await buildBackup(worksheets, undefined, filed),
        backupFileName(),
        ZIP_FILTERS,
      );
      // A cancelled desktop sheet wrote nothing, so there is nothing to report.
      if (path === undefined && isDesktop()) return;
      setNotice({
        message:
          `Backed up ${plural(worksheets.length, 'document')}.` +
          (unreadable > 0
            ? ` ${plural(unreadable, 'document')} could not be read and ${unreadable === 1 ? 'is' : 'are'} not in it.`
            : ''),
        action: path
          ? { label: revealLabel(), run: () => void revealFile(path).catch(() => undefined) }
          : undefined,
      });
    } catch {
      setError('Could not write the backup.');
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
      const { readBackup, restoreBackup, restoreSummary } = await import('@/storage/backup');
      const { worksheets, failures, folders: filed } = await readBackup(data);
      const report = await restoreBackup(worksheetStore, worksheets, undefined, filed);
      setNotice({
        message: restoreSummary(report, failures.length),
        details: [...failures, ...report.failed].map((f) => `${f.name} — ${f.reason}`),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read that backup.');
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
      setError('Could not open that file.');
    }
  };

  const showFolder = (label: string, locate: () => Promise<string | undefined>) => () =>
    void (async () => {
      try {
        const path = await locate();
        if (path) await openFolder(path);
      } catch {
        setError(`Could not open the ${label} folder.`);
      }
    })();

  const libraryItems: MenuItem[] = [
    {
      label: busy === 'backup' ? 'Backing up…' : 'Back up all…',
      hint: '.zip',
      icon: <ArchiveIcon />,
      disabled: busy !== undefined,
      onSelect: () => void backUpAll(),
    },
    {
      label: busy === 'restore' ? 'Restoring…' : 'Restore from backup…',
      icon: <FolderOpenIcon />,
      disabled: busy !== undefined,
      onSelect: () => void pickBackup(),
    },
    ...(isDesktop()
      ? [
          {
            label: 'Show saved worksheets',
            icon: <FolderIcon />,
            separated: true,
            onSelect: showFolder('saved worksheets', savedWorksheetsFolder),
          },
          {
            label: 'Show exports folder',
            icon: <FolderIcon />,
            onSelect: showFolder('exports', exportsFolder),
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
              setError('Could not show that file.');
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
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        // Only when the pointer leaves the screen itself — `dragleave` also fires when
        // it crosses onto a child, which would flicker the overlay on every row.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (!file) return;
        if (isZip(file)) void restoreFrom(file);
        else void openFile(file);
      }}
    >
      {/*
        An editorial split rather than a floating card column: the lit index panel on
        the left holds everything that *starts* work, the desk on the right holds the
        documents already on it. The panel runs the full height like the editor's own
        rail, so the screen reads as the same room as the tool it opens.
      */}
      <aside className="zone-light flex shrink-0 flex-col overflow-y-auto border-b border-line bg-surface px-9 pb-8 pt-9 lg:h-full lg:w-[400px] lg:border-b-0 lg:border-r">
        <header className="flex items-center gap-2.5">
          <span className="flex shrink-0 text-ink">
            <AppMark size={22} />
          </span>
          <span className="text-[13px] font-semibold text-ink">Worksheet</span>
          <span className="text-[11px] text-ink-subtle">HKDSE Economics</span>
          {onClose && (
            <Button variant="subtle" size="sm" className="ml-auto" onClick={onClose}>
              Back
            </Button>
          )}
        </header>

        {/* The screen's one display moment: the chrome's serif voice (design/icons/design.md §
            Typography). Everything below it stays on the UI grotesque. */}
        <h1 className="font-display mt-10 text-balance text-[32px] font-normal leading-[1.15] tracking-[-0.015em] text-ink">
          Start a worksheet, or pick up where you left off.
        </h1>

        <section className="mt-9">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-subtle">
            Start new
          </h2>
          {/* Typographic rows, not icon cards: the four kinds differ by *what they
              print*, and a sentence says that better than four look-alike glyphs.
              All four open the same form; the row only preselects the type. */}
          <div className="mt-3 flex flex-col border-t border-line">
            <StartRow
              title="Classroom worksheet"
              hint="MCQ + structured questions. No cover."
              onClick={() => setCreating('classroom')}
            />
            <StartRow
              title="LQ worksheet"
              hint="Long questions with dotted answer space. No exam furniture."
              onClick={() => setCreating('lqWorksheet')}
            />
            <StartRow
              title="Paper 1 mock · MCQ"
              hint="Exam cover; answers on a separate answer sheet."
              onClick={() => setCreating('paper1')}
            />
            <StartRow
              title="Paper 2 mock · booklet"
              hint="Question-Answer Book: cover, Sections A–C, page frame."
              onClick={() => setCreating('lqMock')}
            />
          </div>
          {/* Opening a file is the fifth way in, so it wears the same row — set apart by
              its icon and a gap, rather than being a stray link under the list. */}
          <div className="mt-4 flex flex-col border-t border-line">
            <StartRow
              icon={<FolderOpenIcon size={16} />}
              title="Open a file…"
              hint="A .json worksheet or a backup .zip — or drop one anywhere here."
              onClick={() => void importFile()}
            />
          </div>
        </section>

        {/* One quiet line about where work lives, then the build. Library actions
            (backup, restore, folders, Trash) sit with the library, on the right. */}
        <div className="mt-auto space-y-3 pt-8 text-[11px] leading-relaxed text-ink-subtle">
          {isDesktop() ? (
            <p>Stored on this computer only — no account, no server.</p>
          ) : (
            <p>
              Stored in this browser only — clearing site data deletes it.{' '}
              <TextLink onClick={() => void backUpAll()} disabled={busy !== undefined}>
                {busy === 'backup' ? 'Backing up…' : 'Back up now'}
              </TextLink>
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line pt-3">
            <VersionLine />
            <span className="flex items-center gap-3">
              <TextLink onClick={() => setWhatsNew(true)}>What’s new</TextLink>
              <TextLink onClick={() => setFeedback(true)}>Send feedback</TextLink>
            </span>
          </div>
        </div>
      </aside>

      {/* The desk side: every document already on the desk, as its first page. */}
      <main className="min-h-0 flex-1 overflow-y-auto px-9 py-9 lg:px-14 lg:py-12">
        {/* Results sit above the list: below it, a long archive scrolls them out of view. */}
        {error && (
          <p
            role="alert"
            className="mx-auto mb-5 max-w-5xl rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs text-danger-ink"
          >
            {error}
          </p>
        )}
        {notice && <NoticeBox notice={notice} onDismiss={() => setNotice(undefined)} />}
        {showingTrash ? (
          <TrashList
            rows={trashRows}
            onBack={() => setShowingTrash(false)}
            onRestore={(row) => void restoreFromTrash(row)}
            onPurge={setConfirmingPurge}
            onEmpty={() => setConfirmingEmpty(true)}
          />
        ) : (
          <FileDashboard
            summaries={summaries}
            loaded={loaded}
            actions={actions}
            trashCount={trashRows.length}
            onShowTrash={() => setShowingTrash(true)}
            libraryItems={libraryItems}
            folders={folders}
            folderId={folderId}
            onFolderChange={enterFolder}
            folderActions={folderActions}
          />
        )}
      </main>

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

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-accent/10 backdrop-blur-[1px]">
          <span className="rounded-xl border-2 border-dashed border-accent bg-surface px-5 py-3 text-[13px] font-medium text-accent-ink">
            Drop a .json to open it, or a backup .zip to restore it
          </span>
        </div>
      )}

      {creating && (
        <Dialog
          title="New worksheet"
          description="The decisions that are awkward to change once questions are written. Every one has a default — press Create to take them all."
          width={560}
          onClose={() => setCreating(undefined)}
          // Pinned outside the scrolling body, so Create stays reachable at any window
          // height. In the body it scrolled with the fields and was sliced by the panel
          // edge on a laptop screen.
          footer={
            <>
              <Button variant="subtle" onClick={() => setCreating(undefined)}>
                Cancel
              </Button>
              {/* `form=` submits the form in the dialog's body across the DOM boundary,
                  so this button and Enter in any field take the identical path. */}
              <Button variant="primary" type="submit" form={NEW_WORKSHEET_FORM_ID}>
                Create worksheet
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
          onClose={() => setRenaming(undefined)}
          onDone={async (title) => {
            await worksheetStore.rename(renaming.id, title);
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
          title={`Delete the folder “${deletingFolder.name || 'Untitled folder'}”?`}
          width={420}
          onClose={() => setDeletingFolder(undefined)}
          footer={
            <>
              <Button variant="subtle" onClick={() => setDeletingFolder(undefined)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const folder = deletingFolder;
                  setDeletingFolder(undefined);
                  void removeFolder(folder);
                }}
              >
                Delete folder
              </Button>
            </>
          }
        >
          <p className="px-5 py-5 text-[13px] leading-relaxed text-ink-subtle">
            {(() => {
              const count =
                folderCounts(folders, summaries.map((row) => row.id)).get(deletingFolder.id) ?? 0;
              return `${count === 1 ? 'Its document moves' : `Its ${count} documents move`} to All documents. No document is deleted.`;
            })()}
          </p>
        </Dialog>
      )}

      {confirmingDelete && (
        <Dialog
          title={`Move “${confirmingDelete.title}” to Trash?`}
          width={420}
          onClose={() => setConfirmingDelete(undefined)}
          footer={
            <>
              <Button variant="subtle" onClick={() => setConfirmingDelete(undefined)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const summary = confirmingDelete;
                  setConfirmingDelete(undefined);
                  void moveToTrash(summary);
                }}
              >
                Move to Trash
              </Button>
            </>
          }
        >
          <p className="px-5 py-5 text-[13px] leading-relaxed text-ink-subtle">
            You can restore it from the Trash for {TRASH_RETENTION_DAYS} days. After that it is
            deleted for good.
          </p>
        </Dialog>
      )}

      {confirmingPurge && (
        <Dialog
          title={`Delete “${confirmingPurge.title}” forever?`}
          width={420}
          onClose={() => setConfirmingPurge(undefined)}
          footer={
            <>
              <Button variant="subtle" onClick={() => setConfirmingPurge(undefined)}>
                Cancel
              </Button>
              <DangerButton
                onClick={() => {
                  const id = confirmingPurge.id;
                  setConfirmingPurge(undefined);
                  void worksheetStore.purge(id).then(refresh);
                }}
              >
                Delete forever
              </DangerButton>
            </>
          }
        >
          <p className="px-5 py-5 text-[13px] leading-relaxed text-ink-subtle">
            It is stored {isDesktop() ? 'on this computer' : 'in this browser'} only, so this
            cannot be undone.
          </p>
        </Dialog>
      )}

      {confirmingEmpty && (
        <Dialog
          title="Empty the Trash?"
          width={420}
          onClose={() => setConfirmingEmpty(false)}
          footer={
            <>
              <Button variant="subtle" onClick={() => setConfirmingEmpty(false)}>
                Cancel
              </Button>
              <DangerButton
                onClick={() => {
                  setConfirmingEmpty(false);
                  void worksheetStore.emptyTrash().then(refresh);
                }}
              >
                Empty Trash
              </DangerButton>
            </>
          }
        >
          <p className="px-5 py-5 text-[13px] leading-relaxed text-ink-subtle">
            {plural(trashRows.length, 'document')} will be deleted for good. This cannot be
            undone.
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
 * One way to start, as a line in an index rather than an icon card. The accent bar
 * that slides in on hover is the row's whole affordance — the text stays put, the
 * colour arrives, nothing lifts or casts a shadow.
 */
function StartRow({
  title,
  hint,
  icon,
  onClick,
}: {
  title: string;
  hint: string;
  icon?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative cursor-pointer border-b border-line py-3.5 pl-4 pr-2 text-left transition-colors duration-150 ease-[var(--ease-out-soft)] hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-0.5 bg-accent opacity-0 transition-opacity duration-150 ease-[var(--ease-out-soft)] group-hover:opacity-100 group-focus-visible:opacity-100"
      />
      <span className="flex items-center gap-2 text-[13.5px] font-medium text-ink transition-colors group-hover:text-accent-ink">
        {icon && <span className="text-ink-subtle group-hover:text-accent-ink">{icon}</span>}
        {title}
      </span>
      <span className="mt-0.5 block text-[11px] leading-snug text-ink-muted">{hint}</span>
    </button>
  );
}

function RenameDialog({
  summary,
  onClose,
  onDone,
}: {
  summary: WorksheetSummary;
  onClose: () => void;
  onDone: (title: string) => void;
}) {
  const [title, setTitle] = useState(summary.title === 'Untitled' ? '' : summary.title);
  const trimmed = title.trim();
  const formId = 'rename-worksheet-form';

  return (
    <Dialog
      title="Rename worksheet"
      description="What this document is called here and what the exported file is named. The heading printed on the page is set in the document itself."
      width={420}
      onClose={onClose}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          {/* Disabled on empty rather than falling back to "Untitled": an empty box here
              is a slip, and silently renaming a document to nothing is not what it asks
              for. */}
          <Button variant="primary" type="submit" form={formId} disabled={!trimmed}>
            Rename
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="px-5 py-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed) onDone(trimmed);
        }}
      >
        <input
          type="text"
          value={title}
          autoFocus
          placeholder="Document name"
          onChange={(event) => setTitle(event.target.value)}
          className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
      </form>
    </Dialog>
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
  const [name, setName] = useState(folder?.name ?? '');
  const problem = folderNameProblem(folders, name, folder?.id);
  // "Give it a name" is not worth saying before anything is typed.
  const shown = name.trim() ? problem : undefined;
  const formId = 'folder-name-form';
  return (
    <Dialog
      title={folder ? 'Rename folder' : 'New folder'}
      description={
        filing
          ? `“${filing.title}” will be filed in it.`
          : 'Folders group documents here; a document can be in one folder.'
      }
      width={420}
      onClose={onClose}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={!!problem}>
            {folder ? 'Rename' : filing ? 'Create and move' : 'Create folder'}
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
          placeholder="e.g. S5 2026-27, Mocks"
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
  const current = folderOf(folders, summary.id)?.id;
  const destinations: { id: string | undefined; name: string }[] = [
    { id: undefined, name: 'No folder' },
    ...sortedFolders(folders).map((f) => ({ id: f.id, name: f.name || 'Untitled folder' })),
  ];
  return (
    <Dialog
      title={`Move “${summary.title}”`}
      description="It stays in All documents wherever it is filed."
      width={420}
      onClose={onClose}
      footer={
        <>
          <Button variant="subtle" className="mr-auto" onClick={onNewFolder}>
            New folder…
          </Button>
          <Button variant="subtle" onClick={onClose}>
            Cancel
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
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span className="text-ink-subtle">
                  {destination.id === undefined ? <SheetIcon /> : <FolderIcon />}
                </span>
                <span className="min-w-0 flex-1 truncate">{destination.name}</span>
                {here && <span className="shrink-0 text-[11px] text-ink-subtle">Here now</span>}
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
      className="inline-flex h-[34px] items-center justify-center rounded-lg border border-transparent bg-danger px-3 text-[13px] font-medium text-white shadow-sm transition-colors hover:brightness-95 active:scale-[0.97]"
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
      className="cursor-pointer font-medium text-accent-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function NoticeBox({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const details = notice.details ?? [];
  return (
    <div
      role="status"
      className="zone-light mx-auto mb-5 max-w-5xl rounded-xl border border-line bg-surface px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1 text-[12.5px] font-medium text-ink">{notice.message}</p>
        {notice.action && (
          <Button variant="ghostAccent" size="sm" onClick={notice.action.run}>
            {notice.action.label}
          </Button>
        )}
        <Button variant="subtle" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
      {details.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] leading-snug text-ink-muted">
          {details.slice(0, 8).map((line) => (
            <li key={line} className="truncate">
              {line}
            </li>
          ))}
          {details.length > 8 && <li>and {details.length - 8} more</li>}
        </ul>
      )}
    </div>
  );
}

function plural(count: number, noun: string): string {
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}

const OPEN_FILTERS = [{ name: 'Worksheet or backup', extensions: ['json', 'zip'] }];

function isZip(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith('.zip') ||
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed'
  );
}
