'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createAnswerLinesElement,
  createAnswerSpaceElement,
  createDividerElement,
  createHeadingElement,
  createLabelListElement,
  createPageBreakElement,
  createPartHeaderElement,
  createQuestionCountElement,
  createSectionElement,
  createSpacerElement,
  createStimulusElement,
  createTextElement,
  flowItemLabel,
} from '@/model/flow';
import { documentShape, offersLayoutKind } from '@/model/documentShape';
import { computeNumbering } from '@/model/numbering';
import { bi, plain } from '@/model/text';
import type { LayoutElement } from '@/model/types';
import { listQuestionTypes } from '@/registry';
import { useWorksheetStore } from '@/store/worksheetStore';
import {
  AnswerLinesIcon,
  AnswerSpaceIcon,
  DividerIcon,
  HeadingIcon,
  LabelListIcon,
  McqIcon,
  PageBreakIcon,
  PartHeaderIcon,
  PlusIcon,
  QuestionCountIcon,
  SectionIcon,
  SpacerIcon,
  StimulusIcon,
  StructuredIcon,
  TextIcon,
} from '@/components/ui/icons';

/**
 * The add rail: a permanent vertical strip of icon targets (Canva's shape), each
 * opening a flyout of things to insert. Everything inserts after the store's
 * `insertAnchorId` (append when none) — the anchor holds any flow id, not just a
 * question selection, and the flyout's header names the destination before the click.
 */

type Group = 'questions' | 'layout';

/** One insertable thing. `build` is deferred so nothing is constructed until clicked. */
interface Entry {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  /** `afterId` is the item to land behind, or undefined to append. */
  run: (afterId?: string) => void;
}

