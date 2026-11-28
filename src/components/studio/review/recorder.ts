import { isAiError, type AiClient, type CompletionRequest, type CompletionResult, type DecideRequest } from '@/ai/types';
import { pictureId } from '../chat/chatPictures';
import { lean, redactSecrets } from './redact';
import type { ReviewStore } from './reviewStore';
import type { CallEvent, PromptRef, TraceError, TraceEvent, TurnTrace } from './types';

/**
 * The review recorder (k-0598): the chat store tells it when a reply starts and ends and what
 * it decided, and hands it the AI client for the reply, which it wraps so that every request
 * is kept exactly as sent (system + user turns, schema, pictures by fingerprint) with the raw
 * reply, the model, the time and Mentor's receipt. The engine is not touched: whatever it
 * asks the client is what gets recorded.
 *
 * A record is kept in memory while the reply runs, written to the review store a moment after
 * each event and once more when the reply ends. A long text (a system prompt, a schema) is kept
 * once, by fingerprint, and the record points to it. Nothing here ever throws into a run.
 */
export interface TraceSink {
  /** Recording now (a develop build on the desktop, `available.ts`). */
  on(): boolean;
  begin(chatId: string, turnId: string): void;
  event(chatId: string, turnId: string, event: TraceInput): void;
  /** The reply's client, wrapped so each call lands in its record. */
  client(chatId: string, turnId: string, client: AiClient, provider: string): AiClient;
  end(chatId: string, turnId: string): void;
  /** A chat deleted: its records and notes go too. */
  forget(chatId: string): void;
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type TraceInput = DistributiveOmit<TraceEvent, 'at'>;

/** Texts at least this long are kept once and pointed to. */
export const PROMPT_REF_MIN = 400;

export const promptId = (text: string) => `p-${pictureId(text)}`;

export const errorOf = (cause: unknown): TraceError => {
  if (isAiError(cause)) {
    const { kind, message, status, detail } = cause.info;
    return { kind, message: redactSecrets(message), ...(status !== undefined ? { status } : {}), ...(detail ? { detail: redactSecrets(detail) } : {}) };
  }
  return { kind: 'thrown', message: redactSecrets(cause instanceof Error ? cause.message : String(cause)) };
};

export interface RecorderDeps {
  store: ReviewStore;
  on: () => boolean;
  now?: () => number;
  /** Write delay after an event (ms). */
  delay?: number;
}

export function createRecorder(deps: RecorderDeps): TraceSink & { flush(): Promise<void> } {
  const now = deps.now ?? Date.now;
  const delay = deps.delay ?? 800;
  const open = new Map<string, { trace: TurnTrace; t0: number; prompts: Map<string, string>; timer?: ReturnType<typeof setTimeout> }>();
  const writes = new Set<Promise<unknown>>();
  const key = (chatId: string, turnId: string) => `${chatId}:${turnId}`;

  const write = (id: string) => {
    const entry = open.get(id);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = undefined;
    const p = deps.store
      .putTurn({ ...entry.trace, events: [...entry.trace.events] }, entry.prompts)
      .catch(() => false)
      .finally(() => writes.delete(p));
    writes.add(p);
  };

  const entryOf = (chatId: string, turnId: string) => {
    const id = key(chatId, turnId);
    let entry = open.get(id);
    if (!entry) {
      const t0 = now();
      entry = { trace: { id, chatId, turnId, startedAt: new Date(t0).toISOString(), events: [] }, t0, prompts: new Map() };
      open.set(id, entry);
    }
    return entry;
  };

  /** A long text kept once: the record holds its fingerprint. */
  const refer = (entry: { prompts: Map<string, string> }, text: string): string | PromptRef => {
    if (text.length < PROMPT_REF_MIN) return text;
    const id = promptId(text);
    entry.prompts.set(id, text);
    return { prompt: id };
  };

  const push = (chatId: string, turnId: string, event: TraceInput, at?: number) => {
    if (!deps.on()) return;
    try {
      const entry = entryOf(chatId, turnId);
      const kept = { ...(lean(event) as object), at: Math.max(0, (at ?? now()) - entry.t0) } as TraceEvent;
      if (kept.t === 'call') {
        if (typeof kept.system === 'string') kept.system = refer(entry, kept.system);
        if (typeof kept.schema === 'string') kept.schema = refer(entry, kept.schema);
      }
      entry.trace.events.push(kept);
      if (!entry.timer) entry.timer = setTimeout(() => write(entry.trace.id), delay);
    } catch {
      // A record that cannot be kept never takes the run down.
    }
  };

  const callOf = (req: CompletionRequest, provider: string, mode: CallEvent['mode']): Omit<CallEvent, 'at' | 'ms'> => ({
    t: 'call',
    mode,
    ...(req.feature ? { feature: req.feature } : {}),
    provider,
    maxOutputTokens: req.maxOutputTokens,
    system: req.system,
    turns: req.turns.map((t) => ({ role: t.role, content: t.content })),
    schema: JSON.stringify(req.schema, null, 1),
    ...(req.shapeHint ? { shapeHint: req.shapeHint } : {}),
    ...(req.images?.length ? { pictures: req.images.map((i) => ({ id: pictureId(i.dataUrl), kb: Math.round((i.dataUrl.length * 3) / 4 / 1024) })) } : {}),
  });

  const resultOf = (res: CompletionResult) => ({
    reply: res.text,
    finish: res.finish,
    dialect: res.dialect,
    model: res.model,
    ...(res.usage ? { usage: res.usage } : {}),
    ...(res.charged !== undefined ? { charged: res.charged } : {}),
    ...(res.balance !== undefined ? { balance: res.balance } : {}),
  });

  return {
    on: () => deps.on(),
    begin(chatId, turnId) {
      if (deps.on()) entryOf(chatId, turnId);
    },
    event: (chatId, turnId, event) => push(chatId, turnId, event),
    client(chatId, turnId, client, provider) {
      if (!deps.on()) return client;
      const timed = async <R>(mode: CallEvent['mode'], req: CompletionRequest, go: () => Promise<R & CompletionResult>, partial?: () => string): Promise<R & CompletionResult> => {
        const started = now();
        try {
          const res = await go();
          push(chatId, turnId, { ...callOf(req, provider, mode), ms: now() - started, ...resultOf(res) }, started);
          return res;
        } catch (cause) {
          const got = partial?.();
          push(chatId, turnId, { ...callOf(req, provider, mode), ms: now() - started, ...(got ? { reply: got } : {}), error: errorOf(cause) }, started);
          throw cause;
        }
      };
      const wrapped: AiClient = {
        complete: (req) => timed('complete', req, () => client.complete(req)),
        listModels: (signal) => client.listModels(signal),
      };
      if (client.stream) {
        wrapped.stream = (req, onText) => {
          let last = '';
          return timed(
            'stream',
            req,
            () =>
              (client.stream as NonNullable<AiClient['stream']>).call(client, req, (reply) => {
                last = reply;
                onText(reply);
              }),
            () => last,
          );
        };
      }
      if (client.decide) {
        wrapped.decide = async (req: DecideRequest) => {
          const started = now();
          const asked = { t: 'decide' as const, feature: req.feature, state: req.state, questions: req.questions };
          try {
            const res = await (client.decide as NonNullable<AiClient['decide']>).call(client, req);
            push(
              chatId,
              turnId,
              res
                ? { ...asked, ms: now() - started, answers: res.answers, model: res.model, fallback: res.fallback, ...(res.charged !== undefined ? { charged: res.charged } : {}), ...(res.balance !== undefined ? { balance: res.balance } : {}) }
                : { ...asked, ms: now() - started, notOffered: true },
              started,
            );
            return res;
          } catch (cause) {
            push(chatId, turnId, { ...asked, ms: now() - started, error: errorOf(cause) }, started);
            throw cause;
          }
        };
      }
      return wrapped;
    },
    end(chatId, turnId) {
      const id = key(chatId, turnId);
      const entry = open.get(id);
      if (!entry) return;
      entry.trace.endedAt = new Date(now()).toISOString();
      write(id);
      open.delete(id);
    },
    forget(chatId) {
      for (const [id, entry] of open) {
        if (entry.trace.chatId !== chatId) continue;
        if (entry.timer) clearTimeout(entry.timer);
        open.delete(id);
      }
      void deps.store.forget(chatId).catch(() => undefined);
    },
    async flush() {
      for (const id of [...open.keys()]) write(id);
      await Promise.all([...writes]);
    },
  };
}
