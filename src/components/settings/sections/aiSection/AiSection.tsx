'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { createClient, testConnection } from '@/ai/client';
import type { ModelInfo, ProviderId } from '@/ai/types';
import { openExternal } from '@/platform';
import { deleteSecret, peekSecret, readSecret, writeSecret } from '@/platform/secrets';
import { AI_SETTINGS, useAiStatus } from '@/settings/aiSettings';
import type { SettingsSectionProps } from '@/settings/sections';
import { appSettings, useSettings } from '@/settings/store';
import type { SettingsEnv } from '@/settings/types';
import { initialAiSetup, needsCloseGuard, resumeReady } from './aiSetup';
import { createAiSetupRunner, type AiSetupDeps } from './aiSetupRunner';
import { AiSectionView } from './AiSectionView';

/**
 * Settings → AI & translation: pick a provider, save and test its key, choose a model.
 * Nothing is sent until Save & test (or List my models) is pressed. The state is the pure
 * `aiSetupReducer`; `createAiSetupRunner` runs its side effects and writes settings live.
 */

function liveDeps(env: SettingsEnv): AiSetupDeps {
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

export const UNSAVED_KEY = "You haven't saved this key.";
export const RESUME_HINT = 'Save & test a key first';

export default function AiSection({ env, focus, params, setResumeReady, setCloseGuard }: SettingsSectionProps) {
  const [settings, update] = useSettings(AI_SETTINGS);
  const status = useAiStatus();
  const [runner] = useState(() =>
    createAiSetupRunner(liveDeps(env), initialAiSetup(settings, env, params, (p) => peekSecret(`ai:${p}`))),
  );
  const state = useSyncExternalStore(runner.subscribe, runner.current, runner.current);
  const [listed, setListed] = useState<{ provider: ProviderId; models: ModelInfo[] } | null>(null);

  useEffect(() => () => runner.dispose(), [runner]);

  const ready = resumeReady(state, settings.provider, status.configured);
  useEffect(() => setResumeReady(ready, RESUME_HINT), [ready, setResumeReady]);

  const guarded = needsCloseGuard(state);
  useEffect(() => {
    setCloseGuard(guarded ? { message: UNSAVED_KEY, save: { label: 'Save & test', run: () => runner.saveAndTest() } } : null);
  }, [guarded, setCloseGuard, runner]);
  useEffect(() => () => setCloseGuard(null), [setCloseGuard]);

  const actions: AiSectionActions = {
    selectProvider: runner.selectProvider,
    draft: runner.draft,
    saveAndTest: () => void runner.saveAndTest(),
    testAnyway: () => void runner.saveAndTest(true),
    saveWithoutTesting: () => void runner.saveWithoutTesting(),
    useForSession: () => void runner.useForSession(),
    retryKeychain: () => void runner.retryKeychain(),
    remember: (value) => void runner.remember(value),
    forgetAsked: runner.forgetAsked,
    cancelForget: runner.cancelForget,
    forget: runner.forget,
    model: runner.model,
    baseUrl: runner.baseUrl,
    workspace: runner.workspace,
    listModels: async () => {
      const result = await runner.listModels();
      if (result) setListed(result);
    },
    includeTeacher: (value) => update({ includeTeacherText: value }),
    getKey: (url) => void openExternal(url),
  };

  return (
    <AiSectionView
      env={env}
      focus={focus}
      state={state}
      settings={settings}
      configured={status.configured}
      listed={listed?.provider === state.provider ? listed.models : null}
      platform={secretPlatform(env.desktop)}
      actions={actions}
    />
  );
}

export interface AiSectionActions {
  selectProvider(id: ProviderId): void;
  draft(value: string): void;
  saveAndTest(): void;
  testAnyway(): void;
  saveWithoutTesting(): void;
  useForSession(): void;
  retryKeychain(): void;
  remember(value: boolean): void;
  forgetAsked(which: 'one' | 'all'): void;
  cancelForget(): void;
  forget(): Promise<void>;
  model(id: string): void;
  /** False when the URL is refused (https, or http on this computer only); null blocks the test. */
  baseUrl(url: string | null): boolean;
  workspace(value: string): void;
  listModels(): Promise<void>;
  includeTeacher(value: boolean): void;
  getKey(url: string): void;
}
