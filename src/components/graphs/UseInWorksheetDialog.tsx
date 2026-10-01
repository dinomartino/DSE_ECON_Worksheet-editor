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
import { useMessages } from '@/i18n/language';
import { GRAPH_USE_MESSAGES } from './messages';

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
  const m = useMessages(GRAPH_USE_MESSAGES);
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
      setError(m.gone(summary.title));
      return;
    }
    if (isNewerThanBuild(loaded)) {
      setError(m.newer(summary.title));
      return;
    }
    setWorksheet(loaded);
  };

  return (
    <Dialog
      title={worksheet ? m.whereTitle : m.title}
      description={
        worksheet
          ? m.whereDescription
          : m.description(graph.name)
      }
      width={560}
      height={600}
      scrollBody={false}
      onClose={onClose}
      footer={
        <>
          {worksheet && (
            <Button variant="subtle" className="mr-auto" onClick={() => setWorksheet(undefined)}>
              {m.worksheets}
            </Button>
          )}
          <Button variant="subtle" onClick={onClose}>
            {m.cancel}
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
                <span className="w-32 shrink-0 truncate text-[12.5px] font-medium text-accent-ink">{m.newQuestion}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-muted">{m.newQuestionHint}</span>
              </button>
            </li>
            {choices.map((choice) => (
              <li key={choice.id}>
                <button type="button" className={ROW} onClick={() => onUse(worksheet.id, choice.id)}>
                  <span className="w-32 shrink-0 truncate text-[12.5px] font-medium tabular-nums text-ink">{choice.label}</span>
                  <span className={`min-w-0 flex-1 truncate text-[12.5px] ${choice.excerpt ? 'text-ink-muted' : 'italic text-ink-subtle'}`}>
                    {choice.excerpt || m.noText}
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
              <span className="sr-only">{m.searchWorksheets}</span>
              <input
                type="search"
                autoFocus
                value={search}
                placeholder={m.searchWorksheets}
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
              <p className="px-3 py-8 text-center text-[13px] text-ink-muted">{m.noWorksheets}</p>
            ) : shown.length === 0 ? (
              <p className="px-3 py-8 text-center text-[13px] text-ink-muted">{m.noMatch}</p>
            ) : (
              <ul className="space-y-0.5">
                {shown.map((summary) => (
                  <li key={summary.id}>
                    <button type="button" className={ROW} onClick={() => void pick(summary)}>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{summary.title}</span>
                      <span className="shrink-0 text-[11.5px] tabular-nums text-ink-subtle">
                        {summary.questionCount !== undefined &&
                          `${m.questionCount(summary.questionCount)} · `}
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
