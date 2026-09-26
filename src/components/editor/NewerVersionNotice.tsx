'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { useUpdateStore } from '@/desktop/updateStore';
import type { Worksheet } from '@/model/types';
import { isDesktop, openExternal } from '@/platform';
import { editableCopy, updateFolders, worksheetStore } from '@/storage';
import { copyAssignment } from '@/storage/folders';
import { newId } from '@/model/factories';
import { useWorksheetStore } from '@/store/worksheetStore';

/**
 * The read-only notice for a document a newer build saved (`isNewerThanBuild`).
 *
 * Persistent: no close button, because the state it names lasts as long as the
 * document is open. `data-print-hide` — it is chrome, not paper.
 */

export const DOWNLOAD_URL =
  'https://github.com/dinomartino/DSE_ECON_Worksheet-editor/releases/latest';

export const NEWER_VERSION_MESSAGE =
  'This worksheet was saved by a newer version of Econ Worksheet. Update to edit it safely.';

/** The bar itself, with no store of its own, so it can be rendered in a test. */
export function NewerVersionBar({
  desktop,
  status,
  busy,
  onCheck,
  onDownload,
  onDuplicate,
}: {
  desktop: boolean;
  /** The outcome of the last action, said beside the buttons. */
  status?: string;
  busy?: boolean;
  onCheck: () => void;
  onDownload: () => void;
  onDuplicate: () => void;
}) {
  return (
    <div
      data-print-hide
      role="status"
      className="flex animate-slide-down-in flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-warn-soft px-4 py-2 text-[13px] text-warn-ink"
    >
      <p className="min-w-0 flex-1">
        <span className="font-semibold">{NEWER_VERSION_MESSAGE}</span>{' '}
        <span className="opacity-80">Open read-only — nothing you do here changes the file.</span>
      </p>
      {status && (
        <span key={status} className="animate-fade-in text-[12px]">
          {status}
        </span>
      )}
      {desktop ? (
        <Button size="sm" variant="primary" disabled={busy} onClick={onCheck}>
          Check for updates
        </Button>
      ) : (
        <Button size="sm" variant="primary" onClick={onDownload}>
          Get the latest version
        </Button>
      )}
      <Button
        size="sm"
        variant="default"
        disabled={busy}
        onClick={onDuplicate}
        title="A copy this version can edit. What only the newer version understands is left out of the copy; the original is untouched."
      >
        Duplicate as editable copy
      </Button>
    </div>
  );
}

export function NewerVersionNotice({
  onOpenDocument,
}: {
  /** Open the editable copy once it is saved. */
  onOpenDocument: (worksheet: Worksheet) => void;
}) {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const [status, setStatus] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    setStatus('Checking…');
    const result = await useUpdateStore.getState().check();
    const found = useUpdateStore.getState().available;
    setBusy(false);
    if (result === 'failed') setStatus('Could not check for updates — are you online?');
    else if (result === 'current') setStatus('No newer version is available yet.');
    else if (found) setStatus(`Downloading version ${found} — you will be told when it is ready.`);
    else setStatus(undefined);
  };

  const duplicate = async () => {
    setBusy(true);
    try {
      const copy = editableCopy(worksheet, newId());
      await worksheetStore.save(copy);
      // The copy sits beside its original, folder included — as a start-screen duplicate does.
      await updateFolders(worksheetStore, (state) => copyAssignment(state, worksheet.id, copy.id)).catch(
        () => undefined,
      );
      onOpenDocument(copy);
    } catch {
      setStatus('Could not save a copy.');
      setBusy(false);
    }
  };

  return (
    <NewerVersionBar
      desktop={isDesktop()}
      status={status}
      busy={busy}
      onCheck={() => void check()}
      onDownload={() => void openExternal(DOWNLOAD_URL).catch(() => undefined)}
      onDuplicate={() => void duplicate()}
    />
  );
}
