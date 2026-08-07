import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildDocxParts, exportDocx, exportDocxBuffer } from '@/export/docx';
import { worksheetClipboardHtml, worksheetPlainText } from '@/export/clipboard';
import { collectDiagramNodes, type DiagramImageMap } from '@/export/diagramImage';
import { createDiagramBlock } from '@/model/factories';
import { DIAGRAM_TEMPLATES, buildFromTemplate, createBlankDiagram } from '@/model/diagramTemplates';
import { bi } from '@/model/text';
import type { OutputMode, Worksheet } from '@/model/types';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { renderWorksheet } from './worksheet';
import {
  axisTitleAnchor,
  diagramPlot,
  diagramSize,
  diagramSvg,
  diagramTitleAnchor,
  pieSlicePercent,
} from './diagram';

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

describe('the diagram title (§the caption)', () => {
  const titled = () => ({
    ...createBlankDiagram(),
    title: bi('Australian wine sold in China', '在中國銷售的澳洲葡萄酒'),
    y: { title: bi('Price (Renminbi)', '價格') },
  });

  it('prints centred over the plot and underlined', () => {
    const svg = diagramSvg(titled(), { widthPx: 480, heightPx: 360, language: 'en' });
    expect(svg).toContain('Australian wine sold in China');
    expect(svg).toContain('text-anchor="middle"');
    // The underline is what distinguishes a caption from the y-axis title just below it,
    // and it is how the reference paper sets it.
    expect(svg).toContain('text-decoration:underline');
  });

  it('centres on the plot, not on the canvas', () => {
    // The plot is deliberately off-centre — a wide left pad for the y-axis ticks against
    // a narrow right one — so centring on the SVG would sit the caption visibly left of
    // the picture it names.
    const proj = diagramPlot(titled(), { widthPx: 480, heightPx: 360, language: 'en' });
    const at = diagramTitleAnchor(titled(), proj, 1, 'en');
    expect(at.x).toBeCloseTo((proj.plot.left + proj.plot.right) / 2);
    expect(at.x).not.toBeCloseTo(240);
  });

  it('reserves its own room, pushing the plot down', () => {
    const without = diagramPlot(createBlankDiagram(), { widthPx: 480, heightPx: 360, language: 'en' });
    const with_ = diagramPlot(titled(), { widthPx: 480, heightPx: 360, language: 'en' });
    expect(with_.plot.top).toBeGreaterThan(without.plot.top);
  });

  it('costs an untitled diagram nothing', () => {
    // An absent caption must reserve no room at all, or every untitled diagram renders
    // with a blank strip on top.
    const bare = createBlankDiagram();
    const a = diagramPlot(bare, { widthPx: 480, heightPx: 360, language: 'en' });
    const b = diagramPlot({ ...bare, title: undefined }, { widthPx: 480, heightPx: 360, language: 'en' });
    expect(a.plot.top).toBe(b.plot.top);
  });

  it('does not collide with the y-axis title beneath it', () => {
    // The y title's floor used to be the canvas edge; with a caption above, that let the
    // two overlap on a diagram whose plot starts near the top.
    const diagram = titled();
    const proj = diagramPlot(diagram, { widthPx: 480, heightPx: 360, language: 'en' });
    const caption = diagramTitleAnchor(diagram, proj, 1, 'en');
    const yTitle = axisTitleAnchor(diagram, 'y', proj, 480, 1, 'en');
    expect(yTitle.y).toBeGreaterThan(caption.y);
  });

  it('stacks both languages in bilingual mode', () => {
    const svg = diagramSvg(titled(), { widthPx: 480, heightPx: 360, language: 'bilingual' });
    expect(svg).toContain('Australian wine sold in China');
    expect(svg).toContain('在中國銷售的澳洲葡萄酒');
  });

  it('carries into the exported PNG like everything else — one image, no extra parts', async () => {
    // The caption rides inside the same rasterized picture rather than being a paragraph
    // beside it, so a stray click in Word cannot separate a diagram from its own title.
    const worksheet = worksheetWithDiagram();
    const block = worksheet.questions[0].blocks.find((b) => b.kind === 'diagram');
    if (block?.kind !== 'diagram') throw new Error('fixture lost its diagram block');
    block.diagram = { ...block.diagram, title: titled().title };
    const images: DiagramImageMap = new Map(
      collectDiagramNodes(worksheet, STUDENT_BI).map((node) => [node.blockId, FAKE_PNG]),
    );
    const buffer = await exportDocxBuffer(worksheet, STUDENT_BI, images);
    const zip = await JSZip.loadAsync(buffer);
    const media = Object.keys(zip.files).filter((name) => name.startsWith('word/media/'));
    expect(media.length).toBeGreaterThan(0);
    const document = await zip.file('word/document.xml')!.async('string');
    // The caption is drawn into the picture, so it must NOT also appear as document text.
    expect(document).not.toContain('Australian wine sold in China');
  });
});

