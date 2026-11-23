import { describe, expect, it } from 'vitest';
import { OFFICE_THEME } from './drawingml';
import { drawChart, formatNumber } from './docxChart';
import { parseXml } from './xml';

const NS =
  'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';

const numCache = (vals: Array<number | null>, fmt = 'General') =>
  `<c:numCache><c:formatCode>${fmt}</c:formatCode><c:ptCount val="${vals.length}"/>${vals.map((v, i) => (v === null ? '' : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)).join('')}</c:numCache>`;
const strCache = (vals: string[]) => `<c:strCache><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:strCache>`;

function ser(i: number, name: string, cats: string[], vals: Array<number | null>, extra = '', fmt = 'General'): string {
  return (
    `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:strRef><c:f>S!$A$1</c:f>${strCache([name])}</c:strRef></c:tx>${extra}` +
    `<c:cat><c:strRef><c:f>S!$A$2</c:f>${strCache(cats)}</c:strRef></c:cat><c:val><c:numRef><c:f>S!$B$2</c:f>${numCache(vals, fmt)}</c:numRef></c:val></c:ser>`
  );
}

const chartXml = (plot: string, chartExtra = '', space = '') =>
  `<?xml version="1.0"?><c:chartSpace ${NS}><c:chart>${chartExtra}<c:plotArea><c:layout/>${plot}</c:plotArea></c:chart>${space}</c:chartSpace>`;

const draw = (xml: string, w = 400, h = 300) => drawChart(parseXml(xml), OFFICE_THEME, w, h);

const FRUIT = ['Apples', 'Pears', 'Plums'];
const PIE = (data: number[], group = '', extra = '') =>
  chartXml(`<c:pieChart><c:varyColors val="1"/>${ser(0, 'Fruit', FRUIT, data, extra)}${group}<c:firstSliceAng val="0"/></c:pieChart>`, '<c:autoTitleDeleted val="1"/>');

