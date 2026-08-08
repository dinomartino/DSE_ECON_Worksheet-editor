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
  createSectionElement,
  createSpacerElement,
  createTextElement,
  LAYOUT_NAME,
  MIN_ANSWER_LINES,
  MIN_SPACER_PT,
} from '@/model/flow';
import { questionMarks } from '@/model/marks';
import type { NumberingPlan } from '@/model/numbering';
import { resolveFlow } from '@/model/flow';
import { bi, documentName, plain } from '@/model/text';
import type { LayoutElement, Question, Worksheet } from '@/model/types';
import { listQuestionTypes, requireQuestionType } from '@/registry';
import { useWorksheetStore } from '@/store/worksheetStore';
import type { PageComposition } from '@/components/preview/pagination';
import { Button, IconButton, Pill } from '@/components/ui';
import { DragGhost, hideNativeDragImage } from '@/components/ui/DragGhost';
import {
  AnswerLinesIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  DividerIcon,
  GripIcon,
  HeadingIcon,
  LabelListIcon,
  LAYOUT_ICON,
  McqIcon,
  MinusIcon,
  PageBreakIcon,
  PartHeaderIcon,
  PlusIcon,
  SectionIcon,
  SettingsIcon,
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

/* `LAYOUT_NAME` comes from `model/flow` — the rail, this outline and the add rail's
   destination label all name the same nine kinds, and separate copies would drift. */

/**
 * The size of an answer-lines block or a spacer, editable in place.
 *
 * It replaces the row's description rather than sitting beside it, because for these two
 * elements the size *is* the description — "6 lines" was already the text here, and a
 * teacher who wants seven should not have to find it behind an overflow menu. That menu
 * previously offered five fixed presets (2, 4, 6, 8, 12 lines), which is the shape of a
 * control that cannot express what was asked for: an exam question needing nine lines
 * had no way to say so.
 *
 * The field holds a **local draft string while focused** and commits on blur or Enter,
 * for the reason the margin fields in `page.ts` do: re-deriving the text from the stored
 * number on every keystroke deletes a half-typed value, and one commit per keystroke
 * would make one edit cost several undo presses. Escape abandons the draft.
 */
function SizeStepper({
  value,
  min,
  step,
  unit,
  label,
  onCommit,
}: {
  value: number;
  min: number;
  step: number;
  /** Printed after the number, e.g. "lines" or "pt". */
  unit: string;
  /** Accessible name — the row's icon is the only other clue to what this sizes. */
  label: string;
  onCommit: (next: number) => void;
}) {
  const [draft, setDraft] = useState<string | undefined>();

  const commit = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    setDraft(undefined);
    if (Number.isNaN(parsed)) return;
    if (parsed !== value) onCommit(Math.max(min, parsed));
  };

  return (
    <span className="flex min-w-0 flex-1 items-center gap-1">
      <IconButton
        label={`Fewer (${label})`}
        disabled={value <= min}
        onClick={() => onCommit(Math.max(min, value - step))}
      >
        <MinusIcon size={13} />
      </IconButton>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={draft ?? String(value)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            setDraft(undefined);
            event.currentTarget.blur();
          }
          // The row is `draggable`, and a drag started from inside a text field would
          // steal the pointer from selecting a word.
          event.stopPropagation();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className="w-9 rounded border border-line bg-surface px-1 py-0.5 text-center text-xs tabular-nums text-ink focus:border-accent focus:outline-none"
      />
      <IconButton label={`More (${label})`} onClick={() => onCommit(value + step)}>
        <PlusIcon size={13} />
      </IconButton>
      <span className="truncate text-[11px] text-ink-subtle">{unit}</span>
    </span>
  );
}

/**
 * A non-question row in the outline.
 *
 * It shares the question row's drag affordance so the two reorder as one list — the
 * whole point of the flow is that a divider can be dragged between two questions.
 */
