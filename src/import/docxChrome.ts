/**
 * A `.docx` file's page chrome: the header and footer parts its sections reference
 * (default, first page, even pages) read as rows of zoned pieces, and the masthead taken
 * off the top of the body's lines. `PAGE`/`NUMPAGES` fields become page number marks;
 * tabs, `w:ptab` and tab stops (or `w:jc`) give each piece its zone. Pictures, text
 * boxes, tables and a fourth piece on a line are kept as text in `unsupported`.
 */
import { branch, symbolChar } from './docxBody';
import { foldTabs, readRunProps, tabStopsOf, type RunProps, type Styles, type TabStop } from './docxNumbering';
import {
  PAGE_MARK,
  PAGES_MARK,
  mastheadSpan,
  mastheadVerdict,
  rowIsEmpty,
  rowOf,
  zoneAt,
  type ChromeLeftover,
  type ChromeReason,
  type ChromeRow,
  type ChromeStyle,
  type ChromeZone,
  type MastheadVerdict,
  type DetectedChrome,
  type PageChrome,
  type Segment,
} from './pageChrome';
import type { RawLine, RawRun } from './readPlain';
import { child, childrenNamed, elements, find, findAll, onOff, textOf, val, type XmlElement } from './xml';

/** A4 with Word's default margins: the text width when the section does not say. */
const DEFAULT_WIDTH = 9026;

export interface ChromeContext {
  styles: Styles;
  /** The text column, twips. */
  width: number;
}

type Found = Omit<ChromeLeftover, 'where'>;

// ---- one paragraph ----

interface Piece {
  text: string;
  props: RunProps;
}

interface ParaRead {
  /** Text between tabs; a `w:ptab` names its own zone. */
  segments: Array<{ pieces: Piece[]; zone?: ChromeZone }>;
  /** Further lines after a `w:br`. */
  more: ParaRead[];
}

const PTAB_ZONE: Record<string, ChromeZone> = { left: 'left', center: 'center', right: 'right' };

/** Walk a paragraph's runs: text, tabs, page fields, line breaks; drawings found as leftovers. */
function readParagraph(p: XmlElement, ctx: ChromeContext, found: Found[]): ParaRead[] {
  const pPr = child(p, 'w:pPr');
  const style = ctx.styles.get(val(child(pPr, 'w:pStyle')) ?? ctx.styles.defaultParagraph);
  const base: RunProps = { ...ctx.styles.defaults, ...style?.run };
  const lines: ParaRead[] = [{ segments: [{ pieces: [] }], more: [] }];
  const fields: Array<{ code: string; result: boolean; mark?: string }> = [];
  const hiding = () => fields.some((f) => f.result && f.mark !== undefined) || fields.some((f) => !f.result);
  const line = () => lines[lines.length - 1];
  const push = (text: string, props: RunProps) => {
    if (!text) return;
    const seg = line().segments[line().segments.length - 1];
    seg.pieces.push({ text, props });
  };
  const markOf = (code: string) => (/^\s*PAGE\b/i.test(code) ? PAGE_MARK : /^\s*(NUMPAGES|SECTIONPAGES)\b/i.test(code) ? PAGES_MARK : undefined);

  const run = (r: XmlElement) => {
    const rPr = child(r, 'w:rPr');
    const props: RunProps = { ...base, ...ctx.styles.get(val(child(rPr, 'w:rStyle')))?.run, ...readRunProps(rPr) };
    if (props.hidden) return;
    const walk = (nodes: XmlElement[]) => {
      for (const c of nodes) {
        switch (c.name) {
          case 'w:t':
            if (!hiding()) {
              const text = textOf(c);
              // An underlined blank is a line to write on.
              push(props.underline && !text.trim() && text.length > 0 ? '_'.repeat(Math.max(3, text.length)) : text, props);
            }
            break;
          case 'w:tab':
            if (!hiding()) line().segments.push({ pieces: [] });
            break;
          case 'w:ptab':
            if (!hiding()) line().segments.push({ pieces: [], zone: PTAB_ZONE[c.attrs['w:alignment'] ?? ''] ?? 'left' });
            break;
          case 'w:br':
          case 'w:cr':
            if (!hiding() && c.attrs['w:type'] !== 'page') lines.push({ segments: [{ pieces: [] }], more: [] });
            break;
          case 'w:noBreakHyphen':
            if (!hiding()) push('-', props);
            break;
          case 'w:sym':
            if (!hiding()) push(symbolChar(c.attrs['w:font'], c.attrs['w:char']), props);
            break;
          case 'w:instrText':
            if (fields.length && !fields[fields.length - 1].result) fields[fields.length - 1].code += textOf(c);
            break;
          case 'w:fldChar': {
            const type = c.attrs['w:fldCharType'];
            if (type === 'begin') fields.push({ code: '', result: false });
            else if (type === 'separate' && fields.length) {
              const f = fields[fields.length - 1];
              f.mark = markOf(f.code);
              f.result = true;
              if (f.mark && fields.length === 1) push(f.mark, props);
            } else if (type === 'end') {
              const f = fields.pop();
              // A field with no result shown yet ("PAGE" before Word updated it).
              if (f && !f.result && fields.length === 0) {
                const mark = markOf(f.code);
                if (mark) push(mark, props);
              }
            }
            break;
          }
          case 'w:drawing':
          case 'w:pict':
          case 'w:object':
            drawing(c, found);
            break;
          case 'mc:AlternateContent':
            walk(branch(c));
            break;
          default:
        }
      }
    };
    walk(elements(r));
  };

  const inline = (nodes: XmlElement[]) => {
    for (const el of nodes) {
      switch (el.name) {
        case 'w:r':
          run(el);
          break;
        case 'w:fldSimple': {
          const mark = markOf(el.attrs['w:instr'] ?? '');
          if (mark) push(mark, { ...base, ...readRunProps(child(find(el, 'w:r') ?? el, 'w:rPr')) });
          else inline(elements(el));
          break;
        }
        case 'w:sdt':
          if (!child(child(el, 'w:sdtPr'), 'w:showingPlcHdr')) inline(elements(child(el, 'w:sdtContent') ?? el));
          break;
        case 'w:hyperlink':
        case 'w:smartTag':
        case 'w:customXml':
        case 'w:ins':
        case 'w:moveTo':
        case 'w:dir':
        case 'w:bdo':
          inline(elements(el));
          break;
        case 'mc:AlternateContent':
          inline(branch(el));
          break;
        default:
      }
    }
  };
  inline(elements(p));
  return lines;
}

