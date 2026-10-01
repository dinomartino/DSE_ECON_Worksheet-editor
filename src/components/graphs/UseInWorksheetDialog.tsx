'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { relativeTime } from '@/components/start/dashboard';
import type { SavedGraph } from '@/model/graph';
import { isNewerThanBuild } from '@/model/migrations';
import type { Worksheet } from '@/model/types';
import { worksheetStore } from '@/storage';
import { worksheetTitle } from '@/storage/document';
import type { WorksheetSummary } from '@/storage/types';
import { questionChoices, searchSummaries } from './graphList';

const ROW =
  'flex w-full cursor-pointer items-baseline gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-150 ease-out-soft hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

/**
 * "Use in a worksheet…": pick a saved worksheet, then a question in it or a new one at the
 * end. The caller opens the worksheet and appends a copy of the graph. A worksheet from a
 * newer build is refused here, before anything opens.
 */
export function UseInWorksheetDialog({
  graph,
  onClose,
  onUse,
}: {
  graph: SavedGraph;
  onClose: () => void;
  /** `questionId` undefined: a new question at the end. */
  onUse: (worksheetId: string, questionId?: string) => void;
}) {
  const [summaries, setSummaries] = useState<WorksheetSummary[] | undefined>();
  const [search, setSearch] = useState('');
  const [worksheet, setWorksheet] = useState<Worksheet | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let live = true;
    void worksheetStore.list().then(
      (list) => live && setSummaries(list),
      () => live && setSummaries([]),
    );
    return () => {
      live = false;
    };
  }, []);

  const shown = useMemo(() => searchSummaries(summaries ?? [], search), [summaries, search]);
  const choices = useMemo(() => (worksheet ? questionChoices(worksheet, graph.language) : []), [worksheet, graph.language]);

  const pick = async (summary: WorksheetSummary) => {
    setError(undefined);
    const loaded = await worksheetStore.load(summary.id).catch(() => undefined);
    if (!loaded) {
      setError(`“${summary.title}” is no longer saved here.`);
      return;
    }
    if (isNewerThanBuild(loaded)) {
      setError(`“${summary.title}” was saved by a newer version of Econ Studio, so it cannot be changed here. Update to add a graph to it.`);
      return;
    }
    setWorksheet(loaded);
  };

  return (
    <Dialog
      title={worksheet ? 'Where should the graph go?' : 'Use in a worksheet'}
      description={
        worksheet
          ? 'A copy is added at the end of the question. Later changes to the saved graph do not change it.'
          : `Add a copy of “${graph.name}” to one of your worksheets.`
      }
      width={560}
      height={600}
      scrollBody={false}
      onClose={onClose}
      footer={
        <>
          {worksheet && (
            <Button variant="subtle" className="mr-auto" onClick={() => setWorksheet(undefined)}>
              ← Worksheets
            </Button>
          )}
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      {worksheet ? (
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-3 py-3" data-use-step="question">
          <p className="truncate px-3 pb-2 text-[12px] font-medium text-ink-muted">{worksheetTitle(worksheet)}</p>
          <ul className="space-y-0.5">
            <li>
              <button type="button" className={ROW} onClick={() => onUse(worksheet.id)}>
                <span className="w-32 shrink-0 truncate text-[12.5px] font-medium text-accent-ink">+ New question</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-muted">As a new question at the end</span>
              </button>
            </li>
            {choices.map((choice) => (
              <li key={choice.id}>
                <button type="button" className={ROW} onClick={() => onUse(worksheet.id, choice.id)}>
                  <span className="w-32 shrink-0 truncate text-[12.5px] font-medium tabular-nums text-ink">{choice.label}</span>
                  <span className={`min-w-0 flex-1 truncate text-[12.5px] ${choice.excerpt ? 'text-ink-muted' : 'italic text-ink-subtle'}`}>
                    {choice.excerpt || 'No text yet'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col" data-use-step="worksheet">
          <div className="shrink-0 px-5 pb-2 pt-4">
            <label className="block">
              <span className="sr-only">Search worksheets by name</span>
              <input
                type="search"
                autoFocus
                value={search}
                placeholder="Search worksheets by name"
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && search) {
                    event.stopPropagation();
                    setSearch('');
                  }
                }}
                className="h-8 w-full rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink outline-none transition-colors duration-150 ease-out-soft placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
            </label>
            {error && (
              <p role="alert" className="mt-2 animate-slide-down-in rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs text-danger-ink">
                {error}
              </p>
            )}
          </div>
          <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {summaries === undefined ? null : summaries.length === 0 ? (
              <p className="px-3 py-8 text-center text-[13px] text-ink-muted">No worksheets saved yet. Start one from Home.</p>
            ) : shown.length === 0 ? (
              <p className="px-3 py-8 text-center text-[13px] text-ink-muted">No worksheet is named like that.</p>
            ) : (
              <ul className="space-y-0.5">
                {shown.map((summary) => (
                  <li key={summary.id}>
                    <button type="button" className={ROW} onClick={() => void pick(summary)}>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{summary.title}</span>
                      <span className="shrink-0 text-[11.5px] tabular-nums text-ink-subtle">
                        {summary.questionCount !== undefined &&
                          `${summary.questionCount} ${summary.questionCount === 1 ? 'question' : 'questions'} · `}
                        {relativeTime(summary.updatedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
