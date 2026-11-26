import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { isAiError, type AiErrorInfo } from '@/ai/types';
import { depsError, genericError } from '@/assist/fillRules';
import { runTagging, tagQuestionOf, type TagPartSuggestion, type TagQuestion, type TagSuggestion } from '@/autoTag';
import { atSlot, copyWrites, stateEdit, swapTags, SWAP_STALE, wholeQuestion, writeTags, addTopics, replaceTopics, type StateEdit, type TagChange } from '@/library/tagWrites';
import type { BankRow } from '@/library/types';
import { patternTag } from '@/model/patterns';
import { derivedTags, effectiveSlotTags, findSlot, questionTagSlots, slotRef, tagStateOf, type SlotRef } from '@/model/tagSlots';
import { hasViewTopic, viewCodesOf, withViewCodes } from '@/model/mcqView';
import { listCode, listCodesOf } from '@/autoTag/prompt';
import type { Worksheet } from '@/model/types';
import type { WorksheetStore } from '@/storage/types';
import type { RunDepsResult } from '@/translate/types';

/**
 * AI tagging in the question bank (k-0560, user u-4cgi), one run at a time. The questions
 * are read from their documents and sent in chunks (`autoTag/run.ts`); each suggestion waits
 * in the review list until the teacher accepts it (as suggested, or changed), skips it, or
 * closes the panel. Only Accept writes, and it writes every copy of that question through
 * the screen's write queue (`exclusive`), as tag as you go does. A question that has topics
 * when the write lands is left as it is, unless the run was asked for a tagged question
 * (`again`). Undo puts back exactly what the accept changed (`swapTags`).
 *
 * A question with two or more parts (u-g13t) is suggested and reviewed part by part: each
 * part has its own suggestion, Accept, Change…, Skip and Undo, and an accept writes that part
 * only (`acceptPartEdit`). The question's own state is its parts' (`rollup`), so its card,
 * the tally and Accept all read it as for a whole question.
 */

export type AiTagItemState =
  /** Sent, no answer yet. */
  | 'waiting'
  /** A suggestion to review. */
  | 'ready'
  | 'saving'
  | 'saved'
  | 'skipped'
  /** The AI gave nothing the bank knows (or the request failed). */
  | 'noAnswer'
  /** Nothing to read: never sent. */
  | 'noWords'
  /** Its document could not be read: never sent. */
  | 'notRead'
  /** Accepted, but the write left it as it was. */
  | 'notSaved';

/** One part of a question reviewed part by part (u-g13t). */
export interface AiTagPart {
  /** Its slot key (`TagSlotInfo.key`). */
  slot: string;
  /** "(a)", "(b)(ii)". */
  label: string;
  /** The slot, found again in every copy (`atSlot`). */
  ref: SlotRef;
  /** What it tested when read (topic codes and 題型): a run asked for a tagged question shows it, and Undo puts it back. */
  before: string[];
  suggestion?: TagPartSuggestion;
  topics: string[];
  pattern?: { topic: string; name: string };
  changed: boolean;
  /** As a whole question's; `noWords`: the part has nothing to read, so it was not sent. */
  state: Exclude<AiTagItemState, 'notRead'>;
  reason?: string;
  /** The tags its accept wrote, for Undo. */
  wrote?: string[];
}

export interface AiTagItem {
  rootId: string;
  /** The copy shown and read. */
  row: BankRow;
  /** Topic codes it holds now: a run asked for a tagged question shows them, and Accept replaces them. */
  current: string[];
  suggestion?: TagSuggestion;
  /** What Accept saves: the suggestion's, or the teacher's change. */
  topics: string[];
  pattern?: { topic: string; name: string };
  /** The teacher changed the topics. */
  changed: boolean;
  state: AiTagItemState;
  /** Why it was not saved. */
  reason?: string;
  /** What its accept changed, for Undo. */
  changes?: TagChange[];
  /** Reviewed part by part: its parts in print order (u-g13t). The item's `state` is theirs, rolled up. */
  parts?: AiTagPart[];
}

export type AiTagStatus = 'idle' | 'reading' | 'running' | 'done' | 'stopped' | 'error';

