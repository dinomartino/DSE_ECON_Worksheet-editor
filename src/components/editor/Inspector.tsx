'use client';

import { useLayoutEffect, useRef } from 'react';
import { questionMarks } from '@/model/marks';
import type { NumberingPlan } from '@/model/numbering';
import { plain } from '@/model/text';
import { requireQuestionType } from '@/registry';
import { useWorksheetStore } from '@/store/worksheetStore';
import { IconButton } from '@/components/ui';
import { CloseIcon, ListIcon } from '@/components/ui/icons';
import { StimulusEditorPanel } from './StimulusEditorPanel';

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
  const selectedElementId = useWorksheetStore((s) => s.selectedElementId);
  const select = useWorksheetStore((s) => s.select);
  const selectElement = useWorksheetStore((s) => s.selectElement);
  const updateQuestion = useWorksheetStore((s) => s.updateQuestion);
  const updateLayoutElement = useWorksheetStore((s) => s.updateLayoutElement);

  const selected = worksheet.questions.find((question) => question.id === selectedQuestionId);

  /*
   * Bring the control for the page's selection into view.
   *
   * Clicking option C on the paper now selects the question too (§ Preview
   * `selectOwnerOf`), which opens this panel — but on a long question the matching
   * field can be well below the fold, so the panel appeared to respond by showing
   * something else. The page publishes an `editTargetKey`; each control carries the
   * same key as `data-edit-target`; this finds it and scrolls.
   *
   * `block: 'nearest'` and nothing else: a control already on screen must not be
   * yanked to the middle, because the common case is a teacher clicking around one
   * question whose fields are all visible — moving the panel under them each time
   * would be motion sickness in exchange for nothing. The same reason `Outline` uses
   * `nearest` for its own row.
   *
   * A layout effect, so the scroll happens in the same frame the panel mounts rather
   * than after a visible paint at the top. Keyed on the panel's own subject as well as
   * the target: selecting a *different* question remounts the panel (`key`), and an
   * effect that only watched the key would run against the outgoing DOM.
   */
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedTargetKey = useWorksheetStore((s) => s.selectedTargetKey);
  useLayoutEffect(() => {
    if (!selectedTargetKey) return;
    panelRef.current
      ?.querySelector(`[data-edit-target="${CSS.escape(selectedTargetKey)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedTargetKey, selectedQuestionId, selectedElementId]);

  // The one layout element with a panel of its own. A question wins when both are
  // somehow set — the page clears one selection as it makes the other, so this is a
  // tie-break, not a state.
  const selectedStimulus = !selected
    ? worksheet.layout.find(
        (element) => element.id === selectedElementId && element.kind === 'stimulus',
      )
    : undefined;

  if (selectedStimulus && selectedStimulus.kind === 'stimulus') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-line px-3.5 py-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-tight text-ink">
              Shared stimulus
            </span>
            <span className="block truncate text-[11px] text-ink-muted">
              content the questions below refer to
            </span>
          </span>
          <IconButton label="Close editor" onClick={() => selectElement(undefined)}>
            <CloseIcon size={14} />
          </IconButton>
        </header>

        <div ref={panelRef} className="scroll-slim min-h-0 flex-1 overflow-y-auto p-3.5">
          <StimulusEditorPanel
            key={selectedStimulus.id}
            element={selectedStimulus}
            onChange={(patch) => updateLayoutElement(selectedStimulus.id, patch)}
          />
        </div>
      </div>
    );
  }

  if (!selected) {
    // Nothing selected is not an error state — it is the state the app opens in. So
    // this says what to do next in one sentence, rather than reporting the absence.
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <div>
          <p className="font-display text-[19px] text-ink">Pick something to edit.</p>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
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
      {/* No number chip, no marks pill: the title carries the number, the facts sit
          as one muted line — the same de-chipped voice as the outline rows. */}
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-3.5 py-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-tight text-ink">
            Question {number ?? '–'}
          </span>
          <span className="block truncate text-[11px] text-ink-muted">
            {plain(definition.displayName.en)} · {questionMarks(selected)} marks
          </span>
        </span>
        <IconButton label="Close editor" onClick={() => select(undefined)}>
          <CloseIcon size={14} />
        </IconButton>
      </header>

      <div ref={panelRef} className="scroll-slim min-h-0 flex-1 overflow-y-auto p-3.5">
        <definition.EditorPanel
          key={selected.id}
          question={selected}
          onChange={(patch) => updateQuestion(selected.id, patch)}
        />
      </div>
    </div>
  );
}
