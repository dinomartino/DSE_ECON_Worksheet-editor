import { describe, expect, it } from 'vitest';
import type { JobResult } from '@/translate/types';
import { rowNotes } from './ReviewRow';

const result = (over: Partial<JobResult>): JobResult => ({
  key: 't1',
  status: 'ready',
  runs: [{ text: '供應下降。' }],
  issues: [],
  terms: [],
  fixes: [],
  passes: 1,
  defaultAccepted: true,
  ...over,
});

describe('rowNotes', () => {
  it('a plainly ready row has no notes', () => {
    expect(rowNotes(result({}), null)).toEqual([]);
  });

  it('an auto-fixed row stays ready and still shows Term fixed (§A.3)', () => {
    const notes = rowNotes(result({ fixes: [{ from: '供給', to: '供應', how: 'autoFix' }] }), null);
    expect(notes).toEqual([{ tone: 'ok', text: 'Term fixed: 供給 → 供應 (EDB)' }]);
  });
});
