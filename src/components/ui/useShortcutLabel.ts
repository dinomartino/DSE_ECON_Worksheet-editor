'use client';

import { useSyncExternalStore } from 'react';
import { isMacPlatform } from '@/components/settings/shortcut';

const noSubscribe = () => () => {};

/**
 * A command key as the teacher's keyboard writes it: "⌘S" on a Mac, iPad or iPhone, "Ctrl+S"
 * elsewhere. The server render says Ctrl until hydrated.
 */
export function useShortcutLabel(key: string): string {
  const mac = useSyncExternalStore(noSubscribe, isMacPlatform, () => false);
  return mac ? `⌘${key}` : `Ctrl+${key}`;
}
