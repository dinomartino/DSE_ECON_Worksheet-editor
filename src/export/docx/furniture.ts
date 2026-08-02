import type { FontPair, LanguageMode, PageFurniture, PageMargins } from '@/model/types';
import { furnitureBoxes, FURNITURE_GEOMETRY } from '@/model/pageFurniture';
import { isBiTextEmpty } from '@/model/text';
import { biTextRuns } from './runs';

/**
 * The QAB's per-page furniture, as anchored shapes in the running header
 * (§ `model/pageFurniture.ts`).
 *
 * The header is the reference's own mechanism for putting a frame and rotated margin
 * notes on every sheet — a header repeats per page, and an anchored `wrapNone` shape
 * inside it can reach anywhere on that page while reserving no space in the text
 * column. One running header serves every body page; the cover's section carries no
 * header reference, so the cover stays frame-free as the reference's does.
 *
 * Everything is positioned `relativeFrom="page"`, not from the header paragraph: the
 * paragraph's own position moves with `w:header` and the band rows above it, and the
 * frame must sit at the same place on the sheet regardless of what else the header
 * holds. Like the cover's rules, a shape carries no relationship — wrong geometry
 * prints wrong rather than making Word report the file as needing repair.
 */

const EMU_PER_TWIP = 635;
const emu = (twips: number) => Math.round(twips * EMU_PER_TWIP);

/** Drawing ids well clear of the body's counter, which starts at 1. */
const FURNITURE_DRAWING_ID_BASE = 9001;

function frameXml(box: { left: number; top: number; width: number; height: number }): string {
  return (
    '<w:r><w:drawing>' +
    '<wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" ' +
    'relativeHeight="251650048" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1">' +
    '<wp:simplePos x="0" y="0"/>' +
    `<wp:positionH relativeFrom="page"><wp:posOffset>${emu(box.left)}</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="page"><wp:posOffset>${emu(box.top)}</wp:posOffset></wp:positionV>` +
    `<wp:extent cx="${emu(box.width)}" cy="${emu(box.height)}"/>` +
    '<wp:effectExtent l="9525" t="9525" r="9525" b="9525"/><wp:wrapNone/>' +
    `<wp:docPr id="${FURNITURE_DRAWING_ID_BASE}" name="Page frame"/>` +
    '<wp:cNvGraphicFramePr/>' +
    '<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">' +
    '<wps:wsp><wps:cNvSpPr/><wps:spPr bwMode="auto">' +
    `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(box.width)}" cy="${emu(box.height)}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>' +
    // The reference's own stroke: `a:ln w="9525"` — 0.75pt, black.
    `<a:ln w="${FURNITURE_GEOMETRY.frameStrokeEmu}"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:miter lim="800000"/></a:ln>` +
    '</wps:spPr><wps:bodyPr/></wps:wsp>' +
    '</a:graphicData></a:graphic></wp:anchor>' +
    '</w:drawing></w:r>'
  );
}

function noteXml(
  box: { left: number; top: number; width: number; height: number },
  runs: string,
  id: number,
  name: string,
): string {
  return (
    '<w:r><w:drawing>' +
    '<wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" ' +
    'relativeHeight="251651072" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">' +
    '<wp:simplePos x="0" y="0"/>' +
    `<wp:positionH relativeFrom="page"><wp:posOffset>${emu(box.left)}</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="page"><wp:posOffset>${emu(box.top)}</wp:posOffset></wp:positionV>` +
    `<wp:extent cx="${emu(box.width)}" cy="${emu(box.height)}"/>` +
    '<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>' +
    `<wp:docPr id="${id}" name="${name}"/>` +
    '<wp:cNvGraphicFramePr/>' +
    '<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">' +
    `<wps:wsp><wps:cNvPr id="${id}" name="${name}"/><wps:cNvSpPr txBox="1"/>` +
    '<wps:spPr bwMode="auto">' +
    `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(box.width)}" cy="${emu(box.height)}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
    // Invisible box: the note is the words, not a frame around them.
    '<a:noFill/><a:ln><a:noFill/></a:ln></wps:spPr>' +
    `<wps:txbx><w:txbxContent><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${runs}</w:p></w:txbxContent></wps:txbx>` +
    // `vert270` reads bottom-to-top, the reference's own direction on both margins.
    '<wps:bodyPr rot="0" vert="vert270" wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" ' +
    'anchor="t" anchorCtr="0" upright="1"><a:noAutofit/></wps:bodyPr></wps:wsp>' +
    '</a:graphicData></a:graphic></wp:anchor>' +
    '</w:drawing></w:r>'
  );
}

/**
 * The furniture as one header paragraph, or an empty string when nothing would print.
 *
 * A single collapsed paragraph (`w:line="20"`) carries every anchor: anchors reserve no
 * space, but the paragraph holding them is real, and at the default line height it
 * would push every band row below it down a line.
 */
export function furnitureHeaderXml(
  furniture: PageFurniture | undefined,
  pageWidth: number,
  pageHeight: number,
  margins: PageMargins,
  fonts: FontPair,
  language: LanguageMode,
): string {
  if (!furniture) return '';
  const boxes = furnitureBoxes(pageWidth, pageHeight, margins);
  const parts: string[] = [];

  if (furniture.frame) parts.push(frameXml(boxes.frame));

  if (furniture.marginNote && !isBiTextEmpty(furniture.marginNote)) {
    // 9pt, the size a strip this narrow can hold; per-run formatting can override.
    const runs = biTextRuns(furniture.marginNote, fonts, language, { fontSize: 9 });
    parts.push(noteXml(boxes.noteLeft, runs, FURNITURE_DRAWING_ID_BASE + 1, 'Margin note left'));
    parts.push(noteXml(boxes.noteRight, runs, FURNITURE_DRAWING_ID_BASE + 2, 'Margin note right'));
  }

  if (parts.length === 0) return '';
  return (
    '<w:p><w:pPr><w:spacing w:line="20" w:lineRule="exact"/></w:pPr>' +
    parts.join('') +
    '</w:p>'
  );
}
