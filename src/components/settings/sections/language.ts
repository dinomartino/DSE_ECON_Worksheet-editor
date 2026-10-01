import { registerSettingsSection } from '@/settings/sections';
import { LanguageEffect } from './languageSection/LanguageEffect';
import { SECTION_MESSAGES as m } from './messages';

/** Settings → Language 語言. The Effect keeps `<html lang>` in step; the pane loads on demand. */
registerSettingsSection({
  id: 'language',
  label: m.languageLabel,
  hint: m.languageHint,
  description: m.languageDescription,
  order: 30,
  load: () => import('./languageSection/LanguageSection'),
  Effect: LanguageEffect,
});
