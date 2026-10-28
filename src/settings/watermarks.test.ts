import { describe, expect, it } from 'vitest';
import { createSettingsStore } from './store';
import type { StorageLike } from './types';
import { WATERMARK_SETTINGS, defaultWatermark, watermarkLibrary, type SavedWatermark } from './watermarks';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const entry = (id: string, patch: Partial<SavedWatermark> = {}): SavedWatermark => ({
  id,
  name: `Logo ${id}`,
  kind: 'image',
  src: PNG,
  widthPx: 100,
  heightPx: 50,
  createdAt: '2026-10-28T00:00:00Z',
  ...patch,
});

function memory(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (key) => data[key] ?? null, setItem: (key, value) => void (data[key] = value) };
}

describe('the saved watermarks', () => {
  it('drops a broken entry and keeps the rest of the list, in order', () => {
    const raw = [
      entry('a'),
      { ...entry('b'), src: 'https://example.com/logo.png' },
      { ...entry('c'), widthPx: 0 },
      'logo',
      null,
      entry('d', { kind: 'text', text: 'SAMPLE' }),
      entry('a', { name: 'duplicate' }),
    ];
    expect(watermarkLibrary(raw)?.map((saved) => saved.id)).toEqual(['a', 'd']);
    expect(watermarkLibrary(raw)?.[1]).toMatchObject({ kind: 'text', text: 'SAMPLE' });
    expect(watermarkLibrary('not a list')).toBeUndefined();
  });

  it('reads an empty library from nothing, and one broken field never empties the other', () => {
    const storage = memory({
      [WATERMARK_SETTINGS.storageKey]: JSON.stringify({ v: 1, library: [entry('a')], lastUsedId: 42 }),
    });
    const store = createSettingsStore(() => storage, { desktop: false });
    expect(store.read(WATERMARK_SETTINGS)).toEqual({ library: [entry('a')], lastUsedId: '' });
    const fresh = createSettingsStore(() => memory(), { desktop: false });
    expect(fresh.read(WATERMARK_SETTINGS)).toEqual({ library: [], lastUsedId: '' });
  });

  it('writes a list that a second launch reads back', () => {
    const storage = memory();
    createSettingsStore(() => storage, { desktop: false }).write(WATERMARK_SETTINGS, {
      library: [entry('a'), entry('b')],
      lastUsedId: 'a',
    });
    const again = createSettingsStore(() => storage, { desktop: false }).read(WATERMARK_SETTINGS);
    expect(again.library.map((saved) => saved.id)).toEqual(['a', 'b']);
    expect(again.lastUsedId).toBe('a');
  });

  it('the one-click button uses the last used, else the newest, else nothing', () => {
    expect(defaultWatermark({ library: [entry('a'), entry('b')], lastUsedId: 'a' })?.id).toBe('a');
    expect(defaultWatermark({ library: [entry('a'), entry('b')], lastUsedId: 'gone' })?.id).toBe('b');
    expect(defaultWatermark({ library: [], lastUsedId: '' })).toBeUndefined();
  });
});
