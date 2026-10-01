'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { Menu } from '@/components/ui/Menu';
import { DiagramIcon, PlusIcon } from '@/components/ui/icons';
import { DiagramTemplateCards } from '@/components/editor/DiagramTemplatePicker';
import { relativeTime } from '@/components/start/dashboard';
import { createGraph, type SavedGraph } from '@/model/graph';
import { graphStore, NewerGraphError, type GraphListing } from '@/storage';
import { graphCount, searchGraphs } from './graphList';
import { GraphThumb } from './GraphThumb';

/**
 * The Graphs library: every saved graph as a card drawn from its geometry (never a
 * stored picture), searchable by name. New graph starts from a diagram template or blank
 * axes; the card menu files it.
 */
export function GraphLibrary({
  onHome,
  onOpen,
  settings,
}: {
  onHome: () => void;
  onOpen: (id: string) => void;
  settings?: ReactNode;
}) {
  const [graphs, setGraphs] = useState<SavedGraph[]>([]);
  const [unreadable, setUnreadable] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<SavedGraph | undefined>();
  const [deleting, setDeleting] = useState<SavedGraph | undefined>();
  const [error, setError] = useState<string | undefined>();

  const show = useCallback((listing: GraphListing) => {
    setGraphs(listing.graphs);
    setUnreadable(listing.unreadable);
    setLoaded(true);
  }, []);
  const refresh = useCallback(() => graphStore.list().then(show), [show]);
  useEffect(() => {
    let live = true;
    void graphStore.list().then((listing) => live && show(listing));
    return () => {
      live = false;
    };
  }, [show]);

  const shown = useMemo(() => searchGraphs(graphs, search), [graphs, search]);

  const create = async (templateId: string) => {
    setCreating(false);
    setError(undefined);
    const graph = createGraph(templateId);
    try {
      // Saved before it is edited, so it is on the list even if nothing is drawn.
      await graphStore.save(graph);
      onOpen(graph.id);
    } catch {
      setError('Could not save a new graph. Storage may be full.');
    }
  };

  const duplicate = async (graph: SavedGraph) => {
    setError(undefined);
    try {
      await graphStore.duplicate(graph.id);
    } catch {
      setError('Could not duplicate that graph.');
    }
    await refresh();
  };

  const rename = async (graph: SavedGraph, name: string) => {
    setError(undefined);
    try {
      await graphStore.rename(graph.id, name);
      setRenaming(undefined);
    } catch (cause) {
      setRenaming(undefined);
      setError(
        cause instanceof NewerGraphError
          ? 'This graph was saved by a newer version of Econ Studio and cannot be renamed here.'
          : 'Could not rename that graph.',
      );
    }
    await refresh();
  };

  const remove = async (graph: SavedGraph) => {
    setDeleting(undefined);
    setError(undefined);
    try {
      await graphStore.remove(graph.id);
    } catch {
      setError('Could not delete that graph.');
    }
    await refresh();
  };

  return (
    <div className="zone-light flex h-full min-h-0 flex-col bg-surface text-ink">
      <header className="flex h-12 shrink-0 items-center gap-3.5 whitespace-nowrap border-b border-line bg-surface px-4">
        <button
          type="button"
          onClick={onHome}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-ink-muted transition-colors duration-150 ease-out-soft hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ← Home
        </button>
        <h1 className="font-display text-[19px] font-normal text-ink">Graphs 圖表庫</h1>
        <span className="flex-1" />
        {graphs.length > 0 && (
          <label className="relative w-[min(300px,30vw)] min-w-[180px]">
            <span className="sr-only">Search graphs</span>
            <input
              type="search"
              value={search}
              placeholder="Search graphs by name"
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && search) {
                  event.stopPropagation();
                  setSearch('');
                }
              }}
              className="h-8 w-full rounded-lg border border-transparent bg-surface-sunken px-2.5 text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/25"
            />
          </label>
        )}
        {loaded && graphs.length > 0 && (
          <span className="text-[12px] tabular-nums text-ink-subtle">{graphCount(graphs.length)}</span>
        )}
        <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
          <PlusIcon size={14} className="mr-1" />
          New graph
        </Button>
        {settings}
      </header>

      {(error || unreadable > 0) && (
        <div className="shrink-0 space-y-2 px-4 pt-3">
          {error && (
            <p role="alert" className="animate-slide-down-in rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs text-danger-ink">
              {error}
            </p>
          )}
          {unreadable > 0 && (
            <p className="rounded-lg bg-warn-soft px-2.5 py-1.5 text-xs text-warn-ink">
              {unreadable === 1 ? '1 saved graph could not be read' : `${unreadable} saved graphs could not be read`} and
              {unreadable === 1 ? ' is' : ' are'} left as it was.
            </p>
          )}
        </div>
      )}

      <main className="scroll-slim min-h-0 flex-1 overflow-y-auto px-7 py-6">
        {loaded && graphs.length === 0 ? (
          <div className="mx-auto mt-16 max-w-md text-center">
            <span className="inline-flex text-ink-subtle">
              <DiagramIcon size={28} />
            </span>
            <p className="mt-3 text-[14px] font-medium text-ink">No graphs yet</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              Draw a graph once. Reuse it in a question or copy it into Word.
            </p>
            <Button variant="primary" className="mt-5" onClick={() => setCreating(true)}>
              New graph
            </Button>
          </div>
        ) : loaded && shown.length === 0 ? (
          <p className="mx-auto mt-10 max-w-md text-center text-[13px] text-ink-muted">No graph is named like that.</p>
        ) : (
          <ul className="mx-auto grid max-w-[1280px] grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-5 gap-y-6">
            {shown.map((graph) => (
              <GraphCard
                key={graph.id}
                graph={graph}
                onOpen={() => onOpen(graph.id)}
                onRename={() => setRenaming(graph)}
                onDuplicate={() => void duplicate(graph)}
                onDelete={() => setDeleting(graph)}
              />
            ))}
          </ul>
        )}
      </main>

      {creating && <NewGraphDialog onClose={() => setCreating(false)} onPick={(id) => void create(id)} />}
      {renaming && (
        <RenameGraphDialog graph={renaming} onClose={() => setRenaming(undefined)} onDone={(name) => void rename(renaming, name)} />
      )}
      {deleting && (
        <Dialog
          title={`Delete “${deleting.name}”?`}
          width={420}
          onClose={() => setDeleting(undefined)}
          footer={
            <>
              <Button variant="subtle" onClick={() => setDeleting(undefined)}>
                Cancel
              </Button>
              <button
                type="button"
                onClick={() => void remove(deleting)}
                className="inline-flex h-[34px] cursor-pointer items-center justify-center rounded-lg border border-transparent bg-danger px-3 text-[13px] font-medium text-white shadow-sm transition-[background-color,filter,scale] duration-150 ease-out-soft hover:brightness-95 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                Delete
              </button>
            </>
          }
        >
          <p className="px-5 py-5 text-[13px] leading-relaxed text-ink-subtle">
            It is deleted for good. Worksheets that already use a copy of it keep theirs.
          </p>
        </Dialog>
      )}
    </div>
  );
}

