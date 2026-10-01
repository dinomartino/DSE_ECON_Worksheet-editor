import { plain } from '@/model/text';
import type { SavedGraph } from '@/model/graph';
import { rasterizeDiagram } from './diagramImage';

/**
 * A saved graph out of the app: the same 3× PNG on white a `.docx` places, through
 * `diagramImage.ts`'s rasterizer.
 */

export function graphPngDataUrl(graph: SavedGraph): Promise<string> {
  return rasterizeDiagram(graph.block, graph.fonts, graph.language);
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',', 2);
  const type = /data:([^;,]+)/.exec(head)?.[1] ?? 'application/octet-stream';
  const binary = atob(body ?? '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The `text/html` half of a copy: the PNG with its printed size in CSS px, so Word pastes
 * it at print size rather than 3× too large.
 */
export function graphClipboardHtml(graph: SavedGraph, dataUrl: string): string {
  const { widthPx, heightPx, altText } = graph.block;
  const alt = plain(graph.language === 'zh' ? altText.zh : altText.en) || plain(altText.en) || plain(altText.zh);
  return `<img src="${dataUrl}" width="${widthPx}" height="${heightPx}" alt="${escapeAttr(alt)}" style="width:${widthPx}px;height:${heightPx}px">`;
}

/**
 * Copy the graph as one clipboard item: PNG and HTML. Call it inside the click, before
 * any await: Safari keeps the click's permission only for a write started there, so
 * both halves are passed as promises the write resolves.
 */
export function copyGraphImage(graph: SavedGraph): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    return Promise.reject(new Error('This browser cannot copy images.'));
  }
  const png = graphPngDataUrl(graph);
  const item = new ClipboardItem({
    'image/png': png.then(dataUrlToBlob),
    'text/html': png.then((url) => new Blob([graphClipboardHtml(graph, url)], { type: 'text/html' })),
  });
  return navigator.clipboard.write([item]);
}
