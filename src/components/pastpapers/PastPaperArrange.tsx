'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DragChip } from '@/components/ui/DragGhost';
import { ChevronDownIcon, ChevronRightIcon, ChevronUpIcon, GripIcon, ImageIcon } from '@/components/ui/icons';
import { useMessages } from '@/i18n/language';
import { topicNamesFor } from '@/model/topics';
import type { LanguageMode } from '@/model/types';
import { arrangeLists, defaultLists, moveKeys, resetTopic, stepKeys, storedFrom, type ArrangeRow } from '@/pastpapers/arrange';
import { useArrangement } from '@/pastpapers/arrangeStore';
import { groupTopics, OTHER_PART, partName, type TopicGroup } from '@/pastpapers/groups';
import { matchItem, packName, shortSourceLabel, type PastPaperItem, type SourceInfo, type TopicEntry } from '@/pastpapers/pack';
import type { QuestionSourceFormat } from '@/model/types';
import { ARRANGE_MESSAGES } from './PastPaperArrange.messages';
import { PAST_PAPER_MESSAGES } from './messages';
import { ExamChips, LanguageToggle, YearSelects } from './PastPaperControls';
import { PastPaperSheet } from './PastPaperSheet';
import { PastPaperTopicPicker } from './PastPaperTopicPicker';
import type { PastPaperBrowse } from './usePastPaperBrowse';

/**
 * Arrange 編排 (k-0556, users u-dqw8 + u-o86n): the whole Past paper bank on one page, under
 * syllabus part (topic) and bank topic (subtopic), one compact row per question with its
 * source. The teacher drags questions into their own order, or onto another topic to move them
 * there (Alt + ↑ ↓ on the keyboard, or the ticked ones through Move to…); ticks a whole part or
 * topic in one click; and turns a part, a topic or the ticked set into a worksheet in that
 * order. The order is the teacher's alone (`pastpapers/arrange.ts`, kept on this computer by
 * `arrangeStore.ts`); the bank's files never change.
 *
 * Rows come from the list's search index, so the page needs no topic downloaded; the topics a
 * worksheet takes questions from are downloaded when it is made (`resolve`).
 */

/** One question as a row: what the index (or a downloaded topic) says about it. */
interface ArrangeEntry {
  key: string;
  /** The topic the bank files it under. */
  topicId: string;
  source: SourceInfo;
  en: string;
  zh: string;
  pictures: number;
  searchText: string;
}

/** Where a drop would land: in this topic, before this question (the end when absent). */
interface DropAt {
  topicId: string;
  before?: string;
}

/** Presses here never start a drag. */
const IGNORE = 'input, button, select, a, [data-drag-ignore]';
const DRAG_THRESHOLD_PX = 5;
const HOT_ZONE_PX = 48;
const MAX_SPEED_PX = 18;

/** The key a question is known by in the arrangement: its source tag (unique in the bank). */
export const arrangeKey = (item: { topicId: string; source: SourceInfo; question?: { id: string } }) =>
  item.source.tag || `${item.topicId}|${item.question?.id ?? ''}`;

export interface ArrangeAddOptions {
  /** `new:classroom`, `new:paper1`, or a saved paper's id; absent = the bar's choice. */
  to?: string;
  /** The new worksheet's name. */
  name?: string;
  /** How Show source prints on a paper getting its first sourced questions; absent = the tray's. */
  sourceFormat?: QuestionSourceFormat;
}

