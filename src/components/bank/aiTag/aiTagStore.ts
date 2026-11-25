import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { isAiError, type AiErrorInfo } from '@/ai/types';
import { depsError, genericError } from '@/assist/fillRules';
import { runTagging, tagQuestionOf, type TagQuestion, type TagSuggestion } from '@/autoTag';
import { copyWrites, stateEdit, swapTags, wholeQuestion, writeTags, addTopics, replaceTopics, type StateEdit, type TagChange } from '@/library/tagWrites';
import type { BankRow } from '@/library/types';
import { patternTag } from '@/model/patterns';
import { derivedTags } from '@/model/tagSlots';
import { rollupTopic, topicOf } from '@/model/topics';
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
  accept(rootId: string): Promise<void>;
  acceptAll(): Promise<void>;
  skip(rootId: string): void;
  /** A skipped one back to review. */
  review(rootId: string): void;
  /** The teacher's own topics (and 題型), then saved: changing is accepting. */
  change(rootId: string, topics: string[], pattern?: { topic: string; name: string }): Promise<void>;
  undo(rootId: string): Promise<void>;
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

/** Every topic code a row's question holds (any part). */
export const topicCodes = (row: Pick<BankRow, 'tags'>): string[] => row.tags.filter((tag) => topicOf(tag) !== undefined);

/** As the bank counts it (`bankPage.ts:hasTopic`): a later build's code is a topic too. */
export const hasAnyTopic = (row: Pick<BankRow, 'tags'>): boolean => row.tags.some((tag) => rollupTopic(tag) !== undefined);

/** The tags Accept adds: the topics, then the 題型 under the main one. */
export function acceptedTags(topics: readonly string[], pattern?: { topic: string; name: string }): string[] {
  return [...topics, ...(pattern && topics.includes(pattern.topic) ? [patternTag(pattern.topic, pattern.name)] : [])];
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
  return stateEdit((state) => (derivedTags(state).some((tag) => topicOf(tag)) ? state : add(state)));
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
        items.push(base);
      }
      return { questions, items };
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
                  return s ? { ...item, suggestion: s, topics: s.topics, ...(s.pattern ? { pattern: s.pattern } : {}), state: 'ready' } : item;
                }),
              });
            },
          });
          if (controller !== own) return;
          const failed = new Set(outcome.failed);
          // Never sent (stopped, or a run-ending error) leave the list; a failed one says so.
          const items2 = get()
            .items.map((item) => (item.state === 'waiting' && failed.has(item.rootId) ? { ...item, state: 'noAnswer' as const } : item))
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

      accept: (rootId) => save(rootId),

      acceptAll: async () => {
        for (const item of get().items) if (item.state === 'ready') await save(item.rootId);
      },

      skip: (rootId) => {
        if (find(rootId)?.state === 'ready') patch(rootId, { state: 'skipped' });
      },

      review: (rootId) => {
        const item = find(rootId);
        if (item?.state === 'skipped' || item?.state === 'notSaved') patch(rootId, { state: 'ready', reason: undefined });
      },

      change: async (rootId, topics, pattern) => {
        const item = find(rootId);
        if (!item || topics.length === 0) return;
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

      undo: async (rootId) => {
        const item = find(rootId);
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
