'use client';

import { useEffect } from 'react';
import { checkOnLaunch, useUpdateStore, type UpdateStatus } from '@/desktop/updateStore';
import { Button } from '@/components/ui';

/**
 * "Version X is available" — desktop only, and silent otherwise.
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
      className="flex items-center gap-3 border-b border-line bg-accent-soft px-4 py-1.5 text-[13px] text-accent-ink"
    >
      <span className="min-w-0 flex-1 truncate">
        {state === 'installing'
          ? `Downloading version ${version} — the app will restart when it is ready.`
          : state === 'failed'
            ? `Version ${version} could not be installed. Try again, or download it from the releases page.`
            : `Version ${version} is available`}
      </span>
      <Button
        size="sm"
        variant="primary"
        disabled={state === 'installing'}
        onClick={onInstall}
      >
        {state === 'failed' ? 'Try again' : 'Update and restart'}
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
  const install = useUpdateStore((s) => s.install);
  const dismiss = useUpdateStore((s) => s.dismiss);

  // Mounted on every screen; `checkOnLaunch` makes that one check per launch.
  useEffect(checkOnLaunch, []);

  const state: State | undefined =
    status === 'available' ? 'offer' : status === 'installing' ? 'installing' : status === 'installFailed' ? 'failed' : undefined;
  if (!state || !available || dismissed) return null;

  return (
    <UpdateBar
      version={available}
      state={state}
      onInstall={() => void install()}
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
  const install = useUpdateStore((s) => s.install);

  useEffect(checkOnLaunch, []);
  if (current === null && status === 'idle') return null;

  return (
    <p data-print-hide className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] text-ink-subtle">
      <span className="tabular-nums">Version {current ?? '…'}</span>
      <span aria-hidden>·</span>
      <VersionAction status={status} available={available} onCheck={() => void check()} onInstall={() => void install()} />
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
    'cursor-pointer font-medium text-accent-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';
  switch (status) {
    case 'checking':
      return <span role="status">Checking for updates…</span>;
    case 'installing':
      return <span role="status">Downloading {available} — the app will restart…</span>;
    case 'available':
    case 'installFailed':
      return (
        <>
          <span>{status === 'installFailed' ? `${available} could not be installed.` : `${available} is available.`}</span>
          <button type="button" className={link} onClick={onInstall}>
            {status === 'installFailed' ? 'Try again' : 'Update and restart'}
          </button>
        </>
      );
    case 'failed':
      return (
        <>
          <span>Could not check for updates.</span>
          <button type="button" className={link} onClick={onCheck}>
            Try again
          </button>
        </>
      );
    case 'current':
      return (
        <>
          <span>Up to date.</span>
          <button type="button" className={link} onClick={onCheck}>
            Check again
          </button>
        </>
      );
    default:
      return (
        <button type="button" className={link} onClick={onCheck}>
          Check for updates
        </button>
      );
  }
}
