import type { KeyLike } from '@/components/settings/shortcut';

/** ⌘J (macOS) / Ctrl+J (elsewhere) opens the AI menu. Pure; `AiHost` owns the listener. */
export function isAiShortcut(e: KeyLike, mac: boolean): boolean {
  if (e.key.toLowerCase() !== 'j' || e.altKey || e.shiftKey) return false;
  return mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}

/** Ignored while a dialog, canvas or menu owns the keyboard, while typing, and when read-only. */
export function shouldOpenAi(
  e: KeyLike,
  ctx: { mac: boolean; modalOpen: boolean; editableFocused: boolean; readOnly: boolean },
): boolean {
  return !ctx.modalOpen && !ctx.editableFocused && !ctx.readOnly && isAiShortcut(e, ctx.mac);
}
