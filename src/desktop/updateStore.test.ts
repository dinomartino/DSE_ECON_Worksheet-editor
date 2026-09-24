import { beforeEach, describe, expect, it, vi } from 'vitest';

const checkForUpdate = vi.fn();
vi.mock('./updater', () => ({
  isDesktop: () => true,
  currentVersion: async () => '0.2.0',
  checkForUpdate,
}));

const { checkOnLaunch, resetUpdateStoreForTest, useUpdateStore } = await import('./updateStore');

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

  it('offers a found version, and a manual check brings back a dismissed banner', async () => {
    const install = vi.fn().mockRejectedValue(new Error('offline'));
    checkForUpdate.mockResolvedValue({ kind: 'available', update: { version: '0.3.0', install } });
    await useUpdateStore.getState().check();
    expect(useUpdateStore.getState()).toMatchObject({ status: 'available', available: '0.3.0' });

    useUpdateStore.getState().dismiss();
    await useUpdateStore.getState().check();
    expect(useUpdateStore.getState().dismissed).toBe(false);

    await useUpdateStore.getState().install();
    expect(useUpdateStore.getState().status).toBe('installFailed');
  });
});
