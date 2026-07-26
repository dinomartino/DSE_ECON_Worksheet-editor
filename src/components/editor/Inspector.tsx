'use client';

import { questionMarks } from '@/model/marks';
import type { NumberingPlan } from '@/model/numbering';
import { plain } from '@/model/text';
import { requireQuestionType } from '@/registry';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Eyebrow, IconButton, Pill } from '@/components/ui';
import { CloseIcon } from '@/components/ui/icons';

/**
 * Inputs for whatever is currently selected.
 *
 * Visually separated from the outline above it: a distinct surface, a sticky header
 * naming what is being edited, and its own scroll context — previously the two
 * regions shared one white background and one hairline, which is what made the
 * sidebar hard to read as two different things.
 */
export function Inspector({ numbering }: { numbering: NumberingPlan }) {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const selectedQuestionId = useWorksheetStore((s) => s.selectedQuestionId);
  const select = useWorksheetStore((s) => s.select);
  const updateQuestion = useWorksheetStore((s) => s.updateQuestion);

  const selected = worksheet.sections
    .flatMap((section) => section.questions)
    .find((question) => question.id === selectedQuestionId);

  if (!selected) {
    // The old version was a centred paragraph in an otherwise empty half-panel — the
    // largest expanse of nothing on screen, spent telling the user that nothing was
    // selected. It now shows the shortcuts that are true whether or not something is
    // selected, so the space at least teaches the tool.
    return (
      <div className="scroll-slim flex min-h-0 flex-1 flex-col overflow-y-auto border-t border-line bg-surface-sunken p-4">
        <p className="text-xs font-medium text-ink-muted">Nothing selected</p>
        <p className="mt-0.5 text-[11px] text-ink-subtle">
          Click a question on the page or in the list above to edit it.
        </p>
        <p className="text-[11px] text-ink-subtle">在預覽或上方列表選擇題目</p>

        <dl className="mt-4 space-y-1">
          {[
            ['Add content', 'Rail on the left'],
            ['Edit text', 'Click it twice'],
            ['Reorder', 'Drag the grip'],
            ['Undo', '⌘Z'],
          ].map(([term, hint]) => (
            <div
              key={term}
              className="flex items-center justify-between gap-3 rounded-lg bg-surface px-2.5 py-1.5 ring-1 ring-inset ring-line"
            >
              <dt className="text-[11px] text-ink-muted">{term}</dt>
              <dd className="shrink-0 text-[10px] font-medium text-ink-subtle">{hint}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  const definition = requireQuestionType(selected);
  const number = numbering.byQuestionId.get(selected.id)?.number;

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-line bg-surface-sunken">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface-sunken/95 px-3 py-2.5 backdrop-blur">
        <Eyebrow>Editing</Eyebrow>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">
          Question {number ?? '–'}
          <span className="ml-1.5 font-normal text-ink-muted">
            {plain(definition.displayName.en)}
          </span>
        </span>
        <Pill tone="accent">{questionMarks(selected)}m</Pill>
        <IconButton label="Close editor" onClick={() => select(undefined)}>
          <CloseIcon size={14} />
        </IconButton>
      </header>

      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-3">
        <definition.EditorPanel
          key={selected.id}
          question={selected}
          onChange={(patch) => updateQuestion(selected.id, patch)}
        />
      </div>
    </div>
  );
}
