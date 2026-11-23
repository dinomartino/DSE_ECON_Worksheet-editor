/**
 * Word shape drawings and charts drawn as pictures on import (k-0498). Invented files only:
 * a supply-and-demand sketch made of lines, arrows, a dot and text-box labels, and a pie of
 * made-up fruit sales.
 */
import { describe, expect, it } from 'vitest';
import { analyseLines, buildImport, readDocx, type ImageRef } from '.';
import { A4_SECT, abstractNum, chart, chartPart, makeDocx, num, p, para, pieSeries, r, ruledLine, shape, shapeGroup } from './fixtures/docx';
import { applyOps } from '@/importCheck/ops';
import { checkPaper, checkReview, materializeBatch } from '@/importCheck/run';
import { createWorksheet } from '@/model/factories';

const svgOf = (ref: ImageRef | undefined) => {
  expect(ref?.src).toMatch(/^data:image\/svg\+xml;base64,/);
  return new TextDecoder().decode(Uint8Array.from(atob(ref!.src.split(',')[1]), (c) => c.charCodeAt(0)));
};
const label = (text: string, sub?: string) => p(r(text) + (sub ? r(sub, { vert: 'subscript' }) : ''));

/** A small market diagram: two axes with arrowheads, two curves, a dashed price line, a dot, labels. */
const DIAGRAM = [
  shape(40, 10, 0, 180, { flipV: true, ln: '<a:tailEnd type="triangle"/>' }),
  shape(40, 190, 260, 0, { ln: '<a:tailEnd type="triangle"/>' }),
  shape(60, 30, 200, 150),
  shape(60, 30, 200, 150, { flipH: true }),
  shape(40, 105, 120, 0, { ln: '<a:prstDash val="dash"/>' }),
  shape(156, 101, 8, 8, { prst: 'ellipse', fill: '<a:solidFill><a:srgbClr val="000000"/></a:solidFill>' }),
  shape(0, 0, 60, 20, { text: label('Price') }),
  shape(250, 195, 70, 20, { text: label('Quantity') }),
  shape(262, 20, 30, 20, { text: label('S', '1') }),
  shape(262, 170, 30, 20, { text: label('D', '0') }),
];

async function read(body: string, extra: Partial<Parameters<typeof makeDocx>[0]> = {}, options?: Parameters<typeof readDocx>[1]) {
  return readDocx(await makeDocx({ sectPr: A4_SECT, body, ...extra }), options);
}

