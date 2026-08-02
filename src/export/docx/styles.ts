import type { FontPair } from '@/model/types';
import type { NodeStyle } from '@/render/ir';
import { DEFAULT_CELL_PADDING } from '@/model/table';
import { rFonts } from './runs';
import { XML_DECL } from './xml';

/**
 * styles.xml (§7.3). Every paragraph the exporter emits is attached to one of these
 * named styles, and direct formatting is kept minimal, so a teacher can restyle a
 * whole paper from Word's style gallery (§11.3).
 */

/** Style id (no spaces, per OOXML convention) for each IR style name. */
export const STYLE_IDS: Record<NodeStyle, string> = {
  'Question Stem': 'QuestionStem',
  'MCQ Option': 'MCQOption',
  Statement: 'Statement',
  'Sub-question': 'Subquestion',
  'Sub-sub-question': 'Subsubquestion',
  Marks: 'Marks',
  'Table Caption': 'TableCaption',
  'Image Caption': 'ImageCaption',
  'Section Heading': 'SectionHeading',
  Answer: 'Answer',
  'Marking Scheme': 'MarkingScheme',
  'Worksheet Title': 'WorksheetTitle',
  Instructions: 'Instructions',
  Body: 'BodyTextCustom',
};

interface StyleSpec {
  id: string;
  name: string;
  /** Half-points, i.e. 24 = 12pt. */
  size?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  /** Twips. */
  indentLeft?: number;
  hanging?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  align?: 'left' | 'center' | 'right';
  keepNext?: boolean;
  keepLines?: boolean;
  outlineLevel?: number;
  /** Exact line height in twips, for a paragraph whose height is the point of it. */
  exactLine?: number;
  /**
   * Bottom and between borders, as an answer line needs. `between` is what Word draws
   * at the interior boundaries of a run of consecutive paragraphs sharing one border
   * set — without it that run collapses to a single rule under the last paragraph.
   */
  border?: { color: string; size: number };
  /** Run underline, as the QAB's dotted answer line needs (`w:u`). */
  underline?: 'dotted';
}

/**
 * The default body size in points, and its half-point spelling.
 *
 * 11pt is the classroom reference's size — every run in that paper is `w:sz="22"`. A
 * document may carry its own `baseFontSize` (the QAB booklet is 10pt, as both the 2019
 * paper and the manually refined export set it), which scales docDefaults, `Normal` and
 * every body-sized style below while the fixed 12pt line stays put — 10pt text on the
 * 240-twip rhythm is exactly how the reference booklet is set.
 */
export const DEFAULT_BASE_FONT_SIZE_PT = 11;

/**
 * The one line height the whole document uses: 12pt, fixed (`w:lineRule="exact"`).
 *
 * The reference paper carries `w:line="240" w:lineRule="exact"` on 275 of its 296
 * paragraphs, over a "No Spacing" style with `w:after="0"`. Its entire vertical rhythm
 * comes from that fixed line box, not from paragraph spacing — which is why 11pt text
 * set in a 12pt box reads tight but even, and why a page holds what it does.
 *
 * `exact` rather than `atLeast` is the load-bearing half: `atLeast` lets Word grow the
 * box for a tall CJK glyph, a superscript or an inline image, and a bilingual paper is
 * full of all three — the rhythm would then vary line by line and the preview, which
 * pins the height, would disagree with the print.
 */
export const FIXED_LINE_TWIPS = 240; // 12pt

/** The body size the fixed 12pt line is calibrated for, in points. */
const FIXED_LINE_BASE_PT = 11;

/**
 * The exact line height a paragraph set at `fontSizePt` needs.
 *
 * An exact line box does not grow, so text larger than the box is clipped rather than
 * pushed apart — the one hazard `w:lineRule="exact"` carries. Anything at or below the
 * 11pt body size keeps the shared 12pt rhythm; larger text gets a box scaled by the
 * same ratio, which is how the title and section-heading styles get theirs. Rounding to
 * a whole twip keeps the value one Word will echo back unchanged.
 */
export function exactLineFor(fontSizePt: number | undefined): number {
  if (fontSizePt === undefined || fontSizePt <= FIXED_LINE_BASE_PT) return FIXED_LINE_TWIPS;
  return Math.round((FIXED_LINE_TWIPS * fontSizePt) / FIXED_LINE_BASE_PT);
}

/**
 * One answer line's writing height, in twips (24pt) — roughly double-spaced for a
 * 12pt hand, which is what a ruled line on an exam paper has to accommodate.
 */
export const ANSWER_LINE_HEIGHT_TWIPS = 480;

