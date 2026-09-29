'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isModalLayerOpen } from '@/components/ui/modalLayer';
import { groupRows } from '@/library/group';
import type { BankRow } from '@/library/types';
import { useBank } from '@/library/useBank';
import { topicOf } from '@/model/topics';
import type { LanguageMode, VersionMode, Worksheet } from '@/model/types';
import { worksheetStore, type WorksheetSummary } from '@/storage';
import { useWorksheetStore } from '@/store/worksheetStore';
import { addPicksToOpenDocument } from './addToOpen';
import { afterOpen, tagIndexOf, useBankReturn } from './bankReturn';
import {
  activeFilters,
  addTarget,
  bankCountLabel,
  classChoices,
  clearFilter,
  coverage as coverageOf,
  DEFAULT_FILTERS,
  filterRows,
  rowKey,
  traySummary,
  type BankFilters,
} from './bankPage';
import {
  latestClassUsage,
  levelForSearch,
  levelUp,
  railOrder,
  railSections,
  readLevel,
  readRailHidden,
  suggestTopics,
  TOPICS_LEVEL,
  writeLevel,
  writeRailHidden,
  type BankLevel,
} from './bankScreen';
import { FilterPopover } from './FilterPopover';
import { worksheetFromPicks, type PickedQuestion } from './fromSelection';
import { ReviewPage } from './ReviewPage';
import { SelectionTray } from './SelectionTray';
import { TagAsYouGo } from './TagAsYouGo';
import { CoverageBar } from './CoverageBar';
import { TopicCards } from './TopicCards';
import { TopicPickerDialog } from './TopicPickerDialog';
import {
  addTopics,
  bulkTopicEdit,
  copyWrites,
  replaceTopics,
  writeTags,
  type BulkTopicMode,
  type TagEdit,
  type TagWrite,
} from './writeBack';

const NONE: ReadonlySet<string> = new Set();

type Picker = { mode: 'edit'; row: BankRow } | { mode: 'bulk'; topicMode: BulkTopicMode } | { mode: 'tag'; rows: BankRow[] };

const BULK_MODES: { value: BulkTopicMode; label: string }[] = [
  { value: 'add', label: 'Add' },
  { value: 'remove', label: 'Remove' },
  { value: 'replace', label: 'Replace' },
];

const BULK_TEXT: Record<BulkTopicMode, { description: string; confirm: (ticked: number) => string; done: string }> = {
  add: { description: 'Adds the topics you tick. Topics already on a question stay.', confirm: () => 'Add topics', done: 'Tagged' },
  remove: { description: 'Takes the topics you tick off. Other topics stay.', confirm: () => 'Remove topics', done: 'Removed topics from' },
  replace: {
    description: 'Each question gets exactly the topics you tick. Tick none to clear them.',
    confirm: (ticked) => (ticked === 0 ? 'Clear topics' : 'Replace topics'),
    done: 'Set topics on',
  },
};


/**
 * The Question bank 題庫 as its own screen, opened from the start screen and left by
 * ← Home. Three levels: all topics (cards), one topic or search results (a review page
 * with a large preview), and the untagged questions (tag as you go). Esc goes up one.
 *
 * Writes (topics) go straight into the owning documents. That is safe only because the
 * start screen, which hosts this screen, replaces the editor: no in-memory copy of any
 * document can be saved over the write (`writeBack.ts`).
 */
