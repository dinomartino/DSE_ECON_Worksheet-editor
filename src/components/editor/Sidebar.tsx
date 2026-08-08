'use client';

import { useEffect, useRef, useState } from 'react';
import { computeNumbering } from '@/model/numbering';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Inspector } from './Inspector';
import type { PageComposition } from '@/components/preview/pagination';
import { Outline } from './Outline';

/**
 * The right sidebar: one panel, one thing at a time. **Content** is the outline,
 * **Edit** is the selection; each gets the full column height. Once-per-document
 * settings live in `DocumentSettings`. The tab follows the selection — selecting a
 * question *is* the request to edit it; closing the editor returns to Content.
 */

type Tab = 'content' | 'edit';

export function Sidebar({
  pages,
  onOpenSettings,
}: {
  /**
   * How the flow landed on sheets, from the paginator. Passed through rather than read
   * from the store because a page is *measured*, not modelled — it is transient view
   * state, and putting it in the undo-tracked document would make repagination an edit.
   */
  pages: PageComposition[];
  onOpenSettings: () => void;
}) {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const selectedQuestionId = useWorksheetStore((s) => s.selectedQuestionId);
  const selectedElementId = useWorksheetStore((s) => s.selectedElementId);
  const numbering = computeNumbering(worksheet);

  const [tab, setTab] = useState<Tab>('content');

  // A layout element only pulls the tab over when it has a panel to show — selecting
  // a divider must not open an Edit tab that says "pick something".
  const panelElementId = worksheet.layout.find(
    (element) => element.id === selectedElementId && element.kind === 'stimulus',
  )?.id;

  // Follow the selection. Tracked against the previous id rather than firing on every
  // render, so a user who deliberately clicks back to Content while a question is still
  // selected is not yanked to Edit again on the next keystroke.
  const selectionKey = selectedQuestionId ?? panelElementId;
  const lastSelection = useRef(selectionKey);
  useEffect(() => {
    if (selectionKey === lastSelection.current) return;
    lastSelection.current = selectionKey;
    setTab(selectionKey ? 'edit' : 'content');
  }, [selectionKey]);

  const selected = worksheet.questions.find((question) => question.id === selectedQuestionId);

  const totalQuestions = worksheet.questions.length;

  const editLabel = selected
    ? `Question ${numbering.byQuestionId.get(selected.id)?.number ?? ''}`.trim()
    : panelElementId
      ? 'Shared stimulus'
      : 'Edit';

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: 'content', label: 'Content', count: totalQuestions },
    { id: 'edit', label: editLabel },
  ];

  return (
    <aside className="flex h-full min-h-0 w-[400px] shrink-0 flex-col overflow-hidden border-l border-line bg-surface">
      {/* Two tabs in the toolbar's own dialect: words with a short accent underline
          naming the active one — no icons, no count chip, one control language. */}
      <div role="tablist" aria-label="Sidebar" className="flex shrink-0 border-b border-line px-2">
        {tabs.map((entry) => {
          const active = tab === entry.id;
          const dim = entry.id === 'edit' && !selected && !panelElementId;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(entry.id)}
              className={`relative flex flex-1 cursor-pointer items-center justify-center gap-1 px-3 py-2.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                active ? 'text-ink' : 'text-ink-muted hover:text-ink'
              } ${dim && !active ? 'opacity-60' : ''}`}
            >
              <span className="truncate">{entry.label}</span>
              {entry.count !== undefined && (
                <span className="text-[11px] tabular-nums text-ink-subtle">{entry.count}</span>
              )}
              <span
                aria-hidden
                className={`absolute inset-x-4 bottom-0 h-0.5 rounded-full ${
                  active ? 'bg-accent' : 'bg-transparent'
                }`}
              />
            </button>
          );
        })}
      </div>

      {/* One region, full height. Both panels are mounted-on-demand rather than hidden,
          so the outline's scroll position is not silently preserved against a document
          that changed underneath it while the editor was showing. */}
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === 'content' ? (
          <Outline numbering={numbering} pages={pages} onOpenSettings={onOpenSettings} />
        ) : (
          <Inspector numbering={numbering} onShowContent={() => setTab('content')} />
        )}
      </div>
    </aside>
  );
}
