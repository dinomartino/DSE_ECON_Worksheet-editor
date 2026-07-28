import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildDocxParts, exportDocxBuffer } from '@/export/docx';
import { worksheetClipboardHtml, worksheetPlainText } from '@/export/clipboard';
import { collectDiagramNodes, type DiagramImageMap } from '@/export/diagramImage';
import { createDiagramBlock } from '@/model/factories';
import { DIAGRAM_TEMPLATES, buildFromTemplate, createBlankDiagram } from '@/model/diagramTemplates';
import { bi } from '@/model/text';
import type { OutputMode, Worksheet } from '@/model/types';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { renderWorksheet } from './worksheet';
import { diagramSvg } from './diagram';

/**
 * Diagrams (§3.3, §7.5).
 *
 * The load-bearing promise is that a diagram reaches Word as **one image**: it is
 * geometry in the document so it stays editable, and exactly one picture in the export
 * so Word cannot pull it apart. Both halves are asserted here.
 */

const STUDENT_BI: OutputMode = { language: 'bilingual', version: 'student' };

/**
 * A 2x2 PNG, standing in for what the browser rasterizer produces.
 *
 * Deliberately *not* the same bytes as the fixture's image: identical sources are
 * correctly deduplicated into one media part, which would hide whether the diagram
 * contributed a picture of its own.
 */
const FAKE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQkAAEQaAwXvsJnAAAAAAElFTkSuQmCC';

function worksheetWithDiagram(templateId = 'ad-as'): Worksheet {
  const worksheet = buildAcceptanceWorksheet();
  const block = createDiagramBlock(templateId);
  block.caption = bi('Figure 1', '圖一');
  block.altText = bi('AD-AS diagram', 'AD-AS 圖');
  worksheet.questions[0].blocks.push(block);
  return worksheet;
}

