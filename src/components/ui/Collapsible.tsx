'use client';

import { useState, type ReactNode } from 'react';
import { Eyebrow } from './index';
import { ChevronRightIcon } from './icons';

/**
 * A disclosure section.
 *
 * The old sidebar pinned worksheet-level fields (title, instructions, section
 * headings) permanently above the question list, where they consumed a third of the
 * panel despite being edited about once per worksheet. Wrapping them here gives that
 * space back to the work that is actually repetitive.
 */
export function Collapsible({
  title,
  defaultOpen = false,
  actions,
  children,
}: {
  title: ReactNode;
  defaultOpen?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-line">
      <div className="flex items-center gap-1 px-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span
            aria-hidden
            className={`text-ink-subtle transition-transform duration-150 ease-[var(--ease-out-soft)] ${open ? 'rotate-90' : ''}`}
          >
            <ChevronRightIcon size={13} />
          </span>
          <Eyebrow className="truncate">{title}</Eyebrow>
        </button>
        {actions}
      </div>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}
