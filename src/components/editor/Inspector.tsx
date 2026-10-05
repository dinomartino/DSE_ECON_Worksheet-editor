'use client';

import { useLayoutEffect, useRef } from 'react';
import { editTargetKey } from '@/model/edits';
import { MIN_ANSWER_LINES, MIN_SPACER_PT } from '@/model/flow';
import { newId } from '@/model/factories';
import { questionMarks, sectionRuns } from '@/model/marks';
import type { NumberingPlan } from '@/model/numbering';
import { emptyBiText, plain } from '@/model/text';
import type { LayoutElement } from '@/model/types';
import { requireQuestionType } from '@/registry';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Button, CheckField, GroupHeader, IconButton, NumberField, Pill, SelectField } from '@/components/ui';
import { CloseIcon, ListIcon } from '@/components/ui/icons';
import { SizeStepper } from '@/components/ui/SizeStepper';
import { biExcerpt, ExcerptRow } from './panelRows';
import { TopicRow } from './TopicRow';
import { PartTopics } from './PartTopics';
import { useShownTags, useShownTagState } from './sharedTopics';
import { setQuestionTags, setQuestionTopics, topicSyncDeps } from './topicSync';
import { StimulusEditorPanel } from './StimulusEditorPanel';
import { markPanelTarget } from './panelTarget';
import { useMessages, useUiLanguage } from '@/i18n/language';
import type { Messages, TextKey } from '@/i18n/catalogue';
import { INSPECTOR_MESSAGES } from './Inspector.messages';

type M = Messages<typeof INSPECTOR_MESSAGES>;
type Key = TextKey<typeof INSPECTOR_MESSAGES>;

/**
 * Inputs for whatever is currently selected.
 *
 * Every selectable thing shows *something* here — a question its properties, a layout
 * element at least its name and its verbs — so the panel's contract is learnable:
 * whatever you select, this describes it. A selection that dead-ended on "pick
 * something to edit" taught that the panel was broken, one kind at a time.
 */

/** One line under the element's name, saying what the kind is. */
const LAYOUT_HINT: Record<LayoutElement['kind'], Key> = {
  section: 'hintSection',
  stimulus: 'hintStimulus',
  heading: 'hintHeading',
  text: 'hintText',
  partHeader: 'hintPartHeader',
  questionCount: 'hintQuestionCount',
  labelList: 'hintLabelList',
  answerLines: 'hintAnswerLines',
  answerSpace: 'hintAnswerSpace',
  spacer: 'hintSpacer',
  divider: 'hintDivider',
  pageBreak: 'hintPageBreak',
};

/** `LAYOUT_NAME` (`model/flow.ts`) in the interface language. */
const LAYOUT_NAME_KEY: Record<LayoutElement['kind'], Key> = {
  section: 'nameSection',
  heading: 'nameHeading',
  text: 'nameText',
  spacer: 'nameSpacer',
  divider: 'nameDivider',
  pageBreak: 'namePageBreak',
  answerLines: 'nameAnswerLines',
  answerSpace: 'nameAnswerSpace',
  partHeader: 'namePartHeader',
  labelList: 'nameLabelList',
  questionCount: 'nameQuestionCount',
  stimulus: 'nameStimulus',
};

/** The kinds whose printed words live on the page, shown here as an address row. */
function textRowFor(element: LayoutElement, m: M) {
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
      // The panel's one text row, with no group header to say where it is typed.
      emptyHint={m.emptyType}
      targetKey={editTargetKey({ kind: 'layoutText', elementId: element.id })}
    />
  );
}

/**
 * "Answer any n" and the section's marks target. Both are paper-check facts: the totals
 * count the best n questions; the printed instruction stays the teacher's own text.
 */
