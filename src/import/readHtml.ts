/**
 * `text/html` reader: Word's clipboard HTML (`mso-list` labels in conditional
 * comments, `mso-tab-count` tabs) and `<ol start type>` HTML (Google Docs, LibreOffice).
 * A small tokenizer rather than `DOMParser`, so the engine stays pure and runs in tests;
 * the HTML is only read, never inserted into a page.
 */
import { tidyText } from './normalize';
import type { RawLine, RawRun } from './readPlain';
import type { ImageRef } from './types';

type Attrs = Record<string, string>;
type Token =
  | { t: 'open'; name: string; attrs: Attrs; selfClose: boolean }
  | { t: 'close'; name: string }
  | { t: 'text'; text: string }
  | { t: 'cond'; open: boolean; lists: boolean };

const SKIP_CONTENT = new Set(['script', 'style', 'title', 'xml', 'head', 'noscript', 'template']);
const VOID = new Set(['br', 'img', 'hr', 'meta', 'link', 'input', 'col', 'wbr', 'area', 'base']);

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0', rsquo: '’', lsquo: '‘', rdquo: '”',
  ldquo: '“', hellip: '…', ndash: '–', mdash: '—', middot: '·', bull: '•', times: '×', divide: '÷', deg: '°',
  pound: '£', yen: '¥', euro: '€', cent: '¢', copy: '©', reg: '®', trade: '™', sup2: '²', sup3: '³',
  frac12: '½', frac14: '¼', frac34: '¾', ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009', shy: '\u00AD',
  laquo: '«', raquo: '»', minus: '−', le: '≤', ge: '≥', ne: '≠', plusmn: '±',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function parseAttrs(source: string): Attrs {
  const attrs: Attrs = {};
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

function tokenize(html: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const text = (s: string) => s && out.push({ t: 'text', text: s });
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      text(html.slice(i));
      break;
    }
    text(html.slice(i, lt));
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      const body = html.slice(lt + 4, end < 0 ? html.length : end);
      // Outlook-style revealed conditionals written as comments.
      if (/^\[if [^\]]*\]$/i.test(body)) out.push({ t: 'cond', open: true, lists: /supportLists/i.test(body) });
      else if (/^\[endif\]$/i.test(body)) out.push({ t: 'cond', open: false, lists: false });
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith('<![', lt)) {
      const end = html.indexOf(']>', lt);
      const body = html.slice(lt + 3, end < 0 ? html.length : end);
      if (/^endif/i.test(body)) out.push({ t: 'cond', open: false, lists: false });
      else if (/^if/i.test(body)) out.push({ t: 'cond', open: true, lists: /supportLists/i.test(body) });
      i = end < 0 ? html.length : end + 2;
      continue;
    }
    if (html[lt + 1] === '!' || html[lt + 1] === '?') {
      const end = html.indexOf('>', lt);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    const m = /^<(\/?)([A-Za-z][\w:.-]*)/.exec(html.slice(lt, lt + 80));
    if (!m) {
      text('<');
      i = lt + 1;
      continue;
    }
    let j = lt + m[0].length;
    let quote = '';
    for (; j < html.length; j++) {
      const c = html[j];
      if (quote) {
        if (c === quote) quote = '';
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
    }
    const name = m[2].toLowerCase();
    const inner = html.slice(lt + m[0].length, j);
    i = j + 1;
    if (m[1]) {
      out.push({ t: 'close', name });
      continue;
    }
    const selfClose = inner.trimEnd().endsWith('/') || VOID.has(name);
    out.push({ t: 'open', name, attrs: parseAttrs(inner), selfClose });
    if (SKIP_CONTENT.has(name) && !selfClose) {
      const close = html.toLowerCase().indexOf(`</${name}`, i);
      i = close < 0 ? html.length : close;
    }
  }
  return out;
}

// ---- formatting ----

interface Fmt {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  highlight?: boolean;
  color?: string;
  vertAlign?: 'superscript' | 'subscript';
  hidden?: boolean;
}

