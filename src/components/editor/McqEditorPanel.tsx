'use client';

import { useState } from 'react';
import { editTargetKey, withNote } from '@/model/edits';
import { statementLabel, optionLabel } from '@/model/numbering';
import { emptyBiText, isBiTextEmpty } from '@/model/text';
import { OPTION_DIAGRAM_WIDTH_PX, createDiagramBlock } from '@/model/factories';
import type { BiText, ContentBlock, McqOptionLayout, McqQuestion } from '@/model/types';
import {
  keepsOptionOrder,
  optionStaysPut,
  resolveOptionLayout,
  suggestOptionLayout,
} from '@/registry/mcq';
import { versionCount } from '@/model/versions';
import type { EditorPanelProps } from '@/registry/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { documentShape } from '@/model/documentShape';
import { Button, GroupHeader, IconButton, NumberField, Segmented, SelectField } from '@/components/ui';
import { ChevronDownIcon, ChevronRightIcon } from '@/components/ui/icons';
import { BiTextField } from './BiTextField';
import { BlockEditor } from './BlockEditor';
import { biExcerpt, ExcerptRow } from './panelRows';

/**
 * MCQ properties (§5.3, slimmed): the panel carries only what does not print or has
 * no handle on the page — the correct answer, marks, option layout, structure verbs —
 * plus the teacher-only explanation. The stem, options and statements are *typed on
 * the page*; here they appear as excerpt rows that reorder and delete.
 */
