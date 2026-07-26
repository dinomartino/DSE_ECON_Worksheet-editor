'use client';

import { useEffect, useRef, useState } from 'react';
import { copyForWord, questionClipboardHtml } from '@/export/clipboard';
import { renderDiagramImages } from '@/export/diagramImage';
import {
  createAnswerLinesElement,
  createDividerElement,
  createHeadingElement,
  createLabelListElement,
  createPageBreakElement,
  createPartHeaderElement,
  createSpacerElement,
  createTextElement,
} from '@/model/flow';
import { questionMarks } from '@/model/marks';
import type { NumberingPlan } from '@/model/numbering';
import { resolveFlow } from '@/model/flow';
import { bi, plain } from '@/model/text';
import type { LayoutElement, Question, Section, Worksheet } from '@/model/types';
import { listQuestionTypes, requireQuestionType } from '@/registry';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Button, Eyebrow, IconButton, Pill } from '@/components/ui';
import { DragGhost, hideNativeDragImage } from '@/components/ui/DragGhost';
import {
  AnswerLinesIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DividerIcon,
  GripIcon,
  HeadingIcon,
  LabelListIcon,
  LAYOUT_ICON,
  McqIcon,
  PageBreakIcon,
  PartHeaderIcon,
  PlusIcon,
  SpacerIcon,
  StructuredIcon,
  TextIcon,
  TrashIcon,
} from '@/components/ui/icons';
import { Menu } from '@/components/ui/Menu';

/**
 * The question navigator.
 *
 * The row is the thing this screen is really made of, so it gets the redesign:
 * previously eight controls shared ~380px and the stem excerpt — the only part that
 * identifies a question — was truncated to about ten characters. Now the label takes
 * the width, and everything except drag-reorder lives behind an overflow menu that
 * appears on hover or keyboard focus.
 */

/** A stable short code per registered type, derived from the registry's display name. */
function typeBadge(question: Question): string {
  const words = plain(requireQuestionType(question).displayName.en).split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .map((word) => word[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
}

/** Human name per layout kind. The icon comes from `LAYOUT_ICON`, shared with the
    add rail so the same thing looks the same wherever it appears. */
const LAYOUT_NAME: Record<LayoutElement['kind'], string> = {
  heading: 'Heading',
  text: 'Text',
  spacer: 'Blank space',
  divider: 'Divider',
  pageBreak: 'New page',
  answerLines: 'Answer lines',
  partHeader: 'Part header',
  labelList: 'Label list',
};

/**
 * A non-question row in the outline.
 *
 * It shares the question row's drag affordance so the two reorder as one list — the
 * whole point of the flow is that a divider can be dragged between two questions.
 */
function LayoutRow({ element, section }: { element: LayoutElement; section: Section }) {
  const mode = useWorksheetStore((s) => s.mode);
  const removeLayoutElement = useWorksheetStore((s) => s.removeLayoutElement);
  const updateLayoutElement = useWorksheetStore((s) => s.updateLayoutElement);
  const nudgeFlowItem = useWorksheetStore((s) => s.nudgeFlowItem);
  const reorderFlowItem = useWorksheetStore((s) => s.reorderFlowItem);
  const dragId = useWorksheetStore((s) => s.dragQuestionId);
  const setDragId = useWorksheetStore((s) => s.setDragQuestionId);

  const [isOver, setIsOver] = useState(false);
  const name = LAYOUT_NAME[element.kind];
  const Icon = LAYOUT_ICON[element.kind];

  // Headings and notes show their text; the rest describe their own size.
  const detail =
    element.kind === 'heading' || element.kind === 'text' || element.kind === 'partHeader'
      ? plain(mode.language === 'zh' ? element.text.zh : element.text.en) ||
        plain(element.text.en) ||
        plain(element.text.zh)
      : element.kind === 'labelList'
        ? `${element.rows.length} row${element.rows.length === 1 ? '' : 's'}`
        : element.kind === 'spacer'
        ? `${element.heightPt}pt`
        : element.kind === 'answerLines'
          ? `${element.lines} line${element.lines === 1 ? '' : 's'}`
          : '';

  const sizeItems =
    element.kind === 'spacer'
      ? [24, 48, 72, 120].map((heightPt) => ({
          label: `Height ${heightPt}pt`,
          onSelect: () => updateLayoutElement(section.id, element.id, { heightPt }),
        }))
      : element.kind === 'answerLines'
        ? [2, 4, 6, 8, 12].map((lines) => ({
            label: `${lines} lines`,
            onSelect: () => updateLayoutElement(section.id, element.id, { lines }),
          }))
        : [];

  return (
    <li
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        hideNativeDragImage(event);
        setDragId(element.id);
      }}
      onDragEnd={() => {
        setDragId(undefined);
        setIsOver(false);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (dragId && dragId !== element.id) setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        if (dragId && dragId !== element.id) reorderFlowItem(section.id, dragId, element.id);
        setDragId(undefined);
        setIsOver(false);
      }}
      className={`group relative flex items-center gap-1.5 rounded-lg py-1.5 pl-1 pr-1.5 transition-colors duration-150 hover:bg-surface-hover ${
        isOver
          ? 'before:absolute before:inset-x-1 before:-top-px before:h-0.5 before:rounded before:bg-accent'
          : ''
      } ${dragId === element.id ? 'opacity-40' : ''}`}
    >
      <span
        aria-hidden
        className="cursor-grab text-ink-subtle/50 transition-colors group-hover:text-ink-subtle active:cursor-grabbing"
        title="Drag to reorder"
      >
        <GripIcon size={14} />
      </span>
      <span className="shrink-0 text-ink-subtle" title={name}>
        <Icon size={14} />
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
        {detail || <span className="italic">{name}</span>}
      </span>

      <span className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <IconButton label="Move up" onClick={() => nudgeFlowItem(section.id, element.id, -1)}>
          <ChevronUpIcon size={14} />
        </IconButton>
        <IconButton label="Move down" onClick={() => nudgeFlowItem(section.id, element.id, 1)}>
          <ChevronDownIcon size={14} />
        </IconButton>
        <Menu
          label={`Actions for ${name}`}
          items={[
            ...sizeItems,
            {
              label: `Delete ${name.toLowerCase()}`,
              onSelect: () => removeLayoutElement(section.id, element.id),
              danger: true,
              separated: sizeItems.length > 0,
              icon: <TrashIcon size={15} />,
            },
          ]}
        />
      </span>
    </li>
  );
}

