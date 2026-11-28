'use client';

import { OWN_KEY_AI_ENABLED } from '@/ai/launch';
import { useEffect } from 'react';
import { openAi } from '@/assist/menuStore';
import { isModalLayerOpen } from '@/components/ui/modalLayer';
import { isEditableFocused, isMacPlatform } from '@/components/settings/shortcut';
import { useWorksheetStore } from '@/store/worksheetStore';
import { AiBar } from './AiBar';
import { AiMenu } from './AiMenu';
import { shouldOpenAi } from './shortcut';
// Every verb registers itself on import.
import '@/assist/verbs';

/** Mounted once in `EditorApp`: the AI menu, the run bar, and the one ⌘J / Ctrl+J listener. */
export function AiHost() {
  useEffect(() => {
    if (!OWN_KEY_AI_ENABLED) return;
    const mac = isMacPlatform();
    const onKeyDown = (event: KeyboardEvent) => {
      const ctx = {
        mac,
        modalOpen: isModalLayerOpen(),
        editableFocused: isEditableFocused(),
        readOnly: useWorksheetStore.getState().readOnly,
      };
      if (!shouldOpenAi(event, ctx)) return;
      event.preventDefault();
      openAi();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!OWN_KEY_AI_ENABLED) return null;
  return (
    <>
      <AiMenu />
      <AiBar />
    </>
  );
}