describe('Word shape drawings as pictures (k-0498)', () => {
  it('draws a floating group of lines, arrows, a dashed line, a dot and labels in place of the slot', async () => {
    const got = await read(para('1.\tStudy the figure.') + p(shapeGroup(DIAGRAM, 320, 220)) + para('What happens to the price? (2 marks)'));
    const images = got.lines.filter((l) => l.image);
    expect(images).toHaveLength(1);
    const ref = images[0].image!;
    // The group's frame, grown a little for the strokes and labels at its edges.
    expect(ref.widthPx).toBeGreaterThanOrEqual(320);
    expect(ref.widthPx).toBeLessThan(340);
    expect(ref.heightPx).toBeGreaterThanOrEqual(220);
    expect(ref.alt).toBeUndefined();
    expect(ref.drawn).toBe('shapes');
    const svg = svgOf(ref);
    // Four lines and the dashed one, two arrowheads, the dot.
    expect(svg.match(/<path /g)).toHaveLength(6);
    expect(svg.match(/<polygon /g)).toHaveLength(2);
    expect(svg).toMatch(/stroke-dasharray="[\d.]+ [\d.]+"/);
    expect(svg).toMatch(/<path d="M[^"]*C[^"]*" fill="#000000"/);
    for (const word of ['Price', 'Quantity']) expect(svg).toContain(`>${word}</tspan>`);
    // D₀: the 0 as a smaller, lowered run.
    expect(svg).toContain('<tspan font-size="14">D</tspan><tspan dy="2.1" font-size="9.1">0</tspan>');
    // The labels are the picture's, not the paper's text.
    expect(got.lines.some((l) => l.text === 'Price' || l.text === 'Quantity')).toBe(false);
  });

  it('applies flips: a flipped line runs the other way', async () => {
    // A line with two labels: enough to be a diagram.
    const sketch = (flipH: boolean) => p(shapeGroup([shape(0, 0, 100, 50, { flipH }), shape(0, 60, 20, 20, { text: label('P') }), shape(80, 60, 20, 20, { text: label('Q') })], 100, 80));
    const plain = svgOf((await read(sketch(false))).lines.find((l) => l.image)!.image);
    const flipped = svgOf((await read(sketch(true))).lines.find((l) => l.image)!.image);
    const ends = (svg: string) => /<path d="M([\d.-]+) ([\d.-]+)L([\d.-]+) ([\d.-]+)"/.exec(svg)!.slice(1).map(Number);
    const [x0, y0, x1, y1] = ends(plain);
    const [fx0, fy0, fx1, fy1] = ends(flipped);
    expect([x0, y0, x1, y1]).toEqual([fx1, fy0, fx0, fy1]);
    expect(y1 - y0).toBe(50);
  });

  it('draws an inline group too, at its own size', async () => {
    const got = await read(p(shapeGroup(DIAGRAM, 320, 220, { inline: true })));
    const ref = got.lines.find((l) => l.image)!.image!;
    expect(svgOf(ref)).toContain('Quantity');
  });

  it('keeps the slot when a shape cannot be drawn faithfully, and the import check still asks for it', async () => {
    const odd = [...DIAGRAM, shape(200, 40, 30, 30, { prst: 'star5', fill: '<a:solidFill><a:srgbClr val="ff0000"/></a:solidFill>' })];
    const body = p(r('1.')) + para('Study Figure 1.') + p(shapeGroup(odd, 320, 220)) + para('What happens to the price? (2 marks)');
    const got = await read(body);
    const slot = got.lines.find((l) => l.image)!.image!;
    expect([slot.src, slot.alt]).toEqual(['', 'drawing']);
    const analysis = analyseLines(got);
    const batch = buildImport(analysis);
    expect(checkReview(analysis, batch, batch, { maxWidthPx: 605 }).filter((f) => f.kind === 'lostDrawing')).toHaveLength(1);
  });

  it('the import check no longer asks for a drawing that was drawn', async () => {
    const got = await read(para('1.\tStudy Figure 1.') + p(shapeGroup(DIAGRAM, 320, 220)) + para('What happens to the price? (2 marks)'));
    const analysis = analyseLines(got);
    expect(analysis.flags.filter((f) => f.kind === 'imageLost')).toEqual([]);
    const batch = buildImport(analysis);
    const found = checkReview(analysis, batch, batch, { maxWidthPx: 605 });
    expect(found.filter((f) => f.kind === 'lostDrawing' || f.kind === 'lostPicture')).toEqual([]);
  });

  it('hands the drawing to prepareImage as an SVG; a failure leaves the slot', async () => {
    const seen: string[] = [];
    const ok = async (blob: Blob): Promise<ImageRef | null> => {
      seen.push(blob.type);
      return { src: 'data:image/png;base64,DRAWN', widthPx: 999, naturalWidthPx: 960, naturalHeightPx: 660 };
    };
    const got = await read(p(shapeGroup(DIAGRAM, 320, 220)), {}, { prepareImage: ok });
    const ref = got.lines.find((l) => l.image)!.image!;
    expect(seen).toEqual(['image/svg+xml']);
    // The PNG is stored; the size on the page stays the drawing's own.
    expect(ref.src).toBe('data:image/png;base64,DRAWN');
    expect(ref.widthPx).toBeLessThan(340);

    const lost = await read(p(shapeGroup(DIAGRAM, 320, 220)), {}, { prepareImage: async () => null });
    const slot = lost.lines.find((l) => l.image)!.image!;
    expect([slot.src, slot.alt]).toEqual(['', 'drawing']);
  });

  it('turns a vertically flipped text box upside down, as Word does', async () => {
    const box = (flipV: boolean) => shapeGroup([shape(0, 0, 40, 100, { flipV, text: label('0') }), shape(60, 0, 0, 100), shape(60, 100, 100, 0, { text: undefined }), shape(100, 0, 20, 20, { text: label('Q') })], 160, 100);
    const y = async (flipV: boolean) => {
      const svg = svgOf((await read(p(box(flipV)))).lines.find((l) => l.image)!.image);
      return /<g transform="translate\(([\d.-]+) ([\d.-]+)\)( rotate\(180\))?"><text[^>]*><tspan[^>]*>0</.exec(svg)!;
    };
    const upright = await y(false);
    const flipped = await y(true);
    expect(upright[3]).toBeUndefined();
    expect(flipped[3]).toBe(' rotate(180)');
    expect(Number(flipped[2])).toBeGreaterThan(Number(upright[2]) + 90);
  });

  it('leaves the text of a horizontally flipped text box as it is', async () => {
    const sketch = (flipH: boolean) => p(shapeGroup([shape(0, 0, 100, 0), shape(0, 0, 0, 80), shape(20, 60, 80, 20, { flipH, text: label('Q') }), shape(0, 60, 20, 20, { text: label('0') })], 100, 80));
    const placeOf = async (flipH: boolean) => /<g transform="([^"]+)"><text[^>]*text-anchor="(\w+)"[^>]*><tspan[^>]*>Q</.exec(svgOf((await read(sketch(flipH))).lines.find((l) => l.image)!.image))!.slice(1);
    expect(await placeOf(true)).toEqual(await placeOf(false));
  });

  it('answer lines drawn as shapes after a floating figure stay answer lines', async () => {
    const lines = Array.from({ length: 4 }, () => ruledLine(640)).join('');
    const got = await read(
      para('1.\tStudy Figure 1.', { num: [1, 0] }) + para('(a)\tDraw the new supply curve. (2 marks)', { num: [1, 1] }) + p(shapeGroup(DIAGRAM, 320, 220)) + lines + para('(b)\tExplain. (2 marks)', { num: [1, 1] }),
      { numbering: abstractNum(1, [['decimal', '%1.'], ['lowerLetter', '(%2)']]) + num(1, 1) },
    );
    const kinds = got.lines.map((l) => (l.image ? 'picture' : l.tabOnly ? 'line' : 'text'));
    expect(kinds).toEqual(['text', 'text', 'picture', 'line', 'line', 'line', 'line', 'text']);
    expect(svgOf(got.lines[2].image).match(/<path /g)).toHaveLength(6);
  });
});

