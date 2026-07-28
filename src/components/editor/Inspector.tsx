'use client';

import { questionMarks } from '@/model/marks';
import type { NumberingPlan } from '@/model/numbering';
import { plain } from '@/model/text';
import { requireQuestionType } from '@/registry';
import { useWorksheetStore } from '@/store/worksheetStore';
import { IconButton, Pill } from '@/components/ui';
import { CloseIcon, ListIcon, PencilIcon } from '@/components/ui/icons';

/**
 * Inputs for whatever is currently selected.
 *
 * It now owns the full height of the sidebar rather than the bottom half of a split,
 * which is what makes a structured question with several parts scroll as one form
 * instead of through a ~200px porthole.
 */
export function Inspector({
  numbering,
  onShowContent,
}: {
  numbering: NumberingPlan;
  onShowContent: () => void;
}) {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const selectedQuestionId = useWorksheetStore((s) => s.selectedQuestionId);
  const select = useWorksheetStore((s) => s.select);
  const updateQuestion = useWorksheetStore((s) => s.updateQuestion);

  const selected = worksheet.questions.find((question) => question.id === selectedQuestionId);

  if (!selected) {
    // Nothing selected is not an error state — it is the state the app opens in. So
    // this says what to do next in one sentence, rather than reporting the absence.
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-sunken text-ink-subtle">
          <PencilIcon size={22} />
        </span>
        <div>
          <p className="text-[13px] font-medium text-ink">Pick something to edit</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Click a question on the page, or choose one from Content.
          </p>
          <p className="text-xs text-ink-subtle">在頁面或內容清單選擇題目</p>
        </div>
        <button
          type="button"
          onClick={onShowContent}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-accent-ink transition-colors hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ListIcon size={15} />
          Browse content
        </button>
      </div>
    );
  }

  const definition = requireQuestionType(selected);
  const number = numbering.byQuestionId.get(selected.id)?.number;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-3.5 py-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-[12px] font-bold tabular-nums text-on-accent">
          {number ?? '–'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-tight text-ink">
            Question {number ?? '–'}
          </span>
          <span className="block truncate text-[11px] text-ink-muted">
            {plain(definition.displayName.en)}
          </span>
        </span>
        <Pill tone="accent">{questionMarks(selected)}m</Pill>
        <IconButton label="Close editor" onClick={() => select(undefined)}>
          <CloseIcon size={14} />
        </IconButton>
      </header>

      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-3.5">
        <definition.EditorPanel
          key={selected.id}
          question={selected}
          onChange={(patch) => updateQuestion(selected.id, patch)}
        />
      </div>
    </div>
  );
}
