'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useModalLayer } from '@/components/ui/modalLayer';

/**
 * The page's right-click menu — the Word reflex gesture (§ the paper owns the words,
 * phase 3). One flat surface of labelled groups rather than submenus: at this size a
 * second fly-out costs more pointer travel than the extra rows it hides.
 *
 * Claims the modal layer while open, so Delete and the page's other window-level
 * shortcuts stand down behind it; every keydown listener fires (§ modalLayer), and
 * standing down is the only way to yield the key.
 */

import type { EditTarget } from '@/render/ir';

/** What was right-clicked — resolved by the render site, never by walking the DOM. */
export type PageMenuPayload =
  | { kind: 'text'; target: EditTarget }
  | { kind: 'cell'; blockId: string; cellId: string }
  | { kind: 'block'; blockId: string };

export interface PageMenuItem {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export interface PageMenuGroup {
  /** Uppercase eyebrow naming the group, e.g. "Insert below". Omit for bare verbs. */
  label?: string;
  items: PageMenuItem[];
}

export function PageContextMenu({
  at,
  groups,
  onClose,
}: {
  at: { x: number; y: number };
  groups: PageMenuGroup[];
  onClose: () => void;
}) {
  useModalLayer();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);

  // Clamp into the viewport after the first paint has measured the menu — a
  // right-click near the bottom edge must open upward-ish, not off the screen.
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setPos({
      x: Math.max(8, Math.min(at.x, window.innerWidth - box.width - 8)),
      y: Math.max(8, Math.min(at.y, window.innerHeight - box.height - 8)),
    });
  }, [at]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    // Scrolling under an open menu strands it over the wrong spot — dismiss, like
    // the ui Menu repositions and native menus close.
    const onScroll = () => onClose();
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Page actions"
      className="fixed z-[70] min-w-[13rem] overflow-hidden rounded-xl border border-line bg-surface-raised p-1 shadow-2xl"
      style={{ left: pos.x, top: pos.y }}
      // A second right-click on the menu itself must not open the browser's own.
      onContextMenu={(event) => event.preventDefault()}
    >
      {groups.map((group, groupIndex) => (
        <div key={groupIndex}>
          {groupIndex > 0 && <div className="my-1 h-px bg-line" />}
          {group.label && (
            <div className="px-2.5 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
              {group.label}
            </div>
          )}
          {group.items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors duration-150 disabled:opacity-40 ${
                item.danger
                  ? 'text-danger hover:bg-danger-soft'
                  : 'text-ink hover:bg-surface-hover'
              }`}
              onClick={() => {
                onClose();
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
