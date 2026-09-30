'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isModalLayerOpen } from '@/components/ui/modalLayer';
import { groupRows } from '@/library/group';
import {
  listPatterns,
  patternEdits,
  patternMix,
  patternNames,
  patternWrites,
  removePatternEdit,
  renamePatternEdit,
  rowPattern,
  setPatternsEdit,
  thenEdit,
  type PatternId,
  type PatternItem,
} from '@/library/patterns';
import { registerPatterns, renameRegisteredPattern, unregisterPattern, usePatternRegistry } from '@/library/usePatterns';
import { holdsPatterns } from '@/model/patterns';
import type { BankGroup, BankRow } from '@/library/types';
import { useBank } from '@/library/useBank';
import { escapeClears } from '@/components/bank/escapeClears';
import { topicDisplay, topicHeading, topicOf } from '@/model/topics';
import { distinctDocLabels } from '@/library/docLabels';
import { allOf } from '@/components/bank/bankText';
import type { LanguageMode, VersionMode, Worksheet } from '@/model/types';
import { worksheetStore, type WorksheetSummary } from '@/storage';
import { useWorksheetStore } from '@/store/worksheetStore';
import { AI_SETTINGS } from '@/settings/aiSettings';
import { useSettings } from '@/settings/store';
import type { BankItemTone, BankReviewItem, BankUnit } from '@/assist/bankRun';
import { loadGlossary } from '@/glossary/load';
import { identicalCopies, type CopySkip } from '@/library/sameCopies';
import { isDesktop } from '@/platform';
import { createRunDeps } from '@/translate/deps';
import { createBankAi } from './bankAi';
import type { BankVerbId } from './bankAiScopes';
import { BankAiBar, BankAiNote } from './BankAiBar';
import { BankAiMenu } from './BankAiMenu';
import { addPicksToOpenDocument, nothingAddedText, splitAlreadyInPaper } from './addToOpen';
import { afterOpen, revealQuestion, tagIndexOf, useBankReturn } from './bankReturn';
import { useBankCart } from './bankCart';
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
  typeName,
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
import { readPicks, worksheetFromPicks, type PickedQuestion } from './fromSelection';
import { ReviewPage, type StageAi } from './ReviewPage';
import { SelectionTray } from './SelectionTray';
import { TagAsYouGo } from './TagAsYouGo';
import { CoverageBar } from './CoverageBar';
import { TopicCards } from './TopicCards';
import { PartTopicPickerDialog, TopicPickerDialog, type PickerPatterns } from './TopicPickerDialog';
import {
  applyDraft,
  changeAt,
  draftOf,
  everyCode,
  hasTopic,
  partLines,
  patternAt,
  patternEditAt,
  savedByPart,
  targetName,
  ticksAt,
  toggleAt,
  type PartTarget,
} from './partTopics';
import { stateOfRow } from '@/library/sharedTags';
import { PatternsPage } from './PatternsPage';
import {
  bulkTopicEdit,
  copyWrites,
  everywhere,
  removeTopics,
  replaceTopics,
  thenState,
  writeTags,
  type BulkTopicMode,
  type StateEdit,
  type TagEdit,
  type TagWrite,
} from '@/library/tagWrites';

const NONE: ReadonlySet<string> = new Set();

type Picker = { mode: 'edit'; row: BankRow } | { mode: 'bulk'; topicMode: BulkTopicMode } | { mode: 'tag'; rows: BankRow[] };

const BULK_MODES: { value: BulkTopicMode; label: string }[] = [
  { value: 'add', label: 'Add' },
  { value: 'remove', label: 'Remove' },
  { value: 'replace', label: 'Replace' },
];

