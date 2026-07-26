/** Minimal XML helpers for hand-built OOXML. */

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Drop characters that are illegal in XML 1.0, which Word rejects outright with an
 * "unreadable content" repair prompt (§7.1). Legal chars are #x9, #xA, #xD,
 * #x20-#xD7FF, #xE000-#xFFFD, plus the supplementary planes via surrogate pairs.
 *
 * Built from escapes rather than literal control characters so the pattern survives
 * copy/paste and tooling intact.
 */
const ILLEGAL_XML_CHARS = new RegExp(
  '[^' +
    '\\u0009\\u000A\\u000D' +
    '\\u0020-\\uD7FF' +
    '\\uD800-\\uDFFF' + // surrogates, validated below
    '\\uE000-\\uFFFD' +
    ']',
  'g',
);

export function sanitizeText(value: string): string {
  const stripped = value.replace(ILLEGAL_XML_CHARS, '');
  // Remove lone surrogates, which are individually illegal even though well-formed
  // pairs (emoji, CJK extension glyphs) must be preserved.
  return stripped.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

export function attrs(map: Record<string, string | number | undefined>): string {
  return Object.entries(map)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ` ${key}="${escapeXml(String(value))}"`)
    .join('');
}

export const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
