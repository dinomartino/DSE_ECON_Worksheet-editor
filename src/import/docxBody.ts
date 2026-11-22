/**
 * `word/document.xml` → raw lines, in reading order: paragraphs, table rows, text-box
 * content where its anchor sits, pictures on their line, and a lost picture (chart,
 * SmartArt, EMF, a drawing made of Word shapes) as an image line with no data so the
 * figure check shows a slot. Pictures are only noted here; `readDocx` loads them.
 */
import { fractionRuns, linearFraction } from '@/model/fraction';
import { bordersOf, foldTabs, indLeftOf, readRunProps, tabStopsOf, type BorderSides, type Numbering, type RunProps, type Styles } from './docxNumbering';
import { labelLevel, loneOptionLabel, parseLabel } from './labels';
import { labelZone } from './normalize';
import { pairByCell } from './pictureOptions';
import type { RawLine, RawRun } from './readPlain';
import type { ImageRef, ReaderCell, ReaderTable } from './types';
import { child, childrenNamed, elements, find, onOff, textOf, val, type XmlElement } from './xml';
import { normalizeRuns, sliceRichText } from '@/model/text';

export interface Rel {
  target: string;
  external: boolean;
}

/** A picture to load: `ref` is filled in place once its bytes are read. */
export interface PendingImage {
  ref: ImageRef;
  rel?: Rel;
}

export interface BodyContext {
  styles: Styles;
  numbering: Numbering;
  rels: ReadonlyMap<string, Rel>;
}

const EMU_PER_PX = 9525;
/** Text-box text up to this long, in a drawing with lines, is a diagram's label. */
const LABEL_MAX = 24;
/** A floating box up to this long beside a diagram (a legend) belongs to it. */
const SHORT_MAX = 40;
const CAPTION = /^(figure|fig\.?|diagram|graph|chart|table|source|圖表?|表|資料)\s*[（(]?[\dA-Z一二三四五六七八九十]{1,3}[）)]?\s*[:：.]?$/i;
const LEADERS = /^[\s._…⋯‧·\-–—－＿]*$/;

// mc:AlternateContent: the Choice when we read what it requires, else the Fallback.
const KNOWN_REQUIRES = new Set(['wps', 'wpg', 'wpc', 'wpi', 'wp14', 'w14', 'w15', 'w16se', 'a14', 'v', 'o', 'w10', 'wne', 'm', 'c', 'dgm', 'pic', 'a', 'w']);

export function branch(alt: XmlElement): XmlElement[] {
  const choice = elements(alt).find((c) => c.name === 'mc:Choice');
  const fallback = child(alt, 'mc:Fallback');
  const requires = (choice?.attrs.Requires ?? '').split(/\s+/).filter(Boolean);
  if (choice && requires.every((r) => KNOWN_REQUIRES.has(r))) return elements(choice);
  return fallback ? elements(fallback) : choice ? elements(choice) : [];
}

// ---- symbols ----

const SYMBOL: Record<number, string> = {
  0x2d: '−', 0x61: 'α', 0x62: 'β', 0x63: 'χ', 0x64: 'δ', 0x65: 'ε', 0x66: 'φ', 0x67: 'γ', 0x68: 'η', 0x69: 'ι',
  0x6b: 'κ', 0x6c: 'λ', 0x6d: 'μ', 0x6e: 'ν', 0x70: 'π', 0x71: 'θ', 0x72: 'ρ', 0x73: 'σ', 0x74: 'τ', 0x75: 'υ',
  0x77: 'ω', 0x78: 'ξ', 0x79: 'ψ', 0x7a: 'ζ', 0x44: 'Δ', 0x46: 'Φ', 0x47: 'Γ', 0x4c: 'Λ', 0x50: 'Π', 0x53: 'Σ',
  0x57: 'Ω', 0xa2: '′', 0xa3: '≤', 0xa5: '∞', 0xab: '↔', 0xac: '←', 0xad: '↑', 0xae: '→', 0xaf: '↓', 0xb0: '°',
  0xb1: '±', 0xb3: '≥', 0xb4: '×', 0xb7: '•', 0xb8: '÷', 0xb9: '≠', 0xbb: '≈', 0xd7: '⋅', 0xdb: '⇔', 0xde: '⇒',
};
const WINGDINGS: Record<number, string> = {
  0x6c: '●', 0x6e: '■', 0x6f: '□', 0x9f: '•', 0xa8: '☐', 0xd8: '➢', 0xe0: '→', 0xe8: '➔', 0xfb: '✗', 0xfc: '✓', 0xfe: '☑',
};

export function symbolChar(font: string | undefined, hex: string | undefined): string {
  let code = Number.parseInt(hex ?? '', 16);
  if (!Number.isFinite(code)) return '';
  if (code >= 0xf000 && code <= 0xf0ff) code -= 0xf000;
  const f = (font ?? '').toLowerCase();
  if (f.startsWith('symbol')) return SYMBOL[code] ?? (code >= 0x20 && code < 0x7f ? String.fromCharCode(code) : '');
  if (f.startsWith('wingdings')) return WINGDINGS[code] ?? '';
  return code >= 0x20 && code < 0xd800 ? String.fromCharCode(code) : '';
}

// ---- drawings ----

interface Parts {
  pics: Array<{ rid?: string; link?: boolean; widthPx?: number; heightPx?: number; alt?: string }>;
  boxes: XmlElement[];
  shapes: number;
  curves: number;
  /** Drawn figures already recognised (a group of shapes and labels). */
  figures: number;
  /** Of `shapes`: flat horizontal lines across the column, a question-answer book's ruled answer lines (k-0494). */
  rules: number;
  lost?: string;
}

const emptyParts = (): Parts => ({ pics: [], boxes: [], shapes: 0, curves: 0, figures: 0, rules: 0 });

/** A ruled answer line drawn as a shape: a straight line, flat, at least this wide (px). */
const RULE_MIN_PX = 200;
function isRule(wsp: XmlElement, scale: number): boolean {
  const geom = find(wsp, 'a:prstGeom')?.attrs.prst;
  if (geom !== 'line' && geom !== 'straightConnector1') return false;
  const ext = find(wsp, 'a:ext');
  const cx = +(ext?.attrs.cx ?? 0) * scale;
  const cy = +(ext?.attrs.cy ?? 0) * scale;
  return cx / EMU_PER_PX >= RULE_MIN_PX && cy / EMU_PER_PX <= 2;
}

