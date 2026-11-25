'use client';

import { useMemo } from 'react';
import { revealQuestion } from '@/components/bank/page/bankReturn';
import type { Worksheet } from '@/model/types';
import type { PastPaperItem } from '@/pastpapers/pack';
import { notify } from '@/store/notices';
import { PastPaperArrange, type ArrangeAddOptions } from './PastPaperArrange';
import { escapeClears } from '@/components/bank/escapeClears';
import { useMessages } from '@/i18n/language';
import { rootIdOf } from '@/model/lineage';
import { emptyPaperFor, insertIntoOpen, sourceChoiceDecides } from '@/pastpapers/actions';
import { PAST_PAPER_SETTINGS } from '@/pastpapers/config';
import { printsQuestionSources, questionSourceFormat, withQuestionSourceFormat, withQuestionSources } from '@/render/questionSource';
import type { QuestionSourceFormat } from '@/model/types';
import { SourceFormatSelect } from './SourceFormatSelect';
import { useSettings } from '@/settings/store';
import { groupTopics } from '@/pastpapers/groups';
import { packName, paperLabel, sittingLabel, sourceLabel, whenLabel, type TopicEntry } from '@/pastpapers/pack';
import { topicHeading, topicNamesFor } from '@/model/topics';
import { useWorksheetStore } from '@/store/worksheetStore';
import { PAST_PAPER_MESSAGES } from './messages';
import { BankStateNote, ExamChips, SearchGlyph } from './PastPaperControls';
import { PastPaperIndexCard } from './PastPaperIndexCard';
import { PastPaperSheet } from './PastPaperSheet';
import { ViewSwitch } from './PastPaperYearPicker';
import { answerLetter } from './pastPaperPreview';
import { usePastPaperBrowse } from './usePastPaperBrowse';

/**
 * The Past paper bank in the editor's 題庫 tab (k-0443): pick a topic, search, and Insert a
 * copy after the insert anchor, as the teacher's own bank inserts (one ⌘Z, the review bar).
 * A question the paper already holds says so and is not inserted twice.
 */
