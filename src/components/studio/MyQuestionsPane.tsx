'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { topicName } from '@/components/bank/page/topicText';
import { PastPaperTopicPicker } from '@/components/pastpapers/PastPaperTopicPicker';
import { useOwningDocument } from '@/components/bank/page/useOwningDocument';
import { useMessages } from '@/i18n/language';
import { dayOf, distinctDocLabels } from '@/library/docLabels';
import { useBank } from '@/library/useBank';
import { viewCodesOf } from '@/model/mcqView';
import type { LanguageMode, Worksheet } from '@/model/types';
import { worksheetStore } from '@/storage';
import { REFERENCE_PICKER_MESSAGES } from './picker.messages';
import { ReferenceSheet } from './ReferenceSheet';
import {
  mineLabel,
  mineReference,
  myQuestionList,
  myTopicEntries,
  noteRecent,
  PAGE_SIZE,
  readRecent,
  WHEN_CHOICES,
  type MineReference,
  type MyEntry,
  type MyFilter,
} from './myQuestions';

/** What the picker's footer offers for the selected question: its name, and Use. */
export interface MineChoice {
  label: string;
  use: () => void;
}

/**
 * The reference picker's "My questions" side (k-0529): the teacher's own multiple-choice
 * questions from the 題庫 index, a topic and date rail, a list shown a page at a time (a large
 * bank never draws thousands of rows), and the selected question drawn as it prints. Picking
 * reads the owning document once; the question itself is never written.
 */
