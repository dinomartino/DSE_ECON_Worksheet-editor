'use client';

import { useMemo } from 'react';
import { escapeClears } from '@/components/bank/escapeClears';
import { useMessages } from '@/i18n/language';
import { rootIdOf } from '@/model/lineage';
import { insertIntoOpen } from '@/pastpapers/actions';
import { packName } from '@/pastpapers/pack';
import { useWorksheetStore } from '@/store/worksheetStore';
import { PAST_PAPER_MESSAGES } from './messages';
import { BankStateNote, ExamChips, SearchGlyph } from './PastPaperControls';
import { PastPaperSheet } from './PastPaperSheet';
import { answerLetter } from './pastPaperPreview';
import { usePastPaperBrowse } from './usePastPaperBrowse';

/**
 * The Past paper bank in the editor's 題庫 tab (k-0443): pick a topic, search, and Insert a
 * copy after the insert anchor, as the teacher's own bank inserts (one ⌘Z, the review bar).
 * A question the paper already holds says so and is not inserted twice.
 */
export function PastPaperTab() {
  const m = useMessages(PAST_PAPER_MESSAGES);
  const browse = usePastPaperBrowse();
  const { topics, topic, topicState, filters, setFilters, items } = browse;
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const language = useWorksheetStore((s) => s.mode.language);
  const readOnly = useWorksheetStore((s) => s.readOnly);
  const held = useMemo(() => new Set(worksheet.questions.map(rootIdOf)), [worksheet.questions]);
  // Topic names and sources are paper words: the document's language, not the interface's.
  // A bilingual paper lists both names, as the sidebar's own topic rows do (`wide`).
  const name = (t: { title: { en: string; zh: string } }, room: 'tight' | 'wide' = 'tight') => packName(t.title, language, room);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-pastpaper-tab>
      <BankStateNote browse={browse}>
        <div className="shrink-0 space-y-2 border-b border-line px-4 pb-3 pt-2.5">
          <p className="text-[11.5px] text-ink-subtle">{m.tabHint}</p>
          <label className="block">
              <span className="sr-only">{m.tabTopic}</span>
              <select
                value={topic?.id ?? ''}
                onChange={(event) => browse.setTopic(event.target.value)}
                className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-[12.5px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {name(t, 'wide')}
                    {t.questions !== undefined ? ` (${t.questions})` : ''}
                  </option>
                ))}
              </select>
            </label>
          <label className="relative block">
            <span className="sr-only">{m.searchLabel}</span>
            <input
              type="search"
              value={filters.words}
              title={m.searchHint}
              placeholder={topic ? m.searchIn(name(topic)) : m.searchLabel}
              onChange={(event) => setFilters({ ...filters, words: event.target.value, everywhere: false })}
              onKeyDown={(event) => void escapeClears(event, filters.words, () => setFilters({ ...filters, words: '' }))}
              className="h-8 w-full rounded-lg border border-transparent bg-surface-sunken pl-8 pr-2.5 text-[12.5px] text-ink outline-none placeholder:text-ink-subtle focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/25"
            />
            <SearchGlyph />
          </label>
          <ExamChips filters={filters} onChange={setFilters} />
        </div>

        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto bg-desk px-3 py-3">
          <div className="flex flex-col gap-3">
            {topicState?.state === 'loading' && <p className="px-1 text-[12.5px] text-ink-muted" role="status">{m.loadingTopic}</p>}
            {topicState?.state === 'error' && (
              <p className="px-1 text-[12.5px] text-ink-muted" role="alert">
                {m.topicError}{' '}
                <button type="button" className="cursor-pointer text-accent hover:underline" onClick={() => topic && void browse.bank.topic(topic.id)}>
                  {m.retry}
                </button>
              </p>
            )}
            {browse.pool.length > 0 && items.length === 0 && <p className="px-1 text-[12.5px] text-ink-muted">{m.noneMatch}</p>}
            {items.length > 0 && <p className="px-1 text-[11.5px] tabular-nums text-ink-subtle">{m.shown(items.length, browse.pool.length)}</p>}
            {items.map((item) => {
              const doc = browse.docOf.get(item.topicId);
              if (!doc) return null;
              const inPaper = held.has(rootIdOf(item.question));
              const letter = answerLetter(item);
              const source = packName(item.provenance, language);
              return (
                <article key={item.question.id} className="rounded-lg border border-line bg-surface p-2">
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
                        onClick={() => insertIntoOpen([item], m.added)}
                        className="shrink-0 cursor-pointer rounded-md bg-cta px-2.5 py-0.5 text-[11.5px] font-medium text-on-cta hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
                      >
                        {m.insert}
                      </button>
                    )}
                  </div>
                  {item.stimulus && <p className="mb-1 px-1 text-[11px] text-ink-subtle">{m.shared}</p>}
                  <PastPaperSheet item={item} doc={doc} language={language} compact />
                </article>
              );
            })}
          </div>
        </div>
      </BankStateNote>
    </div>
  );
}
