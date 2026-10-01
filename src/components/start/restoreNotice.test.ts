import { describe, expect, it } from 'vitest';
import { restoreSummary } from '@/storage/backup';
import { restoreNotice } from './restoreNotice';

const cases = [
  [{ restored: ['a', 'b'], copied: ['c'], skipped: ['d'], failed: [] }, 1, { restored: 2, copied: 1, skipped: 1, failed: 1 }],
  [{ restored: ['a'], copied: [], skipped: [], failed: [{ name: 'x', reason: 'y' }] }, 0, undefined],
  [{ restored: [], copied: [], skipped: [], failed: [] }, 0, undefined],
] as const;

describe('restoreNotice', () => {
  it('reads like restoreSummary in English', () => {
    for (const [report, bad, graphs] of cases) {
      expect(restoreNotice(report as never, bad, graphs as never, 'en')).toBe(restoreSummary(report as never, bad, graphs as never));
    }
  });

  it('speaks Chinese', () => {
    expect(restoreNotice(cases[0][0] as never, 1, cases[0][2] as never, 'zh-HK')).toMatch(/已還原 3 份/);
    expect(restoreNotice(cases[2][0] as never, 0, undefined, 'zh-HK')).toBe('這個備份內沒有工作紙。');
  });
});