const boxText = (box: XmlElement) => textOf(box).replace(/\s+/g, ' ').trim();

function ptOf(style: string | undefined, key: 'width' | 'height'): number | undefined {
  const m = new RegExp(`(?:^|;)\\s*${key}\\s*:\\s*([\\d.]+)(pt|px|in|cm|mm)?`, 'i').exec(style ?? '');
  if (!m) return undefined;
  const unit = (m[2] ?? 'pt').toLowerCase();
  const px = +m[1] * (unit === 'pt' ? 96 / 72 : unit === 'in' ? 96 : unit === 'cm' ? 96 / 2.54 : unit === 'mm' ? 96 / 25.4 : 1);
  return Math.round(px) || undefined;
}

/** Everything a drawing holds, flattened: pictures, text boxes, plain shapes. */
function collect(el: XmlElement, parts: Parts, scale: number): void {
  for (const c of elements(el)) {
    switch (c.name) {
      case 'mc:AlternateContent':
        collect({ name: '#branch', attrs: {}, children: branch(c) }, parts, scale);
        continue;
      case 'pic:pic': {
        const blip = find(c, 'a:blip');
        const ext = child(child(child(c, 'pic:spPr'), 'a:xfrm'), 'a:ext');
        const cx = +(ext?.attrs.cx ?? 0);
        const cy = +(ext?.attrs.cy ?? 0);
        const alt = val(find(c, 'pic:cNvPr'), 'descr') || undefined;
        parts.pics.push({
          rid: blip?.attrs['r:embed'] ?? blip?.attrs['r:link'],
          link: !blip?.attrs['r:embed'] && !!blip?.attrs['r:link'],
          ...(cx && cy ? { widthPx: Math.round((cx * scale) / EMU_PER_PX), heightPx: Math.round((cy * scale) / EMU_PER_PX) } : {}),
          ...(alt ? { alt } : {}),
        });
        continue;
      }
      case 'w:txbxContent':
        parts.boxes.push(c);
        continue;
      case 'wps:wsp':
        if (find(c, 'w:txbxContent')) collect(c, parts, scale);
        else {
          parts.shapes++;
          if (find(c, 'a:custGeom')) parts.curves++;
          else if (isRule(c, scale)) parts.rules++;
        }
        continue;
      case 'c:chart':
      case 'cx:chart':
        parts.lost ??= 'chart';
        continue;
      case 'dgm:relIds':
        parts.lost ??= 'smartart';
        continue;
      case 'v:imagedata': {
        const rid = c.attrs['r:id'] ?? c.attrs['o:relid'] ?? c.attrs['r:pict'];
        parts.pics.push({ rid, widthPx: ptOf(el.attrs.style, 'width'), heightPx: ptOf(el.attrs.style, 'height'), ...(c.attrs['o:title'] ? { alt: c.attrs['o:title'] } : {}) });
        continue;
      }
      case 'v:line':
      case 'v:polyline':
      case 'v:curve':
      case 'v:arc':
      case 'v:rect':
      case 'v:oval':
      case 'v:roundrect':
      case 'v:shape':
        if (find(c, 'w:txbxContent') || find(c, 'v:imagedata')) collect(c, parts, scale);
        else {
          parts.shapes++;
          if (c.name === 'v:polyline' || c.name === 'v:curve' || c.name === 'v:arc' || (c.name === 'v:shape' && c.attrs.path)) parts.curves++;
        }
        continue;
      default:
        if (c.name.startsWith('w14:contentPart') || c.name === 'wpi:inkPart') {
          parts.lost ??= 'ink';
          continue;
        }
        collect(c, parts, scale);
    }
  }
}

/** A group's child coordinates → EMU of the drawing's own extent. */
function groupScale(drawing: XmlElement, extentCx: number): number {
  const grp = find(drawing, 'wpg:grpSpPr') ?? find(drawing, 'wpc:whole');
  const chExt = grp && find(grp, 'a:chExt');
  const cx = +(chExt?.attrs.cx ?? 0);
  return cx && extentCx ? extentCx / cx : 1;
}

const isFigure = (p: Parts, tiny: number) => (tiny >= 2 && p.shapes >= 1) || (p.curves >= 1 && p.shapes + tiny >= 2) || p.shapes >= 4;

// ---- the reader ----

/** Loose anchored shapes and labels from paragraphs with no text: one diagram drawn shape by shape. */
interface Pool {
  parts: Parts;
}

interface ParaOut {
  before: RawLine[];
  after: RawLine[];
  loose: Parts[];
}

export interface Heading {
  text: string;
  /** 2: a title or heading style; 1: bold or centred and short. */
  strength: number;
}

export class BodyReader {
  readonly images: PendingImage[] = [];
  readonly headings: Heading[] = [];
  private pageBreakPending = false;
  private depth = 0;
  /** The text column's width (twips), from the page size and margins, when the file says. */
  private textWidth = 0;
  /** The largest type in the paragraph being read (points). */
  private paraSize = 0;

  constructor(private ctx: BodyContext) {}

  read(body: XmlElement): RawLine[] {
    const sect = child(body, 'w:sectPr');
    const page = +(child(sect, 'w:pgSz')?.attrs['w:w'] ?? 0);
    const margins = child(sect, 'w:pgMar');
    const side = (name: string) => +(margins?.attrs[name] ?? 0) || 0;
    this.textWidth = page > 0 ? Math.max(0, page - side('w:left') - side('w:right')) : 0;
    const out: RawLine[] = [];
    const pool: Pool = { parts: emptyParts() };
    this.blocks(elements(body), out, pool);
    this.flushPool(pool, out);
    return out;
  }