/**
 * Style id for a ruled answer line. Not a `NodeStyle`: the IR's style vocabulary is
 * shared by all three backends, and an answer line's rule is a Word paragraph-border
 * concern that the preview and clipboard each draw their own way. The `answerLines`
 * node carries no `style` field at all, so this stays .docx-local.
 */
export const ANSWER_LINE_STYLE_ID = 'AnswerLine';

/**
 * One QAB dotted answer line's pitch, in twips.
 *
 * **Measured, not chosen**: the reference booklet's dotted lines land 46px apart in a
 * 150dpi raster — 22.08pt ≈ 442 twips. The reference reaches that pitch as
 * `w:before="240"` plus an auto line at its default 10pt Times face; this app instead
 * spells the same height as a single exact line box, which keeps the fixed-line
 * invariant unbroken (§ one fixed line, no paragraph spacing) and makes the pitch
 * identical in Word, LibreOffice, the preview and the paginator — an auto line is
 * whatever the renderer's font metrics say it is, which is exactly the disagreement the
 * fixed-line model exists to prevent.
 */
export const LQ_LINE_PITCH_TWIPS = 442;

/**
 * Space above each dotted answer line, in twips (1.5pt).
 *
 * The dotted rule is drawn by the *underline* of a tab run, so it sits on the run's
 * baseline rather than at the bottom of the line box. Without a gap the descenders of
 * whatever was written on the line above land on the dots. This lifts each line off the
 * one before it, which is the adjustment made by hand in
 * `real_life_reference/Worksheet (Student) (EN) (2).docx` — `w:before="30"` on every
 * answer-space paragraph.
 *
 * It is the one place the fixed-line model (§ one fixed line, no paragraph spacing)
 * takes paragraph spacing, and deliberately so: an answer line is a *ruled box to write
 * in*, not a line of text, so its height is the point of it rather than an accident of
 * the rhythm. Spelled on the style so the paragraphs stay free of direct formatting —
 * Word flags a directly formatted paragraph in the margin, and a page of forty would
 * read as editing chrome rather than as a page to write on.
 */
export const LQ_LINE_SPACE_BEFORE_TWIPS = 30;

/**
 * The full vertical advance of one dotted answer line: its line box plus the gap above
 * it. What the preview and the paginator must both step by, since Word advances the
 * page by the sum and a preview stepping by the box alone would drift a line every
 * fifteen (§ the preview paginates on geometry Word reproduces).
 */
export const LQ_LINE_ADVANCE_TWIPS = LQ_LINE_PITCH_TWIPS + LQ_LINE_SPACE_BEFORE_TWIPS;

/**
 * Style id for a QAB dotted answer line. Like `AnswerLine`, .docx-local and not a
 * `NodeStyle`. Emitted into styles.xml **only when the document contains an answer
 * space** — a style every document carries would change every existing export's
 * styles.xml, and an untouched document must export byte-identically.
 */
export const LQ_ANSWER_LINE_STYLE_ID = 'LqAnswerLine';

const lqAnswerLineSpec = (baseSize: number): StyleSpec => ({
  id: LQ_ANSWER_LINE_STYLE_ID,
  name: 'Answer Space Line',
  size: baseSize,
  spaceBefore: LQ_LINE_SPACE_BEFORE_TWIPS,
  spaceAfter: 0,
  exactLine: LQ_LINE_PITCH_TWIPS,
  underline: 'dotted',
});

/*
 * Every style below sets `spaceBefore: 0, spaceAfter: 0` and inherits the fixed 12pt
 * line from `Normal`. That is the reference paper's model exactly: one uniform line box
 * and no paragraph spacing anywhere, so text lands on a consistent 12pt rhythm down the
 * page regardless of which style a paragraph wears.
 *
 * Separation between blocks therefore has to come from something that occupies a whole
 * line — a spacer element — rather than from a style's own padding. That is a real
 * trade-off and it is the reference's: a heading no longer carries air above it by
 * virtue of being a heading. It buys a page whose lines align with every other line,
 * which is what a paper printed to be written on needs.
 *
 * Sizes stay per-style; only the vertical metrics are unified. A 16pt title in a 12pt
 * fixed box would clip, so the styles that set a larger `size` also set a matching
 * `exactLine` — see `titleLine` below.
 */
