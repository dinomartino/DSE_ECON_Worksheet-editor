import { diagramSvg } from '@/render/diagram';
import type { RenderNode } from '@/render/ir';
import type { LanguageMode, OutputMode, Worksheet } from '@/model/types';
import { renderWorksheet } from '@/render/worksheet';

/**
 * Turning diagram geometry into the single image that lands in Word.
 *
 * Word gets a raster, not the SVG. Word's own SVG support varies by version and by
 * platform, and a pasted SVG has repeatedly been the thing that renders as a red X on
 * someone else's machine; a PNG is the one image format every Word build places, prints
 * and emails identically. The geometry stays in the document either way, so the diagram
 * is still editable in the app — only the *exported* copy is flattened.
 *
 * Rasterization needs a canvas, so this is the one part of the export path that is
 * genuinely browser-only and asynchronous. It is deliberately factored out as a
 * pre-pass that produces a plain `Map`, which lets `buildParts` and
 * `worksheetClipboardHtml` stay synchronous and unit-testable exactly as before.
 */

/**
 * Oversampling factor for the exported PNG.
 *
 * The diagram prints at its `widthPx` at 96dpi, so rendering at 3× gives ~288dpi —
 * enough that the curve strokes and subscripts stay sharp on a printed worksheet
 * without making the .docx large (a typical diagram is a few tens of KB).
 */
const EXPORT_SCALE = 3;

/** Diagram images keyed by the block id that produced them. */
export type DiagramImageMap = Map<string, string>;

/** Walk every rendered node, including those inside the layout flow. */
function* allNodes(worksheet: Worksheet, mode: OutputMode): Generator<RenderNode> {
  const rendered = renderWorksheet(worksheet, mode);
  for (const band of rendered.bands) yield band;
  if (rendered.title) yield rendered.title;
  if (rendered.instructions) yield rendered.instructions;
  for (const item of rendered.items) {
    const nodes = item.type === 'question' ? item.question.nodes : item.layout.nodes;
    for (const node of nodes) {
      yield node;
      // A figure row's children are ordinary nodes one level down — the diagram
      // beside a glossary table must rasterize like any other.
      if (node.kind === 'figureRow') {
        yield node.figure;
        yield node.table;
      }
    }
  }
}

/** Every distinct diagram in the worksheet, in document order. */
export function collectDiagramNodes(
  worksheet: Worksheet,
  mode: OutputMode,
): Array<Extract<RenderNode, { kind: 'diagram' }>> {
  const found: Array<Extract<RenderNode, { kind: 'diagram' }>> = [];
  const seen = new Set<string>();
  for (const node of allNodes(worksheet, mode)) {
    if (node.kind !== 'diagram' || seen.has(node.blockId)) continue;
    seen.add(node.blockId);
    found.push(node);
  }
  return found;
}

/**
 * Rasterize one SVG string to a PNG data URL.
 *
 * The SVG goes in as a data URL so the `<img>` load is same-origin and the canvas stays
 * untainted — `toDataURL` throws on a tainted canvas, which is exactly what would happen
 * if the SVG pulled in anything external. That is why `diagramSvg` embeds no external
 * references.
 */
async function rasterize(svg: string, width: number, height: number): Promise<string> {
  const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Could not render the diagram.'));
    element.src = encoded;
  });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable in this browser.');

  // Opaque white ground: a transparent PNG would pick up whatever is behind it once
  // it is placed in a Word document.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL('image/png');
}

/**
 * Render every diagram in the worksheet to a PNG data URL, once each.
 *
 * Deduplicated by block id, so a diagram that appears in both the student and teacher
 * pass of an export is rasterized a single time.
 */
export async function renderDiagramImages(
  worksheet: Worksheet,
  mode: OutputMode,
  language: LanguageMode = mode.language,
): Promise<DiagramImageMap> {
  const images: DiagramImageMap = new Map();
  if (typeof document === 'undefined') return images;

  /*
   * Rasterized together rather than one after another.
   *
   * Almost all of `rasterize`'s wall time is spent *waiting*: an `<img>` decoding an SVG
   * data URL is the browser's own asynchronous work, not ours, and it happens off the
   * main thread. Awaiting inside the loop serialized those waits, so a worksheet with
   * twelve diagrams paid twelve decodes end to end while the export button sat spinning.
   * Issuing them together lets the browser overlap the decodes and only the `drawImage`
   * / `toDataURL` calls queue on the main thread.
   *
   * The fan-out is bounded by the number of distinct diagrams in one worksheet — tens at
   * the very most, since each is a hand-drawn figure — so this needs no concurrency
   * limit. `collectDiagramNodes` has already deduplicated by block id, so nothing is
   * rasterized twice.
   *
   * The results are written into the map after the fact, in `collectDiagramNodes` order,
   * so the map's iteration order is document order exactly as it was before.
   */
  const nodes = collectDiagramNodes(worksheet, mode);
  const rasterized = await Promise.all(
    nodes.map((node) => {
      const svg = diagramSvg(node.diagram, {
        widthPx: node.widthPx,
        heightPx: node.heightPx,
        language,
        fonts: worksheet.fonts,
        scale: EXPORT_SCALE,
      });
      return rasterize(svg, node.widthPx * EXPORT_SCALE, node.heightPx * EXPORT_SCALE);
    }),
  );

  nodes.forEach((node, index) => images.set(node.blockId, rasterized[index]));

  return images;
}
