'use client';
// Minimal contract-step menu; the door agent owns and fills this file.

import { useEffect, useMemo, useRef } from 'react';
import { useAiMenu, type AiMenuOpen } from '@/assist/menuStore';
import { verbs } from '@/assist/registry';
import { useAiRun } from '@/assist/runStore';
import type { VerbContext } from '@/assist/types';
import { useModalLayer } from '@/components/ui/modalLayer';
import { useAiStatus } from '@/settings/aiSettings';
import { useWorksheetStore } from '@/store/worksheetStore';
import { SetupCard } from './SetupCard';

/** The one AI door: every verb offered for the menu's scope. */
export function AiMenu() {
  const open = useAiMenu((s) => s.open);
  return open ? <AiMenuPopover open={open} /> : null;
}

function AiMenuPopover({ open }: { open: AiMenuOpen }) {
  useModalLayer();
  const ref = useRef<HTMLDivElement>(null);
  const close = useAiMenu((s) => s.close);
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const mode = useWorksheetStore((s) => s.mode);
  const status = useAiStatus();

  const ctx: VerbContext = useMemo(
    () => ({ worksheet, mode, scope: open.scope, scopeLabel: open.scopeLabel }),
    [worksheet, mode, open.scope, open.scopeLabel],
  );
  const rows = useMemo(
    () => verbs().flatMap((verb) => {
      const availability = verb.available(ctx);
      return availability ? [{ verb, availability }] : [];
    }),
    [ctx],
  );
  const needsSetup = !status.configured && rows.some((row) => row.verb.needsKey);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [close]);

  const at = open.anchor ?? { x: window.innerWidth - 336, y: 56 };
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="AI"
      data-print-hide
      className="fixed z-[70] w-80 animate-pop-in overflow-hidden rounded-xl border border-line bg-surface-raised p-1 shadow-2xl"
      style={{ left: Math.max(8, at.x), top: Math.max(8, at.y) }}
    >
      <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
        {open.scopeLabel}
      </div>
      {needsSetup && <SetupCard />}
      {rows.length === 0 && <div className="px-2.5 py-1.5 text-[13px] text-ink-muted">Nothing to do here yet</div>}
      {rows.map(({ verb, availability }) => (
        <button
          key={verb.id}
          type="button"
          role="menuitem"
          disabled={availability.disabledReason !== undefined || (verb.needsKey && !status.configured)}
          title={availability.disabledReason}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-ink transition-[background-color,color,opacity] duration-150 ease-out-soft hover:bg-surface-hover disabled:opacity-40"
          onClick={() => void useAiRun.getState().startVerb(verb.id)}
        >
          <span className="flex-1">{verb.label(ctx)}</span>
          {availability.count !== undefined && (
            <span className="text-xs text-ink-subtle">
              {availability.count}
              {availability.unit ? ` ${availability.unit}` : ''}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