export function MyQuestionsPane({
  words,
  language,
  onChoice,
  onPick,
}: {
  words: string;
  language: LanguageMode;
  onChoice: (choice: MineChoice | undefined) => void;
  onPick: (ref: MineReference) => void;
}) {
  const m = useMessages(REFERENCE_PICKER_MESSAGES);
  const bank = useBank();
  const [topic, setTopic] = useState<string | undefined>();
  const [when, setWhen] = useState<MyFilter['when']>('any');
  // Pages shown, for one filter: a new filter starts again at the first page.
  const [paged, setPaged] = useState({ key: '', limit: PAGE_SIZE });
  const [selected, setSelected] = useState<string | undefined>();
  const [recent] = useState(() => readRecent());
  const [now] = useState(() => Date.now());
  const deferredWords = useDeferredValue(words);

  const list = useMemo(() => myQuestionList(bank.groups, { words: deferredWords, topic, when }, recent, now), [bank.groups, deferredWords, topic, when, recent, now]);
  const rail = useMemo(
    () => myTopicEntries(bank.groups, { general: REFERENCE_PICKER_MESSAGES.general, none: REFERENCE_PICKER_MESSAGES.untagged }),
    [bank.groups],
  );
  const currentTopic = topic !== undefined ? rail.topics.find((t) => t.id === topic) : undefined;
  const labels = useMemo(() => distinctDocLabels(bank.rows), [bank.rows]);

  const filterKey = `${deferredWords}\u0000${topic ?? ''}\u0000${when}`;
  const limit = paged.key === filterKey ? paged.limit : PAGE_SIZE;

  const entry = selected !== undefined ? list.entries.find((e) => e.group.rootId === selected) : undefined;
  const labelOf = useCallback((e: MyEntry) => mineLabel(labels.get(e.row.docId) ?? e.row.docTitle, e.row.number), [labels]);
  const { worksheet, failed } = useOwningDocument(entry?.row);
  const reference = useMemo(
    () => (entry && worksheet ? mineReference(worksheet, entry.row.questionId, labelOf(entry), entry.row.number) : undefined),
    [entry, worksheet, labelOf],
  );

  const pickRef = useRef(onPick);
  useEffect(() => {
    pickRef.current = onPick;
  });
  const use = useCallback((ref: MineReference, rootId: string) => {
    noteRecent(rootId, Date.now());
    pickRef.current(ref);
  }, []);

  // A double-click may come before the selected question's paper is read: read it here.
  const pickEntry = useCallback(
    async (e: MyEntry) => {
      let doc: Worksheet | undefined;
      try {
        doc = await worksheetStore.load(e.row.docId);
      } catch {
        doc = undefined;
      }
      const ref = doc ? mineReference(doc, e.row.questionId, labelOf(e), e.row.number) : undefined;
      if (ref) use(ref, e.group.rootId);
    },
    [labelOf, use],
  );

  useEffect(() => {
    onChoice(
      entry && reference
        ? {
            label: reference.source.label,
            use: () => use(reference, entry.group.rootId),
          }
        : undefined,
    );
  }, [entry, reference, onChoice, use]);

  const status = bank.status.state;
  const shown = list.entries.slice(0, limit);
  const topicLine = (e: MyEntry) => {
    const code = viewCodesOf(e.row.tags)[0];
    return code ? topicName(code, language) : m.untagged;
  };
  const excerpt = (e: MyEntry) => (language === 'zh' ? e.row.excerpt.zh || e.row.excerpt.en : e.row.excerpt.en || e.row.excerpt.zh);

  return (
    <div className="flex min-h-0 flex-1" data-my-questions>
      {/* The Past paper bank's topic picker (k-0578): sections A–J, each opening onto its
          MCQ topics with their counts, a filter across them, and All topics first. */}
      <div className="flex min-h-0 shrink-0 border-r border-line bg-surface-sunken [&>nav]:min-h-0" aria-label={m.mineRail} data-my-rail>
        <PastPaperTopicPicker
          topics={rail.topics}
          current={currentTopic}
          active
          language={language}
          partCounts={rail.parts}
          all={{ label: m.allTopics, count: list.total, onPick: () => setTopic(undefined) }}
          onPick={setTopic}
          top={
            <label className="flex shrink-0 flex-col gap-1 px-4 pt-3">
              <span className="pl-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-subtle">{m.whenHeading}</span>
              <select
                value={when}
                onChange={(event) => setWhen(WHEN_CHOICES.find((w) => w === event.target.value) ?? 'any')}
                data-my-when
                className="h-8 w-full cursor-pointer rounded-lg border border-line bg-surface px-2 text-[12.5px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent pointer-coarse:h-10"
              >
                {WHEN_CHOICES.map((w) => (
                  <option key={w} value={w}>
                    {m.when(w)}
                  </option>
                ))}
              </select>
            </label>
          }
        />
      </div>

      <div className="scroll-slim flex w-[min(400px,36%)] min-h-0 shrink-0 flex-col overflow-y-auto border-r border-line p-3" data-my-list>
        <p className="mb-1 px-1 text-[12px] tabular-nums text-ink-subtle" role="status">
          {status === 'scanning' && list.total === 0 ? m.mineScanning : m.mineShown(list.entries.length, list.total)}
        </p>
        {list.otherTypes > 0 && (
          <p className="mb-2 px-1 text-[11.5px] text-ink-subtle" data-my-only-mc>
            {m.onlyMc(list.otherTypes)}
          </p>
        )}
        {status === 'error' && list.total === 0 && <p className="px-1 text-[13px] text-ink-muted">{m.mineError}</p>}
        {status === 'ready' && list.total === 0 && <p className="px-1 text-[13px] leading-relaxed text-ink-muted">{m.mineNone}</p>}
        {list.total > 0 && list.entries.length === 0 && <p className="px-1 text-[13px] text-ink-muted">{m.mineEmpty}</p>}
        <ul className="flex flex-col gap-1.5">
          {shown.map((e) => {
            const on = selected === e.group.rootId;
            const label = labelOf(e);
            return (
              <li key={e.group.rootId}>
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={m.cardLabel(label)}
                  data-my-card={e.group.rootId}
                  onClick={() => setSelected(e.group.rootId)}
                  onDoubleClick={() => void pickEntry(e)}
                  className={`flex w-full min-w-0 cursor-pointer flex-col gap-1 rounded-lg border bg-surface px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    on ? 'border-accent ring-2 ring-accent/25' : 'border-line hover:border-line-strong'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{label}</span>
                    {e.recentAt && <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] text-ink">{m.recent}</span>}
                    {e.row.hasDiagram && (
                      <span title={m.diagramTitle} className="shrink-0 rounded-full border border-line bg-surface-sunken px-2 py-0.5 text-[10.5px] text-ink-muted">
                        {m.diagram}
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-2 text-[12.5px] leading-snug text-ink-muted">{excerpt(e)}</span>
                  <span className="truncate text-[11px] text-ink-subtle">
                    {topicLine(e)}
                    {dayOf(e.row.usedOn) && ` · ${dayOf(e.row.usedOn)}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {list.entries.length > limit && (
          <button
            type="button"
            onClick={() => setPaged({ key: filterKey, limit: limit + PAGE_SIZE })}
            className="mt-2 cursor-pointer self-center rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] text-ink hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            data-my-more
          >
            {m.showMore(list.entries.length - limit)}
          </button>
        )}
      </div>

      <div className="scroll-slim min-h-0 min-w-0 flex-1 overflow-y-auto bg-desk p-4" data-my-preview>
        {!entry ? (
          <p className="text-[13px] text-ink-muted">{m.previewNone}</p>
        ) : failed ? (
          <p className="text-[13px] text-ink-muted" role="alert">
            {m.previewFailed}
          </p>
        ) : !reference ? (
          <p className="text-[13px] text-ink-muted" role="status">
            {m.previewLoading}
          </p>
        ) : (
          <>
            <ReferenceSheet reference={reference.source} item={reference.item} doc={worksheet} language={language} />
            <p className="mt-3 text-[11.5px] text-ink-subtle">
              {m.savedIn(new Set(entry.group.rows.map((r) => r.docId)).size)} · {m.neverChanged}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
