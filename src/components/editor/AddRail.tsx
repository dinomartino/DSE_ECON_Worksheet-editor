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
import { unanchoredQuestionSectionLabel, useWorksheetStore } from '@/store/worksheetStore';
import { useBankSession } from '@/components/bank/bankSession';
import {
  AnswerLinesIcon,
  AnswerSpaceIcon,
  DividerIcon,
  HeadingIcon,
  LabelListIcon,
  ListIcon,
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
import { useMessages, useUiLanguage } from '@/i18n/language';
import { ADD_RAIL_MESSAGES } from './AddRail.messages';

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
  const m = useMessages(ADD_RAIL_MESSAGES);
  const lang = useUiLanguage();
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
  const labelFor = (id: string | undefined) =>
    flowItemLabel(worksheet, id, (questionId) => numbering.byQuestionId.get(questionId)?.number);
  // With no anchor, each question type lands in the section made for it (or the first
  // section of an empty sectioned document), named by its short label ("in Section B").
  // When the types part ways, each row says where.
  const typeDestinations =
    open === 'questions' && !afterId
      ? new Map(listQuestionTypes().map((type) => [type.id, unanchoredQuestionSectionLabel(worksheet, type.id)]))
      : undefined;
  const splitDestinations = new Set(typeDestinations?.values()).size > 1;
  const anchorLabel = afterId ? labelFor(afterId) : undefined;
  // One destination for every type: the header states it ("Inserts in Section A").
  const sharedSection = splitDestinations ? undefined : typeDestinations?.values().next().value;

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
  const questionEntries: Entry[] = listQuestionTypes().map((definition) => {
    const zh = plain(definition.displayName.zh);
    const destination = typeDestinations?.get(definition.id);
    const where = destination ? m.inSection(destination) : m.atEnd;
    const english = lang === 'en';
    return {
      id: definition.id,
      label: english ? plain(definition.displayName.en) : zh,
      hint: splitDestinations ? (english ? `${zh} · ${where}` : where) : english ? zh : '',
      icon: definition.id === 'mcq' ? <McqIcon size={18} /> : <StructuredIcon size={18} />,
      run: (afterId) => addQuestion(definition.id, afterId),
    };
  });
  // Copies from the other saved documents: opens the sidebar's 題庫 tab, where the
  // anchor line names the same destination this flyout does.
  questionEntries.push({
    id: 'fromBank',
    label: m.fromBank,
    hint: m.fromBankHint,
    icon: <ListIcon size={18} />,
    run: () => useBankSession.getState().openBank(),
  });

  const layoutEntries: Entry[] = [
    {
      id: 'section',
      label: m.section,
      hint: m.sectionHint,
      icon: layoutIcons.section,
      run: (afterId) => addLayoutElement(createSectionElement(), afterId),
    },
    {
      id: 'partHeader',
      label: m.partHeader,
      hint: m.partHeaderHint,
      icon: layoutIcons.partHeader,
      run: (afterId) =>
        addLayoutElement(
          createPartHeaderElement(bi('Part A: Multiple-choice questions', '甲部：多項選擇題')),
          afterId,
        ),
    },
    {
      id: 'questionCount',
      label: m.questionCount,
      // The number is the point: it says what the element does that a text line cannot.
      hint: m.questionCountHint,
      icon: layoutIcons.questionCount,
      run: (afterId) => addLayoutElement(createQuestionCountElement(), afterId),
    },
    {
      id: 'stimulus',
      label: m.stimulus,
      // The derived range is the point: the sentence renumbers itself.
      hint: m.stimulusHint,
      icon: layoutIcons.stimulus,
      run: (afterId) => addLayoutElement(createStimulusElement(), afterId),
    },
    {
      id: 'heading',
      label: m.heading,
      hint: m.headingHint,
      icon: layoutIcons.heading,
      run: (afterId) => addLayoutElement(createHeadingElement(), afterId),
    },
    {
      id: 'text',
      label: m.text,
      hint: m.textHint,
      icon: layoutIcons.text,
      run: (afterId) => addLayoutElement(createTextElement(), afterId),
    },
    {
      id: 'labelList',
      label: m.labelList,
      hint: m.labelListHint,
      icon: layoutIcons.labelList,
      run: (afterId) => addLayoutElement(createLabelListElement(), afterId),
    },
    {
      id: 'answerLines',
      label: m.answerLines,
      hint: m.answerLinesHint,
      icon: layoutIcons.answerLines,
      run: (afterId) => addLayoutElement(createAnswerLinesElement(), afterId),
    },
    {
      id: 'answerSpace',
      label: m.answerSpace,
      hint: m.answerSpaceHint,
      icon: layoutIcons.answerSpace,
      run: (afterId) => addLayoutElement(createAnswerSpaceElement(), afterId),
    },
    {
      id: 'answerSpaceFill',
      label: m.answerSpaceFill,
      hint: m.answerSpaceFillHint,
      icon: layoutIcons.answerSpace,
      run: (afterId) => addLayoutElement(createAnswerSpaceElement(8, true), afterId),
    },
    {
      id: 'spacer',
      label: m.spacer,
      hint: m.spacerHint,
      icon: layoutIcons.spacer,
      run: (afterId) => addLayoutElement(createSpacerElement(), afterId),
    },
    {
      id: 'divider',
      label: m.divider,
      hint: m.dividerHint,
      icon: layoutIcons.divider,
      run: (afterId) => addLayoutElement(createDividerElement(), afterId),
    },
    {
      id: 'pageBreak',
      label: m.pageBreak,
      hint: m.pageBreakHint,
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
    title: string;
    sub: string;
    icon: React.ReactNode;
    entries: Entry[];
  }> = [
    {
      id: 'questions',
      label: m.groupQuestion,
      title: m.addQuestion,
      sub: m.groupQuestionSub,
      icon: <PlusIcon size={20} />,
      entries: questionEntries,
    },
    {
      id: 'layout',
      label: m.groupElement,
      title: m.addElement,
      sub: m.groupElementSub,
      icon: <TextIcon size={20} />,
      entries: offeredLayout,
    },
  ];

  const active = groups.find((group) => group.id === open);

  return (
    <div ref={rootRef} className="relative z-30 flex shrink-0">
      <nav
        aria-label={m.nav}
        className="zone-dark flex w-[76px] shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-3"
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
              className={`flex w-[64px] cursor-pointer flex-col items-center gap-1 rounded-lg px-1 py-2.5 transition-[background-color,border-color,color,opacity,transform,scale] duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.97] ${
                isOpen
                  ? 'bg-accent-soft text-accent-ink'
                  : 'text-ink-muted hover:bg-surface-hover hover:text-ink'
              }`}
            >
              {group.icon}
              <span className="text-[11px] font-semibold leading-none">{group.label}</span>
              <span
                className={`text-[9px] leading-none transition-colors duration-150 ease-out-soft ${isOpen ? 'text-accent-ink/70' : 'text-ink-subtle'}`}
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
        // Keyed by group so switching Question ↔ Element pops the new menu in too.
        <div
          key={active.id}
          role="menu"
          aria-label={active.title}
          className="absolute left-[76px] top-2 w-[260px] origin-top-left animate-pop-in rounded-2xl border border-line bg-surface-raised p-2 shadow-2xl"
        >
          {/* The destination, stated before the click rather than discovered after it.
              Two lines: what is being added, then where it goes — the second is the one
              that changes as the teacher moves around the document, so it gets the
              colour and the first stays a quiet section label. */}
          <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-subtle">
            {active.title}
          </p>
          <p className="px-2 pb-1.5 text-[11px] text-ink-muted">
            {anchorLabel ? (
              <>
                {m.insertsAfterPre}<span className="font-semibold text-ink">{anchorLabel}</span>{m.insertsAfterPost}
              </>
            ) : splitDestinations && active.id === 'questions' ? (
              m.eachOwnSection
            ) : sharedSection && active.id === 'questions' ? (
              <>
                {m.insertsInPre}<span className="font-semibold text-ink">{sharedSection}</span>{m.insertsInPost}
              </>
            ) : (
              m.insertsAtEnd
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
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 ease-out-soft hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
              <span className="shrink-0 text-ink-subtle">{entry.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink">
                  {entry.label}
                </span>
                {entry.hint && <span className="block truncate text-[11px] text-ink-subtle">{entry.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
