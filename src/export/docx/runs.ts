import { hasFraction, textSegments } from '@/model/fraction';
import { runLines } from '@/model/text';
import type { BiText, FontPair, InlineRun, LanguageMode, RichText, TextFormat } from '@/model/types';
import { attrs, escapeXml, sanitizeText } from './xml';

/**
 * Run-level OOXML (§7.4).
 *
 * Every run carries `w:rFonts` with separate Latin and East-Asian faces, so a single
 * mixed run like "GDP平減物價指數(GDP deflator)" renders Latin glyphs in the Latin
 * font and CJK glyphs in the CJK font — Word picks per character (§11.4).
 */

export function rFonts(fonts: FontPair): string {
  return `<w:rFonts${attrs({
    'w:ascii': fonts.latin,
    'w:hAnsi': fonts.latin,
    'w:eastAsia': fonts.eastAsia,
    'w:cs': fonts.latin,
  })}/>`;
}

export interface RunOptions {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  vertAlign?: 'superscript' | 'subscript';
  color?: string;
  styleId?: string;
  /** Point size; Word stores half-points, so this is doubled on the way out. */
  fontSize?: number;
}

export function runProperties(fonts: FontPair, options: RunOptions): string {
  const parts = [rFonts(fonts)];
  if (options.styleId) parts.unshift(`<w:rStyle w:val="${options.styleId}"/>`);
  if (options.bold) parts.push('<w:b/>', '<w:bCs/>');
  if (options.italic) parts.push('<w:i/>', '<w:iCs/>');
  if (options.underline) parts.push('<w:u w:val="single"/>');
  if (options.color) parts.push(`<w:color w:val="${options.color}"/>`);
  if (options.fontSize !== undefined) {
    const halfPoints = Math.round(options.fontSize * 2);
    // `w:szCs` keeps complex-script runs the same size as Latin ones.
    parts.push(`<w:sz w:val="${halfPoints}"/>`, `<w:szCs w:val="${halfPoints}"/>`);
  }
  if (options.vertAlign) parts.push(`<w:vertAlign w:val="${options.vertAlign}"/>`);
  return `<w:rPr>${parts.join('')}</w:rPr>`;
}

/** Translate a model `TextFormat` into the run-level half of its effect. */
export function formatRunOptions(format: TextFormat | undefined): RunOptions {
  if (!format) return {};
  return {
    bold: format.bold,
    italic: format.italic,
    underline: format.underline,
    color: format.color,
    fontSize: format.fontSize,
  };
}

/**
 * One `w:r`. `xml:space="preserve"` keeps leading/trailing spaces intact.
 *
 * A hard line break inside the text (Shift+Enter, stored as `\n` — see `runLines`)
 * becomes a real `<w:br/>` between two `w:t` runs. Left as a literal newline it would
 * reach Word inside `<w:t>` and render as a *space*, which is what made Shift+Enter
 * look like it did nothing once exported.
 */
export function run(text: string, fonts: FontPair, options: RunOptions = {}): string {
  const clean = sanitizeText(text);
  if (!clean) return '';

  const properties = runProperties(fonts, options);
  /*
   * A typed tab is Word's own `<w:tab/>` in a run of its own, carrying the run's
   * properties so an underlined tab rules its gap (a fill-in "Name: ____"). A raw tab
   * inside `w:t` does print in LibreOffice, but the element is the spec's form, and the
   * one every reader is sure to treat as a tab.
   */
  const one = (piece: string) =>
    piece
      .split('\t')
      .map(
        (text, index) =>
          (index > 0 ? `<w:r>${properties}<w:tab/></w:r>` : '') +
          (text ? `<w:r>${properties}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>` : ''),
      )
      .join('');

  const lines = runLines(clean);
  if (lines.length === 1) return one(clean);

  // An empty segment (two breaks in a row) contributes no `w:t` but must still emit
  // its break, so a deliberate blank line survives rather than collapsing.
  return lines
    .map((piece, index) => (index === 0 ? '' : lineBreak()) + (piece ? one(piece) : ''))
    .join('');
}

/**
 * Render a RichText array as runs, merging the model's inline attributes.
 *
 * Each run's own attributes win over the element-level `base`, which is what makes
 * formatting per-text: one paragraph emits several `w:r`, each with its own `w:rPr`, so
 * a 14pt red phrase can sit inside otherwise ordinary body text.
 *
 * Bold/italic/underline **or** with the base rather than overriding it — an element set
 * bold means every run in it is bold, and a run cannot un-bold itself (nothing in the
 * UI offers that, and `false` is not distinguishable from "unset" once stored). Size,
 * colour and fonts **replace** the base, since those are values rather than flags and a
 * run carrying one is precisely a request to differ from its element.
 */
export function richTextRuns(
  text: RichText | undefined,
  fonts: FontPair,
  base: RunOptions = {},
): string {
  if (!text) return '';
  if (!hasFraction(text)) return plainRuns(text, fonts, base);
  // A fraction (k-0479) is Office Math; the stretches around it are the runs as ever.
  return textSegments(text)
    .map((segment) =>
      segment.kind === 'runs' ? plainRuns(segment.runs, fonts, base) : fractionMath(segment.num, segment.den, fonts, base),
    )
    .join('');
}

