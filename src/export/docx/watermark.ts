import type { PageSetup, Watermark } from '@/model/types';
import { watermarkBox, watermarkOpacity } from '@/model/watermark';

/**
 * The watermark in the `.docx` (k-0242): the paper's picture as a floating image **behind
 * the text** (`behindDoc="1"`), placed against the page at `watermarkBox`, the box the
 * preview draws it in. Its faintness is drawn into the picture by the browser export
 * (`bakeWatermarkImage`), because LibreOffice ignores Word's picture transparency; without
 * that pre-pass (node tests) it falls back to `a:alphaModFix`, which Word honours.
 *
 * Where the anchor sits decides which pages show it (§ `docxWatermarkPlan`): in the running
 * header for a paper where every page has it, or in the first paragraph of each sheet that
 * has it when the pages differ (`withLeadingRun`). The cover is its own section with no
 * header, so its picture always rides in its first paragraph.
 */

const EMU_PER_TWIP = 635;

/** The anchored picture, as a run. `drawingId` must be unique in its part. */
export function watermarkRunXml(
  relId: string,
  mark: Watermark,
  setup: PageSetup,
  drawingId: number,
  /** The picture already carries its strength (`bakeWatermarkImage`): no transparency on top. */
  baked = false,
): string {
  const box = watermarkBox(mark, setup);
  const cx = box.width * EMU_PER_TWIP;
  const cy = box.height * EMU_PER_TWIP;
  const alpha = baked ? 100000 : Math.round(watermarkOpacity(mark) * 100000);
  const name = `Watermark ${drawingId}`;
  return (
    '<w:r><w:drawing>' +
    // `layoutInCell="0"`: a sheet whose first paragraph sits in a table cell still places
    // the picture against the page, not the cell. The lowest `relativeHeight` keeps it
    // under every other floating shape.
    '<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" ' +
    'relativeHeight="0" behindDoc="1" locked="0" layoutInCell="0" allowOverlap="1">' +
    '<wp:simplePos x="0" y="0"/>' +
    `<wp:positionH relativeFrom="page"><wp:posOffset>${box.left * EMU_PER_TWIP}</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="page"><wp:posOffset>${box.top * EMU_PER_TWIP}</wp:posOffset></wp:positionV>` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    '<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>' +
    `<wp:docPr id="${drawingId}" name="${name}"/>` +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<pic:nvPicPr><pic:cNvPr id="${drawingId}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${relId}">${alpha < 100000 ? `<a:alphaModFix amt="${alpha}"/>` : ''}</a:blip>` +
    '<a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
    '<pic:spPr>' +
    `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
    '</pic:spPr></pic:pic></a:graphicData></a:graphic>' +
    '</wp:anchor></w:drawing></w:r>'
  );
}

/**
 * The picture in a paragraph of its own, collapsed to a sliver, for the running header:
 * appended after the band rows, as the page furniture is, so it displaces nothing.
 */
export function watermarkHeaderXml(runXml: string): string {
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr>${runXml}</w:p>`;
}

/** The first `w:p` start tag: `<w:p>`, `<w:p …>` or `<w:p/>`, never `<w:pPr>` or `<w:pBdr>`. */
const PARAGRAPH_START = /<w:p(?=[\s>/])[^>]*>/;

/**
 * `xml` with `runXml` as the first run of its first paragraph (after its properties), or
 * `undefined` when it has no paragraph. Spends no line: the run is a floating picture.
 */
export function withLeadingRun(xml: string, runXml: string): string | undefined {
  const match = PARAGRAPH_START.exec(xml);
  if (!match) return undefined;
  const start = match.index;
  const tag = match[0];
  if (tag.endsWith('/>')) {
    return `${xml.slice(0, start)}${tag.slice(0, -2)}>${runXml}</w:p>${xml.slice(start + tag.length)}`;
  }
  let at = start + tag.length;
  const props = /^<w:pPr(?=[\s>/])[^>]*>/.exec(xml.slice(at));
  if (props) {
    at += props[0].length;
    if (!props[0].endsWith('/>')) {
      const end = xml.indexOf('</w:pPr>', at);
      if (end >= 0) at = end + '</w:pPr>'.length;
    }
  }
  return xml.slice(0, at) + runXml + xml.slice(at);
}