function SectionChoiceFields({ element }: { element: Extract<LayoutElement, { kind: 'section' }> }) {
  const m = useMessages(INSPECTOR_MESSAGES);
  const updateLayoutElement = useWorksheetStore((s) => s.updateLayoutElement);
  const questions = useWorksheetStore(
    (s) => sectionRuns(s.worksheet).find((run) => run.sectionId === element.id)?.questions.length ?? 0,
  );
  const stored = element.answerCount;
  const choices = Array.from({ length: Math.max(0, questions - 1) }, (_, index) => index + 1);
  // A stored count the section no longer exceeds stays listed, so it can be cleared.
  if (stored !== undefined && stored >= 1 && !choices.includes(stored)) choices.push(stored);
  return (
    <div className="space-y-2">
      {choices.length > 0 && (
        <SelectField<number>
          label={m.answerCount}
          value={stored ?? 0}
          options={[
            { value: 0, label: m.answerAll },
            ...choices.map((n) => ({ value: n, label: m.answerAny(n, questions) })),
          ]}
          onChange={(n) => updateLayoutElement(element.id, { answerCount: n === 0 ? undefined : n })}
        />
      )}
      {stored !== undefined && <p className="text-[11px] leading-relaxed text-ink-muted">{m.answerCountHint}</p>}
      <NumberField
        clearable
        label={m.sectionTarget}
        value={element.targetMarks}
        placeholder="–"
        onChange={(targetMarks) =>
          updateLayoutElement(element.id, { targetMarks: targetMarks ? targetMarks : undefined })
        }
      />
    </div>
  );
}