describe('a diagram carries its words inside its own image', () => {
  /** A worksheet whose diagram carries a title, on the given side. */
  const withTitle = (placement?: 'above' | 'below') => {
    const worksheet = worksheetWithDiagram();
    const block = worksheet.questions[0].blocks.find((b) => b.kind === 'diagram');
    if (block?.kind !== 'diagram') throw new Error('fixture lost its diagram block');
    // Deliberately not "Figure 1"/"圖一": the acceptance fixture's `ImageBlock` caption
    // is exactly that, and it *is* legitimate document text. Sharing the wording would
    // make every "the title never prints" assertion here match the wrong block.
    block.diagram = {
      ...block.diagram,
      title: bi('The market for wine', '葡萄酒市場'),
      ...(placement ? { titlePlacement: placement } : {}),
    };
    return { worksheet, blockId: block.id };
  };

  const docxFor = async (worksheet: Worksheet) => {
    const images: DiagramImageMap = new Map(
      collectDiagramNodes(worksheet, STUDENT_BI).map((node) => [node.blockId, FAKE_PNG]),
    );
    const buffer = await exportDocxBuffer(worksheet, STUDENT_BI, images);
    const zip = await JSZip.loadAsync(buffer);
    return zip.file('word/document.xml')!.async('string');
  };

  it('never prints the title as document text, on either side', async () => {
    // The whole point of the title superseding the old block caption: the words are
    // rasterized into the PNG, so Word receives one object. A title that leaked into
    // document.xml would be a paragraph again — separable from the picture by a stray
    // click, and free to drift out from under it.
    for (const placement of ['above', 'below'] as const) {
      const { worksheet } = withTitle(placement);
      const xml = await docxFor(worksheet);
      // Scoped to this diagram's own wording, both languages. The acceptance fixture
      // also carries a captioned `ImageBlock` ("Figure 1"/"圖一") whose caption
      // legitimately *is* document text, so a search for that wording would match the
      // wrong block and pass regardless of what the diagram did.
      expect(xml).not.toContain('The market for wine');
      expect(xml).not.toContain('葡萄酒市場');
    }
  });

  it('emits the picture as one paragraph with no words beside it', async () => {
    const { worksheet } = withTitle('below');
    const xml = await docxFor(worksheet);
    // The diagram is the *last* picture in the fixture — the acceptance worksheet also
    // has a captioned `ImageBlock` earlier — so anchor on its own drawing.
    const drawing = xml.lastIndexOf('<w:drawing>');
    const start = xml.lastIndexOf('<w:p>', drawing);
    const end = xml.indexOf('</w:p>', drawing);
    const paragraph = xml.slice(start, end);

    // The paragraph carries the drawing and no text runs of its own.
    expect(paragraph).not.toContain('<w:t');
    // And the diagram's own words are nowhere in the document at all — the check that
    // actually distinguishes "drawn into the PNG" from "printed beside the picture".
    expect(xml).not.toContain('The market for wine');
  });

  it('refuses to export rather than dropping a diagram that did not rasterize', async () => {
    /*
     * `diagramNodeXml` emits nothing when a diagram has no PNG, and it must: a
     * `w:drawing` pointing at a relationship that was never written is a Word repair
     * error. But silence is its own failure — the file arrives without the figure, and a
     * missing image is indistinguishable from a diagram nobody added. That ambiguity is
     * what made an export that *looked* broken take a full session to diagnose as
     * correct.
     *
     * Under the node test runner there is no canvas, so `renderDiagramImages` returns an
     * empty map and this is exactly the failure being described.
     */
    const { worksheet } = withTitle();
    await expect(exportDocx(worksheet, STUDENT_BI)).rejects.toThrow(/could not be turned into an image/);
  });

  it('names the diagram it could not rasterize, so a teacher knows where to look', async () => {
    // "diagram 2 of 5" says nothing about which picture to go and fix; the alt text is
    // the one human-readable handle a diagram carries.
    const { worksheet } = withTitle();
    await expect(exportDocx(worksheet, STUDENT_BI)).rejects.toThrow(/AD-AS diagram/);
  });

  it('exports normally once every diagram has its image', async () => {
    // The guard must not fire on the ordinary path — it is the browser's rasterizer that
    // fills this map in real use.
    const { worksheet } = withTitle();
    const images: DiagramImageMap = new Map(
      collectDiagramNodes(worksheet, STUDENT_BI).map((node) => [node.blockId, FAKE_PNG]),
    );
    const buffer = await exportDocxBuffer(worksheet, STUDENT_BI, images);
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('has nothing picture-shaped outside the items, which is why the two walks differ', () => {
    /*
     * `collectImages` (the exporter) walks only `rendered.items`, while `allNodes` (the
     * rasterization pre-pass) also walks the bands, the title and the instructions. Two
     * passes disagreeing about what a document contains is normally a bug — a picture
     * rasterized but never embedded — so the reason this one is safe is worth pinning:
     * those three simply cannot hold a picture. A band renders as a `columns` node, and
     * the title and instructions as `text` nodes.
     *
     * If that ever stops being true, this fails and `collectImages` has to widen.
     */
    const worksheet = worksheetWithDiagram();
    const rendered = renderWorksheet(worksheet, STUDENT_BI);

    const outside = [rendered.title, rendered.instructions, ...rendered.bands].filter(
      (node): node is NonNullable<typeof node> => Boolean(node),
    );
    expect(outside.length).toBeGreaterThan(0);
    for (const node of outside) {
      expect(node.kind, 'a picture outside the items would be dropped by collectImages')
        .not.toBe('diagram');
      expect(node.kind).not.toBe('image');
    }
  });

  it('pastes as the image alone', () => {
    const { worksheet, blockId } = withTitle('above');
    const html = worksheetClipboardHtml(worksheet, STUDENT_BI, new Map([[blockId, FAKE_PNG]]));
    expect(html).toContain('<img');
    // Scoped to *this* diagram's own words: the acceptance fixture separately carries a
    // captioned `ImageBlock`, and an unscoped search would match that instead and pass
    // whatever the diagram did.
    expect(html).not.toContain('The market for wine');
  });

  it('draws the title into the SVG on the side asked for', () => {
    // Above and below must be genuinely different geometry, not the same picture with a
    // stored flag nobody reads. The plot is pushed down by a title above and up by one
    // below, so the drawn y of the words differs.
    const yOf = (placement: 'above' | 'below') => {
      const { worksheet } = withTitle(placement);
      const block = worksheet.questions[0].blocks.find((b) => b.kind === 'diagram');
      if (block?.kind !== 'diagram') throw new Error('fixture lost its diagram block');
      const svg = diagramSvg(block.diagram, {
        widthPx: 400,
        heightPx: 300,
        language: 'en',
        scale: 1,
      });
      expect(svg).toContain('The market for wine');
      // The words sit in a <tspan> inside the <text>, so the y has to be read off the
      // element rather than from the same tag as the string.
      const match = /<text[^>]*\sy="([\d.]+)"[^>]*>(?:(?!<\/text>).)*The market for wine/.exec(svg);
      return match ? Number(match[1]) : undefined;
    };
    const above = yOf('above');
    const below = yOf('below');
    expect(above).toBeDefined();
    expect(below).toBeDefined();
    expect(below!).toBeGreaterThan(above!);
  });

  it('keeps a title below the plot inside the picture, at any scale or language', () => {
    /*
     * The whole point of the title living in the geometry is that it rasterizes into the
     * same PNG — so a baseline past the canvas edge is not a cosmetic slip, it is words
     * that do not exist in the exported image.
     *
     * It went wrong twice, in opposite directions. Measuring *forward* from the plot
     * (`plot.bottom + PAD.bottom + a line`) overshot the room `titleRoom` had reserved
     * and left the baseline 11px from the foot of a 300px canvas, putting the underline
     * and every descender outside. Measuring back from the edge fixed English and still
     * failed bilingual, because `textAt` anchors the *first* line and stacks the rest
     * downward — the Chinese second line hung off the bottom.
     *
     * Asserted across scales because the exporter rasterizes at 3×, and across languages
     * because only the bilingual case has a second line.
     */
    const base = buildFromTemplate('supply-demand');
    for (const language of ['en', 'bilingual'] as const) {
      for (const scale of [1, 3]) {
        const diagram = {
          ...base,
          title: bi('The market for wine', '葡萄酒市場'),
          titlePlacement: 'below' as const,
        };
        const height = 300 * scale;
        const svg = diagramSvg(diagram, { widthPx: 400, heightPx: 300, language, scale });

        // Every line is its own `<text>` with its own y, so the lowest baseline drawn is
        // simply the largest of them — measured off the real output rather than
        // recomputed from the constants, which is what lets this fail when the anchor
        // is wrong.
        const baselines = [...svg.matchAll(/<text[^>]*\sy="([\d.]+)"/g)].map((m) => Number(m[1]));
        const lowest = Math.max(...baselines);
        const label = `${language}@${scale}x`;

        // Room for the underline and descenders under the last baseline. The broken
        // anchor left 10.7px at 1× — the underline printed on the canvas edge and the
        // bilingual second line past it.
        expect(height - lowest, `${label} needs room under the last line`).toBeGreaterThanOrEqual(
          13 * scale,
        );
        // And genuinely below the plot, not floating inside it.
        const proj = diagramPlot(diagram, { widthPx: 400, heightPx: 300, language, scale });
        expect(lowest, `${label} must clear the plot`).toBeGreaterThan(proj.plot.bottom);
      }
    }
  });

  it('measures the picture from what it draws, rather than padding a fixed box', () => {
    /*
     * `heightPx` used to be a flat `width * 3/4`, which made the *canvas* 4:3 and left
     * the plot to absorb everything drawn around it — so adding a title visibly squashed
     * the curves, and an untitled diagram still exported the blank strip a title would
     * have used. The plot now keeps its shape and the box grows instead.
     */
    const base = buildFromTemplate('supply-demand');
    const title = bi('The market for wine', '葡萄酒市場');

    const bare = diagramSize(base, 400, 'en');
    const titled = diagramSize({ ...base, title }, 400, 'en');
    const below = diagramSize({ ...base, title, titlePlacement: 'below' }, 400, 'en');
    const bilingual = diagramSize({ ...base, title }, 400, 'bilingual');

    // Width is the teacher's number and is never derived.
    for (const size of [bare, titled, below, bilingual]) expect(size.widthPx).toBe(400);

    // A title costs height, on whichever side it prints — and the same height either way.
    expect(titled.heightPx).toBeGreaterThan(bare.heightPx);
    expect(below.heightPx).toBe(titled.heightPx);
    // A second line (the bilingual stack) costs more again.
    expect(bilingual.heightPx).toBeGreaterThan(titled.heightPx);

    // The plot itself keeps its proportions rather than absorbing the difference: that is
    // the whole point, since a squashed supply-demand cross is what this replaced.
    // Each diagram is measured against *its own* box — that pairing is the point: the
    // titled one is taller, and its plot comes out the same size as the bare one's
    // because the extra height went to the title rather than to the axes.
    const plotOf = (diagram: typeof base, size: { widthPx: number; heightPx: number }) => {
      const proj = diagramPlot(diagram, {
        widthPx: size.widthPx,
        heightPx: size.heightPx,
        language: 'en' as const,
      });
      return { w: proj.plot.right - proj.plot.left, h: proj.plot.bottom - proj.plot.top };
    };
    const barePlot = plotOf(base, bare);
    const titledPlot = plotOf({ ...base, title }, titled);
    expect(titledPlot.w).toBeCloseTo(barePlot.w, 5);
    // Within a pixel: `diagramSize` rounds its height to a whole pixel, so the two plots
    // agree to the rounding and not beyond it.
    expect(Math.abs(titledPlot.h - barePlot.h)).toBeLessThanOrEqual(1);
  });

  it('costs an untitled diagram no room at all', () => {
    // An absent title must reserve nothing, or every untitled diagram prints with a
    // blank strip. The plot of a bare diagram starts exactly where the padding puts it.
    const bare = worksheetWithDiagram();
    const block = bare.questions[0].blocks.find((b) => b.kind === 'diagram');
    if (block?.kind !== 'diagram') throw new Error('fixture lost its diagram block');
    const options = { widthPx: 400, heightPx: 300, language: 'en' as const, scale: 1 };
    const plain = diagramPlot(block.diagram, options);
    const titled = diagramPlot(
      { ...block.diagram, title: bi('The market for wine', '葡萄酒市場') },
      options,
    );
    expect(titled.plot.top).toBeGreaterThan(plain.plot.top);
  });
});

describe('a cropped frame (§the crop)', () => {
  /**
   * The teacher's crop replaces the measured padding wholesale. The invariant under
   * test throughout: a crop chooses the white around the content, it never moves the
   * content — the plot and every word anchored to it hold still while the frame drags.
   */
  const title = bi('Figure 1: Market of agricultural products in the small open economy', '圖一');

  /** The measured pads of a diagram at its own measured size — the auto frame. */
  function measuredPads(diagram: ReturnType<typeof buildFromTemplate>, language: 'en' | 'zh' | 'bilingual') {
    const size = diagramSize(diagram, 400, language);
    const proj = diagramPlot(diagram, { ...size, language });
    return {
      size,
      crop: {
        left: proj.plot.left,
        top: proj.plot.top,
        right: size.widthPx - proj.plot.right,
        bottom: size.heightPx - proj.plot.bottom,
      },
    };
  }

  it('renders byte-identically when the crop equals the measured padding', () => {
    // The strongest statement of "a crop moves nothing": freezing the auto frame as a
    // crop must reproduce the exact SVG — plot, title, axis titles, everything.
    for (const placement of ['above', 'below'] as const) {
      for (const language of ['en', 'bilingual'] as const) {
        const diagram = { ...buildFromTemplate('supply-demand'), title, titlePlacement: placement };
        const { size, crop } = measuredPads(diagram, language);
        const auto = diagramSvg(diagram, { ...size, language });
        const cropped = diagramSvg({ ...diagram, crop }, { ...size, language });
        expect(cropped, `${placement} · ${language}`).toBe(auto);
      }
    }
  });

  it('sizes the box from the frame: plot aspect plus the chosen pads', () => {
    const diagram = { ...buildFromTemplate('supply-demand'), crop: { left: 80, top: 30, right: 90, bottom: 40 } };
    const size = diagramSize(diagram, 400, 'en');
    expect(size.widthPx).toBe(400);
    // The plot takes what the width leaves after the pads, and keeps 4:3.
    expect(size.heightPx).toBe(Math.round((400 - 80 - 90) * (3 / 4) + 30 + 40));
    // A chosen frame must not resize itself when the paper switches language.
    expect(diagramSize(diagram, 400, 'bilingual')).toEqual(size);
  });

  it('puts the plot edges exactly at the cropped pads, ignoring every derived reserve', () => {
    // A long x-axis title normally grows the right pad; under a crop the teacher's
    // number wins, even when it is tighter than the measurement would demand.
    const diagram = {
      ...buildFromTemplate('supply-demand'),
      crop: { left: 70, top: 20, right: 25, bottom: 35 },
    };
    const size = diagramSize(diagram, 400, 'bilingual');
    const proj = diagramPlot(diagram, { ...size, language: 'bilingual' });
    expect(proj.plot.left).toBe(70);
    expect(proj.plot.top).toBe(20);
    expect(proj.plot.right).toBe(400 - 25);
    expect(proj.plot.bottom).toBe(size.heightPx - 35);
  });

  it('keeps the title beside the plot while the frame grows around it', () => {
    // Cropping wider is the fix for a clipped title — the new white must appear
    // *around* the words, not between the words and the plot they caption.
    const base = { ...buildFromTemplate('supply-demand'), title };
    const { crop } = measuredPads(base, 'en');
    const wide = {
      ...base,
      crop: { left: crop.left + 60, top: crop.top + 50, right: crop.right + 60, bottom: crop.bottom + 50 },
    };
    const size = diagramSize(wide, 520, 'en');
    const proj = diagramPlot(wide, { ...size, language: 'en' });
    const at = diagramTitleAnchor(wide, proj, 1, 'en');
    const tight = measuredPads(base, 'en');
    const tightProj = diagramPlot(base, { ...tight.size, language: 'en' });
    const tightAt = diagramTitleAnchor(base, tightProj, 1, 'en');
    // Same distance above the plot in both frames.
    expect(at.y - proj.plot.top).toBeCloseTo(tightAt.y - tightProj.plot.top, 5);
    // And the axis title holds its floor beside the plot too.
    const axis = axisTitleAnchor(wide, 'y', proj, size.widthPx, 1, 'en');
    const tightAxis = axisTitleAnchor(base, 'y', tightProj, tight.size.widthPx, 1, 'en');
    expect(axis.y - proj.plot.top).toBeCloseTo(tightAxis.y - tightProj.plot.top, 5);
  });
});

describe('the auto frame widens for a long title', () => {
  const longTitle = bi(
    'Figure 1: Market of agricultural products in the small open economy',
    '圖一：小型開放經濟中的農產品市場',
  );

  it('floors the width so the centred title fits on the canvas', () => {
    const diagram = { ...buildFromTemplate('import-tariff'), title: longTitle };
    const size = diagramSize(diagram, 400, 'en');
    expect(size.widthPx).toBeGreaterThan(400);

    // And not merely wider: the drawn title's span sits inside the canvas. The title
    // is centred at `at.x`, so it fits iff the nearer edge is half the title away.
    // The width is re-estimated here with the renderer's own arithmetic (Latin glyphs
    // at 0.55 em of the 10pt title size) rather than exported from the module — the
    // test should fail if the floor and the drawing ever use different estimates.
    const proj = diagramPlot(diagram, { ...size, language: 'en' as const });
    const at = diagramTitleAnchor(diagram, proj, 1, 'en');
    const estimated = 'Figure 1: Market of agricultural products in the small open economy'
      .length * 0.55 * (10 * (96 / 72));
    expect(Math.min(at.x, size.widthPx - at.x) * 2).toBeGreaterThanOrEqual(estimated);
  });

  it('leaves a width that already fits untouched', () => {
    const diagram = { ...buildFromTemplate('supply-demand'), title: bi('Fig. 1', '圖一') };
    expect(diagramSize(diagram, 400, 'bilingual').widthPx).toBe(400);
  });

  it('defers to a teacher\'s crop: a chosen frame is never widened', () => {
    const diagram = {
      ...buildFromTemplate('supply-demand'),
      title: longTitle,
      crop: { left: 64, top: 44, right: 30, bottom: 46 },
    };
    expect(diagramSize(diagram, 400, 'en').widthPx).toBe(400);
  });
});

describe('the pie chart variant', () => {
  const pie = () => buildFromTemplate('pie');

  it('ships a template whose slices carry both language sides and positive values', () => {
    const diagram = pie();
    expect(diagram.pie).toBeTruthy();
    for (const slice of diagram.pie!.slices) {
      expect(slice.value).toBeGreaterThan(0);
      expect(slice.label.en.some((run) => run.text.trim() !== '')).toBe(true);
      expect(slice.label.zh.some((run) => run.text.trim() !== '')).toBe(true);
    }
  });

  it('draws one patterned wedge and one derived percent per slice', () => {
    const diagram = pie();
    const svg = diagramSvg(diagram, { widthPx: 320, heightPx: 348, language: 'en' });
    // Four slices: the first is plain white, the rest take the cycling patterns.
    expect((svg.match(/<path d="M [^"]+ Z"/g) ?? []).length).toBe(4);
    expect(svg).toContain('url(#pieHatch)');
    expect(svg).toContain('url(#pieDots)');
    // The percents are derived from the 40/30/20/10 shares, never stored.
    for (const pct of ['40%', '30%', '20%', '10%']) expect(svg).toContain(pct);
    expect(svg).toContain('Firm A');
  });

  it('derives percents with one decimal at most, trimming a trailing .0', () => {
    expect(pieSlicePercent(36.5, 100)).toBe('36.5%');
    expect(pieSlicePercent(33, 100)).toBe('33%');
    expect(pieSlicePercent(1, 3)).toBe('33.3%');
  });

  it('treats values as shares of the total, not as percentages', () => {
    const diagram = pie();
    diagram.pie = {
      slices: [
        { id: 'a', label: bi('A', 'A'), value: 3 },
        { id: 'b', label: bi('B', 'B'), value: 1 },
      ],
    };
    const svg = diagramSvg(diagram, { widthPx: 320, heightPx: 348, language: 'en' });
    expect(svg).toContain('75%');
    expect(svg).toContain('25%');
  });

  it('draws a lone slice as the full circle its wedge path cannot express', () => {
    const diagram = pie();
    diagram.pie = { slices: [{ id: 'a', label: bi('All', '全部'), value: 5 }] };
    const svg = diagramSvg(diagram, { widthPx: 320, heightPx: 348, language: 'en' });
    expect(svg).toContain('<circle');
    expect(svg).not.toContain('<path d="M');
    expect(svg).toContain('100%');
  });

  it('skips zero-value slices and keeps an empty pie visible as a bare circle', () => {
    const diagram = pie();
    diagram.pie = {
      slices: [
        { id: 'a', label: bi('A', 'A'), value: 2 },
        { id: 'b', label: bi('Ghost', '幽靈'), value: 0 },
        { id: 'c', label: bi('C', 'C'), value: 2 },
      ],
    };
    const svg = diagramSvg(diagram, { widthPx: 320, heightPx: 348, language: 'en' });
    expect(svg).not.toContain('Ghost');
    expect((svg.match(/<path d="M [^"]+ Z"/g) ?? []).length).toBe(2);

    diagram.pie = { slices: [] };
    const empty = diagramSvg(diagram, { widthPx: 320, heightPx: 348, language: 'en' });
    expect(empty).toContain('<circle');
  });

  it('prints its title bold and not underlined, as the reference pie sets it', () => {
    const diagram = { ...pie(), title: bi('Market Shares (%) in 2017', '2017 年市場佔有率') };
    const svg = diagramSvg(diagram, { widthPx: 320, heightPx: 400, language: 'en' });
    expect(svg).toContain('Market Shares (%) in 2017');
    expect(svg).toContain('font-weight:bold');
    expect(svg).not.toContain('text-decoration:underline');
  });

  it('measures a square-ish box, growing only for the title', () => {
    const bare = diagramSize(pie(), 320, 'en');
    expect(bare.widthPx).toBe(320);
    // No title: the height is exactly the circle plus its pads — a square canvas.
    expect(bare.heightPx).toBe(320);

    const titled = diagramSize(
      { ...pie(), title: bi('Market shares', '市場佔有率') },
      320,
      'en',
    );
    expect(titled.widthPx).toBe(320);
    expect(titled.heightPx).toBeGreaterThan(bare.heightPx);
  });

  it('rides the diagram pipeline: a pie block reaches the export pre-pass', () => {
    const worksheet = buildAcceptanceWorksheet();
    const block = createDiagramBlock('pie');
    worksheet.questions[0].blocks.push(block);
    const nodes = collectDiagramNodes(worksheet, STUDENT_BI);
    expect(nodes.some((node) => node.blockId === block.id && node.diagram.pie)).toBe(true);
  });

  it('prints an identical bilingual slice name once, like every diagram label', () => {
    const diagram = pie();
    diagram.pie = { slices: [{ id: 'a', label: bi('Ele.me', 'Ele.me'), value: 1 }] };
    const svg = diagramSvg(diagram, { widthPx: 320, heightPx: 348, language: 'bilingual' });
    expect((svg.match(/Ele\.me/g) ?? []).length).toBe(1);
  });
});