function QuestionRow({
  question,
  section,
  numbering,
  isSelected,
  onSelect,
}: {
  question: Question;
  section: Section;
  numbering: NumberingPlan;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const mode = useWorksheetStore((s) => s.mode);
  const removeQuestion = useWorksheetStore((s) => s.removeQuestion);
  const duplicateQuestion = useWorksheetStore((s) => s.duplicateQuestion);
  const moveQuestion = useWorksheetStore((s) => s.moveQuestion);
  const moveQuestionToSection = useWorksheetStore((s) => s.moveQuestionToSection);
  const reorderQuestion = useWorksheetStore((s) => s.reorderQuestion);
  const reorderFlowItem = useWorksheetStore((s) => s.reorderFlowItem);
  const dragId = useWorksheetStore((s) => s.dragQuestionId);
  const setDragId = useWorksheetStore((s) => s.setDragQuestionId);

  const [isOver, setIsOver] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);

  // Selection can arrive from the preview, so keep the matching row on screen.
  useEffect(() => {
    if (isSelected) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [isSelected]);

  const number = numbering.byQuestionId.get(question.id)?.number;
  const stem = question.blocks.find((block) => block.kind === 'paragraph');
  const excerpt =
    stem && stem.kind === 'paragraph'
      ? plain(mode.language === 'zh' ? stem.text.zh : stem.text.en) ||
        plain(stem.text.zh) ||
        plain(stem.text.en)
      : '';

  const otherSections = worksheet.sections.filter((candidate) => candidate.id !== section.id);

  const menuItems = [
    { label: 'Duplicate', onSelect: () => duplicateQuestion(question.id) },
    {
      label: 'Copy for Word',
      onSelect: () => {
        // Rasterize first, so a question containing a diagram pastes it as one image
        // rather than dropping it.
        void renderDiagramImages(worksheet, mode).then((diagramImages) =>
          copyForWord(questionClipboardHtml(worksheet, question.id, mode, diagramImages), excerpt),
        );
      },
    },
    ...otherSections.map((candidate, index) => ({
      label: `Move to ${plain(candidate.heading?.en) || `Section ${index + 1}`}`,
      onSelect: () => moveQuestionToSection(question.id, candidate.id),
      separated: index === 0,
    })),
    {
      label: 'Delete question',
      onSelect: () => removeQuestion(question.id),
      danger: true,
      separated: true,
      icon: <TrashIcon size={15} />,
    },
  ];

  return (
    <li
      ref={rowRef}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        hideNativeDragImage(event);
        setDragId(question.id);
      }}
      onDragEnd={() => {
        setDragId(undefined);
        setIsOver(false);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (dragId && dragId !== question.id) setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        if (dragId && dragId !== question.id) {
          // A question may be dragged in from another section, which `reorderQuestion`
          // handles; a layout element only ever moves within its own section's flow.
          const isQuestion = worksheet.sections.some((candidate) =>
            candidate.questions.some((entry) => entry.id === dragId),
          );
          if (isQuestion) reorderQuestion(dragId, question.id);
          else reorderFlowItem(section.id, dragId, question.id);
        }
        setDragId(undefined);
        setIsOver(false);
      }}
      className={`group relative flex items-center gap-1.5 rounded-lg py-2 pl-1 pr-1.5 transition-colors duration-150 ${
        isSelected
          ? 'bg-accent-soft ring-1 ring-inset ring-accent/40'
          : 'hover:bg-surface-hover'
      } ${isOver ? 'before:absolute before:inset-x-1 before:-top-px before:h-0.5 before:rounded before:bg-accent' : ''} ${
        dragId === question.id ? 'opacity-40' : ''
      }`}
    >
      <span
        aria-hidden
        className="cursor-grab text-ink-subtle/50 transition-colors group-hover:text-ink-subtle active:cursor-grabbing"
        title="Drag to reorder"
      >
        <GripIcon size={14} />
      </span>

      <button
        type="button"
        onClick={onSelect}
        aria-current={isSelected}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
      >
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tabular-nums ${
            isSelected ? 'bg-accent text-on-accent' : 'bg-surface-hover text-ink-muted'
          }`}
        >
          {number ?? '–'}
        </span>
        <span className="truncate text-xs text-ink" title={excerpt}>
          {excerpt || <span className="italic text-ink-subtle">Untitled question</span>}
        </span>
      </button>

      <span
        className="shrink-0 rounded-md bg-surface-hover px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-ink-muted"
        title={plain(requireQuestionType(question).displayName.en)}
      >
        {typeBadge(question)}
      </span>
      <Pill>{questionMarks(question)}m</Pill>

      {/* Row actions stay hidden until the row is hovered or focused within. */}
      <span className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <IconButton label="Move up" onClick={() => moveQuestion(question.id, -1)}>
          <ChevronUpIcon size={14} />
        </IconButton>
        <IconButton label="Move down" onClick={() => moveQuestion(question.id, 1)}>
          <ChevronDownIcon size={14} />
        </IconButton>
        <Menu items={menuItems} label={`Actions for question ${number ?? ''}`} />
      </span>
    </li>
  );
}

/** What the drag chip should say for whatever id is in hand. */
function dragLabelFor(
  worksheet: Worksheet,
  numbering: NumberingPlan,
  dragId: string | undefined,
) {
  if (!dragId) return undefined;
  for (const section of worksheet.sections) {
    const question = section.questions.find((q) => q.id === dragId);
    if (question) {
      const number = numbering.byQuestionId.get(dragId)?.number;
      const stem = question.blocks.find((b) => b.kind === 'paragraph');
      const excerpt =
        stem && stem.kind === 'paragraph' ? plain(stem.text.en) || plain(stem.text.zh) : '';
      return {
        label: number ? `Question ${number}` : 'Question',
        // The type's own name comes from the registry, so a new type labels its ghost
        // without this file learning about it (§9).
        detail: excerpt || plain(requireQuestionType(question).displayName.en),
      };
    }
    const element = (section.layout ?? []).find((e) => e.id === dragId);
    if (element) return { label: LAYOUT_NAME[element.kind], detail: 'Layout element' };
  }
  return { label: 'Item' };
}

export function Outline({ numbering }: { numbering: NumberingPlan }) {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const selectedQuestionId = useWorksheetStore((s) => s.selectedQuestionId);
  const select = useWorksheetStore((s) => s.select);
  const addQuestion = useWorksheetStore((s) => s.addQuestion);
  const addSection = useWorksheetStore((s) => s.addSection);
  const removeSection = useWorksheetStore((s) => s.removeSection);
  const updateSection = useWorksheetStore((s) => s.updateSection);
  const addLayoutElement = useWorksheetStore((s) => s.addLayoutElement);
  const dragQuestionId = useWorksheetStore((s) => s.dragQuestionId);

  const totalQuestions = worksheet.sections.reduce(
    (sum, section) => sum + section.questions.length,
    0,
  );

  const ghost = dragLabelFor(worksheet, numbering, dragQuestionId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DragGhost label={ghost?.label} detail={ghost?.detail} />
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Eyebrow>Questions</Eyebrow>
        <Pill>{totalQuestions}</Pill>
        <span className="ml-auto">
          <Button size="sm" variant="subtle" onClick={addSection}>
            <PlusIcon size={13} />
            Section
          </Button>
        </span>
      </div>

      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {worksheet.sections.map((section, sectionIndex) => (
          <section key={section.id} className="mb-3">
            <header className="flex items-center gap-1.5 rounded-lg bg-surface-sunken px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-ink">
                {plain(section.heading?.en) ||
                  plain(section.heading?.zh) ||
                  `Section ${sectionIndex + 1}`}
              </span>
              {section.restartNumbering && (
                <span
                  className="shrink-0 rounded bg-surface-hover px-1 text-[9px] font-medium text-ink-subtle"
                  title="Numbering restarts at 1 in this section"
                >
                  ↻1
                </span>
              )}
              <Menu
                label={`Actions for section ${sectionIndex + 1}`}
                items={[
                  {
                    label: section.restartNumbering
                      ? 'Continue numbering from previous'
                      : 'Restart numbering at 1',
                    onSelect: () =>
                      updateSection(section.id, { restartNumbering: !section.restartNumbering }),
                  },
                  {
                    label: 'Delete section',
                    onSelect: () => removeSection(section.id),
                    danger: true,
                    separated: true,
                    icon: <TrashIcon size={15} />,
                  },
                ]}
              />
            </header>

            {(() => {
              const items = resolveFlow(section);
              if (items.length === 0) {
                return (
                  <p className="px-2 py-2.5 text-[11px] italic text-ink-subtle">
                    Empty — add something below.
                  </p>
                );
              }
              return (
                <ul className="space-y-px">
                  {items.map((item) =>
                    item.type === 'question' ? (
                      <QuestionRow
                        key={item.id}
                        question={item.question}
                        section={section}
                        numbering={numbering}
                        isSelected={selectedQuestionId === item.question.id}
                        onSelect={() => select(item.question.id)}
                      />
                    ) : (
                      <LayoutRow key={item.id} element={item.element} section={section} />
                    ),
                  )}
                </ul>
              );
            })()}

            {/* One add affordance per section, not five.
                The add rail on the left is now the primary way to insert anything, and
                it targets the selected question's section. This row exists for the case
                the rail cannot express — adding to a *specific* section that is not the
                current one — so it is one quiet menu rather than the old row of look-alike
                links competing with it. The question types still come from the registry,
                which keeps this the extension point for a new type (§5.3, §9). */}
            <div className="mt-1 px-1">
              <Menu
                align="left"
                label={`Add to section ${sectionIndex + 1}`}
                trigger={
                  <span className="flex items-center gap-1.5 text-[11px]">
                    <PlusIcon size={13} />
                    Add here
                  </span>
                }
                items={[
                  ...listQuestionTypes().map((definition) => ({
                    label: plain(definition.displayName.en),
                    onSelect: () => addQuestion(section.id, definition.id),
                    icon:
                      definition.id === 'mcq' ? (
                        <McqIcon size={15} />
                      ) : (
                        <StructuredIcon size={15} />
                      ),
                  })),
                  {
                    label: 'Part header (with marks)',
                    onSelect: () =>
                      addLayoutElement(
                        section.id,
                        createPartHeaderElement(
                          bi('Part A: Multiple-choice questions', '甲部：多項選擇題'),
                        ),
                      ),
                    icon: <PartHeaderIcon size={15} />,
                    separated: true,
                  },
                  {
                    label: 'Heading',
                    onSelect: () => addLayoutElement(section.id, createHeadingElement()),
                    icon: <HeadingIcon size={15} />,
                  },
                  {
                    label: 'Label list',
                    onSelect: () => addLayoutElement(section.id, createLabelListElement()),
                    icon: <LabelListIcon size={15} />,
                  },
                  {
                    label: 'Text / note',
                    onSelect: () => addLayoutElement(section.id, createTextElement()),
                    icon: <TextIcon size={15} />,
                  },
                  {
                    label: 'Answer lines',
                    onSelect: () => addLayoutElement(section.id, createAnswerLinesElement()),
                    icon: <AnswerLinesIcon size={15} />,
                  },
                  {
                    label: 'Blank space',
                    onSelect: () => addLayoutElement(section.id, createSpacerElement()),
                    icon: <SpacerIcon size={15} />,
                  },
                  {
                    label: 'Divider',
                    onSelect: () => addLayoutElement(section.id, createDividerElement()),
                    icon: <DividerIcon size={15} />,
                  },
                  {
                    label: 'New page',
                    onSelect: () => addLayoutElement(section.id, createPageBreakElement()),
                    icon: <PageBreakIcon size={15} />,
                    separated: true,
                  },
                ]}
              />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