const BULK_TEXT: Record<BulkTopicMode, { description: string; confirm: (ticked: number) => string; done: string }> = {
  add: { description: 'Adds the topics you tick. Topics already on a question stay.', confirm: () => 'Add topics', done: 'Tagged' },
  remove: {
    description: 'Takes the topics you tick off. Other topics stay. A ticked sub-topic can stay and lose only its 題型.',
    confirm: () => 'Remove',
    done: 'Removed topics from',
  },
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
 * document can be saved over the write (`src/library/tagWrites.ts`).
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
  onLeaveLevel,
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
  /** The level changed: a result notice from the last one is done. An error stays until dismissed. */
  onLeaveLevel?: () => void;
  onStartNew: () => void;
}) {
  const { rows, status } = useBank();
  const registry = usePatternRegistry();
  // Coming back from a worksheet opened from here: the same level, filters and question.
  const [back] = useState(() => useBankReturn.getState().saved);
  const [level, setLevelState] = useState<BankLevel>(() => back?.level ?? readLevel());
  const [filters, setFilters] = useState<BankFilters>(back?.filters ?? DEFAULT_FILTERS);
  const [focusKey, setFocusKey] = useState<string | undefined>(back?.focusKey);
  // The cart: kept per tab across Open in worksheet, Home and a reload (`bankCart.ts`).
  const cart = useBankCart();
  const picks = useMemo(() => cart.picks.map(rowKey), [cart.picks]);
  const [railHidden, setRailHiddenState] = useState(readRailHidden);
  const [language, setLanguage] = useState<LanguageMode>('en');
  const [version, setVersion] = useState<VersionMode>('teacher');
  const [picker, setPicker] = useState<Picker>();
  const [busy, setBusy] = useState(false);
  // Tag as you go: where in the untagged list, what is ticked, and what was saved this visit
  // (gone from the list at once, before the index catches up).
  const [tagIndex, setTagIndex] = useState(0);
  // Each pick on the question on screen is an edit (`partTopics.ts`), replayed on every copy
  // when it is saved; `at` is where the keys tag now (the whole question, or one part).
  const [chosenFor, setChosenFor] = useState<TagPicks>(NO_PICKS);
  const [tagged, setTagged] = useState<ReadonlySet<string>>(new Set());
  // What tag as you go saved this visit, newest last: ⌫ or ⌘Z takes the last one back.
  const [tagHistory, setTagHistory] = useState<TagSave[]>([]);
  // A question whose tags were just taken back, shown until the list holds it again.
  const [restoring, setRestoring] = useState<{ group: BankGroup; settled: boolean }>();
  const searchRef = useRef<HTMLInputElement>(null);
  // Every document write this screen makes, one at a time: tagging fast, or tagging while a
  // ✦ run writes, must never load a document before the last save to it lands.
  const [writes] = useState(createWriteQueue);
  // ✦ AI: one run at a time, for this visit. Leaving the screen stops it and waits for
  // its last write, so no document is written once the editor may hold it.
  const [bankAi] = useState(() => createBankAi({ store: worksheetStore, createRunDeps, loadGlossary, desktop: isDesktop, exclusive: writes.run }));
  const aiPhase = bankAi((s) => s.phase);
  const aiRun = useRef<{ level: BankLevel; side?: 'en' | 'zh' }>(undefined);
  useEffect(() => () => void bankAi.getState().settle(), [bankAi]);
  /** Stop any ✦ run and let its last write land, then go. */
  const afterAi = useCallback((then: () => void) => void bankAi.getState().settle().then(then), [bankAi]);
  const goHome = useCallback(() => afterAi(onHome), [afterAi, onHome]);

  const setLevel = useCallback((next: BankLevel) => {
    setLevelState(next);
    writeLevel(next);
    setFocusKey(undefined);
    // A 題型 filter belongs to the topic it was set in.
    setFilters((current) => (current.pattern ? { ...current, pattern: undefined } : current));
  }, []);
  const goUp = useCallback(() => {
    const up = levelUp(level);
    if (up === 'home') {
      goHome();
      return;
    }
    setFilters((current) => ({ ...current, text: '' }));
    setLevel(up);
  }, [level, goHome, setLevel]);
  // A notice belongs to the level it was made on: another kind of level or another topic
  // clears it (§ onLeaveLevel). Narrowing the 題型 page's scope does not.
  const levelKey = level.kind === 'review' ? `review:${level.topic}` : level.kind;
  const shownLevel = useRef(levelKey);
  useEffect(() => {
    if (shownLevel.current === levelKey) return;
    shownLevel.current = levelKey;
    // Tag as you go's Undo belongs to that visit.
    setTagHistory([]);
    setRestoring(undefined);
    onLeaveLevel?.();
  }, [levelKey, onLeaveLevel]);
  const setRailHidden = (hidden: boolean) => {
    setRailHiddenState(hidden);
    writeRailHidden(hidden);
  };

  /* ---------------------------------------------------------------------------------- */
  /* Derived                                                                            */
  /* ---------------------------------------------------------------------------------- */

  const byKey = useMemo(() => new Map(rows.map((row) => [rowKey(row), row])), [rows]);
  const fullGroups = useMemo(() => new Map(groupRows(rows).map((group) => [group.rootId, group])), [rows]);
  const docLabels = useMemo(() => distinctDocLabels(rows), [rows]);
  const cover = useMemo(() => coverageOf(rows), [rows]);
  const classes = useMemo(() => classChoices(rows), [rows]);
  const classUsage = useMemo(() => latestClassUsage(rows), [rows]);
  const patternItems = useMemo(() => listPatterns(rows, registry), [rows, registry]);
  /** Each coarse topic's 題型 in use, for its card. */
  const patternsByTopic = useMemo(() => {
    const map = new Map<string, PatternItem[]>();
    for (const item of patternItems) {
      if (item.count === 0) continue;
      const coarse = topicOf(item.topic)?.parent ?? item.topic;
      map.set(coarse, [...(map.get(coarse) ?? []), item]);
    }
    return map;
  }, [patternItems]);

  const topic = level.kind === 'review' ? level.topic : 'all';
  // The Filter's 題型: those in use within the topic on screen.
  const filterPatterns = useMemo(
    () => (topic === 'untagged' ? [] : listPatterns(rows, registry, topic === 'all' ? {} : { topic }).filter((item) => item.count > 0)),
    [rows, registry, topic],
  );
  // Teacher text counts toward a missing language when the preview shows it or AI Settings include it (as ✦ Fill).
  const [aiSettings] = useSettings(AI_SETTINGS);
  const teacherText = version === 'teacher' || aiSettings.includeTeacherText;
  const aiItems = aiPhase.kind === 'review' ? aiPhase.items : NO_ITEMS;
  const aiTones = useMemo(() => reviewTones(aiItems), [aiItems]);
  const sections = useMemo(() => {
    if (level.kind !== 'review') return [];
    const admitted = filterRows(rows, { ...filters, topic }, undefined, { teacherText });
    // A ✦ fill under "Missing 中文" would empty the list it filled: reviewed questions stay.
    const kept =
      filters.missing && aiTones.size > 0
        ? filterRows(rows, { ...filters, topic, missing: undefined }, undefined, { teacherText }).filter((row) => aiTones.has(row.rootId) && !admitted.includes(row))
        : [];
    return railSections(groupRows([...admitted, ...kept]), topic);
  }, [rows, filters, topic, level.kind, teacherText, aiTones]);
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
  const restoredAt = restoring ? untagged.findIndex((group) => group.rootId === restoring.group.rootId) : -1;
  const tagGroup = restoring ? (restoredAt >= 0 ? untagged[restoredAt] : restoring.group) : untagged[tagPosition];
  const tagRow = tagGroup?.rows[0];
  const suggestions = useMemo(() => (tagRow ? suggestTopics(tagRow, rows) : []), [tagRow, rows]);
  const tagRoot = tagGroup?.rootId;
  // Picks belong to one question: the next one starts with nothing ticked, on the whole question.
  const picksHere = chosenFor.root === tagRoot ? chosenFor : NO_PICKS;
  const tagBase = useMemo(() => (tagRow ? draftOf(stateOfRow(tagRow)) : undefined), [tagRow]);
  const tagDraft = useMemo(() => tagBase && picksHere.edits.reduce(applyDraft, tagBase), [tagBase, picksHere.edits]);
  const tagAt = tagDraft?.slots.some((slot) => slot.key === picksHere.at) ? picksHere.at : undefined;
  const tagTicks = useMemo(() => (tagDraft ? ticksAt(tagDraft, tagAt) : undefined), [tagDraft, tagAt]);
  const chosen = tagTicks?.ticked ?? NONE;
  const tagTargets: PartTarget[] = tagDraft ? [undefined, ...tagDraft.slots.map((slot) => slot.key)] : [undefined];

  const pickedRows = picks.map((key) => byKey.get(key)).filter((row): row is BankRow => row !== undefined);
  // Picks are questions: two copies of one question picked are one, and share its topics.
  const pickedByRoot = [...new Map(pickedRows.map((row) => [row.rootId, row])).values()];
  const pickedRoots = new Set(pickedByRoot.map((row) => row.rootId));
  const pickedTypes = [...new Set(pickedByRoot.map((row) => row.typeId))];
  const pickedMix = new Map(traySummary(pickedByRoot).mix.map(({ code, count }) => [code, count] as const));
  const pickedPatternMix = patternMix(pickedByRoot);
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
  const togglePick = useCallback((row: BankRow) => useBankCart.getState().toggle(row, (key) => byKey.get(key)?.rootId), [byKey]);
  // A pick whose question is gone (deleted, trashed, hidden) leaves the list, once the index
  // has caught up with the saved documents; a scan still running proves nothing.
  const noticeRef = useRef(onNotice);
  useEffect(() => {
    noticeRef.current = onNotice;
  });
  useEffect(() => {
    if (status.state !== 'ready') return;
    const dropped = useBankCart.getState().prune((key) => byKey.has(key));
    if (dropped > 0) {
      noticeRef.current(
        dropped === 1
          ? 'Took 1 question off your list: it is no longer in your worksheets.'
          : `Took ${dropped} questions off your list: they are no longer in your worksheets.`,
      );
    }
  }, [status.state, byKey]);
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

  /** Read the given rows' questions from their documents, in order, with the bank's topics. */
  const readQuestions = (list: readonly BankRow[]): Promise<PickedQuestion[]> => readPicks(worksheetStore, list);

  /** Copies left as they were, named; what did save is said first, so a partial write reads as one. */
  const report = (failed: { docId: string; reason: string }[], saved: number) => {
    const title = (id: string) => summaries.find((s) => s.id === id)?.title ?? 'A worksheet';
    const lead = saved > 0 ? `Saved in ${saved} ${saved === 1 ? 'worksheet' : 'worksheets'}. ` : '';
    onError(lead + failed.map((f) => `“${title(f.docId)}” was not changed: ${f.reason}.`).join(' '));
  };

  /** One write at a time: tagging fast must never load a document before the last save lands. */
  const writeTopics = (list: TagWrite[], edit: TagEdit | StateEdit, done?: (saved: number) => string) => {
    const run = async () => {
      const result = await writeTags(worksheetStore, list, edit);
      if (result.saved.length > 0) onDocumentsChanged();
      if (result.failed.length > 0) report(result.failed, result.saved.length);
      else if (done && result.saved.length > 0) onNotice(done(result.saved.length));
    };
    return writes.run(run);
  };

  const newWorksheet = async () => {
    await bankAi.getState().settle();
    setBusy(true);
    try {
      const picked = await readQuestions(pickedRows);
      if (picked.length === 0) {
        onError('Those questions are no longer saved here.');
        return;
      }
      onOpenWorksheet(worksheetFromPicks(picked));
      useBankCart.getState().reset();
    } finally {
      setBusy(false);
    }
  };

  const addTo = async (list: readonly BankRow[]) => {
    if (!target) return;
    await bankAi.getState().settle();
    setBusy(true);
    try {
      const picked = await readQuestions(list);
      if (picked.length === 0) {
        onError('Those questions are no longer saved here.');
        return;
      }
      // All already there: stay here and say so. The open re-checks against what it loads.
      const saved = await worksheetStore.load(target.id).catch(() => undefined);
      const { fresh, skipped } = saved ? splitAlreadyInPaper(saved, picked) : { fresh: picked, skipped: [] };
      if (fresh.length === 0) {
        onNotice(nothingAddedText(skipped.length, target.title));
        return;
      }
      // Opened the start screen's way, then inserted through the store (`addToOpen.ts`),
      // scrolled to the first copy once the sheets are laid out.
      onOpenDocument(target.id, () => {
        const { inserted } = addPicksToOpenDocument(picked);
        if (inserted.length > 0) useBankCart.getState().reset();
        if (inserted[0]) revealQuestion(inserted[0]);
      });
    } finally {
      setBusy(false);
    }
  };

  /** Open the question where it sits in its worksheet; the editor's back button returns here. */
  const openRow = (row: BankRow) =>
    afterAi(() =>
      onOpenDocument(row.docId, () =>
        afterOpen(row.questionId, { level, filters, focusKey: level.kind === 'review' ? rowKey(row) : undefined, tagRoot: level.kind === 'untagged' ? tagRoot : undefined }),
      ),
    );

  // Back from a worksheet in tag as you go: land on the question left, once the list is read.
  const tagRestore = useRef(back?.level.kind === 'untagged' ? back.tagRoot : undefined);
  useEffect(() => {
    if (tagRestore.current === undefined || untagged.length === 0) return;
    setTagIndex(tagIndexOf(untagged.map((group) => group.rootId), tagRestore.current));
    tagRestore.current = undefined;
  }, [untagged]);

  /* ✦ AI: Fill missing 中文 / English and Check terms, over the shown copies. */
  const skippedReport = (skipped: CopySkip[], saved: number) => {
    const byDoc = new Map<string, string>();
    for (const skip of skipped) if (!byDoc.has(skip.docId)) byDoc.set(skip.docId, skip.reason);
    report([...byDoc].map(([docId, reason]) => ({ docId, reason })), saved);
  };
  const runAi = (verb: BankVerbId, list: BankRow[]) => {
    const snapshot = rows;
    const units = list.map((row) => unitOf(row, docLabels));
    const copiesOf = (unit: BankUnit) => identicalCopies(snapshot, unit);
    const hooks = { onWritten: onDocumentsChanged, onSkipped: skippedReport, onNotice };
    aiRun.current = { level, ...(verb === 'terms' ? {} : { side: verb === 'fill.zh' ? ('zh' as const) : ('en' as const) }) };
    void bankAi
      .getState()
      .start(verb === 'terms' ? { verb: 'terms', units, copiesOf } : { verb: 'fill', side: verb === 'fill.zh' ? 'zh' : 'en', includeTeacher: teacherText, units, copiesOf }, hooks);
  };

  /**
   * Tag as you go: every copy of the question on screen gets the picks (each part its own,
   * on a question with parts), then the next appears. `extra`: one more pick first (All topics).
   */
  const saveTags = (extra?: StateEdit) => {
    if (!tagGroup || !tagBase) return;
    const edits = extra ? [...picksHere.edits, extra] : picksHere.edits;
    const saved = edits.reduce(applyDraft, tagBase);
    if (!hasTopic(saved)) return;
    const root = tagGroup.rootId;
    if (restoring) {
      if (restoredAt >= 0) setTagIndex(restoredAt);
      setRestoring(undefined);
    }
    setTagged((current) => new Set(current).add(root));
    setTagHistory((current) => [...current, { group: tagGroup, codes: everyCode(saved), parts: savedByPart(saved) }]);
    void writeTopics(copyWrites(rows, [root]), thenState(...edits));
  };

  /**
   * Take the last save back: one write per copy, taking off exactly the topics it added,
   * from every part (and their 題型; the question had no topic before, or it would not
   * have been here). The question comes back on screen at once and stays until the list
   * holds it again.
   */
  const undoTagSave = () => {
    const last = tagHistory[tagHistory.length - 1];
    if (!last) return;
    const root = last.group.rootId;
    setTagHistory((current) => current.slice(0, -1));
    setTagged((current) => {
      const next = new Set(current);
      next.delete(root);
      return next;
    });
    setChosenFor({ root, edits: [], at: undefined });
    setRestoring({ group: last.group, settled: false });
    void writeTopics(copyWrites(rows, [root]), everywhere(removeTopics(last.codes))).then(() =>
      setRestoring((current) => (current?.group.rootId === root ? { ...current, settled: true } : current)),
    );
  };

  // Back in the list (the index has caught up with the undo): point at it there.
  if (restoring?.settled && restoredAt >= 0) {
    setTagIndex(restoredAt);
    setRestoring(undefined);
  }
  const stepTag = (delta: number) => {
    setRestoring(undefined);
    setTagIndex(Math.max(0, tagPosition + delta));
  };

  /** The 題型 picker for questions of one type; `initial` from a row's own 題型. */
  const pickerPatterns = (typeId: string, row?: BankRow): PickerPatterns => ({
    typeId,
    kind: typeName(typeId),
    names: (code) => patternNames(rows, registry, code, typeId),
    initial: row
      ? Object.fromEntries(
          row.tags.filter(holdsPatterns).flatMap((code) => {
            const name = rowPattern(row, code);
            return name ? [[code, name] as const] : [];
          }),
        )
      : undefined,
  });

  /* 題型 manage page: the registry, then every copy of every question using it. */
  const patternDone = (message: string) => (saved: number) =>
    `${message} ${saved} ${saved === 1 ? 'worksheet' : 'worksheets'} changed.`;
  const createPattern = (pattern: PatternId) => {
    void registerPatterns([pattern]).then(() => onNotice(`Added 題型 “${pattern.name}”.`));
  };
  const renamePattern = (item: PatternItem, to: string) => {
    const list = patternWrites(rows, item);
    void renameRegisteredPattern(item, to);
    if (list.length === 0) onNotice(`Renamed to “${to}”.`);
    else void writeTopics(list, renamePatternEdit(item.topic, item.name, to), patternDone(`Renamed to “${to}”.`));
  };
  const mergePattern = (item: PatternItem, into: PatternItem) => {
    const list = patternWrites(rows, item);
    void renameRegisteredPattern(item, into.name);
    if (list.length === 0) onNotice(`Merged into “${into.name}”.`);
    else void writeTopics(list, renamePatternEdit(item.topic, item.name, into.name), patternDone(`Merged into “${into.name}”.`));
  };
  const deletePattern = (item: PatternItem) => {
    const list = patternWrites(rows, item);
    void unregisterPattern(item);
    if (list.length === 0) onNotice(`Deleted 題型 “${item.name}”.`);
    else void writeTopics(list, removePatternEdit(item.topic, item.name), patternDone(`Deleted 題型 “${item.name}”.`));
  };
  const showPattern = (item: PatternItem) => {
    setLevel({ kind: 'review', topic: item.topic });
    setFilters((current) => ({ ...current, text: '', pattern: { topic: item.topic, typeId: item.typeId, name: item.name } }));
  };
  const toggleChosen = (code: string) => {
    if (!tagDraft) return;
    const edit = toggleAt(tagDraft, tagAt, code, !chosen.has(code));
    setChosenFor({ root: tagRoot, edits: [...picksHere.edits, edit], at: tagAt });
  };
  /** Where the keys tag: the whole question, or one part or sub-part. */
  const setTagAt = (at: PartTarget) => setChosenFor({ root: tagRoot, edits: picksHere.edits, at });
  const stepTagAt = (delta: number) => {
    const at = tagTargets.indexOf(tagAt);
    setTagAt(tagTargets[Math.min(tagTargets.length - 1, Math.max(0, at + delta))]);
  };

  // The review walks the stage: each item's question comes on screen, in the level the run
  // started from; a fill's review shows the side it wrote, as the editor's does.
  const aiIndex = aiPhase.kind === 'review' ? aiPhase.index : -1;
  const aiCurrent = aiPhase.kind === 'review' ? aiPhase.items[aiPhase.index] : undefined;
  const reviewing = aiPhase.kind === 'review';
  useEffect(() => {
    if (!reviewing || !aiRun.current) return;
    // Check terms reads the 中文 against the English: an English-only preview shows both.
    const side = aiRun.current.side;
    if (side) setLanguage((current) => (current === 'bilingual' || current === side ? current : side));
    else setLanguage((current) => (current === 'en' ? 'bilingual' : current));
  }, [reviewing]);
  const revealRef = useRef<(item: BankReviewItem) => void>(() => undefined);
  useEffect(() => {
    revealRef.current = (item) => {
      const origin = aiRun.current?.level;
      if (level.kind !== 'review' && origin?.kind === 'review') {
        setLevelState(origin);
        writeLevel(origin);
      }
      setFocusKey(rowKey(item.unit));
    };
  });
  useEffect(() => {
    if (aiCurrent) revealRef.current(aiCurrent);
  }, [aiCurrent, aiIndex]);

  /* ---------------------------------------------------------------------------------- */
  /* Keyboard                                                                           */
  /* ---------------------------------------------------------------------------------- */

  // One window listener reading the latest render. Every window key listener fires, so
  // this one stands down while any dialog or popover owns the keyboard, and never takes a
  // key from a text field or select (nor calls preventDefault on one).
  const keyRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  const handleKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || isModalLayerOpen() || picker) return;
    const target = event.target as HTMLElement | null;
    const typing = isTypingTarget(target);
    // Tag as you go: ⌫ or ⌘Z / Ctrl+Z takes the last save back.
    const undoChord = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'z';
    const backspace = event.key === 'Backspace' && !event.metaKey && !event.ctrlKey && !event.altKey;
    if (level.kind === 'untagged' && !typing && (undoChord || backspace) && tagHistory.length > 0) {
      event.preventDefault();
      undoTagSave();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = target?.tagName;
    // A focused button keeps Space and Enter for itself, except the preview toggles
    // (radios, where Space would re-pick the picked option), so Space still selects.
    const onButton =
      (tag === 'BUTTON' && target?.getAttribute('role') !== 'radio') ||
      (tag === 'INPUT' && (target as HTMLInputElement).type === 'checkbox');

    if (event.key === 'Escape') {
      // A field holding text took its Esc already (`escapeClears`); an empty one lets go.
      if (typing) (target as HTMLElement).blur();
      goUp();
      return;
    }
    if (typing) return;
    if (event.key === '/' && level.kind !== 'untagged' && level.kind !== 'patterns') {
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
        stepTag(event.key === 'ArrowRight' ? 1 : -1);
        return;
      }
      if ((event.key === 'o' || event.key === 'O') && tagRow) {
        event.preventDefault();
        openRow(tagRow);
        return;
      }
      // [ and ] move along the parts: the whole question, (a), (a)(i), … (b).
      if ((event.key === '[' || event.key === ']') && tagTargets.length > 1) {
        event.preventDefault();
        stepTagAt(event.key === ']' ? 1 : -1);
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
        saveTags();
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

  const stageAi = ((): StageAi | undefined => {
    if (!focused || aiItems.length === 0) return undefined;
    const mine = aiItems.filter((item) => item.unit.rootId === focused.rootId);
    if (mine.length === 0) return undefined;
    const item = aiCurrent && aiCurrent.unit.rootId === focused.rootId ? aiCurrent : mine[0];
    const at = aiItems.indexOf(item);
    const busyNow = aiPhase.kind === 'review' && Boolean(aiPhase.busy);
    return {
      note: <BankAiNote item={item} busy={busyNow} onFix={item.fix ? () => void bankAi.getState().applyItem(at) : undefined} />,
      marks: mine.flatMap((entry) => entry.marks),
    };
  })();

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
    if (level.kind === 'patterns') return <h1 className="text-[13.5px] font-semibold text-ink">題型 Patterns</h1>;
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
    const where = level.kind === 'review' && level.topic !== 'all' ? ` in ${topicDisplay(level.topic)}` : '';
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
          onClick={level.kind === 'topics' ? goHome : goUp}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-ink-muted transition-colors duration-150 ease-out-soft hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ← {level.kind === 'topics' ? 'Home' : 'Topics'}
        </button>
        {crumb}
        <span className="flex-1" />
        {level.kind === 'untagged' ? (
          <span className="text-[12px] text-ink-subtle">Tag a question, the next one appears</span>
        ) : level.kind === 'patterns' ? null : (
          <label className="relative w-[min(340px,32vw)] min-w-[200px]">
            <span className="sr-only">Search questions</span>
            <input
              ref={searchRef}
              type="search"
              value={filters.text}
              placeholder={
                level.kind === 'review' && level.topic !== 'all' ? `Search in ${topicDisplay(level.topic)}` : 'Search every question 搜尋全部題目'
              }
              onChange={(event) => onSearch(event.target.value)}
              onKeyDown={(event) => {
                // Esc with text clears only; an empty field's Esc goes up a level (`handleKey`).
                if (escapeClears(event, filters.text, () => onSearch(''))) return;
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
        {level.kind === 'review' && (
          <FilterPopover filters={filters} classes={classes} patterns={filterPatterns} scope={topic} onChange={setFilter} />
        )}
        {level.kind === 'review' && (
          <BankAiMenu
            question={focused}
            list={pickedByRoot}
            shown={order.map((group) => group.rows[0])}
            teacherText={teacherText}
            disabled={aiPhase.kind === 'running' || (aiPhase.kind === 'review' && Boolean(aiPhase.busy))}
            onRun={runAi}
          />
        )}
        {(level.kind === 'topics' || level.kind === 'review') && (
          <button
            type="button"
            onClick={() => setLevel({ kind: 'patterns', topic: level.kind === 'review' && topicOf(level.topic) ? level.topic : undefined })}
            title="Define, rename, merge or delete your 題型"
            className="shrink-0 cursor-pointer rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-ink-muted transition-colors duration-150 ease-out-soft hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            題型 Patterns
          </button>
        )}
        {level.kind === 'topics' && (
          <span className="text-[12px] tabular-nums text-ink-subtle" role={scanning ? 'status' : undefined}>
            {scanning ? `Reading your worksheets · ${status.done} of ${status.total}` : bankCountLabel(cover)}
          </span>
        )}
        {settings}
      </header>

      {banner && <div className="shrink-0 px-4 pt-3">{banner}</div>}

      <div className="relative flex min-h-0 flex-1 flex-col">
      {level.kind === 'topics' && !noDocuments && (
        <CoverageBar coverage={cover} onTopic={(code) => setLevel({ kind: 'review', topic: code })} />
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
              patterns={patternsByTopic}
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
            picked: pickedRoots,
            railHidden,
            language,
            version,
            usedWith: filters.notUsedWith,
            docLabels,
            aiTones,
          }}
          stageAi={stageAi}
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
          position={restoring && restoredAt < 0 ? 0 : restoring ? restoredAt : tagPosition}
          left={untagged.length + (restoring && restoredAt < 0 ? 1 : 0)}
          lastSaved={tagHistory.length > 0 ? tagSaveText(tagHistory[tagHistory.length - 1]) : undefined}
          onUndo={undoTagSave}
          suggestions={suggestions}
          chosen={chosen}
          partial={tagTicks?.partial}
          canSave={tagDraft !== undefined && hasTopic(tagDraft)}
          parts={
            tagDraft && tagDraft.slots.length > 0
              ? { lines: partLines(tagDraft), at: tagAt, name: targetName(tagDraft, tagAt), onAt: setTagAt }
              : undefined
          }
          language={language}
          busy={false}
          onToggle={toggleChosen}
          onAllTopics={() => tagGroup && setPicker({ mode: 'tag', rows: tagGroup.rows })}
          onSave={() => saveTags()}
          onStep={stepTag}
          onDone={() => setLevel(TOPICS_LEVEL)}
          onOpen={() => tagRow && openRow(tagRow)}
        />
      )}

      {level.kind === 'patterns' && (
        <PatternsPage
          items={patternItems}
          scope={level.topic}
          busy={busy}
          onScope={(scope) => setLevel({ kind: 'patterns', topic: scope })}
          onCreate={createPattern}
          onRename={renamePattern}
          onMerge={mergePattern}
          onDelete={deletePattern}
          onShow={showPattern}
        />
      )}
      <BankAiBar run={bankAi} left={level.kind === 'review' ? (railHidden ? 52 : 300) : 0} />
      </div>

      {(pickedRows.length > 0 || cart.cleared) && level.kind !== 'untagged' && level.kind !== 'patterns' && (
        <SelectionTray
          rows={pickedRows}
          targetTitle={target?.title}
          busy={busy}
          canUndo={cart.cleared !== null}
          onRemove={cart.remove}
          onMove={cart.move}
          onSortByType={() => cart.sortByType((key) => byKey.get(key)?.typeId)}
          onClear={cart.clear}
          onUndo={cart.undoClear}
          onDismiss={cart.dismissUndo}
          onSetTopic={() => setPicker({ mode: 'bulk', topicMode: 'add' })}
          onAddTo={() => void addTo(pickedRows)}
          onNewWorksheet={() => void newWorksheet()}
        />
      )}

      {picker?.mode === 'edit' && hasParts(picker.row) && (
        <PartTopicPickerDialog
          title="Topics"
          description={`${editDescription(picker.row, copyWrites(rows, [picker.row.rootId]).length)} Tag the whole question, then change a part alone.`}
          state={draftOf(stateOfRow(picker.row))}
          patterns={{ typeId: picker.row.typeId, kind: typeName(picker.row.typeId), names: (code) => patternNames(rows, registry, code, picker.row.typeId) }}
          confirmLabel="Save topics"
          onClose={() => setPicker(undefined)}
          onDone={(edit) => {
            const row = picker.row;
            setPicker(undefined);
            if (edit) void writeTopics(copyWrites(rows, [row.rootId]), edit, () => 'Topics saved.');
          }}
        />
      )}
      {picker?.mode === 'edit' && !hasParts(picker.row) && (
        <TopicPickerDialog
          title="Topics"
          description={editDescription(picker.row, copyWrites(rows, [picker.row.rootId]).length)}
          initial={picker.row.tags}
          patterns={pickerPatterns(picker.row.typeId, picker.row)}
          confirmLabel="Save topics"
          onClose={() => setPicker(undefined)}
          onDone={(codes, picked) => {
            const row = picker.row;
            setPicker(undefined);
            void writeTopics(
              copyWrites(rows, [row.rootId]),
              thenEdit(replaceTopics(codes), setPatternsEdit(patternEdits(picked.patterns, true))),
              () => 'Topics saved.',
            );
          }}
        />
      )}
      {picker?.mode === 'bulk' && (
        <TopicPickerDialog<BulkTopicMode>
          title={`Set topic for ${pickedRoots.size} ${pickedRoots.size === 1 ? 'question' : 'questions'}`}
          description={`${BULK_TEXT[picker.topicMode].description} Every copy of each question changes.${
            pickedByRoot.some(hasParts) ? ' On a question with parts, it applies to every part; change one part alone in Edit topics.' : ''
          }`}
          initial={[]}
          modes={{
            label: 'How to set topics',
            value: picker.topicMode,
            options: BULK_MODES,
            onChange: (topicMode) => setPicker({ mode: 'bulk', topicMode }),
          }}
          present={pickedMix}
          allowEmpty={picker.topicMode === 'replace'}
          patterns={
            picker.topicMode === 'remove'
              ? undefined
              : pickedTypes.length === 1
                ? { ...pickerPatterns(pickedTypes[0]), clearable: true }
                : { kind: 'mixed', names: () => [], clearable: true, present: pickedPatternMix }
          }
          patternRemoval={picker.topicMode === 'remove' ? pickedPatternMix : undefined}
          patternNote={
            picker.topicMode !== 'remove' && pickedTypes.length > 1
              ? 'To set a 題型, select questions of one type (MCQ or LQ) only. You can still clear one.'
              : undefined
          }
          confirmLabel={BULK_TEXT[picker.topicMode].confirm}
          onClose={() => setPicker(undefined)}
          onDone={(codes, picked) => {
            const mode = picker.topicMode;
            const count = pickedRoots.size;
            const patternChanges = patternEdits(picked.patterns);
            setPicker(undefined);
            if (codes.length === 0 && mode !== 'replace' && Object.keys(patternChanges).length === 0) return;
            const onlyPatterns = codes.length === 0 && mode !== 'replace';
            const edit = thenEdit(bulkTopicEdit(mode, codes), setPatternsEdit(patternChanges));
            const questions = `${count} ${count === 1 ? 'question' : 'questions'}`;
            void writeTopics(copyWrites(rows, pickedRoots), edit, (saved) =>
              `${onlyPatterns ? 'Cleared 題型 on' : BULK_TEXT[mode].done} ${questions} in ${saved} ${saved === 1 ? 'worksheet' : 'worksheets'}.`,
            );
          }}
        />
      )}
      {picker?.mode === 'tag' && tagDraft && (
        <TopicPickerDialog
          title={tagDraft.slots.length > 0 ? `Topics for ${targetName(tagDraft, tagAt)}` : 'Topics for this question'}
          description={
            tagDraft.slots.length === 0
              ? 'Tick every topic it tests. Saving moves on to the next question.'
              : tagAt === undefined
                ? 'Tick every topic it tests. They go on every part.'
                : `Tick every topic ${targetName(tagDraft, tagAt)} tests.`
          }
          initial={[...chosen]}
          patterns={
            tagRow
              ? {
                  ...pickerPatterns(tagRow.typeId),
                  initial: Object.fromEntries(
                    [...chosen].filter(holdsPatterns).flatMap((code) => {
                      const name = patternAt(tagDraft, tagAt, code).name;
                      return name ? [[code, name] as const] : [];
                    }),
                  ),
                }
              : undefined
          }
          confirmLabel={tagDraft.slots.length > 0 ? 'Done' : 'Save and next'}
          onClose={() => setPicker(undefined)}
          onDone={(codes, picked) => {
            setPicker(undefined);
            const edit = thenState(
              changeAt(tagDraft, tagAt, [...chosen], codes),
              ...Object.entries(patternEdits(picked.patterns)).map(([code, name]) => patternEditAt(tagDraft, tagAt, code, name)),
            );
            // With parts, the picks stay on screen to refine; without, saving moves on, as the keys do.
            if (tagDraft.slots.length > 0) setChosenFor({ root: tagRoot, edits: [...picksHere.edits, edit], at: tagAt });
            else saveTags(edit);
          }}
        />
      )}
    </div>
  );
}

/** One tag-as-you-go save, kept so it can be taken back. */
interface TagSave {
  group: BankGroup;
  /** Every topic it put on any part: what Undo takes off again. */
  codes: string[];
  /** What went where (`savedByPart`), as the Undo line says it. */
  parts: { label?: string; codes: string[] }[];
}

/** Tag as you go's picks on one question: its edits so far, and where the keys tag. */
interface TagPicks {
  root?: string;
  edits: readonly StateEdit[];
  at: PartTarget;
}

const NO_PICKS: TagPicks = { edits: [], at: undefined };

/** A row tagged part by part (a question with parts). */
const hasParts = (row: BankRow) => (row.slots?.length ?? 0) > 0;

/** "“A progressive tax…” tagged C · Public Finance", or "tagged (a) C · …; (b) I · …": what Undo would take back. */
function tagSaveText({ group, parts }: TagSave): string {
  const lead = group.rows[0];
  const text = lead?.excerpt.en || lead?.excerpt.zh || 'Question';
  const short = text.length > 48 ? `${text.slice(0, 47).trimEnd()}…` : text;
  const where = parts.map(({ label, codes }) => `${label ? `${label} ` : ''}${codes.map((code) => topicHeading(code)).join(', ')}`);
  return `“${short}” tagged ${where.join('; ')}`;
}

/** Where Edit topics writes: the one worksheet, or every copy. */
function editDescription(row: BankRow, copies: number): string {
  if (copies > 1) return `Saved into ${allOf(copies, 'copies')} of this question.`;
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

const NO_ITEMS: readonly BankReviewItem[] = [];
const TONE_RANK: Record<BankItemTone, number> = { failed: 3, look: 2, finding: 1, inserted: 0 };

/** Each reviewed question's strongest tone, by `rootId`: failed over look over finding over filled. */
function reviewTones(items: readonly BankReviewItem[]): ReadonlyMap<string, BankItemTone> {
  const tones = new Map<string, BankItemTone>();
  for (const item of items) {
    const had = tones.get(item.unit.rootId);
    if (!had || TONE_RANK[item.tone] > TONE_RANK[had]) tones.set(item.unit.rootId, item.tone);
  }
  return tones;
}

/** A row as a ✦ run's unit: the copy read, and where it lives ("Mock 2026 Paper 1 · Q4"). */
function unitOf(row: BankRow, labels: ReadonlyMap<string, string>): BankUnit {
  const title = labels.get(row.docId) ?? row.docTitle;
  return {
    docId: row.docId,
    questionId: row.questionId,
    rootId: row.rootId,
    contentKey: row.contentKey,
    label: row.number !== undefined ? `${title} · Q${row.number}` : title,
  };
}

/** A queue of writes: each starts once the one before it has settled, whatever its outcome. */
function createWriteQueue() {
  let last: Promise<unknown> = Promise.resolve();
  return {
    run<T>(work: () => Promise<T>): Promise<T> {
      const next = last.then(work, work);
      last = next.catch(() => undefined);
      return next;
    },
  };
}
