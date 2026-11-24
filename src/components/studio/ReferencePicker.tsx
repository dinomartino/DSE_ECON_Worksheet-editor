'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PastPaperIndexCard } from '@/components/pastpapers/PastPaperIndexCard';
import { BankStateNote, SearchGlyph } from '@/components/pastpapers/PastPaperControls';
import { PastPaperSheet } from '@/components/pastpapers/PastPaperSheet';
import { PastPaperTopicPicker } from '@/components/pastpapers/PastPaperTopicPicker';
import { PastPaperYearPicker, ViewSwitch } from '@/components/pastpapers/PastPaperYearPicker';
import { usePastPaperBrowse, type BrowseEntry } from '@/components/pastpapers/usePastPaperBrowse';
import { isImeKeydown } from '@/components/ui/ime';
import { CloseIcon } from '@/components/ui/icons';
import { useModalLayer } from '@/components/ui/modalLayer';
import { useMessages } from '@/i18n/language';
import type { LanguageMode } from '@/model/types';
import { packName } from '@/pastpapers/pack';
import type { PastPaperItem } from '@/pastpapers/pack';
import { sourceFromQuestion } from '@/questionStudio/source';
import type { SourceQuestion } from '@/questionStudio/types';
import { MyQuestionsPane, type MineChoice } from './MyQuestionsPane';
import { REFERENCE_PICKER_MESSAGES } from './picker.messages';
import { keyPointOfTags } from './studioView';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** The studio's source of a bank item, exactly as the Past paper screen's "Write like this" builds it. */
export function referenceOf(item: PastPaperItem, label: string): { source: SourceQuestion; keyPoint?: string } | undefined {
  const mcq = item.question.type === 'mcq' ? item.question : undefined;
  if (!mcq) return undefined;
  return {
    source: sourceFromQuestion(mcq, { id: item.source.tag || mcq.id, label, passage: item.stimulus?.blocks }),
    keyPoint: keyPointOfTags(mcq.tags),
  };
}

/** The entries a card can show: multiple-choice questions only; with `onlyDiagram`, those with a figure. */
export function keepEntries(entries: readonly BrowseEntry[], built: ReadonlyMap<string, { source: SourceQuestion }>, onlyDiagram: boolean): BrowseEntry[] {
  return entries.filter((entry) => {
    if (entry.item) {
      const made = built.get(entry.key);
      return made !== undefined && (!onlyDiagram || made.source.hasFigure);
    }
    return !onlyDiagram || (entry.row?.pictures ?? 0) > 0;
  });
}

/** Where the picker's questions come from: the Past paper bank, or the teacher's own (k-0529). */
export type PickerSource = 'past' | 'mine';
/** The side last used, for the next time the picker opens (this session). */
const lastSource: { side: PickerSource } = { side: 'past' };
const rememberSource = (side: PickerSource) => {
  lastSource.side = side;
};

/**
 * A modal over the Question studio: a question to use as the reference the AI writes like.
 * Two sides: any Past paper bank question, drawn as it prints (k-0516; reuses the Past paper
 * screen's browse state, topic and year pickers, search and bank-state notes), or one of the
 * teacher's own questions from their papers and 題庫 (k-0529, `MyQuestionsPane`). Only
 * multiple-choice questions can be picked.
 */
export function ReferencePicker({
  open,
  onClose,
  onPick,
  language,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (source: SourceQuestion, keyPoint?: string, item?: PastPaperItem) => void;
  language: LanguageMode;
}) {
  if (!open) return null;
  return <PickerDialog onClose={onClose} onPick={onPick} language={language} />;
}

