/**
 * Self-updates, when running inside the Tauri shell.
 *
 * Every Tauri API is reached by `import()` *inside* a function. A top-level import
 * would put `@tauri-apps/*` in the web bundle, where those modules throw on load.
 * Nothing here ever throws at the caller: a failed check is not worth a broken editor.
 */

/** True only inside the desktop shell; the web build has no `__TAURI_INTERNALS__`. */
function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export interface AvailableUpdate {
  version: string;
  notes?: string;
  /** Download, install, and relaunch into the new version. */
  install: () => Promise<void>;
}

/** The available update, or null when there is none (and always null on the web). */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (!isDesktop()) return null;

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) return null;

    return {
      version: update.version,
      notes: update.body,
      install: async () => {
        await update.downloadAndInstall();
        const { relaunch } = await import('@tauri-apps/plugin-process');
        await relaunch();
      },
    };
  } catch (error) {
    console.warn('Update check failed', error);
    return null;
  }
}

/** The running app's version, or null on the web. */
export async function currentVersion(): Promise<string | null> {
  if (!isDesktop()) return null;

  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    return await getVersion();
  } catch (error) {
    console.warn('Could not read the app version', error);
    return null;
  }
}
