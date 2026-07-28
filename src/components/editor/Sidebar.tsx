'use client';

import { useEffect, useRef, useState } from 'react';
import { computeNumbering } from '@/model/numbering';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Pill } from '@/components/ui';
import { ListIcon, PencilIcon } from '@/components/ui/icons';
import { Inspector } from './Inspector';
import type { PageComposition } from '@/components/preview/pagination';
import { Outline } from './Outline';

/**
 * The right sidebar — one panel that shows **one thing at a time**.
 *
 * It used to stack four regions in a 400px column: two collapsed settings accordions,
 * the question outline, a draggable divider, and the inspector. That asked the user to
 * understand the whole panel before using any of it, and it made both halves of the
 * real work permanently half-height — the question editor was clipped mid-form while a
 * three-question outline sat above it with room to spare. The divider was the tell: a
 * control whose only job is to referee a fight between two panels that should not have
 * been sharing the space.
 *
 * Now there are two tabs. **Content** is the outline — the structure of the document.
 * **Edit** is whatever is selected. Each gets the full height of the column, so a long
 * question list scrolls as a list and a long form scrolls as a form. The once-per-document
 * settings moved out entirely, into the toolbar's `DocumentSettings` dialog.
 *
 * The tab follows the selection rather than waiting to be clicked: selecting a question
 * — on the page or in the outline — switches to Edit, because selecting something *is*
 * the request to edit it. Closing the editor returns to Content. That keeps the two-tab
 * structure from becoming one more thing to operate, which was the original complaint.
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
  const numbering = computeNumbering(worksheet);

  const [tab, setTab] = useState<Tab>('content');

  // Follow the selection. Tracked against the previous id rather than firing on every
  // render, so a user who deliberately clicks back to Content while a question is still
  // selected is not yanked to Edit again on the next keystroke.
  const lastSelection = useRef(selectedQuestionId);
  useEffect(() => {
    if (selectedQuestionId === lastSelection.current) return;
    lastSelection.current = selectedQuestionId;
    setTab(selectedQuestionId ? 'edit' : 'content');
  }, [selectedQuestionId]);

  const selected = worksheet.questions.find((question) => question.id === selectedQuestionId);

  const totalQuestions = worksheet.questions.length;

  const editLabel = selected
    ? `Question ${numbering.byQuestionId.get(selected.id)?.number ?? ''}`.trim()
    : 'Edit';

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; badge?: React.ReactNode }> = [
    {
      id: 'content',
      label: 'Content',
      icon: <ListIcon size={15} />,
      badge: <Pill>{totalQuestions}</Pill>,
    },
    {
      id: 'edit',
      label: editLabel,
      icon: <PencilIcon size={15} />,
    },
  ];

  return (
    <aside className="flex h-full min-h-0 w-[400px] shrink-0 flex-col overflow-hidden border-l border-line bg-surface">
      {/* Two tabs, sized like real targets. The old regions were separated by 10px
          uppercase eyebrows, which read as decoration rather than as the switch between
          two modes that they effectively were. */}
      <div role="tablist" aria-label="Sidebar" className="flex shrink-0 gap-1 border-b border-line px-2 pt-2">
        {tabs.map((entry) => {
          const active = tab === entry.id;
          const dim = entry.id === 'edit' && !selected;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(entry.id)}
              className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                active
                  ? 'border-accent text-ink'
                  : 'border-transparent text-ink-muted hover:bg-surface-hover hover:text-ink'
              } ${dim && !active ? 'opacity-60' : ''}`}
            >
              <span className={active ? 'text-accent' : 'text-ink-subtle'}>{entry.icon}</span>
              <span className="truncate">{entry.label}</span>
              {entry.badge}
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
