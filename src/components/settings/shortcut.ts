/**
 * ⌘, (macOS) / Ctrl+, (elsewhere) opens app Settings. Pure, so the rules are testable
 * without a DOM; `AppSettingsHost` owns the one listener.
 */

export interface KeyLike { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }

export function isSettingsShortcut(e: KeyLike, mac: boolean): boolean {
  if (e.key !== ',' || e.altKey || e.shiftKey) return false;
  return mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}

/** Ignored while a dialog, canvas or menu owns the keyboard, while typing, and with no section. */
export function shouldOpenSettings(
  e: KeyLike,
  ctx: { mac: boolean; modalOpen: boolean; editableFocused: boolean; sections: number },
): boolean {
  return ctx.sections > 0 && !ctx.modalOpen && !ctx.editableFocused && isSettingsShortcut(e, ctx.mac);
}

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/.test(`${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`);
}

/** The undo handler's test: typing in a field keeps its own shortcuts. */
export function isEditableFocused(): boolean {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement;
  return (
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLInputElement ||
    active instanceof HTMLSelectElement ||
    (active instanceof HTMLElement && active.isContentEditable)
  );
}
