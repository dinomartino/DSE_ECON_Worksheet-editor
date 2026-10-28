import { pagePieces } from '@/components/preview/pageNodes';
import type { KeyPageStart } from '@/components/preview/pagination';
import type { RenderNode } from '@/render/ir';
import { renderNodeXml, type BodyContext } from './body';

/**
 * Pages break in the `.docx` where the preview breaks them, as ordinary page breaks.
 *
 * The file carries no `w:keepNext`, `w:keepLines` or `w:pageBreakBefore` at all — Word
 * draws a small black square beside every paragraph that has one, and a paper where every
 * line wears one reads as foreign to a teacher who never typed them (the user's call,
 * 2026-10-19). Instead the preview's paginator, which already decides every sheet, says
 * where each one starts (`PageStart`, measured at export time), and the exporter writes the
 * break a teacher would type: Ctrl+Enter's `<w:br w:type="page"/>`.
 *
 * **The break rides at the end of the last paragraph of the page before**, never in a
 * paragraph of its own and never at the head of the next one. Both of those spend a line:
 * on a sheet the preview filled to the last line, that line does not fit, moves to the
 * next sheet with the break, and leaves a blank page behind it. At the end of a line that
 * already exists, it spends nothing. (Word 2013+ keeps the paragraph mark on the line of
 * the break, so no empty line opens the next page either; LibreOffice turns it into a
 * break before the next paragraph.)
 *
 * **The boundary gap of the item that opens a page is dropped** (`withoutBoundaryGap`):
 * the preview drops it at a sheet top (`.leads-sheet`), and Word, which drops `w:before`
 * at the top of a page it broke itself, keeps it after a hard break.
 *
 * Where no start is given — the node-side test builders, the clipboard — nothing changes
 * but the missing keep flags: Word paginates the file by itself.
 */

/** Ctrl+Enter's page break, as a run of its own. */
export const PAGE_BREAK_RUN = '<w:r><w:br w:type="page"/></w:r>';

/**
 * A page break with no paragraph of the page before to ride on (a table ends it): a
 * paragraph of its own, collapsed to a sliver so it costs the sheet next to nothing.
 */
const COLLAPSED_BREAK = `<w:p><w:pPr><w:spacing w:line="20" w:lineRule="exact"/></w:pPr>${PAGE_BREAK_RUN}</w:p>`;

/** One printed unit of the body: what the preview's sheets break between. */
export interface BodyUnit {
  /** `"<key>:<node>"`, as `pageStartId` spells a `PageStart`. */
  id: string;
  /** The unit's XML; `leadsPage` when a page break opens the page with it. */
  render: (leadsPage: boolean) => string;
  /**
   * Whether the `.docx` may open a page here itself. False inside a table, which Word
   * breaks between its rows by itself (every row `cantSplit`).
   */
  breakable: boolean;
}

export const pageStartId = (key: string, node: number) => `${key}:${node}`;

/**
 * The units in order, each page start's break added to the end of the paragraph that
 * closes the page before it.
 */
export function joinWithPageBreaks(
  units: BodyUnit[],
  starts: ReadonlySet<string>,
  /**
   * Units that open a sheet carrying the watermark (§ `docxWatermarkPlan` `some`), and the
   * edit that anchors the picture in their XML. A unit that writes nothing (a table's later
   * piece, which Word breaks itself) gets none: its sheet goes without in the `.docx`.
   */
  mark?: { at: ReadonlySet<string>; apply: (xml: string) => string },
): string {
  const out: string[] = [];
  for (const unit of units) {
    const leads = unit.breakable && starts.has(unit.id) && addPageBreak(out);
    const xml = unit.render(leads);
    out.push(mark && xml && mark.at.has(unit.id) ? mark.apply(xml) : xml);
  }
  return out.join('');
}

/**
 * End the XML so far with a page break. False when there is nothing before it to end, or
 * it already ends in one (a manual page break), so no blank page is ever made here.
 */
function addPageBreak(out: string[]): boolean {
  let at = out.length - 1;
  while (at >= 0 && out[at] === '') at -= 1;
  if (at < 0) return false;
  const xml = out[at];
  if (xml.endsWith(`${PAGE_BREAK_RUN}</w:p>`)) return false;
  out[at] = xml.endsWith('</w:p>')
    ? `${xml.slice(0, -'</w:p>'.length)}${PAGE_BREAK_RUN}</w:p>`
    : `${xml}${COLLAPSED_BREAK}`;
  return true;
}

/**
 * The node as it prints at the top of a page a break opened: without the air a boundary
 * gap puts above it (`TextNode.boundaryGap`), as the preview's sheet drops it there.
 */
export function withoutBoundaryGap(node: RenderNode): RenderNode {
  if (node.kind === 'text' && node.boundaryGap) {
    return { ...node, boundaryGap: undefined, format: { ...node.format, spaceBefore: undefined } };
  }
  if (node.kind === 'columns' && node.boundaryGap) {
    return { ...node, boundaryGap: undefined, spaceBefore: undefined };
  }
  return node;
}

/**
 * An item's units, one per node the preview's sheets break between (`pageNodes`): each
 * line of a question's answer space is its own (its own paragraph), and a table cut into
 * row pieces is written whole by its first, the rest empty and not breakable.
 */
export function itemUnits(key: string, nodes: RenderNode[], context: BodyContext): BodyUnit[] {
  const units: BodyUnit[] = [];
  let index = 0;
  for (const node of nodes) {
    const { count, breakable } = pagePieces(node);
    for (let piece = 0; piece < count; piece += 1) {
      const shown: RenderNode = count > 1 && breakable && node.kind === 'answerSpace' ? { ...node, lines: 1 } : node;
      units.push({
        id: pageStartId(key, index),
        render: (leadsPage) =>
          piece > 0 && !breakable ? '' : renderNodeXml(leadsPage ? withoutBoundaryGap(shown) : shown, context),
        breakable: piece === 0 || breakable,
      });
      index += 1;
    }
  }
  return units;
}

/**
 * An answer key's body, a page break before each node its sheets start at. A sheet
 * starting inside a table (`row` past the first) is Word's to break, between its rows.
 */
export function keyBodyXml(
  nodes: RenderNode[],
  context: BodyContext,
  starts: KeyPageStart[] = [],
  /** The sheets carrying the watermark, where it is anchored in the body (§ `joinWithPageBreaks`). */
  mark?: { heads: KeyPageStart[]; apply: (xml: string) => string },
): string {
  const ids = new Set(starts.filter((start) => !start.row).map((start) => pageStartId('key', start.node)));
  return joinWithPageBreaks(
    nodes.map((node, index) => ({
      id: pageStartId('key', index),
      render: (leadsPage) => renderNodeXml(leadsPage ? withoutBoundaryGap(node) : node, context),
      breakable: true,
    })),
    ids,
    mark
      ? {
          at: new Set(mark.heads.filter((head) => !head.row).map((head) => pageStartId('key', head.node))),
          apply: mark.apply,
        }
      : undefined,
  );
}