  private blocks(nodes: XmlElement[], out: RawLine[], pool: Pool): void {
    for (const el of nodes) {
      switch (el.name) {
        case 'w:p':
          this.paragraph(el, out, pool);
          break;
        case 'w:tbl':
          this.flushPool(pool, out);
          this.table(el, out);
          break;
        case 'w:sdt':
          if (!child(child(el, 'w:sdtPr'), 'w:showingPlcHdr')) this.blocks(elements(child(el, 'w:sdtContent') ?? el), out, pool);
          break;
        case 'w:customXml':
        case 'w:ins':
        case 'w:moveTo':
          this.blocks(elements(el), out, pool);
          break;
        case 'mc:AlternateContent':
          this.blocks(branch(el), out, pool);
          break;
        default:
      }
    }
  }

  // ---- paragraphs ----

  private paragraph(p: XmlElement, out: RawLine[], pool: Pool): void {
    const { styles, numbering } = this.ctx;
    const pPr = child(p, 'w:pPr');
    const styleId = val(child(pPr, 'w:pStyle')) ?? styles.defaultParagraph;
    const style = styles.get(styleId);
    if (onOff(child(child(pPr, 'w:rPr'), 'w:vanish')) && !this.hasText(p)) return;
    const base: RunProps = { ...styles.defaults, ...style?.run };

    const direct = child(pPr, 'w:numPr');
    const directNum = direct && val(child(direct, 'w:numId'));
    const directLvl = direct && val(child(direct, 'w:ilvl'));
    const numId = directNum ?? style?.num?.numId;
    const ilvl = directLvl !== undefined ? +directLvl || 0 : style?.num?.ilvl ?? (numId && !directNum ? numbering.levelForStyle(numId, styleId) : 0);
    const item = numbering.next(numId, ilvl);

    const pageBreak = this.pageBreakPending || onOff(child(pPr, 'w:pageBreakBefore')) === true;
    this.pageBreakPending = false;
    const outerSize = this.paraSize;
    this.paraSize = 0;
    const lines: RawRun[][] = [[]];
    const breaks: boolean[] = [false];
    const para: ParaOut = { before: [], after: [], loose: [] };
    this.inline(elements(p), base, lines, breaks, para, []);

    const text = lines.flat().map((r) => r.text).join('');
    const label = item?.label || undefined;
    const hasInk = text.trim() !== '' || !!label;

    if (hasInk || para.before.length || para.after.length) this.flushPool(pool, out);
    out.push(...para.before);

    const indLeft = indLeftOf(pPr) ?? style?.indLeft ?? item?.indLeft;
    const marginDepth = !item && indLeft !== undefined && indLeft >= 360 ? Math.round(indLeft / 720) || 1 : undefined;
    let emitted = false;
    lines.forEach((runs, k) => {
      const lineText = runs.map((r) => r.text).join('');
      const first = k === 0;
      if (!first && lineText.trim() === '' && !lineText.includes('\t')) {
        // A page break that ends the paragraph belongs to the next one.
        if (breaks[k]) this.pageBreakPending = true;
        return;
      }
      const answerLine = first && label ? false : lineText.trim() === '' ? lineText.includes('\t') || runs.some((r) => r.underline && r.text.length > 0) : LEADERS.test(lineText) && (lineText.match(/[._…⋯‧·＿]/g)?.length ?? 0) >= 8;
      if (!hasInk && !answerLine && (para.before.length || para.after.length || para.loose.length)) return;
      const jc = val(child(pPr, 'w:jc')) ?? style?.jc;
      const tabs = foldTabs(style?.tabs, tabStopsOf(pPr));
      out.push({
        runs: answerLine ? [{ text: '\t' }] : lineText.trim() === '' && !(first && label) ? [] : runs,
        ...(first && label ? { listLabel: label, listDepth: item!.ilvl } : {}),
        ...(first && this.depth === 0 ? { layout: { ...(jc ? { jc } : {}), ...(tabs?.length ? { tabs } : {}), ...(this.paraSize ? { size: this.paraSize } : {}) } } : {}),
        ...(marginDepth ? { marginDepth } : {}),
        ...((first && pageBreak) || breaks[k] ? { pageBreak: true } : {}),
      });
      emitted = true;
    });
    if (emitted && this.depth === 0 && text.trim()) this.noteHeading(text.trim(), style?.name, style?.outlineLvl, lines, pPr, !!label);
    out.push(...para.after);
    for (const parts of para.loose) mergeParts(pool.parts, parts);
    if (hasInk) this.flushPool(pool, out);
    this.paraSize = Math.max(outerSize, this.paraSize);
  }

  private hasText(p: XmlElement): boolean {
    return textOf(p).trim() !== '';
  }

  private noteHeading(text: string, styleName: string | undefined, outline: number | undefined, lines: RawRun[][], pPr: XmlElement | undefined, listed: boolean) {
    if (this.headings.length >= 40 || text.length > 100 || listed) return;
    const titled = /^(title|heading ?1|heading ?2|標題)/.test(styleName ?? '') || outline === 0;
    const inked = lines.flat().filter((r) => r.text.trim());
    const bold = inked.length > 0 && inked.every((r) => r.bold);
    const centred = val(child(pPr, 'w:jc')) === 'center';
    if (titled || bold || centred) this.headings.push({ text, strength: titled ? 2 : 1 });
  }

  /** Inline content: runs, and the containers runs sit in. */
  private inline(nodes: XmlElement[], base: RunProps, lines: RawRun[][], breaks: boolean[], para: ParaOut, fields: Array<'code' | 'result'>): void {
    for (const el of nodes) {
      switch (el.name) {
        case 'w:r':
          this.run(el, base, lines, breaks, para, fields);
          break;
        case 'w:hyperlink':
        case 'w:smartTag':
        case 'w:customXml':
        case 'w:ins':
        case 'w:moveTo':
        case 'w:fldSimple':
        case 'w:dir':
        case 'w:bdo':
          this.inline(elements(el), base, lines, breaks, para, fields);
          break;
        case 'w:sdt':
          if (!child(child(el, 'w:sdtPr'), 'w:showingPlcHdr')) this.inline(elements(child(el, 'w:sdtContent') ?? el), base, lines, breaks, para, fields);
          break;
        case 'mc:AlternateContent':
          this.inline(branch(el), base, lines, breaks, para, fields);
          break;
        case 'm:oMathPara':
        case 'm:oMath': {
          // Word's equations as the editor's own runs (k-0480): Q₁ as a subscript, ΔQ over Q
          // as a stacked fraction (`model/fraction.ts`), brackets kept.
          const math = mathRuns(el);
          if (math.length && fields[fields.length - 1] !== 'code') lines[lines.length - 1].push(...math);
          break;
        }
        default:
      }
    }
  }

