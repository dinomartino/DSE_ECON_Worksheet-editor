import { beforeEach, describe, expect, it } from 'vitest';
import { useAppDialogs, type TranslateRequest } from './appDialogs';

const request: TranslateRequest = { worksheetId: 'w1', mode: 'translate', scope: { kind: 'paper' } };
const state = () => useAppDialogs.getState();

beforeEach(() => {
  useAppDialogs.setState({ open: null, notice: null });
});

describe('useAppDialogs', () => {
  it('opens Settings with an empty request by default', () => {
    state().openSettings();
    expect(state().open).toEqual({ kind: 'settings', request: {} });
  });

  it('holds one dialog at a time: opening one replaces the other', () => {
    state().openTranslate(request);
    state().openSettings({ section: 'ai', focus: 'key' }, request);
    expect(state().open).toEqual({ kind: 'settings', request: { section: 'ai', focus: 'key' }, returnTo: request });
    state().openTranslate({ ...request, mode: 'check' });
    expect(state().open).toEqual({ kind: 'translate', request: { ...request, mode: 'check' } });
  });

  it('resumes the waiting translate request only when asked', () => {
    state().openSettings({ section: 'ai' }, request);
    state().close({ resume: true });
    expect(state().open).toEqual({ kind: 'translate', request });

    state().openSettings({ section: 'ai' }, request);
    state().close();
    expect(state().open).toBeNull();
  });

  it('closes plainly when there is nothing to resume', () => {
    state().openSettings();
    state().close({ resume: true });
    expect(state().open).toBeNull();
    state().openTranslate(request);
    state().close({ resume: true });
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
