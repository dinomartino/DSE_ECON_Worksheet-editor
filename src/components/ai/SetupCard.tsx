'use client';
// Contract-step stub; the setup agent owns and fills this file.

import { useAiMenu } from '@/assist/menuStore';
import { Button } from '@/components/ui';
import { useAppDialogs } from '@/store/appDialogs';

/** Shown in the AI menu when a verb needs a provider and none is configured. */
export function SetupCard() {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-ink-muted">
      <span className="flex-1">Set up AI in Settings</span>
      <Button
        size="sm"
        onClick={() => {
          useAiMenu.getState().close();
          useAppDialogs.getState().openSettings({ section: 'ai' });
        }}
      >
        Set up
      </Button>
    </div>
  );
}
