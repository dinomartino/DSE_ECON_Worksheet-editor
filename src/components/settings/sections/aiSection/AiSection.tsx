'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient, testConnection } from '@/ai/client';
import { presetFor } from '@/ai/providers';
import { PROVIDER_IDS, type ModelInfo, type ProviderId } from '@/ai/types';
import { openExternal } from '@/platform';
import { deleteSecret, peekSecret, readSecret, writeSecret } from '@/platform/secrets';
import { AI_SETTINGS, providerChoice, useAiStatus, type AiSettings } from '@/settings/aiSettings';
import type { SettingsSectionProps } from '@/settings/sections';
import { appSettings, useSettings } from '@/settings/store';
import {
  aiSetupReducer,
  cardState,
  draftOf,
  initialAiSetup,
  needsCloseGuard,
  resumeReady,
  shouldSaveAfterTest,
  type AiSetupEvent,
  type AiSetupState,
} from './aiSetup';
import { AiSectionView } from './AiSectionView';

/**
 * Settings → AI & translation: pick a provider, save and test its key, choose a model.
 * Nothing is sent until Save & test (or List my models) is pressed. The state is the pure
 * `aiSetupReducer`; this component runs its side effects and writes settings live.
 */

const account = (p: ProviderId) => `ai:${p}` as const;
const peek = (p: ProviderId) => peekSecret(account(p));

/** Settings writes read the latest value, not the render's (handlers await in between). */
function patchAi(fn: (s: AiSettings) => Partial<AiSettings>): void {
  appSettings.write(AI_SETTINGS, fn(appSettings.read(AI_SETTINGS)));
}

