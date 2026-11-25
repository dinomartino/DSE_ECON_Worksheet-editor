import type { BiDraft } from '@/generate/types';

/**
 * The concept a request's questions must test (k-0554), as step 1 reads it (`pick.ts`):
 * small and free of the syllabus data, so the chat's storage can read it too.
 */

/** The longest concept phrase kept, per language. */
export const MAX_CONCEPT_CHARS = 240;

/** A concept as it is kept: trimmed, capped; undefined when both sides are empty or it is not the shape. */
export function conceptOf(value: unknown): BiDraft | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { en, zh } = value as { en?: unknown; zh?: unknown };
  const side = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, MAX_CONCEPT_CHARS) : '');
  const out = { en: side(en), zh: side(zh) };
  return out.en || out.zh ? out : undefined;
}

/** The reply's concept (k-0554); undefined when it gave none. */
export function parseConcept(text: string): BiDraft | undefined {
  try {
    const data = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as { concept?: unknown };
    return conceptOf(data?.concept);
  } catch {
    return undefined;
  }
}
