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
  // Children mount on first open and then stay, so closing can animate; a closed body
  // is `inert`, out of the tab order and the accessibility tree.
  const [mounted, setMounted] = useState(defaultOpen);

  return (
    <div className="border-b border-line">
      <div className="flex items-center gap-1 px-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setMounted(true);
            setOpen((value) => !value);
          }}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 py-2.5 text-left transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span
            aria-hidden
            className={`text-ink-subtle transition-[rotate] duration-200 ease-out-soft ${open ? 'rotate-90' : ''}`}
          >
            <ChevronRightIcon size={13} />
          </span>
          <Eyebrow className="truncate">{title}</Eyebrow>
        </button>
        {actions}
      </div>
      {/* Height animates as a grid row from 0fr to 1fr — no measuring, and the content
          keeps its natural height for anything inside that measures itself. */}
      <div
        inert={!open}
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out-soft ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          {mounted && <div className="px-3 pb-3">{children}</div>}
        </div>
      </div>
    </div>
  );
}
