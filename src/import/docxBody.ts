/**
 * `word/document.xml` → raw lines, in reading order: paragraphs, table rows, text-box
 * content where its anchor sits, pictures on their line, and a lost picture (chart,
 * SmartArt, EMF, a drawing made of Word shapes) as an image line with no data so the
 * figure check shows a slot. Pictures are only noted here; `readDocx` loads them.
 */
import { indLeftOf, readRunProps, type Numbering, type RunProps, type Styles } from './docxNumbering';
import type { RawLine, RawRun } from './readPlain';
import type { ImageRef } from './types';
import { child, elements, find, onOff, textOf, val, type XmlElement } from './xml';

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
  lost?: string;
}

const emptyParts = (): Parts => ({ pics: [], boxes: [], shapes: 0, curves: 0, figures: 0 });

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

  constructor(private ctx: BodyContext) {}

  read(body: XmlElement): RawLine[] {
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
      out.push({
        runs: answerLine ? [{ text: '\t' }] : lineText.trim() === '' && !(first && label) ? [] : runs,
        ...(first && label ? { listLabel: label, listDepth: item!.ilvl } : {}),
        ...(marginDepth ? { marginDepth } : {}),
        ...((first && pageBreak) || breaks[k] ? { pageBreak: true } : {}),
      });
      emitted = true;
    });
    if (emitted && this.depth === 0 && text.trim()) this.noteHeading(text.trim(), style?.name, style?.outlineLvl, lines, pPr, !!label);
    out.push(...para.after);
    for (const parts of para.loose) mergeParts(pool.parts, parts);
    if (hasInk) this.flushPool(pool, out);
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
          const math = mathText(el);
          if (math && fields[fields.length - 1] !== 'code') lines[lines.length - 1].push({ text: math });
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
    const after: RawLine[] = [];
    for (const tr of rows) {
      const cells: RawRun[][] = cellsOf(tr).map((tc) => this.cell(tc, after));
      if (!cells.some((c) => c.some((r) => r.text.trim()))) continue;
      const joined: RawRun[] = [];
      cells.forEach((c, k) => joined.push(...(k ? [{ text: '\t' }] : []), ...c.map((r) => ({ ...r, text: r.text.replace(/\n/g, ' ') }))));
      out.push({ runs: joined, cells });
    }
    out.push(...after);
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

function rowsOf(el: XmlElement): XmlElement[] {
  if (el.name === 'w:tr') return child(child(el, 'w:trPr'), 'w:del') ? [] : [el];
  if (el.name === 'w:sdt') return elements(child(el, 'w:sdtContent') ?? el).flatMap(rowsOf);
  if (el.name === 'w:customXml' || el.name === 'w:ins' || el.name === 'mc:AlternateContent') return (el.name === 'mc:AlternateContent' ? branch(el) : elements(el)).flatMap(rowsOf);
  return [];
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
  into.lost ??= from.lost;
}

function sameFormat(a: RawRun, b: Omit<RawRun, 'text'>): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.vertAlign === b.vertAlign && a.color === b.color && a.highlight === b.highlight;
}

/** Office Math as its plain characters (`m:t`), fractions as a/b. */
function mathText(el: XmlElement): string {
  if (el.name === 'm:t') return textOf(el);
  if (el.name === 'm:f') {
    const num = child(el, 'm:num');
    const den = child(el, 'm:den');
    if (num && den) return `${mathText(num)}/${mathText(den)}`;
  }
  return elements(el).map(mathText).join('');
}
