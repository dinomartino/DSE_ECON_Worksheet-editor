import { registerSettingsSection } from '@/settings/sections';
import { SECTION_MESSAGES as m } from './messages';

/** Settings → Translation terms 翻譯用語. Metadata only; the pane (and the glossary) load when shown. */
registerSettingsSection({
  id: 'terms',
  label: m.termsLabel,
  hint: m.termsHint,
  description: m.termsDescription,
  order: 15,
  load: () => import('./termsSection/TermsSection'),
});
