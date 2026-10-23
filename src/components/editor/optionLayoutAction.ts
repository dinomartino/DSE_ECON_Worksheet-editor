import type { Messages } from '@/i18n/catalogue';
import { planOptionLayouts, withOptionLayouts, type OptionLayoutChoice } from '@/registry/mcqLayouts';
import type { NoticeInput } from '@/store/notices';
import { useWorksheetStore } from '@/store/worksheetStore';
import type { DOCUMENT_SETTINGS_MESSAGES } from './DocumentSettings.messages';

/** One id, so a second click replaces the first notice instead of stacking under it. */
const NOTICE_ID = 'option-layout-all';

/**
 * Setup → Option layout for all MC questions: set every MC question to `choice` in one
 * commit (one ⌘Z), then say how many changed with an Undo.
 *
 * The Undo belongs to its commit: it works only while that commit is still the latest, so a
 * later edit or ⌘Z retires it rather than undo something unrelated. It fades after a few
 * seconds (⌘Z stays), so it never lingers over the dialog.
 *
 * Returns how many questions changed; 0 when it did nothing (nothing to change, or the
 * paper is read-only).
 */
export function applyOptionLayout(
  choice: OptionLayoutChoice,
  m: Messages<typeof DOCUMENT_SETTINGS_MESSAGES>,
  notify: (input: NoticeInput) => unknown,
): number {
  const store = useWorksheetStore.getState();
  if (store.readOnly) return 0;
  const language = store.mode.language;
  const { changes, total, skipped } = planOptionLayouts(store.worksheet, choice, language);
  const details = skipped > 0 ? [m.optionLayoutFiguresStay(skipped)] : undefined;

  if (changes === 0) {
    notify({
      id: NOTICE_ID,
      tone: 'info',
      body: choice === 'fit' ? m.optionLayoutNothingFit : m.optionLayoutNothing,
      ...(details ? { details } : {}),
    });
    return 0;
  }

  store.commit((draft) => withOptionLayouts(draft, choice, language));
  const committed = useWorksheetStore.getState().worksheet;
  const live = () => useWorksheetStore.getState().worksheet === committed;
  notify({
    id: NOTICE_ID,
    tone: 'success',
    body: m.optionLayoutChanged(changes, total),
    ...(details ? { details } : {}),
    autoHide: true,
    actions: [
      {
        label: m.optionLayoutUndo,
        live,
        run: () => {
          if (live()) useWorksheetStore.getState().undo();
        },
      },
    ],
  });
  return changes;
}
