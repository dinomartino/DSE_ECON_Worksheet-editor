'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { IconButton } from './index';
import { MoreIcon } from './icons';

/**
 * A small overflow menu.
 *
 * It exists so that a question row can offer duplicate / copy / move / delete
 * without spending its width on five look-alike buttons — the row keeps the two
 * actions that are used constantly and hides the rest behind one trigger.
 *
 * Closes on outside click and on Escape, and restores focus to the trigger.
 */

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Renders a divider above this item. */
  separated?: boolean;
  /** Optional leading icon. A menu of eight insertable things is much faster to scan
      by shape than by reading eight similar noun phrases. */
  icon?: ReactNode;
  /** Optional trailing hint, e.g. a keyboard shortcut or a size. */
  hint?: string;
}

export function Menu({
  items,
  label = 'More actions',
  align = 'right',
  trigger,
}: {
  items: MenuItem[];
  label?: string;
  align?: 'left' | 'right';
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <IconButton
        ref={triggerRef}
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        // A custom trigger is usually a word, not a glyph, so it needs real width —
        // IconButton is square by default and would clip it.
        className={`${trigger ? 'w-auto px-2.5' : ''} ${open ? 'bg-surface-hover text-ink' : ''}`}
      >
        {trigger ?? <MoreIcon />}
      </IconButton>

      {open && (
        <div
          id={id}
          role="menu"
          className={`absolute z-30 mt-1.5 min-w-[13rem] overflow-hidden rounded-xl border border-line bg-surface-raised p-1 shadow-xl ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {items.map((item, index) => (
            <div key={item.label}>
              {item.separated && index > 0 && <div className="my-1 h-px bg-line" />}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors duration-150 disabled:opacity-40 ${
                  item.danger
                    ? 'text-danger hover:bg-danger-soft'
                    : 'text-ink hover:bg-surface-hover'
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.icon && (
                  <span className={item.danger ? 'text-danger' : 'text-ink-subtle'}>
                    {item.icon}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.hint && (
                  <span className="shrink-0 text-[11px] tabular-nums text-ink-subtle">
                    {item.hint}
                  </span>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
