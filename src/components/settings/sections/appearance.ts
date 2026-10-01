import { registerSettingsSection } from '@/settings/sections';
import { AppearanceEffect } from './appearanceSection/AppearanceEffect';
import { SECTION_MESSAGES as m } from './messages';

/** Settings → Appearance. The Effect applies the scheme app-wide; the pane loads on demand. */
registerSettingsSection({
  id: 'appearance',
  label: m.appearanceLabel,
  hint: m.appearanceHint,
  description: m.appearanceDescription,
  order: 20,
  load: () => import('./appearanceSection/AppearanceSection'),
  Effect: AppearanceEffect,
});
