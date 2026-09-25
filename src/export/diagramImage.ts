import { diagramSvg } from '@/render/diagram';
import { answerGraphBox, answerGraphSvg } from '@/render/answerGraph';
import type { AnswerGraphNode, DiagramNode, RenderNode } from '@/render/ir';
import { contentWidth, pageSetupOf } from '@/model/page';
import type { FontPair, LanguageMode, OutputMode, Worksheet } from '@/model/types';
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
    yield* withChildren(nodes);
  }
}

/**
 * Nodes and their nested children, depth first. A diagram that is never yielded here
 * is never rasterized, and `exportDocx` then refuses the whole file naming it — so a
 * container that forgets to descend turns a working figure into a blocked export.
 */
function* withChildren(nodes: RenderNode[]): Generator<RenderNode> {
  for (const node of nodes) {
    yield node;
    // A figure row's children are ordinary nodes one level down — the diagram
    // beside a glossary table must rasterize like any other.
    if (node.kind === 'figureRow') {
      yield node.figure;
      yield node.table;
    } else if (node.kind === 'optionRow') {
      // Each cell of a figure-option grid holds the diagram that answers its letter.
      for (const cell of node.cells) yield* withChildren(cell);
    } else if (node.kind === 'source') {
      yield* withChildren(node.nodes);
    }
  }
}

/** Every distinct diagram among these nodes (children included), in order. */
function distinctDiagrams(nodes: Iterable<RenderNode>): DiagramNode[] {
  const found: DiagramNode[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    if (node.kind !== 'diagram' || seen.has(node.blockId)) continue;
    seen.add(node.blockId);
    found.push(node);
  }
  return found;
}

/** Every distinct diagram in the worksheet, in document order. */
export function collectDiagramNodes(worksheet: Worksheet, mode: OutputMode): DiagramNode[] {
  return distinctDiagrams(allNodes(worksheet, mode));
}

/** Every distinct diagram in a stand-alone IR, such as the answer key's. */
export function collectDiagramNodesIn(nodes: RenderNode[]): DiagramNode[] {
  return distinctDiagrams(withChildren(nodes));
}

/** Every distinct graph answer space (§ `AnswerGraphNode`), deduplicated by its key. */
export function collectAnswerGraphNodes(worksheet: Worksheet, mode: OutputMode): AnswerGraphNode[] {
  const found: AnswerGraphNode[] = [];
  const seen = new Set<string>();
  for (const node of allNodes(worksheet, mode)) {
    if (node.kind !== 'answerGraph' || seen.has(node.key)) continue;
    seen.add(node.key);
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
 * Rasterize these diagram nodes, keyed by block id, in the order given.
 *
 * Rasterized together rather than one after another: nearly all of `rasterize`'s wall
 * time is the browser decoding an SVG data URL off the main thread, so issuing them
 * together lets the decodes overlap. The fan-out is bounded by the diagrams in one
 * document, so no concurrency limit is needed.
 */
async function rasterizeDiagrams(
  nodes: DiagramNode[],
  fonts: FontPair,
  language: LanguageMode,
  images: DiagramImageMap,
): Promise<void> {
  const rasterized = await Promise.all(
    nodes.map((node) => {
      const svg = diagramSvg(node.diagram, {
        widthPx: node.widthPx,
        heightPx: node.heightPx,
        language,
        fonts,
        scale: EXPORT_SCALE,
      });
      return rasterize(svg, node.widthPx * EXPORT_SCALE, node.heightPx * EXPORT_SCALE);
    }),
  );
  nodes.forEach((node, index) => images.set(node.blockId, rasterized[index]));
}

/**
 * The PNG pre-pass for a stand-alone IR — the answer key, whose model answer diagrams
 * (§ `QuestionPart.answerDiagram`) are its only pictures.
 */
export async function renderNodeDiagramImages(
  nodes: RenderNode[],
  fonts: FontPair,
  language: LanguageMode,
): Promise<DiagramImageMap> {
  const images: DiagramImageMap = new Map();
  if (typeof document === 'undefined') return images;
  await rasterizeDiagrams(collectDiagramNodesIn(nodes), fonts, language, images);
  return images;
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

  // Deduplicated by block id, written in document order (the map's iteration order).
  await rasterizeDiagrams(collectDiagramNodes(worksheet, mode), worksheet.fonts, language, images);

  // Graph answer spaces join the same map under their content key, sized from the live
  // text column exactly as the `.docx` places them (§ `answerGraphBox`).
  const textWidth = contentWidth(pageSetupOf(worksheet));
  const graphs = collectAnswerGraphNodes(worksheet, mode);
  const graphImages = await Promise.all(
    graphs.map((node) => {
      const box = answerGraphBox(node, textWidth);
      const svg = answerGraphSvg(node, {
        widthPx: box.widthPx,
        heightPx: box.imageHeightPx,
        language,
        fonts: worksheet.fonts,
        scale: EXPORT_SCALE,
      });
      return rasterize(svg, box.widthPx * EXPORT_SCALE, box.imageHeightPx * EXPORT_SCALE);
    }),
  );
  graphs.forEach((node, index) => images.set(node.key, graphImages[index]));

  return images;
}
