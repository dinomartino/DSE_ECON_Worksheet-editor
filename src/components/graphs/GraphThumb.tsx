'use client';

import { memo, useMemo } from 'react';
import type { SavedGraph } from '@/model/graph';
import { diagramSvg } from '@/render/diagram';

/** The picture is drawn from geometry, never stored; memoised so typing in search does not redraw every card. */
export const GraphThumb = memo(function GraphThumb({ graph, className = 'aspect-[4/3] p-2' }: { graph: SavedGraph; className?: string }) {
  const svg = useMemo(
    () =>
      diagramSvg(graph.block.diagram, {
        widthPx: graph.block.widthPx,
        heightPx: graph.block.heightPx,
        language: graph.language,
        fonts: graph.fonts,
      }),
    [graph.block, graph.language, graph.fonts],
  );
  return (
    <span
      aria-hidden
      className={`flex items-center justify-center overflow-hidden rounded-[3px] bg-white [&_svg]:h-auto [&_svg]:max-h-full [&_svg]:w-auto [&_svg]:max-w-full ${className}`}
      style={{ lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
});
