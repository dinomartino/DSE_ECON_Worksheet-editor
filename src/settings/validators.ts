import type { FieldValidator } from './types';

/** Field validators: the value when valid, else undefined (that field falls back to its
 *  default and the rest of the section survives). None throws. */

export const bool: FieldValidator<boolean> = (raw) => (typeof raw === 'boolean' ? raw : undefined);

export function oneOf<V extends string>(values: readonly V[]): FieldValidator<V> {
  return (raw) => (typeof raw === 'string' && (values as readonly string[]).includes(raw) ? (raw as V) : undefined);
}

export function text(max: number, pattern?: RegExp): FieldValidator<string> {
  return (raw) => {
    if (typeof raw !== 'string' || raw.length > max) return undefined;
    if (pattern && !pattern.test(raw)) return undefined;
    return raw;
  };
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * https: any host; http: only localhost / 127.0.0.1 / [::1]; no credentials in the URL.
 * An unfilled preset template (`https://{WorkspaceId}.…`) is never a saved address.
 */
export const baseUrl: FieldValidator<string> = (raw) => {
  if (typeof raw !== 'string' || raw.length > 2048 || /[{}]/.test(raw)) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.username || url.password) return undefined;
  if (url.protocol === 'https:') return raw;
  if (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)) return raw;
  return undefined;
};

/** Validates each entry; drops invalid ones instead of the whole record. */
export function recordOf<K extends string, V>(
  keys: readonly K[],
  value: FieldValidator<V>,
): FieldValidator<Partial<Record<K, V>>> {
  return (raw) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
    const out: Partial<Record<K, V>> = {};
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
      const valid = value((raw as Record<string, unknown>)[key]);
      if (valid !== undefined) out[key] = valid;
    }
    return out;
  };
}

export const trueFlag: FieldValidator<true> = (raw) => (raw === true ? true : undefined);
