import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyRunFormat, replaceRichTextRange } from '@/model/text';
import { runShortcut, toggledAtCaret, toggledRange } from './runShortcuts';

const key = (k: string, extra: Partial<{ code: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
  key: k,
  code: extra.code,
  metaKey: extra.metaKey ?? false,
  ctrlKey: extra.ctrlKey ?? true,
  altKey: extra.altKey ?? false,
  shiftKey: extra.shiftKey ?? false,
});

/** GitHub #8 (k-0479): Q₁ from the keyboard, and pasted bold that comes off. */
describe('character formats from the keyboard', () => {
  it('reads Word’s keys on Windows (Ctrl) and the Mac (⌘)', () => {
    expect(runShortcut(key('b'))).toBe('bold');
    expect(runShortcut(key('B', { ctrlKey: false, metaKey: true }))).toBe('bold');
    expect(runShortcut(key('i'))).toBe('italic');
    expect(runShortcut(key('u'))).toBe('underline');
    expect(runShortcut(key('=', { code: 'Equal' }))).toBe('subscript');
    expect(runShortcut(key('+', { code: 'Equal', shiftKey: true }))).toBe('superscript');
    // A layout whose = key reports another code still works by its character.
    expect(runShortcut(key('='))).toBe('subscript');
  });

  it('leaves everything else to the app and the browser', () => {
    expect(runShortcut(key('b', { ctrlKey: false }))).toBeUndefined();
    expect(runShortcut(key('b', { altKey: true }))).toBeUndefined();
    expect(runShortcut(key('B', { shiftKey: true }))).toBeUndefined();
    expect(runShortcut(key('+', { code: 'NumpadAdd' }))).toBeUndefined();
    expect(runShortcut(key('z'))).toBeUndefined();
  });

  it('takes pasted bold off: the issue’s case', () => {
    // A paste keeps its bold as the runs' own mark (`replaceRichTextRangeWithRuns`).
    const pasted = [{ text: 'Suppose the relative price ', bold: true as const }, { text: 'of Good X' }];
    const off = toggledRange(pasted, 0, 27, 'bold');
    expect(off).toEqual([{ text: 'Suppose the relative price of Good X' }]);
    // A mixed range turns on first, then off, as the toolbar does.
    const on = toggledRange(pasted, 0, 36, 'bold');
    expect(on).toEqual([{ text: 'Suppose the relative price of Good X', bold: true }]);
    expect(toggledRange(on, 0, 36, 'bold')).toEqual([{ text: 'Suppose the relative price of Good X' }]);
  });

  it('makes Q1 into Q₁ and back, and swaps sub for super', () => {
    const q = [{ text: 'Q1 and P2' }];
    const sub = toggledRange(q, 1, 2, 'subscript');
    expect(sub).toEqual([{ text: 'Q' }, { text: '1', vertAlign: 'subscript' }, { text: ' and P2' }]);
    expect(toggledRange(sub, 1, 2, 'subscript')).toEqual(q);
    expect(toggledRange(sub, 1, 2, 'superscript')[1]).toEqual({ text: '1', vertAlign: 'superscript' });
  });

  it('at a caret, switches what is typed next', () => {
    const runs = [{ text: 'Q' }];
    const typing = toggledAtCaret(runs, 1, 'subscript', undefined);
    expect(typing).toEqual({ at: 1, patch: { vertAlign: 'subscript' } });
    const typed = applyRunFormat(replaceRichTextRange(runs, 1, 1, '1'), 1, 2, typing.patch);
    expect(typed).toEqual([{ text: 'Q' }, { text: '1', vertAlign: 'subscript' }]);
    // Pressing again at the same caret switches it back off.
    expect(toggledAtCaret(runs, 1, 'subscript', typing).patch).toEqual({ vertAlign: null });
    // Inside bold, ⌘B at the caret means "not bold" for what comes next.
    expect(toggledAtCaret([{ text: 'AB', bold: true }], 2, 'bold', undefined).patch).toEqual({ bold: null });
  });

  it('is wired into the field before the browser’s own command', () => {
    const source = readFileSync('src/components/preview/RichTextEditable.tsx', 'utf8');
    expect(source).toContain('const shortcut = runShortcut(event);');
    expect(source).toMatch(/if \(shortcut && host\) \{\s*event\.preventDefault\(\);/);
  });
});
