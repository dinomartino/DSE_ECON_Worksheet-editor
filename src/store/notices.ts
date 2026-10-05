import { create, type StoreApi, type UseBoundStore } from 'zustand';

/**
 * Dismissible notices: one store, drawn by `NoticeLayer` (the app's bottom-right stack) and
 * by each `Dialog` for the notices raised inside it. Never rendered inline, so a notice
 * appearing or closing moves nothing else on screen (SYSTEM_ARCHITECTURE.md § Notices).
 */

export type NoticeTone = 'info' | 'success' | 'warning' | 'error';

export interface NoticeAction {
  label: string;
  run: () => void;
  /** The notice's one main action, drawn filled. */
  primary?: boolean;
  disabled?: boolean;
  /** Running it leaves the notice up (its owner updates or dismisses it). */
  keepOpen?: boolean;
  /** False once the action no longer applies (an Undo past its commit): `pruneDeadActions` drops the notice. */
  live?: () => boolean;
}

export interface NoticeInput {
  /** The same id replaces the notice in place instead of stacking a second one. */
  id?: string;
  tone: NoticeTone;
  title?: string;
  body: string;
  /** Per-item lines under the body (what was unreadable, what was skipped). */
  details?: readonly string[];
  actions?: readonly NoticeAction[];
  /** False hides the close button: only its owner can take it down. Default true. */
  dismissible?: boolean;
  /** The teacher closed it (the × button), as opposed to it timing out or being replaced. */
  onDismiss?: () => void;
  /** `APP_SCOPE`, or the dialog it was raised in (`useNotices` fills this in). */
  scope?: string;
}

export interface Notice extends NoticeInput {
  id: string;
  scope: string;
  dismissible: boolean;
  /** Bumped on every replace, so a re-raised notice restarts its timer. */
  rev: number;
}

export const APP_SCOPE = 'app';
/** Info and success with nothing to act on fade after this; the rest stay until closed. */
export const AUTO_HIDE_MS = 6000;
/** How many a stack shows; older ones wait behind a "+N more" line. */
export const MAX_VISIBLE = 4;

/** Fades by itself: a plain result. Warnings, errors and anything with a button stay. */
export function autoHides(notice: Pick<Notice, 'tone' | 'actions'>): boolean {
  return (notice.tone === 'info' || notice.tone === 'success') && !notice.actions?.length;
}

export interface NoticesState {
  /** Oldest first. */
  notices: Notice[];
  /** Bottom space each screen keeps clear of the app stack (a docked tray), by owner. */
  insets: Record<string, number>;
}

export const useNoticeStore: UseBoundStore<StoreApi<NoticesState>> = create<NoticesState>(() => ({
  notices: [],
  insets: {},
}));

let counter = 0;

/** Raise a notice; returns its id. The same id (or the same text in the same place) replaces. */
export function notify(input: NoticeInput): string {
  const scope = input.scope ?? APP_SCOPE;
  const { notices } = useNoticeStore.getState();
  const same = notices.find((n) =>
    input.id !== undefined
      ? n.id === input.id
      : n.scope === scope && n.tone === input.tone && n.body === input.body && n.title === input.title,
  );
  const id = same?.id ?? input.id ?? `notice-${++counter}`;
  const next: Notice = { ...input, id, scope, dismissible: input.dismissible ?? true, rev: (same?.rev ?? 0) + 1 };
  const list = same ? notices.map((n) => (n === same ? next : n)) : [...notices, next];
  useNoticeStore.setState({ notices: trim(list, scope) });
  return id;
}

/**
 * Past `MAX_VISIBLE` in one place, the oldest notice that would fade anyway goes first;
 * a sticky one (an error, a list of skipped files) is kept behind "+N more".
 */
function trim(list: Notice[], scope: string): Notice[] {
  let excess = list.filter((n) => n.scope === scope).length - MAX_VISIBLE;
  if (excess <= 0) return list;
  return list.filter((n) => {
    if (excess > 0 && n.scope === scope && autoHides(n)) {
      excess -= 1;
      return false;
    }
    return true;
  });
}

/** Take a notice down (its owner, a timeout). Does not run `onDismiss`. */
export function dismiss(id: string): void {
  const { notices } = useNoticeStore.getState();
  if (notices.some((n) => n.id === id)) useNoticeStore.setState({ notices: notices.filter((n) => n.id !== id) });
}

/** The teacher closed it: `onDismiss` runs, then it goes. */
export function closeNotice(id: string): void {
  const notice = useNoticeStore.getState().notices.find((n) => n.id === id);
  if (!notice) return;
  dismiss(id);
  notice.onDismiss?.();
}

/** Run one of a notice's buttons; it closes the notice unless `keepOpen`. */
export function runNoticeAction(id: string, action: NoticeAction): void {
  if (!action.keepOpen) dismiss(id);
  action.run();
}

/** Every notice raised in `scope` (a dialog closing takes its notices with it). */
export function dismissScope(scope: string): void {
  const { notices } = useNoticeStore.getState();
  if (notices.some((n) => n.scope === scope)) useNoticeStore.setState({ notices: notices.filter((n) => n.scope !== scope) });
}

/** Drops each notice whose action no longer applies (`live()` false). Call after history moves. */
export function pruneDeadActions(): void {
  const { notices } = useNoticeStore.getState();
  const kept = notices.filter((n) => !n.actions?.some((a) => a.live && !a.live()));
  if (kept.length !== notices.length) useNoticeStore.setState({ notices: kept });
}

/** Keep `px` clear at the bottom of the app stack while `owner` is on screen; undefined releases. */
export function setNoticeInset(owner: string, px: number | undefined): void {
  const { insets } = useNoticeStore.getState();
  if (insets[owner] === px) return;
  const next = { ...insets };
  if (px === undefined) delete next[owner];
  else next[owner] = px;
  useNoticeStore.setState({ insets: next });
}

/** Test seam. */
export function resetNoticesForTest(): void {
  counter = 0;
  useNoticeStore.setState({ notices: [], insets: {} });
}
