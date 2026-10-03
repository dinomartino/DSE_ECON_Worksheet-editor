import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderNodeXml } from '@/export/docx/body';
import { DEFAULT_FONTS } from '@/model/factories';
import { bi } from '@/model/text';
import type { RenderNode } from '@/render/ir';

/**
 * A picture on the page is exactly as tall as its `.docx` paragraph, because the paginator
 * measures it. The file sets it alone in an auto-spaced paragraph with no spacing, which
 * LibreOffice lays out at the picture's own height; the preview's `my-2` margin and the
 * line strut's descent made each figure ~14pt taller, so a key sheet broke two lines early.
 * Measured in Chromium and WebKit: the gap a 275px diagram spans is 275px.
 */
const PREVIEW = readFileSync('src/components/preview/Preview.tsx', 'utf8');
const between = (start: string, end: string) => {
  const from = PREVIEW.indexOf(start);
  expect(from, `${start} has moved`).toBeGreaterThan(0);
  return PREVIEW.slice(from, PREVIEW.indexOf(end, from));
};

describe('a picture is its own height on the page, as in the .docx', () => {
  it('the diagram and image views add no margin and no strut', () => {
    const diagram = between('function DiagramNodeView', '\nfunction SizedBlock');
    const image = between('if (node.kind === "image") {', '\n  return null;');
    for (const view of [diagram, image]) {
      expect(view).not.toMatch(/\bm[ty]?-\d/);
      expect(view).toContain('style={PICTURE_BOX}');
    }
    expect(PREVIEW).toContain('const PICTURE_BOX: React.CSSProperties = { lineHeight: 0 };');
  });

  it('the .docx picture paragraph carries no spacing before or after', () => {
    const node: RenderNode = {
      kind: 'image',
      src: 'data:image/png;base64,AAAA',
      widthPx: 320,
      heightPx: 275,
      altText: bi('', ''),
      captionPlacement: 'below',
      align: 'center',
      blockId: 'img',
    };
    const xml = renderNodeXml(node, {
      fonts: DEFAULT_FONTS,
      language: 'en',
      contentWidth: 9026,
      numIds: new Map(),
      imageRelId: () => 'rId100',
      nextDrawingId: () => 1,
    });
    expect(xml).toContain('<w:spacing w:line="240" w:lineRule="auto"/>');
    expect(xml).not.toMatch(/w:before=|w:after=/);
    expect(xml).toContain(`cy="${275 * 9525}"`);
  });
});