function GraphCard({
  graph,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: {
  graph: SavedGraph;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="group relative min-w-0">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${graph.name}`}
        className="block w-full cursor-pointer rounded-lg text-left focus-visible:outline-none"
      >
        {/* Hover is colour only: the accent ring fades in, the card stays put. */}
        <span className="relative block rounded-[3px] shadow-[0_1px_2px_rgba(0,0,0,0.18),0_4px_14px_rgba(0,0,0,0.10)] ring-1 ring-black/5 group-focus-within:ring-2 group-focus-within:ring-accent">
          <GraphThumb graph={graph} />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[3px] opacity-0 ring-2 ring-accent transition-opacity duration-150 ease-out-soft group-hover:opacity-100"
          />
        </span>
        <span className="mt-2.5 block pr-9">
          <span className="line-clamp-2 text-[13px] font-medium leading-snug text-ink transition-colors duration-150 ease-out-soft group-hover:text-accent-ink">
            {graph.name}
          </span>
          <span className="mt-1 block truncate text-[11px] tabular-nums leading-tight text-ink-subtle">
            {relativeTime(graph.updatedAt)}
          </span>
        </span>
      </button>
      <div className="absolute bottom-0 right-0">
        <Menu
          label={`Actions for ${graph.name}`}
          items={[
            { label: 'Rename…', onSelect: onRename },
            { label: 'Duplicate', onSelect: onDuplicate },
            { label: 'Delete…', onSelect: onDelete, danger: true, separated: true },
          ]}
        />
      </div>
    </li>
  );
}

function NewGraphDialog({ onClose, onPick }: { onClose: () => void; onPick: (templateId: string) => void }) {
  return (
    <Dialog
      title="New graph"
      description="Start from a template, or from blank axes. Everything on it can be changed."
      width={760}
      onClose={onClose}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onPick('blank')}>Start blank</Button>
        </>
      }
    >
      <div className="px-5 py-4">
        <DiagramTemplateCards onPick={onPick} columns={4} />
      </div>
    </Dialog>
  );
}

function RenameGraphDialog({
  graph,
  onClose,
  onDone,
}: {
  graph: SavedGraph;
  onClose: () => void;
  onDone: (name: string) => void;
}) {
  const [name, setName] = useState(graph.name);
  const trimmed = name.trim();
  const formId = 'rename-graph-form';
  return (
    <Dialog
      title="Rename graph"
      description="What this graph is called here and what a downloaded image is named. It is never printed."
      width={420}
      onClose={onClose}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
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
          value={name}
          autoFocus
          aria-label="Graph name"
          placeholder="Graph name"
          onChange={(event) => setName(event.target.value)}
          className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors duration-150 ease-out-soft placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
      </form>
    </Dialog>
  );
}
