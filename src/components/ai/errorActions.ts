import { presetFor } from '@/ai/providers';
import type { AiErrorInfo, ProviderId } from '@/ai/types';
import { useAiRun } from '@/assist/runStore';
import { copyMessages } from '@/components/translate/text';
import { openExternal } from '@/platform';
import { peekSecret } from '@/platform/secrets';
import { AI_SETTINGS } from '@/settings/aiSettings';
import { appSettings } from '@/settings/store';
import { useAppDialogs } from '@/store/appDialogs';

/** The alternatives offered when a provider refuses the location (after Try again). */
const HK_PROVIDERS: ProviderId[] = ['deepseek', 'qwen'];
const SHORT_NAME: Partial<Record<ProviderId, string>> = { deepseek: 'DeepSeek', qwen: 'Qwen', gemini: 'Gemini' };

export type ErrorAction =
  | { kind: 'useProvider'; provider: ProviderId; label: string }
  | { kind: 'keyPage' | 'fallbackModel' | 'chooseModel' | 'settings' | 'retry'; label: string };

/** The buttons an error earns, in order: only the actions it names (the old ErrorPanel's rules). */
export function errorActions(error: AiErrorInfo): ErrorAction[] {
  const copy = copyMessages();
  const preset = presetFor(error.provider);
  const region = error.kind === 'region';
  const has = (action: AiErrorInfo['actions'][number]) => error.actions.includes(action);
  const out: ErrorAction[] = [];
  // Region: Try again comes first (a VPN turned on fixes Gemini), the alternatives after.
  if (region && has('retry')) out.push({ kind: 'retry', label: copy.tryAgain });
  if (region) {
    for (const provider of HK_PROVIDERS.filter((id) => id !== error.provider)) {
      out.push({ kind: 'useProvider', provider, label: copy.useProvider(SHORT_NAME[provider] ?? presetFor(provider).label) });
    }
  }
  if (has('openKeyPage') && preset.keyUrl) out.push({ kind: 'keyPage', label: copy.getNewKey });
  if (has('openBilling') && preset.keyUrl) out.push({ kind: 'keyPage', label: copy.openProvider(preset.label) });
  const fallback = preset.quotaFallbackModel;
  if (has('useFallbackModel') && fallback) {
    out.push({ kind: 'fallbackModel', label: copy.switchModel(preset.models.find((m) => m.id === fallback)?.label ?? fallback) });
  }
  if (has('chooseModel')) out.push({ kind: 'chooseModel', label: copy.chooseModel });
  if (!region && has('switchProvider')) out.push({ kind: 'settings', label: copy.switchProvider });
  if (region || has('openSettings')) out.push({ kind: 'settings', label: copy.openSettings });
  if (!region && has('retry')) out.push({ kind: 'retry', label: copy.tryAgain });
  return out;
}

/** Only Gemini's region error carries a note: keep the VPN on, or use DeepSeek or Qwen. */
export const errorNote = (error: AiErrorInfo): string | undefined =>
  error.kind === 'region' && error.provider === 'gemini' ? `${copyMessages().regionGeminiNote} ${copyMessages().hkProvidersNote}` : undefined;

const aiSettings = () => appSettings.read(AI_SETTINGS);
const keySaved = (provider: ProviderId) => peekSecret(`ai:${provider}`) !== null || aiSettings().keychainSaved[provider] === true;

/** What an error's buttons drive: the editor's run (`useAiRun`) or the question bank's. */
export interface RunControl {
  retry(): void;
  dismiss(): void;
}

const editorRun: RunControl = {
  retry: () => useAiRun.getState().retry(),
  dismiss: () => useAiRun.getState().dismiss(),
};

function openSettings(run: RunControl, focus: 'key' | 'model', params?: Record<string, string>) {
  run.dismiss();
  useAppDialogs.getState().openSettings({ section: 'ai', focus, ...(params ? { params } : {}) });
}

/** Region: switch and retry when that provider's key is saved, else set it up in Settings. */
export function runErrorAction(action: ErrorAction, error: AiErrorInfo, run: RunControl = editorRun): void {
  switch (action.kind) {
    case 'useProvider':
      if (!keySaved(action.provider)) return openSettings(run, 'key', { provider: action.provider, reason: 'region' });
      appSettings.write(AI_SETTINGS, { provider: action.provider });
      return run.retry();
    case 'keyPage': {
      const url = presetFor(error.provider).keyUrl;
      if (url) void openExternal(url);
      return;
    }
    case 'fallbackModel': {
      const model = presetFor(error.provider).quotaFallbackModel;
      if (!model) return;
      appSettings.write(AI_SETTINGS, { models: { ...aiSettings().models, [error.provider]: model } });
      return run.retry();
    }
    case 'chooseModel':
      return openSettings(run, 'model');
    case 'settings':
      return openSettings(run, 'key');
    case 'retry':
      return run.retry();
  }
}