export function PastPaperTab({ onNewWorksheet }: { onNewWorksheet?: (worksheet: Worksheet) => void } = {}) {
  const m = useMessages(PAST_PAPER_MESSAGES);
  const browse = usePastPaperBrowse();
  const { topics, topic, topicState, filters, setFilters, entries, sitting } = browse;
  const byYear = browse.view === 'year';
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const language = useWorksheetStore((s) => s.mode.language);
  const readOnly = useWorksheetStore((s) => s.readOnly);
  const held = useMemo(() => new Set(worksheet.questions.map(rootIdOf)), [worksheet.questions]);
  const commit = useWorksheetStore((s) => s.commit);
  // "Show source": before the paper has a sourced question it is the remembered choice its
  // first insert applies; after, it is this paper's own switch (`sourceChoiceDecides`, u-w7gs).
  const [bankSettings, setBankSettings] = useSettings(PAST_PAPER_SETTINGS);
  const decides = sourceChoiceDecides(worksheet);
  const sourcesOn = decides ? bankSettings.showSources : printsQuestionSources(worksheet);
  const setSources = (next: boolean) => {
    setBankSettings({ showSources: next });
    if (!decides && !readOnly) commit((draft) => withQuestionSources(draft, next));
  };
  // Its format follows the same rule (u-z6ft).
  const format = decides ? bankSettings.sourceFormat : questionSourceFormat(worksheet);
  const setFormat = (next: QuestionSourceFormat) => {
    setBankSettings({ sourceFormat: next });
    if (!decides && !readOnly) commit((draft) => withQuestionSourceFormat(draft, next));
  };
  // Topic names and sources are paper words: the document's language, not the interface's.
  // A bilingual paper lists both names, as the sidebar's own topic rows do (`wide`).
  const name = (t: { title: { en: string; zh: string } }, room: 'tight' | 'wide' = 'tight') => packName(t.title, language, room);
  // Under their syllabus part, as on the screen (k-0446); flat for a list that names none.
  const groups = useMemo(() => groupTopics(topics), [topics]);
  const option = (t: TopicEntry) => (
    <option key={t.id} value={t.id}>
      {name(t, 'wide')}
      {t.questions !== undefined ? ` (${t.questions})` : ''}
    </option>
  );

  const topicTitle = (id: string) => {
    const entry = topics.find((t) => t.id === id);
    return entry ? name(entry) : id;
  };
  // By year (k-0497): a year's questions in paper and question-number order, a heading at each
  // paper when the year has more than one; a question whose topic is not downloaded yet shows
  // its words from the search index until it is.
  const paperOf = (tag: string) => tag.replace(/\/Q\d+$/, '');
  const paperHeadings = byYear && new Set(entries.map((entry) => paperOf(entry.tag))).size > 1;

  // Arrange in the tab (u-jwar): Add puts the questions into this paper after the insert point;
  // New worksheet opens a new paper first, as the bank screen's does.
  const addFromArrange = (items: PastPaperItem[], done: () => void, { to, name, showSources, sourceFormat: fmt, topics }: ArrangeAddOptions = {}) => {
    if (to?.startsWith('new:')) {
      if (!onNewWorksheet) return;
      onNewWorksheet(emptyPaperFor(to === 'new:paper1' ? 'paper1' : 'classroom', name ?? m.newName));
    } else if (readOnly) {
      notify({ tone: 'warning', body: m.readOnlyPaper });
      return;
    }
    const { inserted, skipped, refused } = insertIntoOpen(items, m.added, { showSources, sourceFormat: fmt, topics });
    if (refused) notify({ tone: 'warning', body: m.readOnlyPaper });
    else if (inserted.length === 0 && skipped > 0) notify({ tone: 'info', body: m.nothingAdded(items.length) });
    if (inserted.length > 0) done();
    if (inserted[0]) revealQuestion(inserted[0]);
  };

  if (browse.view === 'arrange') {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-pastpaper-tab>
        <BankStateNote browse={browse}>
          <div className="shrink-0 space-y-2 px-4 pb-2 pt-2.5">
            <p className="text-[11.5px] text-ink-subtle">{m.tabHint}</p>
            <ViewSwitch value={browse.view} onChange={browse.setView} arrange className="" />
          </div>
          <PastPaperArrange
            browse={browse}
            variant="tab"
            language={language}
            readOnly={readOnly}
            busy={false}
            onAdd={addFromArrange}
            onCopy={() => undefined}
            onNotice={(body) => notify({ tone: 'success', body })}
            onError={(body) => notify({ tone: 'warning', body })}
          />
        </BankStateNote>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-pastpaper-tab>
      <BankStateNote browse={browse}>
        <div className="shrink-0 space-y-2 border-b border-line px-4 pb-3 pt-2.5">
          <p className="text-[11.5px] text-ink-subtle">{m.tabHint}</p>
          <ViewSwitch value={browse.view} onChange={browse.setView} arrange className="" />
          {byYear ? (
            <label className="block">
              <span className="sr-only">{m.yearsNav}</span>
              <select
                value={sitting?.key ?? ''}
                onChange={(event) => browse.setSitting(event.target.value)}
                className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-[12.5px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                data-pastpaper-tab-year
              >
                {browse.yearGroups.map((group) => (
                  <optgroup key={group.exam} label={group.exam}>
                    {group.sittings.map((s) => (
                      <option key={s.key} value={s.key}>
                        {packName(whenLabel(s.source), language)}
                        {s.papers.length > 1 ? ` · ${s.papers.map((p) => packName(paperLabel(p.source), language)).join(', ')}` : ''}
                        {` (${s.questions})`}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          ) : (
          <label className="block">
              <span className="sr-only">{m.tabTopic}</span>
              <select
                value={topic?.id ?? ''}
                onChange={(event) => browse.setTopic(event.target.value)}
                className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-[12.5px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {groups
                  ? groups.map((group) => (
                      <optgroup key={group.code || 'other'} label={group.part ? topicHeading(group.code, topicNamesFor(language, 'wide')) : m.otherTopics}>
                        {group.topics.map(option)}
                      </optgroup>
                    ))
                  : topics.map(option)}
              </select>
            </label>
          )}
          <label className="relative block">
            <span className="sr-only">{m.searchLabel}</span>
            <input
              type="search"
              value={filters.words}
              title={m.searchHint}
              placeholder={byYear ? (sitting ? m.searchIn(packName(sittingLabel(sitting.source), language)) : m.searchLabel) : topic ? m.searchIn(name(topic)) : m.searchLabel}
              onChange={(event) => setFilters({ ...filters, words: event.target.value, everywhere: false })}
              onKeyDown={(event) => void escapeClears(event, filters.words, () => setFilters({ ...filters, words: '' }))}
              className="h-8 w-full rounded-lg border border-transparent bg-surface-sunken pl-8 pr-2.5 text-[12.5px] text-ink outline-none placeholder:text-ink-subtle focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/25"
            />
            <SearchGlyph />
          </label>
          <ExamChips filters={filters} onChange={setFilters} />
          {byYear && !browse.indexed && <p className="text-[11.5px] text-ink-subtle">{m.yearsNeedAll(((browse.bank.manifest?.topics.reduce((n, t) => n + (t.bytes ?? 0), 0) ?? 0) / 1_000_000).toFixed(0))}</p>}
          <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-ink-muted" title={m.showSourcesTitle} data-pastpaper-show-sources>
            <input
              type="checkbox"
              checked={sourcesOn}
              disabled={readOnly && !decides}
              onChange={(e) => setSources(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            {decides ? m.showSources : m.showSourcesThisPaper}
          </label>
          {sourcesOn && <SourceFormatSelect value={format} disabled={readOnly && !decides} onChange={setFormat} className="pl-[22px]" />}
        </div>

        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto bg-desk px-3 py-3">
          <div className="flex flex-col gap-3">
            {!byYear && topicState?.state === 'loading' && <p className="px-1 text-[12.5px] text-ink-muted" role="status">{m.loadingTopic}</p>}
            {!byYear && topicState?.state === 'error' && (
              <p className="px-1 text-[12.5px] text-ink-muted" role="alert">
                {m.topicError}{' '}
                <button type="button" className="cursor-pointer text-accent hover:underline" onClick={() => topic && void browse.bank.topic(topic.id)}>
                  {m.retry}
                </button>
              </p>
            )}
            {browse.poolSize > 0 && entries.length === 0 && <p className="px-1 text-[12.5px] text-ink-muted">{m.noneMatch}</p>}
            {entries.length > 0 && <p className="px-1 text-[11.5px] tabular-nums text-ink-subtle">{m.shown(entries.length, browse.poolSize)}</p>}
            {entries.map((entry, at) => {
              const item = entry.item;
              const heading =
                paperHeadings && paperOf(entry.tag) !== paperOf(entries[at - 1]?.tag ?? '') ? (
                  <h3 key={`h:${paperOf(entry.tag)}`} className="mt-1 px-1 text-[12px] font-semibold text-ink" data-pastpaper-paper-heading>
                    {packName(sourceLabel((item ?? entry.row)!.source, false), language)}
                  </h3>
                ) : null;
              if (!item) return [heading, <PastPaperIndexCard key={entry.key} entry={entry} topicName={topicTitle(entry.topicId)} language={language} />];
              const doc = browse.docOf.get(item.topicId);
              if (!doc) return heading;
              const inPaper = held.has(rootIdOf(item.question));
              const letter = answerLetter(item);
              const source = packName(item.provenance, language);
              return [
                heading,
                <article key={entry.key} className="rounded-lg border border-line bg-surface p-2" data-pastpaper-card={entry.tag}>
                  <div className="mb-1.5 flex items-center gap-2 px-1">
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">{source}</span>
                    {letter && <span className="shrink-0 text-[11px] text-ink-subtle">{m.answer(letter)}</span>}
                    {inPaper ? (
                      <span className="shrink-0 rounded-md bg-surface-sunken px-2 py-0.5 text-[11px] text-ink-muted">{m.inPaper}</span>
                    ) : (
                      <button
                        type="button"
                        disabled={readOnly}
                        title={m.insertTitle}
                        onClick={() => insertIntoOpen([item], m.added, { showSources: sourcesOn, sourceFormat: format })}
                        className="shrink-0 cursor-pointer rounded-md bg-cta px-2.5 py-0.5 text-[11.5px] font-medium text-on-cta hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
                      >
                        {m.insert}
                      </button>
                    )}
                  </div>
                  {item.stimulus && <p className="mb-1 px-1 text-[11px] text-ink-subtle">{m.shared}</p>}
                  <PastPaperSheet item={item} doc={doc} language={language} compact />
                </article>,
              ];
            })}
          </div>
        </div>
      </BankStateNote>
    </div>
  );
}
