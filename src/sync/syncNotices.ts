import { resolveMessages, type Messages } from '@/i18n/catalogue';
import { uiLanguage } from '@/i18n/language';
import { useAppDialogs } from '@/store/appDialogs';
import { dismiss, notify } from '@/store/notices';
import { SYNC_MESSAGES } from './messages';
import type { SyncReport } from './run';
import type { SyncStatus } from './scheduler';

/**
 * Sync's notices (`library-folder.md` § 1.4), each under a stable id so a later one replaces it:
 * conflict copies made (warning, every copy of the session listed), an empty remote refilled
 * (info), and the folder unreachable: one warning per outage, never one per backoff, taken
 * down by the first good run. A missing folder at launch is that same warning, not a screen.
 */

export const NOTICE_IDS = { conflicts: 'sync-conflicts', refilled: 'sync-refilled', unreachable: 'sync-unreachable' } as const;

type SyncMessages = Messages<typeof SYNC_MESSAGES>;

/** A plain reason for an unusable folder or a failed run. */
export function reasonText(m: SyncMessages, reason: string | undefined): string {
  switch (reason) {
    case 'root-missing':
    case 'no-location':
      return m.reasonRootMissing;
    case 'not-a-folder':
      return m.reasonNotAFolder;
    case 'no-marker':
      return m.reasonNoMarker;
    case 'newer-format':
      return m.reasonNewerFormat;
    case 'io':
      return m.reasonIo;
    default:
      return m.reasonError;
  }
}

export interface SyncNotices {
  onStatus(status: SyncStatus): void;
  /** `copies`: every conflict copy's name made this session, newest last. */
  onReport(report: SyncReport, copies: readonly string[]): void;
  /** Syncing stopped on purpose (stop, a new folder, Clear): no outage to report. */
  reset(): void;
}

export function syncNotices(openReview: () => void = () => useAppDialogs.getState().openSettings({ section: 'storage' })): SyncNotices {
  let outage = false;
  const m = () => resolveMessages(SYNC_MESSAGES, uiLanguage());
  return {
    onStatus(status) {
      if (status.state === 'unavailable') {
        if (outage) return;
        outage = true;
        const text = m();
        notify({ id: NOTICE_IDS.unreachable, tone: 'warning', body: text.unreachable, details: [reasonText(text, status.reason)] });
      } else if (status.state === 'idle' && status.lastReport?.status === 'ok' && outage) {
        outage = false;
        dismiss(NOTICE_IDS.unreachable);
      }
    },
    onReport(report, copies) {
      const text = m();
      if (report.remoteWasEmpty) notify({ id: NOTICE_IDS.refilled, tone: 'info', body: text.refilled });
      if (report.conflicts.length > 0 && copies.length > 0) {
        notify({
          id: NOTICE_IDS.conflicts,
          tone: 'warning',
          body: text.conflicts(copies.length, copies[copies.length - 1]),
          ...(copies.length > 1 ? { details: copies } : {}),
          actions: [{ label: text.review, run: openReview }],
        });
      }
    },
    reset() {
      outage = false;
      dismiss(NOTICE_IDS.unreachable);
    },
  };
}