const styleSpecs = (baseSize: number): StyleSpec[] => [
  { id: 'WorksheetTitle', name: 'Worksheet Title', size: 32, bold: true, align: 'center', spaceBefore: 0, spaceAfter: 0, exactLine: exactLineFor(16), keepNext: true, keepLines: true, outlineLevel: 0 },
  { id: 'Instructions', name: 'Instructions', size: baseSize, italic: true, spaceBefore: 0, spaceAfter: 0, keepLines: true },
  { id: 'SectionHeading', name: 'Section Heading', size: 28, bold: true, spaceBefore: 0, spaceAfter: 0, exactLine: exactLineFor(14), keepNext: true, keepLines: true, outlineLevel: 1 },
  { id: 'QuestionStem', name: 'Question Stem', size: baseSize, spaceBefore: 0, spaceAfter: 0, keepLines: true },
  { id: 'Statement', name: 'Statement', size: baseSize, spaceBefore: 0, spaceAfter: 0, keepLines: true },
  { id: 'MCQOption', name: 'MCQ Option', size: baseSize, spaceBefore: 0, spaceAfter: 0, keepLines: true },
  { id: 'Subquestion', name: 'Sub-question', size: baseSize, spaceBefore: 0, spaceAfter: 0, keepLines: true },
  { id: 'Subsubquestion', name: 'Sub-sub-question', size: baseSize, spaceBefore: 0, spaceAfter: 0, keepLines: true },
  { id: 'Marks', name: 'Marks', size: baseSize, align: 'right', spaceBefore: 0, spaceAfter: 0, keepLines: true },
  { id: 'TableCaption', name: 'Table Caption', size: 20, italic: true, align: 'center', spaceBefore: 0, spaceAfter: 0, keepLines: true },
  { id: 'ImageCaption', name: 'Image Caption', size: 20, italic: true, align: 'center', spaceBefore: 0, spaceAfter: 0, keepLines: true },
  // Teacher-version styles are visually distinct (§5.4) but still fully restylable.
  { id: 'Answer', name: 'Answer', size: baseSize, bold: true, color: 'C00000', spaceBefore: 0, spaceAfter: 0, keepLines: true },
  { id: 'MarkingScheme', name: 'Marking Scheme', size: baseSize, color: '1F4E79', indentLeft: 360, spaceBefore: 0, spaceAfter: 0, keepLines: true },
  { id: 'BodyTextCustom', name: 'Worksheet Body', size: baseSize, spaceBefore: 0, spaceAfter: 0, keepLines: true },
  // A ruled writing line. The border and the 24pt height live here rather than as
  // direct formatting on each paragraph: Word flags a directly-formatted paragraph
  // with a marker in the left margin, and forty of them made the block look like
  // editing chrome rather than a page to write on. As a style it is also restylable
  // from Word's gallery — one edit changes the rule colour on every line (§11.3).
  {
    id: 'AnswerLine',
    name: 'Answer Line',
    size: baseSize,
    spaceBefore: 0,
    spaceAfter: 0,
    exactLine: ANSWER_LINE_HEIGHT_TWIPS,
    border: { color: 'A6A6A6', size: 6 },
  },
];

function paragraphProperties(spec: StyleSpec): string {
  const parts: string[] = [];
  if (spec.keepNext) parts.push('<w:keepNext/>');
  if (spec.keepLines) parts.push('<w:keepLines/>');
  // Every paragraph style states its own line metrics rather than inheriting them from
  // `Normal`. Word merges `w:spacing` as one element, not attribute by attribute, so a
  // style that set only `w:before`/`w:after` would be relying on inheritance filling in
  // `w:line` — which is exactly the kind of thing that differs between Word versions and
  // between Word and the converters that open these files. Stating it costs nothing and
  // makes the fixed 12pt rhythm a property of each style rather than of the chain.
  const line = spec.exactLine ?? FIXED_LINE_TWIPS;
  parts.push(
    `<w:spacing w:before="${spec.spaceBefore ?? 0}" w:after="${spec.spaceAfter ?? 0}"` +
      ` w:line="${line}" w:lineRule="exact"/>`,
  );
  if (spec.border) {
    const edge = `w:val="single" w:sz="${spec.border.size}" w:space="1" w:color="${spec.border.color}"`;
    parts.push(`<w:pBdr><w:between ${edge}/><w:bottom ${edge}/></w:pBdr>`);
  }
  if (spec.indentLeft !== undefined || spec.hanging !== undefined) {
    parts.push(
      `<w:ind${spec.indentLeft !== undefined ? ` w:left="${spec.indentLeft}"` : ''}${
        spec.hanging !== undefined ? ` w:hanging="${spec.hanging}"` : ''
      }/>`,
    );
  }
  if (spec.align) parts.push(`<w:jc w:val="${spec.align}"/>`);
  if (spec.outlineLevel !== undefined) {
    parts.push(`<w:outlineLvl w:val="${spec.outlineLevel}"/>`);
  }
  return parts.length ? `<w:pPr>${parts.join('')}</w:pPr>` : '';
}

