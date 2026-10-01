'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { DownloadIcon } from '@/components/ui/icons';
import { undoChord } from '@/components/ui/undoChord';
import { DiagramCanvas } from '@/components/editor/DiagramCanvas';
import { FieldScopeContext } from '@/components/editor/fieldScope';
import { copyGraphImage, dataUrlToBlob, graphPngDataUrl } from '@/export/graphImage';
import { graphFileName, isDrawableGraph, isGraphNewerThanBuild, type SavedGraph } from '@/model/graph';
import { chooseSaveTarget, PNG_FILTERS, revealFile, revealLabel } from '@/platform';
import { diagramSvg } from '@/render/diagram';
import { graphStore } from '@/storage';
import { GraphPanel } from './GraphPanel';
import { graphSaveLabel, type GraphSaveState } from './graphList';
import { UseInWorksheetDialog } from './UseInWorksheetDialog';

/** The autosave's debounce, as for documents. */
const AUTOSAVE_MS = 1200;
/** Edits closer together than this undo as one (typing a name is one step, not ten). */
const UNDO_MERGE_MS = 500;
const UNDO_LIMIT = 100;

type Flash = { text: string; tone: 'ok' | 'error'; action?: { label: string; run: () => void } };

/**
 * One saved graph, drawn on the full page: the diagram canvas as the surface, the graph's
 * settings in its side panel. Autosaves like a document (debounced, flushed on leaving);
 * a graph from a newer build is shown, never written.
 */