export interface AiTagState {
  status: AiTagStatus;
  /** Questions answered, of those sent. */
  done: number;
  total: number;
  error?: AiErrorInfo;
  items: AiTagItem[];
  /** Asked for a question that already has topics: Accept replaces them. */
  again: boolean;
  /** `keep`: items already reviewed, kept on top (a retry). */
  start(rows: readonly BankRow[], opts?: { again?: boolean; keep?: AiTagItem[] }): Promise<void>;
  stop(): void;
  /** With `slot`, that part only; a question reviewed part by part without one: every part waiting. */
  accept(rootId: string, slot?: string): Promise<void>;
  acceptAll(): Promise<void>;
  skip(rootId: string, slot?: string): void;
  /** A skipped one back to review. */
  review(rootId: string, slot?: string): void;
  /** The teacher's own topics (and 題型), then saved: changing is accepting. With `slot`, for that part. */
  change(rootId: string, topics: string[], pattern?: { topic: string; name: string }, slot?: string): Promise<void>;
  undo(rootId: string, slot?: string): Promise<void>;
  retry(): void;
  /** The error is read: the list stays to review. */
  dismissError(): void;
  /** The screen's rows, 題型 and write hook, current. */
  bind(context: AiTagContext): void;
  /** Stop, wait for the last write, and forget the run. */
  close(): Promise<void>;
}

export interface AiTagDeps {
  store: Pick<WorksheetStore, 'list' | 'load' | 'save'>;
  createRunDeps(opts?: { glossary?: boolean }): Promise<RunDepsResult>;
  desktop(): boolean;
  /** The bank screen's write queue: one document write at a time. */
  exclusive<T>(work: () => Promise<T>): Promise<T>;
  /** The reasons' language: the interface's. */
  whyLanguage(): 'en' | 'zh';
  now?(): string;
}

/** What the screen holds now, handed over on every render (`bind`). */
export interface AiTagContext {
  /** The bank's rows now: every copy a write reaches. */
  rows: readonly BankRow[];
  /** The teacher's 題型 names for one question type, by sub-topic (`patternNames`), only where there are some. */
  patterns(typeId: string): Record<string, string[]>;
  /** Documents were written: the screen re-reads its list. */
  onWritten(): void;
}

/** Why an accept left a question alone: it has topics now (tagged elsewhere since the run). */
export const TAGGED_MEANWHILE = 'it has topics now';

/** Every topic a row's question falls under (any part), as the bank reads it: view codes (k-0569). */
export const topicCodes = (row: Pick<BankRow, 'tags'>): string[] => viewCodesOf(row.tags);

/** As the bank counts it (`bankPage.ts:hasTopic`): a later build's code is a topic too. */
export const hasAnyTopic = (row: Pick<BankRow, 'tags'>): boolean => hasViewTopic(row.tags);

/**
 * The tags Accept adds: the topics (view codes, written through the MCQ view), then the 題型
 * under the main one, on its EDB sub-topic (k-0569: a 題型 stays on an EDB code).
 */
export function acceptedTags(topics: readonly string[], pattern?: { topic: string; name: string }): string[] {
  const fits = pattern && (topics.includes(pattern.topic) || (topics.length > 0 && listCodesOf(pattern.topic).includes(listCode(topics[0]))));
  return [...topics, ...(pattern && fits ? [patternTag(pattern.topic, pattern.name)] : [])];
}

/**
 * The edit an accept writes. On an untagged question: the topics on the whole question
 * (every part), and nothing at all once any part has a topic (it was tagged since). On a
 * question the teacher asked about again: its topics replaced on the whole question.
 */
export function acceptEdit(topics: readonly string[], pattern: { topic: string; name: string } | undefined, again: boolean): StateEdit {
  const tags = acceptedTags(topics, pattern);
  if (again) return wholeQuestion(replaceTopics(tags));
  const add = wholeQuestion(addTopics(tags));
  return stateEdit((state) => (hasViewTopic(derivedTags(state)) ? state : add(state)));
}

/** The topics a list falls under (view codes); for written topics, what writing them means. */
const codesIn = (tags: readonly string[]) => viewCodesOf(tags);
const meant = (tags: readonly string[]) => viewCodesOf(withViewCodes([], tags));

/**
 * The edit a part's accept writes (u-g13t): the topics on that part only (found in each copy
 * by `ref`). On an untagged question, nothing once that part has a topic (tagged since); the
 * other parts never stop it. On a question asked about again: that part's topics replaced.
 */
