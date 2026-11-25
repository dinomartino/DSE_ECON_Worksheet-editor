'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSettings } from '@/settings/store';
import { PAST_PAPER_SETTINGS, sourceUrl, type PastPaperView } from '@/pastpapers/config';
import { usePastPaperBank, type TopicState } from '@/pastpapers/bank';
import { matchItem, papersOf, paperKey, yearSpan, type PastPaperItem, type SearchRow, type SourceInfo } from '@/pastpapers/pack';
import { compareByYear, sittingOfPaper, yearSelection } from '@/pastpapers/years';

/**
 * What both views of the Past paper bank share (the screen and the editor's 題庫 tab): the
 * list, the topic open, the filters and the items they leave. View state only, kept for the
 * session in sessionStorage; never document data.
 */

export type ExamFilter = SourceInfo['exam'];
export const EXAMS: readonly ExamFilter[] = ['HKCEE', 'HKALE', 'HKDSE'];

export interface BrowseFilters {
  words: string;
  exams: ExamFilter[];
  from?: number;
  to?: number;
  /** Search every topic, not just the open one (by the list's search index when it has one). */
  everywhere: boolean;
  /** One paper of every topic, in its question order (`paperKey`, `DSE2016/P1`). */
  paper?: string;
}

/**
 * One question of what the filters leave: the loaded question when its topic is downloaded,
 * else (a search across the bank by the index) the index row to show until it is.
 */
export interface BrowseEntry {
  key: string;
  topicId: string;
  tag: string;
  item?: PastPaperItem;
  row?: SearchRow;
}

export const NO_FILTERS: BrowseFilters = { words: '', exams: [], everywhere: false };

const TOPIC_KEY = 'econ-pastpaper-topic';
const SITTING_KEY = 'econ-pastpaper-year';

