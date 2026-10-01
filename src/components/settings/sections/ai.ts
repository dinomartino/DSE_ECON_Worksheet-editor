import { registerSettingsSection } from '@/settings/sections';
import { SECTION_MESSAGES as m } from './messages';

/** Settings → AI & translation. Metadata only; the pane loads when the section is shown. */
registerSettingsSection({
  id: 'ai',
  label: m.aiLabel,
  hint: m.aiHint,
  description: m.aiDescription,
  order: 10,
  load: () => import('./aiSection/AiSection'),
});