  private run(r: XmlElement, base: RunProps, lines: RawRun[][], breaks: boolean[], para: ParaOut, fields: Array<'code' | 'result'>): void {
    const rPr = child(r, 'w:rPr');
    const props: RunProps = { ...base, ...this.ctx.styles.get(val(child(rPr, 'w:rStyle')))?.run, ...readRunProps(rPr) };
    if (props.hidden) return;
    if (props.size && textOf(r).trim()) this.paraSize = Math.max(this.paraSize, props.size);
    const fmt: Omit<RawRun, 'text'> = {
      ...(props.bold ? { bold: true } : {}),
      ...(props.italic ? { italic: true } : {}),
      ...(props.underline ? { underline: true } : {}),
      ...(props.vertAlign ? { vertAlign: props.vertAlign } : {}),
      ...(props.color ? { color: props.color } : {}),
      ...(props.highlight ? { highlight: true } : {}),
    };
    const push = (text: string) => {
      if (!text || fields[fields.length - 1] === 'code') return;
      const line = lines[lines.length - 1];
      const last = line[line.length - 1];
      if (last && sameFormat(last, fmt)) last.text += text;
      else line.push({ text, ...fmt });
    };
    const newLine = (page: boolean) => {
      if (fields[fields.length - 1] === 'code') return;
      lines.push([]);
      breaks.push(page);
    };
    const walk = (nodes: XmlElement[]) => {
      for (const c of nodes) {
        switch (c.name) {
          case 'w:t':
            push(textOf(c));
            break;
          case 'w:tab':
          case 'w:ptab':
            push('\t');
            break;
          case 'w:br': {
            const type = c.attrs['w:type'];
            if (type === 'page') {
              if (lines[lines.length - 1].length || lines.length > 1) newLine(true);
              else this.pageBreakPending = true;
            } else newLine(false);
            break;
          }
          case 'w:cr':
            newLine(false);
            break;
          case 'w:noBreakHyphen':
            push('-');
            break;
          case 'w:sym':
            push(symbolChar(c.attrs['w:font'], c.attrs['w:char']));
            break;
          case 'w:fldChar': {
            const type = c.attrs['w:fldCharType'];
            if (type === 'begin') fields.push('code');
            else if (type === 'separate' && fields.length) fields[fields.length - 1] = 'result';
            else if (type === 'end') fields.pop();
            break;
          }
          case 'w:drawing':
          case 'w:pict':
          case 'w:object':
            if (fields[fields.length - 1] !== 'code') this.drawing(c, para, lines);
            break;
          case 'mc:AlternateContent':
            walk(branch(c));
            break;
          default:
        }
      }
    };
    walk(elements(r));
  }

  // ---- drawings ----

  private drawing(el: XmlElement, para: ParaOut, lines: RawRun[][]): void {
    const anchor = find(el, 'wp:anchor');
    const inline = find(el, 'wp:inline');
    const holder = anchor ?? inline;
    const extent = holder && child(holder, 'wp:extent');
    const cx = +(extent?.attrs.cx ?? 0);
    const cy = +(extent?.attrs.cy ?? 0);
    const parts = emptyParts();
    collect(el, parts, groupScale(el, cx));
    // A lone picture takes the drawing's own size.
    if (parts.pics.length === 1 && cx && cy && !find(el, 'wpg:wgp') && !find(el, 'wpc:wpc')) {
      parts.pics[0].widthPx = Math.round(cx / EMU_PER_PX);
      parts.pics[0].heightPx = Math.round(cy / EMU_PER_PX);
    }
    const docPr = holder && child(holder, 'wp:docPr');
    const alt = docPr?.attrs.descr || undefined;
    if (alt && parts.pics.length === 1 && !parts.pics[0].alt) parts.pics[0].alt = alt;

    // Placement: an anchor set above its paragraph comes before it; a picture that opens
    // an unlabelled paragraph too. Everything else follows the paragraph.
    const posV = anchor && child(anchor, 'wp:positionV');
    const offset = Number(posV && child(posV, 'wp:posOffset') ? textOf(child(posV, 'wp:posOffset')!) : NaN);
    const above = !!anchor && /^(paragraph|line)$/.test(posV?.attrs.relativeFrom ?? '') && offset < 0;
    const atStart = !anchor && lines.length === 1 && lines[0].every((r) => !r.text.trim());
    const sink = above || atStart ? para.before : para.after;

    if (parts.lost) {
      sink.push(this.lostLine(parts.lost));
      return;
    }
    const tiny = parts.boxes.filter((b) => boxText(b).length <= LABEL_MAX).length;
    const short = parts.boxes.filter((b) => boxText(b).length <= SHORT_MAX);
    const prose = parts.boxes.filter((b) => boxText(b).length > SHORT_MAX);
    if (parts.pics.length) {
      for (const pic of parts.pics) sink.push(this.picture(pic));
      for (const box of parts.boxes.filter((b) => boxText(b).length > LABEL_MAX)) this.box(box, sink);
      return;
    }
    // Floating pieces are pooled with their neighbours: a diagram drawn shape by shape,
    // its caption and legend, settle together once text resumes.
    const floating = !!anchor || el.name === 'w:pict';
    if (isFigure(parts, tiny)) {
      if (floating) para.loose.push({ ...emptyParts(), figures: 1 });
      else sink.push(this.lostLine('drawing'));
      return;
    }
    for (const box of prose) this.box(box, sink);
    if (floating) para.loose.push({ ...parts, boxes: short });
    else for (const box of short) this.box(box, sink);
  }

  private box(box: XmlElement, sink: RawLine[]): void {
    this.depth++;
    const pool: Pool = { parts: emptyParts() };
    this.blocks(elements(box), sink, pool);
    this.flushPool(pool, sink);
    this.depth--;
  }

