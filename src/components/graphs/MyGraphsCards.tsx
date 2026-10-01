'use client';

import { useEffect, useMemo, useState } from 'react';
import { isGraphNewerThanBuild, type SavedGraph } from '@/model/graph';
import { graphStore } from '@/storage';
import { searchGraphs } from './graphList';
import { GraphThumb } from './GraphThumb';
import { useMessages } from '@/i18n/language';
import { GRAPH_USE_MESSAGES } from './messages';

/**
 * The diagram picker's "My graphs" tab: saved graphs as cards, searchable by name.
 * Picking one hands back the graph; the caller inserts a copy. A newer build's graph
 * is shown but cannot be picked (its geometry may hold what this build drops).
 */
export function MyGraphsCards({ onPick, columns = 2 }: { onPick: (graph: SavedGraph) => void; columns?: number }) {
  const m = useMessages(GRAPH_USE_MESSAGES);
  const [graphs, setGraphs] = useState<SavedGraph[] | undefined>();
  const [search, setSearch] = useState('');

  useEffect(() => {
    let live = true;
    void graphStore.list().then(
      (listing) => live && setGraphs(listing.graphs),
      () => live && setGraphs([]),
    );
    return () => {
      live = false;
    };
  }, []);

  const shown = useMemo(() => searchGraphs(graphs ?? [], search), [graphs, search]);

  if (graphs === undefined) return <p className="px-1 py-6 text-center text-[12px] text-ink-subtle">{m.reading}</p>;
  if (graphs.length === 0) {
    return (
      <div className="px-3 py-6 text-center" data-my-graphs-empty="">
        <p className="text-[12.5px] font-medium text-ink">{m.noSaved}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
          {m.noSavedHint}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="block">
        <span className="sr-only">{m.searchMine}</span>
        <input
          type="search"
          autoFocus
          value={search}
          placeholder={m.searchMine}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && search) {
              event.stopPropagation();
              setSearch('');
            }
          }}
          className="h-7 w-full rounded-md border border-line bg-surface px-2 text-[12px] text-ink outline-none transition-colors duration-150 ease-out-soft placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
      </label>
      {shown.length === 0 ? (
        <p className="px-1 py-3 text-center text-[12px] text-ink-subtle">{m.noMatchGraph}</p>
      ) : (
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {shown.map((graph) => {
            const newer = isGraphNewerThanBuild(graph);
            return (
              <button
                key={graph.id}
                type="button"
                disabled={newer}
                data-graph-card={graph.id}
                title={newer ? m.cardNewer : m.cardInsert(graph.name)}
                onClick={() => onPick(graph)}
                className="rounded-lg border border-line p-1.5 text-left transition-[background-color,border-color,scale] duration-150 ease-out-soft enabled:hover:bg-surface-sunken enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <GraphThumb graph={graph} className="h-20" />
                <span className="mt-1 block truncate text-[11px] font-medium text-ink">{graph.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
