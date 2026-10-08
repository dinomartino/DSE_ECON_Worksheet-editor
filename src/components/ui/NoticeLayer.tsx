'use client';

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  APP_SCOPE,
  MAX_VISIBLE,
  autoHideDelay,
  autoHides,
  closeNotice,
  dismiss,
  notify,
  runNoticeAction,
  setNoticeInset,
  useNoticeStore,
  type Notice,
  type NoticeInput,
  type NoticeTone,
} from '@/store/notices';
import { useMessages } from '@/i18n/language';
import { Button, IconButton } from './index';
import { CheckCircleIcon, CloseIcon, ErrorIcon, InfoIcon, WarningIcon } from './icons';
import { UI_MESSAGES } from './messages';

/**
 * Where notices are drawn. Never inline: a stack floats over the screen (`NoticeLayer`,
 * once per app root) or over a dialog's body (`Dialog`), so nothing reflows when one comes
 * or goes. The app stack sits under the modal scrim (z 48 < 50): a dialog's own notices
 * float inside it, so none hides behind the backdrop and a click on one is never a click
 * outside the dialog. Escape never closes a notice; it belongs to dialogs and selections.
 */

/** The scope `useNotices` raises into: the app, or the enclosing dialog. */
export const NoticeScopeContext = createContext<string>(APP_SCOPE);

/**
 * `notify` bound to where the caller sits (the enclosing dialog, else the app). Notices it
 * raised go when it unmounts, as an inline line used to. A component that renders its own
 * `Dialog` passes that dialog's `noticeScope` here.
 */
export function useNotices(options: { scope?: string } = {}) {
  const inherited = useContext(NoticeScopeContext);
  const scope = options.scope ?? inherited;
  const owned = useRef(new Set<string>());
  useEffect(() => {
    const ids = owned.current;
    return () => {
      for (const id of ids) dismiss(id);
      ids.clear();
    };
  }, []);
  return useMemo(
    () => ({
      scope,
      notify: (input: NoticeInput) => {
        const id = notify({ ...input, scope: input.scope ?? scope });
        owned.current.add(id);
        return id;
      },
      dismiss: (id: string) => {
        owned.current.delete(id);
        dismiss(id);
      },
    }),
    [scope],
  );
}

/** For a component that renders its own `Dialog`: pass `.scope` as its `noticeScope`. */
export function useDialogNotices() {
  return useNotices({ scope: useId() });
}

/**
 * For a bar docked along the window's foot (題庫's selection tray): the app stack keeps
 * clear of it while it is mounted. Returns the ref for the bar's root.
 */
export function useNoticeInset(owner: string) {
  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => () => setNoticeInset(owner, undefined), [owner]);
  return useCallback(
    (node: HTMLElement | null) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!node) {
        setNoticeInset(owner, undefined);
        return;
      }
      const report = () => setNoticeInset(owner, Math.round(node.getBoundingClientRect().height));
      report();
      if (typeof ResizeObserver === 'undefined') return;
      observer.current = new ResizeObserver(report);
      observer.current.observe(node);
    },
    [owner],
  );
}

/** The app stack's box: bottom-right, clear of the window's edges. */
export const APP_STACK_CLASS = 'fixed right-4 z-[48] w-[min(380px,calc(100vw-32px))]';

/** The app's stack: bottom-right, above any docked tray a screen reports (`useNoticeInset`). */
export function NoticeLayer() {
  const inset = useNoticeStore((s) => Math.max(0, ...Object.values(s.insets)));
  return <NoticeStack scope={APP_SCOPE} className={APP_STACK_CLASS} style={{ bottom: 16 + inset }} />;
}

/** One scope's notices from the store. */
export function NoticeStack({ scope, className, style }: { scope: string; className?: string; style?: CSSProperties }) {
  const all = useNoticeStore((s) => s.notices);
  const mine = useMemo(() => all.filter((n) => n.scope === scope), [all, scope]);
  return <NoticeStackView notices={mine} app={scope === APP_SCOPE} className={className} style={style} />;
}

