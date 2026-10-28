import { registerSettingsSection } from '@/settings/sections';
import { WATERMARK_MESSAGES as m } from '@/components/watermark/watermark.messages';

/** Settings → Watermarks (k-0242): the saved school logos and text, for every paper. */
registerSettingsSection({
  id: 'watermarks',
  label: m.sectionLabel,
  hint: m.sectionHint,
  description: m.sectionDescription,
  order: 35,
  load: () => import('@/components/watermark/WatermarksSection'),
});
