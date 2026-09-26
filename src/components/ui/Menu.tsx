'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './index';
import { MoreIcon } from './icons';

/**
 * A small overflow menu.
 *
 * It exists so that a question row can offer duplicate / copy / move / delete
 * without spending its width on five look-alike buttons — the row keeps the two
 * actions that are used constantly and hides the rest behind one trigger.
 *
 * The popup renders in a portal, fixed-positioned from the trigger — every
 * trigger sits inside some overflow container (the file list clips to its
 * rounded corners, the outline scrolls) and an absolutely positioned child is
 * cut off at that container's edge.
 *
 * Closes on outside click, Escape, scroll and resize, and restores focus to
 * the trigger.
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
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    // Fixed positioning is measured once — scrolling under an open menu would
    // leave it floating detached from its trigger.
    const onMove = () => setOpen(false);

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  // Positioned imperatively: the popup mounts hidden, is measured, and placed
  // before paint — state here would render twice per open for no reader.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current?.getBoundingClientRect();
    const popup = menuRef.current;
    if (!trigger || !popup) return;

    // Layout size, not `getBoundingClientRect`: the pop-in's first frame is scaled, and
    // a scaled measurement would park a right-aligned menu off its trigger's edge.
    const menu = { width: popup.offsetWidth, height: popup.offsetHeight };
    let left = align === 'right' ? trigger.right - menu.width : trigger.left;
    left = Math.max(8, Math.min(left, window.innerWidth - menu.width - 8));
    let top = trigger.bottom + 6;
    const above = top + menu.height > window.innerHeight - 8;
    if (above) top = Math.max(8, trigger.top - 6 - menu.height);
    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;
    // Grow out of the trigger: from its side, and upward when flipped above it.
    popup.style.transformOrigin = `${align === 'right' ? 'right' : 'left'} ${above ? 'bottom' : 'top'}`;
    popup.style.setProperty('--pop-from-y', above ? '2px' : '-2px');
    popup.style.visibility = 'visible';
  }, [open, align, items]);

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

      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={id}
            role="menu"
            className="fixed z-30 min-w-[13rem] animate-pop-in overflow-hidden rounded-xl border border-line bg-surface-raised p-1 shadow-xl"
            style={{ top: 0, left: 0, visibility: 'hidden' }}
          >
            {items.map((item, index) => (
              <div key={item.label}>
                {item.separated && index > 0 && <div className="my-1 h-px bg-line" />}
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors duration-100 ease-out-soft disabled:opacity-40 ${
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
          </div>,
          document.body,
        )}
    </div>
  );
}
