'use client';

import { useEffect } from 'react';
import { checkOnLaunch, useUpdateStore, type UpdateStatus } from '@/desktop/updateStore';
import { IconButton } from '@/components/ui';
import { RefreshIcon } from '@/components/ui/icons';
import { resolveMessages } from '@/i18n/catalogue';
import { useMessages, useUiLanguage } from '@/i18n/language';
import type { UiLanguage } from '@/settings/language';
import { dismiss, notify, type NoticeInput } from '@/store/notices';
import { UPDATE_MESSAGES } from './shell.messages';

/**
 * "Version X is ready": desktop only, raised once the update has downloaded silently, as
 * a notice in the app's stack (`NoticeLayer`), never a row that pushes the screen down.
 * The web never finds an update, so it never appears there.
 */

type State = 'offer' | 'installing' | 'failed';

export const UPDATE_NOTICE_ID = 'app-update';

/** The notice itself, with no async of its own, so it can be checked in a test. */
export function updateNotice(
  version: string,
  state: State,
  language: UiLanguage,
  handlers: { onInstall: () => void; onDismiss: () => void },
): NoticeInput {
  const m = resolveMessages(UPDATE_MESSAGES, language);
  return {
    id: UPDATE_NOTICE_ID,
    tone: state === 'failed' ? 'warning' : 'info',
    body: state === 'installing' ? m.installing(version) : state === 'failed' ? m.failed(version) : m.ready(version),
    actions: [
      {
        label: state === 'failed' ? m.tryAgain : m.restartNow,
        primary: true,
        disabled: state === 'installing',
        keepOpen: true,
        run: handlers.onInstall,
      },
      { label: m.later, run: handlers.onDismiss },
    ],
    onDismiss: handlers.onDismiss,
  };
}

export function UpdateBanner() {
  const status = useUpdateStore((s) => s.status);
  const available = useUpdateStore((s) => s.available);
  const dismissed = useUpdateStore((s) => s.dismissed);
  const language = useUiLanguage();

  // Mounted on every screen; `checkOnLaunch` makes that one check per launch.
  useEffect(checkOnLaunch, []);

  // Silent until the download is done: checking and downloading never interrupt.
  const state: State | undefined =
    status === 'ready'
      ? 'offer'
      : status === 'installing'
        ? 'installing'
        : status === 'installFailed'
          ? 'failed'
          : undefined;
  const shownState = available && !dismissed ? state : undefined;

  useEffect(() => {
    if (!shownState || !available) {
      dismiss(UPDATE_NOTICE_ID);
      return;
    }
    const store = useUpdateStore.getState();
    notify(
      updateNotice(available, shownState, language, {
        onInstall: () => void store.restart(),
        onDismiss: store.dismiss,
      }),
    );
  }, [shownState, available, language]);

  return null;
}

/**
 * The running version and a way to ask for a newer one — the start screen's foot.
 * Desktop only: the web is always the latest deploy, so it renders nothing there.
 */
export function VersionLine() {
  const status = useUpdateStore((s) => s.status);
  const current = useUpdateStore((s) => s.current);
  const available = useUpdateStore((s) => s.available);
  const check = useUpdateStore((s) => s.check);
  const restart = useUpdateStore((s) => s.restart);
  const m = useMessages(UPDATE_MESSAGES);

  useEffect(checkOnLaunch, []);
  if (current === null && status === 'idle') return null;

  return (
    <p data-print-hide className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-subtle">
      <span className="tabular-nums">{m.versionLine(current ?? '…')}</span>
      <span aria-hidden>·</span>
      <VersionAction status={status} available={available} onCheck={() => void check()} onInstall={() => void restart()} />
    </p>
  );
}

function VersionAction({
  status,
  available,
  onCheck,
  onInstall,
}: {
  status: UpdateStatus;
  available: string | null;
  onCheck: () => void;
  onInstall: () => void;
}) {
  const m = useMessages(UPDATE_MESSAGES);
  const link =
    'cursor-pointer font-medium text-accent-ink underline decoration-line-strong underline-offset-4 transition-colors duration-150 ease-out-soft hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';
  switch (status) {
    case 'checking':
      return <span role="status">{m.checking}</span>;
    case 'downloading':
      return <span role="status">{m.downloadingBackground(String(available))}</span>;
    case 'installing':
      return <span role="status">{m.installingShort(String(available))}</span>;
    case 'ready':
    case 'installFailed':
      return (
        <>
          <span>{status === 'installFailed' ? m.installFailedShort(String(available)) : m.readyShort(String(available))}</span>
          <button type="button" className={link} onClick={onInstall}>
            {status === 'installFailed' ? m.tryAgain : m.restartToUpdate}
          </button>
        </>
      );
    case 'downloadFailed':
      return (
        <>
          <span>{m.downloadFailed(String(available))}</span>
          <button type="button" className={link} onClick={onCheck}>
            {m.tryAgain}
          </button>
        </>
      );
    case 'failed':
      return (
        <>
          <span>{m.checkFailed}</span>
          <CheckButton onCheck={onCheck} />
        </>
      );
    case 'current':
      return (
        <>
          <span>{m.upToDate}</span>
          <CheckButton onCheck={onCheck} />
        </>
      );
    default:
      return <CheckButton onCheck={onCheck} />;
  }
}

/** "Check for updates" as a small refresh glyph: the line stays one short row. */
function CheckButton({ onCheck }: { onCheck: () => void }) {
  const m = useMessages(UPDATE_MESSAGES);
  return (
    <IconButton label={m.checkUpdates} onClick={onCheck} className="-my-1.5 h-6 w-6">
      <RefreshIcon size={13} />
    </IconButton>
  );
}
