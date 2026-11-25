import type { Worksheet } from './types';

/**
 * The document's origin id (k-0558): a random UUID v4 that every exported file carries in
 * its hidden metadata (`export/origin.ts`), so a teacher can later tell a `.docx` or PDF
 * came from this app, and which exports share one document. Random on purpose: it says
 * nothing about the teacher, their account or their machine.
 */

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A well-formed origin id; anything else in a saved file is treated as absent. */
export function isOriginId(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4.test(value);
}

/** A fresh UUID v4 from the platform's cryptographic random source. */
export function newOriginId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The document as it is when it has an origin id, else with a new one. */
export function withOriginId(worksheet: Worksheet, mint: () => string = newOriginId): Worksheet {
  return isOriginId(worksheet.originId) ? worksheet : { ...worksheet, originId: mint() };
}
