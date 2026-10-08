/**
 * A small XML reader for the `.docx` parts: elements, attributes and text, nothing else.
 * Pure, so the engine runs in tests and workers. No DTD or entity expansion beyond the
 * five predefined entities and character references. Namespace prefixes are rewritten to
 * the conventional ones by URI, so `ns0:p` in an odd generator's file still reads as `w:p`.
 */

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}
export type XmlNode = XmlElement | string;

export class XmlError extends Error {}

const CANONICAL: Record<string, string> = {
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main': 'w',
  'http://purl.oclc.org/ooxml/wordprocessingml/main': 'w',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships': 'r',
  'http://purl.oclc.org/ooxml/officeDocument/relationships': 'r',
  'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing': 'wp',
  'http://purl.oclc.org/ooxml/drawingml/wordprocessingDrawing': 'wp',
  'http://schemas.openxmlformats.org/drawingml/2006/main': 'a',
  'http://purl.oclc.org/ooxml/drawingml/main': 'a',
  'http://schemas.openxmlformats.org/drawingml/2006/picture': 'pic',
  'http://purl.oclc.org/ooxml/drawingml/picture': 'pic',
  'http://schemas.openxmlformats.org/drawingml/2006/chart': 'c',
  'http://schemas.openxmlformats.org/drawingml/2006/diagram': 'dgm',
  'http://schemas.openxmlformats.org/markup-compatibility/2006': 'mc',
  'http://schemas.openxmlformats.org/officeDocument/2006/math': 'm',
  'http://schemas.microsoft.com/office/word/2010/wordprocessingShape': 'wps',
  'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup': 'wpg',
  'http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas': 'wpc',
  'urn:schemas-microsoft-com:vml': 'v',
  'urn:schemas-microsoft-com:office:office': 'o',
  'http://purl.org/dc/elements/1.1/': 'dc',
  'http://schemas.openxmlformats.org/package/2006/relationships': '',
  'http://schemas.openxmlformats.org/package/2006/content-types': '',
};

type Prefixes = Map<string, string>;

const ENTITY: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decode(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] !== '#') return ENTITY[body] ?? whole;
    const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
  });
}

const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function rename(name: string, prefixes: Prefixes): string {
  const at = name.indexOf(':');
  const prefix = at < 0 ? '' : name.slice(0, at);
  const mapped = prefixes.get(prefix);
  if (mapped === undefined || mapped === prefix) return name;
  const local = at < 0 ? name : name.slice(at + 1);
  return mapped ? `${mapped}:${local}` : local;
}

/** Parse a whole part. Throws `XmlError` when there is no root element. */
export function parseXml(source: string): XmlElement {
  const root: XmlElement = { name: '#document', attrs: {}, children: [] };
  const stack: XmlElement[] = [root];
  const scopes: Prefixes[] = [new Map()];
  let i = 0;
  const n = source.length;
  while (i < n) {
    const lt = source.indexOf('<', i);
    const end = lt < 0 ? n : lt;
    if (end > i && stack.length > 1) stack[stack.length - 1].children.push(decode(source.slice(i, end)));
    if (lt < 0) break;
    if (source.startsWith('<!--', lt)) {
      const close = source.indexOf('-->', lt + 4);
      i = close < 0 ? n : close + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', lt)) {
      const close = source.indexOf(']]>', lt + 9);
      if (stack.length > 1) stack[stack.length - 1].children.push(source.slice(lt + 9, close < 0 ? n : close));
      i = close < 0 ? n : close + 3;
      continue;
    }
    if (source[lt + 1] === '?' || source[lt + 1] === '!') {
      const close = source.indexOf('>', lt);
      i = close < 0 ? n : close + 1;
      continue;
    }
    // Find the tag's end, skipping quoted attribute values.
    let j = lt + 1;
    let quote = '';
    for (; j < n; j++) {
      const c = source[j];
      if (quote) {
        if (c === quote) quote = '';
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
    }
    if (j >= n) break;
    const body = source.slice(lt + 1, j);
    i = j + 1;
    if (body[0] === '/') {
      const name = rename(body.slice(1).trim(), scopes[scopes.length - 1]);
      // Tolerant: close up to the matching element, ignore a stray close.
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name !== name) continue;
        stack.length = k;
        scopes.length = k;
        break;
      }
      continue;
    }
    const selfClose = body.endsWith('/');
    const inner = selfClose ? body.slice(0, -1) : body;
    const space = inner.search(/\s/);
    const rawName = space < 0 ? inner : inner.slice(0, space);
    const rawAttrs: Array<[string, string]> = [];
    let scope = scopes[scopes.length - 1];
    if (space >= 0) {
      ATTR.lastIndex = 0;
      const text = inner.slice(space);
      for (let m = ATTR.exec(text); m; m = ATTR.exec(text)) {
        const key = m[1];
        const value = decode(m[2] ?? m[3] ?? '');
        if (key === 'xmlns' || key.startsWith('xmlns:')) {
          if (scope === scopes[scopes.length - 1]) scope = new Map(scope);
          const prefix = key === 'xmlns' ? '' : key.slice(6);
          scope.set(prefix, CANONICAL[value] ?? prefix);
        } else rawAttrs.push([key, value]);
      }
    }
    const attrs: Record<string, string> = {};
    for (const [key, value] of rawAttrs) attrs[key.includes(':') ? rename(key, scope) : key] = value;
    const el: XmlElement = { name: rename(rawName, scope), attrs, children: [] };
    stack[stack.length - 1].children.push(el);
    if (!selfClose) {
      stack.push(el);
      scopes.push(scope);
    }
  }
  const top = root.children.find((c): c is XmlElement => typeof c !== 'string');
  if (!top) throw new XmlError('No root element');
  return top;
}

// ---- helpers ----

export const isEl = (node: XmlNode | undefined): node is XmlElement => typeof node === 'object' && node !== null;

export function child(el: XmlElement | undefined, name: string): XmlElement | undefined {
  if (!el) return undefined;
  for (const c of el.children) if (typeof c !== 'string' && c.name === name) return c;
  return undefined;
}

export function childrenNamed(el: XmlElement | undefined, name: string): XmlElement[] {
  if (!el) return [];
  return el.children.filter((c): c is XmlElement => typeof c !== 'string' && c.name === name);
}

export const elements = (el: XmlElement): XmlElement[] => el.children.filter(isEl);

/** The first descendant (depth first) with `name`, not looking inside `stop` names. */
export function find(el: XmlElement, name: string, stop?: ReadonlySet<string>): XmlElement | undefined {
  for (const c of el.children) {
    if (typeof c === 'string') continue;
    if (c.name === name) return c;
    if (stop?.has(c.name)) continue;
    const hit = find(c, name, stop);
    if (hit) return hit;
  }
  return undefined;
}

export function findAll(el: XmlElement, name: string, out: XmlElement[] = []): XmlElement[] {
  for (const c of el.children) {
    if (typeof c === 'string') continue;
    if (c.name === name) out.push(c);
    else findAll(c, name, out);
  }
  return out;
}

/** `w:val` and friends; an `on/off` value reads true unless 0/false/off. */
export const val = (el: XmlElement | undefined, key = 'w:val'): string | undefined => el?.attrs[key];

export function onOff(el: XmlElement | undefined): boolean | undefined {
  if (!el) return undefined;
  const v = el.attrs['w:val'];
  return v === undefined || !/^(0|false|off|none)$/i.test(v);
}

/** All text under an element. */
export function textOf(el: XmlElement): string {
  let out = '';
  for (const c of el.children) out += typeof c === 'string' ? c : textOf(c);
  return out;
}
