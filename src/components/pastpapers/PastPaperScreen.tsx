'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { escapeClears } from '@/components/bank/escapeClears';
import { revealQuestion } from '@/components/bank/page/bankReturn';
import { useMessages } from '@/i18n/language';
import type { LanguageMode, Worksheet } from '@/model/types';
import { copyIntoMyBank, emptyPaperFor, insertIntoOpen } from '@/pastpapers/actions';
import type { PastPaperItem } from '@/pastpapers/pack';
import { paperLanguage } from '@/settings/paperLanguage';
import { useSettings } from '@/settings/store';
import { PAST_PAPER_SETTINGS } from '@/pastpapers/config';
import { worksheetStore, type WorksheetSummary } from '@/storage';
import { rootIdOf } from '@/model/lineage';
import { PAST_PAPER_MESSAGES } from './messages';
import { BankStateNote, ExamChips, LanguageToggle, PaperSelect, SearchGlyph, YearSelects } from './PastPaperControls';
import { PastPaperIndexCard } from './PastPaperIndexCard';
import { SourceFormatSelect } from './SourceFormatSelect';
import { megabytes, NEARLY_FULL, webStorageUse } from '@/storage/webQuota';
import { packName, sourceLabel } from '@/pastpapers/pack';
import { PastPaperSheet } from './PastPaperSheet';
import { PastPaperTopicPicker } from './PastPaperTopicPicker';
import { answerLetter } from './pastPaperPreview';
import { NO_FILTERS, pickKey, usePastPaperBrowse, type Pick } from './usePastPaperBrowse';

/**
 * The Past paper bank 歷屆試題庫 as its own screen (k-0443): the start screen's view beside
 * the teacher's own Question bank 題庫, never mixed into it. Topics down the left by syllabus
 * part (`PastPaperTopicPicker`), the open topic's questions as they print, picks gathered in a tray at the foot that go into
 * a new worksheet, a new Paper 1, one of the teacher's papers, or their own bank. Read-only:
 * nothing here writes the bank, and its files are never the teacher's documents.
 */
