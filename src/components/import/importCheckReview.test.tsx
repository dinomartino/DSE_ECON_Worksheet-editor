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
import { AiCheckRow } from './ImportCheckPanel';
import type { AiCheckOutcome } from '@/importCheck/ai';
import type { AiRun } from '@/importCheck/aiSummary';

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
      expect(html()).not.toContain('data-ai-bar');
    } finally {
      setPausedForTest(null);
    }
  });
});

describe('the AI check is always in sight (k-0501, user u-2ywo)', () => {
  it('its button is on the review bar before anything is opened, also when nothing is left to check', () => {
    const clean = ['1. Which of the following is a feature of a sole proprietorship?', 'A. unlimited liability', 'B. separate legal entity', 'C. shares', 'D. many owners'].join('\n');
    const result = paperReview(readPaste({ plain: clean }), paperState('auto'));
    const en = resolveMessages(IMPORT_MESSAGES, 'en');
    const html = renderToStaticMarkup(<ReviewStep text={en} result={result} state={paperState('auto')} update={() => {}} base={previewBase()} cache={new Map()} notify={() => {}} />);
    expect(html).toContain('data-ai-bar');
    expect(html).toContain('✦ AI check');
  });

  const row = (run: AiRun, configured = true) =>
    renderToStaticMarkup(<AiCheckRow run={run} provider="Google Gemini" configured={configured} onAsk={() => {}} onStop={() => {}} now={12000} />);

  it('not run yet: says where it would send, or that no provider is set up', () => {
    expect(row({ state: 'idle' })).toContain('Not run yet. Sends each question and its part of the file to Google Gemini with your key.');
    expect(row({ state: 'idle' }, false)).toContain('No AI provider is set up');
    expect(row({ state: 'idle' })).toContain('Ask the AI');
  });

  it('running: what it is doing, how far, how long, and Stop', () => {
    const html = row({ state: 'running', done: 10, total: 30, batches: 6, concurrency: 2, startedAt: 0 });
    expect(html).toContain('Sending 30 questions in 6 batches to Google Gemini');
    expect(html).toContain('10 of 30 checked');
    expect(html).toContain('0:12 so far · about 25 s left');
    expect(html).toContain('>Stop<');
    expect(html).toContain('width:33%');
  });

  it('finished with nothing found: the headline and the summary lines show', () => {
    const outcome: AiCheckOutcome = {
      findings: [],
      total: 2,
      failed: 0,
      stopped: false,
      done: 2,
      checked: { questions: 2, options: 8, statements: 0, pictures: 0, tables: 0, marks: 0 },
      dropped: 0,
      ms: 9000,
    };
    const html = row({ state: 'done', at: Date.UTC(2026, 10, 23, 6, 32), outcome });
    expect(html).toMatch(/✓ AI checked the whole paper \(2 questions\) at \d\d:\d\d: no problems found/);
    expect(html).toContain('Checked: 2 questions · 8 MC options');
    expect(html).toContain('Ask again');
  });
});