/** A picture, text box or drawn shape in a header: its text is kept for the teacher. */
function drawing(el: XmlElement, found: Found[]): void {
  const boxes = findAll(el, 'w:txbxContent');
  // Word writes a text box twice (DrawingML and VML); one copy is enough.
  const text = (boxes[0] ? findAll(boxes[0], 'w:p').map((p) => textOf(p).trim()).filter(Boolean) : []).join('\n');
  if (text) {
    found.push({ text, reason: 'textBox' });
    return;
  }
  const docPr = find(el, 'wp:docPr');
  const alt = (docPr?.attrs.descr ?? docPr?.attrs.title ?? '').trim();
  found.push({ text: alt, reason: 'picture' });
}

const bordered = (pPr: XmlElement | undefined, side: 'top' | 'bottom') => {
  const b = child(child(pPr, 'w:pBdr'), `w:${side}`);
  return !!b && !/^(none|nil)$/i.test(b.attrs['w:val'] ?? '');
};

/** The zone each tab moves to, in order: explicit stops first, then Word's header stops. */
function tabZones(stops: readonly TabStop[] | undefined, width: number): ChromeZone[] {
  const real = (stops ?? []).filter((t) => t.val !== 'clear' && t.val !== 'bar' && t.pos > 0);
  const zones = real.map((t): ChromeZone => (t.val === 'center' ? 'center' : t.val === 'right' || t.val === 'end' ? 'right' : zoneAt(t.pos / width)));
  return [...zones, 'center', 'right'];
}

const jcZone = (jc: string | undefined): ChromeZone => (jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : 'left');

/** What a run of pieces printed as: bold or size only when every inked piece agrees. */
export function styleOf(pieces: ReadonlyArray<{ text: string; props: Pick<RunProps, 'bold' | 'italic' | 'underline' | 'size'> }>, bodySize: number | undefined): ChromeStyle {
  const inked = pieces.filter((p) => p.text.replace(/[_\s]/g, ''));
  if (!inked.length) return {};
  const all = (k: 'bold' | 'italic') => inked.every((p) => p.props[k]);
  const sizes = new Set(inked.map((p) => p.props.size));
  const size = sizes.size === 1 ? [...sizes][0] : undefined;
  return {
    ...(all('bold') ? { bold: true } : {}),
    ...(all('italic') ? { italic: true } : {}),
    ...(size && size >= 6 && size <= 36 && (bodySize === undefined || Math.abs(size - bodySize) >= 0.5) ? { size } : {}),
  };
}

