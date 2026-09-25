import { describe, expect, it } from 'vitest';
import frozenAreas from './diagramAreas.frozen.json';
import { areaPolygon, guessMarketCurves, presetArea } from '@/model/diagramAreas';
import { shiftCurve } from '@/model/diagramShift';
import { buildFromTemplate } from '@/model/diagramTemplates';
import type { Diagram, DiagramArea } from '@/model/diagram';
import {
  AREA_PALETTE,
  areaLabelAnchor,
  areaLabelLayout,
  areaLabelSeedOffset,
  diagramPlot,
  diagramSvg,
} from './diagram';
import { clearance, inside } from './diagramLeader';

const SIZE = { widthPx: 400, heightPx: 320 };

/**
 * The area diagrams `diagramAreas.frozen.json` was written from — by the build *before*
 * area colours and leader labels existed. Never regenerate it to make a test pass.
 */
function frozenCases(): Record<string, Diagram> {
  const base = buildFromTemplate('supply-demand');
  const [demand, supply] = base.curves;
  const m = { demand: demand.id, supply: supply.id };
  const cs = presetArea('consumerSurplus', m, 'cs')!;
  const ps = presetArea('producerSurplus', m, 'ps')!;
  const free: DiagramArea = {
    id: 'free',
    vertices: [
      { x: 0.55, y: 0.2 },
      { x: 0.85, y: 0.2 },
      { x: 0.85, y: 0.45 },
      { x: 0.55, y: 0.45 },
    ],
    label: { en: [{ text: 'Area' }], zh: [{ text: '面積' }] },
  };
  return {
    csShade: { ...base, areas: [cs] },
    csHatch: { ...base, areas: [{ ...cs, fill: 'hatch' }] },
    psNudged: { ...base, areas: [{ ...ps, labelOffset: { x: -0.02, y: 0.03 } }] },
    both: { ...base, areas: [cs, { ...ps, fill: 'hatch' }] },
    free: { ...base, areas: [free] },
  };
}

function renderAll(cases: Record<string, Diagram>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, diagram] of Object.entries(cases)) {
    for (const language of ['en', 'zh', 'bilingual'] as const) {
      for (const scale of [1, 3]) {
        out[`${name}|${language}|${scale}`] = diagramSvg(diagram, { ...SIZE, language, scale });
      }
    }
  }
  return out;
}

/** Supply and demand with a per-unit tax of `tax` (share of the axis), via the real action. */
function taxedMarket(tax: number, presets: Array<'taxRevenue' | 'deadweightLoss' | 'consumerSurplus'>): Diagram {
  let n = 0;
  const base = buildFromTemplate('supply-demand');
  const shifted = shiftCurve(base, base.curves[1].id, { x: 0, y: tax }, () => `t${(n += 1)}`)!.diagram;
  const curves = guessMarketCurves(shifted);
  return { ...shifted, areas: presets.map((preset) => presetArea(preset, curves, preset)!) };
}

const layoutOf = (diagram: Diagram, id: string, scale = 1) => {
  const proj = diagramPlot(diagram, { ...SIZE, language: 'en', scale });
  const area = diagram.areas!.find((a) => a.id === id)!;
  return { proj, area, layout: areaLabelLayout(diagram, area, proj, 'en', scale)! };
};

describe('areas saved before colours and leaders render byte-identically', () => {
  it('matches the SVG frozen before either existed, in every language and scale', () => {
    const expected = frozenAreas as Record<string, string>;
    const actual = renderAll(frozenCases());
    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
    for (const key of Object.keys(expected)) expect(actual[key], key).toBe(expected[key]);
  });

  it('treats an explicit grey and an explicit auto exactly as absent', () => {
    const explicit = Object.fromEntries(
      Object.entries(frozenCases()).map(([name, diagram]) => [
        name,
        {
          ...diagram,
          areas: diagram.areas!.map((a) => ({ ...a, color: 'grey' as const, labelPlacement: 'auto' as const })),
        },
      ]),
    );
    expect(renderAll(explicit)).toEqual(frozenAreas);
  });

  it('keeps a large CS triangle inside, drawing no leader', () => {
    const { layout } = layoutOf(frozenCases().csShade, 'cs');
    expect(layout.placement).toBe('inside');
    expect(layout.leader).toBeNull();
    expect(diagramSvg(frozenCases().csShade, { ...SIZE, language: 'bilingual' })).not.toContain('data-leader');
  });
});

