'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { resolveMessages, type Messages } from '@/i18n/catalogue';
import { useMessages, useUiLanguage } from '@/i18n/language';
import { openFolder } from '@/platform';
import { cloudFolders, type CloudFolder } from '@/platform/library';
import { useSettings } from '@/settings/store';
import { cleanComputerName, COMPUTER_NAME_MAX, SYNC_SETTINGS } from '@/settings/sync';
import { chooseFolder, stopSyncing, syncNow } from '@/sync/librarySync';
import { defaultComputerName } from '@/sync/localNamer';
import { SYNC_MESSAGES } from '@/sync/messages';
import { reasonText } from '@/sync/syncNotices';
import { useSyncView, type AttentionItem, type SyncView } from '@/sync/syncView';
import { STORAGE_MESSAGES } from './messages';

/**
 * Settings → Storage location 儲存位置 (desktop only; `library-folder.md` § 1). No folder: what
 * a folder is for, then a setup step (tips, this computer's name, the cloud folders found here)
 * before the native picker.
 * A folder: where, the status, Sync now, Show folder, the name, Needs attention, and Stop.
 * Steps and the stop confirm are inline: a second dialog would stack on Settings.
 */

type M = Messages<typeof STORAGE_MESSAGES>;

export interface StorageActions {
  /** `start`: a `CloudFolder.id` the picker opens at. */
  choose(title: string, start?: string): Promise<'chosen' | 'cancelled'>;
  cloudFolders(): Promise<CloudFolder[]>;
  stop(): Promise<void>;
  syncNow(): void;
  showFolder(path: string): Promise<void>;
}

const INPUT =
  'h-8 w-full max-w-[260px] min-w-0 rounded-lg border border-line bg-surface px-2 text-xs text-ink outline-none transition-colors duration-150 ease-out-soft placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25';

const two = (n: number) => String(n).padStart(2, '0');
const clock = (at: number) => {
  const date = new Date(at);
  return `${two(date.getHours())}:${two(date.getMinutes())}`;
};

function ComputerName({ m }: { m: M }) {
  const [{ computerName }, update] = useSettings(SYNC_SETTINGS);
  const lang = useUiLanguage();
  const fallback = defaultComputerName(lang);
  const saved = cleanComputerName(computerName) || fallback;
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const name = cleanComputerName(draft);
    update({ computerName: name === fallback ? '' : name });
    setDraft(null);
  };
  return (
    <label className="block space-y-1">
      <span className="block text-[12px] font-medium text-ink">{m.computerName}</span>
      <input
        value={draft ?? saved}
        maxLength={COMPUTER_NAME_MAX}
        placeholder={fallback}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
        className={INPUT}
      />
      <span className="block text-[11px] text-ink-muted">{m.computerNameHint}</span>
    </label>
  );
}

