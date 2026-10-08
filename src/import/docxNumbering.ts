/**
 * `.docx` styles and list numbering: what a paragraph's style gives it, and the label
 * Word would print for a numbered paragraph, from real counters.
 */
import { child, childrenNamed, onOff, val, type XmlElement } from './xml';

// ---- styles ----

export interface RunProps {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  highlight?: boolean;
  hidden?: boolean;
  color?: string;
  vertAlign?: 'superscript' | 'subscript';
  /** `w:sym`-style fonts whose private-use characters need mapping. */
  font?: string;
}

export interface NumRef {
  numId?: string;
  ilvl?: number;
}

export interface StyleInfo {
  id: string;
  name: string;
  type: string;
  basedOn?: string;
  run: RunProps;
  num?: NumRef;
  indLeft?: number;
  outlineLvl?: number;
}

export function readRunProps(rPr: XmlElement | undefined): RunProps {
  const out: RunProps = {};
  if (!rPr) return out;
  const b = onOff(child(rPr, 'w:b'));
  if (b !== undefined) out.bold = b;
  const i = onOff(child(rPr, 'w:i'));
  if (i !== undefined) out.italic = i;
  const u = child(rPr, 'w:u');
  if (u) out.underline = (val(u) ?? 'single') !== 'none';
  const hl = val(child(rPr, 'w:highlight'));
  const fill = val(child(rPr, 'w:shd'), 'w:fill');
  if (hl !== undefined || fill !== undefined) out.highlight = (hl !== undefined && hl !== 'none') || (fill !== undefined && !/^(auto|ffffff|)$/i.test(fill));
  const vanish = onOff(child(rPr, 'w:vanish'));
  if (vanish !== undefined) out.hidden = vanish;
  const color = val(child(rPr, 'w:color'));
  if (color !== undefined) out.color = /^[0-9a-f]{6}$/i.test(color) && !/^000000$/.test(color) ? color.toUpperCase() : '';
  const va = val(child(rPr, 'w:vertAlign'));
  if (va === 'superscript' || va === 'subscript') out.vertAlign = va;
  else if (va === 'baseline') out.vertAlign = undefined;
  const fonts = child(rPr, 'w:rFonts');
  const font = fonts?.attrs['w:ascii'] ?? fonts?.attrs['w:hAnsi'];
  if (font) out.font = font;
  return out;
}

function readNumPr(numPr: XmlElement | undefined): NumRef | undefined {
  if (!numPr) return undefined;
  const numId = val(child(numPr, 'w:numId'));
  const ilvl = val(child(numPr, 'w:ilvl'));
  return { ...(numId !== undefined ? { numId } : {}), ...(ilvl !== undefined ? { ilvl: +ilvl || 0 } : {}) };
}

export function indLeftOf(pPr: XmlElement | undefined): number | undefined {
  const ind = child(pPr, 'w:ind');
  const left = ind?.attrs['w:left'] ?? ind?.attrs['w:start'];
  return left !== undefined && Number.isFinite(+left) ? +left : undefined;
}

export class Styles {
  private byId = new Map<string, StyleInfo>();
  private resolved = new Map<string, StyleInfo>();
  defaultParagraph?: string;
  defaults: RunProps = {};

  constructor(root?: XmlElement) {
    if (!root) return;
    this.defaults = readRunProps(child(child(child(root, 'w:docDefaults'), 'w:rPrDefault'), 'w:rPr'));
    for (const s of childrenNamed(root, 'w:style')) {
      const id = s.attrs['w:styleId'];
      if (!id) continue;
      const type = s.attrs['w:type'] ?? 'paragraph';
      const pPr = child(s, 'w:pPr');
      const outline = val(child(pPr, 'w:outlineLvl'));
      this.byId.set(id, {
        id,
        type,
        name: (val(child(s, 'w:name')) ?? id).toLowerCase(),
        basedOn: val(child(s, 'w:basedOn')),
        run: readRunProps(child(s, 'w:rPr')),
        num: readNumPr(child(pPr, 'w:numPr')),
        indLeft: indLeftOf(pPr),
        ...(outline !== undefined ? { outlineLvl: +outline } : {}),
      });
      if (type === 'paragraph' && /^(1|true|on)$/.test(s.attrs['w:default'] ?? '')) this.defaultParagraph = id;
    }
  }

