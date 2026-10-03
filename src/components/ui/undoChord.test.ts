import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gestureKey, isUndoRedoKey, undoChord } from './undoChord';

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

describe('a page resize drag owns the keyboard', () => {
  it('Esc cancels; undo and redo are swallowed', () => {
    expect(gestureKey(key('Escape'))).toBe('cancel');
    expect(gestureKey(key('z', { metaKey: true }))).toBe('swallow');
    expect(gestureKey(key('y', { ctrlKey: true }))).toBe('swallow');
    expect(gestureKey(key('Delete'))).toBeNull();
  });

  // ⌘Z mid-resize used to roll the document back under the gesture, and the release
  // then committed onto it. The editor's undo listener bubbles on window, so a capture
  // listener that stops the event is what keeps it out.
  it.each(['src/components/preview/ResizableBlock.tsx', 'src/components/preview/ResizableRows.tsx'])(
    '%s claims the modal layer and swallows undo in the capture phase',
    (path) => {
      const src = readFileSync(path, 'utf8');
      expect(src).toMatch(/useModalLayer\(draft\w* !== undefined\)/);
      const at = src.indexOf('gestureKey(event)');
      expect(at).toBeGreaterThan(-1);
      const handler = src.slice(at, at + 400);
      expect(handler).toContain('event.stopPropagation();');
      expect(handler).toContain("if (action === 'swallow') return;");
      expect(src).toContain("window.addEventListener('keydown', onKeyDown, true)");
    },
  );
});
