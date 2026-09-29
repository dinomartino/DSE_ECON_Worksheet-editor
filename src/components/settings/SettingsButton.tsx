'use client';

import { IconButton } from '@/components/ui';
import { SettingsIcon } from '@/components/ui/icons';
import { isDesktop } from '@/platform';
import { useSettingsSections } from '@/settings/sections';
import { useAppDialogs } from '@/store/appDialogs';
import { isMacPlatform } from './shortcut';

/**
 * App-wide Settings, as the gear at the far right of each screen's top row. One component
 * on every screen; absent (divider too) while no section is registered. `separated` sets
 * it apart from the row's own tools with a thin rule; `className` lands on the outermost
 * element, so a responsive `hidden` hides the rule with the gear.
 */
export function SettingsButton({
  size = 'sm',
  separated = false,
  className = '',
}: {
  size?: 'sm' | 'md';
  separated?: boolean;
  className?: string;
}) {
  const desktop = isDesktop();
  const sections = useSettingsSections({ desktop });
  if (sections.length === 0) return null;
  // The shortcut is named on desktop only, as in the ⋯ menu: a browser may claim it first.
  const hint = desktop ? (isMacPlatform() ? ' (⌘,)' : ' (Ctrl+,)') : '';
  const gear = (
    <IconButton
      label="Settings"
      title={`Settings${hint}`}
      size={size}
      className={separated ? '' : className}
      data-settings-gear
      onClick={() => useAppDialogs.getState().openSettings()}
    >
      <SettingsIcon size={16} />
    </IconButton>
  );
  if (!separated) return gear;
  return (
    <span className={`flex shrink-0 items-center ${className}`}>
      <span aria-hidden className={`${size === 'md' ? 'mr-2 h-6' : 'mr-1.5 h-4'} w-px bg-line`} />
      {gear}
    </span>
  );
}