export function acceptPartEdit(ref: SlotRef, topics: readonly string[], pattern: { topic: string; name: string } | undefined, again: boolean): StateEdit {
  const tags = acceptedTags(topics, pattern);
  if (again) return atSlot(ref, replaceTopics(tags));
  const add = atSlot(ref, addTopics(tags));
  return stateEdit((state) => {
    const slot = findSlot(state.slots, ref);
    if (!slot || codesIn(effectiveSlotTags(state).get(slot.key) ?? []).length > 0) return state;
    return add(state);
  });
}

/**
 * A part's accept taken back: the part holds what it held before (`before`), but only while its
 * topics are still exactly those the accept wrote (`wrote`); changed since, it is left alone.
 * Undoing one part never touches another, accepted before or after.
 */
export function undoPartEdit(ref: SlotRef, wrote: readonly string[], before: readonly string[]): StateEdit {
  const put = atSlot(ref, () => [...before]);
  return stateEdit((state) => {
    const slot = findSlot(state.slots, ref);
    if (!slot) return state;
    // Its topic codes, as the accept left them (a 題型 the teacher had may have stayed beside them).
    const now = codesIn(effectiveSlotTags(state).get(slot.key) ?? []);
    const codes = meant(wrote);
    if (now.length !== codes.length || !codes.every((code) => now.includes(code))) return state;
    return put(state);
  });
}

/** A question's state from its parts': busy first, then anything to review, then saved, skipped, nothing. */
export function rollup(parts: readonly AiTagPart[]): AiTagItemState {
  const has = (...states: AiTagItemState[]) => parts.some((part) => states.includes(part.state));
  if (has('waiting')) return 'waiting';
  if (has('saving')) return 'saving';
  if (has('ready', 'notSaved')) return 'ready';
  if (has('saved')) return 'saved';
  if (has('skipped')) return 'skipped';
  if (parts.length > 0 && parts.every((part) => part.state === 'noWords')) return 'noWords';
  return 'noAnswer';
}

/** The parts once the question's suggestion is back: each part sent gets its own, or none. */
export function withPartSuggestions(parts: readonly AiTagPart[], suggestion: TagSuggestion | undefined): AiTagPart[] {
  const by = new Map((suggestion?.parts ?? []).map((part) => [part.slot, part]));
  return parts.map((part) => {
    if (part.state !== 'waiting') return part;
    const s = by.get(part.slot);
    if (!s) return { ...part, state: 'noAnswer' };
    return { ...part, suggestion: s, topics: [...s.topics], ...(s.pattern ? { pattern: s.pattern } : {}), state: 'ready' };
  });
}