export function PastPaperScreen({
  summaries,
  settings,
  onHome,
  onOpenWorksheet,
  onOpenDocument,
  onNotice,
  onError,
}: {
  summaries: readonly WorksheetSummary[];
  settings?: ReactNode;
  onHome: () => void;
  onOpenWorksheet: (worksheet: Worksheet, language: LanguageMode) => void;
  onOpenDocument: (docId: string, then?: () => void) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const m = useMessages(PAST_PAPER_MESSAGES);
  const browse = usePastPaperBrowse();
  const { bank, topics, topic, topicState, filters, setFilters, entries } = browse;
  const [language, setLanguage] = useState<LanguageMode>(() => (paperLanguage() === 'zh' ? 'zh' : 'en'));
  const [answers, setAnswers] = useState(true);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [target, setTarget] = useState('new:classroom');
  const [busy, setBusy] = useState(false);
  const [loadingAll, setLoadingAll] = useState<{ done: number; total: number } | undefined>();
  // "Show source (year + question no.)": remembered on this computer (u-w7gs).
  const [bankSettings, setBankSettings] = useSettings(PAST_PAPER_SETTINGS);
  const showSources = bankSettings.showSources;
  const sourceFormat = bankSettings.sourceFormat;

  const itemOf = useMemo(() => new Map(browse.allLoaded.map((item) => [pickKey({ topicId: item.topicId, questionId: item.question.id }), item])), [browse.allLoaded]);
  const pickedItems = useMemo(() => picks.flatMap((pick) => itemOf.get(pickKey(pick)) ?? []), [picks, itemOf]);
  const pickedKeys = new Set(picks.map(pickKey));
  const toggle = (item: PastPaperItem) => {
    const key = pickKey({ topicId: item.topicId, questionId: item.question.id });
    setPicks((now) => (now.some((p) => pickKey(p) === key) ? now.filter((p) => pickKey(p) !== key) : [...now, { topicId: item.topicId, questionId: item.question.id }]));
  };

  const papers = useMemo(
    () => [...summaries].filter((s) => s.kind !== 'bank').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12),
    [summaries],
  );

  const sharedTopicName = () => {
    const ids = new Set(pickedItems.map((item) => item.topicId));
    const only = ids.size === 1 ? topics.find((t) => t.id === [...ids][0]) : undefined;
    return only ? packName(only.title, language) : m.newName;
  };

  const addPicks = async () => {
    if (pickedItems.length === 0) return;
    setBusy(true);
    try {
      if (target.startsWith('new:')) {
        const kind = target === 'new:paper1' ? 'paper1' : 'classroom';
        onOpenWorksheet(emptyPaperFor(kind, sharedTopicName()), language);
        const { inserted } = insertIntoOpen(pickedItems, m.added, { showSources, sourceFormat });
        if (inserted.length > 0) setPicks([]);
        if (inserted[0]) revealQuestion(inserted[0]);
        return;
      }
      const saved = await worksheetStore.load(target).catch(() => undefined);
      const held = new Set(saved?.questions.map(rootIdOf) ?? []);
      const fresh = pickedItems.filter((item) => !held.has(rootIdOf(item.question)));
      if (saved && fresh.length === 0) {
        onNotice(m.nothingAdded(pickedItems.length));
        return;
      }
      onOpenDocument(target, () => {
        const { inserted, refused } = insertIntoOpen(pickedItems, m.added, { showSources, sourceFormat });
        if (refused) onError(m.readOnlyPaper);
        if (inserted.length > 0) setPicks([]);
        if (inserted[0]) revealQuestion(inserted[0]);
      });
    } finally {
      setBusy(false);
    }
  };

  const copyPicks = async () => {
    if (pickedItems.length === 0) return;
    setBusy(true);
    try {
      const done = await copyIntoMyBank(pickedItems);
      if (done.copied === 0) onNotice(m.copiedNone(done.already));
      else onNotice(m.copied(done.copied, done.already) + (done.stimuli ? m.copiedWithStimulus(done.stimuli) : ''));
      setPicks([]);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const totalBytes = bank.manifest?.topics.reduce((n, t) => n + (t.bytes ?? 0), 0) ?? 0;
  const searchingAll = browse.acrossBank;
  const allLoaded = browse.loadedCount >= topics.length && topics.length > 0;
  const topicName = (id: string) => {
    const entry = topics.find((t) => t.id === id);
    return entry ? packName(entry.title, language) : id;
  };
  const paperChoice = filters.paper !== undefined ? browse.papers.find((p) => p.key === filters.paper) : undefined;
  const paperName = paperChoice ? packName(sourceLabel(paperChoice.source, false), language) : '';

  // The web build's ~5 MB: what the picks would add, judged before they go in (k-0444).
  const adding = useMemo(
    () => pickedItems.reduce((n, item) => n + JSON.stringify(item.question).length + (item.stimulus ? JSON.stringify(item.stimulus).length : 0), 0),
    [pickedItems],
  );
  const storage = useMemo(() => (adding > 0 ? webStorageUse(adding) : undefined), [adding]);
  const wontFit = storage !== undefined && storage.ratio > 1;

  return (
    <div className="zone-light flex h-full min-h-0 flex-col bg-surface text-ink" data-pastpaper-screen>
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3.5 gap-y-2 whitespace-nowrap border-b border-line bg-surface px-4 py-2 md:h-12 md:flex-nowrap md:py-0">
        <button
          type="button"
          onClick={onHome}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-ink-muted transition-colors duration-150 ease-out-soft hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ← {m.home}
        </button>
        <h1 className="truncate text-[14px] font-semibold text-ink">{m.title}</h1>
        <span title={m.readOnlyTitle} className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-muted">
          {m.readOnly}
        </span>
        {bank.manifest && <span className="shrink-0 text-[12px] tabular-nums text-ink-subtle">{m.count(bank.manifest.questions)}</span>}
        <span className="flex-1" />
        {bank.status === 'ready' && (
          <label className="relative w-[min(340px,32vw)] min-w-[200px]">
            <span className="sr-only">{m.searchLabel}</span>
            <input
              type="search"
              value={filters.words}
              title={m.searchHint}
              placeholder={
                filters.everywhere
                  ? browse.indexed
                    ? m.searchEvery
                    : m.searchOpened
                  : topic
                    ? m.searchIn(packName(topic.title, language))
                    : m.searchLabel
              }
              onChange={(event) => setFilters({ ...filters, words: event.target.value })}
              onKeyDown={(event) => void escapeClears(event, filters.words, () => setFilters({ ...filters, words: '' }))}
              className="h-8 w-full rounded-lg border border-transparent bg-surface-sunken pl-8 pr-2.5 text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/25"
            />
            <SearchGlyph />
          </label>
        )}
        {settings}
      </header>

      {/* A phone-width window stacks the topic bar over the questions (u-zhww asked for a phone look). */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <BankStateNote browse={browse}>
          <PastPaperTopicPicker
            topics={topics}
            current={topic}
            active={!searchingAll}
            language={language}
            onPick={(id) => {
              browse.setTopic(id);
              if (filters.everywhere || filters.paper !== undefined) setFilters({ ...filters, everywhere: false, paper: undefined });
            }}
          />

          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-6 py-2.5">
              <h2 className="text-[15px] font-semibold text-ink">
                {paperChoice ? m.paperHeading(paperName) : searchingAll ? m.scopeAll : topic ? packName(topic.title, language) : ''}
              </h2>
              <span className="text-[12px] tabular-nums text-ink-subtle" role="status">
                {m.shown(entries.length, browse.poolSize)}
              </span>
              <span className="flex-1" />
              {filters.words.trim() !== '' && (
                <div role="radiogroup" aria-label={m.scopeLabel} className="flex rounded-md border border-line p-0.5">
                  {[false, true].map((all) => (
                    <button
                      key={String(all)}
                      type="button"
                      role="radio"
                      aria-checked={filters.everywhere === all}
                      onClick={() => setFilters({ ...filters, everywhere: all })}
                      className={`cursor-pointer rounded px-2 py-0.5 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        filters.everywhere === all ? 'bg-surface-sunken font-medium text-ink' : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      {all ? m.scopeAll : m.scopeTopic}
                    </button>
                  ))}
                </div>
              )}
              <ExamChips filters={filters} onChange={setFilters} />
              <YearSelects filters={filters} years={browse.years} onChange={setFilters} />
              <PaperSelect filters={filters} papers={browse.papers} language={language} onChange={setFilters} />
              <LanguageToggle value={language} onChange={setLanguage} />
              <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-ink-muted">
                <input type="checkbox" checked={answers} onChange={(e) => setAnswers(e.target.checked)} className="accent-[var(--color-accent)]" />
                {m.showAnswers}
              </label>
            </div>

            <div className="scroll-slim min-h-0 flex-1 overflow-y-auto bg-desk px-6 py-5">
              <div className="mx-auto flex max-w-[860px] flex-col gap-4">
                {searchingAll && browse.indexed && <p className="text-[12px] text-ink-subtle">{m.indexNote}</p>}
                {searchingAll && !browse.indexed && !allLoaded && (
                  <div className="rounded-lg border border-line bg-surface px-4 py-3 text-[12.5px] text-ink-muted">
                    {loadingAll ? (
                      <span role="status">{m.loadingAll(loadingAll.done, loadingAll.total)}</span>
                    ) : (
                      <>
                        <span>{m.loadAllNote((totalBytes / 1_000_000).toFixed(0))}</span>{' '}
                        <button
                          type="button"
                          className="ml-1 cursor-pointer font-medium text-accent hover:underline"
                          onClick={() => {
                            setLoadingAll({ done: 0, total: topics.length });
                            void bank.loadAll((done, total) => setLoadingAll({ done, total })).finally(() => setLoadingAll(undefined));
                          }}
                        >
                          {m.loadAll}
                        </button>
                      </>
                    )}
                  </div>
                )}
                {!searchingAll && topicState?.state === 'loading' && <p className="text-[13px] text-ink-muted" role="status">{m.loadingTopic}</p>}
                {!searchingAll && topicState?.state === 'error' && (
                  <div className="text-[13px] text-ink-muted" role="alert">
                    <p>{m.topicError}</p>
                    <button type="button" className="mt-2 cursor-pointer text-accent hover:underline" onClick={() => topic && void bank.topic(topic.id)}>
                      {m.retry}
                    </button>
                  </div>
                )}
                {(bank.offline || (topicState?.state === 'ready' && topicState.offline)) && <p className="text-[12px] text-ink-subtle">{m.offline}</p>}
                {!searchingAll && topicState?.state === 'ready' && topicState.data.skipped > 0 && (
                  <p className="text-[12px] text-ink-subtle">{m.skipped(topicState.data.skipped)}</p>
                )}
                {browse.poolSize > 0 && entries.length === 0 && (
                  <div className="text-[13px] text-ink-muted">
                    <p>{m.noneMatch}</p>
                    <button type="button" className="mt-2 cursor-pointer text-accent hover:underline" onClick={() => setFilters({ ...NO_FILTERS, everywhere: filters.everywhere, paper: filters.paper })}>
                      {m.clearFilters}
                    </button>
                  </div>
                )}
                {entries.map((entry) => {
                  const item = entry.item;
                  if (!item) return <PastPaperIndexCard key={entry.key} entry={entry} topicName={topicName(entry.topicId)} language={language} />;
                  const doc = browse.docOf.get(item.topicId);
                  if (!doc) return null;
                  const key = pickKey({ topicId: item.topicId, questionId: item.question.id });
                  const picked = pickedKeys.has(key);
                  const source = packName(item.provenance, language);
                  const letter = answerLetter(item);
                  return (
                    <article
                      key={key}
                      className={`rounded-xl border bg-surface p-3 transition-colors duration-150 ${picked ? 'border-accent ring-2 ring-accent/25' : 'border-line'}`}
                    >
                      <div className="mb-2 flex items-center gap-2.5 px-1">
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                          <input type="checkbox" checked={picked} onChange={() => toggle(item)} aria-label={m.pickTitle(source)} className="h-4 w-4 accent-[var(--color-accent)]" />
                          <span className="truncate text-[12.5px] font-medium text-ink">{source}</span>
                          {searchingAll && <span className="truncate text-[11.5px] text-ink-subtle">{m.inTopic(topicName(item.topicId))}</span>}
                        </label>
                        {item.stimulus && <span className="shrink-0 text-[11.5px] text-ink-subtle">{m.shared}</span>}
                        {answers && letter && (
                          <span className="shrink-0 rounded-md bg-surface-sunken px-2 py-0.5 text-[11.5px] font-medium text-ink">{m.answer(letter)}</span>
                        )}
                      </div>
                      <div className="cursor-pointer" onClick={() => toggle(item)}>
                        <PastPaperSheet item={item} doc={doc} language={language} />
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            {pickedItems.length > 0 && (
              <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-line bg-surface px-6 py-3" role="region" aria-label={m.picked(pickedItems.length)}>
                <span className="text-[13px] font-medium text-ink">{m.picked(pickedItems.length)}</span>
                <button type="button" onClick={() => setPicks([])} className="cursor-pointer text-[12.5px] text-ink-muted hover:text-ink hover:underline">
                  {m.clear}
                </button>
                {storage && storage.ratio >= NEARLY_FULL && (
                  <span className="min-w-0 max-w-[460px] text-[12px] text-warn-ink" role="status" data-pastpaper-storage>
                    {wontFit ? m.storageFull(megabytes(storage.used - adding)) : m.storageWarn(Math.round(storage.ratio * 100), megabytes(storage.used))}
                  </span>
                )}
                <span className="flex-1" />
                <button
                  type="button"
                  disabled={busy || wontFit}
                  onClick={() => void copyPicks()}
                  className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] text-ink hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
                >
                  {m.copyToBank}
                </button>
                <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-ink-muted" title={m.showSourcesTitle} data-pastpaper-show-sources>
                  <input
                    type="checkbox"
                    checked={showSources}
                    onChange={(e) => setBankSettings({ showSources: e.target.checked })}
                    className="h-4 w-4 accent-[var(--color-accent)]"
                  />
                  {m.showSources}
                </label>
                {showSources && (
                  <SourceFormatSelect value={sourceFormat} onChange={(next) => setBankSettings({ sourceFormat: next })} className="max-w-[240px]" />
                )}
                <label className="flex items-center gap-2 text-[12.5px] text-ink-muted">
                  {m.addTo}
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="h-8 max-w-[260px] rounded-lg border border-line bg-surface px-2 text-[12.5px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <option value="new:classroom">{m.newWorksheet}</option>
                    <option value="new:paper1">{m.newPaper1}</option>
                    {papers.length > 0 && (
                      <optgroup label={m.recentPapers}>
                        {papers.map((paper) => (
                          <option key={paper.id} value={paper.id}>
                            {paper.title}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={busy || wontFit}
                  onClick={() => void addPicks()}
                  className="cursor-pointer rounded-lg bg-cta px-3.5 py-1.5 text-[12.5px] font-medium text-on-cta hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
                >
                  {m.add}
                </button>
              </div>
            )}
          </main>
        </BankStateNote>
      </div>
    </div>
  );
}