  private flushPool(pool: Pool, out: RawLine[]): void {
    const p = pool.parts;
    pool.parts = emptyParts();
    if (!p.shapes && !p.boxes.length && !p.figures) return;
    // Nothing but ruled lines across the column: the answer lines of a question-answer book,
    // read as the typed ones are (an answer line each), not as a lost picture (k-0494).
    if (p.rules >= 2 && p.rules === p.shapes && !p.figures && !p.boxes.length && !p.pics.length) {
      for (let k = 0; k < p.rules; k++) out.push({ runs: [{ text: '\t' }] });
      return;
    }
    const tiny = p.boxes.filter((b) => boxText(b).length <= LABEL_MAX).length;
    if (!p.figures && !isFigure(p, tiny)) {
      for (const box of p.boxes) this.box(box, out);
      return;
    }
    // Labels and legends are the diagram's; a caption stays as text before its slot.
    for (const box of p.boxes) if (CAPTION.test(boxText(box))) this.box(box, out);
    for (let k = 0; k < Math.max(1, p.figures); k++) out.push(this.lostLine('drawing'));
  }

  private picture(pic: Parts['pics'][number]): RawLine {
    const rel = pic.rid ? this.ctx.rels.get(pic.rid) : undefined;
    const ref: ImageRef = {
      src: '',
      ...(pic.widthPx ? { widthPx: pic.widthPx } : {}),
      ...(pic.heightPx ? { heightPx: pic.heightPx } : {}),
      ...(pic.alt ? { alt: pic.alt } : {}),
    };
    this.images.push({ ref, ...(rel ? { rel } : {}) });
    return { runs: [], image: ref };
  }

  private lostLine(kind: string): RawLine {
    return { runs: [], image: { src: '', alt: kind } };
  }

  // ---- tables ----

  private table(tbl: XmlElement, out: RawLine[]): void {
    const rows = elements(tbl).flatMap((el) => rowsOf(el));
    const single = rows.every((tr) => cellsOf(tr).length <= 1);
    if (single) {
      // A one-column table is a frame (a source box): its content reads as body text.
      const pool: Pool = { parts: emptyParts() };
      for (const tr of rows) for (const tc of cellsOf(tr)) this.blocks(elements(tc), out, pool);
      this.flushPool(pool, out);
      return;
    }
    const tblPr = child(tbl, 'w:tblPr');
    const borders = this.tableBorders(tblPr, rows);
    if (borders === 'none' && isLayoutTable(rows)) {
      this.layoutTable(rows, out);
      return;
    }
    const read = rows.map((tr) => {
      let col = +(val(child(child(tr, 'w:trPr'), 'w:gridBefore')) ?? 0) || 0;
      return cellsOf(tr).map((tc) => {
        const tcPr = child(tc, 'w:tcPr');
        const span = Math.max(1, +(val(child(tcPr, 'w:gridSpan')) ?? 1) || 1);
        const vMerge = child(tcPr, 'w:vMerge');
        const pictures: RawLine[] = [];
        const lined = this.cell(tc, pictures);
        // A break inside a cell joins with a space on the row's line, as in the HTML paste;
        // the cell itself keeps it as a line break.
        const runs = lined.map((r) => ({ ...r, text: r.text.replace(/\n/g, ' ') }));
        const cell: ReadCell = { runs, lined, pictures, col, span, info: this.cellInfo(tc) };
        if (vMerge) cell.vMerge = vMerge.attrs['w:val'] === 'restart' ? 'restart' : 'continue';
        col += span;
        return cell;
      });
    });
    const options = pictureOptionCells(read);
    if (options) {
      // Option letters with their pictures: each letter, then its picture (`pairByCell`).
      for (const { row, col, pictures } of options) out.push({ runs: read[row][col].runs }, ...pictures);
      return;
    }
    const gridCols = childrenNamed(child(tbl, 'w:tblGrid'), 'w:gridCol').map((g) => +(g.attrs['w:w'] ?? 0) || 0);
    const account = tAccount(read);
    if (account) {
      out.push(...account);
      return;
    }
    const width = Math.max(gridCols.length, ...read.map((row) => (row.length ? row[row.length - 1].col + row[row.length - 1].span : 0)));
    // Grid-complete rows: a merged cell, then the columns it covers.
    const placed = read.map((row) => {
      const cells: (ReadCell | null)[] = Array.from({ length: width }, () => null);
      for (const c of row) if (c.col < width) cells[c.col] = c;
      return cells;
    });
    const inked = (c: ReadCell | null) => !!c && c.vMerge !== 'continue' && (c.runs.some((r) => r.text.trim()) || c.pictures.some((p) => p.image));
    const kept = placed.map((_, r) => r).filter((r) => placed[r].some(inked));
    const header = rows.findIndex((tr) => onOff(child(child(tr, 'w:trPr'), 'w:tblHeader')) !== true);
    const headerRows = kept.filter((r) => r < (header < 0 ? rows.length : header)).length;
    const total = gridCols.reduce((a, b) => a + b, 0);
    const jc = val(child(tblPr, 'w:jc'));
    const table: ReaderTable = {
      ...(gridCols.length === width && total > 0 ? { columnWidths: gridCols.map((w) => Math.round((w / total) * 10000) / 10000) } : {}),
      ...(total > 0 && this.textWidth && total / this.textWidth < 0.9 ? { width: Math.round((total / this.textWidth) * 100) / 100 } : {}),
      ...(jc === 'center' || jc === 'right' || jc === 'end' ? { align: jc === 'center' ? ('center' as const) : ('right' as const) } : {}),
      ...(borders === 'box' ? { borders: 'box' as const } : {}),
      ...(headerRows ? { headerRows } : {}),
      dense: kept.some((r) => placed[r].filter((c) => c?.runs.some((x) => x.text.trim())).length >= 2),
    };
    const after: RawLine[] = [];
    for (const [k, r] of kept.entries()) {
      const infos: ReaderCell[] = [];
      const cells: RawRun[][] = [];
      const flat: RawRun[][] = [];
      const tall = placed[r].some((c) => !!c && (c.lined.some((x) => x.text.includes('\n')) || c.pictures.some((p) => p.image)));
      for (let col = 0; col < width; col++) {
        const c = placed[r][col];
        if (!c) {
          // Covered by a merge from the left, or a column this row does not reach.
          const covered = placed[r].slice(0, col).some((x) => !!x && x.col + x.span > col);
          infos.push(covered ? { covered: true } : {});
          cells.push([]);
          flat.push([]);
          continue;
        }
        const info: ReaderCell = { ...c.info };
        if (c.span > 1) info.colSpan = c.span;
        if (c.vMerge === 'continue' && kept.slice(0, k).some((above) => placed[above][col]?.vMerge === 'restart')) info.covered = true;
        if (c.vMerge === 'restart') {
          let n = 1;
          while (k + n < kept.length && placed[kept[k + n]][col]?.vMerge === 'continue') n++;
          if (n > 1) info.rowSpan = n;
        }
        // Top or middle shows only where a row's cells differ in height.
        if (info.vAlign === 'top' && !tall) delete info.vAlign;
        // A ruled table keeps a cell's one picture in the cell; others go after the table.
        const pictures = c.pictures.filter((p) => p.image);
        if (borders !== 'none' && pictures.length === 1 && !info.covered) info.image = pictures[0].image;
        else after.push(...c.pictures);
        infos.push(info);
        cells.push(info.covered ? [] : c.lined);
        flat.push(info.covered ? [] : c.runs);
      }
      const joined: RawRun[] = [];
      flat.forEach((c, n) => joined.push(...(n ? [{ text: '\t' }] : []), ...c));
      out.push({ runs: joined, cells, tableRow: { table, cells: infos } });
    }
    out.push(...after);
  }

