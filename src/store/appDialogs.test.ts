import { beforeEach, describe, expect, it } from 'vitest';
import { useAppDialogs } from './appDialogs';

const state = () => useAppDialogs.getState();

beforeEach(() => {
  useAppDialogs.setState({ open: null, notice: null });
});

describe('useAppDialogs', () => {
  it('opens Settings with an empty request by default', () => {
    state().openSettings();
    expect(state().open).toEqual({ kind: 'settings', request: {} });
  });

  it('opening Settings again replaces the request; close clears it', () => {
    state().openSettings({ section: 'ai' });
    state().openSettings({ section: 'ai', focus: 'key' });
    expect(state().open).toEqual({ kind: 'settings', request: { section: 'ai', focus: 'key' } });
    state().close();
    expect(state().open).toBeNull();
  });

  it('gives every notice a new id, so the same message flashes again', () => {
    state().notify('Filled 3 texts');
    const first = state().notice;
    const undo = { label: 'Undo', run: () => {} };
    state().notify('Filled 3 texts', undo);
    const second = state().notice;
    expect(first?.message).toBe('Filled 3 texts');
    expect(second?.id).toBeGreaterThan(first?.id ?? Infinity);
    expect(second?.action).toBe(undo);
    expect(first && 'action' in first).toBe(false);
  });
});
