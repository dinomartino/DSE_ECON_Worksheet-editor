import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { worksheetStore } from '@/storage';
import { useWorksheetStore } from './worksheetStore';

const s = () => useWorksheetStore.getState();

beforeEach(() => {
  vi.restoreAllMocks();
  useWorksheetStore.setState({
    worksheet: buildAcceptanceWorksheet(),
    past: [],
    future: [],
    dirty: true,
    readOnly: false,
    savedByHandAt: undefined,
  });
});

describe('save (⌘S, ⋯ → Save now)', () => {
  it('writes the paper, clears dirty and marks the moment, so the bar says "Saved"', async () => {
    const write = vi.spyOn(worksheetStore, 'save').mockResolvedValue(undefined);
    await s().save();
    expect(write).toHaveBeenCalledWith(s().worksheet);
    expect(s().dirty).toBe(false);
    expect(s().savedByHandAt).toEqual(expect.any(Number));
  });

  it('an edit made during the write stays unsaved, and "Saved" is not claimed', async () => {
    let finish!: () => void;
    vi.spyOn(worksheetStore, 'save').mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const saving = s().save();
    s().updateWorksheet({ name: 'Edited while saving' });
    finish();
    await saving;
    expect(s().dirty).toBe(true);
    expect(s().savedByHandAt).toBeUndefined();
  });

  it('a failed write is no "Saved" either', async () => {
    vi.spyOn(worksheetStore, 'save').mockRejectedValue(new Error('quota'));
    await expect(s().save()).rejects.toThrow('quota');
    expect(s().dirty).toBe(true);
    expect(s().savedByHandAt).toBeUndefined();
  });

  it('a read-only paper writes nothing', async () => {
    const write = vi.spyOn(worksheetStore, 'save');
    useWorksheetStore.setState({ readOnly: true });
    await s().save();
    expect(write).not.toHaveBeenCalled();
    expect(s().savedByHandAt).toBeUndefined();
  });
});