export function AddRail() {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const insertAnchorId = useWorksheetStore((s) => s.insertAnchorId);
  const addQuestion = useWorksheetStore((s) => s.addQuestion);
  const addLayoutElement = useWorksheetStore((s) => s.addLayoutElement);

  const [open, setOpen] = useState<Group | undefined>();
  const rootRef = useRef<HTMLDivElement>(null);

  /*
   * The page's `+` opens this menu.
   *
   * **Subscribed, not rendered.** This is an *event* — "the page asked for the menu" —
   * and reading the counter during render to mirror it into state with an effect makes
   * every request a second render pass, which is what the cascading-render lint catches.
   * `subscribe` fires outside the render cycle, so the request opens the menu directly.
   *
   * A counter rather than a flag, so clicking a second gap re-opens rather than being
   * swallowed as "already open"; and it keys on the counter rather than on the anchor,
   * because merely *moving* the anchor — selecting a question — must not pop a menu
   * open over the document.
   *
   * It opens the questions group: adding a question is far and away the commonest
   * insert, and a menu that opened on whichever group was last used would make the same
   * click do different things on different days.
   */
  useEffect(
    () =>
      useWorksheetStore.subscribe((state, previous) => {
        if (state.insertMenuRequest !== previous.insertMenuRequest) setOpen('questions');
      }),
    [],
  );

  // New items land after the anchor, so a click inserts where the teacher is working.
  // With no anchor they append, which is how a document grows.
  const afterId = insertAnchorId;

  /*
   * What the flyout header says the click will do.
   *
   * The number comes from the same `computeNumbering` the page renders with, so the
   * label names the question by the number actually printed on it rather than by an
   * array index — those differ the moment a section restarts numbering, and a label
   * reading "after Q1" beside a question printed "5." is worse than no label.
   */
  const numbering = useMemo(() => computeNumbering(worksheet), [worksheet]);
  const anchorLabel = flowItemLabel(
    worksheet,
    afterId,
    (questionId) => numbering.byQuestionId.get(questionId)?.number,
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(undefined);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(undefined);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const layoutIcons: Record<LayoutElement['kind'], React.ReactNode> = {
    section: <SectionIcon size={18} />,
    partHeader: <PartHeaderIcon size={18} />,
    questionCount: <QuestionCountIcon size={18} />,
    heading: <HeadingIcon size={18} />,
    text: <TextIcon size={18} />,
    labelList: <LabelListIcon size={18} />,
    stimulus: <StimulusIcon size={18} />,
    answerLines: <AnswerLinesIcon size={18} />,
    answerSpace: <AnswerSpaceIcon size={18} />,
    spacer: <SpacerIcon size={18} />,
    divider: <DividerIcon size={18} />,
    pageBreak: <PageBreakIcon size={18} />,
  };

  // Question types come from the registry, never a hard-coded list — a new type shows
  // up in the rail with no change here (§9).
  const questionEntries: Entry[] = listQuestionTypes().map((definition) => ({
    id: definition.id,
    label: plain(definition.displayName.en),
    hint: plain(definition.displayName.zh),
    icon: definition.id === 'mcq' ? <McqIcon size={18} /> : <StructuredIcon size={18} />,
    run: (afterId) => addQuestion(definition.id, afterId),
  }));

  const layoutEntries: Entry[] = [
    {
      id: 'section',
      label: 'Section',
      hint: 'restarts numbering · 部分',
      icon: layoutIcons.section,
      run: (afterId) => addLayoutElement(createSectionElement(), afterId),
    },
    {
      id: 'partHeader',
      label: 'Part header',
      hint: 'with marks total',
      icon: layoutIcons.partHeader,
      run: (afterId) =>
        addLayoutElement(
          createPartHeaderElement(bi('Part A: Multiple-choice questions', '甲部：多項選擇題')),
          afterId,
        ),
    },
    {
      id: 'questionCount',
      label: 'Question count',
      // The number is the point: it says what the element does that a text line cannot.
      hint: 'There are 45 questions…',
      icon: layoutIcons.questionCount,
      run: (afterId) => addLayoutElement(createQuestionCountElement(), afterId),
    },
    {
      id: 'stimulus',
      label: 'Shared stimulus',
      // The derived range is the point: the sentence renumbers itself.
      hint: '…answer Questions 8 and 9.',
      icon: layoutIcons.stimulus,
      run: (afterId) => addLayoutElement(createStimulusElement(), afterId),
    },
    {
      id: 'heading',
      label: 'Heading',
      hint: '標題',
      icon: layoutIcons.heading,
      run: (afterId) => addLayoutElement(createHeadingElement(), afterId),
    },
    {
      id: 'text',
      label: 'Text / note',
      hint: '文字',
      icon: layoutIcons.text,
      run: (afterId) => addLayoutElement(createTextElement(), afterId),
    },
    {
      id: 'labelList',
      label: 'Label list',
      hint: 'side-by-side rows',
      icon: layoutIcons.labelList,
      run: (afterId) => addLayoutElement(createLabelListElement(), afterId),
    },
    {
      id: 'answerLines',
      label: 'Answer lines',
      hint: 'ruled space',
      icon: layoutIcons.answerLines,
      run: (afterId) => addLayoutElement(createAnswerLinesElement(), afterId),
    },
    {
      id: 'answerSpace',
      label: 'Answer space',
      hint: 'dotted QAB lines',
      icon: layoutIcons.answerSpace,
      run: (afterId) => addLayoutElement(createAnswerSpaceElement(), afterId),
    },
    {
      id: 'answerSpaceFill',
      label: 'Answer space · fill',
      hint: 'dotted lines to page end',
      icon: layoutIcons.answerSpace,
      run: (afterId) => addLayoutElement(createAnswerSpaceElement(8, true), afterId),
    },
    {
      id: 'spacer',
      label: 'Blank space',
      hint: '留白',
      icon: layoutIcons.spacer,
      run: (afterId) => addLayoutElement(createSpacerElement(), afterId),
    },
    {
      id: 'divider',
      label: 'Divider',
      hint: '分隔線',
      icon: layoutIcons.divider,
      run: (afterId) => addLayoutElement(createDividerElement(), afterId),
    },
    {
      id: 'pageBreak',
      label: 'New page',
      hint: 'start a new page · 分頁',
      icon: layoutIcons.pageBreak,
      run: (afterId) => addLayoutElement(createPageBreakElement(), afterId),
    },
  ];

  /*
   * Withhold what this paper cannot contain.
   *
   * An MCQ paper's candidate answers on a separate machine-read sheet, so ruled lines,
   * dotted answer space and fill-to-page all describe a page it does not have; it also
   * runs as one unbroken sequence, so a section marker would restart numbering it never
   * restarts. A Question-Answer Book has its own dotted answer space at the reference's
   * pitch, so the worksheet's 24pt ruled lines are a second, disagreeing rhythm.
   *
   * Withheld rather than disabled: a dead row in a menu reads as a bug, while a menu
   * that simply does not offer the thing reads as a tool that knows what it is making
   * (§ `documentShape`). The elements every paper does carry — heading, note, divider,
   * page break, blank space — are untouched.
   */
  const shape = documentShape(worksheet);
  const offeredLayout = layoutEntries.filter((entry) => {
    // The two fill variants are the same element kind under different starting values.
    const kind = (entry.id === 'answerSpaceFill' ? 'answerSpace' : entry.id) as LayoutElement['kind'];
    return offersLayoutKind(shape, kind);
  });

  const groups: Array<{
    id: Group;
    label: string;
    sub: string;
    icon: React.ReactNode;
    entries: Entry[];
  }> = [
    {
      id: 'questions',
      label: 'Question',
      sub: '題目',
      icon: <PlusIcon size={20} />,
      entries: questionEntries,
    },
    {
      id: 'layout',
      label: 'Element',
      sub: '版面',
      icon: <TextIcon size={20} />,
      entries: offeredLayout,
    },
  ];

  const active = groups.find((group) => group.id === open);

  return (
    <div ref={rootRef} className="relative z-30 flex shrink-0">
      <nav
        aria-label="Add to worksheet"
        className="flex w-[76px] shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-3"
      >
        {groups.map((group) => {
          const isOpen = open === group.id;
          return (
            <button
              key={group.id}
              type="button"
              aria-expanded={isOpen}
              aria-haspopup="menu"
              onClick={() => setOpen(isOpen ? undefined : group.id)}
              className={`flex w-[64px] cursor-pointer flex-col items-center gap-1 rounded-xl px-1 py-2.5 transition-all duration-150 ease-[var(--ease-out-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                isOpen
                  ? 'bg-accent text-on-accent shadow-sm'
                  : 'text-ink-muted hover:bg-surface-hover hover:text-ink'
              }`}
            >
              {group.icon}
              <span className="text-[11px] font-semibold leading-none">{group.label}</span>
              <span
                className={`text-[9px] leading-none ${isOpen ? 'text-on-accent/70' : 'text-ink-subtle'}`}
              >
                {group.sub}
              </span>
            </button>
          );
        })}

      </nav>

      {/* The flyout. Rendered beside the rail rather than over the page, so adding
          something never hides the thing it is being added to. */}
      {active && (
        <div
          role="menu"
          aria-label={`Add ${active.label}`}
          className="absolute left-[76px] top-2 w-[260px] rounded-2xl border border-line bg-surface-raised p-2 shadow-2xl"
        >
          {/* The destination, stated before the click rather than discovered after it.
              Two lines: what is being added, then where it goes — the second is the one
              that changes as the teacher moves around the document, so it gets the
              colour and the first stays a quiet section label. */}
          <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-subtle">
            Add {active.label}
          </p>
          <p className="px-2 pb-1.5 text-[11px] text-ink-muted">
            {anchorLabel ? (
              <>
                Inserts after <span className="font-semibold text-ink">{anchorLabel}</span>
              </>
            ) : (
              'Inserts at the end'
            )}
          </p>
          {active.entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="menuitem"
              onClick={() => {
                entry.run(afterId);
                setOpen(undefined);
              }}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-150 hover:bg-accent-soft"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-ink-muted">
                {entry.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink">
                  {entry.label}
                </span>
                <span className="block truncate text-[11px] text-ink-subtle">{entry.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
