import { registerSettingsSection } from '@/settings/sections';

/** Settings → AI & translation. Metadata only; the pane loads when the section is shown. */
registerSettingsSection({
  id: 'ai',
  label: 'AI & translation',
  hint: 'Provider, key, model',
  description: 'Translate with your own key, and check terms against the EDB glossary.',
  order: 10,
  load: () => import('./aiSection/AiSection'),
});
