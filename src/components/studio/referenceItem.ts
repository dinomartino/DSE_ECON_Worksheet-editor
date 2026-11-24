'use client';

import { useEffect, useState } from 'react';
import type { StoreApi } from 'zustand';
import { computeNumbering } from '@/model/numbering';
import type { Worksheet } from '@/model/types';
import type { PastPaperState } from '@/pastpapers/bank';
import { usePastPaperBank } from '@/pastpapers/bank';
import type { PastPaperItem } from '@/pastpapers/pack';
import type { SourceQuestion } from '@/questionStudio/types';
import { worksheetStore } from '@/storage';
import type { Chat, ChatRef } from './chat/chatTypes';
import { mineReference, parseMineId } from './myQuestions';

/**
 * Where a reference's printed form comes from, for the badge preview (k-0533) and Side by
 * side: one of the teacher's own questions is read again from its saved document (read
 * only); a past-paper question is found in the topics this session has read, else read
 * again from the bank by its source tag (k-0547: a reload, a restored chat or a new bank
 * list no longer loses it). Not found: the question's words, with why.
 */

export interface PrintedReference {
  item: PastPaperItem;
  /** The document it prints in (fonts, page). */
  doc: Worksheet;
}

/** Why only a reference's words can be shown (k-0547). */
export type MissingReason = 'bankOff' | 'bankError' | 'notInBank' | 'docGone';

/** The printed form, or why there is none. */
export type PrintedLookup = PrintedReference | { missing: MissingReason };

export const isPrinted = (x: PrintedLookup | undefined): x is PrintedReference => x !== undefined && 'item' in x;

/** A past-paper item by its source tag (or question id), among the topics already read; no download is started. */
export function pastItemOf(state: Pick<PastPaperState, 'topics'>, tag: string): PrintedReference | undefined {
  for (const topic of Object.values(state.topics)) {
    if (topic.state !== 'ready') continue;
    const item = topic.data.items.find((i) => i.source.tag === tag || (!i.source.tag && i.question.id === tag));
    if (item) return { item, doc: topic.data.doc };
  }
  return undefined;
}

type Bank = Pick<StoreApi<PastPaperState>, 'getState' | 'subscribe'>;

/** The bank's list, read (or being read by someone else: waited for, at most `ms`). */
async function openedBank(bank: Bank, ms = 30_000): Promise<PastPaperState> {
  await bank.getState().open().catch(() => undefined);
  if (bank.getState().status !== 'loading') return bank.getState();
  await new Promise<void>((done) => {
    const timer = setTimeout(stop, ms);
    const off = bank.subscribe((s) => s.status !== 'loading' && stop());
    function stop() {
      clearTimeout(timer);
      off();
      done();
    }
  });
  return bank.getState();
}

/**
 * A past-paper question found again by its source tag (k-0547): the topics already read, else
 * the topic the bank's search index names for it, read from this computer's copy or the web.
 */
export async function findPastItem(bank: Bank, tag: string): Promise<PrintedLookup> {
  const now = pastItemOf(bank.getState(), tag);
  if (now) return now;
  const state = await openedBank(bank);
  if (state.status === 'off' || state.status === 'disabled') return { missing: 'bankOff' };
  if (!state.manifest) return { missing: 'bankError' };
  const topicIds = [...new Set((state.manifest.search ?? []).filter((r) => r.source.tag === tag).map((r) => r.topicId))];
  let failed = false;
  for (const id of topicIds) {
    const topic = await state.topic(id);
    if (topic?.state !== 'ready') {
      failed = true;
      continue;
    }
    const item = topic.data.items.find((i) => i.source.tag === tag);
    if (item) return { item, doc: topic.data.doc };
  }
  return { missing: failed ? 'bankError' : 'notInBank' };
}

/** One of the teacher's own questions, read again from its saved document. */
async function findMineItem(id: { docId: string; questionId: string }, label: string): Promise<PrintedLookup> {
  const doc = await worksheetStore.load(id.docId).catch(() => null);
  const ref = doc ? mineReference(doc, id.questionId, label, computeNumbering(doc).byQuestionId.get(id.questionId)?.number) : undefined;
  return ref && doc ? { item: ref.item, doc } : { missing: 'docGone' };
}

/** A reference's printed form, wherever it is kept. Never rejects. */
export function findPrintedReference(source: Pick<SourceQuestion, 'id' | 'label'>, bank: Bank = usePastPaperBank): Promise<PrintedLookup> {
  const mine = parseMineId(source.id);
  const job = mine ? findMineItem(mine, source.label) : findPastItem(bank, source.id);
  return job.catch((): PrintedLookup => ({ missing: mine ? 'docGone' : 'bankError' }));
}

/** The reference's printed form or why not, once looked up (`undefined` while looking). */
export function usePrintedReference(source: SourceQuestion, open: boolean): PrintedLookup | undefined {
  const [found, setFound] = useState<{ id: string; value: PrintedLookup }>();
  const id = source.id;
  const label = source.label;
  useEffect(() => {
    if (!open || found?.id === id) return;
    let live = true;
    void findPrintedReference({ id, label }).then((value) => live && setFound({ id, value }));
    return () => {
      live = false;
    };
  }, [open, id, label, found?.id]);
  return found?.id === id ? found.value : undefined;
}

/**
 * Every reference a chat's drafts can be set beside (k-0547): the chat's current ones (the
 * teacher's first, else the AI's), then each one a draft was written from, newest draft
 * first. A reference removed from the composer, or replaced by a later request's, stays
 * here for as long as a draft written from it does.
 */
export function chatReferences(chat: Pick<Chat, 'refs' | 'drafts'>): ChatRef[] {
  const mine = chat.refs.filter((r) => r.who === 'you');
  const out: ChatRef[] = [...(mine.length ? mine : chat.refs)];
  const seen = new Set(out.map((r) => r.source.id));
  for (const draft of [...chat.drafts].reverse()) {
    for (const source of draft.entry.request.examples) {
      if (seen.has(source.id)) continue;
      seen.add(source.id);
      const kept = chat.refs.find((r) => r.source.id === source.id);
      out.push(kept ?? { source, who: source.auto ? 'ai' : 'you' });
    }
  }
  return out;
}

/**
 * The reference a past turn names by label: the chat's current references first, then the
 * ones its drafts were written from (a reference removed later is still in its drafts'
 * requests). The studio's own style examples only with `auto` (the "Chose … to write like"
 * step names them). Undefined when none has that label.
 */
export function referenceByLabel(chat: Pick<Chat, 'refs' | 'drafts'>, label: string, opts: { auto?: boolean } = {}): SourceQuestion | undefined {
  const current = chat.refs.find((r) => r.source.label === label);
  if (current) return current.source;
  for (const draft of chat.drafts) {
    const hit = draft.entry.request.examples.find((e) => (opts.auto || !e.auto) && e.label === label);
    if (hit) return hit;
  }
  return undefined;
}