describe('area colours', () => {
  it('shades with the chosen tint and hatches with its ink', () => {
    const diagram = frozenCases().csShade;
    const blue = { ...diagram, areas: [{ ...diagram.areas![0], color: 'blue' as const }] };
    const svg = diagramSvg(blue, { ...SIZE, language: 'en' });
    expect(svg).toContain(`fill="${AREA_PALETTE.blue.shade}"`);
    expect(svg).not.toContain('#d9d9d9');

    const hatched = { ...diagram, areas: [{ ...diagram.areas![0], color: 'red' as const, fill: 'hatch' as const }] };
    const lines = diagramSvg(hatched, { ...SIZE, language: 'en' });
    expect(lines).toMatch(new RegExp(`fill="none" stroke="${AREA_PALETTE.red.hatch}" stroke-width="0.8"`));
  });

  it('offers tints that differ in lightness, so a monochrome copy still tells them apart', () => {
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const values = Object.values(AREA_PALETTE)
      .map((paint) => luminance(paint.shade))
      .sort((a, b) => a - b);
    for (let i = 1; i < values.length; i += 1) expect(values[i] - values[i - 1]).toBeGreaterThan(0.04);
    // Light enough for black letters to read through (contrast ≥ 7:1).
    expect((values[0] + 0.05) / 0.05).toBeGreaterThan(7);
  });

  it('falls back to grey for a colour this build does not know', () => {
    const diagram = frozenCases().csShade;
    const odd = { ...diagram, areas: [{ ...diagram.areas![0], color: 'teal' as unknown as 'blue' }] };
    expect(diagramSvg(odd, { ...SIZE, language: 'en' })).toContain('fill="#d9d9d9"');
  });
});

