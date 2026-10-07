import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetNoticesForTest, useNoticeStore } from '@/store/notices';
import type { SyncReport } from './run';
import { syncNotices } from './syncNotices';

const notices = () => useNoticeStore.getState().notices;

function report(extra: Partial<SyncReport> = {}): SyncReport {
  return {
    status: 'ok',
    remoteWasEmpty: false,
    counts: {} as SyncReport['counts'],
    conflicts: [],
    held: [],
    errors: [],
    ...extra,
  };
}

beforeEach(() => resetNoticesForTest());

describe('syncNotices', () => {
  it('an unreachable folder warns once per outage, with a plain reason, and the first good run clears it', () => {
    const n = syncNotices();
    n.onStatus({ state: 'unavailable', reason: 'root-missing' });
    n.onStatus({ state: 'running' });
    n.onStatus({ state: 'unavailable', reason: 'root-missing' });
    expect(notices()).toHaveLength(1);
    expect(notices()[0]).toMatchObject({
      id: 'sync-unreachable',
      tone: 'warning',
      body: "Can't reach the storage folder. Your edits are kept on this computer and will be saved there when it is back.",
      details: ['The folder is not there. Your cloud drive may be signed out or still starting.'],
    });
    // A scheduler's first idle (nothing run yet) is not "back".
    n.onStatus({ state: 'idle' });
    expect(notices()).toHaveLength(1);
    n.onStatus({ state: 'idle', lastReport: report(), lastSyncedAt: 1 });
    expect(notices()).toHaveLength(0);
    n.onStatus({ state: 'unavailable', reason: 'error' });
    expect(notices()[0].details).toEqual(['Something went wrong while syncing. It will try again.']);
    n.reset();
    expect(notices()).toHaveLength(0);
  });

  it('conflict copies: one is named in the body; several are listed; Review opens the list', () => {
    const review = vi.fn();
    const n = syncNotices(review);
    const one = report({ conflicts: [{ id: 'a', copyId: 'a2', name: 'Mock (Home Mac, 5 Oct 14:32)' }] });
    n.onReport(one, ['Mock (Home Mac, 5 Oct 14:32)']);
    expect(notices()[0]).toMatchObject({
      id: 'sync-conflicts',
      tone: 'warning',
      body: 'A worksheet was changed on both computers. Both versions are kept; the copy is named “Mock (Home Mac, 5 Oct 14:32)”.',
    });
    n.onReport(report({ conflicts: [{ id: 'b', copyId: 'b2', name: 'Quiz (Home Mac)' }] }), ['Mock (Home Mac, 5 Oct 14:32)', 'Quiz (Home Mac)']);
    expect(notices()).toHaveLength(1);
    expect(notices()[0].body).toMatch(/^2 worksheets were changed on both computers/);
    expect(notices()[0].details).toEqual(['Mock (Home Mac, 5 Oct 14:32)', 'Quiz (Home Mac)']);
    notices()[0].actions![0].run();
    expect(review).toHaveBeenCalled();
    // A run with no new copies says nothing more.
    n.onReport(report(), ['Mock (Home Mac, 5 Oct 14:32)', 'Quiz (Home Mac)']);
    expect(notices()).toHaveLength(1);
  });

  it('an emptied cloud copy refilled from this computer is said once, as info', () => {
    const n = syncNotices();
    n.onReport(report({ remoteWasEmpty: true }), []);
    n.onReport(report({ remoteWasEmpty: true }), []);
    expect(notices()).toEqual([
      expect.objectContaining({ id: 'sync-refilled', tone: 'info', body: 'The cloud copy was empty, so it was refilled from this computer.' }),
    ]);
  });
});
