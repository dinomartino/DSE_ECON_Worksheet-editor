import { resolveMessages } from '@/i18n/catalogue';
import { uiLanguage } from '@/i18n/language';
import { adoptNewerTags } from '@/library/tagWrites';
import type { Worksheet } from '@/model/types';
import { notify } from '@/store/notices';
import { useWorksheetStore } from '@/store/worksheetStore';
import { SAVED_ELSEWHERE_MESSAGES } from './savedElsewhere.messages';

export const SAVED_ELSEWHERE_NOTICE = 'saved-elsewhere';

/**
 * Another tab saved the open document (a 題庫 ✦ Fill, a tag edit). With nothing unsaved
 * here, the newer copy is taken in whole, so this tab's next autosave cannot put the
 * older one back. With unsaved edits, only the newer tags come in and a warning offers
 * Reload, which drops this tab's edits for the saved copy.
 */
export function takeSavedElsewhere(
  saved: Worksheet,
  load: (id: string) => Promise<Worksheet | undefined>,
): 'whole' | 'tags' | 'other' {
  const store = useWorksheetStore.getState();
  if (saved.id !== store.worksheet.id) return 'other';
  if (store.adoptSavedDocument(saved)) return 'whole';
  store.adoptSavedElsewhere((doc) => adoptNewerTags(doc, saved));
  if (store.readOnly) return 'tags';
  const m = resolveMessages(SAVED_ELSEWHERE_MESSAGES, uiLanguage());
  notify({
    id: SAVED_ELSEWHERE_NOTICE,
    tone: 'warning',
    title: m.title,
    body: m.body,
    actions: [
      {
        label: m.reload,
        primary: true,
        run: () => {
          void load(saved.id).then((latest) => {
            const now = useWorksheetStore.getState();
            // Another document opened meanwhile: the reload has nothing to replace.
            if (now.worksheet.id !== saved.id) return;
            now.replaceWorksheet(latest ?? saved);
          });
        },
      },
    ],
  });
  return 'tags';
}
