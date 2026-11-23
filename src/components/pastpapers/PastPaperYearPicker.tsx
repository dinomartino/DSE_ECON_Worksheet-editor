'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronRightIcon } from '@/components/ui/icons';
import { useMessages } from '@/i18n/language';
import type { LanguageMode } from '@/model/types';
import { packName, paperLabel, whenLabel } from '@/pastpapers/pack';
import { stepYearRow, yearRows, type ExamYears, type Sitting, type YearExam } from '@/pastpapers/years';
import { PAST_PAPER_MESSAGES } from './messages';

/**
 * The Past paper bank screen's list by year (k-0497, user u-nlb5): the exams (HKDSE, HKCEE,
 * HKALE), each a collapsible group of its years, newest first, with question counts. A year
 * opens to its questions in paper and question-number order; a year with more than one paper
 * also lists its papers under it, to narrow to one. The keyboard walks it: ↑ / ↓ open the year
 * above or below, Home / End the first and last, → / ← a year's papers.
 *
 * Year and paper names are paper words ("Sample Paper" / "樣本試卷", "Paper 2" / "卷二"): they
 * follow the question language, as every pack name does. Exam names stay English, as the
 * Exam chips are.
 */
export function PastPaperYearPicker({
  groups,
  current,
  paper,
  active,
  language,
  top,
  empty,
  onPick,
  onPickPaper,
}: {
  groups: readonly ExamYears[];
  /** The open year. */
  current?: Sitting;
  /** The open year's one paper, when narrowed to it. */
  paper?: string;
  /** False while the screen shows a search of the whole bank. */
  active: boolean;
  language: LanguageMode;
  /** Drawn above the list (the By topic / By year switch). */
  top?: ReactNode;
  /** Shown under the list when it is empty or partial (a list without its search index). */
  empty?: ReactNode;
  onPick: (key: string) => void;
  onPickPaper: (sitting: string, paper: string | undefined) => void;
}) {
  const m = useMessages(PAST_PAPER_MESSAGES);
  const [closed, setClosed] = useState<ReadonlySet<YearExam>>(() => new Set());
  const list = useRef<HTMLDivElement>(null);
  const focusNext = useRef<string | undefined>(undefined);

  // The open year is brought into view when the list first shows it (CE 1990 sits far down).
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[data-pastpaper-year][aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
    // Only on the first drawing and when the list itself changes.
  }, [groups]);

  // After a keyboard move the focus follows the row it opened.
  useEffect(() => {
    const key = focusNext.current;
    if (key === undefined) return;
    focusNext.current = undefined;
    list.current?.querySelector<HTMLElement>(`[data-pastpaper-row="${key}"]`)?.focus();
  });

  const toggle = (exam: YearExam) =>
    setClosed((now) => {
      const next = new Set(now);
      if (next.has(exam)) next.delete(exam);
      else next.add(exam);
      return next;
    });

  // The rows a keyboard walks: each open exam's years, and the open year's papers.
  const rows = yearRows(groups, closed, current?.key);
  const firstYear = rows[0]?.sitting;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'ArrowRight', 'ArrowLeft'].includes(event.key)) return;
    const id = (event.target as HTMLElement).closest<HTMLElement>('[data-pastpaper-row]')?.dataset.pastpaperRow;
    if (id === undefined) return;
    // The list scrolls only by the moves it makes, never by the arrow key itself.
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') event.preventDefault();
    const row = stepYearRow(rows, id, event.key);
    if (!row) return;
    event.preventDefault();
    focusNext.current = row.id;
    if (row.paper !== undefined) onPickPaper(row.sitting, row.paper);
    else onPick(row.sitting);
  };

  const yearName = (sitting: Sitting) => packName(whenLabel(sitting.source), language);

  const sittingRows = (sitting: Sitting) => {
    const open = active && sitting.key === current?.key;
    const on = open && paper === undefined;
    const many = sitting.papers.length > 1;
    const single = !many ? sitting.papers[0] : undefined;
    return (
      <li key={sitting.key}>
        <button
          type="button"
          aria-current={on ? 'true' : undefined}
          data-pastpaper-year={sitting.key}
          data-pastpaper-row={sitting.key}
          tabIndex={sitting.key === (current?.key ?? firstYear) ? 0 : -1}
          onClick={() => onPick(sitting.key)}
          className={`flex w-full cursor-pointer items-baseline gap-2 py-1.5 pl-10 pr-4 text-left text-[12.5px] transition-colors duration-150 pointer-coarse:py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
            on ? 'bg-accent-soft font-medium text-ink' : open ? 'font-medium text-ink hover:bg-surface-sunken' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
          }`}
        >
          <span className="min-w-0 flex-1 truncate tabular-nums">{yearName(sitting)}</span>
          {single && <span className="shrink-0 text-[11px] text-ink-subtle">{packName(paperLabel(single.source), language)}</span>}
          {many && <span className="shrink-0 text-[11px] text-ink-subtle">{m.paperCount(sitting.papers.length)}</span>}
          <span className="w-7 shrink-0 text-right text-[11px] tabular-nums text-ink-subtle">{sitting.questions}</span>
        </button>
        {open && many && (
          <ul aria-label={m.yearPapers(yearName(sitting))}>
            {sitting.papers.map((p) => {
              const here = paper === p.key;
              return (
                <li key={p.key}>
                  <button
                    type="button"
                    aria-current={here ? 'true' : undefined}
                    data-pastpaper-year-paper={p.key}
                    data-pastpaper-row={p.key}
                    tabIndex={-1}
                    onClick={() => onPickPaper(sitting.key, here ? undefined : p.key)}
                    className={`flex w-full cursor-pointer items-baseline gap-2 py-1 pl-14 pr-4 text-left text-[12px] transition-colors duration-150 pointer-coarse:py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                      here ? 'bg-accent-soft font-medium text-ink' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{packName(paperLabel(p.source), language)}</span>
                    <span className="w-7 shrink-0 text-right text-[11px] tabular-nums text-ink-subtle">{p.questions}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </li>
    );
  };

  return (
    <nav aria-label={m.yearsNav} data-pastpaper-years className="flex max-h-[45vh] w-full shrink-0 flex-col border-b border-line md:max-h-none md:w-[280px] md:border-b-0 md:border-r">
      {top}
      <div className="flex shrink-0 items-center px-4 pb-1 pt-3">
        <h2 className="flex-1 pl-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-subtle">{m.yearsNav}</h2>
      </div>
      <div ref={list} className="scroll-slim min-h-0 flex-1 overflow-y-auto pb-3" onKeyDown={onKeyDown}>
        {groups.length === 0 && !empty && <p className="px-5 py-2 text-[12.5px] text-ink-muted">{m.noYears}</p>}
        <ul>
          {groups.map((group) => {
            const expanded = !closed.has(group.exam);
            const listId = `pastpaper-exam-${group.exam}`;
            return (
              <li key={group.exam} data-pastpaper-exam={group.exam}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={listId}
                  onClick={() => toggle(group.exam)}
                  className="flex w-full cursor-pointer items-center gap-2 py-1.5 pl-3 pr-4 text-[12.5px] font-semibold text-ink transition-colors duration-150 hover:bg-surface-sunken pointer-coarse:py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                >
                  <ChevronRightIcon size={14} className={`shrink-0 text-ink-subtle transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`} />
                  <span className="min-w-0 flex-1 text-left">{group.exam}</span>
                  <span className="shrink-0 text-[11px] font-normal tabular-nums text-ink-subtle" title={m.partQuestions(group.questions)}>
                    {m.yearCount(group.sittings.length)} · {group.questions}
                  </span>
                </button>
                {expanded && (
                  <ul id={listId} className="pb-1">
                    {group.sittings.map(sittingRows)}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        {empty}
        {groups.length > 0 && <p className="hidden px-5 pt-3 text-[11px] leading-snug text-ink-subtle pointer-fine:block">{m.yearKeys}</p>}
      </div>
    </nav>
  );
}

/** By topic / By year (k-0497): how the bank lists its questions, remembered on this computer. */
export function ViewSwitch({
  value,
  onChange,
  className = 'shrink-0 px-4 pt-3',
}: {
  value: 'topic' | 'year';
  onChange: (next: 'topic' | 'year') => void;
  className?: string;
}) {
  const m = useMessages(PAST_PAPER_MESSAGES);
  const options = [
    { id: 'topic' as const, label: m.byTopic },
    { id: 'year' as const, label: m.byYear },
  ];
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = value === 'topic' ? 'year' : 'topic';
    onChange(next);
    event.currentTarget.querySelector<HTMLElement>(`[data-pastpaper-view="${next}"]`)?.focus();
  };
  return (
    <div className={className}>
      <div role="radiogroup" aria-label={m.viewLabel} onKeyDown={move} className="flex rounded-lg border border-line p-0.5" data-pastpaper-view-switch>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={value === option.id}
            tabIndex={value === option.id ? 0 : -1}
            data-pastpaper-view={option.id}
            onClick={() => onChange(option.id)}
            className={`flex-1 cursor-pointer rounded-md px-2 py-1 text-[12.5px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent pointer-coarse:py-2 ${
              value === option.id ? 'bg-surface-sunken font-medium text-ink' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