function runOptionsOf(inline: InlineRun, base: RunOptions): RunOptions {
  return {
    ...base,
    bold: base.bold || inline.bold,
    italic: base.italic || inline.italic,
    underline: base.underline || inline.underline,
    vertAlign: inline.vertAlign ?? base.vertAlign,
    fontSize: inline.fontSize ?? base.fontSize,
    color: inline.color ?? base.color,
  };
}

function plainRuns(text: RichText, fonts: FontPair, base: RunOptions): string {
  return text.map((inline) => run(inline.text, inline.fonts ?? fonts, runOptionsOf(inline, base))).join('');
}

/** One `m:r` in the paper's own font (`m:nor`: not Cambria Math italic). Order: m:rPr, w:rPr, m:t. */
function mathRun(text: string, fonts: FontPair, options: RunOptions): string {
  const clean = sanitizeText(text).replace(/[\t\n]/g, ' ');
  if (!clean) return '';
  const flat = { ...options, vertAlign: undefined };
  return `<m:r><m:rPr><m:nor/></m:rPr>${runProperties(fonts, flat)}<m:t xml:space="preserve">${escapeXml(clean)}</m:t></m:r>`;
}

/** A fraction's part as the content of `m:num` / `m:den`: scripts become `m:sSub` / `m:sSup`. */
function mathPart(runs: RichText, fonts: FontPair, base: RunOptions): string {
  const items: Array<{ kind: 'run'; text: string; fonts: FontPair; options: RunOptions } | { kind: 'xml'; xml: string }> = [];
  for (const inline of runs) {
    const options = runOptionsOf(inline, base);
    const runFonts = inline.fonts ?? fonts;
    if (options.vertAlign === undefined) {
      items.push({ kind: 'run', text: inline.text, fonts: runFonts, options });
      continue;
    }
    // The script's base is the character before it (Q of "ΔQ"), taken from the run before.
    let baseXml = '';
    const previous = items[items.length - 1];
    if (previous?.kind === 'run' && previous.text) {
      const chars = [...previous.text];
      const last = chars.pop()!;
      previous.text = chars.join('');
      baseXml = mathRun(last, previous.fonts, previous.options);
    }
    const tag = options.vertAlign === 'subscript' ? 'sub' : 'sup';
    const kind = tag === 'sub' ? 'sSub' : 'sSup';
    items.push({
      kind: 'xml',
      xml: `<m:${kind}><m:e>${baseXml}</m:e><m:${tag}>${mathRun(inline.text, runFonts, options)}</m:${tag}></m:${kind}>`,
    });
  }
  return items.map((item) => (item.kind === 'xml' ? item.xml : mathRun(item.text, item.fonts, item.options))).join('');
}

function fractionMath(num: RichText, den: RichText, fonts: FontPair, base: RunOptions): string {
  return (
    '<m:oMath><m:f>' +
    `<m:num>${mathPart(num, fonts, base)}</m:num><m:den>${mathPart(den, fonts, base)}</m:den>` +
    '</m:f></m:oMath>'
  );
}

export function lineBreak(): string {
  return '<w:r><w:br/></w:r>';
}

function hasText(text: RichText | undefined): boolean {
  return Boolean(text && text.some((r) => r.text.trim().length > 0));
}

/**
 * Render a bilingual unit for the selected language mode (§5.4).
 *
 * Bilingual mode stacks English above Chinese inside the SAME paragraph, using a
 * soft line break. That matters for lists: a single paragraph consumes exactly one
 * list number, so a bilingual option is "A." once, not "A." then "B." for its own
 * translation.
 */
export function biTextRuns(
  text: BiText | undefined,
  fonts: FontPair,
  language: LanguageMode,
  base: RunOptions = {},
): string {
  if (!text) return '';
  if (language === 'en') return richTextRuns(text.en, fonts, base);
  if (language === 'zh') return richTextRuns(text.zh, fonts, base);

  const en = hasText(text.en) ? richTextRuns(text.en, fonts, base) : '';
  const zh = hasText(text.zh) ? richTextRuns(text.zh, fonts, base) : '';
  if (en && zh) return `${en}${lineBreak()}${zh}`;
  return en || zh;
}

/**
 * "(4 marks)" / "（4分）" per §3.5, matching the active language mode.
 *
 * The space inside the English label is a **no-break space** (U+00A0). The label rides
 * a right tab at the content edge, and when the text line has no room left Word breaks
 * an ordinary space — printing "(2" at the end of the text line and "marks)" alone at
 * the start of the next, the label torn in half. Unbreakable, the whole label wraps to
 * the next line together, where the tab right-aligns it at the content edge — which is
 * where a reader expects the marks when the text has filled its own last line. An NBSP
 * measures exactly as a space, so a label that fits is placed identically.
 */
export function marksText(marks: number): BiText {
  return {
    en: [{ text: `(${marks}\u00a0${marks === 1 ? 'mark' : 'marks'})` }],
    zh: [{ text: `（${marks}分）` }],
  };
}

/**
 * A bilingual paper shows the marks **once**, in English: "(2 marks)", not
 * "(2 marks) （2分）". The number is the same on both sides, so the second label only
 * repeated it on every part (the user, k-0201). English because a bilingual paper leads
 * in English; the preview and the clipboard follow the same rule.
 */
export function marksRuns(marks: number, fonts: FontPair, language: LanguageMode): string {
  const text = marksText(marks);
  return richTextRuns(language === 'zh' ? text.zh : text.en, fonts, {});
}