  /**
   * Which rules a table draws: the table's own borders over its style's (Word's "Normal
   * Table" draws none), or most cells ruling themselves.
   */
  private tableBorders(tblPr: XmlElement | undefined, rows: XmlElement[]): 'all' | 'box' | 'none' {
    const { styles } = this.ctx;
    const style = styles.get(val(child(tblPr, 'w:tblStyle')) ?? styles.defaultTable);
    const sides: BorderSides = { ...style?.borders, ...bordersOf(child(tblPr, 'w:tblBorders')) };
    if (sides.insideH || sides.insideV) return 'all';
    const cells = rows.flatMap(cellsOf);
    const ruled = cells.filter((tc) => Object.values(bordersOf(child(child(tc, 'w:tcPr'), 'w:tcBorders')) ?? {}).filter(Boolean).length >= 2).length;
    if (cells.length && ruled >= cells.length / 2) return 'all';
    return sides.top && sides.bottom && sides.left && sides.right ? 'box' : 'none';
  }

  /** A cell's alignment, from its paragraphs (all the same, or none), and its vertical placement. */
  private cellInfo(tc: XmlElement): ReaderCell {
    const { styles } = this.ctx;
    const jcs = new Set<string>();
    for (const p of childrenNamed(tc, 'w:p')) {
      if (!textOf(p).trim()) continue;
      const pPr = child(p, 'w:pPr');
      jcs.add(val(child(pPr, 'w:jc')) ?? styles.get(val(child(pPr, 'w:pStyle')) ?? styles.defaultParagraph)?.jc ?? 'left');
    }
    const jc = jcs.size === 1 ? [...jcs][0] : undefined;
    const v = val(child(child(tc, 'w:tcPr'), 'w:vAlign'));
    return {
      ...(jc === 'center' ? { align: 'center' as const } : jc === 'right' || jc === 'end' ? { align: 'right' as const } : jc === 'both' || jc === 'distribute' ? { justify: true as const } : {}),
      // Word's default is the top; the editor's is the middle, which a row of one line never shows.
      ...(v === 'bottom' ? { vAlign: 'bottom' as const } : v === 'center' ? {} : { vAlign: 'top' as const }),
    };
  }

  /**
   * A borderless table that only lays text out (a dialogue, a passage beside a label): each
   * row reads as one line with TABs between its cells, as if typed so; a row whose cells
   * hold several paragraphs reads as body text, cell after cell.
   */
  private layoutTable(rows: XmlElement[], out: RawLine[]): void {
    for (const tr of rows) {
      const cells = cellsOf(tr);
      if (cells.every((tc) => childrenNamed(tc, 'w:p').filter((p) => textOf(p).trim()).length <= 1 && !childrenNamed(tc, 'w:tbl').length)) {
        const after: RawLine[] = [];
        const runs: RawRun[] = [];
        cells.forEach((tc, k) => {
          const cell = this.cell(tc, after).filter((r) => r.text !== '\n');
          if (k) runs.push({ text: '\t' });
          runs.push(...cell);
        });
        if (runs.some((r) => r.text.trim())) out.push({ runs });
        out.push(...after);
        continue;
      }
      const pool: Pool = { parts: emptyParts() };
      for (const tc of cells) this.blocks(elements(tc), out, pool);
      this.flushPool(pool, out);
    }
  }

  /** A cell's paragraphs as one run list, `\n` between them; its pictures go after the table. */
  private cell(tc: XmlElement, after: RawLine[]): RawRun[] {
    const lines: RawLine[] = [];
    this.depth++;
    const pool: Pool = { parts: emptyParts() };
    this.blocks(elements(tc), lines, pool);
    this.flushPool(pool, lines);
    this.depth--;
    const out: RawRun[] = [];
    for (const line of lines) {
      if (line.image) {
        after.push(line);
        continue;
      }
      if (line.cells) {
        // A nested table flattens into the cell.
        if (out.length) out.push({ text: '\n' });
        out.push(...line.runs.map((r) => ({ ...r, text: r.text.replace(/\t/g, ' ') })));
        continue;
      }
      const text = line.runs.map((r) => r.text).join('');
      if (!text.trim() && !line.listLabel) continue;
      if (out.length) out.push({ text: '\n' });
      if (line.listLabel) out.push({ text: `${line.listLabel}\t` });
      out.push(...line.runs);
    }
    return out;
  }
}

/**
 * Once pictures are loaded: a cell picture that did not load (a chart, an EMF) leaves the
 * cell for a line of its own after its table, where the figure check shows its slot.
 */
