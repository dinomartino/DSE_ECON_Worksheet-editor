import { presetFor } from '@/ai/providers';
import type { ProviderId } from '@/ai/types';
import type { AiSettings } from '@/settings/aiSettings';
import type { SettingsEnv } from '@/settings/types';
import { initialAiSetup, TOP_PROVIDERS, type AiSetupState } from './aiSetup';
import type { AiSetupRunner } from './aiSetupRunner';
import type { SecretStore } from '@/platform/secrets';

/**
 * The menu's SetupCard over the Settings runner. A radio only shows a provider; a key is
 * saved and committed only after a passing test (`requireOk`), and then `onReady` runs
 * once so the verb the teacher clicked goes ahead.
 */

export interface SetupCardFlow {
  pick(id: ProviderId): void;
  draft(value: string): void;
  submit(): Promise<void>;
  testAnyway(): Promise<void>;
  useForSession(): Promise<void>;
  retryKeychain(): Promise<void>;
  remember(value: boolean): void;
}

export function createSetupCardFlow(runner: AiSetupRunner, onReady: () => void): SetupCardFlow {
  let done = false;
  const finish = async (saved: Promise<unknown>) => {
    const ok = (await saved) === true && runner.current().test.kind === 'ok';
    if (ok && !done) {
      done = true;
      onReady();
    }
  };
  return {
    pick: (id) => runner.selectProvider(id, false),
    draft: runner.draft,
    submit: () => finish(runner.saveAndTest(false, { requireOk: true })),
    testAnyway: () => finish(runner.saveAndTest(true, { requireOk: true })),
    useForSession: () => finish(runner.useForSession()),
    retryKeychain: () => finish(runner.retryKeychain()),
    remember: (value) => void runner.remember(value),
  };
}

/** The card opens on the committed provider when it is a first choice, else on Gemini. */
export function initialSetupCard(
  settings: AiSettings,
  env: SettingsEnv,
  peek: (provider: ProviderId) => { store: SecretStore; last4: string } | null,
): AiSetupState {
  const provider = TOP_PROVIDERS.includes(settings.provider) ? settings.provider : 'gemini';
  return initialAiSetup(settings, env, { provider }, peek);
}

/** The region refusal, as one line naming the refusing provider. */
export function regionLine(provider: ProviderId): string {
  return provider === 'gemini'
    ? 'Gemini isn’t offered in Hong Kong without a VPN — try DeepSeek or Qwen.'
    : `${presetFor(provider).label} refused a request from your location — try DeepSeek or Qwen.`;
}