/** Newest on top; the container takes no clicks, only the cards do. */
export function NoticeStackView({
  notices,
  app = true,
  className = '',
  style,
}: {
  notices: readonly Notice[];
  app?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const m = useMessages(UI_MESSAGES);
  if (notices.length === 0) return null;
  const visible = notices.slice(-MAX_VISIBLE).reverse();
  const hidden = notices.length - visible.length;
  return (
    <section
      aria-label={m.notifications}
      data-print-hide
      data-notice-stack={app ? 'app' : 'dialog'}
      className={`pointer-events-none flex flex-col gap-2 ${className}`}
      style={style}
    >
      {visible.map((notice) => (
        <NoticeCard key={notice.id} notice={notice} />
      ))}
      {hidden > 0 && (
        <p className="zone-light self-end rounded-full border border-line bg-surface-raised px-2.5 py-0.5 text-[11px] text-ink-muted shadow-sm">
          {m.moreNotices(hidden)}
        </p>
      )}
    </section>
  );
}

const TONE: Record<NoticeTone, { icon: typeof InfoIcon; className: string }> = {
  info: { icon: InfoIcon, className: 'text-accent' },
  success: { icon: CheckCircleIcon, className: 'text-ok' },
  warning: { icon: WarningIcon, className: 'text-warn-ink' },
  error: { icon: ErrorIcon, className: 'text-danger-ink' },
};

const FADE_MS = 200;
/** A fading notice caught by the pointer or focus gets this long again once let go. */
const REVIVE_MS = 2000;

/** Is the window in front? A notice's clock only runs while it can be read. */
function windowActive(): boolean {
  return typeof document === 'undefined' || (document.visibilityState === 'visible' && document.hasFocus());
}

function useWindowActive(): boolean {
  const [active, setActive] = useState(windowActive);
  useEffect(() => {
    const update = () => setActive(windowActive());
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return active;
}

export function NoticeCard({ notice }: { notice: Notice }) {
  const m = useMessages(UI_MESSAGES);
  const fades = autoHides(notice);
  const delay = autoHideDelay(notice);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // The rev that started fading: a replace (new rev) or a hover brings the notice back.
  const [fadingRev, setFadingRev] = useState<number | null>(null);
  const leaving = fadingRev === notice.rev;
  const remaining = useRef(delay);
  const timedRev = useRef(notice.rev);
  // Paused while pointed at, focused, or while the window is behind another (a link
  // opened in the browser): it fades only after it could have been read.
  const active = useWindowActive();
  const paused = hovered || focused || !active;

  useEffect(() => {
    if (!fades || paused) return;
    if (timedRev.current !== notice.rev) {
      timedRev.current = notice.rev;
      remaining.current = delay;
    }
    const started = Date.now();
    const rev = notice.rev;
    let fired = false;
    const timer = window.setTimeout(() => {
      fired = true;
      remaining.current = 0;
      setFadingRev(rev);
    }, remaining.current);
    return () => {
      window.clearTimeout(timer);
      if (!fired) remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [fades, paused, notice.rev, delay]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => dismiss(notice.id), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, notice.id]);

  const tone = TONE[notice.tone];
  const Icon = tone.icon;
  const details = notice.details ?? [];
  return (
    <div
      role={notice.tone === 'warning' || notice.tone === 'error' ? 'alert' : 'status'}
      data-notice={notice.tone}
      onPointerEnter={() => {
        if (leaving) remaining.current = REVIVE_MS;
        setHovered(true);
        setFadingRev(null);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => {
        if (leaving) remaining.current = REVIVE_MS;
        setFocused(true);
        setFadingRev(null);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
      className={`zone-light pointer-events-auto flex w-full animate-slide-up-in items-start gap-2.5 rounded-xl border border-line bg-surface-raised py-2.5 pl-3 text-ink shadow-lg transition-opacity duration-200 ease-out-soft ${
        leaving ? 'opacity-0' : 'opacity-100'
      } ${notice.dismissible ? 'pr-1.5' : 'pr-3'}`}
    >
      <Icon size={16} className={`mt-px ${tone.className}`} />
      <div className="min-w-0 flex-1">
        {notice.title && <p className="text-[13px] font-semibold leading-snug">{notice.title}</p>}
        <p className={`break-words text-[12.5px] leading-snug ${notice.title ? 'mt-0.5 text-ink-muted' : 'font-medium'}`}>
          {notice.body}
        </p>
        {details.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-[11px] leading-snug text-ink-muted">
            {details.map((line) => (
              <li key={line} className="break-words">
                {line}
              </li>
            ))}
          </ul>
        )}
        {notice.actions && notice.actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {notice.actions.map((action) => (
              <Button
                key={action.label}
                size="sm"
                variant={action.primary ? 'primary' : 'ghostAccent'}
                disabled={action.disabled}
                onClick={() => runNoticeAction(notice.id, action)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
      {notice.dismissible && (
        <IconButton label={m.dismissNotice} className="-my-1" onClick={() => closeNotice(notice.id)}>
          <CloseIcon size={14} />
        </IconButton>
      )}
    </div>
  );
}