describe('leader labels for small areas', () => {
  const pixels = (diagram: Diagram, area: DiagramArea, proj: ReturnType<typeof diagramPlot>) =>
    areaPolygon(diagram, area)!.map((p) => ({ x: proj.px(p.x), y: proj.py(p.y) }));

  it('keeps the default CS and PS inside under Auto — template curves, or curves drawn to the axes', () => {
    const template = buildFromTemplate('supply-demand');
    // The user's report: straight D and S from the y-axis, crossing near the middle.
    const toAxes: Diagram = {
      ...template,
      curves: [
        { ...template.curves[0], points: [{ x: 0, y: 0.97 }, { x: 0.937, y: 0 }] },
        { ...template.curves[1], points: [{ x: 0, y: 0.0294 }, { x: 0.932, y: 0.9785 }] },
      ],
    };
    for (const base of [template, toAxes]) {
      const m = guessMarketCurves(base);
      const diagram: Diagram = {
        ...base,
        areas: [presetArea('consumerSurplus', m, 'cs')!, { ...presetArea('producerSurplus', m, 'ps')!, color: 'red' }],
      };
      for (const language of ['en', 'zh', 'bilingual'] as const) {
        for (const size of [SIZE, { widthPx: 400, heightPx: 335 }, { widthPx: 560, heightPx: 420 }]) {
          for (const scale of [1, 3]) {
            const proj = diagramPlot(diagram, { ...size, language, scale });
            for (const area of diagram.areas!) {
              const layout = areaLabelLayout(diagram, area, proj, language, scale)!;
              expect(layout.placement, `${area.id} ${language} ${size.widthPx} ×${scale}`).toBe('inside');
            }
          }
        }
      }
    }
  });

  it('ends a forced PS leader 10px inside every edge, aiming at the centroid', () => {
    const base = buildFromTemplate('supply-demand');
    const m = guessMarketCurves(base);
    const ps: DiagramArea = { ...presetArea('producerSurplus', m, 'ps')!, labelPlacement: 'leader' };
    const diagram: Diagram = { ...base, areas: [ps] };
    for (const scale of [1, 3]) {
      const { proj, layout } = layoutOf(diagram, 'ps', scale);
      const pts = pixels(diagram, ps, proj);
      const { from, tip } = layout.leader!;
      expect(clearance(tip, pts)).toBeGreaterThanOrEqual(10 * scale - 1e-9);
      expect(inside(from, pts)).toBe(false);
    }
  });

  it('ends a thin wedge\'s leader at its middle, and starts it 2px off the label\'s letters', () => {
    const diagram = taxedMarket(0.04, ['taxRevenue']);
    const { proj, area, layout } = layoutOf(diagram, 'taxRevenue');
    const pts = pixels(diagram, area, proj);
    const ys = pts.map((p) => p.y);
    const middle = (Math.min(...ys) + Math.max(...ys)) / 2;
    const half = (Math.max(...ys) - Math.min(...ys)) / 2;
    const { from, tip } = layout.leader!;
    // As deep as the wedge allows, less the 1px stop-short.
    expect(clearance(tip, pts)).toBeGreaterThanOrEqual(half - 1.01);
    expect(Math.abs(tip.y - middle)).toBeLessThanOrEqual(1.01);
    // The tail sits on the label's ink box grown by 2px: 13.33px em, less 12% top and foot.
    const inkHalf = (13.333 * (1 - 0.24)) / 2;
    expect(Math.abs(from.y - (layout.y + inkHalf + 2))).toBeLessThan(0.01);
  });

  it('moves the tail with the edge of a dragged label, not its centre', () => {
    const diagram = taxedMarket(0.04, ['taxRevenue']);
    const { proj, area } = layoutOf(diagram, 'taxRevenue');
    const seed = areaLabelSeedOffset(diagram, area, proj, 'en')!;
    // Dragged down and right of the wedge: the tail is the label's top-left corner.
    const moved = { ...diagram, areas: [{ ...area, labelOffset: { x: seed.x + 0.3, y: seed.y - 0.3 } }] };
    const { layout } = layoutOf(moved, 'taxRevenue');
    const { from, tip } = layout.leader!;
    expect(from.x).toBeLessThan(layout.x);
    expect(from.y).toBeLessThan(layout.y);
    expect(tip.x).toBeLessThan(from.x);
    expect(tip.y).toBeLessThan(from.y);
    expect(inside(tip, pixels(diagram, area, proj))).toBe(true);
  });

  it('fits "Tax" inside a wide wedge, and leads it out of a thin one', () => {
    expect(layoutOf(taxedMarket(0.12, ['taxRevenue']), 'taxRevenue').layout.placement).toBe('inside');
    const thin = layoutOf(taxedMarket(0.04, ['taxRevenue']), 'taxRevenue');
    expect(thin.layout.placement).toBe('leader');
    expect(thin.layout.leader).not.toBeNull();
  });

  it('leads a small deadweight-loss triangle', () => {
    expect(layoutOf(taxedMarket(0.1, ['deadweightLoss']), 'deadweightLoss').layout.placement).toBe('leader');
  });

  it('lets the teacher force either side', () => {
    const thin = taxedMarket(0.04, ['taxRevenue']);
    const forced = { ...thin, areas: [{ ...thin.areas![0], labelPlacement: 'inside' as const }] };
    expect(layoutOf(forced, 'taxRevenue').layout.placement).toBe('inside');
    expect(diagramSvg(forced, { ...SIZE, language: 'en' })).not.toContain('data-leader');

    const cs = frozenCases().csShade;
    const led = { ...cs, areas: [{ ...cs.areas![0], labelPlacement: 'leader' as const }] };
    const { layout } = layoutOf(led, 'cs');
    expect(layout.placement).toBe('leader');
    expect(diagramSvg(led, { ...SIZE, language: 'en' })).toContain('data-leader');
  });

  it('puts the label outside the region, the arrow tip inside it, all within the plot', () => {
    for (const diagram of [taxedMarket(0.04, ['taxRevenue', 'deadweightLoss']), taxedMarket(0.1, ['deadweightLoss'])]) {
      for (const area of diagram.areas!) {
        const { proj, layout } = layoutOf(diagram, area.id);
        if (layout.placement !== 'leader') continue;
        const pts = areaPolygon(diagram, area)!.map((p) => ({ x: proj.px(p.x), y: proj.py(p.y) }));
        expect(inside(layout, pts)).toBe(false);
        expect(inside(layout.leader!.tip, pts)).toBe(true);
        expect(inside(layout.leader!.from, pts)).toBe(false);
        expect(layout.x).toBeGreaterThan(proj.plot.left);
        expect(layout.x).toBeLessThan(proj.plot.right);
        expect(layout.y).toBeGreaterThan(proj.plot.top);
        expect(layout.y).toBeLessThan(proj.plot.bottom);
      }
    }
  });

  it('draws the leader as a line and a plain triangle — no marker, pattern or url(#)', () => {
    const svg = diagramSvg(taxedMarket(0.04, ['taxRevenue']), { ...SIZE, language: 'en' });
    const leader = svg.slice(svg.indexOf('data-leader'));
    expect(leader).toContain('data-arrowhead');
    expect(svg).not.toMatch(/<marker|<pattern|url\(#/);
    // The letters get the white halo out among the curves.
    expect(svg.slice(svg.lastIndexOf('<text'))).toContain('paint-order:stroke');
  });

  it('follows a dragged label, and the drag starts from where it is drawn', () => {
    const diagram = taxedMarket(0.04, ['taxRevenue']);
    const { proj, area, layout } = layoutOf(diagram, 'taxRevenue');
    const seed = areaLabelSeedOffset(diagram, area, proj, 'en')!;
    const seeded = { ...diagram, areas: [{ ...area, labelOffset: seed }] };
    const same = layoutOf(seeded, 'taxRevenue').layout;
    expect(same.x).toBeCloseTo(layout.x, 6);
    expect(same.y).toBeCloseTo(layout.y, 6);

    const moved = { ...diagram, areas: [{ ...area, labelOffset: { x: seed.x + 0.1, y: seed.y + 0.05 } }] };
    const after = layoutOf(moved, 'taxRevenue').layout;
    expect(after.placement).toBe('leader');
    expect(after.x).toBeGreaterThan(layout.x);
    expect(after.leader!.from).not.toEqual(layout.leader!.from);
    const pts = areaPolygon(diagram, area)!.map((p) => ({ x: proj.px(p.x), y: proj.py(p.y) }));
    expect(inside(after.leader!.tip, pts)).toBe(true);
  });

  it('seeds nothing for a label that sits inside', () => {
    const diagram = frozenCases().csShade;
    const proj = diagramPlot(diagram, { ...SIZE, language: 'en' });
    expect(areaLabelSeedOffset(diagram, diagram.areas![0], proj, 'en')).toBeNull();
  });

  it('decides the same at every export scale', () => {
    const diagram = taxedMarket(0.04, ['taxRevenue', 'deadweightLoss']);
    for (const area of diagram.areas!) {
      const one = layoutOf(diagram, area.id, 1).layout;
      const three = layoutOf(diagram, area.id, 3).layout;
      expect(three.placement).toBe(one.placement);
      expect(three.x).toBeCloseTo(one.x * 3, 3);
      expect(three.y).toBeCloseTo(one.y * 3, 3);
    }
  });

  it('gives the canvas the drawn position', () => {
    const diagram = taxedMarket(0.04, ['taxRevenue']);
    const { proj, area, layout } = layoutOf(diagram, 'taxRevenue');
    expect(areaLabelAnchor(diagram, area, proj, 'en', 1)).toEqual({ x: layout.x, y: layout.y });
  });
});