export function GraphEditor({
  id,
  onBack,
  settings,
  onUseInWorksheet,
}: {
  id: string;
  onBack: () => void;
  settings?: ReactNode;
  /** Open that worksheet with a copy of the graph added (`questionId` undefined: a new question). */
  onUseInWorksheet?: (graph: SavedGraph, worksheetId: string, questionId?: string) => void;
}) {
  const [graph, setGraph] = useState<SavedGraph | undefined>();
  const [using, setUsing] = useState(false);
  const [missing, setMissing] = useState(false);
  const [saveState, setSaveState] = useState<GraphSaveState>('saved');
  const [flash, setFlash] = useState<Flash | undefined>();
  const graphRef = useRef<SavedGraph | undefined>(undefined);
  const savedRef = useRef<SavedGraph | undefined>(undefined);
  const writing = useRef<Promise<void>>(Promise.resolve());
  const past = useRef<SavedGraph[]>([]);
  const future = useRef<SavedGraph[]>([]);
  const lastPush = useRef(0);
  const flashTimer = useRef<number | undefined>(undefined);

  const readOnly = !!graph && isGraphNewerThanBuild(graph);

  useEffect(() => {
    let live = true;
    void graphStore.load(id).then((loaded) => {
      if (!live) return;
      if (!loaded) setMissing(true);
      graphRef.current = loaded;
      savedRef.current = loaded;
      setGraph(loaded);
      if (loaded && isGraphNewerThanBuild(loaded)) setSaveState('readOnly');
    });
    return () => {
      live = false;
    };
  }, [id]);

  /** Write until what is stored is what is on screen. Rejects when a write fails. */
  const flush = useCallback((): Promise<void> => {
    const run = async () => {
      for (let value = graphRef.current; value && value !== savedRef.current; value = graphRef.current) {
        if (isGraphNewerThanBuild(value)) return;
        setSaveState('saving');
        try {
          await graphStore.save(value);
        } catch (cause) {
          setSaveState('failed');
          throw cause;
        }
        savedRef.current = value;
      }
      setSaveState((state) => (state === 'readOnly' ? state : 'saved'));
    };
    writing.current = writing.current.catch(() => undefined).then(run);
    return writing.current;
  }, []);

  // Debounced autosave on every change.
  useEffect(() => {
    if (!graph || graph === savedRef.current || readOnly) return;
    const timer = window.setTimeout(() => void flush().catch(() => undefined), AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [graph, readOnly, flush]);

  // Unmounted with edits still pending (a reload of the screen above): write them anyway.
  useEffect(
    () => () => {
      const value = graphRef.current;
      if (value && value !== savedRef.current && !isGraphNewerThanBuild(value)) void graphStore.save(value).catch(() => undefined);
    },
    [],
  );

  const commit = useCallback((next: SavedGraph) => {
    graphRef.current = next;
    setGraph(next);
  }, []);

  const update = useCallback(
    (next: SavedGraph) => {
      const current = graphRef.current;
      if (!current || isGraphNewerThanBuild(current)) return;
      const now = Date.now();
      if (now - lastPush.current > UNDO_MERGE_MS) {
        past.current = [...past.current, current].slice(-UNDO_LIMIT);
      }
      lastPush.current = now;
      future.current = [];
      commit({ ...next, updatedAt: new Date().toISOString() });
    },
    [commit],
  );

  // ⌘Z / ⇧⌘Z, unless a field owns the keys.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = undoChord(event);
      if (!action) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return;
      }
      const current = graphRef.current;
      if (!current || isGraphNewerThanBuild(current)) return;
      const from = action === 'undo' ? past : future;
      const to = action === 'undo' ? future : past;
      const target = from.current.at(-1);
      if (!target) return;
      event.preventDefault();
      from.current = from.current.slice(0, -1);
      to.current = [...to.current, current];
      lastPush.current = 0;
      commit({ ...target, updatedAt: new Date().toISOString() });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commit]);

  const show = (next: Flash) => {
    setFlash(next);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(undefined), next.tone === 'error' ? 8000 : 4000);
  };

  const leave = async () => {
    try {
      await flush();
      onBack();
    } catch {
      show({ tone: 'error', text: 'Could not save this graph. Your changes are still here; try again.' });
    }
  };

  // Inside the click: Safari keeps permission only for a write started there.
  const copyImage = () => {
    const current = graphRef.current;
    if (!current) return;
    copyGraphImage(current).then(
      () => show({ tone: 'ok', text: 'Copied. Paste it into Word at its print size.' }),
      () => show({ tone: 'error', text: 'Could not copy the image here. Use Download PNG instead.' }),
    );
  };

  const downloadPng = async () => {
    const current = graphRef.current;
    if (!current) return;
    try {
      // Where first, inside the click: a browser's Save As needs it.
      const target = await chooseSaveTarget(graphFileName(current, 'png'), PNG_FILTERS);
      if (!target) return;
      const saved = await target.write(dataUrlToBlob(await graphPngDataUrl(current)));
      const path = saved.path;
      show({
        tone: 'ok',
        text: `Saved ${saved.name ?? graphFileName(current, 'png')}.`,
        action: path ? { label: revealLabel(), run: () => void revealFile(path).catch(() => undefined) } : undefined,
      });
    } catch {
      show({ tone: 'error', text: 'Could not save the image.' });
    }
  };

  // Saved first, so the worksheet gets what is on screen and leaving loses nothing.
  const placeIn = async (worksheetId: string, questionId?: string) => {
    setUsing(false);
    try {
      await flush();
    } catch {
      show({ tone: 'error', text: 'Could not save this graph. Your changes are still here; try again.' });
      return;
    }
    const current = graphRef.current;
    if (current) onUseInWorksheet?.(current, worksheetId, questionId);
  };

  const label = graphSaveLabel(saveState);

  return (
    <div className="flex h-full min-h-0 flex-col bg-desk">
      <header className="zone-light flex h-12 shrink-0 items-center gap-3 whitespace-nowrap border-b border-line bg-surface px-4 text-ink">
        <button
          type="button"
          onClick={() => void leave()}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-ink-muted transition-colors duration-150 ease-out-soft hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ← Graphs
        </button>
        <h1 className="min-w-0 truncate text-[13.5px] font-semibold text-ink">{graph?.name ?? ''}</h1>
        {graph && (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-[11.5px] text-ink-subtle" title={label.detail}>
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${
                saveState === 'failed'
                  ? 'bg-warn-ink'
                  : saveState === 'saving'
                    ? 'bg-ink-subtle motion-safe:animate-pulse'
                    : saveState === 'readOnly'
                      ? 'bg-ink-subtle'
                      : 'bg-ok'
              }`}
            />
            <span className={saveState === 'failed' ? 'text-warn-ink' : undefined}>{label.word}</span>
          </span>
        )}
        <span className="flex-1" />
        {flash && (
          <span
            role={flash.tone === 'error' ? 'alert' : 'status'}
            className={`flex min-w-0 animate-fade-in items-center gap-2 truncate text-[12px] ${
              flash.tone === 'error' ? 'text-danger-ink' : 'text-ink-muted'
            }`}
          >
            <span className="truncate">{flash.text}</span>
            {flash.action && (
              <button
                type="button"
                onClick={flash.action.run}
                className="shrink-0 cursor-pointer text-accent-ink underline-offset-2 hover:underline"
              >
                {flash.action.label}
              </button>
            )}
          </span>
        )}
        <Button size="sm" disabled={!graph} onClick={copyImage} title="Copy as a picture, sized to print, to paste into Word">
          Copy image
        </Button>
        <Button size="sm" disabled={!graph} onClick={() => void downloadPng()} title="Save a PNG of the graph on white">
          <DownloadIcon size={14} />
          Download PNG
        </Button>
        {onUseInWorksheet && (
          <Button
            size="sm"
            disabled={!graph || readOnly}
            onClick={() => setUsing(true)}
            title={readOnly ? 'Saved by a newer version of Econ Studio. Update to use it in a worksheet.' : 'Add a copy of this graph to a question in one of your worksheets'}
          >
            Use in a worksheet…
          </Button>
        )}
        {settings}
      </header>

      <div className="min-h-0 flex-1">
        {missing ? (
          <div className="zone-light flex h-full items-center justify-center bg-surface">
            <p className="text-[13px] text-ink-muted">This graph is no longer saved here.</p>
          </div>
        ) : !graph ? null : !readOnly && isDrawableGraph(graph.block) ? (
          <DiagramCanvas
            embedded
            block={graph.block}
            language={graph.language}
            fonts={graph.fonts}
            onChange={(block) => update({ ...graphRef.current!, block })}
            panel={<GraphPanel graph={graph} onChange={update} />}
            keysSuspended={using}
          />
        ) : (
          <StaticGraph graph={graph} readOnly={readOnly} onChange={update} />
        )}
      </div>
      {using && graph && (
        <UseInWorksheetDialog graph={graph} onClose={() => setUsing(false)} onUse={(worksheetId, questionId) => void placeIn(worksheetId, questionId)} />
      )}
    </div>
  );
}

/**
 * A graph the canvas cannot edit here: one from a newer build (shown, never written), or a
 * pie, flow or forum figure (edited inside a worksheet).
 */
function StaticGraph({
  graph,
  readOnly,
  onChange,
}: {
  graph: SavedGraph;
  readOnly: boolean;
  onChange: (graph: SavedGraph) => void;
}) {
  const svg = useMemo(
    () =>
      diagramSvg(graph.block.diagram, {
        widthPx: graph.block.widthPx,
        heightPx: graph.block.heightPx,
        language: graph.language,
        fonts: graph.fonts,
      }),
    [graph],
  );
  return (
    <FieldScopeContext.Provider value={{ language: graph.language, readOnly }}>
      <div className="zone-dark flex h-full min-h-0">
        <div className="flex min-w-0 flex-1 items-center justify-center overflow-auto p-8">
          <div
            className="bg-white shadow-2xl"
            style={{ width: graph.block.widthPx * 2, lineHeight: 0 }}
          >
            <span className="block [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          </div>
        </div>
        <aside className="zone-light w-80 shrink-0 overflow-y-auto border-l border-line bg-surface p-4">
          {readOnly ? (
            <p className="text-[12.5px] leading-relaxed text-ink-muted">
              This graph was saved by a newer version of Econ Studio, so it can be copied and downloaded here but not
              changed. Update to edit it.
            </p>
          ) : (
            <>
              <p className="mb-4 border-b border-line pb-4 text-[12.5px] leading-relaxed text-ink-muted">
                This kind of figure is drawn from its data. Edit it in a worksheet.
              </p>
              <GraphPanel graph={graph} onChange={onChange} />
            </>
          )}
        </aside>
      </div>
    </FieldScopeContext.Provider>
  );
}
