import { afterEach, describe, expect, it } from 'vitest';
import { createWorksheet } from '@/model/factories';
import type { Worksheet } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { flushBeforeLeaving } from './EditorHost';

const initial = useWorksheetStore.getState();
afterEach(() => useWorksheetStore.setState(initial, true));

const edit = (name: string) => useWorksheetStore.getState().updateWorksheet({ name });

describe('leaving the editor flushes the open document', () => {
  it('saves the value on screen and leaves the store clean', async () => {
    useWorksheetStore.getState().replaceWorksheet(createWorksheet());
    edit('Quiz');
    const saved: Worksheet[] = [];
    await flushBeforeLeaving(async (w) => void saved.push(w));
    expect(saved.map((w) => w.name)).toEqual(['Quiz']);
    expect(useWorksheetStore.getState().dirty).toBe(false);
  });

  it('saves again when typing lands during the write', async () => {
    useWorksheetStore.getState().replaceWorksheet(createWorksheet());
    edit('Qu');
    const saved: (string | undefined)[] = [];
    await flushBeforeLeaving(async (w) => {
      saved.push(w.name);
      if (saved.length === 1) edit('Quiz');
    });
    expect(saved).toEqual(['Qu', 'Quiz']);
    expect(useWorksheetStore.getState().dirty).toBe(false);
  });

  it('never marks a document swapped in during the write clean before its own save', async () => {
    useWorksheetStore.getState().replaceWorksheet(createWorksheet());
    edit('Outgoing');
    const saved: (string | undefined)[] = [];
    await flushBeforeLeaving(async (w) => {
      saved.push(w.name);
      if (saved.length > 1) return;
      useWorksheetStore.getState().replaceWorksheet(createWorksheet());
      edit('Incoming, edited');
    });
    expect(saved).toEqual(['Outgoing', 'Incoming, edited']);
    expect(useWorksheetStore.getState().dirty).toBe(false);
  });

  it('rejects on a failed write and keeps the edits dirty', async () => {
    useWorksheetStore.getState().replaceWorksheet(createWorksheet());
    edit('Quiz');
    await expect(flushBeforeLeaving(() => Promise.reject(new Error('disk full')))).rejects.toThrow('disk full');
    expect(useWorksheetStore.getState().dirty).toBe(true);
  });
});
