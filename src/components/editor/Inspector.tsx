'use client';

import { useLayoutEffect, useRef } from 'react';
import { editTargetKey } from '@/model/edits';
import { LAYOUT_NAME, MIN_ANSWER_LINES, MIN_SPACER_PT } from '@/model/flow';
import { newId } from '@/model/factories';
import { questionMarks } from '@/model/marks';
import type { NumberingPlan } from '@/model/numbering';
import { emptyBiText, plain } from '@/model/text';
import type { LayoutElement } from '@/model/types';
import { requireQuestionType } from '@/registry';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Button, CheckField, GroupHeader, IconButton, Pill } from '@/components/ui';
import { CloseIcon, ListIcon } from '@/components/ui/icons';
import { SizeStepper } from '@/components/ui/SizeStepper';
import { biExcerpt, ExcerptRow } from './panelRows';
import { StimulusEditorPanel } from './StimulusEditorPanel';

/**
 * Inputs for whatever is currently selected.
 *
 * Every selectable thing shows *something* here — a question its properties, a layout
 * element at least its name and its verbs — so the panel's contract is learnable:
 * whatever you select, this describes it. A selection that dead-ended on "pick
 * something to edit" taught that the panel was broken, one kind at a time.
 */

/** One line under the element's name, saying what the kind is. */
const LAYOUT_HINT: Record<LayoutElement['kind'], string> = {
  section: 'names the run of questions below it',
  stimulus: 'content the questions below refer to',
  heading: 'a display line — typed on the page',
  text: 'a note or closing line — typed on the page',
  partHeader: 'part heading with a derived marks total',
  questionCount: 'authored wording around the derived count',
  labelList: 'side-by-side label · value rows',
  answerLines: 'ruled lines for written answers',
  answerSpace: 'dotted lines for written answers',
  spacer: 'blank vertical space',
  divider: 'a horizontal rule',
  pageBreak: 'starts a new sheet',
};

/** The kinds whose printed words live on the page, shown here as an address row. */
function textRowFor(element: LayoutElement) {
  if (
    element.kind !== 'section' &&
    element.kind !== 'heading' &&
    element.kind !== 'text' &&
    element.kind !== 'partHeader' &&
    element.kind !== 'questionCount'
  ) {
    return null;
  }
  const text =
    'text' in element ? biExcerpt(element.text) : '';
  return (
    <ExcerptRow
      text={text}
      targetKey={editTargetKey({ kind: 'layoutText', elementId: element.id })}
    />
  );
}

