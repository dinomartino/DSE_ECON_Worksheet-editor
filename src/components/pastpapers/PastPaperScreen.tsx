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
import { PastPaperArrange, type ArrangeAddOptions } from './PastPaperArrange';
import { PastPaperIndexCard } from './PastPaperIndexCard';
import { SourceFormatSelect } from './SourceFormatSelect';
import { megabytes, NEARLY_FULL, webStorageUse } from '@/storage/webQuota';
import { packName, paperKey, sittingLabel, sourceLabel } from '@/pastpapers/pack';
import { PastPaperSheet } from './PastPaperSheet';
import { PastPaperTopicPicker } from './PastPaperTopicPicker';
import { PastPaperYearPicker, ViewSwitch } from './PastPaperYearPicker';
import { answerLetter } from './pastPaperPreview';
import { NO_FILTERS, pickKey, usePastPaperBrowse, type BrowseEntry, type Pick } from './usePastPaperBrowse';

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

  const sharedTopicName = (items: readonly PastPaperItem[]) => {
    const ids = new Set(items.map((item) => item.topicId));
    const only = ids.size === 1 ? topics.find((t) => t.id === [...ids][0]) : undefined;
    if (only) return packName(only.title, language);
    // Picks of one paper across topics (the usual By year pick) are named after the paper.
    const keys = new Set(items.map((item) => paperKey(item.source)));
    const paper = keys.size === 1 && !keys.has('') ? items[0] : undefined;
    return paper ? packName(sourceLabel(paper.source, false), language) : m.newName;
  };

  /**
   * Questions, in the order given, into a new worksheet or paper or one of the teacher's papers
   * (`to`, else the tray's Add to); `done` once they are in. The tray and Arrange both use it.
   */
  const addItems = async (items: PastPaperItem[], done: () => void, { to = target, name, sourceFormat: format = sourceFormat, showSources: sources = showSources, topics }: ArrangeAddOptions = {}) => {
    if (items.length === 0) return;
    // The web build's ~5 MB: Arrange's questions are judged here, once they are downloaded.
    const use = webStorageUse(items.reduce((n, item) => n + JSON.stringify(item.question).length + (item.stimulus ? JSON.stringify(item.stimulus).length : 0), 0));
    if (use && use.ratio > 1) {
      onError(m.storageFull(megabytes(use.used)));
      return;
    }
    setBusy(true);
    try {
      if (to.startsWith('new:')) {
        const kind = to === 'new:paper1' ? 'paper1' : 'classroom';
        onOpenWorksheet(emptyPaperFor(kind, name ?? sharedTopicName(items)), language);
        const { inserted } = insertIntoOpen(items, m.added, { showSources: sources, sourceFormat: format, topics });
        if (inserted.length > 0) done();
        if (inserted[0]) revealQuestion(inserted[0]);
        return;
      }
      const saved = await worksheetStore.load(to).catch(() => undefined);
      const held = new Set(saved?.questions.map(rootIdOf) ?? []);
      const fresh = items.filter((item) => !held.has(rootIdOf(item.question)));
      if (saved && fresh.length === 0) {
        onNotice(m.nothingAdded(items.length));
        return;
      }
      onOpenDocument(to, () => {
        const { inserted, refused } = insertIntoOpen(items, m.added, { showSources: sources, sourceFormat: format, topics });
        if (refused) onError(m.readOnlyPaper);
        if (inserted.length > 0) done();
        if (inserted[0]) revealQuestion(inserted[0]);
      });
    } finally {
      setBusy(false);
    }
  };
  const addPicks = () => addItems(pickedItems, () => setPicks([]));

  const copyItems = async (items: PastPaperItem[], then: () => void) => {
    if (items.length === 0) return;
    setBusy(true);
    try {
      const done = await copyIntoMyBank(items);
      if (done.copied === 0) onNotice(m.copiedNone(done.already));
      else onNotice(m.copied(done.copied, done.already) + (done.stimuli ? m.copiedWithStimulus(done.stimuli) : ''));
      then();
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const copyPicks = () => copyItems(pickedItems, () => setPicks([]));

  const totalBytes = bank.manifest?.topics.reduce((n, t) => n + (t.bytes ?? 0), 0) ?? 0;
  const byYear = browse.view === 'year';
  const arranging = browse.view === 'arrange';
  /** The whole bank, not the open topic or year: what the topic picker greys its choice for. */
  const searchingAll = byYear ? browse.searchingAll : browse.acrossBank;
  const sitting = browse.sitting;
  const allLoaded = browse.loadedCount >= topics.length && topics.length > 0;
  /** Questions of many topics on screen (a search of every topic, one paper, a year): each card names its topic. */
  const acrossTopics = browse.acrossBank;
  const loadEverything = () => {
    setLoadingAll({ done: 0, total: topics.length });
    void bank.loadAll((done, total) => setLoadingAll({ done, total })).finally(() => setLoadingAll(undefined));
  };
  const topicName = (id: string) => {
    const entry = topics.find((t) => t.id === id);
    return entry ? packName(entry.title, language) : id;
  };
  const paperChoice = filters.paper !== undefined ? browse.papers.find((p) => p.key === filters.paper) : undefined;
  const paperName = paperChoice ? packName(sourceLabel(paperChoice.source, false), language) : '';
  const sittingName = sitting ? packName(sittingLabel(sitting.source), language) : '';
  const heading = byYear
    ? searchingAll
      ? m.scopeEveryYear
      : browse.yearPaper && paperChoice
        ? m.paperHeading(paperName)
        : sitting
          ? m.paperHeading(sittingName)
          : ''
    : paperChoice
      ? m.paperHeading(paperName)
      : searchingAll
        ? m.scopeAll
        : topic
          ? packName(topic.title, language)
          : '';
  // By year, a list holding more than one paper gets a heading at each paper.
  const paperHeadings = byYear && new Set(entries.map((entry) => paperOfTag(entry.tag))).size > 1;
  const yearsPartial = byYear && !browse.indexed && !allLoaded;

  // The web build's ~5 MB: what the picks would add, judged before they go in (k-0444).
  const adding = useMemo(
    () => pickedItems.reduce((n, item) => n + JSON.stringify(item.question).length + (item.stimulus ? JSON.stringify(item.stimulus).length : 0), 0),
    [pickedItems],
  );
  const storage = useMemo(() => (adding > 0 ? webStorageUse(adding) : undefined), [adding]);
  const wontFit = storage !== undefined && storage.ratio > 1;

  // Show source, its format and Add to: the tray's; Arrange has its own Show source (off each time, u-n9h1) and prints Short (u-rvgs).
  const addControlsFor = (withSources: boolean) => (
    <>
      {withSources && (
      <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-ink-muted" title={m.showSourcesTitle} data-pastpaper-show-sources>
        <input
          type="checkbox"
          checked={showSources}
          onChange={(e) => setBankSettings({ showSources: e.target.checked })}
          className="h-4 w-4 accent-[var(--color-accent)]"
        />
        {m.showSources}
      </label>
      )}
      {showSources && withSources && (
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
    </>
  );

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
                arranging
                  ? m.searchLabel
                  : filters.everywhere
                  ? browse.indexed
                    ? byYear
                      ? m.searchEveryYear
                      : m.searchEvery
                    : m.searchOpened
                  : byYear
                    ? sitting
                      ? m.searchIn(sittingName)
                      : m.searchLabel
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
          {arranging ? (
            <PastPaperArrange
              browse={browse}
              language={language}
              onLanguage={setLanguage}
              switcher={<ViewSwitch value={browse.view} onChange={browse.setView} arrange />}
              addControls={addControlsFor(false)}
              busy={busy}
              onAdd={addItems}
              onCopy={copyItems}
              onNotice={onNotice}
              onError={onError}
            />
          ) : (
          <>
          {byYear ? (
            <PastPaperYearPicker
              groups={browse.yearGroups}
              current={sitting}
              paper={browse.yearPaper}
              active={!searchingAll}
              language={language}
              top={<ViewSwitch value={browse.view} onChange={browse.setView} arrange />}
              empty={
                yearsPartial ? (
                  <div className="mx-4 mt-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-[12px] leading-snug text-ink-muted" data-pastpaper-years-partial>
                    {loadingAll ? (
                      <span role="status">{m.loadingAll(loadingAll.done, loadingAll.total)}</span>
                    ) : (
                      <>
                        <p>{m.yearsNeedAll((totalBytes / 1_000_000).toFixed(0))}</p>
                        <button type="button" className="mt-1.5 cursor-pointer font-medium text-accent hover:underline" onClick={loadEverything}>
                          {m.loadAllYears}
                        </button>
                      </>
                    )}
                  </div>
                ) : undefined
              }
              onPick={(key) => {
                // A year opens whole: a paper narrowed to (in this year or the last) is dropped.
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
              top={<ViewSwitch value={browse.view} onChange={browse.setView} arrange />}
              onPick={(id) => {
                browse.setTopic(id);
                if (filters.everywhere || filters.paper !== undefined) setFilters({ ...filters, everywhere: false, paper: undefined });
              }}
            />
          )}

          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* One row at every width and title (u-huv8): the paper select shrinks first, then the title
                truncates (full title on hover); only a very narrow window scrolls the row sideways. */}
            <div className="scroll-slim flex shrink-0 flex-nowrap items-center gap-x-3 overflow-x-auto border-b border-line px-6 py-2.5" data-pastpaper-filterbar>
              <h2 className="min-w-[4rem] shrink truncate text-[15px] font-semibold text-ink" title={heading} data-pastpaper-heading>
                {heading}
              </h2>
              <span className="shrink-0 whitespace-nowrap text-[12px] tabular-nums text-ink-subtle" role="status">
                {m.shown(entries.length, browse.poolSize)}
              </span>
              {/* In front in a narrow window, so the sideways scroll never hides it (u-jwar); last from 1280 px. */}
              <label className="flex shrink-0 cursor-pointer xl:order-last items-center gap-1.5 whitespace-nowrap text-[12px] text-ink-muted" data-pastpaper-show-answers>
                <input type="checkbox" checked={answers} onChange={(e) => setAnswers(e.target.checked)} className="accent-[var(--color-accent)]" />
                {m.showAnswers}
              </label>
              <span className="flex-1" />
              {filters.words.trim() !== '' && (
                <div role="radiogroup" aria-label={m.scopeLabel} className="flex shrink-0 whitespace-nowrap rounded-md border border-line p-0.5">
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
                      {byYear ? (all ? m.scopeEveryYear : m.scopeYear) : all ? m.scopeAll : m.scopeTopic}
                    </button>
                  ))}
                </div>
              )}
              <ExamChips filters={filters} onChange={setFilters} wrap={false} />
              <YearSelects filters={filters} years={browse.years} onChange={setFilters} />
              {!byYear && <PaperSelect filters={filters} papers={browse.papers} language={language} onChange={setFilters} />}
              <LanguageToggle value={language} onChange={setLanguage} />
            </div>

            <div className="scroll-slim min-h-0 flex-1 overflow-y-auto bg-desk px-6 py-5">
              <div className="mx-auto flex max-w-[860px] flex-col gap-4">
                {searchingAll && browse.indexed && <p className="text-[12px] text-ink-subtle">{m.indexNote}</p>}
                {searchingAll && !byYear && !browse.indexed && !allLoaded && (
                  <div className="rounded-lg border border-line bg-surface px-4 py-3 text-[12.5px] text-ink-muted">
                    {loadingAll ? (
                      <span role="status">{m.loadingAll(loadingAll.done, loadingAll.total)}</span>
                    ) : (
                      <>
                        <span>{m.loadAllNote((totalBytes / 1_000_000).toFixed(0))}</span>{' '}
                        <button type="button" className="ml-1 cursor-pointer font-medium text-accent hover:underline" onClick={loadEverything}>
                          {m.loadAll}
                        </button>
                      </>
                    )}
                  </div>
                )}
                {!acrossTopics && topicState?.state === 'loading' && <p className="text-[13px] text-ink-muted" role="status">{m.loadingTopic}</p>}
                {!acrossTopics && topicState?.state === 'error' && (
                  <div className="text-[13px] text-ink-muted" role="alert">
                    <p>{m.topicError}</p>
                    <button type="button" className="mt-2 cursor-pointer text-accent hover:underline" onClick={() => topic && void bank.topic(topic.id)}>
                      {m.retry}
                    </button>
                  </div>
                )}
                {(bank.offline || (topicState?.state === 'ready' && topicState.offline)) && <p className="text-[12px] text-ink-subtle">{m.offline}</p>}
                {!acrossTopics && topicState?.state === 'ready' && topicState.data.skipped > 0 && (
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
                {entries.map((entry, at) => {
                  const item = entry.item;
                  const thisPaper = paperOfTag(entry.tag);
                  const before = paperHeadings && thisPaper !== paperOfTag(entries[at - 1]?.tag ?? '');
                  const headingRow = before ? <PaperHeading key={`h:${thisPaper}`} entry={entry} language={language} /> : null;
                  if (!item) {
                    return [headingRow, <PastPaperIndexCard key={entry.key} entry={entry} topicName={topicName(entry.topicId)} language={language} />];
                  }
                  const doc = browse.docOf.get(item.topicId);
                  if (!doc) return headingRow;
                  const key = pickKey({ topicId: item.topicId, questionId: item.question.id });
                  const picked = pickedKeys.has(key);
                  const source = packName(item.provenance, language);
                  const letter = answerLetter(item);
                  return [
                    headingRow,
                    <article
                      key={key}
                      data-pastpaper-card={entry.tag}
                      className={`rounded-xl border bg-surface p-3 transition-colors duration-150 ${picked ? 'border-accent ring-2 ring-accent/25' : 'border-line'}`}
                    >
                      <div className="mb-2 flex items-center gap-2.5 px-1">
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                          <input type="checkbox" checked={picked} onChange={() => toggle(item)} aria-label={m.pickTitle(source)} className="h-4 w-4 accent-[var(--color-accent)]" />
                          <span className="truncate text-[12.5px] font-medium text-ink">{source}</span>
                          {acrossTopics && <span className="truncate text-[11.5px] text-ink-subtle">{m.inTopic(topicName(item.topicId))}</span>}
                        </label>
                        {item.stimulus && <span className="shrink-0 text-[11.5px] text-ink-subtle">{m.shared}</span>}
                        {answers && letter && (
                          <span className="shrink-0 rounded-md bg-surface-sunken px-2 py-0.5 text-[11.5px] font-medium text-ink">{m.answer(letter)}</span>
                        )}
                      </div>
                      <div className="cursor-pointer" onClick={() => toggle(item)}>
                        <PastPaperSheet item={item} doc={doc} language={language} />
                      </div>
                    </article>,
                  ];
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
                {addControlsFor(true)}
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
          </>
          )}
        </BankStateNote>
      </div>
    </div>
  );
}

const paperOfTag = (tag: string) => tag.replace(/\/Q\d+$/, '');

/** By year: the paper a run of questions comes from, when the list holds more than one. */
function PaperHeading({ entry, language }: { entry: BrowseEntry; language: LanguageMode }) {
  const source = entry.item?.source ?? entry.row?.source;
  if (!source) return null;
  return (
    <h3 className="mt-2 border-b border-line pb-1 text-[13px] font-semibold text-ink first:mt-0" data-pastpaper-paper-heading>
      {packName(sourceLabel(source, false), language)}
    </h3>
  );
}
