'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { IconButton } from './index';
import { CloseIcon } from './icons';
import { useModalLayer } from './modalLayer';

/**
 * A centred modal dialog.
 *
 * Exists so that decisions made *once per document* — the title, the paper, the
 * header — stop competing for room with the work done *constantly*. They used to be
 * two collapsed accordions pinned above the question list, which cost the sidebar its
 * top third and, expanded, pushed the editor off the bottom of the screen. A dialog
 * gives them the width to be laid out properly and then gets out of the way.
 *
 * It claims the keyboard through `useModalLayer()` for the reason spelled out in that
 * module: every page-level shortcut is a `window` listener, so they all fire unless
 * ownership is tracked explicitly. Without the claim, Delete typed into a settings
 * field would also reach the preview's delete handlers.
 */
export function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
  width = 720,
  height,
  scrollBody = true,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  /**
   * A fixed height, for a dialog whose tabs hold different amounts of content.
   *
   * Without it the panel is sized by whichever tab is open, so switching from a long
   * tab to a short one makes the whole dialog jump — the tab list moves under the
   * pointer and the close button changes place between clicks. Capped by viewport
   * height so it still fits a short window.
   */
  height?: number;
  /**
   * Whether the dialog body scrolls as one block.
   *
   * False for a tabbed dialog, whose rail and panel scroll independently — see the body
   * below. Defaults to true so a plain dialog behaves the obvious way.
   */
  scrollBody?: boolean;
}) {
  useModalLayer();
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes, and focus moves into the panel so the first Tab lands inside the
  // dialog rather than back in the document behind it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* The scrim is a real click target: clicking outside a settings dialog to
          dismiss it is the behaviour every OS has taught, and there is nothing
          destructive to guard against since each control commits as it is changed. */}
      <div
        className="absolute inset-0 bg-[#0f1115]/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{
          width,
          maxWidth: '100%',
          ...(height ? { height: `min(${height}px, 86vh)` } : { maxHeight: '86vh' }),
        }}
        className="zone-light relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl outline-none"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            {/* The dialog's one display moment: the chrome's serif voice, roman, like
                the start screen greeting (design.md § Typography). */}
            <h2 className="font-display text-[19px] font-normal leading-snug text-ink">
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-xs text-ink-muted">{description}</p>
            )}
          </div>
          <IconButton label="Close" size="md" onClick={onClose}>
            <CloseIcon size={16} />
          </IconButton>
        </header>

        {/* Tabbed dialogs scroll *inside* each pane, so the body only clips; an untabbed
            one has no inner scroller and needs its own. Two scrollers would otherwise
            stack a scrollbar around the whole body as well as within the panel. */}
        <div
          className={`flex min-h-0 flex-1 flex-col ${
            scrollBody ? 'scroll-slim overflow-y-auto' : 'overflow-hidden'
          }`}
        >
          {children}
        </div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-sunken px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

/**
 * Vertical tab list for a dialog's sections.
 *
 * Vertical rather than along the top because the labels are words ("Header & footer")
 * rather than icons, and a horizontal strip of five word-tabs either wraps or truncates
 * at this width.
 */
export function DialogTabs<T extends string>({
  tabs,
  value,
  onChange,
  children,
}: {
  tabs: Array<{ id: T; label: string; hint?: string; icon?: ReactNode }>;
  value: T;
  onChange: (id: T) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1">
      {/* `self-stretch` rather than height-by-content: with a fixed-height dialog the
          rail must run the full side, or a short tab leaves its background floating
          above bare surface and the nav stops reading as a rail. */}
      <nav
        aria-label="Settings sections"
        className="w-[184px] shrink-0 self-stretch space-y-0.5 overflow-y-auto border-r border-line bg-surface-sunken p-2"
      >
        {/* An index, not a strip of icon chips: text rows with the accent bar naming
            the open section — the same affordance as the start screen's rows. Icons
            are accepted for compatibility but not drawn; four word-labels do not need
            picture support. */}
        {tabs.map((tab) => {
          const active = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.id)}
              className={`relative flex w-full cursor-pointer items-center rounded-md py-2 pl-3.5 pr-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                active ? 'text-ink' : 'text-ink-muted hover:bg-surface-hover hover:text-ink'
              }`}
            >
              <span
                aria-hidden
                className={`absolute inset-y-1.5 left-0 w-0.5 rounded-full ${
                  active ? 'bg-accent' : 'bg-transparent'
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{tab.label}</span>
                {tab.hint && (
                  <span className="block truncate text-[10px] text-ink-subtle">{tab.hint}</span>
                )}
              </span>
            </button>
          );
        })}
      </nav>
      <div className="scroll-slim min-w-0 flex-1 overflow-y-auto p-5">{children}</div>
    </div>
  );
}

/**
 * A labelled group inside a settings panel.
 *
 * The old panels leant on 10px uppercase eyebrows and hairline borders to separate
 * groups, which at that size read as texture rather than structure. A plain sentence-case
 * heading with a one-line explanation is what makes an unfamiliar control guessable.
 */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div>
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {hint && <span className="block text-[11px] text-ink-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