function StatusLine({ view, m }: { view: SyncView; m: M }) {
  const lang = useUiLanguage();
  const { status } = view;
  let tone = 'bg-line-strong';
  let text = m.notSyncing;
  let reason: string | undefined;
  if (status.state === 'running') {
    tone = 'bg-accent';
    text = m.syncing;
  } else if (status.state === 'unavailable') {
    tone = 'bg-danger';
    text = m.unreachable;
    reason = reasonText(resolveMessages(SYNC_MESSAGES, lang), status.reason);
  } else if (status.state === 'idle') {
    tone = status.lastSyncedAt ? 'bg-ok' : 'bg-line-strong';
    text = status.lastSyncedAt ? m.syncedAt(clock(status.lastSyncedAt)) : m.waiting;
  }
  return (
    <div role="status" className="min-w-0 flex-1">
      <span className="flex items-center gap-2 text-[13px] text-ink">
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${tone}`} />
        {text}
      </span>
      {reason && <span className="mt-0.5 block pl-4 text-[11px] text-ink-muted">{reason}</span>}
    </div>
  );
}

function attentionNote(item: AttentionItem, m: M): string {
  switch (item.kind) {
    case 'conflict':
      return m.attentionConflict;
    case 'unreadable':
      return m.attentionUnreadable;
    case 'unreadable-local':
      return m.attentionUnreadableLocal;
    case 'newer-build':
      return m.attentionNewer;
    default:
      return m.attentionError;
  }
}

function NeedsAttention({ items, m }: { items: readonly AttentionItem[]; m: M }) {
  if (items.length === 0) return null;
  return (
    <section aria-label={m.attention} className="rounded-xl border border-line bg-warn-soft/60 px-3 py-2.5">
      <h3 className="text-[12px] font-semibold text-warn-ink">{m.attention}</h3>
      <ul className="mt-1.5 space-y-2">
        {items.map((item, index) => (
          <li key={`${item.kind}:${item.id ?? item.name}:${index}`} className="text-[12px] leading-snug">
            <span className="block break-words font-medium text-ink">{item.name || m.untitled}</span>
            <span className="block text-ink-muted">{attentionNote(item, m)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Tips({ m }: { m: M }) {
  return (
    <ul className="list-disc space-y-1 pl-4 text-[12px] leading-snug text-ink-muted marker:text-ink-subtle">
      <li>{m.tipOffline}</li>
      <li>{m.tipOtherComputer}</li>
      <li>{m.tipSameTime}</li>
      <li>{m.tipSubfolder}</li>
    </ul>
  );
}

/**
 * The cloud folders found on this computer, each opening the picker there, and what to install
 * when Google Drive (or every drive) is missing: its website alone gives no folder. `null`:
 * detection failed or is still running, so nothing is said.
 */
export function CloudFolders({
  folders,
  disabled,
  onOpen,
  m,
}: {
  folders: readonly CloudFolder[] | null;
  disabled: boolean;
  onOpen(id: string): void;
  m: M;
}) {
  if (folders === null) return null;
  if (folders.length === 0) return <p className="text-[12px] leading-snug text-ink-muted">{m.noCloud}</p>;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-[12px] font-medium text-ink">{m.cloudFound}</span>
        {folders.map((folder) => (
          <Button key={folder.id} size="sm" disabled={disabled} title={m.cloudOpen(folder.label)} onClick={() => onOpen(folder.id)}>
            {folder.label}
          </Button>
        ))}
      </div>
      {!folders.some((folder) => folder.provider === 'google-drive') && (
        <p className="text-[11px] leading-snug text-ink-muted">{m.noGoogleDrive}</p>
      )}
    </div>
  );
}

type Step = 'idle' | 'setup' | 'confirm-stop';

export function StorageSectionView({
  view,
  actions,
  initialStep = 'idle',
  initialCloud = null,
}: {
  view: SyncView;
  actions: StorageActions;
  initialStep?: Step;
  initialCloud?: readonly CloudFolder[] | null;
}) {
  const m = useMessages(STORAGE_MESSAGES);
  const [step, setStep] = useState<Step>(initialStep);
  const [failed, setFailed] = useState(false);
  const [cloud, setCloud] = useState(initialCloud);
  const setup = step === 'setup';
  useEffect(() => {
    if (!setup) return;
    let live = true;
    // A failure says nothing: the plain picker still works.
    actions.cloudFolders().then(
      (folders) => live && setCloud(folders),
      () => live && setCloud(null),
    );
    return () => {
      live = false;
    };
  }, [setup, actions]);
  const root = view.location?.root ?? null;
  const pending = view.pending !== undefined;

  /** `work` resolves false to stay on the step (the picker was closed without a folder). */
  const run = async (work: () => Promise<boolean | void>) => {
    setFailed(false);
    try {
      if ((await work()) !== false) setStep('idle');
    } catch {
      setFailed(true);
    }
  };
  const failure = failed && <p role="alert" className="text-[12px] text-danger-ink">{m.failed}</p>;

  if (root === null) {
    return (
      <div className="space-y-3">
        <p className="text-[13px] leading-relaxed text-ink">{m.intro}</p>
        <p className="text-[11px] text-ink-muted">{m.notSynced}</p>
        {step !== 'setup' ? (
          <Button variant="primary" onClick={() => setStep('setup')}>
            {m.choose}
          </Button>
        ) : (
          <div className="space-y-3 rounded-xl border border-line bg-surface-sunken px-3 py-3">
            <h3 className="text-[13px] font-semibold text-ink">{m.setupTitle}</h3>
            <Tips m={m} />
            <ComputerName m={m} />
            <CloudFolders
              folders={cloud}
              disabled={pending}
              onOpen={(id) => void run(async () => (await actions.choose(m.pickerTitle, id)) === 'chosen')}
              m={m}
            />
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <Button
                variant="primary"
                disabled={pending}
                onClick={() => void run(async () => (await actions.choose(m.pickerTitle)) === 'chosen')}
              >
                {view.pending === 'choose' ? m.choosing : m.chooseNow}
              </Button>
              <Button variant="subtle" disabled={pending} onClick={() => setStep('idle')}>
                {m.cancel}
              </Button>
            </div>
          </div>
        )}
        {failure}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <span className="block text-[12px] font-medium text-ink">{m.folder}</span>
        <div className="flex items-start gap-2">
          <code className="min-w-0 flex-1 break-all rounded-lg border border-line bg-surface-sunken px-2 py-1.5 font-mono text-[11px] leading-snug text-ink">
            {root}
          </code>
          <Button size="sm" onClick={() => void actions.showFolder(root).catch(() => setFailed(true))}>
            {m.showFolder}
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <StatusLine view={view} m={m} />
        <Button size="sm" disabled={pending || view.status.state === 'running' || view.status.state === 'stopped'} onClick={actions.syncNow}>
          {m.syncNow}
        </Button>
      </div>
      <NeedsAttention items={view.attention} m={m} />
      <ComputerName m={m} />
      <div className="border-t border-line pt-3">
        {step !== 'confirm-stop' ? (
          <Button variant="danger" size="sm" className="-ml-2" disabled={pending} onClick={() => setStep('confirm-stop')}>
            {m.stop}
          </Button>
        ) : (
          <div className="space-y-2 rounded-xl border border-line bg-surface-sunken px-3 py-3">
            <h3 className="text-[13px] font-semibold text-ink">{m.stopTitle}</h3>
            <p className="text-[12px] leading-snug text-ink-muted">{m.stopBody}</p>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <button
                type="button"
                disabled={pending}
                onClick={() => void run(actions.stop)}
                className="inline-flex h-[34px] cursor-pointer items-center justify-center rounded-lg border border-transparent bg-danger px-3 text-[13px] font-medium text-white shadow-sm transition-[background-color,border-color,color,opacity,transform,scale,filter] duration-150 ease-out-soft hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
              >
                {m.stopConfirm}
              </button>
              <Button variant="subtle" disabled={pending} onClick={() => setStep('idle')}>
                {m.cancel}
              </Button>
            </div>
          </div>
        )}
      </div>
      {failure}
    </div>
  );
}

const ACTIONS: StorageActions = { choose: chooseFolder, cloudFolders, stop: stopSyncing, syncNow, showFolder: openFolder };

export default function StorageSection() {
  return <StorageSectionView view={useSyncView()} actions={ACTIONS} />;
}