export function createAiTag(deps: AiTagDeps): UseBoundStore<StoreApi<AiTagState>> {
  let controller: AbortController | null = null;
  let pending: Promise<unknown> = Promise.resolve();
  let lastRows: readonly BankRow[] = [];
  let context: AiTagContext = { rows: [], patterns: () => ({}), onWritten: () => {} };

  const track = <T>(work: Promise<T>): Promise<T> => {
    pending = pending.then(
      () => work.catch(() => undefined),
      () => work.catch(() => undefined),
    );
    return work;
  };

  return create<AiTagState>((set, get) => {
    const patch = (rootId: string, change: Partial<AiTagItem> | ((item: AiTagItem) => Partial<AiTagItem>)) =>
      set({
        items: get().items.map((item) => (item.rootId === rootId ? { ...item, ...(typeof change === 'function' ? change(item) : change) } : item)),
      });
    const find = (rootId: string) => get().items.find((item) => item.rootId === rootId);
    /** One part changed; the question's state follows its parts'. */
    const patchPart = (rootId: string, slot: string, change: Partial<AiTagPart>) =>
      patch(rootId, (item) => {
        const parts = (item.parts ?? []).map((part) => (part.slot === slot ? { ...part, ...change } : part));
        return { parts, state: rollup(parts) };
      });
    const findPart = (rootId: string, slot: string) => find(rootId)?.parts?.find((part) => part.slot === slot);
    /** The parts a call names: the one `slot`, else (no slot) those `pick` takes. */
    const partsOf = (rootId: string, slot: string | undefined, pick: (part: AiTagPart) => boolean) =>
      (find(rootId)?.parts ?? []).filter((part) => (slot === undefined ? pick(part) : part.slot === slot));

    const savePart = async (rootId: string, slot: string) => {
      const item = find(rootId);
      const part = findPart(rootId, slot);
      if (!item || !part || (part.state !== 'ready' && part.state !== 'notSaved') || part.topics.length === 0) return;
      patchPart(rootId, slot, { state: 'saving', reason: undefined });
      const changes: TagChange[] = [];
      const wrote = acceptedTags(part.topics, part.pattern);
      const edit = acceptPartEdit(part.ref, part.topics, part.pattern, get().again);
      const now = deps.now?.() ?? new Date().toISOString();
      const work = deps.exclusive(() => writeTags(deps.store, copyWrites(context.rows, [rootId]), edit, undefined, now, (change) => changes.push(change)));
      try {
        const report = await track(work);
        if (report.saved.length > 0) context.onWritten();
        if (changes.length > 0) patchPart(rootId, slot, { state: 'saved', wrote });
        else patchPart(rootId, slot, { state: 'notSaved', reason: report.failed[0]?.reason ?? TAGGED_MEANWHILE });
      } catch (cause) {
        patchPart(rootId, slot, { state: 'notSaved', reason: cause instanceof Error ? cause.message : String(cause) });
      }
    };

    const undoPart = async (rootId: string, slot: string) => {
      const part = findPart(rootId, slot);
      if (!part || part.state !== 'saved' || !part.wrote) return;
      patchPart(rootId, slot, { state: 'saving' });
      const changes: TagChange[] = [];
      const edit = undoPartEdit(part.ref, part.wrote, part.before);
      const work = deps.exclusive(() => writeTags(deps.store, copyWrites(context.rows, [rootId]), edit, undefined, deps.now?.() ?? new Date().toISOString(), (change) => changes.push(change)));
      try {
        const report = await track(work);
        if (report.saved.length > 0) context.onWritten();
        if (changes.length > 0) patchPart(rootId, slot, { state: 'ready', wrote: undefined, reason: undefined });
        else patchPart(rootId, slot, { state: 'saved', reason: report.failed[0]?.reason ?? SWAP_STALE });
      } catch (cause) {
        patchPart(rootId, slot, { state: 'saved', reason: cause instanceof Error ? cause.message : String(cause) });
      }
    };

    const save = async (rootId: string) => {
      const item = find(rootId);
      if (!item || (item.state !== 'ready' && item.state !== 'notSaved') || item.topics.length === 0) return;
      patch(rootId, { state: 'saving', reason: undefined });
      const changes: TagChange[] = [];
      const edit = acceptEdit(item.topics, item.pattern, get().again);
      const now = deps.now?.() ?? new Date().toISOString();
      const work = deps.exclusive(() => writeTags(deps.store, copyWrites(context.rows, [rootId]), edit, undefined, now, (change) => changes.push(change)));
      try {
        const report = await track(work);
        if (report.saved.length > 0) context.onWritten();
        if (changes.length > 0) patch(rootId, { state: 'saved', changes });
        else patch(rootId, { state: 'notSaved', reason: report.failed[0]?.reason ?? TAGGED_MEANWHILE });
      } catch (cause) {
        patch(rootId, { state: 'notSaved', reason: cause instanceof Error ? cause.message : String(cause) });
      }
    };

    /** Read each question from its document; those with words become the request. */
    const read = async (rows: readonly BankRow[], signal: AbortSignal): Promise<{ questions: TagQuestion[]; items: AiTagItem[] }> => {
      const docs = new Map<string, Promise<Worksheet | undefined>>();
      const load = (docId: string) => {
        if (!docs.has(docId)) docs.set(docId, deps.store.load(docId).catch(() => undefined));
        return docs.get(docId)!;
      };
      const questions: TagQuestion[] = [];
      const items: AiTagItem[] = [];
      const patternsByType = new Map<string, Record<string, string[]>>();
      for (const row of rows) {
        if (signal.aborted) break;
        const base: AiTagItem = { rootId: row.rootId, row, current: topicCodes(row), topics: [], changed: false, state: 'waiting' };
        const worksheet = await load(row.docId);
        if (!worksheet || !worksheet.questions.some((q) => q.id === row.questionId)) {
          items.push({ ...base, state: 'notRead' });
          continue;
        }
        if (!patternsByType.has(row.typeId)) patternsByType.set(row.typeId, context.patterns(row.typeId));
        const question = tagQuestionOf(worksheet, row.questionId, row.rootId, `q${questions.length + 1}`, patternsByType.get(row.typeId));
        if (!question) {
          items.push({ ...base, state: 'noWords' });
          continue;
        }
        questions.push(question);
        items.push(question.parts ? { ...base, parts: partsToReview(worksheet, row.questionId, question) } : base);
      }
      return { questions, items };
    };

    /** Every leaf part of a question sent part by part: those sent wait, the rest have no words. */
    const partsToReview = (worksheet: Worksheet, questionId: string, question: TagQuestion): AiTagPart[] => {
      const source = worksheet.questions.find((q) => q.id === questionId);
      if (!source) return [];
      const state = tagStateOf(source);
      const effective = effectiveSlotTags(state);
      const sent = new Set((question.parts ?? []).map((part) => part.slot));
      return questionTagSlots(source)
        .filter((slot) => slot.leaf)
        .flatMap((slot) => {
          const ref = slotRef(state.slots, slot.key);
          if (!ref) return [];
          return [{ slot: slot.key, label: slot.label, ref, before: [...(effective.get(slot.key) ?? [])], topics: [], changed: false, state: sent.has(slot.key) ? ('waiting' as const) : ('noWords' as const) }];
        });
    };

    return {
      status: 'idle',
      done: 0,
      total: 0,
      items: [],
      again: false,

      start: async (rows, opts) => {
        if (controller) return;
        const own = new AbortController();
        controller = own;
        lastRows = rows;
        const again = Boolean(opts?.again);
        const keep = opts?.keep ?? [];
        set({ status: 'reading', done: 0, total: rows.length, error: undefined, items: keep, again });
        try {
          const { questions, items } = await read(rows, own.signal);
          if (controller !== own) return;
          set({ items: [...keep, ...items], total: questions.length });
          if (own.signal.aborted) {
            set({ status: 'stopped' });
            return;
          }
          if (questions.length === 0) {
            set({ status: 'done' });
            return;
          }
          const resolved = await deps.createRunDeps({ glossary: false });
          if (controller !== own) return;
          if (!resolved.ok) {
            set({ status: 'error', error: depsError(resolved, deps.desktop()), items: get().items.filter((item) => item.state !== 'waiting') });
            return;
          }
          set({ status: 'running' });
          const outcome = await runTagging(questions, resolved.deps, {
            whyLanguage: deps.whyLanguage(),
            signal: own.signal,
            onProgress: (done, total) => controller === own && set({ done, total }),
            onSuggestions: (suggestions) => {
              if (controller !== own) return;
              const by = new Map(suggestions.map((s) => [s.rootId, s]));
              set({
                items: get().items.map((item) => {
                  const s = item.state === 'waiting' ? by.get(item.rootId) : undefined;
                  if (!s) return item;
                  if (item.parts) {
                    const parts = withPartSuggestions(item.parts, s);
                    return { ...item, suggestion: s, topics: s.topics, parts, state: rollup(parts) };
                  }
                  return { ...item, suggestion: s, topics: s.topics, ...(s.pattern ? { pattern: s.pattern } : {}), state: 'ready' };
                }),
              });
            },
          });
          if (controller !== own) return;
          const failed = new Set(outcome.failed);
          // Never sent (stopped, or a run-ending error) leave the list; a failed one says so.
          const items2 = get()
            .items.map((item) => {
              if (item.state !== 'waiting' || !failed.has(item.rootId)) return item;
              const parts = item.parts ? withPartSuggestions(item.parts, undefined) : undefined;
              return { ...item, state: 'noAnswer' as const, ...(parts ? { parts } : {}) };
            })
            .filter((item) => item.state !== 'waiting');
          if (outcome.fatal) set({ status: 'error', error: outcome.fatal, items: items2 });
          else set({ status: outcome.stopped ? 'stopped' : 'done', items: items2 });
        } catch (err) {
          if (controller === own) set({ status: 'error', error: isAiError(err) ? err.info : genericError(err), items: get().items.filter((item) => item.state !== 'waiting') });
        } finally {
          if (controller === own) controller = null;
        }
      },

      stop: () => controller?.abort(),

      accept: async (rootId, slot) => {
        if (!find(rootId)?.parts) return save(rootId);
        for (const part of partsOf(rootId, slot, (each) => each.state === 'ready')) await savePart(rootId, part.slot);
      },

      acceptAll: async () => {
        for (const item of get().items) {
          if (item.state !== 'ready') continue;
          if (!item.parts) await save(item.rootId);
          else for (const part of item.parts) if (part.state === 'ready') await savePart(item.rootId, part.slot);
        }
      },

      skip: (rootId, slot) => {
        const item = find(rootId);
        if (item?.parts) {
          for (const part of partsOf(rootId, slot, (each) => each.state === 'ready')) if (part.state === 'ready') patchPart(rootId, part.slot, { state: 'skipped' });
          return;
        }
        if (item?.state === 'ready') patch(rootId, { state: 'skipped' });
      },

      review: (rootId, slot) => {
        const item = find(rootId);
        if (item?.parts) {
          for (const part of partsOf(rootId, slot, (each) => each.state === 'skipped')) {
            if (part.state === 'skipped' || part.state === 'notSaved') patchPart(rootId, part.slot, { state: 'ready', reason: undefined });
          }
          return;
        }
        if (item?.state === 'skipped' || item?.state === 'notSaved') patch(rootId, { state: 'ready', reason: undefined });
      },

      change: async (rootId, topics, pattern, slot) => {
        const item = find(rootId);
        if (!item || topics.length === 0) return;
        if (item.parts) {
          const part = slot === undefined ? undefined : findPart(rootId, slot);
          if (!part || part.state === 'saving' || part.state === 'saved' || part.state === 'waiting') return;
          patch(rootId, (each) => {
            const parts = (each.parts ?? []).map((entry) => {
              if (entry.slot !== part.slot) return entry;
              const next: AiTagPart = { ...entry, topics: [...topics], changed: true, state: 'ready', reason: undefined };
              if (pattern) next.pattern = pattern;
              else delete next.pattern;
              return next;
            });
            return { parts, state: rollup(parts) };
          });
          await savePart(rootId, part.slot);
          return;
        }
        if (item.state !== 'ready' && item.state !== 'skipped' && item.state !== 'notSaved' && item.state !== 'noAnswer') return;
        set({
          items: get().items.map((each) => {
            if (each.rootId !== rootId) return each;
            const next: AiTagItem = { ...each, topics: [...topics], changed: true, state: 'ready', reason: undefined };
            if (pattern) next.pattern = pattern;
            else delete next.pattern;
            return next;
          }),
        });
        await save(rootId);
      },

      undo: async (rootId, slot) => {
        const item = find(rootId);
        if (item?.parts) {
          for (const part of partsOf(rootId, slot, (each) => each.state === 'saved')) await undoPart(rootId, part.slot);
          return;
        }
        if (!item || item.state !== 'saved' || !item.changes) return;
        patch(rootId, { state: 'saving' });
        const changes = item.changes;
        const work = deps.exclusive(() => swapTags(deps.store, changes, 'undo', undefined, deps.now?.() ?? new Date().toISOString()));
        try {
          const report = await track(work);
          if (report.saved.length > 0) context.onWritten();
          if (report.failed.length > 0 && report.saved.length === 0) patch(rootId, { state: 'saved', reason: report.failed[0].reason });
          else patch(rootId, { state: 'ready', changes: undefined, reason: undefined });
        } catch (cause) {
          patch(rootId, { state: 'saved', reason: cause instanceof Error ? cause.message : String(cause) });
        }
      },

      retry: () => {
        if (controller) return;
        // What the teacher already decided stays; everything else is asked again.
        const keep = get().items.filter((item) => item.state === 'saved' || item.state === 'skipped' || item.state === 'ready');
        const kept = new Set(keep.map((item) => item.rootId));
        void get().start(
          lastRows.filter((row) => !kept.has(row.rootId)),
          { again: get().again, keep },
        );
      },

      bind: (next) => {
        context = next;
      },

      dismissError: () => {
        if (get().status === 'error') set({ status: 'stopped', error: undefined });
      },

      close: async () => {
        controller?.abort();
        controller = null;
        await pending;
        set({ status: 'idle', done: 0, total: 0, error: undefined, items: [], again: false });
      },
    };
  });
}

/** Questions without topics in any copy: one row each (the copy shown first). */
export function untaggedRows(rows: readonly BankRow[]): BankRow[] {
  const tagged = new Set(rows.filter(hasAnyTopic).map((row) => row.rootId));
  const seen = new Set<string>();
  const out: BankRow[] = [];
  for (const row of rows) {
    if (tagged.has(row.rootId) || seen.has(row.rootId)) continue;
    seen.add(row.rootId);
    out.push(row);
  }
  return out;
}
