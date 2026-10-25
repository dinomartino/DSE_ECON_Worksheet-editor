'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { flowItemLabel } from '@/model/flow';
import { computeNumbering } from '@/model/numbering';
import { listQuestionTypes } from '@/registry';
import { unanchoredQuestionSectionLabel, useWorksheetStore } from '@/store/worksheetStore';
import { imageBlockFromFile } from '@/export/imageImport';
import { TableSizePicker } from '@/components/ui/TableSizePicker';
import { PlusIcon, TextIcon } from '@/components/ui/icons';
import { useMessages, useUiLanguage } from '@/i18n/language';
import { buildInsertEntries, PICTURE_INPUT, type InsertEntry } from './insertEntries';
import { useRailRequest } from './railRequest';
import { ADD_RAIL_MESSAGES } from './AddRail.messages';

/**
 * The add rail: a permanent vertical strip of icon targets (Canva's shape), each
 * opening a flyout of things to insert. Everything inserts after the store's
 * `insertAnchorId` (append when none) — the anchor holds any flow id, not just a
 * question selection, and the flyout's header names the destination before the click.
 */

type Group = 'questions' | 'layout';
type Entry = InsertEntry;

export function AddRail() {
  const m = useMessages(ADD_RAIL_MESSAGES);
  const lang = useUiLanguage();
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const insertAnchorId = useWorksheetStore((s) => s.insertAnchorId);
  const addQuestion = useWorksheetStore((s) => s.addQuestion);
  const addLayoutElement = useWorksheetStore((s) => s.addLayoutElement);
  const insertBlockAtAnchor = useWorksheetStore((s) => s.insertBlockAtAnchor);

  const [open, setOpenState] = useState<Group | undefined>();
  // Inside the Insert flyout: the entry whose choices are showing, and the table grid.
  const [expanded, setExpanded] = useState<string | undefined>();
  const [pickingTable, setPickingTable] = useState(false);
  const setOpen = (group: Group | undefined) => {
    setOpenState(group);
    setExpanded(undefined);
    setPickingTable(false);
  };
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

  // ⌘K's Table… (`requestTableGrid`): the Insert menu, open at the size grid.
  useEffect(
    () =>
      useRailRequest.subscribe((state, previous) => {
        if (state.tableGrid === previous.tableGrid) return;
        setOpenState('layout');
        setExpanded(undefined);
        setPickingTable(true);
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
      if (event.key === 'Escape') {
        setOpenState(undefined);
        setExpanded(undefined);
        setPickingTable(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const { questions: questionEntries, layout: offeredLayout } = buildInsertEntries({
    m,
    english: lang === 'en',
    worksheet,
    afterId,
    labelFor,
    typeDestinations,
    addQuestion,
    addLayoutElement,
    insertBlockAtAnchor,
  });

  const tableEntry = offeredLayout.find((entry) => entry.pickTable);

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
          className="absolute left-[76px] top-2 max-h-[calc(100%-1rem)] w-[260px] origin-top-left animate-pop-in overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface-raised p-2 shadow-2xl"
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
          {pickingTable && active.id === 'layout' ? (
            <div className="px-1 pb-1">
              <button
                type="button"
                onClick={() => setPickingTable(false)}
                className="mb-1 cursor-pointer rounded-md px-1.5 py-1 text-[11px] text-ink-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                ‹ {m.back}
              </button>
              <TableSizePicker
                onDismiss={() => setOpen(undefined)}
                onPick={(rows, columns) => {
                  tableEntry?.pickTable?.(rows, columns, afterId);
                  setOpen(undefined);
                }}
              />
            </div>
          ) : (
            active.entries.map((entry) => (
              <div key={entry.id}>
                <EntryButton
                  entry={entry}
                  expanded={entry.choices ? expanded === entry.id : undefined}
                  onClick={() => {
                    if (entry.choices) setExpanded(expanded === entry.id ? undefined : entry.id);
                    else if (entry.pickTable) setPickingTable(true);
                    else {
                      entry.run?.(afterId);
                      setOpen(undefined);
                    }
                  }}
                />
                {entry.choices && expanded === entry.id && (
                  <div className="ml-5 border-l border-line pl-1">
                    {entry.choices.map((choice) => (
                      <EntryButton
                        key={choice.id}
                        entry={choice}
                        onClick={() => {
                          choice.run?.(afterId);
                          setOpen(undefined);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
      <input
        id={PICTURE_INPUT}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        data-print-hide
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared straight away so the same file can be picked again.
          event.target.value = '';
          if (!file) return;
          const at = event.target.dataset.insertAfter;
          void imageBlockFromFile(file).then((block) => insertBlockAtAnchor(block, at));
        }}
      />
    </div>
  );
}

function EntryButton({ entry, expanded, onClick }: { entry: Entry; expanded?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-expanded={expanded}
      aria-haspopup={entry.pickTable ? 'dialog' : entry.choices ? 'menu' : undefined}
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 ease-out-soft hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
    >
      <span className="shrink-0 text-ink-subtle">{entry.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink">{entry.label}</span>
        {entry.hint && <span className="block truncate text-[11px] text-ink-subtle">{entry.hint}</span>}
      </span>
    </button>
  );
}
