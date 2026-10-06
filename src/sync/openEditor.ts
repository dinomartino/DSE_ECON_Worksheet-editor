import { resolveMessages } from '@/i18n/catalogue';
import { uiLanguage } from '@/i18n/language';
import type { StoreChangeListener } from '@/storage/changes';
import { notify } from '@/store/notices';
import { useWorksheetStore } from '@/store/worksheetStore';
import { SYNC_MESSAGES } from './messages';
import type { SyncReport } from './run';

/**
 * Sync never writes under the open editor (`docs/design/sync-engine.md` § The scheduler):
 *
 * - **Unsaved edits** (`dirty`, which stays set until the write that clears it lands): the
 *   engine holds that document (`isBusy`). Its next save makes it edited here, and a run that
 *   then finds it changed on the other computer too keeps both.
 * - **Clean**: the engine may download over it. The editor takes the download in the moment it
 *   is announced (`origin: 'sync'`), before an edit can be made from the old version, and says
 *   so once the run ends: "updated", or "kept both" when its own version became a copy.
 */
export interface OpenEditorGuard {
  isBusy(id: string): boolean;
  onStoreChange: StoreChangeListener;
  onReport(report: SyncReport): void;
}

export function openEditorGuard(isEditorOpen: () => boolean): OpenEditorGuard {
  const reloaded = new Set<string>();
  return {
    isBusy(id) {
      if (!isEditorOpen()) return false;
      const { worksheet, dirty } = useWorksheetStore.getState();
      return worksheet.id === id && dirty;
    },
    onStoreChange(change, saved) {
      if (change.origin !== 'sync' || !saved || !isEditorOpen()) return;
      const { worksheet, dirty, replaceWorksheet } = useWorksheetStore.getState();
      // Dirty here only when an edit arrived during the write: the engine holds it (`touch`).
      if (worksheet.id !== saved.id || dirty) return;
      replaceWorksheet(saved);
      reloaded.add(saved.id);
    },
    onReport(report) {
      if (reloaded.size === 0) return;
      const m = resolveMessages(SYNC_MESSAGES, uiLanguage());
      for (const id of reloaded) {
        const kept = report.conflicts.find((conflict) => conflict.id === id);
        if (kept) notify({ id: `sync-kept-both:${id}`, tone: 'warning', body: m.keptBoth(kept.name) });
        else notify({ id: `sync-updated:${id}`, tone: 'info', body: m.reloaded });
      }
      reloaded.clear();
    },
  };
}
