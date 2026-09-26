'use client';

import { useEffect } from 'react';
import { checkOnLaunch, useUpdateStore, type UpdateStatus } from '@/desktop/updateStore';
import { Button, IconButton } from '@/components/ui';
import { RefreshIcon } from '@/components/ui/icons';

/**
 * "Version X is ready" — desktop only, shown once the update has downloaded silently.
 *
 * The web never finds an update, so the bar simply never appears there.
 * `data-print-hide` because this is on-page chrome and would otherwise print.
 */

type State = 'offer' | 'installing' | 'failed';

/** The bar itself, with no async of its own, so it can be rendered in a test. */
export function UpdateBar({
  version,
  state,
  onInstall,
  onDismiss,
}: {
  version: string;
  state: State;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      data-print-hide
      role="status"
      className="flex animate-slide-down-in items-center gap-3 border-b border-line bg-accent-soft px-4 py-1.5 text-[13px] text-accent-ink"
    >
      <span className="min-w-0 flex-1 truncate">
        {state === 'installing'
          ? `Installing version ${version} — the app will restart in a moment.`
          : state === 'failed'
            ? `Version ${version} could not be installed. Try again, or download it from the releases page.`
            : `Version ${version} is ready — restart to finish updating. Your work is saved first.`}
      </span>
      <Button
        size="sm"
        variant="primary"
        disabled={state === 'installing'}
        onClick={onInstall}
      >
        {state === 'failed' ? 'Try again' : 'Restart now'}
      </Button>
      <Button size="sm" variant="subtle" onClick={onDismiss}>
        Later
      </Button>
    </div>
  );
}

export function UpdateBanner() {
  const status = useUpdateStore((s) => s.status);
  const available = useUpdateStore((s) => s.available);
  const dismissed = useUpdateStore((s) => s.dismissed);
  const restart = useUpdateStore((s) => s.restart);
  const dismiss = useUpdateStore((s) => s.dismiss);

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
  if (!state || !available || dismissed) return null;

  return (
    <UpdateBar
      version={available}
      state={state}
      onInstall={() => void restart()}
      onDismiss={dismiss}
    />
  );
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

  useEffect(checkOnLaunch, []);
  if (current === null && status === 'idle') return null;

  return (
    <p data-print-hide className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-subtle">
      <span className="tabular-nums">Version {current ?? '…'}</span>
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
  const link =
    'cursor-pointer font-medium text-accent-ink underline decoration-line-strong underline-offset-4 transition-colors duration-150 ease-out-soft hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';
  switch (status) {
    case 'checking':
      return <span role="status">Checking for updates…</span>;
    case 'downloading':
      return <span role="status">Downloading {available} in the background…</span>;
    case 'installing':
      return <span role="status">Installing {available} — the app will restart…</span>;
    case 'ready':
    case 'installFailed':
      return (
        <>
          <span>{status === 'installFailed' ? `${available} could not be installed.` : `${available} is ready.`}</span>
          <button type="button" className={link} onClick={onInstall}>
            {status === 'installFailed' ? 'Try again' : 'Restart to update'}
          </button>
        </>
      );
    case 'downloadFailed':
      return (
        <>
          <span>{available} could not be downloaded.</span>
          <button type="button" className={link} onClick={onCheck}>
            Try again
          </button>
        </>
      );
    case 'failed':
      return (
        <>
          <span>Could not check for updates</span>
          <CheckButton onCheck={onCheck} />
        </>
      );
    case 'current':
      return (
        <>
          <span>Up to date</span>
          <CheckButton onCheck={onCheck} />
        </>
      );
    default:
      return <CheckButton onCheck={onCheck} />;
  }
}

/** "Check for updates" as a small refresh glyph: the line stays one short row. */
function CheckButton({ onCheck }: { onCheck: () => void }) {
  return (
    <IconButton label="Check for updates" onClick={onCheck} className="-my-1.5 h-6 w-6">
      <RefreshIcon size={13} />
    </IconButton>
  );
}