describe('diagram geometry', () => {
  it('starts as a bare pair of labelled axes with nothing drawn on them', () => {
    const diagram = createBlankDiagram();
    expect(diagram.curves).toHaveLength(0);
    expect(diagram.points).toHaveLength(0);
    expect(diagram.labels).toHaveLength(0);
    expect(diagram.arrows).toHaveLength(0);
    // The axes themselves are always present — that is what makes it a diagram.
    expect(diagram.x.title).toBeTruthy();
    expect(diagram.y.title).toBeTruthy();
  });

  it('gives every template valid geometry inside the unit square', () => {
    for (const template of DIAGRAM_TEMPLATES) {
      const diagram = template.build();
      for (const curve of diagram.curves) {
        expect(curve.points.length, `${template.id} curve needs 2+ points`).toBeGreaterThanOrEqual(2);
        for (const point of curve.points) {
          expect(point.x, `${template.id} x`).toBeGreaterThanOrEqual(0);
          expect(point.x, `${template.id} x`).toBeLessThanOrEqual(1);
          expect(point.y, `${template.id} y`).toBeGreaterThanOrEqual(0);
          expect(point.y, `${template.id} y`).toBeLessThanOrEqual(1);
        }
      }
      for (const mark of diagram.points) {
        expect(mark.at.x).toBeGreaterThanOrEqual(0);
        expect(mark.at.x).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives each template instance fresh ids, so two copies never alias', () => {
    const a = buildFromTemplate('supply-demand');
    const b = buildFromTemplate('supply-demand');
    const idsA = a.curves.map((curve) => curve.id);
    const idsB = b.curves.map((curve) => curve.id);
    expect(idsA.some((id) => idsB.includes(id))).toBe(false);
  });
});

describe('diagram SVG rendering', () => {
  it('draws axes, curves, points and labels from one pure function', () => {
    const svg = diagramSvg(buildFromTemplate('ad-as'), {
      widthPx: 400,
      heightPx: 300,
      language: 'en',
    });

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('</svg>');
    // Three curves in the AD-AS template.
    expect((svg.match(/<path[^>]*stroke-width/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(svg).toContain('LRAS');
    expect(svg).toContain('SRAS');
    expect(svg).toContain('Price level');
    expect(svg).toContain('Output level');
  });

  it('embeds no external references, so rasterizing cannot taint the canvas', () => {
    for (const template of DIAGRAM_TEMPLATES) {
      const svg = diagramSvg(template.build(), { widthPx: 400, heightPx: 300, language: 'bilingual' });
      expect(svg, template.id).not.toMatch(/xlink:href|<image|url\(http|@import/);
    }
  });

  it('renders subscripts as real tspans, so "E₀" keeps the paper convention', () => {
    const svg = diagramSvg(buildFromTemplate('supply-demand'), {
      widthPx: 400,
      heightPx: 300,
      language: 'en',
    });
    expect(svg).toMatch(/baseline-shift="sub"/);
  });

  it('honours the language mode, exactly like every other rendered string', () => {
    const diagram = createBlankDiagram();
    const en = diagramSvg(diagram, { widthPx: 400, heightPx: 300, language: 'en' });
    const zh = diagramSvg(diagram, { widthPx: 400, heightPx: 300, language: 'zh' });

    expect(en).toContain('Quantity');
    expect(en).not.toContain('數量');
    expect(zh).toContain('數量');
    expect(zh).not.toContain('Quantity');
  });

  it('prints a symbol label once in bilingual mode instead of stacking it twice', () => {
    const svg = diagramSvg(buildFromTemplate('ad-as'), {
      widthPx: 400,
      heightPx: 300,
      language: 'bilingual',
    });

    // "AD" and "LRAS" are written the same in both languages; stacking them would
    // print each curve's name twice, right on top of the curve.
    expect((svg.match(/>AD</g) ?? []).length).toBe(1);
    expect((svg.match(/>LRAS</g) ?? []).length).toBe(1);
    // A genuinely translated axis title still stacks both languages.
    expect(svg).toContain('Price level');
    expect(svg).toContain('價格水平');
  });

  it('scales every dimension so an export can rasterize at print resolution', () => {
    const options = { widthPx: 400, heightPx: 300, language: 'en' as const };
    const base = diagramSvg(createBlankDiagram(), options);
    const large = diagramSvg(createBlankDiagram(), { ...options, scale: 3 });

    expect(base).toContain('width="400"');
    expect(large).toContain('width="1200"');
    // Same drawing, just bigger: the element counts must match.
    expect((large.match(/<path/g) ?? []).length).toBe((base.match(/<path/g) ?? []).length);
  });

  it('keeps a kinked curve sharp rather than smoothing its corner away', () => {
    const svg = diagramSvg(buildFromTemplate('import-quota'), {
      widthPx: 400,
      heightPx: 300,
      language: 'en',
    });
    // A straight multi-point curve is a polyline (L commands), never a spline.
    expect(svg).toMatch(/M [\d.]+ [\d.]+ L [\d.]+ [\d.]+ L/);
  });
});

describe('axis titles sit beside their own axis', () => {
  /** Every `<text y="…">` in the SVG, which is where a clipped title shows up. */
  const textYs = (svg: string) =>
    Array.from(svg.matchAll(/<text [^>]*y="(-?[\d.]+)"/g)).map((m) => Number(m[1]));

  it('indents the y-axis title over its axis and keeps it above the arrow tip', () => {
    // On the page the word began to the *right* of the axis, so it hung beside the line
    // instead of straddling it. The indent is what fixes that.
    //
    // The vertical anchor was also rewritten — from "a line-height below the canvas top"
    // to "just above the arrow tip" — but at the current `PAD.top` the two agree exactly,
    // so no assertion here can tell them apart. That is worth stating rather than
    // dressing up: the change matters only if the padding is ever retuned, and this test
    // pins the *relationship* (title above tip, left of axis) that must hold either way.
    const diagram = createBlankDiagram();
    diagram.y = { title: bi('Price', 'Price') };
    const svg = diagramSvg(diagram, { widthPx: 400, heightPx: 300, language: 'en' });

    // The y-axis is the vertical path: same x at both ends. Matching the first
    // `marker-end` path instead finds the *x*-axis, whose end sits at the plot bottom.
    const yAxis = Array.from(
      svg.matchAll(/M ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+)/g),
    ).find((m) => m[1] === m[3])!;
    const axisX = Number(yAxis[1]);
    const axisTop = Number(yAxis[4]);
    const titleY = Math.min(...textYs(svg));
    const titleX = Number(/<text x="([\d.]+)"[^>]*>[^<]*<tspan[^>]*>Price/.exec(svg)?.[1] ?? '-1');

    expect(titleX).toBeGreaterThan(0);
    expect(titleX).toBeLessThan(axisX);
    expect(titleY).toBeGreaterThan(0);
    expect(titleY).toBeLessThan(axisTop);
  });

  it('keeps a bilingual two-line title inside the canvas', () => {
    // The old constant existed to guarantee this. The projection reserves `extraTop` for
    // the second line, and the `Math.max` floor is what stops a plot that starts near
    // the top from pushing the first line off the canvas — where an SVG silently clips.
    const diagram = createBlankDiagram();
    diagram.y = { title: bi('Price level', '價格水平') };
    const svg = diagramSvg(diagram, { widthPx: 400, heightPx: 300, language: 'bilingual' });
    expect(Math.min(...textYs(svg))).toBeGreaterThan(0);
  });

  it('starts the x-axis title just past its arrowhead rather than at the far edge', () => {
    const diagram = createBlankDiagram();
    diagram.x = { title: bi('Quantity', 'Quantity') };
    const width = 400;
    const svg = diagramSvg(diagram, { widthPx: width, heightPx: 300, language: 'en' });
    const titleX = Number(/<text x="([\d.]+)"[^>]*>.*?Quantity/.exec(svg)?.[1] ?? '0');
    // Right-anchoring to the edge stranded a short title in the padding reserved for a
    // long one; it now begins near the axis and grows outward.
    expect(titleX).toBeGreaterThan(0);
    expect(titleX).toBeLessThan(width - 40);
  });
});

describe('diagram in the render IR', () => {
  it('reaches the IR as geometry, not as a pre-rendered image', () => {
    const rendered = renderWorksheet(worksheetWithDiagram(), STUDENT_BI);
    const nodes = rendered.questions[0].nodes;
    const diagram = nodes.find((node) => node.kind === 'diagram');

    expect(diagram).toBeTruthy();
    if (diagram?.kind !== 'diagram') throw new Error('unreachable');
    // Geometry survives into the IR, which is what keeps the preview live and the
    // diagram re-editable after a reload.
    expect(diagram.diagram.curves.length).toBeGreaterThan(0);
    expect(diagram.blockId).toBeTruthy();
  });

  it('finds diagrams placed as layout elements, not only inside questions', () => {
    const worksheet = buildAcceptanceWorksheet();
    const block = createDiagramBlock('supply-demand');
    worksheet.questions[0].blocks.push(block);

    const found = collectDiagramNodes(worksheet, STUDENT_BI);
    expect(found).toHaveLength(1);
    expect(found[0].blockId).toBe(block.id);
  });
});

describe('diagram export: one image per diagram', () => {
  it('embeds exactly one picture part and one drawing for a diagram', async () => {
    // Measured as the delta against the same worksheet without the diagram, because the
    // acceptance fixture already contains an ordinary image.
    const count = async (worksheet: Worksheet, images: DiagramImageMap) => {
      const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, STUDENT_BI, images));
      const document = await zip.file('word/document.xml')!.async('string');
      return {
        media: Object.keys(zip.files).filter((path) => path.startsWith('word/media/')).length,
        drawings: (document.match(/<w:drawing>/g) ?? []).length,
        pictures: (document.match(/<pic:pic /g) ?? []).length,
      };
    };

    const before = await count(buildAcceptanceWorksheet(), new Map());

    const worksheet = worksheetWithDiagram();
    const node = collectDiagramNodes(worksheet, STUDENT_BI)[0];
    const after = await count(worksheet, new Map([[node.blockId, FAKE_PNG]]));

    // One media part, one drawing, one picture — the diagram is a single object in
    // Word rather than a group of shapes a stray click could pull apart.
    expect(after.media - before.media).toBe(1);
    expect(after.drawings - before.drawings).toBe(1);
    expect(after.pictures - before.pictures).toBe(1);
  });

  it('carries the caption and alt text onto the exported picture', async () => {
    const worksheet = worksheetWithDiagram();
    const node = collectDiagramNodes(worksheet, STUDENT_BI)[0];
    const { documentXml } = buildDocxParts(
      worksheet,
      STUDENT_BI,
      new Map([[node.blockId, FAKE_PNG]]),
    );

    expect(documentXml).toContain('AD-AS diagram');
    expect(documentXml).toContain('Figure 1');
  });

  it('skips the drawing rather than emitting a broken one when rasterizing failed', () => {
    // No image map: this is what a non-browser runtime produces.
    const withDiagram = buildDocxParts(worksheetWithDiagram(), STUDENT_BI, new Map());
    const without = buildDocxParts(buildAcceptanceWorksheet(), STUDENT_BI, new Map());

    const drawings = (xml: string) => (xml.match(/<w:drawing>/g) ?? []).length;
    // The diagram contributes no drawing at all, rather than one pointing at a
    // relationship that does not exist — which Word reports as a repair error.
    expect(drawings(withDiagram.documentXml)).toBe(drawings(without.documentXml));
    // The rest of the worksheet, including its caption, still exports.
    expect(withDiagram.documentXml).toContain('Figure 1');
  });

  it('pastes into Word as a single <img>', () => {
    const worksheet = worksheetWithDiagram();
    const node = collectDiagramNodes(worksheet, STUDENT_BI)[0];
    const html = worksheetClipboardHtml(
      worksheet,
      STUDENT_BI,
      new Map([[node.blockId, FAKE_PNG]]),
    );
    const baseline = worksheetClipboardHtml(buildAcceptanceWorksheet(), STUDENT_BI);
    const imgs = (source: string) => (source.match(/<img /g) ?? []).length;

    // The diagram adds exactly one <img>, so Word receives one object to place.
    expect(imgs(html) - imgs(baseline)).toBe(1);
    expect(html).toContain(FAKE_PNG);
    expect(html).toContain('Figure 1');
  });

  it('names the diagram in the plain-text flavour instead of dropping it', () => {
    const text = worksheetPlainText(worksheetWithDiagram(), STUDENT_BI);
    expect(text).toContain('[AD-AS diagram]');
  });

  it('leaks no answers through a student export of a diagram question', () => {
    const worksheet = worksheetWithDiagram();
    const node = collectDiagramNodes(worksheet, STUDENT_BI)[0];
    const { documentXml } = buildDocxParts(
      worksheet,
      STUDENT_BI,
      new Map([[node.blockId, FAKE_PNG]]),
    );
    expect(documentXml).not.toContain('Teacher Version');
  });
});