  /** The style with its `basedOn` chain folded in (nearest wins). */
  get(id: string | undefined): StyleInfo | undefined {
    if (!id) return undefined;
    const hit = this.resolved.get(id);
    if (hit) return hit;
    const chain: StyleInfo[] = [];
    const seen = new Set<string>();
    for (let s = this.byId.get(id); s && !seen.has(s.id); s = s.basedOn ? this.byId.get(s.basedOn) : undefined) {
      seen.add(s.id);
      chain.push(s);
    }
    if (!chain.length) return undefined;
    const own = chain[0];
    const out: StyleInfo = { ...own, run: {} };
    for (const s of [...chain].reverse()) {
      Object.assign(out.run, s.run);
      if (s.num) out.num = { ...out.num, ...s.num };
      if (s.indLeft !== undefined) out.indLeft = s.indLeft;
      if (s.outlineLvl !== undefined) out.outlineLvl = s.outlineLvl;
    }
    // A paragraph style's own numId of 0 switches inherited numbering off.
    if (own.num?.numId === '0') out.num = undefined;
    this.resolved.set(id, out);
    return out;
  }
}

// ---- numbering ----

interface Level {
  start: number;
  fmt: string;
  text: string;
  /** 1-based level after whose use this one restarts; 0: never. Unset: after any higher level. */
  restart?: number;
  legal: boolean;
  indLeft?: number;
  pStyle?: string;
}

interface Abstract {
  id: string;
  levels: Map<number, Level>;
  styleLink?: string;
  numStyleLink?: string;
}

interface Instance {
  abstractId: string;
  overrides: Map<number, { start?: number; level?: Level }>;
}

function readLevel(lvl: XmlElement): Level {
  const restart = val(child(lvl, 'w:lvlRestart'));
  return {
    start: Number.parseInt(val(child(lvl, 'w:start')) ?? '1', 10) || 0,
    fmt: val(child(lvl, 'w:numFmt')) ?? 'decimal',
    text: val(child(lvl, 'w:lvlText')) ?? '',
    ...(restart !== undefined ? { restart: +restart || 0 } : {}),
    legal: onOff(child(lvl, 'w:isLgl')) ?? false,
    indLeft: indLeftOf(child(lvl, 'w:pPr')),
    pStyle: val(child(lvl, 'w:pStyle')),
  };
}

const CN_DIGITS = '〇一二三四五六七八九';
const HEAVENLY = '甲乙丙丁戊己庚辛壬癸';

function alpha(n: number): string {
  let s = '';
  for (let v = n; v > 0; v = Math.floor((v - 1) / 26)) s = String.fromCharCode(97 + ((v - 1) % 26)) + s;
  return s;
}

function roman(n: number): string {
  const table: Array<[number, string]> = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let s = '';
  let v = n;
  for (const [value, digits] of table) for (; v >= value; v -= value) s += digits;
  return s;
}

function chineseCount(n: number): string {
  if (n <= 0) return CN_DIGITS[0];
  if (n < 10) return CN_DIGITS[n];
  if (n < 100) return `${n >= 20 ? CN_DIGITS[Math.floor(n / 10)] : ''}十${n % 10 ? CN_DIGITS[n % 10] : ''}`;
  return String(n);
}

/** One counter value in a `numFmt`. Formats a label reader cannot use come out as digits. */
export function formatNumber(n: number, fmt: string): string {
  switch (fmt) {
    case 'lowerLetter': return alpha(n);
    case 'upperLetter': return alpha(n).toUpperCase();
    case 'lowerRoman': return roman(n);
    case 'upperRoman': return roman(n).toUpperCase();
    case 'decimalZero': return n < 10 ? `0${n}` : String(n);
    // ① reads as the statement label it is.
    case 'decimalEnclosedCircle':
    case 'decimalEnclosedCircleChinese':
    case 'ideographEnclosedCircle':
    case 'decimalEnclosedParen':
      return `(${n})`;
    case 'decimalEnclosedFullstop': return `${n}.`;
    case 'decimalFullWidth':
    case 'decimalFullWidth2':
      return String(n).replace(/\d/g, (d) => String.fromCharCode(0xff10 + +d));
    case 'chineseCounting':
    case 'chineseCountingThousand':
    case 'taiwaneseCounting':
    case 'taiwaneseCountingThousand':
    case 'japaneseCounting':
    case 'chineseLegalSimplified':
    case 'ideographLegalTraditional':
      return chineseCount(n);
    case 'ideographDigital':
    case 'taiwaneseDigital':
    case 'japaneseDigitalTenThousand':
      return String(n).replace(/\d/g, (d) => CN_DIGITS[+d]);
    case 'ideographTraditional': return HEAVENLY[n - 1] ?? String(n);
    case 'none': return '';
    case 'bullet': return '•';
    default: return String(n);
  }
}

export interface ListItem {
  /** The printed label, e.g. "1.", "(a)", "A."; `•` for a bullet; empty for none. */
  label: string;
  ilvl: number;
  indLeft?: number;
}