describe('picture options drawn as one figure (k-0498)', () => {
  it('a drawing that letters four graphs A–D is offered as an MC question, its blank options left alone', async () => {
    const graph = (x: number, letter: string) => [shape(x, 20, 0, 80), shape(x, 100, 80, 0), shape(x + 10, 30, 60, 60), shape(x, 0, 20, 20, { text: label(`${letter}.`) })];
    const figure = shapeGroup(['A', 'B', 'C', 'D'].flatMap((l, k) => graph(k * 100, l)), 400, 110);
    const got = await read(para('1.\tA tax is imposed. Which of the following diagrams shows its effect?') + p(figure) + para('2.\tWhich of the following is a free good?') + ['A.\tair', 'B.\tbread', 'C.\twater', 'D.\trice'].map((t) => para(t)).join(''));
    expect(got.lines.find((l) => l.image)!.image).toMatchObject({ drawn: 'shapes', optionLetters: true });
    const analysis = analyseLines(got);
    const batch = buildImport(analysis);
    const found = checkReview(analysis, batch, batch, { maxWidthPx: 605 });
    const offer = found.find((f) => f.kind === 'mcAsWritten');
    expect(offer?.q).toBe(0);
    // Made MC: four blank options under the figure are not "0 options".
    const questions = applyOps(materializeBatch(batch), [offer!.fix && 'op' in offer!.fix ? offer!.fix.op : fail()]).questions;
    expect(questions[0].type).toBe('mcq');
    const worksheet = { ...createWorksheet(), questions, flow: questions.map((q) => ({ type: 'question' as const, id: q.id })) };
    const left = checkPaper(worksheet, { name: 'invented.docx', read: got, analysis }, { maxWidthPx: 605 }).findings;
    expect(left.filter((f) => f.q === 0).map((f) => f.kind)).toEqual([]);
  });
});

const fail = (): never => {
  throw new Error('no fix offered');
};

describe('Word charts as pictures (k-0498)', () => {
  it('draws a pie chart from its part', async () => {
    const got = await read(para('1.\tStudy the chart.') + p(chart('rId7')) + para('Which fruit sold most? (1 mark)'), {
      rels: { rId7: ['chart', 'charts/chart1.xml'] },
      parts: { 'word/charts/chart1.xml': chartPart(pieSeries(['Apples', 'Pears', 'Plums'], [50, 30, 20])) },
    });
    const ref = got.lines.find((l) => l.image)!.image!;
    expect([ref.widthPx, ref.heightPx]).toEqual([400, 300]);
    const svg = svgOf(ref);
    expect(svg.match(/<path /g)?.length).toBeGreaterThanOrEqual(3);
    for (const t of ['Apples', 'Pears', 'Plums', '50%', '30%', '20%']) expect(svg).toContain(t);
  });

  it('keeps the slot for a chart it cannot draw, or a missing part', async () => {
    const scatter = '<c:scatterChart><c:ser><c:idx val="0"/><c:xVal><c:numLit><c:pt idx="0"><c:v>1</c:v></c:pt></c:numLit></c:xVal><c:yVal><c:numLit><c:pt idx="0"><c:v>2</c:v></c:pt></c:numLit></c:yVal></c:ser></c:scatterChart>';
    const got = await read(p(chart('rId7')) + p(chart('rId8')), {
      rels: { rId7: ['chart', 'charts/chart1.xml'], rId8: ['chart', 'charts/chart2.xml'] },
      parts: { 'word/charts/chart1.xml': chartPart(scatter) },
    });
    expect(got.lines.filter((l) => l.image).map((l) => [l.image!.src, l.image!.alt])).toEqual([
      ['', 'chart'],
      ['', 'chart'],
    ]);
  });
});