function LayoutElementPanel({ element }: { element: LayoutElement }) {
  const m = useMessages(INSPECTOR_MESSAGES);
  const showZhNotes = useUiLanguage() !== 'zh-HK';
  const updateLayoutElement = useWorksheetStore((s) => s.updateLayoutElement);
  const resizeLayoutElement = useWorksheetStore((s) => s.resizeLayoutElement);
  const removeLayoutElement = useWorksheetStore((s) => s.removeLayoutElement);
  const selectElement = useWorksheetStore((s) => s.selectElement);

  return (
    <div className="space-y-4">
      {textRowFor(element, m)}

      {element.kind === 'section' && (
        <div className="space-y-2">
          <CheckField
            label={m.restartNumbering}
            checked={Boolean(element.restartNumbering)}
            onChange={(restartNumbering) =>
              updateLayoutElement(element.id, { restartNumbering })
            }
          />
          <CheckField
            label={m.showSectionMarks}
            checked={Boolean(element.showMarks)}
            onChange={(showMarks) => updateLayoutElement(element.id, { showMarks })}
          />
          <SectionChoiceFields element={element} />
        </div>
      )}

      {(element.kind === 'answerLines' || element.kind === 'answerSpace') &&
        (element.kind === 'answerSpace' && element.fill ? (
          <div className="space-y-2">
            <Pill>{m.fillsPage}</Pill>
            <p className="text-xs leading-relaxed text-ink-muted">{m.fillsPageNote(element.lines)}</p>
            {showZhNotes && <p className="text-xs text-ink-subtle">{m.fillsPageZh}</p>}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink">{m.lines}</p>
              {showZhNotes && <p className="text-[11px] text-ink-subtle">{m.linesZh}</p>}
            </div>
            <span className="flex shrink-0 items-center">
              <SizeStepper
                value={element.lines}
                min={MIN_ANSWER_LINES}
                step={1}
                unit={element.lines === 1 ? m.unitLine : m.unitLines}
                label={
                  element.kind === 'answerSpace' ? m.answerSpaceLines : m.answerLinesLabel
                }
                onCommit={(lines) => resizeLayoutElement(element.id, lines)}
              />
            </span>
          </div>
        ))}

      {element.kind === 'spacer' && (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink">{m.height}</p>
            {showZhNotes && <p className="text-[11px] text-ink-subtle">{m.heightZh}</p>}
          </div>
          <span className="flex shrink-0 items-center">
            <SizeStepper
              value={element.heightPt}
              min={MIN_SPACER_PT}
              step={6}
              unit="pt"
              label={m.blankHeight}
              onCommit={(heightPt) => resizeLayoutElement(element.id, heightPt)}
            />
          </span>
        </div>
      )}

      {element.kind === 'labelList' && (
        <div className="space-y-1">
          <GroupHeader
            title={m.rows}
            hint={m.rowsHint}
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
                {m.addRow}
              </Button>
            }
          />
          {element.rows.map((row) => (
            <ExcerptRow
              key={row.id}
              text={[biExcerpt(row.label), biExcerpt(row.value)]
                .filter(Boolean)
                .join(': ')}
              targetKey={editTargetKey({
                kind: 'labelListCell',
                elementId: element.id,
                rowId: row.id,
                column: 'label',
              })}
              actions={
                <IconButton
                  label={m.removeRow}
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
          {element.kind === 'divider' ? m.dividerNote : m.pageBreakNote}
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
          {m.deleteElement(m[LAYOUT_NAME_KEY[element.kind]])}
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
  const m = useMessages(INSPECTOR_MESSAGES);
  const lang = useUiLanguage();
  const showZhNotes = lang !== 'zh-HK';
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const selectedQuestionId = useWorksheetStore((s) => s.selectedQuestionId);
  const selectedElementId = useWorksheetStore((s) => s.selectedElementId);
  const select = useWorksheetStore((s) => s.select);
  const selectElement = useWorksheetStore((s) => s.selectElement);
  const updateQuestion = useWorksheetStore((s) => s.updateQuestion);
  const updateLayoutElement = useWorksheetStore((s) => s.updateLayoutElement);
  // "Also updated in 2 other worksheets": shown in the Topic row of the question it is about.
  const selected = worksheet.questions.find((question) => question.id === selectedQuestionId);
  // The question's one topic set across copies (newest change wins); display only.
  const shownTags = useShownTags(selected);
  // A question with parts is tagged per part: each part's list, as the Topic row shows it.
  const shownState = useShownTagState(selected);

  /*
   * Bring the control for the page's selection into view, and mark it.
   *
   * Clicking option C on the paper now selects the question too (§ Preview
   * `selectOwnerOf`), which opens this panel — but on a long question the matching
   * field can be well below the fold, so the panel appeared to respond by showing
   * something else. The page publishes an `editTargetKey`; each control carries the
   * same key as `data-edit-target`; this finds it, scrolls, and marks it
   * (`markPanelTarget`: a tint, the selection bar, one pulse as it arrives).
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
   * effect that only watched the key would run against the outgoing DOM. A row that
   * remounts later (a part collapsed and reopened) is re-marked by the observer.
   */
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedTargetKey = useWorksheetStore((s) => s.selectedTargetKey);
  useLayoutEffect(() => {
    const root = panelRef.current;
    if (!root) return;
    markPanelTarget(root, selectedTargetKey)?.scrollIntoView({ block: 'nearest' });
    if (!selectedTargetKey) return;
    let frame = 0;
    // Child lists only: the mark is an attribute, so marking never re-triggers this.
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        markPanelTarget(root, selectedTargetKey);
      });
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
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
              {m[LAYOUT_NAME_KEY[selectedLayout.kind]]}
            </span>
            <span className="block truncate text-[11px] text-ink-muted">
              {m[LAYOUT_HINT[selectedLayout.kind]]}
            </span>
          </span>
          <IconButton label={m.closeEditor} onClick={() => selectElement(undefined)}>
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
          <p className="font-display text-[19px] text-ink">{m.pickSomething}</p>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">{m.pickHint}</p>
          {showZhNotes && <p className="text-xs text-ink-subtle">{m.pickHintZh}</p>}
        </div>
        <button
          type="button"
          onClick={onShowContent}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-accent-ink transition-[background-color,color,transform,scale] duration-150 ease-out-soft hover:bg-accent-soft active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ListIcon size={15} />
          {m.browseContent}
        </button>
      </div>
    );
  }

  const definition = requireQuestionType(selected);
  const number = numbering.byQuestionId.get(selected.id)?.number;
  const marks = questionMarks(selected);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* No number chip, no marks pill: the title carries the number, the facts sit
          as one muted line — the same de-chipped voice as the outline rows. */}
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-3.5 py-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-tight text-ink">
            {m.questionTitle(number)}
          </span>
          <span className="block truncate text-[11px] text-ink-muted">
            {plain(lang === 'zh-HK' ? definition.displayName.zh : definition.displayName.en)} · {m.marksCount(marks)}
          </span>
        </span>
        <IconButton label={m.closeEditor} onClick={() => select(undefined)}>
          <CloseIcon size={14} />
        </IconButton>
      </header>

      <div ref={panelRef} className="scroll-slim min-h-0 flex-1 overflow-y-auto p-3.5">
        <definition.EditorPanel
          key={selected.id}
          question={selected}
          onChange={(patch) => updateQuestion(selected.id, patch)}
        />
        <div className="mt-4">
          {shownState && shownState.slots.length > 0 ? (
            <PartTopics
              key={selected.id}
              question={selected}
              shown={shownState}
              // What reached the other copies is said in the app's notice stack.
              onEdit={(edit) => void setQuestionTags(selected.id, edit, topicSyncDeps(), shownState)}
            />
          ) : (
            <TopicRow
              key={selected.id}
              tags={shownTags}
              typeId={selected.type}
              onChange={(tags) => void setQuestionTopics(selected.id, tags, topicSyncDeps(), shownTags)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
