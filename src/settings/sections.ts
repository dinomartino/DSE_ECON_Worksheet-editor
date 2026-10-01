import { useSyncExternalStore, type ComponentType } from 'react';
import type { UiText } from '@/i18n/catalogue';
import type { SettingsEnv, SettingsSectionId } from './types';

/**
 * The Settings section registry: a new tab is one file plus one import line. A section
 * file registers its metadata at module scope; its pane loads lazily through `load`.
 * Only registered, available sections render, so with none every entry point is absent.
 */

export interface SettingsSectionProps {
  env: SettingsEnv;
  /** Deep-link focus inside the section, e.g. 'key' | 'model'. The field scrolls into view. */
  focus?: string;
  /** Deep-link parameters, e.g. { provider: 'deepseek', reason: 'region' }. */
  params?: Readonly<Record<string, string>>;
  /** Something typed but not committed (AI: a pasted key). Done, Escape, ✕ and the
   *  scrim then ask first instead of closing. null clears it. */
  setCloseGuard(guard: CloseGuard | null): void;
}
export interface CloseGuard {
  /** "You haven't saved this key." */
  message: string;
  /** "Save & test"; true → the close proceeds. */
  save: { label: string; run: () => Promise<boolean> };
}
export interface SettingsSectionDef {
  /** Unique; also the deep-link name. */
  id: SettingsSectionId;
  /** Rail label: 'AI & translation', or a catalogue entry. */
  label: UiText;
  /** Rail sub-line: 'Provider, key, model'. */
  hint?: UiText;
  /** One line under the section heading. */
  description: UiText;
  order: number;
  /** e.g. a desktop-only section. */
  available?: (env: SettingsEnv) => boolean;
  /** The pane, loaded only when the dialog shows this section (React.lazy). */
  load: () => Promise<{ default: ComponentType<SettingsSectionProps> }>;
  /** Mounted by AppSettingsHost for every available section, dialog open or not (a theme
   *  applies app-wide). It is in first load, so keep it tiny. */
  Effect?: ComponentType<{ env: SettingsEnv }>;
}

const registry = new Map<SettingsSectionId, SettingsSectionDef>();
const listeners = new Set<() => void>();
/** Sorted lists per environment, dropped on every registration so snapshots stay stable. */
const snapshots = new Map<boolean, readonly SettingsSectionDef[]>();

/** Replaces a def with the same id (Next Fast Refresh re-evaluates section modules); ids stay unique. */
export function registerSettingsSection(def: SettingsSectionDef): void {
  registry.set(def.id, def);
  snapshots.clear();
  for (const listener of [...listeners]) listener();
}

/** Sorted by order, available only. */
export function settingsSections(env: SettingsEnv): SettingsSectionDef[] {
  return [...registry.values()]
    .filter((def) => def.available?.(env) ?? true)
    .sort((a, b) => a.order - b.order);
}

function snapshot(env: SettingsEnv): readonly SettingsSectionDef[] {
  let list = snapshots.get(env.desktop);
  if (!list) {
    list = settingsSections(env);
    snapshots.set(env.desktop, list);
  }
  return list;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders when a section registers, so an entry point never depends on import order. */
export function useSettingsSections(env: SettingsEnv): readonly SettingsSectionDef[] {
  const read = () => snapshot(env);
  return useSyncExternalStore(subscribe, read, read);
}
