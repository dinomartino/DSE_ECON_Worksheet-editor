import { presetFor } from './providers';
import type { ProviderId } from './types';

/** Prefixes that name one provider, most specific first: `sk-ant-` and `sk-or-` before plain `sk-`. */
const OWNED_PREFIXES: ReadonlyArray<readonly [string, ProviderId]> = [
  ['sk-ant-', 'anthropic'],
  ['sk-or-', 'openrouter'],
  ['sk-proj-', 'openai'],
  ['AIza', 'gemini'],
];

const article = (label: string) => (/^[AEIOU]/.test(label) ? 'an' : 'a');

/**
 * Runs before anything is sent: a key whose visible prefix belongs to another provider is
 * never sent without the teacher's "test anyway". Null when nothing looks wrong. Plain
 * `sk-` keys (DeepSeek, Qwen, legacy OpenAI) can't be told apart and pass.
 */
export function keyShapeProblem(provider: ProviderId, key: string): { likely?: ProviderId; message: string } | null {
  const k = key.trim();
  if (!k || provider === 'custom' || provider === 'ollama') return null;
  const owner = OWNED_PREFIXES.find(([prefix]) => k.startsWith(prefix))?.[1];
  if (owner && owner !== provider) {
    const label = presetFor(owner).label;
    return { likely: owner, message: `This looks like ${article(label)} ${label} key — switch to ${label}?` };
  }
  if (owner) return null;
  if (provider === 'gemini' && k.startsWith('sk-')) {
    return { message: "This isn't a Google key. Which provider is it from?" };
  }
  const prefix = presetFor(provider).keyPrefix;
  if (prefix && !prefix.test(k)) {
    const label = presetFor(provider).label;
    return { message: `This doesn't look like ${article(label)} ${label} key.` };
  }
  return null;
}
