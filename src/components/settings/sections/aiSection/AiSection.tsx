'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ModelInfo, ProviderId } from '@/ai/types';
import { openExternal } from '@/platform';
import { peekSecret } from '@/platform/secrets';
import { AI_SETTINGS, useAiStatus } from '@/settings/aiSettings';
import type { SettingsSectionProps } from '@/settings/sections';
import { useSettings } from '@/settings/store';
import { initialAiSetup, needsCloseGuard } from './aiSetup';
import { liveDeps, secretPlatform } from './aiSetupLive';
import { createAiSetupRunner } from './aiSetupRunner';
import { AiSectionView } from './AiSectionView';

/**
 * Settings → AI & translation: pick a provider, save and test its key, choose a model.
 * Nothing is sent until Save & test (or List my models) is pressed. The state is the pure
 * `aiSetupReducer`; `createAiSetupRunner` runs its side effects and writes settings live.
 */

export { secretPlatform };

export const UNSAVED_KEY = "You haven't saved this key.";

export default function AiSection({ env, focus, params, setCloseGuard }: SettingsSectionProps) {
  const [settings, update] = useSettings(AI_SETTINGS);
  const status = useAiStatus();
  const [runner] = useState(() =>
    createAiSetupRunner(liveDeps(env), initialAiSetup(settings, env, params, (p) => peekSecret(`ai:${p}`))),
  );
  const state = useSyncExternalStore(runner.subscribe, runner.current, runner.current);
  const [listed, setListed] = useState<{ provider: ProviderId; models: ModelInfo[] } | null>(null);

  useEffect(() => () => runner.dispose(), [runner]);

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