export function settleCellImages(lines: RawLine[]): RawLine[] {
  const out: RawLine[] = [];
  let lost: RawLine[] = [];
  for (const [k, line] of lines.entries()) {
    const row = line.tableRow;
    if (row) {
      for (const cell of row.cells) {
        if (cell.image && !/^data:image\//.test(cell.image.src)) {
          lost.push({ runs: [], image: cell.image });
          delete cell.image;
        }
      }
    }
    out.push(line);
    if (lost.length && lines[k + 1]?.tableRow?.table !== row?.table) {
      out.push(...lost);
      lost = [];
    }
  }
  return out;
}

function rowsOf(el: XmlElement): XmlElement[] {
  if (el.name === 'w:tr') return child(child(el, 'w:trPr'), 'w:del') ? [] : [el];
  if (el.name === 'w:sdt') return elements(child(el, 'w:sdtContent') ?? el).flatMap(rowsOf);
  if (el.name === 'w:customXml' || el.name === 'w:ins' || el.name === 'mc:AlternateContent') return (el.name === 'mc:AlternateContent' ? branch(el) : elements(el)).flatMap(rowsOf);
  return [];
}

/** A table of picture options ("A." over each graph): each lettered cell with its pictures, or null. */
function pictureOptionCells(grid: ReadonlyArray<ReadonlyArray<{ runs: RawRun[]; pictures: RawLine[] }>>) {
  return pairByCell(
    grid.map((row) =>
      row.map(({ runs, pictures }) => {
        const text = runs.map((r) => r.text).join('').trim();
        const label = text ? parseLabel(labelZone(`${text} `)) : null;
        const option = label && labelLevel(label.family) === 'option' ? { value: label.value, family: label.family, lone: !!loneOptionLabel(labelZone(text)) } : undefined;
        return { text, ...(option ? { option } : {}), pictures: pictures.filter((p) => p.image) };
      }),
    ),
  );
}

/** A cell as the table reader holds it: its runs (breaks as spaces, and as `\n`), pictures and grid place. */
interface ReadCell {
  runs: RawRun[];
  lined: RawRun[];
  pictures: RawLine[];
  col: number;
  span: number;
  vMerge?: 'restart' | 'continue';
  info: ReaderCell;
}

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const cjk = (text: string) => (text.match(/[\u3400-\u9fff]/g) ?? []).length;
/** Running text, not a figure or a heading: what a data table's cell rarely holds. */
const isProse = (text: string) => (text.length >= 50 && words(text) >= 8) || cjk(text) >= 25;

/** A table that lays out prose rather than holding data: some cell is a passage. */
function isLayoutTable(rows: XmlElement[]): boolean {
  return rows.some((tr) => cellsOf(tr).some((tc) => isProse(childrenNamed(tc, 'w:p').map(textOf).join(' ').trim())));
}

/** A figure in a balance sheet: a number (with $, %, a sign, brackets), or a blank to fill. */
const FIGURE = /^(?:[-−+(]?\s*[$¥£€]?\s*\d[\d,.\s]*\)?\s*%?|[?？_＿.…]+)$/;

/** "Reserves ⇥ 500": an entry's label and figure, cut at its last TAB. */
function entryOf(runs: RawRun[]): [RawRun[], RawRun[]] | null {
  const text = runs.map((r) => r.text).join('');
  const at = text.lastIndexOf('\t');
  if (at < 0) return null;
  const label = text.slice(0, at).trim();
  const figure = text.slice(at + 1).trim();
  if (!label) return null;
  if (!FIGURE.test(figure)) return null;
  const trim = (from: number, to: number) => {
    const piece = text.slice(from, to);
    const start = from + piece.length - piece.trimStart().length;
    const end = from + piece.trimEnd().length;
    return normalizeRuns(sliceRichText(runs, start, end)) as RawRun[];
  };
  const labelRuns = trim(0, at).map((r) => ({ ...r, text: r.text.replace(/\t+/g, ' ') }));
  return labelRuns.some((r) => r.text.trim()) ? [labelRuns, trim(at + 1, text.length)] : null;
}

/** A cell's lines (its `\n` breaks) as run lists. */
function cellLines(runs: RawRun[]): RawRun[][] {
  const lines: RawRun[][] = [[]];
  for (const r of runs) {
    const parts = r.text.split('\n');
    parts.forEach((part, k) => {
      if (k) lines.push([]);
      if (part) lines[lines.length - 1].push({ ...r, text: part });
    });
  }
  return lines.filter((l) => l.some((r) => r.text.trim()));
}

/**
 * A bank's balance sheet typed as two columns: a heading over each side, and under it
 * lines of "label ⇥ figure". Read as the editor's T-account (`tableTemplates`
 * `balanceSheet`): four columns, each heading across its side's two, the rules of a
 * T-account (k-0491).
 */
function tAccount(read: ReadCell[][]): RawLine[] | null {
  if (read.length < 2 || read.some((row) => row.length !== 2 || row.some((c) => c.span !== 1 || c.vMerge || c.pictures.length))) return null;
  const head = read[0].map((c) => c.lined.map((r) => r.text).join('').trim());
  if (head.some((t) => !t || /[\t\n]/.test(t))) return null;
  const sides: [RawRun[], RawRun[]][][] = [[], []];
  for (const row of read.slice(1)) {
    for (const [k, c] of row.entries()) {
      for (const line of cellLines(c.lined)) {
        const entry = entryOf(line);
        if (!entry) return null;
        sides[k].push(entry);
      }
    }
  }
  if (!sides[0].length || !sides[1].length) return null;
  const table: ReaderTable = { borders: 'headerRule', columnWidths: [0.3275, 0.1725, 0.3275, 0.1725], width: 0.62, align: 'center', dense: true };
  const line = (cells: RawRun[][], infos: ReaderCell[]): RawLine => {
    const runs: RawRun[] = [];
    cells.forEach((c, n) => runs.push(...(n ? [{ text: '\t' }] : []), ...c));
    return { runs, cells, tableRow: { table, cells: infos } };
  };
  const out = [line([read[0][0].runs, [], read[0][1].runs, []], [{ colSpan: 2, align: 'center' }, { covered: true }, { colSpan: 2, align: 'center' }, { covered: true }])];
  for (let n = 0; n < Math.max(sides[0].length, sides[1].length); n++) {
    const [l = [[], []], r = [[], []]] = [sides[0][n], sides[1][n]];
    out.push(line([l[0], l[1], r[0], r[1]], [{}, { align: 'right' }, {}, { align: 'right' }]));
  }
  return out;
}

