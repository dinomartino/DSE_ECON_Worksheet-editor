'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { Menu } from '@/components/ui/Menu';
import {
  AnswerSpaceIcon,
  DocumentIcon,
  McqIcon,
  PageIcon,
  StructuredIcon,
} from '@/components/ui/icons';
import { NEW_WORKSHEET_FORM_ID, NewWorksheetForm } from './NewWorksheetForm';
import { newId } from '@/model/factories';
import type { DocumentType } from '@/model/newWorksheet';
import type { LanguageMode, Worksheet } from '@/model/types';
import {
  downloadWorksheetFile,
  duplicateWorksheet,
  readWorksheetFile,
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
        setError('That worksheet is no longer in this browser’s storage.');
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

  return (
    <div
      className="zone-dark flex h-screen flex-col overflow-y-auto bg-desk"
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
        `my-auto` centres the column when it is shorter than the window and lets it flow
        from the top once the list outgrows one screen — `justify-center` on the
        scroller would clip the overflowing top instead. Without it a short list sits in
        the top third under a screen-height field of empty desk, which reads as a page
        that failed to finish loading rather than as a document picker.
      */}
      <div className="mx-auto my-auto w-full max-w-3xl px-6 py-12">
        <header className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-[15px] font-bold text-on-accent"
          >
            W
          </span>
          <span className="text-[15px] font-semibold leading-tight text-ink">
            Worksheet
            <span className="ml-2 text-[12px] font-normal text-ink-subtle">
              HKDSE Economics
            </span>
          </span>
          {onClose && (
            <Button variant="subtle" className="ml-auto" onClick={onClose}>
              Back to the editor
            </Button>
          )}
        </header>

        <section className="mt-9">
          <h2 className="text-[13px] font-semibold text-ink">Start a new worksheet</h2>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            Each opens the same form — the card only preselects the document type.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StartCard
              icon={<DocumentIcon size={18} />}
              title="Classroom worksheet"
              hint="MCQ + structured questions. No cover."
              onClick={() => setCreating('classroom')}
            />
            <StartCard
              icon={<AnswerSpaceIcon size={18} />}
              title="LQ worksheet"
              hint="Long questions with dotted answer space. No exam furniture."
              onClick={() => setCreating('lqWorksheet')}
            />
            <StartCard
              icon={<McqIcon size={18} />}
              title="Paper 1 mock · MCQ"
              hint="Exam cover; answers on a separate answer sheet."
              onClick={() => setCreating('paper1')}
            />
            <StartCard
              icon={<StructuredIcon size={18} />}
              title="Paper 2 mock · booklet"
              hint="Question-Answer Book: cover, Sections A–C, page frame."
              onClick={() => setCreating('lqMock')}
            />
          </div>
          <div className="mt-3">
            <Button variant="subtle" onClick={() => fileInput.current?.click()}>
              Open a .json worksheet…
            </Button>
            <span className="ml-1 text-[11px] text-ink-subtle">or drop one on this page</span>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-[13px] font-semibold text-ink">
            Saved in this browser
            {summaries.length > 0 && (
              <span className="ml-1.5 font-normal text-ink-subtle">({summaries.length})</span>
            )}
          </h2>

          {/* Three states, each said plainly. The distinction between "nothing saved
              yet" and "still reading storage" matters on this screen: the second flashes
              an empty list that reads as lost work. */}
          {!loaded ? (
            <p className="mt-3 text-[12px] text-ink-subtle">Reading saved documents…</p>
          ) : summaries.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-line px-4 py-6 text-center text-[12px] text-ink-muted">
              Nothing saved yet. Worksheets you start are kept in this browser — download
              a .json copy to move one to another machine.
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {summaries.map((summary) => (
                <SavedRow
                  key={summary.id}
                  summary={summary}
                  onOpen={() => void openSaved(summary.id)}
                  onRename={() => setRenaming(summary)}
                  onDuplicate={() => void duplicate(summary)}
                  onDownload={async () => {
                    const worksheet = await worksheetStore.load(summary.id);
                    if (worksheet) downloadWorksheetFile(worksheet);
                  }}
                  onDelete={() => setConfirmingDelete(summary)}
                />
              ))}
            </ul>
          )}
        </section>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs text-danger-ink"
          >
            {error}
          </p>
        )}

        <p className="mt-10 text-[11px] leading-relaxed text-ink-subtle">
          Everything here is stored in this browser only — there is no server and no
          account. Clearing site data deletes it, so keep a .json copy of anything you
          would be sorry to lose.
        </p>
      </div>

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
          description="It is stored in this browser only, so there is no copy to restore it from."
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

function StartCard({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="zone-light group flex cursor-pointer flex-col items-start gap-1.5 rounded-xl border border-transparent bg-surface-raised p-3.5 text-left shadow-lg transition-[background-color,border-color,color,box-shadow,opacity] hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className="text-ink-subtle transition-colors group-hover:text-accent">{icon}</span>
      <span className="text-[13px] font-medium text-ink">{title}</span>
      <span className="text-[11px] leading-snug text-ink-muted">{hint}</span>
    </button>
  );
}

/**
 * One saved document.
 *
 * The row itself opens it — that is what the list is for, and burying the common action
 * inside the overflow menu beside four rare ones would make resuming work the slowest
 * thing on the screen. The menu carries what a file list also has to offer: rename,
 * duplicate, download, delete.
 */
function SavedRow({
  summary,
  onOpen,
  onRename,
  onDuplicate,
  onDownload,
  onDelete,
}: {
  summary: WorksheetSummary;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="zone-light flex items-center gap-2 rounded-xl border border-transparent bg-surface-raised pr-2 shadow-md transition-colors hover:border-accent">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="shrink-0 text-ink-subtle">
          {summary.hasCover ? <PageIcon size={16} /> : <DocumentIcon size={16} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink">
            {summary.title}
          </span>
          <span className="block truncate text-[11px] text-ink-muted">
            {describe(summary)}
          </span>
        </span>
      </button>
      <Menu
        label={`Actions for ${summary.title}`}
        items={[
          { label: 'Open', onSelect: onOpen },
          { label: 'Rename…', onSelect: onRename },
          { label: 'Duplicate', onSelect: onDuplicate },
          { label: 'Download .json', onSelect: onDownload },
          { label: 'Delete…', onSelect: onDelete, danger: true, separated: true },
        ]}
      />
    </li>
  );
}

/** "12 questions · with cover · 2 hours ago" — what tells two mock papers apart. */
function describe(summary: WorksheetSummary): string {
  const parts: string[] = [];
  if (summary.questionCount !== undefined) {
    parts.push(
      summary.questionCount === 1 ? '1 question' : `${summary.questionCount} questions`,
    );
  }
  if (summary.hasCover) parts.push('cover page');
  parts.push(relativeTime(summary.updatedAt));
  return parts.join(' · ');
}

/**
 * How long ago, in words.
 *
 * A file list is scanned for "the one I had open before lunch", and an absolute
 * timestamp makes the reader do that subtraction themselves. Falls back to the date
 * past a week, where "8 days ago" stops being easier than the date it names.
 */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
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