/** Counters live per abstract list, as in Word: two `w:num`s on one abstract share them. */
export class Numbering {
  private abstracts = new Map<string, Abstract>();
  private instances = new Map<string, Instance>();
  private counters = new Map<string, Array<number | undefined>>();
  private pendingOverride = new Map<string, Set<number>>();

  constructor(
    root: XmlElement | undefined,
    private styles: Styles,
  ) {
    if (!root) return;
    for (const a of childrenNamed(root, 'w:abstractNum')) {
      const id = a.attrs['w:abstractNumId'];
      if (id === undefined) continue;
      const levels = new Map<number, Level>();
      for (const lvl of childrenNamed(a, 'w:lvl')) levels.set(+(lvl.attrs['w:ilvl'] ?? 0), readLevel(lvl));
      this.abstracts.set(id, { id, levels, styleLink: val(child(a, 'w:styleLink')), numStyleLink: val(child(a, 'w:numStyleLink')) });
    }
    for (const num of childrenNamed(root, 'w:num')) {
      const id = num.attrs['w:numId'];
      const abstractId = val(child(num, 'w:abstractNumId'));
      if (id === undefined || abstractId === undefined) continue;
      const overrides = new Map<number, { start?: number; level?: Level }>();
      for (const o of childrenNamed(num, 'w:lvlOverride')) {
        const ilvl = +(o.attrs['w:ilvl'] ?? 0);
        const start = val(child(o, 'w:startOverride'));
        const lvl = child(o, 'w:lvl');
        overrides.set(ilvl, { ...(start !== undefined ? { start: +start || 0 } : {}), ...(lvl ? { level: readLevel(lvl) } : {}) });
      }
      this.instances.set(id, { abstractId, overrides });
      const pending = [...overrides].filter(([, o]) => o.start !== undefined || o.level).map(([k]) => k);
      if (pending.length) this.pendingOverride.set(id, new Set(pending));
    }
  }

  /** The abstract list behind a `w:num`, following a numbering style link once. */
  private abstractOf(instance: Instance): Abstract | undefined {
    const a = this.abstracts.get(instance.abstractId);
    if (!a?.numStyleLink || a.levels.size) return a;
    const linked = this.styles.get(a.numStyleLink)?.num?.numId;
    const target = linked ? this.instances.get(linked) : undefined;
    return (target && this.abstracts.get(target.abstractId)) ?? a;
  }

  private level(instance: Instance, abstract: Abstract, ilvl: number): Level | undefined {
    return instance.overrides.get(ilvl)?.level ?? abstract.levels.get(ilvl);
  }

  /** The level a style-numbered paragraph sits at when it names none. */
  levelForStyle(numId: string, styleId: string | undefined): number {
    const instance = this.instances.get(numId);
    const abstract = instance && this.abstractOf(instance);
    if (abstract && styleId) for (const [k, l] of abstract.levels) if (l.pStyle === styleId) return k;
    return 0;
  }

  /** Count one numbered paragraph and return its label; undefined when it is not numbered. */
  next(numId: string | undefined, ilvl: number): ListItem | undefined {
    if (!numId || numId === '0') return undefined;
    const instance = this.instances.get(numId);
    const abstract = instance && this.abstractOf(instance);
    if (!instance || !abstract) return undefined;
    const lvl = this.level(instance, abstract, ilvl);
    if (!lvl) return undefined;
    const counters = this.counters.get(abstract.id) ?? this.counters.set(abstract.id, []).get(abstract.id)!;
    const pending = this.pendingOverride.get(numId);
    if (pending?.has(ilvl)) {
      // The first use of a restarted list instance resets the level to its override.
      const o = instance.overrides.get(ilvl)!;
      counters[ilvl] = (o.start ?? o.level?.start ?? lvl.start) - 1;
      pending.delete(ilvl);
    }
    counters[ilvl] = (counters[ilvl] ?? lvl.start - 1) + 1;
    for (let d = ilvl + 1; d < 9; d++) {
      const deeper = this.level(instance, abstract, d);
      const restart = deeper?.restart;
      if (restart === undefined || (restart > 0 && ilvl <= restart - 1)) counters[d] = undefined;
    }
    if (lvl.fmt === 'bullet') return { label: '•', ilvl, indLeft: lvl.indLeft };
    const label = lvl.text.replace(/%([1-9])/g, (_, k: string) => {
      const d = +k - 1;
      const at = this.level(instance, abstract, d);
      const value = counters[d] ?? at?.start ?? 1;
      return formatNumber(value, lvl.legal ? 'decimal' : (at?.fmt ?? 'decimal'));
    });
    return { label: lvl.fmt === 'none' ? '' : label.trim(), ilvl, indLeft: lvl.indLeft };
  }
}

