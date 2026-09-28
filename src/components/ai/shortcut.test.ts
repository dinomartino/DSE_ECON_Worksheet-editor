import { describe, expect, it } from 'vitest';
import { isAiShortcut, shouldOpenAi } from './shortcut';

const key = (over: Partial<{ key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }>) => ({
  key: 'j', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...over,
});
const free = { mac: true, modalOpen: false, editableFocused: false, readOnly: false };

describe('AI shortcut', () => {
  it('is ⌘J on macOS and Ctrl+J elsewhere', () => {
    expect(isAiShortcut(key({ metaKey: true }), true)).toBe(true);
    expect(isAiShortcut(key({ ctrlKey: true }), true)).toBe(false);
    expect(isAiShortcut(key({ ctrlKey: true }), false)).toBe(true);
    expect(isAiShortcut(key({ metaKey: true, shiftKey: true }), true)).toBe(false);
    expect(isAiShortcut(key({ key: 'k', metaKey: true }), true)).toBe(false);
  });

  it('stands down behind a modal layer, while typing and when read-only', () => {
    const e = key({ metaKey: true });
    expect(shouldOpenAi(e, free)).toBe(true);
    expect(shouldOpenAi(e, { ...free, modalOpen: true })).toBe(false);
    expect(shouldOpenAi(e, { ...free, editableFocused: true })).toBe(false);
    expect(shouldOpenAi(e, { ...free, readOnly: true })).toBe(false);
  });
});
