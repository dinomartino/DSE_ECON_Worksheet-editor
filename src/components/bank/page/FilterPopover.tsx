'use client';

import { useEffect, useRef, useState } from 'react';
import { useModalLayer } from '@/components/ui/modalLayer';
import { listQuestionTypes } from '@/registry';
import { samePattern, type PatternItem } from '@/library/patterns';
import { holdsPatterns } from '@/model/patterns';
import { topicDisplay } from '@/model/topics';
import {
  activeFilters,
  classChoiceText,
  DEFAULT_FILTERS,
  MARKS_BANDS,
  missingLabel,
  SINCE_CHOICES,
  typeName,
  type BankFilters,
  type ClassChoice,
  type MarksBand,
  type Since,
  type SourceFilter,
} from './bankPage';

/**
 * Every narrowing filter behind one "Filter" button: type, 題型, marks, not used with a
 * class (and since when), a missing language, source. The button names what is on. While open the popover owns the
 * keyboard (`useModalLayer`), so Esc closes it rather than leaving the level.
 */
export function FilterPopover({
  filters,
  classes,
  patterns,
  scope,
  onChange,
}: {
  /** The page's filters; `text` and `topic` are the bar's and the level's, not shown here. */
  filters: BankFilters;
  /** Cohorts and plain classes that sat a paper (`classChoices`). */
  classes: ClassChoice[];
  /** The 題型 in use within the topic on screen (`listPatterns`). */
  patterns: PatternItem[];
  /** The topic on screen: a sub-topic's 題型 read by name alone. */
  scope: string;
  onChange: (next: BankFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const on = activeFilters({ ...filters, text: '', topic: 'all' });
  const label = on.length === 0 ? 'Filter' : `Filter · ${on.map((f) => f.label).join(', ')}`;
  const shown = filterButtonLabel(on.map((f) => f.label));
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
        title={label}
        aria-label={label}
        className={`inline-flex h-8 max-w-[280px] cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] transition-colors duration-150 ease-out-soft hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          on.length > 0 ? 'border-line-strong bg-surface text-ink' : 'border-line bg-surface text-ink-muted hover:text-ink'
        }`}
      >
        <span className="truncate">{shown.text}</span>
        {shown.count !== undefined && (
          <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent-soft px-1 text-[11px] font-semibold tabular-nums text-accent-ink">
            {shown.count}
          </span>
        )}
        <span aria-hidden className="text-[10px] text-ink-subtle">
          ▾
        </span>
      </button>
      {open && (
        <Panel filters={filters} classes={classes} patterns={patterns} scope={scope} onChange={onChange} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

/** Longest single filter the button names in full; past it, or with several, it counts. */
const FILTER_LABEL_MAX = 22;

/**
 * What the Filter button says: "Filter", "Filter · MCQ" for one short filter, else
 * "Filters" and a count. The full list stays in its tooltip and accessible name, and the
 * button never truncates mid-word.
 */
export function filterButtonLabel(labels: readonly string[]): { text: string; count?: number } {
  if (labels.length === 0) return { text: 'Filter' };
  if (labels.length === 1 && labels[0].length <= FILTER_LABEL_MAX) return { text: `Filter · ${labels[0]}` };
  return { text: labels.length === 1 ? 'Filter' : 'Filters', count: labels.length };
}

function Panel({
  filters,
  classes,
  patterns,
  scope,
  onChange,
  onClose,
}: {
  filters: BankFilters;
  classes: ClassChoice[];
  patterns: PatternItem[];
  scope: string;
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
  const chosenClass = classes.find((entry) => entry.id === filters.notUsedWith?.id) ?? filters.notUsedWith;
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
      <Field label="題型">
        <Select
          value={patternValue(patterns, filters)}
          disabled={patterns.length === 0 && !filters.pattern}
          title={patterns.length === 0 ? 'No question here has a 題型 yet' : undefined}
          onChange={(value) => set('pattern', patterns[Number(value)] ? toId(patterns[Number(value)]) : undefined)}
          options={[
            { value: '', label: patterns.length === 0 ? 'No 題型 yet' : 'Any 題型' },
            // Closed, the chosen 題型 reads by its name: the sub-topic would push it out of view.
            ...patterns.map((item, index) => ({ value: String(index), label: patternOption(item, scope), closedLabel: patternOption(item, item.topic) })),
          ]}
        />
      </Field>
      <Field label="Marks">
        <Select
          value={filters.marks}
          onChange={(value) => set('marks', value as MarksBand)}
          options={MARKS_BANDS.map((band) => ({ value: band.value, label: band.label }))}
        />
      </Field>
      <Field label="Class" note={chosenClass && classChoiceText(chosenClass).note}>
        <Select
          value={filters.notUsedWith?.id ?? ''}
          disabled={classes.length === 0}
          title={classes.length === 0 ? 'Say which classes sat a paper in Setup to use this' : chosenClass ? classChoiceText(chosenClass).open : undefined}
          onChange={(value) => {
            const choice = classes.find((entry) => entry.id === value);
            onChange({ ...filters, notUsedWith: choice, since: choice ? filters.since : 'ever' });
          }}
          options={[
            { value: '', label: classes.length === 0 ? 'No classes yet' : 'Any class' },
            // The open list tells the whole story; the closed select shows the short form.
            ...classes.map((choice) => {
              const text = classChoiceText(choice);
              return { value: choice.id, label: text.open, closedLabel: text.closed };
            }),
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
      <Field label="Language">
        <Select
          value={filters.missing ?? ''}
          onChange={(value) => set('missing', value === 'zh' || value === 'en' ? value : undefined)}
          options={[
            { value: '', label: 'Any language' },
            { value: 'zh', label: missingLabel('zh') },
            { value: 'en', label: missingLabel('en') },
          ]}
        />
      </Field>
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

const toId = (item: PatternItem) => ({ topic: item.topic, typeId: item.typeId, name: item.name });

/** The chosen 題型's index in the list, as the select's value; '' for none. */
function patternValue(patterns: PatternItem[], filters: BankFilters): string {
  const chosen = filters.pattern;
  if (!chosen) return '';
  const at = patterns.findIndex((item) => samePattern(item, chosen));
  return at >= 0 ? String(at) : '';
}

/** "Calculate PED from TR · MCQ ×3"; the sub-topic's name first unless the page is that sub-topic. */
function patternOption(item: PatternItem, scope: string): string {
  const where = holdsPatterns(scope) ? '' : `${topicDisplay(item.topic)} · `;
  return `${where}${item.name} · ${typeName(item.typeId)} ×${item.count}`;
}

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 text-[12px] text-ink-subtle">
      {label}
      {children}
      {note && <span className="col-start-2 whitespace-normal text-[11.5px] leading-snug text-ink-muted">{note}</span>}
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
  /** `closedLabel`: what the chosen option reads as, so the closed select is not cut off. */
  options: { value: string; label: string; closedLabel?: string }[];
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
        <option key={option.value} value={option.value} title={option.label}>
          {option.value === value && option.closedLabel ? option.closedLabel : option.label}
        </option>
      ))}
    </select>
  );
}
