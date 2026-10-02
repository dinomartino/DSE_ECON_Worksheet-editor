import { resolveMessages } from '@/i18n/catalogue';
import { uiLanguage } from '@/i18n/language';
import type { UiLanguage } from '@/settings/language';
import type { RestoreReport } from '@/storage/backup';
import type { GraphRestoreReport } from '@/storage/graphs';
import { RESTORE_MESSAGES } from './screen.messages';

/** The sentence shown after a restore, in the interface language (English matches `restoreSummary`). */
export function restoreNotice(
  report: RestoreReport,
  unreadable: number,
  graphs?: GraphRestoreReport,
  lang: UiLanguage = uiLanguage(),
  /** Translation terms rows merged into Settings. */
  terms = 0,
): string {
  const m = resolveMessages(RESTORE_MESSAGES, lang);
  const parts: string[] = [];
  const restored = report.restored.length + report.copied.length;
  if (restored > 0) parts.push(report.copied.length > 0 ? m.restoredWithCopies(restored, report.copied.length) : m.restored(restored));
  if (report.skipped.length > 0) parts.push(m.skipped(report.skipped.length));
  if (unreadable > 0) parts.push(m.unreadable(unreadable));
  if (report.failed.length > 0) parts.push(m.failed(report.failed.length));
  if (graphs) {
    const back = graphs.restored + graphs.copied;
    if (back > 0) parts.push(m.graphsRestored(back));
    if (graphs.skipped > 0) parts.push(m.graphsHere(graphs.skipped));
    if (graphs.failed > 0) parts.push(m.graphsFailed(graphs.failed));
  }
  if (terms > 0) parts.push(m.termsRestored(terms));
  if (parts.length === 0) return m.empty;
  const sentence = parts.join(' · ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