/** One paragraph's lines as segments with zones. */
function paragraphSegments(read: ParaRead, jc: string | undefined, stops: readonly TabStop[] | undefined, ctx: ChromeContext, bodySize?: number): Segment[] {
  const zones = tabZones(stops, ctx.width);
  const tabbed = read.segments.length > 1;
  return read.segments.map((seg, k) => ({
    text: seg.pieces.map((p) => p.text).join(''),
    zone: seg.zone ?? (k === 0 ? (tabbed ? 'left' : jcZone(jc)) : zones[k - 1] ?? 'right'),
    style: styleOf(seg.pieces, bodySize),
  }));
}

// ---- a header or footer part ----

export interface PartRead {
  rows: ChromeRow[];
  rule?: boolean;
  found: Found[];
  /** Every piece's text, for telling two parts apart. */
  text: string;
}

/** A header or footer part as rows, top to bottom. */
export function readPart(root: XmlElement, ctx: ChromeContext, edge: 'header' | 'footer'): PartRead {
  const found: Found[] = [];
  const rows: ChromeRow[] = [];
  const paragraphs: XmlElement[] = [];
  let framed: Array<{ segments: Segment[] }> = [];
  let ruleTop = false;
  let ruleBottom = false;

  const blocks = (nodes: XmlElement[]) => {
    for (const el of nodes) {
      if (el.name === 'w:p') paragraphs.push(el);
      else if (el.name === 'w:tbl') {
        const text = childrenNamed(el, 'w:tr')
          .map((tr) => childrenNamed(tr, 'w:tc').map((tc) => findAll(tc, 'w:p').map((p) => textOf(p).trim()).filter(Boolean).join(' ')).filter(Boolean).join('\t'))
          .filter(Boolean)
          .join('\n');
        if (text) found.push({ text, reason: 'table' });
        paragraphs.push(el);
      } else if (el.name === 'w:sdt') {
        if (!child(child(el, 'w:sdtPr'), 'w:showingPlcHdr')) blocks(elements(child(el, 'w:sdtContent') ?? el));
      } else if (el.name === 'mc:AlternateContent') blocks(branch(el));
      else if (el.name === 'w:customXml') blocks(elements(el));
    }
  };
  blocks(elements(root));

  let first = true;
  for (const p of paragraphs) {
    if (p.name !== 'w:p') continue;
    const pPr = child(p, 'w:pPr');
    const style = ctx.styles.get(val(child(pPr, 'w:pStyle')) ?? ctx.styles.defaultParagraph);
    const jc = val(child(pPr, 'w:jc')) ?? style?.jc;
    const stops = foldTabs(style?.tabs, tabStopsOf(pPr));
    const reads = readParagraph(p, ctx, found);
    const frame = child(pPr, 'w:framePr');
    for (const read of reads) {
      const segments = paragraphSegments(read, jc, stops, ctx, ctx.styles.defaults.size);
      if (!segments.some((s) => s.text.trim())) continue;
      if (first && bordered(pPr, 'top')) ruleTop = true;
      first = false;
      if (frame) {
        // A framed paragraph (Word's page number box) floats on the next line's row.
        const x = frame.attrs['w:xAlign'];
        const zone: ChromeZone = x === 'center' ? 'center' : x === 'right' || x === 'outside' ? 'right' : x === 'left' || x === 'inside' ? 'left' : jcZone(jc);
        framed.push({ segments: segments.map((s) => ({ ...s, zone })) });
        continue;
      }
      const all = [...framed.flatMap((f) => f.segments), ...segments];
      framed = [];
      addRow(all, rows, found);
    }
    if (bordered(pPr, 'bottom') && rows.length) ruleBottom = true;
  }
  for (const f of framed) addRow(f.segments, rows, found);

  const rule = edge === 'header' ? ruleBottom : ruleTop;
  const text = [...rows.map((r) => JSON.stringify(r)), ...found.map((f) => f.text)].join('\n');
  return { rows, ...(rule ? { rule } : {}), found: dedupe(found), text };
}

function addRow(segments: Segment[], rows: ChromeRow[], found: Found[]): void {
  const got = rowOf(segments);
  if ('tooMany' in got) {
    found.push({ text: got.tooMany, reason: 'tooMany' });
    return;
  }
  if (got.pageCount) found.push({ text: got.pageCount, reason: 'pageCount' });
  rows.push(...got.rows.filter((row) => !rowIsEmpty(row)));
}

const dedupe = (found: Found[]) => found.filter((f, k) => found.findIndex((g) => g.text === f.text && g.reason === f.reason) === k);

// ---- sections ----

