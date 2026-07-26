'use client';

import { useEffect, useRef, useState } from 'react';
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
import { bi, plain } from '@/model/text';
import type { LayoutElement } from '@/model/types';
import { listQuestionTypes } from '@/registry';
import { useWorksheetStore } from '@/store/worksheetStore';
import {
  AnswerLinesIcon,
  DividerIcon,
  HeadingIcon,
  LabelListIcon,
  McqIcon,
  PageBreakIcon,
  PartHeaderIcon,
  PlusIcon,
  SectionIcon,
  SpacerIcon,
  StructuredIcon,
  TextIcon,
} from '@/components/ui/icons';

/**
 * The add rail — the app's answer to "how do I put something on the page?".
 *
 * Before this existed the only way to add a question was an 11px grey text link
 * (`+ Multiple Choice`) sitting under a collapsed accordion in the right sidebar,
 * below the fold on a short window. Adding content is the single most common thing a
 * teacher does here and it was the least visible control on screen.
 *
 * The rail borrows Canva's shape deliberately: a permanent vertical strip of large
 * icon targets on the left edge, each opening a flyout of concrete things to insert.
 * It costs 64px of width and buys an affordance that never has to be discovered
 * twice — the rail is always in the same place whatever is selected.
 *
 * **Where things land.** Everything inserts into the *selected* question's section
 * when there is a selection, otherwise the last section, which is what "keep typing
 * at the end" means for a document. That keeps a single click useful without asking
 * the teacher to first nominate a target, and the item can still be dragged
 * afterwards — §flow makes position cheap to change.
 */

type Group = 'questions' | 'layout';

/** One insertable thing. `build` is deferred so nothing is constructed until clicked. */
interface Entry {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  run: (sectionId: string) => void;
}

export function AddRail() {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const selectedQuestionId = useWorksheetStore((s) => s.selectedQuestionId);
  const addQuestion = useWorksheetStore((s) => s.addQuestion);
  const addSection = useWorksheetStore((s) => s.addSection);
  const addLayoutElement = useWorksheetStore((s) => s.addLayoutElement);

  const [open, setOpen] = useState<Group | undefined>();
  const rootRef = useRef<HTMLDivElement>(null);

  // The section a new item belongs to: the one holding the selection, else the last.
  // Falling back to the last section (rather than the first) matches how a document
  // grows — you are almost always adding to the end of what you just wrote.
  const targetSectionId =
    worksheet.sections.find((section) =>
      section.questions.some((question) => question.id === selectedQuestionId),
    )?.id ?? worksheet.sections[worksheet.sections.length - 1]?.id;

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
    partHeader: <PartHeaderIcon size={18} />,
    heading: <HeadingIcon size={18} />,
    text: <TextIcon size={18} />,
    labelList: <LabelListIcon size={18} />,
    answerLines: <AnswerLinesIcon size={18} />,
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
    run: (sectionId) => addQuestion(sectionId, definition.id),
  }));

  const layoutEntries: Entry[] = [
    {
      id: 'partHeader',
      label: 'Part header',
      hint: 'with marks total',
      icon: layoutIcons.partHeader,
      run: (sectionId) =>
        addLayoutElement(
          sectionId,
          createPartHeaderElement(
            bi('Part A: Multiple-choice questions', '甲部：多項選擇題'),
          ),
        ),
    },
    {
      id: 'heading',
      label: 'Heading',
      hint: '標題',
      icon: layoutIcons.heading,
      run: (sectionId) => addLayoutElement(sectionId, createHeadingElement()),
    },
    {
      id: 'text',
      label: 'Text / note',
      hint: '文字',
      icon: layoutIcons.text,
      run: (sectionId) => addLayoutElement(sectionId, createTextElement()),
    },
    {
      id: 'labelList',
      label: 'Label list',
      hint: 'side-by-side rows',
      icon: layoutIcons.labelList,
      run: (sectionId) => addLayoutElement(sectionId, createLabelListElement()),
    },
    {
      id: 'answerLines',
      label: 'Answer lines',
      hint: 'ruled space',
      icon: layoutIcons.answerLines,
      run: (sectionId) => addLayoutElement(sectionId, createAnswerLinesElement()),
    },
    {
      id: 'spacer',
      label: 'Blank space',
      hint: '留白',
      icon: layoutIcons.spacer,
      run: (sectionId) => addLayoutElement(sectionId, createSpacerElement()),
    },
    {
      id: 'divider',
      label: 'Divider',
      hint: '分隔線',
      icon: layoutIcons.divider,
      run: (sectionId) => addLayoutElement(sectionId, createDividerElement()),
    },
    {
      id: 'pageBreak',
      label: 'New page',
      hint: 'start a new page · 分頁',
      icon: layoutIcons.pageBreak,
      run: (sectionId) => addLayoutElement(sectionId, createPageBreakElement()),
    },
  ];

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
      entries: layoutEntries,
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

        <div className="my-1 h-px w-8 bg-line" />

        <button
          type="button"
          onClick={() => {
            addSection();
            setOpen(undefined);
          }}
          className="flex w-[64px] cursor-pointer flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-ink-muted transition-all duration-150 hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <SectionIcon size={20} />
          <span className="text-[11px] font-semibold leading-none">Section</span>
          <span className="text-[9px] leading-none text-ink-subtle">分部</span>
        </button>
      </nav>

      {/* The flyout. Rendered beside the rail rather than over the page, so adding
          something never hides the thing it is being added to. */}
      {active && (
        <div
          role="menu"
          aria-label={`Add ${active.label}`}
          className="absolute left-[76px] top-2 w-[260px] rounded-2xl border border-line bg-surface-raised p-2 shadow-2xl"
        >
          <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-subtle">
            Add {active.label}
          </p>
          {active.entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="menuitem"
              disabled={!targetSectionId}
              onClick={() => {
                if (!targetSectionId) return;
                entry.run(targetSectionId);
                setOpen(undefined);
              }}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-150 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
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
          {!targetSectionId && (
            <p className="px-2 py-1.5 text-[11px] text-ink-subtle">
              Add a section first.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
