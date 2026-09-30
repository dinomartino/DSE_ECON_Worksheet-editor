import { describe, expect, it } from 'vitest';
import { isUndoRedoKey, undoChord } from './undoChord';

const key = (k: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'shiftKey', boolean>> = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  ...mods,
});

describe('undo keys', () => {
  it('⌘Z and Ctrl+Z undo; with Shift they redo', () => {
    expect(undoChord(key('z', { metaKey: true }))).toBe('undo');
    expect(undoChord(key('z', { ctrlKey: true }))).toBe('undo');
    // Shift reports the capital on most layouts.
    expect(undoChord(key('Z', { metaKey: true, shiftKey: true }))).toBe('redo');
    expect(undoChord(key('Z', { ctrlKey: true, shiftKey: true }))).toBe('redo');
  });

  it('a bare Z, or another chord, is not undo', () => {
    expect(undoChord(key('z'))).toBeNull();
    expect(undoChord(key('y', { ctrlKey: true }))).toBeNull();
    expect(undoChord(key('c', { metaKey: true }))).toBeNull();
  });

  it('a gesture swallows every undo and redo key, Ctrl+Y included, and nothing else', () => {
    expect(isUndoRedoKey(key('z', { metaKey: true }))).toBe(true);
    expect(isUndoRedoKey(key('Z', { metaKey: true, shiftKey: true }))).toBe(true);
    expect(isUndoRedoKey(key('y', { ctrlKey: true }))).toBe(true);
    expect(isUndoRedoKey(key('y', { metaKey: true }))).toBe(false);
    expect(isUndoRedoKey(key('Escape'))).toBe(false);
    expect(isUndoRedoKey(key('v', { metaKey: true }))).toBe(false);
  });
});
