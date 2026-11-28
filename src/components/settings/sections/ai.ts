import { OWN_KEY_AI_ENABLED } from '@/ai/launch';
import { studioTrialOn } from '@/questionStudio/trial';
import { registerSettingsSection } from '@/settings/sections';
import { SECTION_MESSAGES as m } from './messages';

/** Settings → AI & translation. Metadata only; the pane loads when the section is shown. */
registerSettingsSection({
  id: 'ai',
  label: m.aiLabel,
  hint: m.aiHint,
  description: m.aiDescription,
  order: 10,
  // Hidden with the own-key AI (ai/launch.ts); the studio signs in here, so it keeps the door.
  available: () => OWN_KEY_AI_ENABLED || studioTrialOn(),
  load: () => import('./aiSection/AiSection'),
});
