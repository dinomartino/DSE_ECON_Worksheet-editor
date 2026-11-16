'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSettings } from '@/settings/store';
import { PAST_PAPER_SETTINGS, sourceUrl } from '@/pastpapers/config';
import { usePastPaperBank, type TopicState } from '@/pastpapers/bank';
import { matchItem, papersOf, paperKey, yearSpan, type PastPaperItem, type SearchRow, type SourceInfo } from '@/pastpapers/pack';

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

function readTopic(): string | undefined {
  try {
    return globalThis.sessionStorage?.getItem(TOPIC_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function usePastPaperBrowse() {
  const [settings] = useSettings(PAST_PAPER_SETTINGS);
  const base = sourceUrl(settings);
  const bank = usePastPaperBank();
  const [topicId, setTopicId] = useState<string | undefined>(readTopic);
  const [filters, setFilters] = useState<BrowseFilters>(NO_FILTERS);

  // Opened (again) whenever the source changes; once per source otherwise.
  useEffect(() => {
    void usePastPaperBank.getState().open();
  }, [base]);

  const manifestTopics = bank.manifest?.topics;
  const topics = useMemo(() => manifestTopics ?? [], [manifestTopics]);
  const topic = topics.find((t) => t.id === topicId) ?? topics[0];

  useEffect(() => {
    if (!topic) return;
    try {
      globalThis.sessionStorage?.setItem(TOPIC_KEY, topic.id);
    } catch {
      // Private mode: the topic is simply not remembered.
    }
    void usePastPaperBank.getState().topic(topic.id);
  }, [topic]);

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
  /** The bank as a whole, not the open topic: a search of every topic, or one paper. */
  const acrossBank = filters.paper !== undefined || (filters.everywhere && words !== '');
  const query = { words: filters.words, exams: filters.exams, from: filters.from, to: filters.to, paper: filters.paper };

  const itemByTag = useMemo(() => {
    const map = new Map<string, PastPaperItem>();
    for (const t of loadedTopics) for (const item of t.items) if (item.source.tag) map.set(`${item.topicId}|${item.source.tag}`, item);
    return map;
  }, [loadedTopics]);

  const pool: PastPaperItem[] = useMemo(() => {
    if (acrossBank) return loadedTopics.flatMap((t) => t.items);
    return topicState?.state === 'ready' ? topicState.data.items : [];
  }, [acrossBank, loadedTopics, topicState]);

  const byNumber = (a: { source: SourceInfo }, b: { source: SourceInfo }) => (a.source.number ?? 0) - (b.source.number ?? 0);

  const entries: BrowseEntry[] = useMemo(() => {
    if (acrossBank && index) {
      const rows = index.filter((row) => matchItem(row, query));
      if (filters.paper !== undefined) rows.sort(byNumber);
      return rows.map((row) => {
        const key = `${row.topicId}|${row.source.tag}`;
        const item = itemByTag.get(key);
        return { key, topicId: row.topicId, tag: row.source.tag, row, ...(item ? { item } : {}) };
      });
    }
    const items = pool.filter((item) => matchItem(item, query));
    if (filters.paper !== undefined) items.sort(byNumber);
    return items.map((item) => ({ key: `${item.topicId}|${item.question.id}`, topicId: item.topicId, tag: item.source.tag, item }));
    // `query` is rebuilt from `filters` each render; `filters` is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acrossBank, index, pool, filters, itemByTag]);

  const items = useMemo(() => entries.flatMap((entry) => (entry.item ? [entry.item] : [])), [entries]);
  /** How many the filters chose from. */
  const poolSize = acrossBank && index ? index.length : pool.length;

  const everything = useMemo(() => (index && index.length > 0 ? index : loadedTopics.flatMap((t) => t.items)), [index, loadedTopics]);
  const years = useMemo(() => yearSpan(everything), [everything]);
  const papers = useMemo(() => papersOf(everything), [everything]);
  const docOf = useMemo(() => new Map(loadedTopics.map((t) => [t.entry.id, t.doc])), [loadedTopics]);
  const filtered =
    words !== '' || filters.exams.length > 0 || filters.from !== undefined || filters.to !== undefined || filters.paper !== undefined;

  return {
    bank,
    base,
    topics,
    topic,
    topicState,
    setTopic: (id: string) => setTopicId(id),
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
    allLoaded: loadedTopics.flatMap((t) => t.items),
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