function PickerDialog({ onClose, onPick, language }: { onClose: () => void; onPick: (source: SourceQuestion, keyPoint?: string, item?: PastPaperItem) => void; language: LanguageMode }) {
  useModalLayer();
  const m = useMessages(REFERENCE_PICKER_MESSAGES);
  const browse = usePastPaperBrowse();
  const { topics, topic, filters, setFilters, entries, sitting } = browse;
  const byYear = browse.view === 'year';
  const searchingAll = byYear ? browse.searchingAll : browse.acrossBank;
  const [onlyDiagram, setOnlyDiagram] = useState(false);
  const [selected, setSelected] = useState<string | undefined>();
  const panel = useRef<HTMLDivElement>(null);
  // The bank switched off here: open on the teacher's own questions.
  const pastOff = !browse.base || browse.bank.status === 'off' || browse.bank.status === 'disabled';
  const [side, setSideState] = useState<PickerSource>(() => (pastOff ? 'mine' : lastSource.side));
  const setSide = (next: PickerSource) => {
    rememberSource(next);
    setSideState(next);
  };
  const [mineWords, setMineWords] = useState('');
  const [mineChoice, setMineChoice] = useState<MineChoice | undefined>();
  const mine = side === 'mine';

  // Focus moves in on open and returns to what had it on close; Tab stays inside; Esc closes.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isImeKeydown(event)) {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel.current) return;
      const nodes = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const at = document.activeElement;
      if (!panel.current.contains(at) || (event.shiftKey && (at === first || at === panel.current))) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && at === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, [onClose]);

  const labelOf = useCallback((item: PastPaperItem) => packName(item.provenance, language), [language]);
  const built = useMemo(() => {
    const map = new Map<string, { source: SourceQuestion; keyPoint?: string; item: PastPaperItem }>();
    for (const entry of entries) {
      if (!entry.item) continue;
      const made = referenceOf(entry.item, labelOf(entry.item));
      if (made) map.set(entry.key, { ...made, item: entry.item });
    }
    return map;
  }, [entries, labelOf]);

  const shown = useMemo(() => keepEntries(entries, built, onlyDiagram), [entries, built, onlyDiagram]);

  const chosen = selected !== undefined ? built.get(selected) : undefined;
  const chosenLabel = mine ? mineChoice?.label : chosen?.source.label;
  const topicName = (id: string) => {
    const entry = topics.find((t) => t.id === id);
    return entry ? packName(entry.title, language) : id;
  };
  const pickMine = useCallback(
    (ref: { source: SourceQuestion; keyPoint?: string; item: PastPaperItem }) => {
      onPick(ref.source, ref.keyPoint, ref.item);
      onClose();
    },
    [onPick, onClose],
  );
  const use = (key: string | undefined) => {
    const made = key !== undefined ? built.get(key) : undefined;
    if (!made) return;
    onPick(made.source, made.keyPoint, made.item);
    onClose();
  };

  const button = 'cursor-pointer rounded-lg border border-line bg-surface px-3.5 py-1.5 text-[13px] text-ink hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-print-hide data-reference-picker>
      <div className="absolute inset-0 animate-scrim-in bg-scrim backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={m.title}
        tabIndex={-1}
        style={{ width: 'min(1120px, calc(100vw - 60px))', height: 'min(760px, calc(100vh - 60px))' }}
        className="zone-light relative flex animate-dialog-in flex-col overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-2xl outline-none"
      >
        <header className="flex shrink-0 items-center gap-4 border-b border-line px-5 py-3.5">
          <h2 className="min-w-0 shrink truncate font-display text-[19px] font-normal leading-snug text-ink">{m.title}</h2>
          <div role="radiogroup" aria-label={m.sources} className="flex shrink-0 rounded-lg bg-surface-sunken p-0.5" data-picker-sources>
            {(['past', 'mine'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={side === s}
                onClick={() => setSide(s)}
                data-picker-source={s}
                className={`cursor-pointer rounded-md px-3 py-1 text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  side === s ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {s === 'past' ? m.sourcePast : m.sourceMine}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          {mine && (
            <label className="relative w-[min(340px,30vw)] min-w-[200px]">
              <span className="sr-only">{m.mineSearch}</span>
              <input
                type="search"
                value={mineWords}
                placeholder={m.mineSearchPlaceholder}
                onChange={(event) => setMineWords(event.target.value)}
                data-my-search
                className="h-8 w-full rounded-lg border border-transparent bg-surface-sunken pl-8 pr-2.5 text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/25"
              />
              <SearchGlyph />
            </label>
          )}
          {!mine && browse.bank.status === 'ready' && (
            <label className="relative w-[min(340px,30vw)] min-w-[200px]">
              <span className="sr-only">{m.search}</span>
              <input
                type="search"
                value={filters.words}
                placeholder={m.searchPlaceholder}
                onChange={(event) => setFilters({ ...filters, words: event.target.value, everywhere: event.target.value.trim() !== '' })}
                className="h-8 w-full rounded-lg border border-transparent bg-surface-sunken pl-8 pr-2.5 text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/25"
              />
              <SearchGlyph />
            </label>
          )}
          <button
            type="button"
            aria-label={m.close}
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <CloseIcon size={16} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          {mine ? (
            <MyQuestionsPane words={mineWords} language={language} onChoice={setMineChoice} onPick={pickMine} />
          ) : (
          <BankStateNote browse={browse}>
            <div className="flex min-h-0 flex-1">
              {/* A row, so the rail (a column that sizes to its list) is stretched to the dialog's
                  height and its list scrolls inside it (u-na4k: in a column it grew past the
                  footer and the topics below could not be reached). */}
              <div className="flex min-h-0 shrink-0 border-r border-line bg-surface-sunken [&>nav]:min-h-0" aria-label={m.rail} data-reference-rail>
                {byYear ? (
                  <PastPaperYearPicker
                    groups={browse.yearGroups}
                    current={sitting}
                    paper={browse.yearPaper}
                    active={!searchingAll}
                    language={language}
                    top={<ViewSwitch value={browse.view} onChange={browse.setView} />}
                    onPick={(key) => {
                      browse.setSitting(key);
                      if (filters.everywhere || filters.paper !== undefined) setFilters({ ...filters, everywhere: false, paper: undefined });
                    }}
                    onPickPaper={(key, paper) => {
                      browse.setSitting(key);
                      setFilters({ ...filters, everywhere: false, paper });
                    }}
                  />
                ) : (
                  <PastPaperTopicPicker
                    topics={topics}
                    current={topic}
                    active={!searchingAll}
                    language={language}
                    top={<ViewSwitch value={browse.view} onChange={browse.setView} />}
                    onPick={(id) => {
                      browse.setTopic(id);
                      if (filters.everywhere || filters.paper !== undefined) setFilters({ ...filters, everywhere: false, paper: undefined });
                    }}
                  />
                )}
              </div>
              <div className="scroll-slim min-h-0 min-w-0 flex-1 overflow-y-auto bg-desk p-4">
                <p className="mb-3 text-[12px] tabular-nums text-ink-subtle" role="status">
                  {m.shown(shown.length)}
                </p>
                {shown.length === 0 && browse.poolSize > 0 && <p className="text-[13px] text-ink-muted">{m.empty}</p>}
                <div className="grid grid-cols-1 gap-3.5 min-[1000px]:grid-cols-2">
                  {shown.map((entry: BrowseEntry) => {
                    const item = entry.item;
                    if (!item) return <PastPaperIndexCard key={entry.key} entry={entry} topicName={topicName(entry.topicId)} language={language} />;
                    const doc = browse.docOf.get(item.topicId);
                    const made = built.get(entry.key);
                    if (!doc || !made) return null;
                    const key = entry.key;
                    const on = selected === key;
                    const label = labelOf(item);
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={on}
                        aria-label={m.cardLabel(label)}
                        data-reference-card={entry.tag}
                        data-figure={made.source.hasFigure ? '' : undefined}
                        onClick={() => setSelected(key)}
                        onDoubleClick={() => use(key)}
                        className={`flex min-w-0 cursor-pointer flex-col rounded-xl border bg-surface p-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          on ? 'border-accent ring-2 ring-accent/25' : 'border-line hover:border-line-strong'
                        }`}
                      >
                        <span className="mb-2 flex items-center gap-2 px-1">
                          <span className="truncate text-[12.5px] font-medium text-ink">{label}</span>
                          <span className="flex-1" />
                          {made.source.hasFigure && (
                            <span title={m.diagramTitle} className="shrink-0 rounded-full border border-line bg-surface-sunken px-2 py-0.5 text-[11px] text-ink-muted" data-reference-figure>
                              {m.diagram}
                            </span>
                          )}
                        </span>
                        <span className="pointer-events-none block">
                          <PastPaperSheet item={item} doc={doc} language={language} compact />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </BankStateNote>
          )}
        </div>

        <footer className="flex shrink-0 items-center gap-4 border-t border-line bg-surface-sunken px-5 py-3">
          {!mine && (
            <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-ink-muted">
              <input type="checkbox" checked={onlyDiagram} onChange={(e) => setOnlyDiagram(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
              {m.onlyDiagram}
            </label>
          )}
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-muted" role="status">
            {chosenLabel ? m.selected(chosenLabel) : m.noneSelected}
          </span>
          <button type="button" className={button} onClick={onClose}>
            {m.cancel}
          </button>
          <button
            type="button"
            disabled={!chosenLabel}
            onClick={() => (mine ? mineChoice?.use() : use(selected))}
            className="cursor-pointer rounded-lg bg-cta px-3.5 py-1.5 text-[13px] font-medium text-on-cta hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:opacity-50"
          >
            {m.use}
          </button>
        </footer>
      </div>
    </div>
  );
}

