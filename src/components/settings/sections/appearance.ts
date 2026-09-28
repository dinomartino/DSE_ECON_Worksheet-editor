import { registerSettingsSection } from '@/settings/sections';
import { AppearanceEffect } from './appearanceSection/AppearanceEffect';

/** Settings → Appearance. The Effect applies the scheme app-wide; the pane loads on demand. */
registerSettingsSection({
  id: 'appearance',
  label: 'Appearance',
  hint: 'Light, dark or system',
  description: 'The colour scheme around the page. Worksheets always print black on white.',
  order: 20,
  load: () => import('./appearanceSection/AppearanceSection'),
  Effect: AppearanceEffect,
});