function LayoutRow({ element }: { element: LayoutElement }) {
  const mode = useWorksheetStore((s) => s.mode);
  const removeLayoutElement = useWorksheetStore((s) => s.removeLayoutElement);
  const updateLayoutElement = useWorksheetStore((s) => s.updateLayoutElement);
  const resizeLayoutElement = useWorksheetStore((s) => s.resizeLayoutElement);
  const nudgeFlowItem = useWorksheetStore((s) => s.nudgeFlowItem);
  const reorderFlowItem = useWorksheetStore((s) => s.reorderFlowItem);
  const dragId = useWorksheetStore((s) => s.dragQuestionId);
  const setDragId = useWorksheetStore((s) => s.setDragQuestionId);

  const [isOver, setIsOver] = useState(false);
  const name = LAYOUT_NAME[element.kind];
  const Icon = LAYOUT_ICON[element.kind];
  const isSection = element.kind === 'section';

  // Headings, sections and notes show their text; the rest describe their own size.
  const detail =
    element.kind === 'heading' ||
    element.kind === 'text' ||
    element.kind === 'partHeader' ||
    element.kind === 'section'
      ? plain(mode.language === 'zh' ? element.text.zh : element.text.en) ||
        plain(element.text.en) ||
        plain(element.text.zh)
      : element.kind === 'labelList'
        ? `${element.rows.length} row${element.rows.length === 1 ? '' : 's'}`
        : element.kind === 'stimulus'
          ? `${element.blocks.length} block${element.blocks.length === 1 ? '' : 's'}`
          : '';

  // Answer lines and blank space describe themselves by their size, so the row spends
  // its width on a control for that size rather than on text repeating it.
  const stepper =
    element.kind === 'answerSpace' && element.fill ? (
      // A fill element's count is derived by the paginator, so the row reports the
      // state instead of offering a stepper that the next resolution would overwrite.
      <Pill>fills page</Pill>
    ) : element.kind === 'answerLines' || element.kind === 'answerSpace' ? (
      <SizeStepper
        value={element.lines}
        min={MIN_ANSWER_LINES}
        step={1}
        unit={element.lines === 1 ? 'line' : 'lines'}
        label={element.kind === 'answerSpace' ? 'Answer space lines' : 'Answer lines'}
        onCommit={(lines) => resizeLayoutElement(element.id, lines)}
      />
    ) : element.kind === 'spacer' ? (
      <SizeStepper
        value={element.heightPt}
        min={MIN_SPACER_PT}
        step={6}
        unit="pt"
        label="Blank space height"
        onCommit={(heightPt) => resizeLayoutElement(element.id, heightPt)}
      />
    ) : undefined;

  const sizeItems =
    element.kind === 'section'
      ? [
          {
            // The one control a section really needs, on the row that *is* the
            // section — rather than on a container header the page never showed.
            label: element.restartNumbering
              ? 'Continue numbering from previous'
              : 'Restart numbering at 1',
            onSelect: () =>
              updateLayoutElement(element.id, { restartNumbering: !element.restartNumbering }),
          },
        ]
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
        if (dragId && dragId !== element.id) reorderFlowItem(dragId, element.id);
        setDragId(undefined);
        setIsOver(false);
      }}
      className={`group relative flex items-center gap-1.5 rounded-lg py-1.5 pl-1 pr-1.5 transition-colors duration-150 hover:bg-surface-hover ${
        isOver
          ? 'before:absolute before:inset-x-1 before:-top-px before:h-0.5 before:rounded before:bg-accent'
          : ''
      } ${dragId === element.id ? 'opacity-40' : ''} ${
        // A section names the run beneath it, so it is weighted to read as a divider in
        // the list rather than as one more item in it.
        isSection ? 'mt-1 border-t border-line bg-surface-sunken/50 pt-2 first:mt-0 first:border-t-0' : ''
      }`}
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
      {stepper ?? (
        <span
          className={`min-w-0 flex-1 truncate ${
            isSection ? 'text-[11px] font-semibold text-ink' : 'text-xs text-ink-muted'
          }`}
        >
          {detail || <span className="text-ink-subtle">{name}</span>}
        </span>
      )}
      {isSection && element.kind === 'section' && element.restartNumbering && (
        <span
          className="shrink-0 rounded bg-surface-hover px-1 text-[9px] font-medium text-ink-subtle"
          title="Numbering restarts at 1 here"
        >
          ↻1
        </span>
      )}

      <span className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <IconButton label="Move up" onClick={() => nudgeFlowItem(element.id, -1)}>
          <ChevronUpIcon size={14} />
        </IconButton>
        <IconButton label="Move down" onClick={() => nudgeFlowItem(element.id, 1)}>
          <ChevronDownIcon size={14} />
        </IconButton>
        <Menu
          label={`Actions for ${name}`}
          items={[
            ...sizeItems,
            {
              label: `Delete ${name.toLowerCase()}`,
              onSelect: () => removeLayoutElement(element.id),
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
  numbering,
  isSelected,
  onSelect,
}: {
  question: Question;
  numbering: NumberingPlan;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const mode = useWorksheetStore((s) => s.mode);
  const removeQuestion = useWorksheetStore((s) => s.removeQuestion);
  const duplicateQuestion = useWorksheetStore((s) => s.duplicateQuestion);
  const moveQuestion = useWorksheetStore((s) => s.moveQuestion);
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

  // "Move to section" is now "move to the head of that section's run": a section owns
  // nothing, so the destination is a position after its heading rather than a container
  // to be put inside. Sections other than the one this question already sits under.
  const currentSectionId = numbering.byQuestionId.get(question.id)?.sectionId;
  const otherSections = worksheet.layout.filter(
    (element): element is Extract<LayoutElement, { kind: 'section' }> =>
      element.kind === 'section' && element.id !== currentSectionId,
  );

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
      label: `Move to ${plain(candidate.text.en) || plain(candidate.text.zh) || `Section ${index + 1}`}`,
      onSelect: () => reorderFlowItem(question.id, candidate.id, 'after'),
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
        // One route for every case. With a single document flow there is no "across"
        // to handle: landing next to this row is the whole move, and which section the
        // item ends up in follows from which heading it lands after.
        if (dragId && dragId !== question.id) {
          reorderFlowItem(dragId, question.id);
        }
        setDragId(undefined);
        setIsOver(false);
      }}
      className={`group relative flex items-center gap-1.5 rounded-md py-2 pl-1.5 pr-1.5 transition-colors duration-150 ${
        isSelected ? 'bg-surface-hover' : 'hover:bg-surface-hover'
      } ${isOver ? 'before:absolute before:inset-x-1 before:-top-px before:h-0.5 before:rounded before:bg-accent' : ''} ${
        dragId === question.id ? 'opacity-40' : ''
      }`}
    >
      {/* Selection is the accent bar, the same gesture as everywhere else in the
          chrome — not a tinted, ringed, chip-filled row. */}
      {isSelected && (
        <span
          aria-hidden
          className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent"
        />
      )}
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
        className="flex min-w-0 flex-1 cursor-pointer items-baseline gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
      >
        <span
          className={`w-4 shrink-0 text-right text-[11px] font-semibold tabular-nums ${
            isSelected ? 'text-accent-ink' : 'text-ink-muted'
          }`}
        >
          {number ?? '–'}
        </span>
        <span className="truncate text-xs text-ink" title={excerpt}>
          {excerpt || <span className="text-ink-subtle">Untitled question</span>}
        </span>
      </button>

      {/* Facts as quiet text, not a chip parade: the type code and the marks share
          one muted line of tabular figures. */}
      <span
        className="shrink-0 text-[10px] font-medium tracking-wide text-ink-subtle"
        title={plain(requireQuestionType(question).displayName.en)}
      >
        {typeBadge(question)}
      </span>
      <span className="shrink-0 text-[10px] tabular-nums text-ink-subtle">
        {questionMarks(question)}m
      </span>

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

/**
 * The tab that heads a page's items.
 *
 * A page break used to appear in the outline as an ordinary row — an item *between*
 * two questions — which is a faithful description of the model and a poor description
 * of what a teacher made. They added a page; the row said "New page" and sat in the
 * list looking like a divider, giving no clue which of the questions below it were on
 * that page. So the break is promoted out of the list and becomes the heading of the
 * run it opens, and its delete action removes the page rather than "the element".
 *
 * It is also a drop target: dropping a question on the tab moves it to the **start** of
 * that page, which is the one position the rows underneath cannot express (they can
 * only land something before or after themselves).
 */
function PageGroupHeader({
  group,
  open,
  onToggle,
}: {
  group: PageGroup;
  open: boolean;
  onToggle: () => void;
}) {
  const removeLayoutElement = useWorksheetStore((s) => s.removeLayoutElement);
  const removeMany = useWorksheetStore((s) => s.removeMany);
  const reorderFlowItem = useWorksheetStore((s) => s.reorderFlowItem);
  const dragId = useWorksheetStore((s) => s.dragQuestionId);
  const setDragId = useWorksheetStore((s) => s.setDragQuestionId);
  const [isOver, setIsOver] = useState(false);

  const count = group.items.length;
  const label =
    group.pageNumber === undefined ? 'Not yet placed' : `Page ${group.pageNumber}`;

  // Dropping onto the tab lands the item at the head of the page. With no items to
  // aim at, the break itself is the anchor — the same rule the blank sheet follows.
  const anchor = group.items[0]?.id ?? group.breakId;

  return (
    <div
      onDragOver={(event) => {
        if (!dragId || !anchor || dragId === anchor) return;
        event.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsOver(false);
        if (!dragId || !anchor || dragId === anchor) return;
        // `before` the first item puts it at the top of the page; with only a break to
        // aim at, `after` the break is what lands it on the sheet the break opened.
        reorderFlowItem(dragId, anchor, group.items.length > 0 ? 'before' : 'after');
        setDragId(undefined);
      }}
      className={`group/page relative mt-1.5 flex items-center gap-1 rounded-md px-1.5 py-1 first:mt-0 ${
        isOver ? 'bg-accent-soft ring-1 ring-accent/40' : ''
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-left"
      >
        <span className="shrink-0 text-ink-subtle transition-transform" aria-hidden>
          {open ? <ChevronDownIcon size={11} /> : <ChevronRightIcon size={11} />}
        </span>
        <span className="shrink-0 text-ink-subtle" aria-hidden>
          <PageBreakIcon size={12} />
        </span>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          {label}
        </span>
        {/* The count is what a collapsed tab is for — it has to say what is inside
            without being opened. */}
        <span className="truncate text-[10px] text-ink-subtle">
          {count === 0 ? 'empty' : `${count} item${count === 1 ? '' : 's'}`}
        </span>
      </button>

      {/* Only a page a break actually opened can be deleted: the first page of the
          document is not something the teacher added, so there is nothing to remove. */}
      {group.breakId && (
        <span className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover/page:opacity-100">
          <Menu
            label={`Actions for ${label}`}
            items={[
              {
                label: 'Remove page break',
                onSelect: () => removeLayoutElement(group.breakId!),
              },
              {
                label: count === 0 ? 'Delete page' : `Delete page and ${count} item${count === 1 ? '' : 's'}`,
                onSelect: () => removeMany([group.breakId!, ...group.items.map((i) => i.id)]),
                danger: true,
                separated: true,
                icon: <TrashIcon size={15} />,
              },
            ]}
          />
        </span>
      )}
    </div>
  );
}

/** What the drag chip should say for whatever id is in hand. */
function dragLabelFor(
  worksheet: Worksheet,
  numbering: NumberingPlan,
  dragId: string | undefined,
) {
  if (!dragId) return undefined;

  const question = worksheet.questions.find((q) => q.id === dragId);
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

  const element = worksheet.layout.find((e) => e.id === dragId);
  if (element) return { label: LAYOUT_NAME[element.kind], detail: 'Layout element' };
  return { label: 'Item' };
}

/**
 * A section's items, cut into the sheets they landed on.
 *
 * A page is **measured, not modelled** — there is no `Page` in the document — so this
 * groups by what the paginator reported rather than by anything stored. Two consequences
 * follow, and they are the whole reason this is a view over `resolveFlow` rather than a
 * container in the model:
 *
 * - **A group is a result, not a promise.** Adding a question to a full page pushes
 *   whatever no longer fits onto the next one, exactly as the printed document behaves.
 *   The groups re-cut themselves on the next measurement; nothing pins them.
 * - **A section can start mid-sheet**, so the same page number can appear under two
 *   sections. The page's number is used as a label, never as a key.
 *
 * Items the composition does not mention — anything added since the last measurement,
 * or everything at all before the first one — land in a trailing group with no page
 * number. That keeps a new question visible in the outline for the frame before the
 * paginator catches up, rather than having it vanish until measurement lands.
 */
interface PageGroup {
  /** 1-based page number, or undefined for items not yet measured onto a sheet. */
  pageNumber?: number;
  /** The page break that opened this sheet, if one did — what makes it deletable. */
  breakId?: string;
  items: ReturnType<typeof resolveFlow>;
}

export function groupByPage(
  items: ReturnType<typeof resolveFlow>,
  pages: PageComposition[],
): PageGroup[] {
  // Which sheet each id landed on, and which sheet each break opened.
  const pageOf = new Map<string, number>();
  for (const page of pages) {
    for (const id of page.flowIds) pageOf.set(id, page.index);
  }

  const groups: PageGroup[] = [];
  let current: PageGroup | undefined;

  for (const item of items) {
    const index = pageOf.get(item.id);
    // A run continues while the page number holds. `undefined` (not yet measured) is
    // its own run, so unmeasured items do not silently join the last real page.
    if (!current || current.pageNumber !== (index === undefined ? undefined : index + 1)) {
      current = {
        pageNumber: index === undefined ? undefined : index + 1,
        breakId: index === undefined ? undefined : pages[index]?.breakId,
        items: [],
      };
      groups.push(current);
    }
    current.items.push(item);
  }

  // A page the teacher added but has not filled has no items at all, so nothing above
  // creates a group for it — yet it is the one page most in need of being visible and
  // droppable. Insert it at the position its break occupies in the flow.
  for (const page of pages) {
    if (!page.breakId || page.flowIds.length > 1) continue;
    if (groups.some((group) => group.pageNumber === page.index + 1)) continue;
    const at = groups.findIndex(
      (group) => group.pageNumber !== undefined && group.pageNumber > page.index + 1,
    );
    const empty: PageGroup = {
      pageNumber: page.index + 1,
      breakId: page.breakId,
      items: [],
    };
    if (at < 0) groups.push(empty);
    else groups.splice(at, 0, empty);
  }

  return groups;
}

export function Outline({
  numbering,
  pages,
  onOpenSettings,
}: {
  numbering: NumberingPlan;
  pages: PageComposition[];
  onOpenSettings: () => void;
}) {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const selectedQuestionId = useWorksheetStore((s) => s.selectedQuestionId);
  const select = useWorksheetStore((s) => s.select);
  const addQuestion = useWorksheetStore((s) => s.addQuestion);
  const addLayoutElement = useWorksheetStore((s) => s.addLayoutElement);
  const dragQuestionId = useWorksheetStore((s) => s.dragQuestionId);

  /*
   * Which page groups are folded away, by group key.
   *
   * Collapsed rather than expanded is stored, so a page is open by default — a grouping
   * nobody has seen before must not start by hiding the content it is grouping. Keyed by
   * page number rather than by index, so adding a question above does not fold a
   * different page than the one the teacher folded.
   */
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const ghost = dragLabelFor(worksheet, numbering, dragQuestionId);

  // The shared chain, so the outline, the toolbar, the file list and the `.docx`
  // filename give one answer to "what is this document called". Spelling the fallback
  // out here again is how this header kept naming the document by its *printed* title
  // after a rename had given it a different name everywhere else.
  const title = documentName(worksheet) ?? 'Untitled worksheet';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DragGhost label={ghost?.label} detail={ghost?.detail} />

      {/* The document's own name and the way into its settings. This is where a user
          looks for "where do I change the title?" — next to the title, rather than
          behind an accordion labelled in 10px capitals. */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink" title={title}>
          {title}
        </span>
        <Button size="sm" variant="subtle" onClick={onOpenSettings} title="Title, paper, margins, header and footer">
          <SettingsIcon size={14} />
          Settings
        </Button>
      </div>

      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {(() => {
          const items = resolveFlow(worksheet);
          if (items.length === 0) {
            return (
              <p className="px-2 py-2.5 text-[11px] text-ink-subtle">
                Empty — add something below.
              </p>
            );
          }

          /*
           * A page break is not listed as an item — it heads the run it opened
           * (§`PageGroupHeader`). Filtering it here rather than inside the grouping
           * keeps `groupByPage` a pure cut of whatever it is handed, and so testable
           * without knowing which kinds are drawn.
           */
          const visible = items.filter(
            (item) => !(item.type === 'layout' && item.element.kind === 'pageBreak'),
          );
          const groups = groupByPage(visible, pages);

          const renderItems = (group: PageGroup) =>
            group.items.map((item) =>
              item.type === 'question' ? (
                <QuestionRow
                  key={item.id}
                  question={item.question}
                  numbering={numbering}
                  isSelected={selectedQuestionId === item.question.id}
                  onSelect={() => select(item.question.id)}
                />
              ) : (
                <LayoutRow key={item.id} element={item.element} />
              ),
            );

          // Before the first measurement there is one unnumbered group holding
          // everything; heading it "Not yet placed" would be noise on a document that
          // simply has not been measured yet, so the rows render bare.
          if (groups.length === 1 && groups[0].pageNumber === undefined) {
            return <ul className="space-y-px">{renderItems(groups[0])}</ul>;
          }

          /*
           * Pages are the top level, and a section heading is a row inside one.
           *
           * This is the fix the whole flattening was for. Groups used to nest inside a
           * per-section loop, so a sheet shared by two sections — which every real
           * paper has, since Section B starts where Section A ends rather than on a
           * fresh page — was drawn twice: once under each section, each copy holding
           * only that section's half and each offering its own drop targets for the
           * same physical page. One sheet is now one group, and the section marker
           * appears in it at the point the printed page shows it.
           */
          return groups.map((group, groupIndex) => {
            const key = `${group.pageNumber ?? 'unplaced'}-${groupIndex}`;
            const open = !collapsed.has(key);
            return (
              <div key={key}>
                <PageGroupHeader
                  group={group}
                  open={open}
                  onToggle={() =>
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                />
                {open && (
                  <ul className="space-y-px border-l border-line pl-1.5 ml-2">
                    {group.items.length === 0 ? (
                      <li className="py-1.5 pl-1 text-[11px] text-ink-subtle">
                        Empty page — drag something here.
                      </li>
                    ) : (
                      renderItems(group)
                    )}
                  </ul>
                )}
              </div>
            );
          });
        })()}

        {/* One add affordance for the document, not one per section.
            The add rail on the left is the primary way to insert anything; this row
            exists for adding at the end without first clearing the selection. Question
            types come from the registry, which keeps this an extension point (§5.3, §9). */}
        <div className="mt-1 px-1">
          <Menu
            align="left"
            label="Add to worksheet"
            trigger={
              <span className="flex items-center gap-1.5 text-[11px]">
                <PlusIcon size={13} />
                Add here
              </span>
            }
            items={[
              ...listQuestionTypes().map((definition) => ({
                label: plain(definition.displayName.en),
                onSelect: () => addQuestion(definition.id),
                icon:
                  definition.id === 'mcq' ? <McqIcon size={15} /> : <StructuredIcon size={15} />,
              })),
              {
                label: 'Section (restarts numbering)',
                onSelect: () => addLayoutElement(createSectionElement()),
                icon: <SectionIcon size={15} />,
                separated: true,
              },
              {
                label: 'Part header (with marks)',
                onSelect: () =>
                  addLayoutElement(
                    createPartHeaderElement(
                      bi('Part A: Multiple-choice questions', '甲部：多項選擇題'),
                    ),
                  ),
                icon: <PartHeaderIcon size={15} />,
              },
              {
                label: 'Heading',
                onSelect: () => addLayoutElement(createHeadingElement()),
                icon: <HeadingIcon size={15} />,
              },
              {
                label: 'Label list',
                onSelect: () => addLayoutElement(createLabelListElement()),
                icon: <LabelListIcon size={15} />,
              },
              {
                label: 'Text / note',
                onSelect: () => addLayoutElement(createTextElement()),
                icon: <TextIcon size={15} />,
              },
              {
                label: 'Answer lines',
                onSelect: () => addLayoutElement(createAnswerLinesElement()),
                icon: <AnswerLinesIcon size={15} />,
              },
              {
                label: 'Blank space',
                onSelect: () => addLayoutElement(createSpacerElement()),
                icon: <SpacerIcon size={15} />,
              },
              {
                label: 'Divider',
                onSelect: () => addLayoutElement(createDividerElement()),
                icon: <DividerIcon size={15} />,
              },
              {
                label: 'New page',
                onSelect: () => addLayoutElement(createPageBreakElement()),
                icon: <PageBreakIcon size={15} />,
                separated: true,
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
