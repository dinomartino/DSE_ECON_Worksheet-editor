import { registerSettingsSection } from '@/settings/sections';
import { SECTION_MESSAGES as m } from './messages';

/** Settings → Storage location 儲存位置: the sync folder. Desktop only; the pane loads on demand. */
registerSettingsSection({
  id: 'storage',
  label: m.storageLabel,
  hint: m.storageHint,
  description: m.storageDescription,
  order: 40,
  available: (env) => env.desktop,
  load: () => import('./storageSection/StorageSection'),
});
