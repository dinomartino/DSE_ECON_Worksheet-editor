'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo } from 'react';
import { isModalLayerOpen } from '@/components/ui/modalLayer';
import { isDesktop } from '@/platform';
import { useSettingsSections } from '@/settings/sections';
import { useAppDialogs } from '@/store/appDialogs';
import { isEditableFocused, isMacPlatform, shouldOpenSettings } from './shortcut';
// The registry's one eager importer: every section's metadata is registered before any
// entry point renders. Panes stay lazy.
import './sections';

const AppSettingsDialog = dynamic(() => import('./AppSettingsDialog').then((m) => m.AppSettingsDialog), {
  ssr: false,
});

export const RESUME_TRANSLATE = { label: 'Continue to Translate' } as const;

/**
 * Mounted once in `EditorHost`, so Settings works from the start screen and the editor.
 * Mounts every section's `Effect`, owns the one ⌘, / Ctrl+, listener, and shows the dialog
 * while `useAppDialogs` holds a settings request. With no section registered it renders
 * nothing and the shortcut is inert.
 */
export function AppSettingsHost() {
  const env = useMemo(() => ({ desktop: isDesktop() }), []);
  const sections = useSettingsSections(env);
  const open = useAppDialogs((s) => s.open);
  const close = useAppDialogs((s) => s.close);
  const count = sections.length;

  useEffect(() => {
    if (count === 0) return;
    const mac = isMacPlatform();
    const onKeyDown = (event: KeyboardEvent) => {
      const ctx = { mac, modalOpen: isModalLayerOpen(), editableFocused: isEditableFocused(), sections: count };
      if (!shouldOpenSettings(event, ctx)) return;
      event.preventDefault();
      useAppDialogs.getState().openSettings();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [count]);

  if (count === 0) return null;
  return (
    <>
      {sections.map(({ id, Effect }) => (Effect ? <Effect key={id} env={env} /> : null))}
      {open?.kind === 'settings' && (
        <AppSettingsDialog
          sections={sections}
          env={env}
          request={open.request}
          resume={open.returnTo ? RESUME_TRANSLATE : undefined}
          onClose={close}
        />
      )}
    </>
  );
}
