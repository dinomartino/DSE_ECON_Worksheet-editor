import type { RenderNode } from '@/render/ir';

/**
 * An item's nodes as the sheets draw and the paginator breaks them: a question's dotted
 * answer space becomes one node per line.
 *
 * The `.docx` writes that space as one paragraph per line with no `keepNext`, so Word
 * breaks between any two lines; as one node the preview could only move it whole, and a
 * Paper 2 booklet ran sheets longer than its export. Only an answer space that a question
 * owns is split: a flow element's (`elementId`) keeps its resize handle and its own
 * overflow split, and a fill is sized by the paginator and never broken.
 *
 * Cached per node array, so an unchanged question keeps one identity (`ItemBody`'s memo).
 */
export function pageNodes(nodes: RenderNode[]): RenderNode[] {
  const cached = CACHE.get(nodes);
  if (cached) return cached;
  const split = nodes.some(splits)
    ? nodes.flatMap((node): RenderNode[] =>
        splits(node) ? Array.from({ length: node.lines }, () => ({ ...node, lines: 1 })) : [node],
      )
    : nodes;
  CACHE.set(nodes, split);
  return split;
}

const CACHE = new WeakMap<RenderNode[], RenderNode[]>();

function splits(node: RenderNode): node is Extract<RenderNode, { kind: 'answerSpace' }> {
  return node.kind === 'answerSpace' && !node.elementId && !node.fill && node.lines > 1;
}