function cellsOf(tr: XmlElement): XmlElement[] {
  const out: XmlElement[] = [];
  for (const el of elements(tr)) {
    if (el.name === 'w:tc') out.push(el);
    else if (el.name === 'w:sdt') out.push(...elements(child(el, 'w:sdtContent') ?? el).filter((c) => c.name === 'w:tc'));
    else if (el.name === 'w:customXml') out.push(...elements(el).filter((c) => c.name === 'w:tc'));
  }
  return out;
}

function mergeParts(into: Parts, from: Parts): void {
  into.pics.push(...from.pics);
  into.boxes.push(...from.boxes);
  into.shapes += from.shapes;
  into.curves += from.curves;
  into.figures += from.figures;
  into.rules += from.rules;
  into.lost ??= from.lost;
}

function sameFormat(a: RawRun, b: Omit<RawRun, 'text'>): boolean {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.vertAlign === b.vertAlign &&
    a.color === b.color &&
    a.highlight === b.highlight &&
    a.fraction === b.fraction
  );
}

/** Office Math as its plain characters (`m:t`), fractions as a/b: where runs cannot stack. */
function mathText(el: XmlElement): string {
  if (el.name === 'm:t') return textOf(el);
  if (el.name === 'm:f') {
    const num = child(el, 'm:num');
    const den = child(el, 'm:den');
    if (num && den) return linearFraction(mathText(num), mathText(den));
  }
  if (el.name === 'm:d') return delimited(el, mathText).map((r) => r.text).join('');
  if (el.name.endsWith('Pr')) return '';
  return elements(el).map(mathText).join('');
}

/** An `m:d`'s brackets around its parts: "(" … ")" unless Word set other characters (or none). */
function delimited(el: XmlElement, inner: (e: XmlElement) => RawRun[] | string): RawRun[] {
  const pr = child(el, 'm:dPr');
  const chr = (name: string, fallback: string) => {
    const node = child(pr, name);
    return node ? (node.attrs['m:val'] ?? '') : fallback;
  };
  const wrapped = elements(el).filter((e) => e.name === 'm:e');
  // Word wraps each part in m:e; a file that does not is read as one part.
  const parts = wrapped.length ? wrapped : [{ ...el, children: elements(el).filter((e) => !e.name.endsWith('Pr')) }];
  const sep = chr('m:sepChr', '|');
  const out: RawRun[] = [];
  const open = chr('m:begChr', '(');
  if (open) out.push({ text: open });
  parts.forEach((part, k) => {
    if (k && sep) out.push({ text: sep });
    const got = inner(part);
    out.push(...(typeof got === 'string' ? (got ? [{ text: got }] : []) : got));
  });
  const close = chr('m:endChr', ')');
  if (close) out.push({ text: close });
  return out;
}

/**
 * Office Math as runs (k-0480). `m:sSub`/`m:sSup` give subscript and superscript runs;
 * `m:f` a stacked fraction through `fractionRuns`, as the editor's Fraction dialog makes
 * one; a fraction inside a fraction, which runs cannot stack, prints as a/b. Variables
 * come in upright, as a teacher types them; bold set in the equation is kept.
 */
function mathRuns(el: XmlElement, inFraction = false): RawRun[] {
  const all = (e: XmlElement | undefined) => (e ? elements(e).flatMap((c) => mathRuns(c, inFraction)) : []);
  const raised = (runs: RawRun[], vertAlign: 'subscript' | 'superscript') => runs.map((r) => (r.vertAlign || r.fraction ? r : { ...r, vertAlign }));
  switch (el.name) {
    case 'm:r': {
      const text = elements(el).filter((c) => c.name === 'm:t').map(textOf).join('');
      if (!text) return [];
      const sty = child(child(el, 'm:rPr'), 'm:sty')?.attrs['m:val'];
      const bold = sty === 'b' || sty === 'bi' || onOff(child(child(el, 'w:rPr'), 'w:b')) === true;
      return [{ text, ...(bold ? { bold: true } : {}) }];
    }
    case 'm:f': {
      const num = child(el, 'm:num');
      const den = child(el, 'm:den');
      if (!num || !den) return all(el);
      if (inFraction) return [{ text: mathText(el) }];
      const top = elements(num).flatMap((c) => mathRuns(c, true));
      const bottom = elements(den).flatMap((c) => mathRuns(c, true));
      return fractionRuns(top, bottom) as RawRun[];
    }
    case 'm:sSub':
      return [...all(child(el, 'm:e')), ...raised(all(child(el, 'm:sub')), 'subscript')];
    case 'm:sSup':
      return [...all(child(el, 'm:e')), ...raised(all(child(el, 'm:sup')), 'superscript')];
    case 'm:sSubSup':
      return [...all(child(el, 'm:e')), ...raised(all(child(el, 'm:sub')), 'subscript'), ...raised(all(child(el, 'm:sup')), 'superscript')];
    case 'm:sPre':
      return [...raised(all(child(el, 'm:sub')), 'subscript'), ...raised(all(child(el, 'm:sup')), 'superscript'), ...all(child(el, 'm:e'))];
    case 'm:d':
      return delimited(el, (part) => elements(part).flatMap((c) => mathRuns(c, inFraction)));
    case 'm:rad': {
      const degree = mathText(child(el, 'm:deg') ?? el).trim();
      const body = all(child(el, 'm:e'));
      const long = body.map((r) => r.text).join('').length > 1;
      return [{ text: `${child(el, 'm:deg') && degree ? degree : ''}√` }, ...(long ? [{ text: '(' }, ...body, { text: ')' }] : body)];
    }
    case 'm:nary': {
      const chr = child(child(el, 'm:naryPr'), 'm:chr')?.attrs['m:val'] ?? '∫';
      return [{ text: chr }, ...raised(all(child(el, 'm:sub')), 'subscript'), ...raised(all(child(el, 'm:sup')), 'superscript'), ...all(child(el, 'm:e'))];
    }
    case 'm:t':
      return textOf(el) ? [{ text: textOf(el) }] : [];
    default:
      if (el.name.endsWith('Pr')) return [];
      return all(el);
  }
}
