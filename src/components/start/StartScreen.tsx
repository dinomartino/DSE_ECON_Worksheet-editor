'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { exportsFolder, isDesktop, openFolder, revealFile, revealLabel } from '@/platform';
import { Dialog } from '@/components/ui/Dialog';
import { AppMark } from '@/components/ui/AppMark';
import { FileDashboard, type DocumentActions } from './FileDashboard';
import { NEW_WORKSHEET_FORM_ID, NewWorksheetForm } from './NewWorksheetForm';
import { newId } from '@/model/factories';
import type { DocumentType } from '@/model/newWorksheet';
import type { LanguageMode, Worksheet } from '@/model/types';
import {
  downloadWorksheetFile,
  duplicateWorksheet,
  pickWorksheetFile,
  readWorksheetFile,
  savedWorksheetPath,
  savedWorksheetsFolder,
  worksheetStore,
  type WorksheetSummary,
} from '@/storage';

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
}: {
  onOpen: (worksheet: Worksheet, language?: LanguageMode) => void;
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
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const next = await worksheetStore.list();
    setSummaries(next);
    setLoaded(true);
  }, []);

  // Read the index once on mount, and again after anything that changes it. Guarded
  // against a resolve arriving after unmount — the screen is dismissed by opening a
  // document, which is exactly when a slow `list()` would still be in flight.
  useEffect(() => {
    let live = true;
    void (async () => {
      const next = await worksheetStore.list();
      if (!live) return;
      setSummaries(next);
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
    await worksheetStore.save(duplicateWorksheet(worksheet, newId()));
    await refresh();
  };

  /**
   * "Open a .json worksheet…": the native open sheet on desktop, starting in the same
   * folder exports go to; the hidden file input on the web.
   */
  const importFile = async () => {
    if (!isDesktop()) {
      fileInput.current?.click();
      return;
    }
    setError(undefined);
    try {
      const worksheet = await pickWorksheetFile();
      if (worksheet) onOpen(worksheet);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open that file.');
    }
  };

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
    remove: setConfirmingDelete,
  };

  return (
    <div
      className="zone-dark flex h-screen flex-col overflow-hidden bg-desk lg:flex-row"
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
        if (file) void openFile(file);
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
        <h1 className="font-display mt-14 text-balance text-[32px] font-normal leading-[1.15] tracking-[-0.015em] text-ink">
          Start a worksheet, or pick up where you left off.
        </h1>

        <section className="mt-12">
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
          <button
            type="button"
            onClick={() => void importFile()}
            className="mt-5 cursor-pointer text-[12px] font-medium text-accent-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Open a .json worksheet…
          </button>
          <p className="mt-1.5 text-[11px] text-ink-subtle">
            or drop one anywhere on this page
          </p>
        </section>

        <div className="mt-auto pt-10 text-[11px] leading-relaxed text-ink-subtle">
          {isDesktop() ? (
            <>
              <p>
                Everything here is stored on this computer only — there is no server and no
                account. Keep a .json copy of anything you would be sorry to lose.
              </p>
              {/* The two places a teacher's files live, one click each: the app's own
                  store (autosaved, named by id) and the folder exports start in. */}
              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                <FolderLink
                  label="Saved worksheets"
                  locate={savedWorksheetsFolder}
                  onError={setError}
                />
                <FolderLink label="Exports folder" locate={exportsFolder} onError={setError} />
              </p>
            </>
          ) : (
            <p>
              Everything here is stored in this browser only — there is no server and no
              account. Clearing site data deletes it, so keep a .json copy of anything you
              would be sorry to lose.
            </p>
          )}
        </div>
      </aside>

      {/* The desk side: every document already on the desk, as its first page. */}
      <main className="min-h-0 flex-1 overflow-y-auto px-9 py-9 lg:px-14 lg:py-12">
        <FileDashboard summaries={summaries} loaded={loaded} actions={actions} />
        {error && (
          <p
            role="alert"
            className="mx-auto mt-4 max-w-5xl rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs text-danger-ink"
          >
            {error}
          </p>
        )}
      </main>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void openFile(file);
          event.target.value = '';
        }}
      />

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-accent/10 backdrop-blur-[1px]">
          <span className="rounded-xl border-2 border-dashed border-accent bg-surface px-5 py-3 text-[13px] font-medium text-accent-ink">
            Drop to open this worksheet
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

      {confirmingDelete && (
        <Dialog
          title={`Delete “${confirmingDelete.title}”?`}
          description={`It is stored ${isDesktop() ? 'on this computer' : 'in this browser'} only, so there is no copy to restore it from.`}
          width={420}
          onClose={() => setConfirmingDelete(undefined)}
          // `Dialog`'s footer is already a right-aligned flex row, so these sit in it
          // directly rather than inside a second one that re-states the same layout.
          footer={
            <>
              <Button variant="subtle" onClick={() => setConfirmingDelete(undefined)}>
                Cancel
              </Button>
              {/* Filled, for the reason the clear-everything dialog spells out: the
                  quiet `danger` variant recedes until hovered, which reads as equal
                  weight to Cancel at rest. */}
              <button
                type="button"
                onClick={() => {
                  const id = confirmingDelete.id;
                  setConfirmingDelete(undefined);
                  void worksheetStore.remove(id).then(refresh);
                }}
                className="inline-flex h-[34px] items-center justify-center rounded-lg border border-transparent bg-danger px-3 text-[13px] font-medium text-white shadow-sm transition-colors hover:brightness-95 active:scale-[0.97]"
              >
                Delete
              </button>
            </>
          }
        >
          <p className="px-5 py-5 text-[13px] leading-relaxed text-ink-subtle">
            Download a .json copy first if you might want it back.
          </p>
        </Dialog>
      )}
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
  onClick,
}: {
  title: string;
  hint: string;
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
      <span className="block text-[13.5px] font-medium text-ink transition-colors group-hover:text-accent-ink">
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

/**
 * A desktop folder, one click away. Resolved on click rather than on render: the path
 * comes from the shell asynchronously, and the exports folder is created on demand.
 */
function FolderLink({
  label,
  locate,
  onError,
}: {
  label: string;
  locate: () => Promise<string | undefined>;
  onError: (message: string) => void;
}) {
  return (
    <button
      type="button"
      title={`Open in ${revealLabel().replace(/^Show in /, '')}`}
      onClick={() =>
        void (async () => {
          try {
            const path = await locate();
            if (path) await openFolder(path);
          } catch {
            onError(`Could not open the ${label.toLowerCase()} folder.`);
          }
        })()
      }
      className="cursor-pointer font-medium text-accent-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {label}
    </button>
  );
}