interface Section {
  refs: Record<'header' | 'footer', Partial<Record<'default' | 'first' | 'even', string>>>;
  titlePg: boolean;
  /** Characters of text in the section: the largest is the paper's running section. */
  size: number;
  width: number;
}

/** The body's sections in order, each with its header/footer references inherited as Word does. */
export function sectionsOf(body: XmlElement): Section[] {
  const out: Section[] = [];
  let size = 0;
  const take = (sectPr: XmlElement | undefined) => {
    const prev = out[out.length - 1];
    const refs: Section['refs'] = { header: { ...prev?.refs.header }, footer: { ...prev?.refs.footer } };
    for (const kind of ['header', 'footer'] as const) {
      for (const ref of childrenNamed(sectPr, `w:${kind}Reference`)) {
        const type = ref.attrs['w:type'] as 'default' | 'first' | 'even' | undefined;
        const id = ref.attrs['r:id'];
        if (id && (type === 'default' || type === 'first' || type === 'even' || type === undefined)) refs[kind][type ?? 'default'] = id;
      }
    }
    const pgSz = child(sectPr, 'w:pgSz');
    const pgMar = child(sectPr, 'w:pgMar');
    const w = +(pgSz?.attrs['w:w'] ?? NaN) - +(pgMar?.attrs['w:left'] ?? 0) - +(pgMar?.attrs['w:right'] ?? 0);
    out.push({ refs, titlePg: onOff(child(sectPr, 'w:titlePg')) === true, size, width: Number.isFinite(w) && w > 1000 ? w : (prev?.width ?? DEFAULT_WIDTH) });
    size = 0;
  };
  for (const el of elements(body)) {
    if (el.name === 'w:sectPr') continue;
    size += textOf(el).length;
    const inner = el.name === 'w:p' ? child(child(el, 'w:pPr'), 'w:sectPr') : undefined;
    if (inner) take(inner);
  }
  take(child(body, 'w:sectPr'));
  return out;
}

export type PartLoader = (relId: string) => Promise<XmlElement | undefined>;

/**
 * The running header and footer (the largest section's), page 1's own (the first
 * section's `w:titlePg` parts), and what could not be kept: even-page parts, another
 * section's parts (a cover), pictures, tables.
 */
export async function readHeadersFooters(body: XmlElement, styles: Styles, load: PartLoader, evenAndOdd: boolean): Promise<Omit<PageChrome, 'masthead'>> {
  const sections = sectionsOf(body);
  const main = sections.reduce((best, s) => (s.size >= best.size ? s : best), sections[0]);
  const first = sections[0];
  const ctx: ChromeContext = { styles, width: main.width };
  const cache = new Map<string, Promise<PartRead | undefined>>();
  const read = (id: string | undefined, edge: 'header' | 'footer') => {
    if (!id) return Promise.resolve(undefined);
    const key = `${edge}:${id}`;
    if (!cache.has(key)) cache.set(key, load(id).then((root) => (root ? readPart(root, ctx, edge) : undefined)).catch(() => undefined));
    return cache.get(key)!;
  };

  const out: Omit<PageChrome, 'masthead'> = { unsupported: [] };
  for (const edge of ['header', 'footer'] as const) {
    const running = await read(main.refs[edge].default, edge);
    if (running) {
      if (running.rows.length) out[edge] = asChrome(running);
      out.unsupported.push(...running.found.map((f) => ({ ...f, where: edge })));
    }
    const firstKey = edge === 'header' ? 'firstPageHeader' : 'firstPageFooter';
    if (first.titlePg) {
      const page1 = await read(first.refs[edge].first, edge);
      // No first-page part with w:titlePg: page 1 has none.
      out[firstKey] = page1 ? asChrome(page1) : { rows: [] };
      if (page1 && page1.text !== running?.text) out.unsupported.push(...page1.found.map((f) => ({ ...f, where: edge })));
      // The same rows on page 1 as on the rest, or nothing anywhere: no variant.
      if ((page1 && running && page1.text === running.text) || (!out[edge] && !out[firstKey]!.rows.length)) delete out[firstKey];
    } else if (first !== main && first.refs[edge].default !== main.refs[edge].default) {
      // Another section first (a cover page) with its own part: shown, not applied.
      const other = await read(first.refs[edge].default, edge);
      const text = other ? partText(other) : '';
      if (text && other!.text !== running?.text) out.unsupported.push({ where: edge, text, reason: 'otherSection' });
    }
    if (evenAndOdd) {
      const even = await read(main.refs[edge].even, edge);
      const text = even ? partText(even) : '';
      if (text && even!.text !== running?.text) out.unsupported.push({ where: edge, text, reason: 'evenPages' });
    }
  }
  out.unsupported = out.unsupported.filter((f, k, all) => all.findIndex((g) => g.where === f.where && g.text === f.text && g.reason === f.reason) === k);
  return out;
}

