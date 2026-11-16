'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSettings } from '@/settings/store';
import { PAST_PAPER_SETTINGS, sourceUrl } from '@/pastpapers/config';
import { usePastPaperBank, type TopicState } from '@/pastpapers/bank';
import { matchItem, yearSpan, type PastPaperItem, type SourceInfo } from '@/pastpapers/pack';

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
  /** Search every downloaded topic, not just the open one. */
  everywhere: boolean;
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

  const pool: PastPaperItem[] = useMemo(() => {
    if (filters.everywhere && filters.words.trim()) return loadedTopics.flatMap((t) => t.items);
    return topicState?.state === 'ready' ? topicState.data.items : [];
  }, [filters.everywhere, filters.words, loadedTopics, topicState]);

  const items = useMemo(
    () => pool.filter((item) => matchItem(item, { words: filters.words, exams: filters.exams, from: filters.from, to: filters.to })),
    [pool, filters],
  );

  const years = useMemo(() => yearSpan(loadedTopics.flatMap((t) => t.items)), [loadedTopics]);
  const docOf = useMemo(() => new Map(loadedTopics.map((t) => [t.entry.id, t.doc])), [loadedTopics]);
  const filtered = filters.words.trim() !== '' || filters.exams.length > 0 || filters.from !== undefined || filters.to !== undefined;

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
    items,
    years,
    docOf,
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
