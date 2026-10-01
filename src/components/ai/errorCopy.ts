import { GEMINI_REGION_MESSAGE } from '@/ai/errors';
import { presetFor } from '@/ai/providers';
import type { AiErrorInfo } from '@/ai/types';
import { resolveMessages, sideOf } from '@/i18n/catalogue';
import { uiLanguage } from '@/i18n/language';
import type { UiLanguage } from '@/settings/language';
import { ERROR_COPY_MESSAGES } from './errorCopy.messages';

/**
 * A provider failure's sentence in the interface language. `src/ai/errors.ts` writes
 * English; a message that is that text is swapped for its 中文 here, and anything else
 * (a provider's own words, a message already localized) passes through untouched.
 */

const CJK = /[㐀-鿿]/;

const NETWORK = /^Couldn't reach (.+?)\. Check your connection\./;
const MODEL = /“(.+)”/;

/** Gemini's region refusal, the line Settings and the setup card repeat. */
export function geminiRegionMessage(lang: UiLanguage = uiLanguage()): string {
  return sideOf(lang) === 'zh' ? resolveMessages(ERROR_COPY_MESSAGES, lang).geminiRegion : GEMINI_REGION_MESSAGE;
}

export function localizedErrorMessage(
  info: Pick<AiErrorInfo, 'kind' | 'provider' | 'message'>,
  lang: UiLanguage = uiLanguage(),
): string {
  if (sideOf(lang) !== 'zh' || CJK.test(info.message)) return info.message;
  const en = resolveMessages(ERROR_COPY_MESSAGES, 'en');
  const zh = resolveMessages(ERROR_COPY_MESSAGES, lang);
  const gemini = info.provider === 'gemini';
  const p = presetFor(info.provider).label;
  const pick = (english: string, chinese: string) => (info.message === english ? chinese : undefined);
  switch (info.kind) {
    case 'notConfigured':
      return pick(en.notConfigured, zh.notConfigured) ?? info.message;
    case 'region':
      return (gemini ? pick(en.geminiRegion, zh.geminiRegion) : pick(en.region(p), zh.region(p))) ?? info.message;
    case 'badKey':
      return pick(en.badKey(p), zh.badKey(p)) ?? info.message;
    case 'keyBlocked':
      return (gemini ? pick(en.geminiKeyBlocked, zh.geminiKeyBlocked) : pick(en.keyBlocked(p), zh.keyBlocked(p))) ?? info.message;
    case 'networkOrKey':
      return pick(en.networkOrKey(p), zh.networkOrKey(p)) ?? info.message;
    case 'network': {
      const host = NETWORK.exec(info.message)?.[1];
      if (!host) return info.message;
      const suffix = info.provider === 'ollama' ? en.networkOllama : info.provider === 'custom' ? en.networkCustom : '';
      const zhSuffix = info.provider === 'ollama' ? zh.networkOllama : info.provider === 'custom' ? zh.networkCustom : '';
      return pick(en.network(host) + suffix, zh.network(host) + zhSuffix) ?? info.message;
    }
    case 'quota':
      return (gemini ? pick(en.geminiQuota(p), zh.geminiQuota(p)) : pick(en.quota(p), zh.quota(p))) ?? info.message;
    case 'billing':
      return pick(en.billing(p), zh.billing(p)) ?? info.message;
    case 'model': {
      const model = MODEL.exec(info.message)?.[1];
      const named = model ? pick(en.modelNamed(p, model), zh.modelNamed(p, model)) : undefined;
      return named ?? pick(en.model(p), zh.model(p)) ?? info.message;
    }
    case 'policy':
      return pick(en.policy, zh.policy) ?? info.message;
    case 'badRequest':
      return pick(en.badRequest(p), zh.badRequest(p)) ?? info.message;
    case 'server':
      return pick(en.server(p), zh.server(p)) ?? info.message;
    case 'timeout':
      return pick(en.timeout(p), zh.timeout(p)) ?? info.message;
    case 'cancelled':
      return pick(en.cancelled, zh.cancelled) ?? info.message;
    case 'safety':
      return pick(en.safety, zh.safety) ?? info.message;
    case 'truncated':
      return pick(en.truncated, zh.truncated) ?? info.message;
    case 'badOutput':
      return pick(en.badOutput, zh.badOutput) ?? info.message;
  }
}