function readSession(key: string): string | undefined {
  try {
    return globalThis.sessionStorage?.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function keepSession(key: string, value: string) {
  try {
    globalThis.sessionStorage?.setItem(key, value);
  } catch {
    // Private mode: the choice is simply not remembered.
  }
}

export function usePastPaperBrowse() {
  const [settings, setSettings] = useSettings(PAST_PAPER_SETTINGS);
  const base = sourceUrl(settings);
  const bank = usePastPaperBank();
  const [topicId, setTopicId] = useState<string | undefined>(() => readSession(TOPIC_KEY));
  const [sittingId, setSittingId] = useState<string | undefined>(() => readSession(SITTING_KEY));
  const [filters, setFilters] = useState<BrowseFilters>(NO_FILTERS);
  /** By topic or by year (k-0497): the last one chosen, remembered on this computer. */
  const view: PastPaperView = settings.view;
  const byYear = view === 'year';

  // Opened (again) whenever the source changes; once per source otherwise.
  useEffect(() => {
    void usePastPaperBank.getState().open();
  }, [base]);

  const manifestTopics = bank.manifest?.topics;
  const topics = useMemo(() => manifestTopics ?? [], [manifestTopics]);
  const topic = topics.find((t) => t.id === topicId) ?? topics[0];

  useEffect(() => {
    if (!topic) return;
    keepSession(TOPIC_KEY, topic.id);
    // By year shows no topic: a year's questions download their topics as they are reached.
    // (Arrange lists the bank off the search index; the 題庫 tab reads it as By topic.)
    if (!byYear) void usePastPaperBank.getState().topic(topic.id);
  }, [topic, byYear]);

  const topicState: TopicState | undefined = topic ? bank.topics[topic.id] : undefined;
  const loadedTopics = useMemo(
    () => topics.flatMap((t) => {
      const state = bank.topics[t.id];
      return state?.state === 'ready' ? [state.data] : [];
    }),
    [topics, bank.topics],
  );

  const index = bank.manifest?.search;
  const words = filters.words.trim();

  const everything = useMemo(() => (index && index.length > 0 ? index : loadedTopics.flatMap((t) => t.items)), [index, loadedTopics]);
  const years = useMemo(() => yearSpan(everything), [everything]);
  const papers = useMemo(() => papersOf(everything), [everything]);

  /** A search of the whole bank, not the open topic or year. */
  const searchingAll = filters.everywhere && words !== '';
  // By year (k-0497): every paper under its exam and year, the open year, its questions' filter.
  const year = useMemo(() => yearSelection(everything, filters, sittingId, searchingAll), [everything, filters, sittingId, searchingAll]);
  const yearGroups = year.groups;
  const sitting = year.sitting;
  const yearPaper = byYear ? year.paper : undefined;

  useEffect(() => {
    if (byYear && sitting) keepSession(SITTING_KEY, sitting.key);
  }, [byYear, sitting]);

  /** The bank as a whole, not the open topic: a search of every topic, one paper, or (by year) a year. */
  const acrossBank = byYear || filters.paper !== undefined || searchingAll;
  const query = byYear ? year.query : { words: filters.words, exams: filters.exams, from: filters.from, to: filters.to, paper: filters.paper };
  /** In question order: one paper, or (by year) exam, newest year, paper, number. */
  const ordered = byYear || filters.paper !== undefined;

  const itemByTag = useMemo(() => {
    const map = new Map<string, PastPaperItem>();
    for (const t of loadedTopics) for (const item of t.items) if (item.source.tag) map.set(`${item.topicId}|${item.source.tag}`, item);
    return map;
  }, [loadedTopics]);

  const pool: PastPaperItem[] = useMemo(() => {
    if (acrossBank) return loadedTopics.flatMap((t) => t.items);
    return topicState?.state === 'ready' ? topicState.data.items : [];
  }, [acrossBank, loadedTopics, topicState]);

  const byNumber = (a: { source: SourceInfo }, b: { source: SourceInfo }) =>
    byYear ? compareByYear(a.source, b.source) : (a.source.number ?? 0) - (b.source.number ?? 0);

  const entries: BrowseEntry[] = useMemo(() => {
    if (acrossBank && index) {
      const rows = index.filter((row) => matchItem(row, query));
      if (ordered) rows.sort(byNumber);
      return rows.map((row) => {
        const key = `${row.topicId}|${row.source.tag}`;
        const item = itemByTag.get(key);
        return { key, topicId: row.topicId, tag: row.source.tag, row, ...(item ? { item } : {}) };
      });
    }
    const items = pool.filter((item) => matchItem(item, query));
    if (ordered) items.sort(byNumber);
    return items.map((item) => ({ key: `${item.topicId}|${item.question.id}`, topicId: item.topicId, tag: item.source.tag, item }));
    // `query` is rebuilt from `filters` each render; `filters`, the view and the year are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acrossBank, index, pool, filters, itemByTag, byYear, year]);

  const items = useMemo(() => entries.flatMap((entry) => (entry.item ? [entry.item] : [])), [entries]);
  /** How many the filters chose from: by year, the open year (or paper) unless the whole bank is searched. */
  const poolSize =
    byYear && !searchingAll
      ? (yearPaper ? sitting?.papers.find((p) => p.key === yearPaper)?.questions : sitting?.questions) ?? 0
      : acrossBank && index
        ? index.length
        : pool.length;

  const docOf = useMemo(() => new Map(loadedTopics.map((t) => [t.entry.id, t.doc])), [loadedTopics]);
  const allLoaded = useMemo(() => loadedTopics.flatMap((t) => t.items), [loadedTopics]);
  const filtered =
    words !== '' || filters.exams.length > 0 || filters.from !== undefined || filters.to !== undefined || filters.paper !== undefined;

  return {
    bank,
    base,
    topics,
    topic,
    topicState,
    setTopic: (id: string) => setTopicId(id),
    view,
    /**
     * By topic or by year. Going to By year opens the paper the Paper filter had chosen; going
     * back to By topic drops the year's paper, which would otherwise read as "one paper of every topic".
     */
    setView: (next: PastPaperView) => {
      if (next === view) return;
      setSettings({ view: next });
      if (next === 'year' && filters.paper !== undefined) setSittingId(sittingOfPaper(filters.paper));
      if (next !== 'year' && filters.paper !== undefined) setFilters({ ...filters, paper: undefined });
    },
    yearGroups,
    sitting,
    yearPaper,
    /** Open a year (and drop a paper of the last one). */
    setSitting: (key: string) => {
      setSittingId(key);
      if (filters.paper !== undefined && sittingOfPaper(filters.paper) !== key) setFilters({ ...filters, paper: undefined });
    },
    searchingAll,
    filters,
    setFilters,
    filtered,
    pool,
    poolSize,
    entries,
    items,
    years,
    papers,
    docOf,
    /** The list has a search index: a search of every topic downloads only what it shows. */
    indexed: index !== undefined,
    acrossBank,
    loadedCount: loadedTopics.length,
    /** Every item of every topic downloaded so far, for picks that span topics. */
    allLoaded,
  };
}

export type PastPaperBrowse = ReturnType<typeof usePastPaperBrowse>;

/** A pick: the topic and question it names (one question, by id, in one topic file). */
export interface Pick {
  topicId: string;
  questionId: string;
}

export const pickKey = (pick: Pick) => `${pick.topicId}|${pick.questionId}`;

export { paperKey };