function runProperties(spec: StyleSpec, fonts: FontPair): string {
  const parts = [rFonts(fonts)];
  if (spec.bold) parts.push('<w:b/>', '<w:bCs/>');
  if (spec.italic) parts.push('<w:i/>', '<w:iCs/>');
  if (spec.color) parts.push(`<w:color w:val="${spec.color}"/>`);
  if (spec.underline) parts.push(`<w:u w:val="${spec.underline}"/>`);
  if (spec.size) parts.push(`<w:sz w:val="${spec.size}"/>`, `<w:szCs w:val="${spec.size}"/>`);
  return `<w:rPr>${parts.join('')}</w:rPr>`;
}

function styleXml(spec: StyleSpec, fonts: FontPair): string {
  return (
    `<w:style w:type="paragraph" w:styleId="${spec.id}">` +
    `<w:name w:val="${spec.name}"/>` +
    `<w:basedOn w:val="Normal"/>` +
    `<w:qFormat/>` +
    paragraphProperties(spec) +
    runProperties(spec, fonts) +
    `</w:style>`
  );
}

export function buildStylesXml(
  fonts: FontPair,
  options: { answerSpace?: boolean; baseFontSize?: number } = {},
): string {
  /*
   * The document's own body size, in half-points. Absent stays 11pt, so every
   * document saved before the field existed — and every non-QAB document — exports
   * byte-identical styles. The line boxes deliberately do not shrink with it:
   * `exactLineFor` keeps everything at or under 11pt on the shared 240-twip line,
   * which is exactly how the manually refined booklet is set (10pt runs, 240 line).
   */
  const baseSize = Math.round((options.baseFontSize ?? DEFAULT_BASE_FONT_SIZE_PT) * 2);
  const docDefaults =
    '<w:docDefaults>' +
    `<w:rPrDefault><w:rPr>${rFonts(fonts)}` +
    `<w:sz w:val="${baseSize}"/><w:szCs w:val="${baseSize}"/>` +
    // Tell Word this document's East-Asian language is Traditional Chinese (HK).
    '<w:lang w:val="en-US" w:eastAsia="zh-HK"/>' +
    '</w:rPr></w:rPrDefault>' +
    // The fixed 12pt line starts here, so anything the exporter does not style
    // explicitly — a bare paragraph, a table cell — still lands on the same rhythm.
    `<w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="${FIXED_LINE_TWIPS}" w:lineRule="exact"/></w:pPr></w:pPrDefault>` +
    '</w:docDefaults>';

  // `Normal` restates the spacing rather than leaning on docDefaults alone: Word's own
  // built-in Normal carries spacing of its own, and a document opened in a template
  // whose Normal differs would otherwise inherit that instead of this paper's rhythm.
  const normal =
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
    '<w:name w:val="Normal"/><w:qFormat/>' +
    `<w:pPr><w:spacing w:before="0" w:after="0" w:line="${FIXED_LINE_TWIPS}" w:lineRule="exact"/></w:pPr>` +
    `<w:rPr>${rFonts(fonts)}<w:sz w:val="${baseSize}"/><w:szCs w:val="${baseSize}"/></w:rPr>` +
    '</w:style>';

  /*
   * The table default, spelled from `DEFAULT_CELL_PADDING` rather than a second time.
   *
   * Every `w:tc` now carries its own resolved `w:tcMar`, so this is only what Word falls
   * back to — but it is what a teacher sees in Word's own Table Properties dialog, and
   * two hardcoded copies of the same four numbers would eventually disagree about what
   * "untouched" means.
   */
  const tableNormal =
    '<w:style w:type="table" w:default="1" w:styleId="TableNormal">' +
    '<w:name w:val="Normal Table"/>' +
    '<w:tblPr><w:tblCellMar>' +
    `<w:top w:w="${DEFAULT_CELL_PADDING.top}" w:type="dxa"/>` +
    `<w:left w:w="${DEFAULT_CELL_PADDING.left}" w:type="dxa"/>` +
    `<w:bottom w:w="${DEFAULT_CELL_PADDING.bottom}" w:type="dxa"/>` +
    `<w:right w:w="${DEFAULT_CELL_PADDING.right}" w:type="dxa"/>` +
    '</w:tblCellMar></w:tblPr></w:style>';

  const defaultParagraphFont =
    '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont">' +
    '<w:name w:val="Default Paragraph Font"/></w:style>';

  return (
    XML_DECL +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    docDefaults +
    normal +
    defaultParagraphFont +
    tableNormal +
    styleSpecs(baseSize).map((spec) => styleXml(spec, fonts)).join('') +
    // Conditional, so a document without an answer space keeps its styles.xml
    // byte-identical to every build before the style existed.
    (options.answerSpace ? styleXml(lqAnswerLineSpec(baseSize), fonts) : '') +
    '</w:styles>'
  );
}
