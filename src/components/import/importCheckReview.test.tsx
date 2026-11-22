/** The import check in the import review (k-0494): fixes before Save, shown in the preview, undone by ⌘Z. */
import { describe, expect, it } from 'vitest';
import { readPaste } from '@/import';
import { checkReview, materializeBatch } from '@/importCheck/run';
import type { CheckOp } from '@/importCheck/ops';
import { plain } from '@/model/text';
import type { ParagraphBlock } from '@/model/types';
import { paperReview, paperState, type PaperState } from './importBatch';
import { previewBase, previewItems } from './previewDoc';
import { ReviewStep, undoFix } from './ReviewStep';
import { renderToStaticMarkup } from 'react-dom/server';
import { setPausedForTest } from '@/assist/paused';
import { resolveMessages } from '@/i18n/catalogue';
import { IMPORT_MESSAGES } from './messages';

const PAPER = [
  '1. The table below shows the output of a firm. This Photo by Unknown Author is licensed under CC BY',
  'A. 10 units',
  'B. 20 units',
  'C. 30 units',
  'D. 40 units',
].join('\n');

describe('import check fixes in the review', () => {
  it('change what Save writes and what the preview shows; ⌘Z takes the group back', () => {
    const read = readPaste({ plain: PAPER });
    const start = paperState('auto');
    const plainReview = paperReview(read, start);
    const [junk] = checkReview(plainReview.analysis, plainReview.batch, plainReview.batch, { maxWidthPx: 605 });
    expect(junk.kind).toBe('junk');
    const op = (junk.fix as { op: CheckOp }).op;
    const state: PaperState = { ...start, fixes: [[op]], undo: ['check'] };
    const fixed = paperReview(read, state);
    const stem = (b: typeof fixed.batch) => plain((materializeBatch(b)[0].blocks[0] as ParagraphBlock).text.en);
    expect(stem(fixed.batch)).toBe('The table below shows the output of a firm.');
    expect(stem(fixed.preview)).toBe('The table below shows the output of a firm.');
    expect(fixed.unfixed?.builds).toHaveLength(plainReview.batch.builds.length);
    expect(fixed.stale).toBe(0);
    // The preview renders the fixed question (its cache key changes with the fix).
    const cache = new Map();
    const items = previewItems(previewBase(), fixed.analysis, fixed.preview, cache);
    expect(JSON.stringify(items[0].nodes)).not.toContain('Unknown Author');
    // Nothing left to check, and ⌘Z puts the import back as the file made it.
    expect(checkReview(fixed.analysis, fixed.unfixed!, fixed.batch, { maxWidthPx: 605 })).toEqual([]);
    const undone = undoFix(state);
    expect(undone).toMatchObject({ fixes: [], undo: [] });
    expect(stem(paperReview(read, undone).batch)).toContain('Unknown Author');
  });
});

describe('the review step’s Check import button', () => {
  it('shows beside Next to check, and goes with ✦ AI → Check import when that is paused', () => {
    const read = readPaste({ plain: PAPER });
    const result = paperReview(read, paperState('auto'));
    const en = resolveMessages(IMPORT_MESSAGES, 'en');
    const html = () => renderToStaticMarkup(<ReviewStep text={en} result={result} state={paperState('auto')} update={() => {}} base={previewBase()} cache={new Map()} notify={() => {}} />);
    expect(html()).toContain('data-check-import');
    expect(html()).toContain('>Check import<');
    setPausedForTest(['check.import']);
    try {
      expect(html()).not.toContain('data-check-import');
    } finally {
      setPausedForTest(null);
    }
  });
});
