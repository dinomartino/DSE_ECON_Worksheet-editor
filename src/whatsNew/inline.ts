/**
 * The inline Markdown a changelog line uses — `**bold**`, `` `code` `` and
 * `[text](url)` — as tokens React renders as text. No HTML is ever produced, so a line
 * cannot inject markup; anything else stays literal.
 */

export type InlineToken =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'bold'; children: InlineToken[] }
  | { kind: 'link'; href: string; children: InlineToken[] };

const CODE = /`([^`]+)`/y;
const BOLD = /\*\*(.+?)\*\*/y;
const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/y;

export function inlineTokens(source: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let text = '';
  const flush = () => {
    if (text) tokens.push({ kind: 'text', text });
    text = '';
  };

  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const at = (pattern: RegExp) => {
      pattern.lastIndex = i;
      return pattern.exec(source);
    };
    const code = ch === '`' ? at(CODE) : null;
    if (code) {
      flush();
      tokens.push({ kind: 'code', text: code[1] });
      i += code[0].length;
      continue;
    }
    const bold = ch === '*' ? at(BOLD) : null;
    if (bold) {
      flush();
      tokens.push({ kind: 'bold', children: inlineTokens(bold[1]) });
      i += bold[0].length;
      continue;
    }
    const link = ch === '[' ? at(LINK) : null;
    if (link) {
      flush();
      tokens.push({ kind: 'link', href: link[2], children: inlineTokens(link[1]) });
      i += link[0].length;
      continue;
    }
    text += ch;
    i += 1;
  }
  flush();
  return tokens;
}

/** Only these open from the app; a relative link (`RELEASING.md`) renders as its text. */
export function isOpenableLink(href: string): boolean {
  return /^https:\/\//.test(href);
}
