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
  // The svg fills an absolute box and scales by its viewBox: WebKit lets `max-height: 100%`
  // under an aspect-ratio box overflow, which cropped a pie (taller than the 4:3 card).
  return (
    <span aria-hidden className={`relative block overflow-hidden rounded-[3px] bg-white ${className}`} style={{ lineHeight: 0 }}>
      <span
        className="absolute inset-0 block [&_svg]:h-full [&_svg]:w-full"
        style={{ padding: 'inherit' }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </span>
  );
});
