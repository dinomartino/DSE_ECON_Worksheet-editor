import { beforeEach, describe, expect, it, vi } from 'vitest';

const checkForUpdate = vi.fn();
vi.mock('./updater', () => ({
  isDesktop: () => true,
  currentVersion: async () => '0.2.0',
  checkForUpdate,
}));

const { checkOnLaunch, resetUpdateStoreForTest, setBeforeRestart, useUpdateStore } = await import(
  './updateStore'
);

describe('the update store', () => {
  beforeEach(() => {
    checkForUpdate.mockReset();
    resetUpdateStoreForTest();
  });

  it('checks once per launch, however many screens ask', async () => {
    checkForUpdate.mockResolvedValue({ kind: 'none' });
    checkOnLaunch();
    checkOnLaunch();
    await vi.waitFor(() => expect(useUpdateStore.getState().status).toBe('current'));
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
    expect(useUpdateStore.getState().current).toBe('0.2.0');
  });

  it('never calls a failed check "up to date"', async () => {
    checkForUpdate.mockResolvedValue({ kind: 'failed' });
    expect(await useUpdateStore.getState().check()).toBe('failed');
  });

  it('downloads a found version silently, then offers the restart', async () => {
    let finish = () => {};
    const download = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const installAndRestart = vi.fn().mockResolvedValue(undefined);
    checkForUpdate.mockResolvedValue({
      kind: 'available',
      update: { version: '0.3.0', download, installAndRestart },
    });

    expect(await useUpdateStore.getState().check()).toBe('downloading');
    expect(useUpdateStore.getState()).toMatchObject({ status: 'downloading', available: '0.3.0' });
    finish();
    await vi.waitFor(() => expect(useUpdateStore.getState().status).toBe('ready'));

    // "Later", then asking again: no second check or download, just the banner back.
    useUpdateStore.getState().dismiss();
    expect(await useUpdateStore.getState().check()).toBe('ready');
    expect(useUpdateStore.getState().dismissed).toBe(false);
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('saves pending work before restarting, and reports a failed install', async () => {
    const order: string[] = [];
    setBeforeRestart(async () => void order.push('flush'));
    const installAndRestart = vi.fn(async () => {
      order.push('install');
      throw new Error('disk full');
    });
    checkForUpdate.mockResolvedValue({
      kind: 'available',
      update: { version: '0.3.0', download: async () => {}, installAndRestart },
    });
    await useUpdateStore.getState().check();
    await vi.waitFor(() => expect(useUpdateStore.getState().status).toBe('ready'));

    await useUpdateStore.getState().restart();
    expect(order).toEqual(['flush', 'install']);
    expect(useUpdateStore.getState().status).toBe('installFailed');
  });

  it('retries a failed download without checking again', async () => {
    const download = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    checkForUpdate.mockResolvedValue({
      kind: 'available',
      update: { version: '0.3.0', download, installAndRestart: async () => {} },
    });
    await useUpdateStore.getState().check();
    await vi.waitFor(() => expect(useUpdateStore.getState().status).toBe('downloadFailed'));

    expect(await useUpdateStore.getState().check()).toBe('downloading');
    await vi.waitFor(() => expect(useUpdateStore.getState().status).toBe('ready'));
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
  });
});
