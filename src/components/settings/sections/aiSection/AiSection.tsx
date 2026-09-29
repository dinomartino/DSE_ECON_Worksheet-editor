'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { PROVIDER_IDS, type ModelInfo, type ProviderId } from '@/ai/types';
import { openExternal } from '@/platform';
import { peekSecret, subscribeSecrets } from '@/platform/secrets';
import { AI_SETTINGS, useAiStatus } from '@/settings/aiSettings';
import type { SettingsSectionProps } from '@/settings/sections';
import { useSettings } from '@/settings/store';
import { initialAiSetup, needsCloseGuard, savedKeys } from './aiSetup';
import { liveDeps, secretPlatform } from './aiSetupLive';
import { createAiSetupRunner } from './aiSetupRunner';
import { AiSectionView } from './AiSectionView';

/**
 * Settings → AI & translation: your saved keys, then pick a provider, save and test its key,
 * choose a model. Nothing is sent until Test, Save & test or List my models is pressed. The state is the pure
 * `aiSetupReducer`; `createAiSetupRunner` runs its side effects and writes settings live.
 */

export { secretPlatform };

export const UNSAVED_KEY = "You haven't saved this key.";

type Peek = ReturnType<typeof peekSecret>;
/** Every provider's peek (store and last4 only), as one string so a change re-renders. */
const peekAll = () => JSON.stringify(PROVIDER_IDS.map((p) => peekSecret(`ai:${p}`)));
function subscribeKeys(listener: () => void): () => void {
  const off = subscribeSecrets(listener);
  // A key remembered or forgotten in another tab.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith('econgen.secret.')) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    off();
    window.removeEventListener('storage', onStorage);
  };
}

export default function AiSection({ env, focus, params, setCloseGuard }: SettingsSectionProps) {
  const [settings, update] = useSettings(AI_SETTINGS);
  const status = useAiStatus();
  const [runner] = useState(() =>
    createAiSetupRunner(liveDeps(env), initialAiSetup(settings, env, params, (p) => peekSecret(`ai:${p}`))),
  );
  const state = useSyncExternalStore(runner.subscribe, runner.current, runner.current);
  const [listed, setListed] = useState<{ provider: ProviderId; models: ModelInfo[] } | null>(null);
  // Read each render: after a desktop test reads the keychain, a key's last 4 is known.
  const peeks = JSON.parse(useSyncExternalStore(subscribeKeys, peekAll, peekAll)) as Peek[];
  const keys = savedKeys(settings, env, (p) => peeks[PROVIDER_IDS.indexOf(p)] ?? null);

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
    testSaved: (p) => void runner.testSaved(p),
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
      keys={keys}
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
  /** Tests a provider's saved key; the shown card and the provider in use stay. */
  testSaved(provider: ProviderId): void;
  saveWithoutTesting(): void;
  useForSession(): void;
  retryKeychain(): void;
  remember(value: boolean): void;
  forgetAsked(which: ProviderId | 'all'): void;
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
