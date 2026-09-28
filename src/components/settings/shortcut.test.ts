import { describe, expect, it } from 'vitest';
import { isSettingsShortcut, shouldOpenSettings, type KeyLike } from './shortcut';

const key = (extra: Partial<KeyLike>): KeyLike => ({
  key: ',',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...extra,
});
const ctx = { mac: true, modalOpen: false, editableFocused: false, sections: 1 };

describe('the Settings shortcut', () => {
  it('is ⌘, on macOS and Ctrl+, elsewhere', () => {
    expect(isSettingsShortcut(key({ metaKey: true }), true)).toBe(true);
    expect(isSettingsShortcut(key({ ctrlKey: true }), true)).toBe(false);
    expect(isSettingsShortcut(key({ ctrlKey: true }), false)).toBe(true);
    expect(isSettingsShortcut(key({ metaKey: true }), false)).toBe(false);
  });

  it('rejects Alt, Shift, both modifiers, no modifier and other keys', () => {
    expect(isSettingsShortcut(key({ metaKey: true, altKey: true }), true)).toBe(false);
    expect(isSettingsShortcut(key({ metaKey: true, shiftKey: true }), true)).toBe(false);
    expect(isSettingsShortcut(key({ metaKey: true, ctrlKey: true }), true)).toBe(false);
    expect(isSettingsShortcut(key({}), true)).toBe(false);
    expect(isSettingsShortcut(key({ key: '.', metaKey: true }), true)).toBe(false);
  });

  it('does nothing while a modal owns the keyboard, while typing, or with no sections', () => {
    const cmd = key({ metaKey: true });
    expect(shouldOpenSettings(cmd, ctx)).toBe(true);
    expect(shouldOpenSettings(cmd, { ...ctx, modalOpen: true })).toBe(false);
    expect(shouldOpenSettings(cmd, { ...ctx, editableFocused: true })).toBe(false);
    expect(shouldOpenSettings(cmd, { ...ctx, sections: 0 })).toBe(false);
  });
});