const NAMED_COLORS: Record<string, string> = {
  red: 'FF0000', blue: '0000FF', green: '008000', purple: '800080', orange: 'FFA500', maroon: '800000',
  navy: '000080', teal: '008080', fuchsia: 'FF00FF', magenta: 'FF00FF', olive: '808000', gray: '808080', grey: '808080',
};
const NO_FILL = /^(transparent|white|#fff|#ffffff|none|inherit|initial|auto|window|rgba?\(\s*255\s*,\s*255\s*,\s*255)/i;

function colorHex(value: string): string | undefined {
  const v = value.trim().toLowerCase();
  if (/^(black|windowtext|auto|inherit|initial|#000|#000000)$/.test(v)) return undefined;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
  if (hex) return (hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1]).toUpperCase();
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v);
  if (rgb) {
    const out = [rgb[1], rgb[2], rgb[3]].map((n) => Math.min(255, +n).toString(16).padStart(2, '0')).join('').toUpperCase();
    return out === '000000' ? undefined : out;
  }
  return NAMED_COLORS[v];
}

function styleOf(attrs: Attrs): Map<string, string> {
  const map = new Map<string, string>();
  for (const decl of (attrs.style ?? '').split(';')) {
    const at = decl.indexOf(':');
    if (at > 0) map.set(decl.slice(0, at).trim().toLowerCase(), decl.slice(at + 1).trim());
  }
  return map;
}

function fmtOf(name: string, attrs: Attrs, style: Map<string, string>, parent: Fmt): Fmt {
  const f: Fmt = { ...parent };
  if (name === 'b' || name === 'strong') f.bold = true;
  if (name === 'i' || name === 'em') f.italic = true;
  if (name === 'u' || name === 'ins') f.underline = true;
  if (name === 'mark') f.highlight = true;
  if (name === 'sup') f.vertAlign = 'superscript';
  if (name === 'sub') f.vertAlign = 'subscript';
  if (name === 'font' && attrs.color) f.color = colorHex(attrs.color);
  const weight = style.get('font-weight');
  if (weight) f.bold = /bold|[6-9]00/.test(weight);
  const fontStyle = style.get('font-style');
  if (fontStyle) f.italic = /italic|oblique/.test(fontStyle);
  const deco = style.get('text-decoration') ?? style.get('text-decoration-line') ?? style.get('text-underline');
  if (deco) f.underline = /underline|single|double/.test(deco) && !/none/.test(deco);
  const fill = style.get('mso-highlight') ?? style.get('background-color') ?? style.get('background');
  if (fill) f.highlight = !NO_FILL.test(fill);
  const color = style.get('color');
  if (color) f.color = colorHex(color);
  const va = style.get('vertical-align');
  if (va) f.vertAlign = va === 'super' ? 'superscript' : va === 'sub' ? 'subscript' : undefined;
  if (style.get('display') === 'none' || style.get('mso-hide') === 'all') f.hidden = true;
  return f;
}

function runOf(text: string, f: Fmt): RawRun {
  return {
    text,
    ...(f.bold ? { bold: true } : {}),
    ...(f.italic ? { italic: true } : {}),
    ...(f.underline ? { underline: true } : {}),
    ...(f.vertAlign ? { vertAlign: f.vertAlign } : {}),
    ...(f.color ? { color: f.color } : {}),
    ...(f.highlight ? { highlight: true } : {}),
  };
}

// ---- lists ----

function alpha(n: number, upper: boolean): string {
  let s = '';
  for (let v = n; v > 0; v = Math.floor((v - 1) / 26)) s = String.fromCharCode(97 + ((v - 1) % 26)) + s;
  return upper ? s.toUpperCase() : s;
}

function roman(n: number, upper: boolean): string {
  const table: Array<[number, string]> = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let s = '';
  let v = n;
  for (const [value, digits] of table) for (; v >= value; v -= value) s += digits;
  return upper ? s.toUpperCase() : s;
}

function listLabel(type: string, n: number): string {
  if (type === 'a' || type === 'A') return `${alpha(n, type === 'A')}.`;
  if (type === 'i' || type === 'I') return `${roman(n, type === 'I')}.`;
  return `${n}.`;
}

const BLOCK = new Set([
  'p', 'div', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'tr', 'td', 'th', 'blockquote',
  'pre', 'section', 'article', 'header', 'footer', 'dl', 'dt', 'dd', 'center', 'body', 'tbody', 'thead', 'tfoot',
]);
const BULLETS = /^[·•o§▪◦●]$/;

/** Read clipboard HTML into lines. Tables become rows with cells; images become their own lines. */
export function readHtml(html: string): RawLine[] {
  const out: RawLine[] = [];
  const fmtStack: Array<{ name: string; fmt: Fmt; tabs: boolean; ignore: boolean }> = [];
  const lists: Array<{ ordered: boolean; type: string; next: number }> = [];
  let runs: RawRun[] = [];
  let label: string | undefined;
  let lineDepth: number | undefined;
  let marginDepth: number | undefined;
  let condDepth = 0;
  let labelBuf = '';
  let collectingLabel = false;
  // Table state: only the outermost table makes rows; inner ones flatten into the cell.
  let tableDepth = 0;
  let row: RawRun[][] | null = null;
  let cell: RawRun[] | null = null;
  let blockHadText = false;

  const fmt = () => fmtStack[fmtStack.length - 1]?.fmt ?? {};
  const inTabs = () => fmtStack.some((f) => f.tabs);
  const inIgnore = () => fmtStack.some((f) => f.ignore);

  const target = () => cell ?? runs;
  const hasText = (rs: RawRun[]) => rs.some((r) => r.text.trim() !== '' || r.text.includes('\t'));

  const flush = (blankIfEmpty = false, bareLabel = false) => {
    if (cell) {
      const last = cell[cell.length - 1];
      if (last && !last.text.endsWith('\n')) cell.push({ text: '\n' });
      return;
    }
    const text = runs.map((r) => r.text).join('');
    if (hasText(runs) || (bareLabel && label)) {
      const trimmed = trimRuns(runs);
      out.push({
        runs: trimmed,
        ...(label ? { listLabel: label } : {}),
        ...(label && lineDepth !== undefined ? { listDepth: lineDepth } : {}),
        ...(marginDepth ? { marginDepth } : {}),
      });
      blockHadText = true;
      label = undefined;
    } else if (blankIfEmpty && !blockHadText && text.trim() === '' && !label) {
      out.push({ runs: [] });
    }
    runs = [];
  };

  const setLabel = (text: string) => {
    const t = text.replace(/[\s\u00A0]+/g, ' ').trim();
    if (!t) return;
    const value = BULLETS.test(t) ? '•' : t;
    if (cell) cell.push({ text: `${value}\t` });
    else label = value;
  };

  for (const token of tokenize(html)) {
    if (token.t === 'cond') {
      if (token.open) {
        condDepth++;
        if (token.lists) {
          collectingLabel = true;
          labelBuf = '';
        }
      } else if (condDepth > 0) {
        condDepth--;
        if (collectingLabel) {
          collectingLabel = false;
          setLabel(decodeEntities(labelBuf));
        }
      }
      continue;
    }
    if (token.t === 'text') {
      if (fmt().hidden) continue;
      const decoded = decodeEntities(token.text);
      if (collectingLabel || inIgnore()) {
        labelBuf += decoded;
        continue;
      }
      if (inTabs()) continue;
      const text = decoded.replace(/[ \t\n\r\f]+/g, ' ');
      if (!text) continue;
      const into = target();
      if (!hasText(into) && text.trim() === '') continue;
      into.push(runOf(text, fmt()));
      continue;
    }
    const name = token.name;
    if (token.t === 'close') {
      if (name === 'td' || name === 'th') {
        if (tableDepth === 1 && cell && row) {
          row.push(trimRuns(cell.filter((r, k, all) => !(r.text === '\n' && k === all.length - 1))));
          cell = null;
          continue;
        }
      }
      if (name === 'tr' && tableDepth === 1 && row) {
        const cells = row;
        row = null;
        if (cells.some(hasText)) {
          const joined: RawRun[] = [];
          cells.forEach((c, k) => joined.push(...(k ? [{ text: '\t' }] : []), ...c.map((r) => ({ ...r, text: r.text.replace(/\n/g, ' ') }))));
          out.push({ runs: joined, cells });
        }
        continue;
      }
      if (name === 'table') {
        tableDepth = Math.max(0, tableDepth - 1);
        continue;
      }
      if (name === 'ol' || name === 'ul') lists.pop();
      if (name === 'li' && label && !cell) flush(false, true);
      for (let k = fmtStack.length - 1; k >= 0; k--) {
        if (fmtStack[k].name !== name) continue;
        // A Word label outside a conditional: `<span style='mso-list:Ignore'>1.</span>`.
        const closesLabel = fmtStack.slice(k).some((f) => f.ignore) && !collectingLabel;
        fmtStack.length = k;
        if (closesLabel && !inIgnore()) {
          setLabel(decodeEntities(labelBuf));
          labelBuf = '';
        }
        break;
      }
      if (BLOCK.has(name)) {
        flush(name === 'p');
        if (name === 'p' || name === 'li' || name === 'div') {
          lineDepth = undefined;
          marginDepth = undefined;
        }
      }
      continue;
    }
    // open
    const attrs = token.attrs;
    const style = styleOf(attrs);
    if (name === 'br') {
      if (cell) cell.push({ text: '\n' });
      else flush(true);
      continue;
    }
    if (name === 'img') {
      if (cell || !attrs.src) continue;
      flush();
      const image: ImageRef = {
        src: attrs.src,
        ...(+attrs.width ? { widthPx: +attrs.width } : {}),
        ...(+attrs.height ? { heightPx: +attrs.height } : {}),
        ...(attrs.alt ? { alt: attrs.alt } : {}),
      };
      out.push({ runs: [], image });
      continue;
    }
    if (name === 'table') {
      flush();
      tableDepth++;
      continue;
    }
    if (name === 'tr' && tableDepth === 1) {
      row = [];
      continue;
    }
    if ((name === 'td' || name === 'th') && tableDepth === 1) {
      cell = [];
      continue;
    }
    if (BLOCK.has(name)) {
      flush();
      blockHadText = false;
      if (name === 'ol' || name === 'ul') {
        lists.push({ ordered: name === 'ol', type: attrs.type ?? '1', next: Number.parseInt(attrs.start ?? '1', 10) || 1 });
      }
      if (name === 'li') {
        const list = lists[lists.length - 1];
        if (list) {
          const n = Number.parseInt(attrs.value ?? '', 10) || list.next;
          list.next = n + 1;
          setLabel(list.ordered ? listLabel(list.type, n) : '•');
          lineDepth = lists.length - 1;
        }
      }
      const level = /level(\d+)/.exec(style.get('mso-list') ?? '');
      if (level) lineDepth = +level[1] - 1;
      const margin = /(-?[\d.]+)\s*(pt|cm|in|px)?/.exec(style.get('margin-left') ?? '');
      if (margin) {
        const unit = margin[2] ?? 'pt';
        const pt = +margin[1] * (unit === 'cm' ? 28.35 : unit === 'in' ? 72 : unit === 'px' ? 0.75 : 1);
        if (pt >= 18) marginDepth = Math.round(pt / 36) || 1;
      }
    }
    if (token.selfClose) continue;
    const tabCount = /^\d+/.exec(style.get('mso-tab-count') ?? '');
    if (tabCount && !collectingLabel) target().push({ text: '\t'.repeat(+tabCount[0] || 1) });
    const ignore = /ignore/i.test(style.get('mso-list') ?? '');
    if (ignore && !collectingLabel && !inIgnore()) labelBuf = '';
    fmtStack.push({ name, fmt: fmtOf(name, attrs, style, fmt()), tabs: !!tabCount, ignore });
  }
  flush();
  return out.map((line) => ({ ...line, runs: line.runs.map((r) => ({ ...r, text: tidyText(r.text) })) }));
}

/** Leading spaces off (TABs kept, they carry indent); trailing whitespace off. */
function trimRuns(runs: RawRun[]): RawRun[] {
  const out = runs.map((r) => ({ ...r }));
  while (out.length && out[0].text.replace(/^ +/, '') === '') out.shift();
  if (out.length) out[0].text = out[0].text.replace(/^ +/, '');
  while (out.length && out[out.length - 1].text.trim() === '' && !out[out.length - 1].text.includes('\t')) out.pop();
  if (out.length) out[out.length - 1].text = out[out.length - 1].text.replace(/[ \n]+$/, '');
  return out.filter((r) => r.text !== '');
}
