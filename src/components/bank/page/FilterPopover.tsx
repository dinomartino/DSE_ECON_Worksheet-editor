'use client';

import { useEffect, useRef, useState } from 'react';
import { useModalLayer } from '@/components/ui/modalLayer';
import { listQuestionTypes } from '@/registry';
import {
  activeFilters,
  DEFAULT_FILTERS,
  MARKS_BANDS,
  SINCE_CHOICES,
  typeName,
  type BankFilters,
  type MarksBand,
  type Since,
  type SourceFilter,
} from './bankPage';

/**
 * Every narrowing filter behind one "Filter" button: type, marks, not used with a class
 * (and since when), source. The button names what is on. While open the popover owns the
 * keyboard (`useModalLayer`), so Esc closes it rather than leaving the level.
 */
export function FilterPopover({
  filters,
  classes,
  onChange,
}: {
  /** The page's filters; `text` and `topic` are the bar's and the level's, not shown here. */
  filters: BankFilters;
  classes: string[];
  onChange: (next: BankFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const on = activeFilters({ ...filters, text: '', topic: 'all' });
  const label = on.length === 0 ? 'Filter' : `Filter · ${on.map((f) => f.label).join(', ')}`;
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
        title={label}
        className={`inline-flex h-8 max-w-[280px] cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] transition-colors duration-150 ease-out-soft hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          on.length > 0 ? 'border-line-strong bg-surface text-ink' : 'border-line bg-surface text-ink-muted hover:text-ink'
        }`}
      >
        <span className="truncate">{label}</span>
        <span aria-hidden className="text-[10px] text-ink-subtle">
          ▾
        </span>
      </button>
      {open && <Panel filters={filters} classes={classes} onChange={onChange} onClose={() => setOpen(false)} />}
    </div>
  );
}

function Panel({
  filters,
  classes,
  onChange,
  onClose,
}: {
  filters: BankFilters;
  classes: string[];
  onChange: (next: BankFilters) => void;
  onClose: () => void;
}) {
  useModalLayer();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onDown = (event: PointerEvent) => {
      const panel = ref.current;
      // The trigger toggles itself; anything else outside closes.
      if (panel && !panel.parentElement?.contains(event.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  const set = <K extends keyof BankFilters>(key: K, value: BankFilters[K]) => onChange({ ...filters, [key]: value });
  const narrowed = activeFilters({ ...filters, text: '', topic: 'all' }).length > 0;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Filter questions"
      className="absolute right-0 top-[calc(100%+6px)] z-30 grid w-[300px] origin-top-right animate-pop-in gap-3 rounded-xl border border-line-strong bg-surface-raised p-3.5 shadow-[0_12px_32px_-12px_rgba(40,36,30,0.35)]"
    >
      <Field label="Type">
        <Select
          value={filters.typeId ?? ''}
          onChange={(value) => set('typeId', value || undefined)}
          options={[{ value: '', label: 'Any type' }, ...listQuestionTypes().map((type) => ({ value: type.id, label: typeName(type.id) }))]}
        />
      </Field>
      <Field label="Marks">
        <Select
          value={filters.marks}
          onChange={(value) => set('marks', value as MarksBand)}
          options={MARKS_BANDS.map((band) => ({ value: band.value, label: band.label }))}
        />
      </Field>
      <Field label="Class">
        <Select
          value={filters.notUsedWith ?? ''}
          disabled={classes.length === 0}
          title={classes.length === 0 ? 'Give a worksheet a class in Setup to use this' : undefined}
          onChange={(value) => onChange({ ...filters, notUsedWith: value || undefined, since: value ? filters.since : 'ever' })}
          options={[
            { value: '', label: classes.length === 0 ? 'No classes yet' : 'Any class' },
            ...classes.map((tag) => ({ value: tag, label: `Not used with ${tag}` })),
          ]}
        />
      </Field>
      {filters.notUsedWith && (
        <Field label="Since">
          <Select
            value={filters.since}
            onChange={(value) => set('since', value as Since)}
            options={SINCE_CHOICES.map((choice) => ({ value: choice.value, label: choice.label }))}
          />
        </Field>
      )}
      <Field label="Source">
        <Select
          value={filters.source}
          onChange={(value) => set('source', value as SourceFilter)}
          options={[
            { value: 'all', label: 'All sources' },
            { value: 'paper', label: 'Worksheets' },
            { value: 'bank', label: 'Banks' },
          ]}
        />
      </Field>
      <div className="flex items-center justify-between border-t border-line pt-2.5">
        <button
          type="button"
          disabled={!narrowed}
          onClick={() => onChange({ ...DEFAULT_FILTERS, text: filters.text, topic: filters.topic })}
          className="cursor-pointer text-[12px] font-medium text-accent-ink underline decoration-line-strong underline-offset-4 hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:text-ink-subtle disabled:no-underline"
        >
          Clear filters
        </button>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-md px-2 py-1 text-[12px] font-medium text-ink-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2.5 text-[12px] text-ink-subtle">
      {label}
      {children}
    </label>
  );
}

function Select({
  value,
  options,
  onChange,
  disabled,
  title,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <select
      value={value}
      title={title}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={`h-8 w-full cursor-pointer rounded-lg border bg-surface px-2 text-[12.5px] outline-none transition-colors duration-150 ease-out-soft focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:cursor-default disabled:opacity-50 ${
        value && value !== options[0]?.value ? 'border-line-strong text-ink' : 'border-line text-ink-muted'
      }`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