export function QuestionBankScreen({
  summaries,
  loaded,
  banner,
  settings,
  onHome,
  onOpenDocument,
  onOpenWorksheet,
  onDocumentsChanged,
  onNotice,
  onError,
  onStartNew,
}: {
  summaries: WorksheetSummary[];
  loaded: boolean;
  /** The start screen's error or notice, shown under the bar. */
  banner?: ReactNode;
  /** The Settings gear. */
  settings?: ReactNode;
  onHome: () => void;
  /** Open a saved document the start screen's way; `then` runs once it is in the editor's store. */
  onOpenDocument: (docId: string, then?: () => void) => void;
  /** Open a document built here (already complete; the host saves it on open). */
  onOpenWorksheet: (worksheet: Worksheet) => void;
  /** Saved documents changed under the start screen: re-read the list. */
  onDocumentsChanged: () => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  onStartNew: () => void;
}) {
  const { rows, status } = useBank();
  // Coming back from a worksheet opened from here: the same level, filters and question.
  const [back] = useState(() => useBankReturn.getState().saved);
  const [level, setLevelState] = useState<BankLevel>(() => back?.level ?? readLevel());
  const [filters, setFilters] = useState<BankFilters>(back?.filters ?? DEFAULT_FILTERS);
  const [focusKey, setFocusKey] = useState<string | undefined>(back?.focusKey);
  const [picks, setPicks] = useState<string[]>([]);
  const [railHidden, setRailHiddenState] = useState(readRailHidden);
  const [language, setLanguage] = useState<LanguageMode>('en');
  const [version, setVersion] = useState<VersionMode>('teacher');
  const [picker, setPicker] = useState<Picker>();
  const [busy, setBusy] = useState(false);
  // Tag as you go: where in the untagged list, what is ticked, and what was saved this visit
  // (gone from the list at once, before the index catches up).
  const [tagIndex, setTagIndex] = useState(0);
  const [chosenFor, setChosenFor] = useState<{ root?: string; codes: ReadonlySet<string> }>({ codes: new Set() });
  const [tagged, setTagged] = useState<ReadonlySet<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const writes = useRef<Promise<void>>(Promise.resolve());

  const setLevel = useCallback((next: BankLevel) => {
    setLevelState(next);
    writeLevel(next);
    setFocusKey(undefined);
  }, []);
  const goUp = useCallback(() => {
    const up = levelUp(level);
    if (up === 'home') {
      onHome();
      return;
    }
    setFilters((current) => ({ ...current, text: '' }));
    setLevel(up);
  }, [level, onHome, setLevel]);
  const setRailHidden = (hidden: boolean) => {
    setRailHiddenState(hidden);
    writeRailHidden(hidden);
  };

  /* ---------------------------------------------------------------------------------- */
  /* Derived                                                                            */
  /* ---------------------------------------------------------------------------------- */

  const byKey = useMemo(() => new Map(rows.map((row) => [rowKey(row), row])), [rows]);
  const fullGroups = useMemo(() => new Map(groupRows(rows).map((group) => [group.rootId, group])), [rows]);
  const cover = useMemo(() => coverageOf(rows), [rows]);
  const classes = useMemo(() => classChoices(rows), [rows]);
  const classUsage = useMemo(() => latestClassUsage(rows), [rows]);

  const topic = level.kind === 'review' ? level.topic : 'all';
  const sections = useMemo(
    () => (level.kind === 'review' ? railSections(groupRows(filterRows(rows, { ...filters, topic })), topic) : []),
    [rows, filters, topic, level.kind],
  );
  const order = useMemo(() => railOrder(sections), [sections]);
  const orderIndex = useMemo(() => new Map(order.map((group, index) => [group.rootId, index])), [order]);
  const candidate = focusKey ? byKey.get(focusKey) : undefined;
  const focused = candidate && orderIndex.has(candidate.rootId) ? candidate : order[0]?.rows[0];
  const index = focused ? (orderIndex.get(focused.rootId) ?? 0) : 0;

  const untagged = useMemo(
    () =>
      level.kind === 'untagged'
        ? groupRows(filterRows(rows, { ...DEFAULT_FILTERS, topic: 'untagged' })).filter((group) => !tagged.has(group.rootId))
        : [],
    [rows, tagged, level.kind],
  );
  const tagPosition = Math.min(tagIndex, Math.max(0, untagged.length - 1));
  const tagGroup = untagged[tagPosition];
  const tagRow = tagGroup?.rows[0];
  const suggestions = useMemo(() => (tagRow ? suggestTopics(tagRow, rows) : []), [tagRow, rows]);
  const tagRoot = tagGroup?.rootId;
  // Ticks belong to one question: the next one starts with nothing ticked.
  const chosen = chosenFor.root === tagRoot ? chosenFor.codes : NONE;

  const pickedRows = picks.map((key) => byKey.get(key)).filter((row): row is BankRow => row !== undefined);
  const pickedSet = useMemo(() => new Set(pickedRows.map(rowKey)), [pickedRows]);
  // Picks are questions: two copies of one question picked are one, and share its topics.
  const pickedByRoot = [...new Map(pickedRows.map((row) => [row.rootId, row])).values()];
  const pickedRoots = new Set(pickedByRoot.map((row) => row.rootId));
  const pickedMix = new Map(traySummary(pickedByRoot).mix.map(({ code, count }) => [code, count] as const));
  // The editor's store still holds the document open last in this session. Pinned for the
  // visit: a topic saved here moves that paper to the top of the list, and "Add to" must
  // not follow it there.
  const [targetId, setTargetId] = useState<string>();
  const fresh = addTarget(summaries, rows, useWorksheetStore.getState().worksheet.id);
  if (targetId === undefined && fresh) setTargetId(fresh.id);
  const target = summaries.find((summary) => summary.id === targetId) ?? fresh;

  /* ---------------------------------------------------------------------------------- */
  /* Actions                                                                            */
  /* ---------------------------------------------------------------------------------- */

  const step = useCallback(
    (delta: number) => {
      const next = order[Math.min(order.length - 1, Math.max(0, index + delta))];
      if (next) setFocusKey(rowKey(next.rows[0]));
    },
    [order, index],
  );
  const togglePick = useCallback(
    (row: BankRow) =>
      setPicks((current) => (current.includes(rowKey(row)) ? current.filter((key) => key !== rowKey(row)) : [...current, rowKey(row)])),
    [],
  );
  const setFilter = (next: BankFilters) => setFilters(next);
  const onSearch = (text: string) => {
    setFilters((current) => ({ ...current, text }));
    const next = levelForSearch(level, text);
    if (next !== level) {
      setLevelState(next);
      if (next.kind !== 'review' || !next.search) writeLevel(next);
      setFocusKey(undefined);
    }
  };

  /** Read the given rows' questions from their documents, in order. */
  const readQuestions = async (list: readonly BankRow[]): Promise<PickedQuestion[]> => {
    const loadedDocs = new Map<string, Worksheet | undefined>();
    const out: PickedQuestion[] = [];
    for (const row of list) {
      if (!loadedDocs.has(row.docId)) loadedDocs.set(row.docId, await worksheetStore.load(row.docId).catch(() => undefined));
      const question = loadedDocs.get(row.docId)?.questions.find((q) => q.id === row.questionId);
      if (question) out.push({ question, fromDocId: row.docId });
    }
    return out;
  };

  /** Copies left as they were, named; what did save is said first, so a partial write reads as one. */
  const report = (failed: { docId: string; reason: string }[], saved: number) => {
    const title = (id: string) => summaries.find((s) => s.id === id)?.title ?? 'A worksheet';
    const lead = saved > 0 ? `Saved in ${saved} ${saved === 1 ? 'worksheet' : 'worksheets'}. ` : '';
    onError(lead + failed.map((f) => `“${title(f.docId)}” was not changed: ${f.reason}.`).join(' '));
  };

  /** One write at a time: tagging fast must never load a document before the last save lands. */
  const writeTopics = (list: TagWrite[], edit: TagEdit, done?: (saved: number) => string) => {
    const run = async () => {
      const result = await writeTags(worksheetStore, list, edit);
      if (result.saved.length > 0) onDocumentsChanged();
      if (result.failed.length > 0) report(result.failed, result.saved.length);
      else if (done && result.saved.length > 0) onNotice(done(result.saved.length));
    };
    writes.current = writes.current.then(run, run);
    return writes.current;
  };

  const newWorksheet = async () => {
    setBusy(true);
    try {
      const picked = await readQuestions(pickedRows);
      if (picked.length === 0) {
        onError('Those questions are no longer saved here.');
        return;
      }
      onOpenWorksheet(worksheetFromPicks(picked));
    } finally {
      setBusy(false);
    }
  };

  const addTo = async (list: readonly BankRow[]) => {
    if (!target) return;
    setBusy(true);
    try {
      const picked = await readQuestions(list);
      if (picked.length === 0) {
        onError('Those questions are no longer saved here.');
        return;
      }
      // Opened the start screen's way, then inserted through the store (`addToOpen.ts`).
      onOpenDocument(target.id, () => void addPicksToOpenDocument(picked));
    } finally {
      setBusy(false);
    }
  };

  /** Open the question where it sits in its worksheet; the editor's back button returns here. */
  const openRow = (row: BankRow) =>
    onOpenDocument(row.docId, () =>
      afterOpen(row.questionId, { level, filters, focusKey: level.kind === 'review' ? rowKey(row) : undefined, tagRoot: level.kind === 'untagged' ? tagRoot : undefined }),
    );

  // Back from a worksheet in tag as you go: land on the question left, once the list is read.
  const tagRestore = useRef(back?.level.kind === 'untagged' ? back.tagRoot : undefined);
  useEffect(() => {
    if (tagRestore.current === undefined || untagged.length === 0) return;
    setTagIndex(tagIndexOf(untagged.map((group) => group.rootId), tagRestore.current));
    tagRestore.current = undefined;
  }, [untagged]);

  /** Tag as you go: every copy of the question on screen gets the codes, then the next appears. */
  const saveTags = (codes: readonly string[]) => {
    if (!tagGroup || codes.length === 0) return;
    const root = tagGroup.rootId;
    setTagged((current) => new Set(current).add(root));
    void writeTopics(copyWrites(rows, [root]), addTopics(codes));
  };
  const toggleChosen = (code: string) => {
    const next = new Set(chosen);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setChosenFor({ root: tagRoot, codes: next });
  };

  /* ---------------------------------------------------------------------------------- */
  /* Keyboard                                                                           */
  /* ---------------------------------------------------------------------------------- */

  // One window listener reading the latest render. Every window key listener fires, so
  // this one stands down while any dialog or popover owns the keyboard, and never takes a
  // key from a text field or select (nor calls preventDefault on one).
  const keyRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  const handleKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isModalLayerOpen() || picker) return;
    const target = event.target as HTMLElement | null;
    const typing = isTypingTarget(target);
    const tag = target?.tagName;
    // A focused button keeps Space and Enter for itself, except the preview toggles
    // (radios, where Space would re-pick the picked option), so Space still selects.
    const onButton =
      (tag === 'BUTTON' && target?.getAttribute('role') !== 'radio') ||
      (tag === 'INPUT' && (target as HTMLInputElement).type === 'checkbox');

    if (event.key === 'Escape') {
      if (typing) {
        if (target === searchRef.current && filters.text) return; // the field clears itself
        (target as HTMLElement).blur();
      }
      goUp();
      return;
    }
    if (typing) return;
    if (event.key === '/' && level.kind !== 'untagged') {
      event.preventDefault();
      searchRef.current?.focus();
      return;
    }

    if (level.kind === 'review') {
      const down = event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === 'j' || event.key === 'J';
      const up = event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'k' || event.key === 'K';
      if (down || up) {
        event.preventDefault();
        step(down ? 1 : -1);
        return;
      }
      if ((event.key === 'o' || event.key === 'O') && focused) {
        event.preventDefault();
        openRow(focused);
        return;
      }
      if (event.key === ' ' && !onButton && focused) {
        event.preventDefault();
        togglePick(focused);
      }
      return;
    }

    if (level.kind === 'untagged' && tagGroup) {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        setTagIndex(Math.max(0, tagPosition + (event.key === 'ArrowRight' ? 1 : -1)));
        return;
      }
      if ((event.key === 'o' || event.key === 'O') && tagRow) {
        event.preventDefault();
        openRow(tagRow);
        return;
      }
      const digit = Number(event.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= suggestions.length + 1) {
        event.preventDefault();
        if (digit <= suggestions.length) toggleChosen(suggestions[digit - 1]);
        else setPicker({ mode: 'tag', rows: tagGroup.rows });
        return;
      }
      // Enter saves, except on a button that is not one of the keys (its own click stands).
      if (event.key === 'Enter' && (!onButton || target?.hasAttribute('data-tag-key') || target?.hasAttribute('data-tag-save'))) {
        event.preventDefault();
        saveTags([...chosen]);
      }
    }
  };
  useEffect(() => {
    keyRef.current = handleKey;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => keyRef.current(event);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ---------------------------------------------------------------------------------- */
  /* Render                                                                             */
  /* ---------------------------------------------------------------------------------- */

  const scanning = status.state === 'scanning';
  const reviewCount = order.length;
  const noDocuments = loaded && summaries.length === 0;

  const crumb = (() => {
    if (level.kind === 'topics') return <h1 className="font-display text-[19px] font-normal text-ink">Question bank 題庫</h1>;
    if (level.kind === 'untagged') {
      return (
        <h1 className="text-[13.5px] text-ink-muted">
          <b className="font-semibold text-ink">Untagged</b> · <span className="tabular-nums">{untagged.length}</span> left
        </h1>
      );
    }
    const found = level.topic === 'all' ? undefined : topicOf(level.topic);
    return (
      <h1 className="min-w-0 truncate text-[13.5px] text-ink-muted">
        {found ? (
          <>
            <b className="font-semibold text-ink">{found.code}</b> {found.en} {found.zh}
          </>
        ) : (
          <b className="font-semibold text-ink">{level.search ? 'Search results' : 'All questions'}</b>
        )}{' '}
        · <span className="tabular-nums">{reviewCount}</span>
      </h1>
    );
  })();

  const emptyReview = (() => {
    if (scanning && rows.length === 0) return <p role="status">Reading your worksheets · {status.done} of {status.total}</p>;
    const active = activeFilters({ ...filters, topic: 'all' });
    const where = level.kind === 'review' && level.topic !== 'all' ? ` in ${level.topic}` : '';
    if (active.length === 0) return <p>No questions{where} yet. Tag questions with this topic and they appear here.</p>;
    return (
      <>
        <p>
          Nothing{where} matches {active.map((filter) => filter.label).join(' · ')}.
        </p>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {active.map((filter) => (
            <TextButton key={filter.key} onClick={() => setFilters((current) => clearFilter(current, filter.key))}>
              Clear {filter.label}
            </TextButton>
          ))}
        </p>
      </>
    );
  })();

  return (
    <div className="zone-light flex h-full min-h-0 flex-col bg-surface text-ink">
      <header className="flex h-12 shrink-0 items-center gap-3.5 whitespace-nowrap border-b border-line bg-surface px-4">
        <button
          type="button"
          onClick={level.kind === 'topics' ? onHome : goUp}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-ink-muted transition-colors duration-150 ease-out-soft hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ← {level.kind === 'topics' ? 'Home' : 'Topics'}
        </button>
        {crumb}
        <span className="flex-1" />
        {level.kind === 'untagged' ? (
          <span className="text-[12px] text-ink-subtle">Tag a question, the next one appears</span>
        ) : (
          <label className="relative w-[min(340px,32vw)] min-w-[200px]">
            <span className="sr-only">Search questions</span>
            <input
              ref={searchRef}
              type="search"
              value={filters.text}
              placeholder={
                level.kind === 'review' && level.topic !== 'all' ? `Search in ${level.topic}` : 'Search every question 搜尋全部題目'
              }
              onChange={(event) => onSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && filters.text) onSearch('');
                if (event.key === 'ArrowDown' && level.kind === 'review') {
                  // From the field straight into the list.
                  event.currentTarget.blur();
                }
              }}
              className="h-8 w-full rounded-lg border border-transparent bg-surface-sunken pl-8 pr-2.5 text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/25"
            />
            <SearchGlyph />
          </label>
        )}
        {level.kind === 'review' && <FilterPopover filters={filters} classes={classes} onChange={setFilter} />}
        {level.kind === 'topics' && (
          <span className="text-[12px] tabular-nums text-ink-subtle" role={scanning ? 'status' : undefined}>
            {scanning ? `Reading your worksheets · ${status.done} of ${status.total}` : bankCountLabel(cover)}
          </span>
        )}
        {settings}
      </header>

      {banner && <div className="shrink-0 px-4 pt-3">{banner}</div>}

      {level.kind === 'topics' && !noDocuments && (
        <CoverageBar
          coverage={cover}
          onTopic={(code) => setLevel({ kind: 'review', topic: code })}
          onUntagged={() => {
            setTagIndex(0);
            setLevel({ kind: 'untagged' });
          }}
        />
      )}

      {level.kind === 'topics' && (
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-7 py-[22px]">
          {noDocuments ? (
            <div className="mx-auto max-w-[1280px]">
              <p className="max-w-md text-[13px] leading-relaxed text-ink-muted">
                Your bank fills itself from the questions in your worksheets. Start one, and every question you write
                appears here, by topic.
              </p>
              <TextButton onClick={onStartNew}>Start a classroom worksheet</TextButton>
            </div>
          ) : (
            <TopicCards
              coverage={cover}
              classUsage={classUsage}
              onTopic={(code) => setLevel({ kind: 'review', topic: code })}
              onUntagged={() => {
                setTagIndex(0);
                setLevel({ kind: 'untagged' });
              }}
              onAll={() => setLevel({ kind: 'review', topic: 'all' })}
              onClassGap={(choice) => {
                setFilters({ ...DEFAULT_FILTERS, notUsedWith: choice });
                setLevel({ kind: 'review', topic: 'all' });
              }}
            />
          )}
        </div>
      )}

      {level.kind === 'review' && (
        <ReviewPage
          state={{
            sections,
            order,
            focused,
            index,
            picked: pickedSet,
            railHidden,
            language,
            version,
            usedWith: filters.notUsedWith,
          }}
          fullGroup={focused ? fullGroups.get(focused.rootId) : undefined}
          empty={emptyReview}
          onFocus={(row) => setFocusKey(rowKey(row))}
          onStep={step}
          onPick={togglePick}
          onRailHidden={setRailHidden}
          onLanguage={setLanguage}
          onVersion={setVersion}
          onEditTopics={(row) => setPicker({ mode: 'edit', row })}
          onOpen={openRow}
        />
      )}

      {level.kind === 'untagged' && (
        <TagAsYouGo
          row={tagRow}
          position={tagPosition}
          left={untagged.length}
          suggestions={suggestions}
          chosen={chosen}
          language={language}
          busy={false}
          onToggle={toggleChosen}
          onAllTopics={() => tagGroup && setPicker({ mode: 'tag', rows: tagGroup.rows })}
          onSave={() => saveTags([...chosen])}
          onStep={(delta) => setTagIndex(Math.max(0, tagPosition + delta))}
          onDone={() => setLevel(TOPICS_LEVEL)}
          onOpen={() => tagRow && openRow(tagRow)}
        />
      )}

      {pickedRows.length > 0 && level.kind !== 'untagged' && (
        <SelectionTray
          summary={traySummary(pickedRows)}
          targetTitle={target?.title}
          busy={busy}
          onClear={() => setPicks([])}
          onSetTopic={() => setPicker({ mode: 'bulk', topicMode: 'add' })}
          onAddTo={() => void addTo(pickedRows)}
          onNewWorksheet={() => void newWorksheet()}
        />
      )}

      {picker?.mode === 'edit' && (
        <TopicPickerDialog
          title="Topics"
          description={editDescription(picker.row, copyWrites(rows, [picker.row.rootId]).length)}
          initial={picker.row.tags}
          confirmLabel="Save topics"
          onClose={() => setPicker(undefined)}
          onDone={(codes) => {
            const row = picker.row;
            setPicker(undefined);
            void writeTopics(copyWrites(rows, [row.rootId]), replaceTopics(codes), () => 'Topics saved.');
          }}
        />
      )}
      {picker?.mode === 'bulk' && (
        <TopicPickerDialog<BulkTopicMode>
          title={`Set topic for ${pickedRoots.size} ${pickedRoots.size === 1 ? 'question' : 'questions'}`}
          description={`${BULK_TEXT[picker.topicMode].description} Every copy of each question changes.`}
          initial={[]}
          modes={{
            label: 'How to set topics',
            value: picker.topicMode,
            options: BULK_MODES,
            onChange: (topicMode) => setPicker({ mode: 'bulk', topicMode }),
          }}
          present={pickedMix}
          allowEmpty={picker.topicMode === 'replace'}
          confirmLabel={BULK_TEXT[picker.topicMode].confirm}
          onClose={() => setPicker(undefined)}
          onDone={(codes) => {
            const mode = picker.topicMode;
            const count = pickedRoots.size;
            setPicker(undefined);
            if (codes.length === 0 && mode !== 'replace') return;
            void writeTopics(copyWrites(rows, pickedRoots), bulkTopicEdit(mode, codes), (saved) =>
              `${BULK_TEXT[mode].done} ${count} ${count === 1 ? 'question' : 'questions'} in ${saved} ${saved === 1 ? 'worksheet' : 'worksheets'}.`,
            );
          }}
        />
      )}
      {picker?.mode === 'tag' && (
        <TopicPickerDialog
          title="Topics for this question"
          description="Tick every topic it tests. Saving moves on to the next question."
          initial={[...chosen]}
          confirmLabel="Save and next"
          onClose={() => setPicker(undefined)}
          onDone={(codes) => {
            setPicker(undefined);
            saveTags(codes);
          }}
        />
      )}
    </div>
  );
}

/** Where Edit topics writes: the one worksheet, or every copy. */
function editDescription(row: BankRow, copies: number): string {
  if (copies > 1) return `Saved into all ${copies} copies of this question.`;
  return `Saved into “${row.docTitle}”${row.number !== undefined ? ` · Q${row.number}` : ''}.`;
}

/** A field that owns its keys: text inputs, text areas, selects, editable text. Checkboxes are not. */
export function isTypingTarget(target: HTMLElement | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (target as HTMLInputElement).type;
  return type !== 'checkbox' && type !== 'radio' && type !== 'button';
}

function TextButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 cursor-pointer text-[12.5px] font-medium text-accent-ink underline decoration-line-strong underline-offset-4 transition-[text-decoration-color] duration-150 ease-out-soft hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {children}
    </button>
  );
}

function SearchGlyph() {
  return (
    <svg
      aria-hidden
      focusable="false"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
