import { describe, expect, it } from 'vitest';
import type { SourceQuestion } from '@/questionStudio/types';
import type { PastPaperState } from '@/pastpapers/bank';
import type { Chat } from './chat/chatTypes';
import { previewPlacement } from './ReferenceBadge';
import { pastItemOf, referenceByLabel } from './referenceItem';

const src = (id: string, label: string, auto = false): SourceQuestion => ({ id, label, stem: { en: 's', zh: '' }, statements: [], options: [], answerIndex: 0, hasFigure: false, ...(auto ? { auto } : {}) });

describe('reference badge preview (k-0533)', () => {
  it('finds a past turn’s reference by label: current references first, then those its drafts were written from', () => {
    const chat = {
      refs: [{ source: src('a', 'DSE2019 Paper 1 Q15'), who: 'you' }],
      drafts: [
        { entry: { request: { examples: [src('auto-1', 'Style only', true), src('mine:d/q', 'Mock 2026 · Q4')] } } },
      ],
    } as unknown as Chat;
    expect(referenceByLabel(chat, 'DSE2019 Paper 1 Q15')?.id).toBe('a');
    // Removed from the composer since, still in its drafts' request.
    expect(referenceByLabel(chat, 'Mock 2026 · Q4')?.id).toBe('mine:d/q');
    // The studio's own style examples are never the teacher's reference.
    expect(referenceByLabel(chat, 'Style only')).toBeUndefined();
    expect(referenceByLabel(chat, 'Gone')).toBeUndefined();
  });

  it('finds a past-paper item only among topics already read', () => {
    const item = { source: { tag: 'DSE2019/P1/Q15' } };
    const state = {
      topics: { loading: { state: 'loading' }, C: { state: 'ready', data: { items: [item], doc: { id: 'doc' } } } },
    } as unknown as Pick<PastPaperState, 'topics'>;
    expect(pastItemOf(state, 'DSE2019/P1/Q15')?.item).toBe(item);
    expect(pastItemOf(state, 'DSE2019/P1/Q16')).toBeUndefined();
  });

  it('opens above a badge low on the screen (the composer), below one high up, inside the window', () => {
    const view = { width: 1440, height: 900 };
    const low = previewPlacement({ top: 820, bottom: 840, left: 30 }, view);
    expect(low).toMatchObject({ position: 'fixed', bottom: 86, left: 30, width: 460, maxHeight: 802 });
    const high = previewPlacement({ top: 100, bottom: 120, left: 1400 }, view);
    expect(high).toMatchObject({ top: 126, left: 1440 - 460 - 12 });
    expect(previewPlacement({ top: 100, bottom: 120, left: 0 }, { width: 400, height: 900 })).toMatchObject({ left: 12, width: 376 });
  });
});
