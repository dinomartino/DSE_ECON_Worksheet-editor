import { questionIdOwners } from '@/model/lineage';
import type { Question } from '@/model/types';

/** Fields that say where a copy sits or came from, not what it says. */
const IGNORED = ['lineage', 'tags', 'gapBefore'] as const;

/**
 * A fingerprint of what a question says: every id `questionIdOwners` finds is blanked and
 * `lineage`, `tags` and `gapBefore` dropped, so `freshIds` copies are equal and any text
 * edit is not. Keys are sorted, so field order never matters.
 */
export function contentKey(question: Question): string {
  const copy = structuredClone(question) as Question & Record<string, unknown>;
  for (const { owner } of questionIdOwners(copy)) owner.id = '';
  for (const key of IGNORED) delete copy[key];
  return hash(stableJson(copy));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** cyrb53: a fast 53-bit string hash, as base-36. Not cryptographic; collisions are negligible here. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