function LayoutElementPanel({ element }: { element: LayoutElement }) {
  const updateLayoutElement = useWorksheetStore((s) => s.updateLayoutElement);
  const resizeLayoutElement = useWorksheetStore((s) => s.resizeLayoutElement);
  const removeLayoutElement = useWorksheetStore((s) => s.removeLayoutElement);
  const selectElement = useWorksheetStore((s) => s.selectElement);

  return (
    <div className="space-y-4">
      {textRowFor(element)}

      {element.kind === 'section' && (
        <div className="space-y-2">
          <CheckField
            label="Restart numbering at 1"
            checked={Boolean(element.restartNumbering)}
            onChange={(restartNumbering) =>
              updateLayoutElement(element.id, { restartNumbering })
            }
          />
          <CheckField
            label="Show the section's marks total"
            checked={Boolean(element.showMarks)}
            onChange={(showMarks) => updateLayoutElement(element.id, { showMarks })}
          />
        </div>
      )}

      {(element.kind === 'answerLines' || element.kind === 'answerSpace') &&
        (element.kind === 'answerSpace' && element.fill ? (
          <div className="space-y-2">
            <Pill>fills page</Pill>
            <p className="text-xs leading-relaxed text-ink-muted">
              This space stretches to the bottom of its page, so the line count is set
              by the layout — currently {element.lines} lines.
            </p>
            <p className="text-xs text-ink-subtle">此答題空間自動填滿頁面。</p>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink">Lines</p>
              <p className="text-[11px] text-ink-subtle">行數</p>
            </div>
            <span className="flex shrink-0 items-center">
              <SizeStepper
                value={element.lines}
                min={MIN_ANSWER_LINES}
                step={1}
                unit={element.lines === 1 ? 'line' : 'lines'}
                label={
                  element.kind === 'answerSpace' ? 'Answer space lines' : 'Answer lines'
                }
                onCommit={(lines) => resizeLayoutElement(element.id, lines)}
              />
            </span>
          </div>
        ))}

      {element.kind === 'spacer' && (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink">Height</p>
            <p className="text-[11px] text-ink-subtle">留白高度</p>
          </div>
          <span className="flex shrink-0 items-center">
            <SizeStepper
              value={element.heightPt}
              min={MIN_SPACER_PT}
              step={6}
              unit="pt"
              label="Blank space height"
              onCommit={(heightPt) => resizeLayoutElement(element.id, heightPt)}
            />
          </span>
        </div>
      )}

      {element.kind === 'labelList' && (
        <div className="space-y-1">
          <GroupHeader
            title="Rows"
            hint="typed on the page"
            action={
              <Button
                size="sm"
                variant="subtle"
                onClick={() =>
                  updateLayoutElement(element.id, {
                    rows: [
                      ...element.rows,
                      { id: newId(), label: emptyBiText(), value: emptyBiText() },
                    ],
                  })
                }
              >
                + Row
              </Button>
            }
          />
          {element.rows.map((row) => (
            <ExcerptRow
              key={row.id}
              text={[biExcerpt(row.label), biExcerpt(row.value)]
                .filter(Boolean)
                .join(' — ')}
              targetKey={editTargetKey({
                kind: 'labelListCell',
                elementId: element.id,
                rowId: row.id,
                column: 'label',
              })}
              actions={
                <IconButton
                  label="Remove row"
                  variant="danger"
                  disabled={element.rows.length <= 1}
                  onClick={() =>
                    updateLayoutElement(element.id, {
                      rows: element.rows.filter((entry) => entry.id !== row.id),
                    })
                  }
                >
                  <span aria-hidden>✕</span>
                </IconButton>
              }
            />
          ))}
        </div>
      )}

      {(element.kind === 'divider' || element.kind === 'pageBreak') && (
        <p className="text-xs leading-relaxed text-ink-muted">
          {element.kind === 'divider'
            ? 'A rule across the text column. It has no settings — drag it on the page or in Content to move it.'
            : 'Everything after this starts on a new sheet. Drag it to move the break.'}
        </p>
      )}

      <div className="border-t border-line pt-3">
        <Button
          size="sm"
          variant="danger"
          onClick={() => {
            removeLayoutElement(element.id);
            selectElement(undefined);
          }}
        >
          Delete {LAYOUT_NAME[element.kind].toLowerCase()}
        </Button>
      </div>
    </div>
  );
}

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

  // A question wins when both are somehow set — the page clears one selection as it
  // makes the other, so this is a tie-break, not a state.
  const selectedLayout = !selected
    ? worksheet.layout.find((element) => element.id === selectedElementId)
    : undefined;

  if (selectedLayout) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-line px-3.5 py-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-tight text-ink">
              {selectedLayout.kind === 'stimulus'
                ? 'Shared stimulus'
                : LAYOUT_NAME[selectedLayout.kind]}
            </span>
            <span className="block truncate text-[11px] text-ink-muted">
              {LAYOUT_HINT[selectedLayout.kind]}
            </span>
          </span>
          <IconButton label="Close editor" onClick={() => selectElement(undefined)}>
            <CloseIcon size={14} />
          </IconButton>
        </header>

        <div ref={panelRef} className="scroll-slim min-h-0 flex-1 overflow-y-auto p-3.5">
          {selectedLayout.kind === 'stimulus' ? (
            <StimulusEditorPanel
              key={selectedLayout.id}
              element={selectedLayout}
              onChange={(patch) => updateLayoutElement(selectedLayout.id, patch)}
            />
          ) : (
            <LayoutElementPanel key={selectedLayout.id} element={selectedLayout} />
          )}
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
          className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-accent-ink transition-[background-color,color,transform,scale] duration-150 ease-out-soft hover:bg-accent-soft active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
