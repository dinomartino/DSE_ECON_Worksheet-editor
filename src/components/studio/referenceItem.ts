'use client';

import { useEffect, useState } from 'react';
import { computeNumbering } from '@/model/numbering';
import type { Worksheet } from '@/model/types';
import type { PastPaperState } from '@/pastpapers/bank';
import { usePastPaperBank } from '@/pastpapers/bank';
import type { PastPaperItem } from '@/pastpapers/pack';
import type { SourceQuestion } from '@/questionStudio/types';
import { worksheetStore } from '@/storage';
import type { Chat } from './chat/chatTypes';
import { mineReference, parseMineId } from './myQuestions';

/**
 * Where a reference's printed form comes from, for the badge preview (k-0533): one of the
 * teacher's own questions is read again from its saved document (read only); a past-paper
 * question is found in the Past paper bank topics this session has already read (the picker
 * read its topic). Neither found: the preview shows the question's words.
 */

export interface PrintedReference {
  item: PastPaperItem;
  /** The document it prints in (fonts, page). */
  doc: Worksheet;
}

/** A past-paper item by its source tag, among the topics already read; no download is started. */
export function pastItemOf(state: Pick<PastPaperState, 'topics'>, tag: string): PrintedReference | undefined {
  for (const topic of Object.values(state.topics)) {
    if (topic.state !== 'ready') continue;
    const item = topic.data.items.find((i) => i.source.tag === tag);
    if (item) return { item, doc: topic.data.doc };
  }
  return undefined;
}

/** The reference's printed form, once found (`undefined` while looking, `null` when there is none). */
export function usePrintedReference(source: SourceQuestion, open: boolean): PrintedReference | null | undefined {
  const [found, setFound] = useState<{ id: string; value: PrintedReference | null }>();
  const id = source.id;
  const label = source.label;
  useEffect(() => {
    if (!open || found?.id === id) return;
    let live = true;
    const mine = parseMineId(id);
    if (!mine) {
      const hit = pastItemOf(usePastPaperBank.getState(), id) ?? null;
      queueMicrotask(() => live && setFound({ id, value: hit }));
    } else {
      worksheetStore.load(mine.docId).then(
        (doc) => {
          const ref = doc ? mineReference(doc, mine.questionId, label, computeNumbering(doc).byQuestionId.get(mine.questionId)?.number) : undefined;
          if (live) setFound({ id, value: ref && doc ? { item: ref.item, doc } : null });
        },
        () => live && setFound({ id, value: null }),
      );
    }
    return () => {
      live = false;
    };
  }, [open, id, label, found?.id]);
  return found?.id === id ? found.value : undefined;
}

/**
 * The reference a past turn names by label: the chat's current references first, then the
 * ones its drafts were written from (a reference removed later is still in its drafts'
 * requests). Undefined when none has that label.
 */
export function referenceByLabel(chat: Pick<Chat, 'refs' | 'drafts'>, label: string): SourceQuestion | undefined {
  const current = chat.refs.find((r) => r.source.label === label);
  if (current) return current.source;
  for (const draft of chat.drafts) {
    const hit = draft.entry.request.examples.find((e) => !e.auto && e.label === label);
    if (hit) return hit;
  }
  return undefined;
}
