import { registerSettingsSection } from '@/settings/sections';
import { pastPapersBuiltIn } from '@/pastpapers/config';
import { PAST_PAPER_SETTINGS_MESSAGES as m } from '@/components/pastpapers/messages';

/** Settings → Past paper bank (k-0443): Built-in, Off, or another source. Absent when this build has no built-in source. */
registerSettingsSection({
  id: 'pastPapers',
  label: m.label,
  hint: m.hint,
  description: m.description,
  order: 38,
  available: () => pastPapersBuiltIn(),
  load: () => import('./pastPapersSection/PastPapersSection'),
});
