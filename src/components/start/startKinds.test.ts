/** The New worksheet button preselects the last type created, per viewer, never failing. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readLastKind, writeLastKind } from './startKinds';

function stubStorage(storage: Partial<Storage>) {
  vi.stubGlobal('window', { localStorage: storage });
}

function memoryStorage(): Partial<Storage> {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('the last-used document type', () => {
  it('starts on Classroom', () => {
    stubStorage(memoryStorage());
    expect(readLastKind()).toBe('classroom');
  });

  it('comes back as the type last created', () => {
    stubStorage(memoryStorage());
    writeLastKind('lqMock');
    expect(readLastKind()).toBe('lqMock');
    writeLastKind('paper1');
    expect(readLastKind()).toBe('paper1');
  });

  it('is kept outside the documents’ storage prefix', () => {
    const storage = memoryStorage();
    const setItem = vi.fn(storage.setItem);
    stubStorage({ ...storage, setItem });
    writeLastKind('lqWorksheet');
    expect(setItem).toHaveBeenCalledOnce();
    expect(setItem.mock.calls[0][0].startsWith('econ-worksheet')).toBe(false);
  });

  it('reads an unknown value as Classroom', () => {
    stubStorage({ getItem: () => 'pamphlet' });
    expect(readLastKind()).toBe('classroom');
  });

  it('survives blocked storage', () => {
    const blocked = () => {
      throw new Error('SecurityError');
    };
    stubStorage({ getItem: blocked, setItem: blocked });
    expect(() => writeLastKind('lqMock')).not.toThrow();
    expect(readLastKind()).toBe('classroom');
  });
});
