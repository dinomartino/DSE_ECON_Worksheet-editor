'use client';

import { useEffect, useState } from 'react';
import { checkForUpdate, type AvailableUpdate } from '@/desktop/updater';
import { Button } from '@/components/ui';

/**
 * "Version X is available" — desktop only, and silent otherwise.
 *
 * `checkForUpdate()` returns null on the web, so the bar simply never appears there.
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
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [state, setState] = useState<State>('offer');
  const [dismissed, setDismissed] = useState(false);

  // Once per mount. A check that fails resolves to null and shows nothing.
  useEffect(() => {
    let live = true;
    void checkForUpdate().then((found) => {
      if (live) setUpdate(found);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!update || dismissed) return null;

  return (
    <UpdateBar
      version={update.version}
      state={state}
      onInstall={() => {
        setState('installing');
        // `install` relaunches on success, so only the failure path returns here.
        void update.install().catch((error) => {
          console.warn('Update install failed', error);
          setState('failed');
        });
      }}
      onDismiss={() => setDismissed(true)}
    />
  );
}
