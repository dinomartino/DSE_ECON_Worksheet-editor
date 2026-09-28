'use client';

import { useSyncExternalStore } from 'react';
import { openAi, useAiMenu } from '@/assist/menuStore';
import { useUntranslatedCount } from '@/components/editor/useUntranslatedCount';
import { isMacPlatform } from '@/components/settings/shortcut';
import { SparkleIcon } from '@/components/ui/icons';
import { useWorksheetStore } from '@/store/worksheetStore';
import { AI_MENU_WIDTH } from './AiMenu';

const noSubscribe = () => () => {};

/** "AI tools (⌘J)", or Ctrl+J off a Mac; the server render says Ctrl+J until hydrated. */
export function useAiShortcutHint(): string {
  const mac = useSyncExternalStore(noSubscribe, isMacPlatform, () => false);
  return mac ? '⌘J' : 'Ctrl+J';
}

/**
 * The toolbar's door to every AI tool: "✦ AI", with the untranslated count as a quiet
 * badge. A secondary button (the accent marks the sparkle only; the CTA stays Export).
 * Absent in a read-only document.
 */
export function AiButton() {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const mode = useWorksheetStore((s) => s.mode);
  const readOnly = useWorksheetStore((s) => s.readOnly);
  const untranslated = useUntranslatedCount(worksheet, mode);
  const hint = useAiShortcutHint();
  if (readOnly) return null;

  const title = `AI tools (${hint})${untranslated > 0 ? ` · ${untranslated} untranslated` : ''}`;
  return (
    <button
      type="button"
      title={title}
      aria-label={untranslated > 0 ? `AI tools, ${untranslated} untranslated` : 'AI tools'}
      aria-haspopup="dialog"
      data-ai-door
      onClick={(event) => {
        if (useAiMenu.getState().open) return useAiMenu.getState().close();
        const box = event.currentTarget.getBoundingClientRect();
        openAi({ anchor: { x: box.right - AI_MENU_WIDTH, y: box.bottom + 6 } });
      }}
      className="inline-flex h-[34px] shrink-0 cursor-pointer select-none items-center gap-1 rounded-lg border border-line bg-surface px-2 text-[13px] font-medium text-ink transition-[background-color,border-color,scale] duration-150 ease-out-soft hover:border-line-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.97]"
    >
      <SparkleIcon size={15} className="text-accent" />
      <span>AI</span>
      {untranslated > 0 && (
        <span className="ml-0.5 rounded-md bg-surface-hover px-1 py-px text-[10px] font-semibold tabular-nums text-ink-muted">
          {untranslated}
        </span>
      )}
    </button>
  );
}
