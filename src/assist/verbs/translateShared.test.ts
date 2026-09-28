import { describe, expect, it } from 'vitest';
import type { JobResult } from '@/translate/types';
import { fillOptions, fillSummary, needsLook, rowNotes } from './translateShared';

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
  it('a plainly ready row has no notes; an auto-fixed one still says what was fixed', () => {
    expect(rowNotes(result({}))).toEqual([]);
    expect(rowNotes(result({ fixes: [{ from: '供給', to: '供應', how: 'autoFix' }] }))).toEqual([
      { tone: 'ok', text: 'Term fixed: 供給 → 供應 (EDB)' },
    ]);
  });

  it('a failure names its reason; warnings come before what was fixed', () => {
    const failed = result({ status: 'failed', runs: undefined, issues: [{ code: 'blanks', severity: 'fail', message: 'lost a blank' }] });
    expect(rowNotes(failed)).toEqual([{ tone: 'fail', text: "Couldn't translate this text safely (lost a blank)." }]);
    const flagged = result({
      status: 'flagged',
      fixes: [{ from: '价', to: '價', how: 'simplified' }],
      issues: [{ code: 'emphasis', severity: 'warn', message: 'Bold not kept' }],
    });
    expect(rowNotes(flagged).map((n) => n.tone)).toEqual(['warn', 'ok']);
  });

  it('a warning or a content risk the old review left unticked needs a look', () => {
    expect(needsLook(result({}))).toBe(false);
    expect(needsLook(result({ status: 'flagged' }))).toBe(true);
    expect(needsLook(result({ defaultAccepted: false }))).toBe(true);
  });
});

describe('fillOptions', () => {
  it('one direction; teacher text from the setting or the Teacher version; copies only for the edition side', () => {
    const student = { language: 'zh', version: 'student' } as const;
    expect(fillOptions(student, false, 'zh', false)).toMatchObject({
      directions: { toZh: true, toEn: false },
      includeTeacher: false,
      includeDiagramLabels: true,
      copySymbols: { toZh: true, toEn: false },
    });
    expect(fillOptions({ ...student, version: 'teacher' }, false, 'zh', false).includeTeacher).toBe(true);
    expect(fillOptions({ language: 'bilingual', version: 'student' }, true, 'en', true)).toMatchObject({
      directions: { toZh: false, toEn: true },
      includeTeacher: true,
      copySymbols: { toZh: false, toEn: false },
      retranslate: 'en',
    });
  });
});

describe('fillSummary', () => {
  it('reads as one line in texts', () => {
    const base = { verb: 'Filled' as const, side: 'zh' as const, look: 0, failed: 0, skipped: 0, stopped: false };
    expect(fillSummary({ ...base, filled: 47 })).toBe('Filled 47 中文 texts');
    expect(fillSummary({ ...base, filled: 47, look: 5, failed: 2 })).toBe("Filled 47 中文 texts, 5 need a look, 2 couldn't be translated");
    expect(fillSummary({ ...base, filled: 1, look: 1, stopped: true })).toBe('Stopped · Filled 1 中文 text, 1 needs a look');
    expect(fillSummary({ ...base, verb: 'Re-translated', side: 'en', filled: 3, notSent: { count: 4, reason: 'Out of quota' } })).toBe(
      'Re-translated 3 English texts, 4 not sent (Out of quota)',
    );
  });
});