export function McqEditorPanel({ question, onChange }: EditorPanelProps<McqQuestion>) {
  const statements = question.statements ?? [];
  const language = useWorksheetStore((s) => s.mode.language);
  const suggested = suggestOptionLayout(question, language);
  // Which paper this question sits in, for the exam-only gap control below. Derived
  // per render — cheap, and a stored copy would go stale when a cover is added.
  const shape = useWorksheetStore((s) => documentShape(s.worksheet));
  const paperGap = useWorksheetStore((s) => s.worksheet.examGapLines);
  // Pins matter only once the paper has shuffled versions (Setup → Versions).
  const versioned = useWorksheetStore((s) => versionCount(s.worksheet) > 1);
  const fixedOrder = versioned && keepsOptionOrder(question);

  const setStatements = (next: BiText[]) =>
    onChange({ statements: next.length > 0 ? next : undefined });

  // Open at mount when it already holds something; after that the teacher's own
  // toggling wins — a controlled `open` would snap shut on the keystroke that
  // emptied the field.
  const [marksOpen, setMarksOpen] = useState(
    () =>
      !isBiTextEmpty(question.explanation) ||
      !isBiTextEmpty(question.provenance) ||
      question.options.some((option) => !isBiTextEmpty(option.rationale)),
  );
  // Per-option rationale rows start collapsed: four open fields would bury the panel.
  const [openRationale, setOpenRationale] = useState<Set<string>>(() => new Set());

  /*
   * Follow the page's selection into the teacher notes — a render-time adjustment, as in
   * the structured panel, so the field is in the DOM when `Inspector` scrolls to it.
   */
  const selectedTargetKey = useWorksheetStore((s) => s.selectedTargetKey);
  const [prevTargetKey, setPrevTargetKey] = useState(selectedTargetKey);
  if (selectedTargetKey !== prevTargetKey) {
    setPrevTargetKey(selectedTargetKey);
    const [kind, id] = (selectedTargetKey ?? '').split(':');
    const noteKinds = ['mcqExplanation', 'mcqRationale', 'mcqProvenance'];
    if (noteKinds.includes(kind) && !marksOpen) setMarksOpen(true);
    if (kind === 'mcqRationale' && !openRationale.has(id)) {
      setOpenRationale(new Set(openRationale).add(id));
    }
  }
  const toggleRationale = (id: string) =>
    setOpenRationale((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setRationale = (optionId: string, text: BiText) =>
    onChange({
      options: question.options.map((option) =>
        option.id === optionId ? withNote(option, 'rationale', text) : option,
      ),
    });

  /**
   * Set (or clear) the blocks an option carries.
   *
   * Emptying it drops the key rather than storing `[]`, so an option that briefly had a
   * figure is indistinguishable from one that never did — the same rule every optional
   * field follows, and what keeps `resolveOptionLayout` from pinning a question to
   * `stacked` because of a figure that is no longer there.
   */
  const setOptionBlocks = (index: number, blocks: ContentBlock[]) =>
    onChange({
      options: question.options.map((option, i) =>
        i === index
          ? { ...option, blocks: blocks.length > 0 ? blocks : undefined }
          : option,
      ),
    });

  const togglePin = (index: number) =>
    onChange({
      options: question.options.map((option, i) => {
        if (i !== index) return option;
        const { pinned, ...rest } = option;
        return pinned ? rest : { ...rest, pinned: true };
      }),
    });

  const moveStatement = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= statements.length) return;
    const next = [...statements];
    [next[index], next[target]] = [next[target], next[index]];
    setStatements(next);
  };

  return (
    <div className="space-y-5">
      <BlockEditor
        label="Stem"
        labelHint="typed on the page"
        blocks={question.blocks}
        onChange={(blocks) => onChange({ blocks })}
      />

      {/* The answer key: the one MCQ fact with no page presence at all in the student
          version. A letter row rather than four radios beside four text fields — the
          picker is the control, the option rows below only reflect it. */}
      <section className="space-y-2 border-t border-line pt-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div
            role="radiogroup"
            aria-label="Correct answer"
            className="flex items-center gap-1"
          >
            <span className="text-[11px] font-medium text-ink-muted">Answer</span>
            {question.options.map((option, index) => {
              const isAnswer = question.answerIndex === index;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={isAnswer}
                  aria-label={`Option ${optionLabel(index)} is the correct answer`}
                  title={
                    isAnswer ? 'This is the correct answer' : 'Mark as the correct answer'
                  }
                  onClick={() => onChange({ answerIndex: index })}
                  className={`h-7 w-7 cursor-pointer rounded-md text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    isAnswer
                      ? 'bg-ok-soft text-ok ring-1 ring-inset ring-ok-line'
                      : 'text-ink-subtle hover:bg-surface-hover hover:text-ink'
                  }`}
                >
                  {optionLabel(index)}
                </button>
              );
            })}
          </div>
          <NumberField
            label="Marks"
            value={question.marks ?? 1}
            onChange={(marks) => onChange({ marks })}
          />
        </div>
        {/* The exam paper's between-question gap, for this one boundary
            (§ `Question.gapBefore`). Only on a Paper 1 — the wide boundary exists
            nowhere else, and offering it on a worksheet would promise air the renderer
            never gives. Ignored on question 1, which has no boundary above it. */}
        {shape === 'paper1' && (
          <SelectField<number>
            label="Space above"
            value={question.gapBefore ?? 0}
            options={[
              { value: 0, label: `Paper default (${paperGap ?? 3} lines)` },
              ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((lines) => ({
                value: lines,
                label: lines === 1 ? '1 line' : `${lines} lines`,
              })),
            ]}
            onChange={(lines) => onChange({ gapBefore: lines === 0 ? undefined : lines })}
          />
        )}
      </section>

      <section className="space-y-1">
        <GroupHeader title="Options" hint="typed on the page" />
        <div className="flex flex-wrap items-center gap-2 pb-1">
          <Segmented<McqOptionLayout>
            label="Option layout"
            value={resolveOptionLayout(question)}
            // Inline is withheld (not greyed out) once an option carries a figure: one
            // line of tab stops cannot hold a picture per cell, so offering it would
            // be a choice that silently renders as something else. 2 columns stays —
            // with figures it renders as the reference's 2×2 grid.
            options={
              question.options.some((option) => (option.blocks?.length ?? 0) > 0)
                ? [
                    { value: 'stacked', label: 'Stacked', title: 'One option per line' },
                    {
                      value: 'columns2',
                      label: '2 columns',
                      title: 'Two options per line — figure options print as a grid',
                    },
                  ]
                : [
                    { value: 'stacked', label: 'Stacked', title: 'One option per line' },
                    { value: 'inline', label: 'Inline', title: 'All four options on one line' },
                    { value: 'columns2', label: '2 columns', title: 'Two options per line' },
                  ]
            }
            onChange={(optionLayout) => onChange({ optionLayout })}
          />
          {/* Only offered when it would actually change something, so it never reads as
              a no-op button. Stacked stays the default until a teacher chooses. */}
          {suggested !== resolveOptionLayout(question) && (
            <Button
              size="sm"
              variant="subtle"
              title={`These options fit better ${suggested === 'stacked' ? 'stacked' : `as ${suggested}`}`}
              onClick={() => onChange({ optionLayout: suggested })}
            >
              Fit to content
            </Button>
          )}
        </div>

        {fixedOrder && (
          <p className="pb-1 text-[11px] text-ink-muted">
            A combination question keeps its option order in every version.
          </p>
        )}
        {question.options.map((option, index) => {
          const isAnswer = question.answerIndex === index;
          const hasBlocks = (option.blocks?.length ?? 0) > 0;
          const autoFixed = !option.pinned && optionStaysPut(option);
          return (
            <div key={option.id} className={hasBlocks ? 'space-y-1' : undefined}>
              <ExcerptRow
                marker={
                  <span className={isAnswer ? 'font-semibold text-ok' : undefined}>
                    {optionLabel(index)}
                  </span>
                }
                text={biExcerpt(option.text)}
                targetKey={editTargetKey({
                  kind: 'mcqOption',
                  questionId: question.id,
                  optionId: option.id,
                })}
                badge={
                  versioned && !fixedOrder && (option.pinned || autoFixed) ? (
                    <span
                      className="shrink-0 text-[10px] font-medium text-accent"
                      title={
                        autoFixed
                          ? 'Its wording depends on its place, so it keeps its letter in every version'
                          : 'Keeps its letter in every version'
                      }
                    >
                      Pinned
                    </span>
                  ) : undefined
                }
                actions={
                  <>
                  {versioned && !fixedOrder && !autoFixed && (
                    <Button
                      size="sm"
                      variant="subtle"
                      aria-pressed={option.pinned === true}
                      title={
                        option.pinned
                          ? 'Let this option move between versions'
                          : 'Keep this option at its letter in every version'
                      }
                      onClick={() => togglePin(index)}
                    >
                      {option.pinned ? 'Unpin' : 'Pin'}
                    </Button>
                  )}
                  {/* An option can be a *figure* — "which of the following diagrams best
                     describes…". Behind an affordance: the overwhelmingly common option
                     is a line of text, and a permanent insert row under all four would
                     bury it. */}
                  {!hasBlocks && (
                    <Button
                      size="sm"
                      variant="subtle"
                      onClick={() =>
                        // The button says Figure, so it seeds one: blank axes at option
                        // width, retyped or re-templated in the region it opens. It once
                        // seeded an empty *paragraph* just to make that region appear,
                        // which printed as a phantom placeholder line under the letter.
                        setOptionBlocks(index, [
                          createDiagramBlock('blank', OPTION_DIAGRAM_WIDTH_PX),
                        ])
                      }
                    >
                      + Figure
                    </Button>
                  )}
                  </>
                }
              />
              {hasBlocks && (
                <div className="ml-5 border-l-2 border-line pl-2">
                  <BlockEditor
                    blocks={option.blocks ?? []}
                    onChange={(blocks) => setOptionBlocks(index, blocks)}
                    figureWidth={OPTION_DIAGRAM_WIDTH_PX}
                  />
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="space-y-1 border-t border-line pt-3">
        <GroupHeader
          title="Statements"
          hint="combination MCQ · typed on the page"
          action={
            <Button
              size="sm"
              variant="subtle"
              onClick={() => setStatements([...statements, emptyBiText()])}
            >
              + Statement
            </Button>
          }
        />
        {statements.map((statement, index) => (
          <ExcerptRow
            key={index}
            marker={statementLabel(index)}
            text={biExcerpt(statement)}
            targetKey={editTargetKey({
              kind: 'mcqStatement',
              questionId: question.id,
              index,
            })}
            actions={
              <>
                <IconButton
                  label="Move statement up"
                  disabled={index === 0}
                  onClick={() => moveStatement(index, -1)}
                >
                  <span aria-hidden>↑</span>
                </IconButton>
                <IconButton
                  label="Move statement down"
                  disabled={index === statements.length - 1}
                  onClick={() => moveStatement(index, 1)}
                >
                  <span aria-hidden>↓</span>
                </IconButton>
                <IconButton
                  label="Delete statement"
                  variant="danger"
                  onClick={() => setStatements(statements.filter((_, i) => i !== index))}
                >
                  <span aria-hidden>✕</span>
                </IconButton>
              </>
            }
          />
        ))}
      </section>

      {/* Teacher-only text: it prints only in the Teacher version and the answer key, so
          in Student mode this is its one editing surface. Collapsed until it holds
          something, so the panel's resting height is the properties above. */}
      <details
        className="border-t border-line pt-3"
        open={marksOpen}
        onToggle={(event) => setMarksOpen((event.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer select-none text-[11px] font-medium text-ink-muted transition-colors hover:text-ink">
          Answer &amp; marking
        </summary>
        <div className="space-y-3 pt-2">
          <div
            data-edit-target={editTargetKey({
              kind: 'mcqExplanation',
              questionId: question.id,
            })}
          >
            <BiTextField
              label="Explanation (teacher version)"
              value={question.explanation ?? emptyBiText()}
              onChange={(explanation) => onChange({ explanation })}
            />
          </div>

          {/* Why each option is right or wrong. Stored on the option, so it follows
              the option into every shuffled version. */}
          <div className="space-y-0.5">
            <span className="text-[11px] font-medium text-ink-muted">Rationale</span>
            {question.options.map((option, index) => {
              const open = openRationale.has(option.id);
              const isAnswer = question.answerIndex === index;
              const key = editTargetKey({
                kind: 'mcqRationale',
                questionId: question.id,
                optionId: option.id,
              });
              const excerpt = biExcerpt(option.rationale);
              return (
                <div key={option.id} data-edit-target={key}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggleRationale(option.id)}
                    className="flex h-7 w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span className="shrink-0 text-ink-subtle" aria-hidden>
                      {open ? <ChevronDownIcon size={11} /> : <ChevronRightIcon size={11} />}
                    </span>
                    <span
                      className={`w-5 shrink-0 text-center text-[11px] font-semibold ${
                        isAnswer ? 'text-ok' : 'text-ink-muted'
                      }`}
                    >
                      {optionLabel(index)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-ink-subtle">
                      {/* Open, the field below shows the text; the row names its job. */}
                      {(!open && excerpt) || (
                        <span className="italic">
                          {isAnswer ? 'Why it is correct' : 'Why it is wrong'}
                        </span>
                      )}
                    </span>
                  </button>
                  {open && (
                    <div className="pb-1.5 pl-7 pt-0.5">
                      <BiTextField
                        ariaLabel={`Rationale for option ${optionLabel(index)}`}
                        value={option.rationale ?? emptyBiText()}
                        onChange={(text) => setRationale(option.id, text)}
                        placeholderEn={isAnswer ? 'Why it is correct…' : 'Why it is wrong…'}
                        placeholderZh={isAnswer ? '為何正確…' : '為何錯誤…'}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div
            data-edit-target={editTargetKey({
              kind: 'mcqProvenance',
              questionId: question.id,
            })}
          >
            <BiTextField
              label="Source"
              rows={1}
              value={question.provenance ?? emptyBiText()}
              // A cleared note drops its key (§ A field cleared to nothing stores nothing).
              onChange={(text) => onChange({ provenance: isBiTextEmpty(text) ? undefined : text })}
              placeholderEn="e.g. Modelled on DSE 2023 Q1"
              placeholderZh="例：改編自 2023 DSE 第 1 題"
            />
          </div>
        </div>
      </details>
    </div>
  );
}
