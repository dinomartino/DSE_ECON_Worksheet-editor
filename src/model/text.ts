import type { BiText, InlineRun, RichText } from './types';

/** Build a single-run RichText from a plain string. */
export function rt(text: string, attrs: Omit<InlineRun, 'text'> = {}): RichText {
  if (!text) return [];
  return [{ text, ...attrs }];
}

/** Build a BiText from two plain strings. */
export function bi(en: string, zh: string): BiText {
  return { en: rt(en), zh: rt(zh) };
}

export function emptyBiText(): BiText {
  return { en: [], zh: [] };
}

/** Flatten a RichText to plain text (previews, alt text, filenames, search). */
export function plain(text: RichText | undefined): string {
  if (!text) return '';
  return text.map((r) => r.text).join('');
}

export function isRichTextEmpty(text: RichText | undefined): boolean {
  return plain(text).trim().length === 0;
}

export function isBiTextEmpty(text: BiText | undefined): boolean {
  if (!text) return true;
  return isRichTextEmpty(text.en) && isRichTextEmpty(text.zh);
}

/**
 * Parse a lightweight markup string into runs. The editor stores runs, but plain
 * <textarea> inputs are far easier for teachers than a full rich-text surface, so
 * inline markers round-trip through `serializeRuns`/`parseRuns`.
 *
 *   **bold**  *italic*  __underline__  ^{sup}  _{sub}
 */
export function parseRuns(source: string): RichText {
  const runs: RichText = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|\^\{[^}]*\}|_\{[^}]*\})/g;
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) runs.push({ text: source.slice(cursor, start) });
    const token = match[0];
    if (token.startsWith('**')) {
      runs.push({ text: token.slice(2, -2), bold: true });
    } else if (token.startsWith('__')) {
      runs.push({ text: token.slice(2, -2), underline: true });
    } else if (token.startsWith('^{')) {
      runs.push({ text: token.slice(2, -1), vertAlign: 'superscript' });
    } else if (token.startsWith('_{')) {
      runs.push({ text: token.slice(2, -1), vertAlign: 'subscript' });
    } else {
      runs.push({ text: token.slice(1, -1), italic: true });
    }
    cursor = start + token.length;
  }
  if (cursor < source.length) runs.push({ text: source.slice(cursor) });
  return runs.filter((r) => r.text.length > 0);
}

export function serializeRuns(runs: RichText | undefined): string {
  if (!runs) return '';
  return runs
    .map((run) => {
      let out = run.text;
      if (run.vertAlign === 'superscript') return `^{${out}}`;
      if (run.vertAlign === 'subscript') return `_{${out}}`;
      if (run.bold) out = `**${out}**`;
      if (run.italic) out = `*${out}*`;
      if (run.underline) out = `__${out}__`;
      return out;
    })
    .join('');
}
