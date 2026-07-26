import type { FontPair } from '@/model/types';
import type { NodeStyle } from '@/render/ir';
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
}

const BASE_SIZE = 24; // 12pt

const STYLE_SPECS: StyleSpec[] = [
  { id: 'WorksheetTitle', name: 'Worksheet Title', size: 32, bold: true, align: 'center', spaceAfter: 240, keepNext: true, keepLines: true, outlineLevel: 0 },
  { id: 'Instructions', name: 'Instructions', size: 24, italic: true, spaceAfter: 240, keepLines: true },
  { id: 'SectionHeading', name: 'Section Heading', size: 28, bold: true, spaceBefore: 240, spaceAfter: 120, keepNext: true, keepLines: true, outlineLevel: 1 },
  { id: 'QuestionStem', name: 'Question Stem', size: BASE_SIZE, spaceBefore: 120, spaceAfter: 60, keepLines: true },
  { id: 'Statement', name: 'Statement', size: BASE_SIZE, spaceAfter: 40, keepLines: true },
  { id: 'MCQOption', name: 'MCQ Option', size: BASE_SIZE, spaceAfter: 40, keepLines: true },
  { id: 'Subquestion', name: 'Sub-question', size: BASE_SIZE, spaceBefore: 60, spaceAfter: 60, keepLines: true },
  { id: 'Subsubquestion', name: 'Sub-sub-question', size: BASE_SIZE, spaceBefore: 40, spaceAfter: 40, keepLines: true },
  { id: 'Marks', name: 'Marks', size: BASE_SIZE, align: 'right', spaceBefore: 60, spaceAfter: 120, keepLines: true },
  { id: 'TableCaption', name: 'Table Caption', size: 20, italic: true, align: 'center', spaceAfter: 120, keepLines: true },
  { id: 'ImageCaption', name: 'Image Caption', size: 20, italic: true, align: 'center', spaceAfter: 120, keepLines: true },
  // Teacher-version styles are visually distinct (§5.4) but still fully restylable.
  { id: 'Answer', name: 'Answer', size: BASE_SIZE, bold: true, color: 'C00000', spaceBefore: 60, spaceAfter: 60, keepLines: true },
  { id: 'MarkingScheme', name: 'Marking Scheme', size: 22, color: '1F4E79', indentLeft: 360, spaceAfter: 60, keepLines: true },
  { id: 'BodyTextCustom', name: 'Worksheet Body', size: BASE_SIZE, spaceAfter: 60, keepLines: true },
];

function paragraphProperties(spec: StyleSpec): string {
  const parts: string[] = [];
  if (spec.keepNext) parts.push('<w:keepNext/>');
  if (spec.keepLines) parts.push('<w:keepLines/>');
  if (spec.spaceBefore !== undefined || spec.spaceAfter !== undefined) {
    parts.push(
      `<w:spacing${
        spec.spaceBefore !== undefined ? ` w:before="${spec.spaceBefore}"` : ''
      }${spec.spaceAfter !== undefined ? ` w:after="${spec.spaceAfter}"` : ''}/>`,
    );
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

export function buildStylesXml(fonts: FontPair): string {
  const docDefaults =
    '<w:docDefaults>' +
    `<w:rPrDefault><w:rPr>${rFonts(fonts)}` +
    `<w:sz w:val="${BASE_SIZE}"/><w:szCs w:val="${BASE_SIZE}"/>` +
    // Tell Word this document's East-Asian language is Traditional Chinese (HK).
    '<w:lang w:val="en-US" w:eastAsia="zh-HK"/>' +
    '</w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
    '</w:docDefaults>';

  const normal =
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
    '<w:name w:val="Normal"/><w:qFormat/>' +
    `<w:rPr>${rFonts(fonts)}<w:sz w:val="${BASE_SIZE}"/><w:szCs w:val="${BASE_SIZE}"/></w:rPr>` +
    '</w:style>';

  const tableNormal =
    '<w:style w:type="table" w:default="1" w:styleId="TableNormal">' +
    '<w:name w:val="Normal Table"/>' +
    '<w:tblPr><w:tblCellMar>' +
    '<w:top w:w="60" w:type="dxa"/><w:left w:w="108" w:type="dxa"/>' +
    '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="108" w:type="dxa"/>' +
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
    STYLE_SPECS.map((spec) => styleXml(spec, fonts)).join('') +
    '</w:styles>'
  );
}