export function PastPaperArrange({
  browse,
  language,
  onLanguage,
  switcher,
  addControls,
  busy,
  onAdd,
  onCopy,
  onNotice,
  onError,
}: {
  browse: PastPaperBrowse;
  language: LanguageMode;
  onLanguage: (next: LanguageMode) => void;
  /** The By topic / By year / Arrange switch, drawn above the topic list. */
  switcher: ReactNode;
  /** Show source, its format and Add to (the screen's own controls). */
  addControls: ReactNode;
  busy: boolean;
  /** Put these questions, in this order, where the bar (or `options`) says; `done` once they are in. */
  onAdd: (items: PastPaperItem[], done: () => void, options?: ArrangeAddOptions) => void | Promise<void>;
  onCopy: (items: PastPaperItem[], done: () => void) => void | Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const m = useMessages(ARRANGE_MESSAGES);
  const pm = useMessages(PAST_PAPER_MESSAGES);
  const { bank, topics, filters, setFilters } = browse;
  const names = topicNamesFor(language);
  const index = bank.manifest?.search;

  // Every question as a row, in the bank's order.
  const entries: ArrangeEntry[] = useMemo(() => {
    if (index && index.length > 0) {
      return index.map((row) => ({ key: row.source.tag, topicId: row.topicId, source: row.source, en: row.en, zh: row.zh, pictures: row.pictures, searchText: row.searchText }));
    }
    return browse.allLoaded.map((item) => ({
      key: arrangeKey(item),
      topicId: item.topicId,
      source: item.source,
      en: item.excerpt.en,
      zh: item.excerpt.zh,
      pictures: 0,
      searchText: item.searchText,
    }));
  }, [index, browse.allLoaded]);
  const byKey = useMemo(() => new Map(entries.map((entry) => [entry.key, entry])), [entries]);
  const rows: ArrangeRow[] = useMemo(() => entries.map(({ key, topicId }) => ({ key, topicId })), [entries]);
  const topicIds = useMemo(() => topics.map((t) => t.id), [topics]);
  const topicById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);

  const [arrangement, setArrangement] = useArrangement(browse.base);
  const lists = useMemo(() => arrangeLists(rows, topicIds, arrangement), [rows, topicIds, arrangement]);
  const defaults = useMemo(() => defaultLists(rows, topicIds), [rows, topicIds]);
  const commit = useCallback((next: Map<string, string[]>) => setArrangement(storedFrom(next, defaults)), [setArrangement, defaults]);
  const changed = (topicId: string) => arrangement.topics[topicId] !== undefined && topicById.has(topicId);
  const anyChanged = Object.keys(arrangement.topics).some((id) => topicById.has(id));

  const groups: TopicGroup[] = useMemo(() => groupTopics(topics) ?? [{ code: OTHER_PART, topics: [...topics] }], [topics]);
  const flat = groups.length === 1 && groups[0].code === OTHER_PART;

  // The filters (words, exams, years) hide rows; hidden rows keep their place.
  const query = useMemo(() => ({ words: filters.words, exams: filters.exams, from: filters.from, to: filters.to }), [filters.words, filters.exams, filters.from, filters.to]);
  const filtering = query.words.trim() !== '' || query.exams.length > 0 || query.from !== undefined || query.to !== undefined;
  const shownLists = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const [id, list] of lists) {
      out.set(id, filtering ? list.filter((key) => { const entry = byKey.get(key); return entry !== undefined && matchItem(entry, query); }) : list);
    }
    return out;
  }, [lists, filtering, byKey, query]);
  const shown = useMemo(() => topics.map((t) => ({ topicId: t.id, keys: shownLists.get(t.id) ?? [] })), [topics, shownLists]);
  const shownCount = shown.reduce((n, s) => n + s.keys.length, 0);

  const topicName = useCallback((id: string) => {
    const entry = topicById.get(id);
    return entry ? packName(entry.title, language) : id;
  }, [topicById, language]);

  // Ticks.
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const orderedSelection = useMemo(() => topics.flatMap((t) => (lists.get(t.id) ?? []).filter((key) => selected.has(key))), [topics, lists, selected]);
  const toggleKey = useCallback((key: string) => {
    setSelected((now) => {
      const next = new Set(now);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, [setSelected]);
  const toggleMany = (keys: readonly string[]) => {
    setSelected((now) => {
      const all = keys.length > 0 && keys.every((key) => now.has(key));
      const next = new Set(now);
      for (const key of keys) {
        if (all) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  };

  // Open and closed parts and topics: everything open at first.
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());
  const toggleClosed = (id: string) => setClosed((now) => {
    const next = new Set(now);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  // The question shown as it prints, under its row.
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const itemByKey = useMemo(() => new Map(browse.allLoaded.map((item) => [arrangeKey(item), item])), [browse.allLoaded]);
  const toggleOpenedNow = (key: string) => {
    setOpened((now) => {
      const next = new Set(now);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    const entry = byKey.get(key);
    if (entry) void bank.topic(entry.topicId);
  };

  // The topic list on the left jumps to a topic.
  const scroller = useRef<HTMLDivElement>(null);
  const [jumped, setJumped] = useState<string | undefined>();
  const jumpTo = (id: string) => {
    setJumped(id);
    const part = groups.find((g) => g.topics.some((t) => t.id === id))?.code;
    setClosed((now) => {
      const next = new Set(now);
      next.delete(id);
      if (part !== undefined) next.delete(`part:${part}`);
      return next;
    });
    requestAnimationFrame(() => {
      scroller.current?.querySelector<HTMLElement>(`[data-arrange-topic="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'start' });
    });
  };
  const pickerTopics = useMemo(() => topics.map((t) => ({ ...t, questions: lists.get(t.id)?.length ?? 0 })), [topics, lists]);

  // Getting the questions themselves: their topics download (or come from the cache).
  const [gathering, setGathering] = useState(false);
  const resolve = async (keys: readonly string[]): Promise<PastPaperItem[]> => {
    const need = [...new Set(keys.flatMap((key) => byKey.get(key)?.topicId ?? []))];
    setGathering(true);
    try {
      const states = await Promise.all(need.map((id) => bank.topic(id)));
      const found = new Map<string, PastPaperItem>();
      for (const state of states) {
        if (state?.state !== 'ready') continue;
        for (const item of state.data.items) found.set(arrangeKey(item), item);
      }
      const items = keys.flatMap((key) => found.get(key) ?? []);
      if (items.length < keys.length) onError(m.missing(keys.length - items.length));
      return items;
    } finally {
      setGathering(false);
    }
  };
  const addKeys = async (keys: readonly string[], options?: ArrangeAddOptions, clear = false) => {
    if (keys.length === 0) return;
    const items = await resolve(keys);
    // Arrange speaks the short source label (u-rvgs), so its papers print it short too.
    if (items.length > 0) await onAdd(items, () => clear && setSelected(new Set()), { ...options, sourceFormat: 'short' });
  };
  const copyKeys = async (keys: readonly string[]) => {
    const items = await resolve(keys);
    if (items.length > 0) await onCopy(items, () => setSelected(new Set()));
  };

  const moveSelectionTo = (topicId: string) => {
    if (orderedSelection.length === 0) return;
    commit(moveKeys(lists, orderedSelection, topicId));
    onNotice(m.moved(orderedSelection.length, topicName(topicId)));
  };

  // Keyboard: focus follows a moved question.
  const focusAfter = useRef<string | undefined>(undefined);
  useEffect(() => {
    const key = focusAfter.current;
    if (!key) return;
    focusAfter.current = undefined;
    scroller.current?.querySelector<HTMLElement>(`[data-arrange-row="${CSS.escape(key)}"]`)?.focus();
  });
  const stepNow = (key: string, direction: -1 | 1) => {
    const keys = selected.has(key) ? orderedSelection : [key];
    const next = stepKeys(lists, shown, keys, direction);
    if (!next) return;
    focusAfter.current = key;
    commit(next);
  };
  // The rows get handlers that never change, so a tick or a move redraws only the rows it touches.
  const latest = useRef({ stepNow, toggleOpenedNow });
  useEffect(() => {
    latest.current = { stepNow, toggleOpenedNow };
  });
  const step = useCallback((key: string, direction: -1 | 1) => latest.current.stepNow(key, direction), []);
  const toggleOpened = useCallback((key: string) => latest.current.toggleOpenedNow(key), []);
  const onRowKey = useCallback((event: KeyboardEvent<HTMLElement>, key: string) => {
    if (event.target !== event.currentTarget) return;
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && event.altKey) {
      event.preventDefault();
      step(key, event.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const all = [...(scroller.current?.querySelectorAll<HTMLElement>('[data-arrange-row]') ?? [])];
      const at = all.indexOf(event.currentTarget);
      all[at + (event.key === 'ArrowUp' ? -1 : 1)]?.focus();
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      toggleKey(key);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      toggleOpened(key);
    }
  }, [step, toggleKey, toggleOpened]);

  // Dragging: pointer events (as the 題庫's own drags), a chip at the pointer, a line where the questions would land.
  const [drag, setDrag] = useState<{ keys: string[]; label: string; detail?: string } | null>(null);
  const [dropAt, setDropAt] = useState<DropAt | null>(null);
  const press = useRef<{ key: string; x: number; y: number; pointerId: number } | null>(null);
  const live = useRef<{ keys: string[]; drop: DropAt | null; x: number; y: number; speed: number; frame: number } | null>(null);
  const chip = useRef<HTMLDivElement>(null);
  const swallowClick = useRef(false);
  const state = useRef({ lists, selected, orderedSelection, byKey, language, commit, carry: m.carrying });
  useEffect(() => {
    state.current = { lists, selected, orderedSelection, byKey, language, commit, carry: m.carrying };
  });

  const onRowPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>, key: string) => {
    if (event.button !== 0 || (event.target as Element).closest(IGNORE)) return;
    press.current = { key, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  }, []);

  useEffect(() => {
    const targetAt = (x: number, y: number, moving: ReadonlySet<string>): DropAt | null => {
      const el = document.elementFromPoint(x, y);
      if (!el || !scroller.current?.contains(el)) return null;
      const row = el.closest<HTMLElement>('[data-arrange-row]');
      if (row) {
        const key = row.dataset.arrangeRow ?? '';
        const topicId = row.dataset.arrangeIn ?? '';
        const box = row.getBoundingClientRect();
        if (y < box.top + box.height / 2) return moving.has(key) ? sameSpot(key, topicId) : { topicId, before: key };
        const list = state.current.lists.get(topicId) ?? [];
        const after = list.slice(list.indexOf(key) + 1).find((k) => !moving.has(k));
        return { topicId, ...(after ? { before: after } : {}) };
      }
      const head = el.closest<HTMLElement>('[data-arrange-topic-head]');
      if (head) {
        const topicId = head.dataset.arrangeTopicHead ?? '';
        const first = (state.current.lists.get(topicId) ?? []).find((k) => !moving.has(k));
        return { topicId, ...(first ? { before: first } : {}) };
      }
      const section = el.closest<HTMLElement>('[data-arrange-topic]');
      if (section) return { topicId: section.dataset.arrangeTopic ?? '' };
      return null;
    };
    // Pressed on a row being carried: it stays where it is (before the next question not carried).
    const sameSpot = (key: string, topicId: string): DropAt => {
      const list = state.current.lists.get(topicId) ?? [];
      const moving = new Set(live.current?.keys ?? []);
      const after = list.slice(list.indexOf(key)).find((k) => !moving.has(k));
      return { topicId, ...(after ? { before: after } : {}) };
    };
    const sameDrop = (a: DropAt | null, b: DropAt | null) => a?.topicId === b?.topicId && a?.before === b?.before;
    const place = () => {
      const now = live.current;
      if (!now) return;
      if (chip.current) chip.current.style.transform = `translate(${now.x + 14}px, ${now.y + 10}px)`;
      const next = targetAt(now.x, now.y, new Set(now.keys));
      if (!sameDrop(next, now.drop)) {
        now.drop = next;
        setDropAt(next);
      }
    };
    const tick = () => {
      const now = live.current;
      if (!now) return;
      if (now.speed !== 0 && scroller.current) {
        scroller.current.scrollTop += now.speed;
        place();
      }
      now.frame = requestAnimationFrame(tick);
    };
    const end = () => {
      const now = live.current;
      if (now) cancelAnimationFrame(now.frame);
      live.current = null;
      press.current = null;
      document.body.style.userSelect = '';
      setDrag(null);
      setDropAt(null);
    };
    const onMove = (event: PointerEvent) => {
      const pressed = press.current;
      if (!pressed || event.pointerId !== pressed.pointerId) return;
      if (!live.current) {
        if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) < DRAG_THRESHOLD_PX) return;
        const { selected: ticked, orderedSelection: ticks, byKey: entries, carry } = state.current;
        const keys = ticked.has(pressed.key) ? ticks : [pressed.key];
        const first = entries.get(keys[0]);
        live.current = { keys, drop: null, x: event.clientX, y: event.clientY, speed: 0, frame: requestAnimationFrame(tick) };
        document.body.style.userSelect = 'none';
        window.getSelection()?.removeAllRanges();
        setDrag({
          keys,
          label: keys.length === 1 && first ? shortSourceLabel(first.source) : carry(keys.length),
        });
      }
      const now = live.current;
      now.x = event.clientX;
      now.y = event.clientY;
      const box = scroller.current?.getBoundingClientRect();
      if (box) {
        const top = event.clientY - box.top;
        const bottom = box.bottom - event.clientY;
        now.speed = top < HOT_ZONE_PX ? -Math.ceil(MAX_SPEED_PX * (1 - Math.max(top, 0) / HOT_ZONE_PX)) : bottom < HOT_ZONE_PX ? Math.ceil(MAX_SPEED_PX * (1 - Math.max(bottom, 0) / HOT_ZONE_PX)) : 0;
      }
      place();
    };
    const onUp = (event: PointerEvent) => {
      const pressed = press.current;
      if (!pressed || event.pointerId !== pressed.pointerId) return;
      const now = live.current;
      if (now) {
        swallowClick.current = true;
        setTimeout(() => (swallowClick.current = false), 0);
        if (now.drop) state.current.commit(moveKeys(state.current.lists, now.keys, now.drop.topicId, now.drop.before));
      }
      end();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && live.current) {
        event.preventDefault();
        event.stopPropagation();
        end();
      }
    };
    const onClick = (event: MouseEvent) => {
      if (!swallowClick.current) return;
      event.preventDefault();
      event.stopPropagation();
      swallowClick.current = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', end);
    window.addEventListener('blur', end);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('blur', end);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('click', onClick, true);
      if (live.current) end();
    };
  }, []);

  const carrying = useMemo(() => new Set(drag?.keys ?? []), [drag]);
  const totalBytes = bank.manifest?.topics.reduce((n, t) => n + (t.bytes ?? 0), 0) ?? 0;
  const [loadingAll, setLoadingAll] = useState<{ done: number; total: number } | undefined>();
  const needsAll = !index && browse.loadedCount < topics.length;
  const keysOfGroup = (group: TopicGroup) => group.topics.flatMap((t) => shownLists.get(t.id) ?? []);
  const checkState = (keys: readonly string[]) => {
    const ticked = keys.filter((key) => selected.has(key)).length;
    return { checked: keys.length > 0 && ticked === keys.length, mixed: ticked > 0 && ticked < keys.length };
  };
  const allClosed = groups.every((g) => closed.has(`part:${g.code}`));

  return (
    <>
      <PastPaperTopicPicker topics={pickerTopics} current={topicById.get(jumped ?? '')} active={jumped !== undefined} language={language} top={switcher} onPick={jumpTo} />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col" data-pastpaper-arrange>
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-6 py-2.5">
          <h2 className="text-[15px] font-semibold text-ink" data-pastpaper-heading>
            {m.heading}
          </h2>
          <span className="text-[12px] tabular-nums text-ink-subtle" role="status">
            {m.shown(shownCount, entries.length)}
          </span>
          <button
            type="button"
            onClick={() => setClosed(allClosed ? new Set() : new Set(groups.map((g) => `part:${g.code}`)))}
            className="cursor-pointer text-[12px] text-ink-muted hover:text-ink hover:underline"
          >
            {allClosed ? m.openAll : m.closeAll}
          </button>
          {anyChanged && (
            <button
              type="button"
              data-arrange-reset-all
              onClick={() => {
                if (!window.confirm(m.resetAllConfirm)) return;
                setArrangement({ topics: {} });
                onNotice(m.resetDone);
              }}
              className="cursor-pointer text-[12px] text-ink-muted hover:text-ink hover:underline"
            >
              {m.resetAll}
            </button>
          )}
          <span className="flex-1" />
          <ExamChips filters={filters} onChange={setFilters} />
          <YearSelects filters={filters} years={browse.years} onChange={setFilters} />
          <LanguageToggle value={language} onChange={onLanguage} />
        </div>

        <div ref={scroller} className="scroll-slim min-h-0 flex-1 overflow-y-auto bg-desk px-6 py-4">
          <div className="mx-auto flex max-w-[860px] flex-col gap-3">
            <p className="text-[12px] leading-snug text-ink-subtle" title={m.keysHint}>
              {m.hint}
            </p>
            {needsAll && (
              <div className="rounded-lg border border-line bg-surface px-4 py-3 text-[12.5px] text-ink-muted" data-arrange-needs-all>
                {loadingAll ? (
                  <span role="status">{pm.loadingAll(loadingAll.done, loadingAll.total)}</span>
                ) : (
                  <>
                    <span>{m.needsAll((totalBytes / 1_000_000).toFixed(0))}</span>{' '}
                    <button
                      type="button"
                      className="ml-1 cursor-pointer font-medium text-accent hover:underline"
                      onClick={() => {
                        setLoadingAll({ done: 0, total: topics.length });
                        void bank.loadAll((done, total) => setLoadingAll({ done, total })).finally(() => setLoadingAll(undefined));
                      }}
                    >
                      {m.downloadAll}
                    </button>
                  </>
                )}
              </div>
            )}
            {filtering && shownCount === 0 && entries.length > 0 && <p className="text-[13px] text-ink-muted">{m.noneMatch}</p>}

            {groups.map((group) => {
              const groupKeys = keysOfGroup(group);
              if (filtering && groupKeys.length === 0) return null;
              const partId = `part:${group.code}`;
              const partOpen = !closed.has(partId);
              const name = flat ? '' : partName(group, names, pm.otherTopics);
              const part = checkState(groupKeys);
              return (
                <section key={partId} data-arrange-part={group.code} className="flex flex-col gap-2">
                  {!flat && (
                    <div className="sticky top-[-16px] z-10 -mx-2 flex items-center gap-2 rounded-lg bg-desk/95 px-2 py-1.5 backdrop-blur">
                      <OpenToggle open={partOpen} label={partOpen ? m.collapse(name) : m.expand(name)} onClick={() => toggleClosed(partId)} />
                      <TriCheck {...part} label={m.selectAll(name)} onChange={() => toggleMany(groupKeys)} data-arrange-part-check={group.code} />
                      <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
                        {group.part ? <span className="mr-1.5 text-ink-subtle">{group.code}</span> : null}
                        {name}
                      </h3>
                      <span className="shrink-0 text-[12px] tabular-nums text-ink-subtle">{m.count(groupKeys.length)}</span>
                      <MakeButton name={name} count={groupKeys.length} disabled={busy || gathering} onClick={() => void addKeys(groupKeys, { to: 'new:classroom', name })} />
                    </div>
                  )}
                  {partOpen &&
                    group.topics.map((topic) => {
                      const keys = shownLists.get(topic.id) ?? [];
                      if (filtering && keys.length === 0) return null;
                      return (
                        <TopicBlock
                          key={topic.id}
                          topic={topic}
                          name={topicName(topic.id)}
                          keys={keys}
                          open={!closed.has(topic.id)}
                          changed={changed(topic.id)}
                          check={checkState(keys)}
                          dropAt={dropAt?.topicId === topic.id ? dropAt : null}
                          dragging={drag !== null}
                          busy={busy || gathering}
                          onToggleOpen={() => toggleClosed(topic.id)}
                          onToggleAll={() => toggleMany(keys)}
                          onReset={() => setArrangement(resetTopic(arrangement, topic.id, rows))}
                          onMake={() => void addKeys(keys, { to: 'new:classroom', name: topicName(topic.id) })}
                        >
                          {keys.map((key, at) => {
                            const entry = byKey.get(key);
                            if (!entry) return null;
                            return (
                              <QuestionRow
                                key={key}
                                entry={entry}
                                topicId={topic.id}
                                tabStop={at === 0}
                                language={language}
                                picked={selected.has(key)}
                                carried={carrying.has(key)}
                                dropBefore={dropAt?.topicId === topic.id && dropAt.before === key}
                                movedFrom={entry.topicId !== topic.id ? topicName(entry.topicId) : undefined}
                                opened={opened.has(key)}
                                item={itemByKey.get(key)}
                                doc={browse.docOf.get(entry.topicId)}
                                topicState={bank.topics[entry.topicId]?.state}
                                onToggle={toggleKey}
                                onOpen={toggleOpened}
                                onStep={step}
                                onKey={onRowKey}
                                onPointerDown={onRowPointerDown}
                              />
                            );
                          })}
                        </TopicBlock>
                      );
                    })}
                </section>
              );
            })}
          </div>
        </div>

        {(orderedSelection.length > 0 || gathering) && (
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-surface px-6 py-3" role="region" aria-label={m.selected(orderedSelection.length)} data-arrange-tray>
            <span className="text-[13px] font-medium text-ink">{m.selected(orderedSelection.length)}</span>
            <button type="button" onClick={() => setSelected(new Set())} className="cursor-pointer text-[12.5px] text-ink-muted hover:text-ink hover:underline">
              {m.clear}
            </button>
            <select
              aria-label={m.moveToLabel}
              value=""
              data-arrange-move-to
              onChange={(event) => {
                if (event.target.value) moveSelectionTo(event.target.value);
              }}
              className="h-8 w-[118px] rounded-lg border border-line bg-surface px-2 text-[12.5px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <option value="">{m.moveTo}</option>
              {groups.map((group) =>
                flat ? (
                  group.topics.map((t) => <option key={t.id} value={t.id}>{topicName(t.id)}</option>)
                ) : (
                  <optgroup key={group.code} label={partName(group, names, pm.otherTopics)}>
                    {group.topics.map((t) => <option key={t.id} value={t.id}>{topicName(t.id)}</option>)}
                  </optgroup>
                ),
              )}
            </select>
            {gathering && <span className="text-[12px] text-ink-subtle" role="status">{m.gathering}</span>}
            <span className="flex-1" />
            <button
              type="button"
              disabled={busy || gathering || orderedSelection.length === 0}
              onClick={() => void copyKeys(orderedSelection)}
              className="cursor-pointer text-[12.5px] text-ink-muted hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
            >
              {pm.copyToBank}
            </button>
            {addControls}
            <button
              type="button"
              data-arrange-add
              disabled={busy || gathering || orderedSelection.length === 0}
              onClick={() => void addKeys(orderedSelection, undefined, true)}
              className="cursor-pointer rounded-lg bg-cta px-3.5 py-1.5 text-[12.5px] font-medium text-on-cta hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
            >
              {pm.add}
            </button>
          </div>
        )}
      </main>

      {drag &&
        createPortal(
          <div ref={chip} className="pointer-events-none fixed left-0 top-0 z-[100]" style={{ transform: 'translate(-999px, -999px)' }} data-arrange-chip>
            <DragChip label={drag.label} />
          </div>,
          document.body,
        )}
    </>
  );
}

function OpenToggle({ open, label, onClick }: { open: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded text-ink-muted hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {open ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
    </button>
  );
}

function TriCheck({ checked, mixed, label, onChange, ...rest }: { checked: boolean; mixed: boolean; label: string; onChange: () => void } & Record<`data-${string}`, string>) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      aria-checked={mixed ? 'mixed' : checked}
      title={label}
      className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-accent)]"
      {...rest}
    />
  );
}

function MakeButton({ name, count, disabled, onClick }: { name: string; count: number; disabled: boolean; onClick: () => void }) {
  const m = useMessages(ARRANGE_MESSAGES);
  return (
    <button
      type="button"
      disabled={disabled || count === 0}
      onClick={onClick}
      title={m.makeWorksheetTitle(name, count)}
      data-arrange-make
      className="shrink-0 cursor-pointer rounded-md border border-line bg-surface px-2 py-0.5 text-[12px] text-ink-muted hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:opacity-50"
    >
      {m.makeWorksheet}
    </button>
  );
}

function TopicBlock({
  topic,
  name,
  keys,
  open,
  changed,
  check,
  dropAt,
  dragging,
  busy,
  onToggleOpen,
  onToggleAll,
  onReset,
  onMake,
  children,
}: {
  topic: TopicEntry;
  name: string;
  keys: readonly string[];
  open: boolean;
  changed: boolean;
  check: { checked: boolean; mixed: boolean };
  dropAt: DropAt | null;
  dragging: boolean;
  busy: boolean;
  onToggleOpen: () => void;
  onToggleAll: () => void;
  onReset: () => void;
  onMake: () => void;
  children: ReactNode;
}) {
  const m = useMessages(ARRANGE_MESSAGES);
  const atEnd = dropAt !== null && dropAt.before === undefined;
  return (
    <div
      data-arrange-topic={topic.id}
      className={`rounded-xl border bg-surface transition-colors duration-150 ${dropAt ? 'border-accent/60' : 'border-line'}`}
      style={open && keys.length > 12 ? { contentVisibility: 'auto', containIntrinsicSize: `auto ${keys.length * 41 + 44}px` } : undefined}
    >
      <div data-arrange-topic-head={topic.id} className="flex items-center gap-2 px-2.5 py-2">
        <OpenToggle open={open} label={open ? m.collapse(name) : m.expand(name)} onClick={onToggleOpen} />
        <TriCheck {...check} label={m.selectAll(name)} onChange={onToggleAll} data-arrange-topic-check={topic.id} />
        <h4 className="min-w-0 truncate text-[13px] font-semibold text-ink">{name}</h4>
        <span className="shrink-0 text-[12px] tabular-nums text-ink-subtle">{m.count(keys.length)}</span>
        {changed && (
          <>
            <span title={m.changedTitle} className="shrink-0 rounded-full bg-accent-soft px-2 py-px text-[11px] text-accent" data-arrange-changed>
              {m.changed}
            </span>
            <button type="button" onClick={onReset} title={m.resetTopicTitle} className="shrink-0 cursor-pointer text-[12px] text-ink-muted hover:text-ink hover:underline" data-arrange-reset>
              {m.resetTopic}
            </button>
          </>
        )}
        <span className="flex-1" />
        <MakeButton name={name} count={keys.length} disabled={busy} onClick={onMake} />
      </div>
      {open && (
        <div className="border-t border-line">
          {children}
          {keys.length === 0 && (
            <p className={`px-4 py-3 text-[12px] ${dragging ? 'text-accent' : 'text-ink-subtle'}`}>{m.dropHere}</p>
          )}
          {atEnd && keys.length > 0 && <DropLine />}
        </div>
      )}
    </div>
  );
}

function DropLine() {
  return <div aria-hidden className="mx-3 h-0.5 rounded-full bg-accent" data-arrange-drop-line />;
}

const QuestionRow = memo(function QuestionRow({
  entry,
  topicId,
  tabStop,
  language,
  picked,
  carried,
  dropBefore,
  movedFrom,
  opened,
  item,
  doc,
  topicState,
  onToggle,
  onOpen,
  onStep,
  onKey,
  onPointerDown,
}: {
  entry: ArrangeEntry;
  topicId: string;
  /** The first row of a topic is a Tab stop; ↑ ↓ reach the rest. */
  tabStop: boolean;
  language: LanguageMode;
  picked: boolean;
  carried: boolean;
  dropBefore: boolean;
  movedFrom?: string;
  opened: boolean;
  item?: PastPaperItem;
  doc?: Parameters<typeof PastPaperSheet>[0]['doc'];
  topicState?: 'loading' | 'ready' | 'error';
  onToggle: (key: string) => void;
  onOpen: (key: string) => void;
  onStep: (key: string, direction: -1 | 1) => void;
  onKey: (event: KeyboardEvent<HTMLElement>, key: string) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, key: string) => void;
}) {
  const m = useMessages(ARRANGE_MESSAGES);
  const source = shortSourceLabel(entry.source);
  const words = language === 'zh' ? entry.zh || entry.en : entry.en || entry.zh;
  const iconButton =
    'grid h-6 w-6 cursor-pointer place-items-center rounded text-ink-muted hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';
  return (
    <>
      {dropBefore && <DropLine />}
      <div
        tabIndex={tabStop ? 0 : -1}
        data-arrange-row={entry.key}
        data-arrange-in={topicId}
        aria-selected={picked}
        onKeyDown={(event) => onKey(event, entry.key)}
        onPointerDown={(event) => onPointerDown(event, entry.key)}
        className={`group flex cursor-grab items-start gap-2 border-b border-line/60 px-2.5 py-2 last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
          picked ? 'bg-accent-soft/60' : 'hover:bg-surface-sunken/60'
        } ${carried ? 'opacity-40' : ''}`}
      >
        <span className="mt-0.5 shrink-0 text-ink-subtle group-hover:text-ink-muted" title={m.drag} aria-hidden>
          <GripIcon size={14} />
        </span>
        <input
          type="checkbox"
          checked={picked}
          onChange={() => onToggle(entry.key)}
          aria-label={m.selectOne(source)}
          tabIndex={-1}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-accent)]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[12.5px] font-medium text-ink" data-arrange-source>
              {source}
            </span>
            {movedFrom && (
              <span className="text-[11.5px] text-accent" title={m.movedFromTitle(movedFrom)} data-arrange-moved>
                {m.movedFrom(movedFrom)}
              </span>
            )}
            {entry.pictures > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[11.5px] text-ink-subtle" title={m.pictures(entry.pictures)}>
                <ImageIcon size={12} />
                {entry.pictures}
              </span>
            )}
          </div>
          <p className="line-clamp-2 text-[12px] leading-snug text-ink-muted">{words}</p>
          {opened && (
            <div className="mt-2 cursor-default" data-drag-ignore>
              {item && doc ? (
                <PastPaperSheet item={item} doc={doc} language={language} />
              ) : topicState === 'error' ? (
                <p className="text-[12px] text-ink-muted">{m.questionError}</p>
              ) : (
                <p className="text-[12px] text-ink-subtle" role="status">{m.loadingQuestion}</p>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" tabIndex={-1} onClick={() => onOpen(entry.key)} title={m.showQuestionTitle} aria-expanded={opened} className="cursor-pointer rounded px-1.5 py-0.5 text-[11.5px] text-ink-muted hover:bg-surface-sunken hover:text-ink">
            {opened ? m.hideQuestion : m.showQuestion}
          </button>
          <span className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <button type="button" tabIndex={-1} aria-label={m.moveUp} title={m.moveUp} onClick={() => onStep(entry.key, -1)} className={iconButton}>
              <ChevronUpIcon size={14} />
            </button>
            <button type="button" tabIndex={-1} aria-label={m.moveDown} title={m.moveDown} onClick={() => onStep(entry.key, 1)} className={iconButton}>
              <ChevronDownIcon size={14} />
            </button>
          </span>
        </div>
      </div>
    </>
  );
});
