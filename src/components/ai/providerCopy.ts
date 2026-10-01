import type { ProviderPreset } from '@/ai/types';
import { resolveMessages, sideOf } from '@/i18n/catalogue';
import { uiLanguage } from '@/i18n/language';
import type { UiLanguage } from '@/settings/language';
import { PROVIDER_COPY_MESSAGES } from './providerCopy.messages';

/**
 * A preset's own sentences in the interface language. English is the preset's text
 * itself; 中文 comes from the catalogue, and a preset without an entry stays English.
 */

const keyOf = (id: string, part: 'Blurb' | 'Privacy' | 'Hk' | 'KeyHint') => `${id}${part}`;
const MODEL_NOTE_KEYS: Readonly<Record<string, string>> = {
  'gemini-3.5-flash-lite': 'geminiFlashLiteNote',
  'gemini-3.8-flash': 'geminiFlashNote',
};
const CHOICE_KEYS: Readonly<Record<string, string>> = {
  'Singapore (international)': 'qwenSingapore',
  'Hong Kong workspace': 'qwenHkWorkspace',
  'Singapore workspace': 'qwenSingaporeWorkspace',
};

function zhText(key: string | undefined, lang: UiLanguage): string | undefined {
  if (!key || sideOf(lang) !== 'zh') return undefined;
  return (resolveMessages(PROVIDER_COPY_MESSAGES, lang) as Record<string, string | undefined>)[key];
}

export function providerCopy(preset: ProviderPreset, lang: UiLanguage = uiLanguage()) {
  return {
    blurb: zhText(keyOf(preset.id, 'Blurb'), lang) ?? preset.blurb,
    privacy: zhText(keyOf(preset.id, 'Privacy'), lang) ?? preset.privacy,
    hkNote: zhText(keyOf(preset.id, 'Hk'), lang) ?? preset.hk.note,
    keyHint: preset.keyHint === undefined ? undefined : (zhText(keyOf(preset.id, 'KeyHint'), lang) ?? preset.keyHint),
  };
}

/** The note beside a suggested model. */
export function modelNote(modelId: string, note: string | undefined, lang: UiLanguage = uiLanguage()): string | undefined {
  return note === undefined ? undefined : (zhText(MODEL_NOTE_KEYS[modelId], lang) ?? note);
}

/** A region choice's name (Qwen's workspaces). */
export function baseUrlChoiceLabel(label: string, lang: UiLanguage = uiLanguage()): string {
  return zhText(CHOICE_KEYS[label], lang) ?? label;
}