const attr = (tag: string | undefined, name: string): string => {
  if (tag === undefined) throw new Error('missing element');
  const hit = new RegExp(`${name}="([^"]*)"`).exec(tag);
  if (!hit) throw new Error(`no ${name} in ${tag}`);
  return hit[1];
};
const tags = (svg: string, cls: string) => svg.match(new RegExp(`<[a-z]+ class="${cls}"[^>]*>`, 'g')) ?? [];
const texts = (svg: string) => [...svg.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map((m) => m[1].replace(/<[^>]+>/g, '|'));

/** The sweep of a pie slice path, in degrees. */
function sweepOf(tag: string): number {
  const d = attr(tag, 'd')!;
  const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const [cx, cy, x0, y0] = nums;
  const x1 = nums[nums.length - 2];
  const y1 = nums[nums.length - 1];
  const large = /A [\d.]+ [\d.]+ 0 (\d)/.exec(d)![1] === '1';
  const ang = (x: number, y: number) => (Math.atan2(x - cx, cy - y) * 180) / Math.PI;
  let s = ang(x1, y1) - ang(x0, y0);
  if (s < 0) s += 360;
  if (large && s < 180) s = 360 - s;
  return s;
}

describe('pie', () => {
  it('draws one slice per value with sweeps matching the shares', () => {
    const svg = draw(PIE([50, 25, 25]))!;
    const slices = tags(svg, 'slice');
    expect(slices).toHaveLength(3);
    const sweeps = slices.map(sweepOf);
    expect(sweeps[0]).toBeCloseTo(180, 0);
    expect(sweeps[1]).toBeCloseTo(90, 0);
    expect(sweeps[2]).toBeCloseTo(90, 0);
    expect(svg.startsWith('<svg')).toBe(true);
  });

  it('starts at 12 o\'clock and goes clockwise', () => {
    const svg = draw(PIE([50, 50]))!;
    const first = attr(tags(svg, 'slice')[0], 'd')!;
    const [cx, cy, x0, y0, , , , , , x1] = first.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(x0).toBeCloseTo(cx, 0);
    expect(y0).toBeLessThan(cy);
    expect(x1).toBeCloseTo(cx, 0);
  });

  it('uses the accents in order, a white outline, and a legend of categories', () => {
    const svg = draw(PIE([1, 2, 3]))!;
    expect(svg).toContain('#156082');
    expect(svg).toContain('#e97132');
    expect(svg).toContain('stroke="#ffffff"');
    const chart = draw(chartXml(`<c:pieChart>${ser(0, 'Fruit', FRUIT, [1, 2, 3])}</c:pieChart>`).replace('</c:plotArea>', '</c:plotArea><c:legend><c:legendPos val="r"/></c:legend>'))!;
    for (const name of FRUIT) expect(texts(chart)).toContain(name);
  });

  it('writes percent labels and honours firstSliceAng', () => {
    const lbls = '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/></c:dLbls>';
    const svg = draw(PIE([50, 25, 25], '', lbls))!;
    expect(texts(svg)).toEqual(expect.arrayContaining(['50%', '25%']));
    const turned = draw(PIE([50, 50]).replace('<c:firstSliceAng val="0"/>', '<c:firstSliceAng val="90"/>'))!;
    const [cx, cy, x0, y0] = attr(tags(turned, 'slice')[0], 'd')!.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(x0).toBeGreaterThan(cx + 10);
    expect(y0).toBeCloseTo(cy, 0);
  });

  it('joins category and percent on two lines, or with the separator', () => {
    const base = '<c:showVal val="0"/><c:showCatName val="1"/><c:showSerName val="0"/><c:showPercent val="1"/>';
    const two = draw(PIE([50, 50], '', `<c:dLbls>${base}</c:dLbls>`))!;
    expect(texts(two)).toContain('|Apples||50%|');
    const sep = draw(PIE([50, 50], '', `<c:dLbls>${base}<c:separator>; </c:separator></c:dLbls>`))!;
    expect(texts(sep)).toContain('Apples; 50%');
  });

  it('formats percent with the label\'s own number format', () => {
    const svg = draw(PIE([1, 2], '', '<c:dLbls><c:numFmt formatCode="0.0%" sourceLinked="0"/><c:showVal val="0"/><c:showPercent val="1"/></c:dLbls>'))!;
    expect(texts(svg)).toEqual(expect.arrayContaining(['33.3%', '66.7%']));
  });

  it('deletes a point label and moves another by a manual offset', () => {
    const lbls =
      '<c:dLbls><c:dLbl><c:idx val="0"/><c:delete val="1"/></c:dLbl>' +
      '<c:dLbl><c:idx val="1"/><c:layout><c:manualLayout><c:x val="0.1"/><c:y val="-0.1"/></c:manualLayout></c:layout><c:showVal val="1"/><c:showPercent val="0"/></c:dLbl>' +
      '<c:showVal val="1"/><c:showPercent val="0"/><c:dLblPos val="ctr"/></c:dLbls>';
    const plain = draw(PIE([10, 20, 30], '', lbls.replace('<c:layout><c:manualLayout><c:x val="0.1"/><c:y val="-0.1"/></c:manualLayout></c:layout>', '')))!;
    const moved = draw(PIE([10, 20, 30], '', lbls))!;
    expect(texts(plain)).toEqual(['20', '30']);
    const pos = (s: string, i: number) => [...s.matchAll(/<text[^>]* x="([^"]*)" y="([^"]*)"/g)].map((m) => [+m[1], +m[2]])[i];
    expect(pos(moved, 0)[0] - pos(plain, 0)[0]).toBeCloseTo(40, 0);
    expect(pos(moved, 0)[1] - pos(plain, 0)[1]).toBeCloseTo(-30, 0);
  });

  it('paints a gradient dPt through defs', () => {
    const dPt = '<c:dPt><c:idx val="0"/><c:spPr><a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="ff0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000ff"/></a:gs></a:gsLst><a:lin ang="5400000"/></a:gradFill></c:spPr></c:dPt>';
    const svg = draw(PIE([1, 1], '', dPt))!;
    expect(svg).toContain('<linearGradient');
    expect(svg).toMatch(/fill="url\(#g\d+\)"/);
  });

  it('draws a doughnut with a hole', () => {
    const xml = chartXml(`<c:doughnutChart><c:varyColors val="1"/>${ser(0, 'Fruit', FRUIT, [1, 1, 2])}<c:holeSize val="60"/></c:doughnutChart>`);
    const svg = draw(xml)!;
    const slices = tags(svg, 'slice');
    expect(slices).toHaveLength(3);
    expect((attr(slices[0], 'd')!.match(/ A /g) ?? []).length).toBe(2);
  });

  it('a one-slice pie is a full circle', () => {
    const svg = draw(PIE([5]))!;
    expect(tags(svg, 'slice')).toHaveLength(1);
  });

  it('draws a Word-style pie: gradient dPts, outline, inside labels with offsets', () => {
    const cats = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'];
    const tints = [90000, 75000, 60000, 45000, 30000, 15000];
    const dpts = tints
      .map(
        (t, i) =>
          `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:gradFill><a:gsLst><a:gs pos="0"><a:schemeClr val="dk1"><a:tint val="${t}"/></a:schemeClr></a:gs>` +
          `<a:gs pos="100000"><a:schemeClr val="dk1"><a:tint val="${t - 10000}"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>` +
          `<a:ln w="19050"><a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:ln></c:spPr></c:dPt>`,
      )
      .join('');
    const lbl = (i: number, x: number, y: number) =>
      `<c:dLbl><c:idx val="${i}"/><c:layout><c:manualLayout><c:x val="${x}"/><c:y val="${y}"/></c:manualLayout></c:layout><c:dLblPos val="inEnd"/><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="1"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/></c:dLbl>`;
    const dLbls =
      `<c:dLbls>${lbl(4, -0.02, 0.03)}${lbl(5, 0.03, -0.02)}<c:spPr><a:noFill/></c:spPr><c:txPr><a:bodyPr/><a:p><a:pPr><a:defRPr sz="900" b="1"><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></a:defRPr></a:pPr></a:p></c:txPr>` +
      `<c:dLblPos val="inEnd"/><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="1"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="1"/></c:dLbls>`;
    const xml = chartXml(
      `<c:pieChart><c:varyColors val="1"/>${ser(0, 'Share', cats, [40, 20, 15, 12, 8, 5], dpts + dLbls)}<c:firstSliceAng val="0"/></c:pieChart>`,
      '<c:autoTitleDeleted val="1"/>',
    );
    const svg = draw(xml)!;
    expect(tags(svg, 'slice')).toHaveLength(6);
    expect((svg.match(/<linearGradient/g) ?? []).length).toBe(6);
    expect(svg).toContain('stroke-width="2"');
    expect(svg).toContain('font-weight="bold"');
    expect(svg).toContain('fill="#ffffff" text-anchor');
    const all = texts(svg);
    expect(all).toHaveLength(6);
    expect(all[0]).toContain('Alpha');
    expect(all[0]).toContain('40%');
  });
});

describe('bar', () => {
  const COLS = (extra = '', ser1 = [10, 20, 30], ser2 = [5, 15, 25], group = 'clustered') =>
    chartXml(
      `<c:barChart><c:barDir val="col"/><c:grouping val="${group}"/>${ser(0, 'North', FRUIT, ser1)}${ser(1, 'South', FRUIT, ser2)}${extra}<c:axId val="1"/><c:axId val="2"/></c:barChart>` +
        '<c:catAx><c:axId val="1"/></c:catAx><c:valAx><c:axId val="2"/><c:majorGridlines/></c:valAx>',
    );

  it('draws series x categories bars with heights proportional to values', () => {
    const svg = draw(COLS())!;
    const bars = tags(svg, 'bar');
    expect(bars).toHaveLength(6);
    const h = bars.map((b) => +attr(b, 'height')!);
    expect(h[2] / h[0]).toBeCloseTo(3, 1);
    expect(h[1] / h[0]).toBeCloseTo(2, 1);
    expect(h[0]).toBeCloseTo(h[3] * 2, 1);
    expect(attr(bars[0], 'fill')).toBe('#156082');
    expect(attr(bars[3], 'fill')).toBe('#e97132');
  });

  it('labels the value axis and categories, with gridlines', () => {
    const svg = draw(COLS())!;
    const t = texts(svg);
    expect(t).toEqual(expect.arrayContaining(['0', '10', '20', '30', 'Apples', 'Pears', 'Plums']));
    expect(svg).toContain('stroke="#d9d9d9"');
  });

  it('respects min, max and majorUnit and a percent format', () => {
    const xml = COLS().replace('<c:valAx><c:axId val="2"/>', '<c:valAx><c:axId val="2"/><c:scaling><c:max val="1"/><c:min val="0"/></c:scaling><c:numFmt formatCode="0%" sourceLinked="0"/><c:majorUnit val="0.25"/>');
    expect(texts(draw(xml)!)).toEqual(expect.arrayContaining(['0%', '25%', '50%', '75%', '100%']));
  });

  it('stacks series', () => {
    const svg = draw(COLS('<c:overlap val="100"/>', [10, 10, 10], [10, 10, 10], 'stacked'))!;
    const bars = tags(svg, 'bar');
    expect(bars).toHaveLength(6);
    const y = (i: number) => +attr(bars[i], 'y')!;
    const h = (i: number) => +attr(bars[i], 'height')!;
    expect(attr(bars[0], 'x')).toBe(attr(bars[3], 'x'));
    expect(y(3) + h(3)).toBeCloseTo(y(0), 1);
  });

  it('fills the height with percent-stacked bars', () => {
    const svg = draw(COLS('', [1, 1, 1], [3, 3, 3], 'percentStacked'))!;
    const bars = tags(svg, 'bar');
    expect(+attr(bars[0], 'height')! * 3).toBeCloseTo(+attr(bars[3], 'height')!, 1);
    expect(texts(svg)).toEqual(expect.arrayContaining(['0%', '100%']));
  });

  it('draws horizontal bars with widths proportional to values', () => {
    const svg = draw(COLS().replace('val="col"', 'val="bar"'))!;
    const bars = tags(svg, 'bar');
    const w = bars.map((b) => +attr(b, 'width')!);
    expect(w[2] / w[0]).toBeCloseTo(3, 1);
    // The first category is at the bottom.
    expect(+attr(bars[0], 'y')!).toBeGreaterThan(+attr(bars[2], 'y')!);
  });

  it('draws data labels and axis titles', () => {
    const lbls = '<c:dLbls><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:dLblPos val="outEnd"/></c:dLbls>';
    const title = (t: string) => `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>${t}</a:t></a:r></a:p></c:rich></c:tx></c:title>`;
    const xml = COLS().replace('<c:cat>', `${lbls}<c:cat>`).replace('<c:valAx><c:axId val="2"/>', `<c:valAx><c:axId val="2"/>${title('Price')}`).replace('<c:catAx><c:axId val="1"/>', `<c:catAx><c:axId val="1"/>${title('Fruit')}`);
    const svg = draw(xml)!;
    const t = texts(svg);
    expect(t).toEqual(expect.arrayContaining(['Price', 'Fruit']));
    expect(t.filter((x) => x === '30')).toHaveLength(2);
    expect(svg).toContain('rotate(-90');
  });

  it('shows series in the legend and a title', () => {
    const xml = COLS().replace('<c:plotArea>', '<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:rPr sz="1800" b="1"/><a:t>Sales &amp; costs</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea>').replace('</c:plotArea>', '</c:plotArea><c:legend><c:legendPos val="b"/><c:legendEntry><c:idx val="1"/><c:delete val="1"/></c:legendEntry></c:legend>');
    const svg = draw(xml)!;
    const t = texts(svg);
    expect(t).toContain('Sales &amp; costs');
    expect(t).toContain('North');
    expect(t).not.toContain('South');
    expect(svg).toContain('font-size="24"');
  });

  it('uses the manual plot layout', () => {
    const xml = COLS().replace('<c:layout/>', '<c:layout><c:manualLayout><c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.2"/><c:y val="0.1"/><c:w val="0.7"/><c:h val="0.6"/></c:manualLayout></c:layout>');
    const bars = tags(draw(xml)!, 'bar');
    const bottom = Math.max(...bars.map((b) => +attr(b, 'y')! + +attr(b, 'height')!));
    expect(bottom).toBeCloseTo(300 * 0.7, 0);
  });

  it('skips deleted axes', () => {
    const xml = COLS().replace('<c:catAx><c:axId val="1"/>', '<c:catAx><c:axId val="1"/><c:delete val="1"/>').replace('<c:valAx><c:axId val="2"/>', '<c:valAx><c:axId val="2"/><c:delete val="1"/>');
    const t = texts(draw(xml)!);
    expect(t).not.toContain('Apples');
    expect(t).not.toContain('10');
  });
});

describe('line', () => {
  const LINE = (extra = '', grouping = 'standard') =>
    chartXml(
      `<c:lineChart><c:grouping val="${grouping}"/><c:varyColors val="0"/>${ser(0, 'Trend', ['Q1', 'Q2', 'Q3', 'Q4'], [3, 5, 4, 8], extra)}<c:marker val="1"/><c:axId val="1"/><c:axId val="2"/></c:lineChart>` +
        '<c:catAx><c:axId val="1"/></c:catAx><c:valAx><c:axId val="2"/></c:valAx>',
    );

  it('draws a polyline through the category centres, with markers', () => {
    const svg = draw(LINE())!;
    const lines = tags(svg, 'line');
    expect(lines).toHaveLength(1);
    expect(attr(lines[0], 'points')!.split(' ')).toHaveLength(4);
    expect(attr(lines[0], 'stroke')).toBe('#156082');
    expect(attr(lines[0], 'stroke-width')).toBe('3');
    expect(tags(svg, 'marker')).toHaveLength(4);
  });

  it('hides markers with symbol none and draws the requested symbol', () => {
    expect(tags(draw(LINE('<c:marker><c:symbol val="none"/></c:marker>'))!, 'marker')).toHaveLength(0);
    expect(draw(LINE('<c:marker><c:symbol val="square"/><c:size val="7"/></c:marker>'))!).toContain('<rect class="marker"');
  });

  it('breaks the line at an empty point', () => {
    const xml = LINE().replace('<c:pt idx="1"><c:v>5</c:v></c:pt>', '');
    const svg = draw(xml)!;
    expect(tags(svg, 'line')).toHaveLength(1);
    expect(attr(tags(svg, 'line')[0], 'points')!.split(' ')).toHaveLength(2);
    expect(tags(svg, 'marker')).toHaveLength(3);
  });

  it('uses the stroke of the series', () => {
    const svg = draw(LINE('<c:spPr><a:ln w="38100"><a:solidFill><a:srgbClr val="00aa00"/></a:solidFill></a:ln></c:spPr>'))!;
    expect(svg).toContain('stroke="#00aa00"');
    expect(svg).toContain('stroke-width="4');
  });

  it('puts the series name in the legend', () => {
    const svg = draw(LINE().replace('</c:plotArea>', '</c:plotArea><c:legend><c:legendPos val="t"/></c:legend>'))!;
    expect(texts(svg)).toContain('Trend');
  });

  it('shows the series name as the title of a single-series chart with an empty title', () => {
    const svg = draw(LINE().replace('<c:plotArea>', '<c:title/><c:plotArea>'))!;
    expect(texts(svg)).toContain('Trend');
  });

  it('returns null for a stacked line chart', () => {
    expect(draw(LINE('', 'stacked'))).toBeNull();
  });
});

describe('what it will not draw', () => {
  it('returns null for 3-D, radar, scatter and other charts', () => {
    for (const type of ['bar3DChart', 'pie3DChart', 'line3DChart', 'area3DChart', 'surfaceChart', 'radarChart', 'bubbleChart', 'stockChart', 'ofPieChart', 'scatterChart', 'areaChart']) {
      expect(draw(chartXml(`<c:${type}>${ser(0, 'S', FRUIT, [1, 2, 3])}</c:${type}>`)), type).toBeNull();
    }
  });

  it('returns null for a combo chart', () => {
    const xml = chartXml(
      `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>${ser(0, 'A', FRUIT, [1, 2, 3])}</c:barChart><c:lineChart><c:grouping val="standard"/>${ser(1, 'B', FRUIT, [3, 2, 1])}</c:lineChart><c:valAx><c:axId val="2"/></c:valAx>`,
    );
    expect(draw(xml)).toBeNull();
  });

  it('returns null for a series without cached values', () => {
    const xml = chartXml('<c:pieChart><c:ser><c:idx val="0"/><c:order val="0"/><c:val><c:numRef><c:f>S!$B$2</c:f></c:numRef></c:val></c:ser></c:pieChart>');
    expect(draw(xml)).toBeNull();
    expect(draw(chartXml('<c:pieChart><c:ser><c:idx val="0"/><c:order val="0"/></c:ser></c:pieChart>'))).toBeNull();
  });

  it('returns null for a chartex part and for malformed input, without throwing', () => {
    expect(draw('<cx:chartSpace xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex"><cx:chart/></cx:chartSpace>')).toBeNull();
    expect(draw('<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"/>')).toBeNull();
    expect(drawChart({ name: 'c:chartSpace', attrs: {}, children: [null as never] }, OFFICE_THEME, 400, 300)).toBeNull();
    expect(draw(PIE([1, 2]), 0, 0)).toBeNull();
    expect(draw(PIE([0, 0]))).toBeNull();
  });
});

describe('formatNumber', () => {
  it('formats the simple Excel codes', () => {
    expect(formatNumber(1234.5, 'General')).toBe('1234.5');
    expect(formatNumber(0.1 + 0.2, 'General')).toBe('0.3');
    expect(formatNumber(3.456, '0.0')).toBe('3.5');
    expect(formatNumber(0.256, '0%')).toBe('26%');
    expect(formatNumber(1234567, '#,##0')).toBe('1,234,567');
    expect(formatNumber(1234.5, '"$"#,##0.00')).toBe('$1,234.50');
    expect(formatNumber(-5, '0')).toBe('-5');
  });
});
