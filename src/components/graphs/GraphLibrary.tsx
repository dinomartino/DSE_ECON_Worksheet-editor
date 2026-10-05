'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { useNotices } from '@/components/ui/NoticeLayer';
import { Menu } from '@/components/ui/Menu';
import { DiagramIcon, PlusIcon } from '@/components/ui/icons';
import { DiagramTemplateCards } from '@/components/editor/DiagramTemplatePicker';
import { relativeTime } from '@/components/start/dashboard';
import { createGraph, type SavedGraph } from '@/model/graph';
import { graphStore, NewerGraphError, type GraphListing } from '@/storage';
import { graphCount, searchGraphs } from './graphList';
import { GRAPH_LIBRARY_MESSAGES } from './messages';
import { GraphThumb } from './GraphThumb';
import { useMessages, useUiLanguage } from '@/i18n/language';

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
  const m = useMessages(GRAPH_LIBRARY_MESSAGES);
  const lang = useUiLanguage();
  const [graphs, setGraphs] = useState<SavedGraph[]>([]);
  const [unreadable, setUnreadable] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<SavedGraph | undefined>();
  const [deleting, setDeleting] = useState<SavedGraph | undefined>();
  // A failed action is an error notice: it stays until closed or the next action.
  const notices = useNotices();
  const setError = (message: string | undefined) => {
    if (message === undefined) notices.dismiss('graph-library-error');
    else notices.notify({ id: 'graph-library-error', tone: 'error', body: message });
  };

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
      setError(m.saveFailed);
    }
  };

  const duplicate = async (graph: SavedGraph) => {
    setError(undefined);
    try {
      await graphStore.duplicate(graph.id);
    } catch {
      setError(m.duplicateFailed);
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
          ? m.renameNewer
          : m.renameFailed,
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
      setError(m.deleteFailed);
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
          {m.home}
        </button>
        <h1 className="font-display text-[19px] font-normal text-ink">{m.title}</h1>
        <span className="flex-1" />
        {graphs.length > 0 && (
          <label className="relative w-[min(300px,30vw)] min-w-[180px]">
            <span className="sr-only">{m.searchLabel}</span>
            <input
              type="search"
              value={search}
              placeholder={m.searchPlaceholder}
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
          <span className="text-[12px] tabular-nums text-ink-subtle">{graphCount(graphs.length, lang)}</span>
        )}
        <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
          <PlusIcon size={14} className="mr-1" />
          {m.newGraph}
        </Button>
        {settings}
      </header>

      {/* A standing fact about what is stored, read on load: stays in the page. */}
      {unreadable > 0 && (
        <div className="shrink-0 px-4 pt-3">
          <p className="rounded-lg bg-warn-soft px-2.5 py-1.5 text-xs text-warn-ink">
            {m.unreadable(unreadable)}
          </p>
        </div>
      )}

      <main className="scroll-slim min-h-0 flex-1 overflow-y-auto px-7 py-6">
        {loaded && graphs.length === 0 ? (
          <div className="mx-auto mt-16 max-w-md text-center">
            <span className="inline-flex text-ink-subtle">
              <DiagramIcon size={28} />
            </span>
            <p className="mt-3 text-[14px] font-medium text-ink">{m.emptyTitle}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              {m.emptyHint}
            </p>
            <Button variant="primary" className="mt-5" onClick={() => setCreating(true)}>
              {m.newGraph}
            </Button>
          </div>
        ) : loaded && shown.length === 0 ? (
          <p className="mx-auto mt-10 max-w-md text-center text-[13px] text-ink-muted">{m.noMatch}</p>
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
          title={m.deleteTitle(deleting.name)}
          width={420}
          onClose={() => setDeleting(undefined)}
          footer={
            <>
              <Button variant="subtle" onClick={() => setDeleting(undefined)}>
                {m.cancel}
              </Button>
              <button
                type="button"
                onClick={() => void remove(deleting)}
                className="inline-flex h-[34px] cursor-pointer items-center justify-center rounded-lg border border-transparent bg-danger px-3 text-[13px] font-medium text-white shadow-sm transition-[background-color,filter,scale] duration-150 ease-out-soft hover:brightness-95 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                {m.delete}
              </button>
            </>
          }
        >
          <p className="px-5 py-5 text-[13px] leading-relaxed text-ink-subtle">
            {m.deleteBody}
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
  const m = useMessages(GRAPH_LIBRARY_MESSAGES);
  return (
    <li className="group relative min-w-0">
      <button
        type="button"
        onClick={onOpen}
        aria-label={m.open(graph.name)}
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
          label={m.actionsFor(graph.name)}
          items={[
            { label: m.renameItem, onSelect: onRename },
            { label: m.duplicateItem, onSelect: onDuplicate },
            { label: m.deleteItem, onSelect: onDelete, danger: true, separated: true },
          ]}
        />
      </div>
    </li>
  );
}

function NewGraphDialog({ onClose, onPick }: { onClose: () => void; onPick: (templateId: string) => void }) {
  const m = useMessages(GRAPH_LIBRARY_MESSAGES);
  return (
    <Dialog
      title={m.newGraph}
      description={m.newDialogDescription}
      width={760}
      onClose={onClose}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            {m.cancel}
          </Button>
          <Button onClick={() => onPick('blank')}>{m.startBlank}</Button>
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
  const m = useMessages(GRAPH_LIBRARY_MESSAGES);
  const [name, setName] = useState(graph.name);
  const trimmed = name.trim();
  const formId = 'rename-graph-form';
  return (
    <Dialog
      title={m.renameTitle}
      description={m.renameDescription}
      width={420}
      onClose={onClose}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            {m.cancel}
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={!trimmed}>
            {m.rename}
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
          aria-label={m.graphName}
          placeholder={m.graphName}
          onChange={(event) => setName(event.target.value)}
          className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors duration-150 ease-out-soft placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
      </form>
    </Dialog>
  );
}
