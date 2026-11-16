'use client';

import type { ReactNode } from 'react';
import { useMessages } from '@/i18n/language';
import type { LanguageMode } from '@/model/types';
import { useAppDialogs } from '@/store/appDialogs';
import { PAST_PAPER_MESSAGES } from './messages';
import { EXAMS, type BrowseFilters, type PastPaperBrowse } from './usePastPaperBrowse';

/** Small controls both views of the Past paper bank use. */

const chip = (active: boolean) =>
  `cursor-pointer rounded-full border px-2.5 py-1 text-[12px] leading-none transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
    active ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink'
  }`;

export function ExamChips({ filters, onChange }: { filters: BrowseFilters; onChange: (next: BrowseFilters) => void }) {
  const m = useMessages(PAST_PAPER_MESSAGES);
  return (
    <div role="group" aria-label={m.exam} className="flex flex-wrap items-center gap-1.5">
      <button type="button" aria-pressed={filters.exams.length === 0} className={chip(filters.exams.length === 0)} onClick={() => onChange({ ...filters, exams: [] })}>
        {m.allExams}
      </button>
      {EXAMS.map((exam) => {
        const on = filters.exams.includes(exam);
        return (
          <button
            key={exam}
            type="button"
            aria-pressed={on}
            className={chip(on)}
            onClick={() => onChange({ ...filters, exams: on ? filters.exams.filter((e) => e !== exam) : [...filters.exams, exam] })}
          >
            {exam}
          </button>
        );
      })}
    </div>
  );
}

export function YearSelects({
  filters,
  years,
  onChange,
}: {
  filters: BrowseFilters;
  years: { from: number; to: number } | undefined;
  onChange: (next: BrowseFilters) => void;
}) {
  const m = useMessages(PAST_PAPER_MESSAGES);
  if (!years) return null;
  const list: number[] = [];
  for (let y = years.from; y <= years.to; y += 1) list.push(y);
  const select = 'h-7 rounded-md border border-line bg-surface px-1.5 text-[12px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';
  const value = (y: number | undefined) => (y === undefined ? '' : String(y));
  const read = (v: string) => (v === '' ? undefined : Number(v));
  return (
    <div className="flex items-center gap-1.5 text-[12px] text-ink-muted">
      <span>{m.years}</span>
      <select aria-label={m.yearFrom} className={select} value={value(filters.from)} onChange={(e) => onChange({ ...filters, from: read(e.target.value) })}>
        <option value="">{m.anyYear}</option>
        {list.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <span aria-hidden>–</span>
      <select aria-label={m.yearTo} className={select} value={value(filters.to)} onChange={(e) => onChange({ ...filters, to: read(e.target.value) })}>
        <option value="">{m.anyYear}</option>
        {list.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}

export function LanguageToggle({ value, onChange }: { value: LanguageMode; onChange: (next: LanguageMode) => void }) {
  const m = useMessages(PAST_PAPER_MESSAGES);
  const options: { id: LanguageMode; label: string }[] = [
    { id: 'en', label: 'EN' },
    { id: 'zh', label: '中文' },
  ];
  return (
    <div role="radiogroup" aria-label={m.paperLanguage} className="flex rounded-md border border-line p-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          onClick={() => onChange(option.id)}
          className={`cursor-pointer rounded px-2 py-0.5 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            value === option.id ? 'bg-surface-sunken font-medium text-ink' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The bank's own states (off, loading, unavailable, an error): one line and, where it helps, a button. */
export function BankStateNote({ browse, children }: { browse: PastPaperBrowse; children?: ReactNode }) {
  const m = useMessages(PAST_PAPER_MESSAGES);
  const { bank } = browse;
  const button = 'mt-3 cursor-pointer rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] text-ink hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';
  if (!browse.base || bank.status === 'off') {
    return (
      <div className="m-7 max-w-md text-[13px] leading-relaxed text-ink-muted">
        <p>{m.off}</p>
        <button type="button" className={button} onClick={() => useAppDialogs.getState().openSettings({ section: 'pastPapers' })}>
          {m.turnOn}
        </button>
      </div>
    );
  }
  if (bank.status === 'disabled') return <p className="m-7 max-w-md text-[13px] leading-relaxed text-ink-muted">{m.disabled}</p>;
  if (bank.status === 'error') {
    return (
      <div className="m-7 max-w-md text-[13px] leading-relaxed text-ink-muted" role="alert">
        <p>{m.error(bank.reason ?? 'http')}</p>
        <button type="button" className={button} onClick={() => void bank.open(true)}>
          {m.retry}
        </button>
      </div>
    );
  }
  if (bank.status !== 'ready') return <p className="m-7 text-[13px] text-ink-muted" role="status">{m.loading}</p>;
  return <>{children}</>;
}

export function SearchGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" strokeLinecap="round" />
    </svg>
  );
}
