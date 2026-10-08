import type { Scheduler } from './scheduler';

/**
 * Holding sync around a read and the write it leads to (`Scheduler.suspend`): a run in flight
 * finishes first, and none starts until `work` settles. Opening a document reads it, then
 * writes it back; a download landing between the two would be written over, and the next run
 * would upload the old version. Without sync (the web, no folder, not loaded yet): just `work`.
 * Static and Tauri-free: `EditorHost` registers the scheduler once it has loaded sync.
 */

type Pausable = Pick<Scheduler, 'suspend'>;

let current: () => Pausable | undefined = () => undefined;

export function setSyncPause(get: (() => Pausable | undefined) | undefined): void {
  current = get ?? (() => undefined);
}

export function whileSyncPaused<T>(work: () => Promise<T>): Promise<T> {
  const scheduler = current();
  return scheduler ? scheduler.suspend(work) : work();
}