const asChrome = (part: PartRead): DetectedChrome => ({ rows: part.rows, ...(part.rule ? { rule: true } : {}) });

const partText = (part: PartRead) =>
  [...part.rows.map((r) => (['left', 'center', 'right'] as const).map((z) => r[z].map((p) => ('text' in p ? p.text : p.kind === 'pageNumber' ? `${p.prefix}#${p.suffix}` : p.prefix)).join(' ')).filter(Boolean).join('\t')), ...part.found.map((f) => f.text)]
    .filter(Boolean)
    .join('\n');

// ---- the masthead in the body ----

const plain = (runs: readonly RawRun[]) => runs.map((r) => r.text).join('');

/** A body line as segments: table cells, or tab stops, or its alignment. */
function lineSegments(line: RawLine, width: number, bodySize: number | undefined): Segment[] {
  const sized = (runs: readonly RawRun[]) =>
    runs.map((r) => ({ text: r.underline && !r.text.trim() && r.text.length > 0 ? '_'.repeat(Math.max(3, r.text.length)) : r.text, props: { bold: r.bold, italic: r.italic, size: line.layout?.size } }));
  if (line.cells) {
    const cells = line.cells.filter((c) => plain(c).trim());
    const zones: ChromeZone[] = cells.length === 1 ? ['left'] : cells.length === 2 ? ['left', 'right'] : ['left', 'center', 'right'];
    return cells.map((c, k) => {
      const pieces = sized(c);
      return { text: pieces.map((p) => p.text).join(''), zone: zones[k] ?? 'right', style: styleOf(pieces, bodySize) };
    });
  }
  const pieces = sized(line.runs);
  const segments: Array<typeof pieces> = [[]];
  for (const p of pieces) {
    const parts = p.text.split('\t');
    parts.forEach((t, k) => {
      if (k > 0) segments.push([]);
      if (t) segments[segments.length - 1].push({ ...p, text: t });
    });
  }
  const zones = tabZones(line.layout?.tabs, width);
  const tabbed = segments.length > 1;
  return segments.map((seg, k) => ({
    text: seg.map((p) => p.text).join(''),
    zone: k === 0 ? (tabbed ? 'left' : jcZone(line.layout?.jc)) : (zones[k - 1] ?? 'right'),
    style: styleOf(seg, bodySize),
  }));
}

/**
 * The masthead: the leading body lines before the first question, section heading or
 * instructions that read as a heading, a blank to fill, or a marks/time line. Taken off
 * the lines (`taken`) so they are never imported as questions or headings. A line of more
 * than three pieces is split into rows of three.
 */
export function docxMasthead(lines: readonly RawLine[], width: number, bodySize: number | undefined): { taken: number; rows: ChromeRow[]; found: ChromeLeftover[] } {
  const verdicts: MastheadVerdict[] = [];
  for (const line of lines) {
    if (line.pageBreak && verdicts.length) break;
    const text = line.listLabel ? `${line.listLabel} ${plain(line.runs)}` : plain(line.runs).replace(/\t/g, '   ');
    const inked = line.runs.filter((r) => r.text.trim());
    verdicts.push(
      mastheadVerdict(text, {
        centred: line.layout?.jc === 'center',
        bold: inked.length > 0 && inked.every((r) => r.bold),
        large: !!(line.layout?.size && bodySize && line.layout.size >= bodySize + 1.5),
        ...(line.cells ? { cells: line.cells.length } : {}),
        ...(line.image ? { image: true } : {}),
      }),
    );
    if (verdicts[verdicts.length - 1] === 'stop') break;
  }
  const taken = mastheadSpan(verdicts);
  const rows: ChromeRow[] = [];
  const found: ChromeLeftover[] = [];
  for (const line of lines.slice(0, taken)) {
    const segments = lineSegments(line, width, bodySize).filter((s) => s.text.trim());
    if (!segments.length) continue;
    const got = rowOf(segments, { split: true });
    if ('tooMany' in got) continue; // never with `split`
    if (got.pageCount) found.push({ where: 'masthead', text: got.pageCount, reason: 'pageCount' });
    rows.push(...got.rows.filter((row) => !rowIsEmpty(row)));
  }
  return { taken, rows, found };
}

export type { ChromeReason };
