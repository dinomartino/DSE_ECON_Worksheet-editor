'use client';

import { useMessages } from '@/i18n/language';
import type { AiStatus } from '@/settings/aiSettings';
import { AI_UI_MESSAGES } from './messages';

/** The AI menu's last line: which provider and model a run would use, and Settings. */
export function ProviderFooter({ status, onSettings }: { status: AiStatus; onSettings(): void }) {
  const m = useMessages(AI_UI_MESSAGES);
  const model = status.preset.models.find((m) => m.id === status.model)?.label ?? status.model;
  return (
    <div className="flex items-center gap-1.5 border-t border-line px-3 py-2 text-[11px] text-ink-muted">
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${status.configured ? 'bg-ok' : 'bg-line-strong'}`} />
      <span className="min-w-0 flex-1 truncate">
        {status.preset.label}
        {status.configured ? (model ? ` · ${model}` : '') : m.notSetUp}
      </span>
      <button
        type="button"
        onClick={onSettings}
        className="shrink-0 cursor-pointer font-medium text-accent-ink underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
      >
        {m.settings}
      </button>
    </div>
  );
}
