import { createClient, testConnection } from '@/ai/client';
import { deleteSecret, peekSecret, readSecret, writeSecret } from '@/platform/secrets';
import { AI_SETTINGS } from '@/settings/aiSettings';
import { appSettings } from '@/settings/store';
import type { SettingsEnv } from '@/settings/types';
import type { AiSetupDeps } from './aiSetupRunner';

/** The real side effects behind `createAiSetupRunner`: shared by Settings' AI section and the menu's SetupCard. */
export function liveDeps(env: SettingsEnv): AiSetupDeps {
  return {
    env,
    testConnection,
    listModels: (config, signal) => createClient(config).listModels(signal),
    readSecret,
    writeSecret,
    deleteSecret,
    peekSecret,
    readSettings: () => appSettings.read(AI_SETTINGS),
    writeSettings: (patch) => void appSettings.write(AI_SETTINGS, patch),
  };
}

export function secretPlatform(desktop: boolean): 'mac' | 'windows' | 'web' {
  if (!desktop) return 'web';
  return typeof navigator !== 'undefined' && /Windows|Win32|Win64/.test(navigator.userAgent ?? '') ? 'windows' : 'mac';
}
