import type { DiagramBlock, FontPair, LanguageMode, VersionMode } from '@/model/types';
import { diagramSvg } from './diagram';
import { diagramNodeFor, withAnswerLayers, type DiagramNode } from './ir';

/**
 * The SVG a diagram node draws on the page. One function for the page preview and the
 * draw canvas's Preview, so the canvas cannot show a picture the page would not print.
 */
export function diagramNodeSvg(
  node: Pick<DiagramNode, 'diagram' | 'widthPx' | 'heightPx' | 'answers'>,
  language: LanguageMode,
  fonts?: FontPair,
): string {
  return diagramSvg(node.diagram, {
    widthPx: node.widthPx,
    heightPx: node.heightPx,
    language,
    fonts,
    // The walker marks a teacher-version diagram that has an answer layer.
    ...(node.answers ? { answers: 'show' as const } : {}),
  });
}

/** A diagram block as the page draws it in one version: the walker's node, then its SVG. */
export function diagramBlockSvg(
  block: DiagramBlock,
  version: VersionMode,
  language: LanguageMode,
  fonts?: FontPair,
): string {
  const [node] = withAnswerLayers([diagramNodeFor(block, {})], { language, version });
  return diagramNodeSvg(node as DiagramNode, language, fonts);
}
