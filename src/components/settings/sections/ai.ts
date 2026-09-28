import { registerSettingsSection } from '@/settings/sections';

/** Settings → AI & translation. Metadata only; the pane loads when the section is shown. */
registerSettingsSection({
  id: 'ai',
  label: 'AI & translation',
  hint: 'Provider, key, model',
  description: 'Fill the missing language of a worksheet using your own key.',
  order: 10,
  load: () => import('./aiSection/AiSection'),
});