function withFlag(flags: AiSettings['keychainSaved'], p: ProviderId, on: boolean): AiSettings['keychainSaved'] {
  const { [p]: _old, ...rest } = flags;
  void _old;
  return on ? { ...rest, [p]: true } : rest;
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
  const [state, setState] = useState<AiSetupState>(() => initialAiSetup(settings, env, params, peek));
  const [listed, setListed] = useState<{ provider: ProviderId; models: ModelInfo[] } | null>(null);
  const stateRef = useRef(state);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback((event: AiSetupEvent): AiSetupState => {
    const next = aiSetupReducer(stateRef.current, event);
    stateRef.current = next;
    setState(next);
    return next;
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const ready = resumeReady(state, settings.provider, status.configured);
  useEffect(() => setResumeReady(ready, RESUME_HINT), [ready, setResumeReady]);

  /** Writes the key to the secrets store and commits the provider. True when saved. */
  const persistKey = useCallback(
    async (key: string, remember: boolean): Promise<boolean> => {
      const p = stateRef.current.provider;
      const written = await writeSecret(account(p), key, { remember });
      if (!written.ok) {
        if (written.error.kind === 'denied') send({ type: 'keychainDenied' });
        return false;
      }
      send({ type: 'saved', store: written.store, last4: key.slice(-4) });
      patchAi((s) => ({ provider: p, keychainSaved: withFlag(s.keychainSaved, p, written.store === 'keychain') }));
      return true;
    },
    [send],
  );

  /** Save & test. Resolves true when the key (or a keyless provider) is now in use. */
  const saveAndTest = useCallback(
    async (anyway = false): Promise<boolean> => {
      const next = send(anyway ? { type: 'testAnyway' } : { type: 'saveAndTest' });
      if (next.test.kind !== 'testing') return false;
      const p = next.provider;
      const key = draftOf(next);
      abortRef.current?.abort();
      const abort = (abortRef.current = new AbortController());
      const { baseUrl } = providerChoice(appSettings.read(AI_SETTINGS), p);
      const result = await testConnection({ provider: p, apiKey: key || null, model: next.model, baseUrl }, abort.signal);
      if (abort.signal.aborted) return false;
      send({ type: 'testFinished', result });
      if (!shouldSaveAfterTest(result)) return false;
      if (key) return persistKey(key, next.remember);
      patchAi(() => ({ provider: p }));
      return result.ok;
    },
    [send, persistKey],
  );
  const saveRef = useRef(saveAndTest);
  useEffect(() => {
    saveRef.current = saveAndTest;
  }, [saveAndTest]);

  const guarded = needsCloseGuard(state);
  useEffect(() => {
    setCloseGuard(guarded ? { message: UNSAVED_KEY, save: { label: 'Save & test', run: () => saveRef.current() } } : null);
  }, [guarded, setCloseGuard]);
  useEffect(() => () => setCloseGuard(null), [setCloseGuard]);

  const actions: AiSectionActions = {
    selectProvider: (id) => {
      send({ type: 'selectProvider', id, ...cardState(appSettings.read(AI_SETTINGS), env, id, peek(id)) });
      update({ provider: id });
    },
    draft: (value) => send({ type: 'draft', value }),
    saveAndTest: () => void saveAndTest(),
    testAnyway: () => void saveAndTest(true),
    saveWithoutTesting: () => {
      const key = draftOf(stateRef.current);
      if (key) void persistKey(key, stateRef.current.remember);
      else patchAi(() => ({ provider: stateRef.current.provider }));
    },
    useForSession: () => {
      send({ type: 'useForSession' });
      const key = draftOf(stateRef.current);
      if (key) void persistKey(key, false);
    },
    retryKeychain: () => {
      const key = draftOf(stateRef.current);
      if (key) void persistKey(key, stateRef.current.remember);
    },
    remember: (value) => {
      send({ type: 'remember', value });
      update({ rememberKey: value });
      void moveSavedKey(stateRef.current.provider, value, send);
    },
    forgetAsked: (which) => send({ type: 'forgetAsked', which }),
    cancelForget: () => send({ type: 'cancelForget' }),
    forget: async () => {
      const which = stateRef.current.confirmForget;
      const p = stateRef.current.provider;
      if (which === 'all') await Promise.all(PROVIDER_IDS.map((id) => deleteSecret(account(id))));
      else await deleteSecret(account(p));
      patchAi((s) => ({ keychainSaved: which === 'all' ? {} : withFlag(s.keychainSaved, p, false) }));
      send({ type: 'forgotten' });
    },
    model: (id) => {
      const p = stateRef.current.provider;
      if (!AI_SETTINGS.fields.models({ [p]: id })?.[p]) return;
      send({ type: 'model', id });
      patchAi((s) => ({ models: { ...s.models, [p]: id } }));
    },
    baseUrl: (url) => {
      const p = stateRef.current.provider;
      send({ type: 'baseUrl', url });
      if (!AI_SETTINGS.fields.baseUrls({ [p]: url })?.[p]) return false;
      patchAi((s) => ({ baseUrls: { ...s.baseUrls, [p]: url } }));
      return true;
    },
    workspace: (value) => send({ type: 'workspace', value }),
    listModels: async () => {
      const current = stateRef.current;
      const p = current.provider;
      const typed = draftOf(current);
      const read = typed ? null : await readSecret(account(p));
      const apiKey = typed || (read?.ok ? read.value : null);
      if (presetFor(p).keyRequired && !apiKey) return;
      const { baseUrl } = providerChoice(appSettings.read(AI_SETTINGS), p);
      const models = await createClient({ provider: p, apiKey, model: current.model, baseUrl }).listModels(
        new AbortController().signal,
      );
      setListed({ provider: p, models });
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
  /** False when the URL is refused (https, or http on this computer only). */
  baseUrl(url: string): boolean;
  workspace(value: string): void;
  listModels(): Promise<void>;
  includeTeacher(value: boolean): void;
  getKey(url: string): void;
}

/** Remember toggled: move an already-saved key to the matching store. */
async function moveSavedKey(p: ProviderId, remember: boolean, send: (e: AiSetupEvent) => AiSetupState) {
  if (!peek(p) && !appSettings.read(AI_SETTINGS).keychainSaved[p]) return;
  const read = await readSecret(account(p));
  if (!read.ok || !read.value) return;
  const written = await writeSecret(account(p), read.value, { remember });
  if (!written.ok) {
    if (written.error.kind === 'denied') send({ type: 'keychainDenied' });
    return;
  }
  send({ type: 'saved', store: written.store, last4: read.value.slice(-4) });
  patchAi((s) => ({ keychainSaved: withFlag(s.keychainSaved, p, written.store === 'keychain') }));
}

